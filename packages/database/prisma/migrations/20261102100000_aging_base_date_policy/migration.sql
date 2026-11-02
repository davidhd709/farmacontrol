-- Correcciones del cliente (2026-11-02): la fecha desde la que se cuentan las edades de cartera
-- y cuentas por pagar es configurable por empresa, en su política contable versionada.
-- DUE_DATE_OR_ISSUE (vencimiento; si el documento no tiene, emisión) es la regla vigente y el
-- valor de las versiones ya registradas. ISSUE_DATE cuenta desde la emisión.
ALTER TABLE "company_accounting_policies"
  ADD COLUMN "aging_base_date" VARCHAR(32) NOT NULL DEFAULT 'DUE_DATE_OR_ISSUE';

ALTER TABLE "company_accounting_policies" ADD CONSTRAINT "company_accounting_policies_aging_base_date_check"
  CHECK ("aging_base_date" IN ('DUE_DATE_OR_ISSUE', 'ISSUE_DATE'));
