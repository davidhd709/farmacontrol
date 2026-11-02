-- Correcciones del cliente (2026-11-02): las reglas de fecha de la base usan el día de Bogotá.
-- La base corre en UTC; desde las 19:00 de Colombia CURRENT_DATE ya es el día siguiente y un
-- perfil tributario que empieza "hoy" (fecha de negocio) se rechazaba como iniciado en el pasado.
-- Solo se reemplazan funciones: no cambia el esquema ni los datos.

CREATE OR REPLACE FUNCTION business_date(instant TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)
RETURNS DATE AS $$
    SELECT (instant AT TIME ZONE 'America/Bogota')::date;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION business_date(TIMESTAMPTZ) IS
    'Fecha calendario de un instante en la zona del negocio (America/Bogota, igual que BUSINESS_TIME_ZONE en la API).';

CREATE OR REPLACE FUNCTION public.guard_product_tax_profile_history()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'ACTIVE' THEN
            RAISE EXCEPTION 'ACTIVE tax profiles cannot be deleted'
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN
        -- A profile can only be superseded prospectively. No classification,
        -- rate, documentary reference or past interval may be rewritten.
        IF NEW.id IS DISTINCT FROM OLD.id
            OR NEW.product_id IS DISTINCT FROM OLD.product_id
            OR NEW.operation IS DISTINCT FROM OLD.operation
            OR NEW.treatment IS DISTINCT FROM OLD.treatment
            OR NEW.rate_pct IS DISTINCT FROM OLD.rate_pct
            OR NEW.tax_type IS DISTINCT FROM OLD.tax_type
            OR NEW.tax_rule_id IS DISTINCT FROM OLD.tax_rule_id
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
            OR NEW.document_reference IS DISTINCT FROM OLD.document_reference
            OR NEW.activated_by_id IS DISTINCT FROM OLD.activated_by_id
            OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
            OR NEW.effective_to IS NOT DISTINCT FROM OLD.effective_to
            OR NEW.effective_to IS NULL
            OR NEW.effective_to <= business_date()
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to >= OLD.effective_to)
        THEN
            RAISE EXCEPTION 'ACTIVE tax profile is immutable except a future shortening of effective_to'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = 'ACTIVE' THEN
        IF NEW.effective_from < business_date() THEN
            RAISE EXCEPTION 'Tax profile activation cannot start in the past'
                USING ERRCODE = '23514';
        END IF;
        NEW.activated_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_accounting_mapped_account()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF (OLD.is_active AND NOT NEW.is_active) OR (OLD.allows_movement AND NOT NEW.allows_movement) THEN
        IF EXISTS (
            SELECT 1 FROM company_accounting_mappings
            WHERE account_id = NEW.id AND status = 'ACTIVE'
              AND (effective_to IS NULL OR effective_to >= business_date())
        ) THEN
            RAISE EXCEPTION 'Cannot deactivate or make non-postable an account with a current or future ACTIVE mapping'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
