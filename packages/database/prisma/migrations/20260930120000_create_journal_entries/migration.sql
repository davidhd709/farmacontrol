-- EP-11 / Slice 11.2: internal, immutable double-entry journal.
-- DRAFT is only a within-transaction construction state. A deferred trigger
-- rejects any transaction that attempts to commit a draft or unbalanced entry.
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED');

CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "source_type" VARCHAR(64) NOT NULL,
    "source_id" VARCHAR(128) NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMPTZ,
    "reversal_of_id" UUID,
    "reversal_reason" VARCHAR(500),
    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journal_entries_description_nonblank" CHECK (btrim("description") <> ''),
    CONSTRAINT "journal_entries_source_nonblank" CHECK (
        btrim("source_type") <> '' AND "source_type" = btrim("source_type")
        AND btrim("source_id") <> '' AND "source_id" = btrim("source_id")
    ),
    CONSTRAINT "journal_entries_reversal_shape" CHECK (
        ("reversal_of_id" IS NULL AND "reversal_reason" IS NULL AND "source_type" <> 'REVERSAL')
        OR
        ("reversal_of_id" IS NOT NULL AND "reversal_reason" IS NOT NULL
         AND btrim("reversal_reason") <> '' AND "source_type" = 'REVERSAL'
         AND "source_id" = "reversal_of_id"::text AND "reversal_of_id" <> "id")
    ),
    CONSTRAINT "journal_entries_posted_at_status" CHECK (
        ("status" = 'DRAFT' AND "posted_at" IS NULL)
        OR ("status" = 'POSTED' AND "posted_at" IS NOT NULL)
    )
);

CREATE TABLE "journal_entry_lines" (
    "id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "purpose" "AccountingPurpose",
    "description" VARCHAR(500),
    "debit" NUMERIC(20,2) NOT NULL,
    "credit" NUMERIC(20,2) NOT NULL,
    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journal_entry_lines_position_positive" CHECK ("position" > 0),
    CONSTRAINT "journal_entry_lines_one_positive_side" CHECK (
        ("debit" > 0 AND "credit" = 0)
        OR ("debit" = 0 AND "credit" > 0)
    )
);

CREATE UNIQUE INDEX "journal_entries_source_type_source_id_key"
    ON "journal_entries" ("source_type", "source_id");
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key"
    ON "journal_entries" ("reversal_of_id");
CREATE INDEX "journal_entries_entry_date_id_idx"
    ON "journal_entries" ("entry_date", "id");
CREATE INDEX "journal_entries_created_by_id_idx"
    ON "journal_entries" ("created_by_id");
CREATE UNIQUE INDEX "journal_entry_lines_journal_entry_id_position_key"
    ON "journal_entry_lines" ("journal_entry_id", "position");
CREATE INDEX "journal_entry_lines_account_id_idx"
    ON "journal_entry_lines" ("account_id");

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey"
    FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_fkey"
    FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION guard_journal_entry_write() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'DRAFT' OR NEW.posted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Journal entry must be constructed as DRAFT'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'POSTED' THEN
            RAISE EXCEPTION 'Posted journal entries are immutable'
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status <> 'DRAFT' OR NEW.status <> 'POSTED'
       OR ROW(NEW.id, NEW.entry_date, NEW.description, NEW.source_type, NEW.source_id,
              NEW.created_by_id, NEW.created_at, NEW.reversal_of_id, NEW.reversal_reason)
          IS DISTINCT FROM
          ROW(OLD.id, OLD.entry_date, OLD.description, OLD.source_type, OLD.source_id,
              OLD.created_by_id, OLD.created_at, OLD.reversal_of_id, OLD.reversal_reason)
       OR NEW.posted_at IS NULL THEN
        RAISE EXCEPTION 'Journal entry can only transition once from DRAFT to POSTED'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_guard_write_trg
BEFORE INSERT OR UPDATE OR DELETE ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION guard_journal_entry_write();

CREATE FUNCTION guard_journal_entry_line_write() RETURNS trigger AS $$
DECLARE
    entry_status "JournalEntryStatus";
    entry_reversal_of_id UUID;
    eligible BOOLEAN;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Journal entry lines are immutable'
            USING ERRCODE = '23514';
    END IF;

    -- The parent lock serializes posting and line insertion. The account lock
    -- prevents deactivation/non-postable updates from racing this posting.
    SELECT status, reversal_of_id INTO entry_status, entry_reversal_of_id FROM journal_entries
    WHERE id = NEW.journal_entry_id FOR UPDATE;
    IF entry_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'Journal entry lines may only be inserted while DRAFT'
            USING ERRCODE = '23514';
    END IF;

    IF entry_reversal_of_id IS NULL THEN
        SELECT (is_active AND allows_movement) INTO eligible
        FROM accounts WHERE id = NEW.account_id FOR SHARE;
        IF eligible IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Journal entry line requires an active movement account'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_lines_guard_write_trg
BEFORE INSERT OR UPDATE OR DELETE ON "journal_entry_lines"
FOR EACH ROW EXECUTE FUNCTION guard_journal_entry_line_write();

CREATE FUNCTION validate_journal_entry_at_commit() RETURNS trigger AS $$
DECLARE
    entry_row journal_entries%ROWTYPE;
    debit_sum NUMERIC;
    credit_sum NUMERIC;
    line_count INTEGER;
BEGIN
    -- A deferred INSERT trigger sees NEW.status=DRAFT even if the same
    -- transaction subsequently posted it; re-read the current row instead.
    SELECT * INTO entry_row FROM journal_entries WHERE id = NEW.id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF entry_row.status <> 'POSTED' OR entry_row.posted_at IS NULL THEN
        RAISE EXCEPTION 'A journal entry cannot remain DRAFT at commit'
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      INTO line_count, debit_sum, credit_sum
    FROM journal_entry_lines WHERE journal_entry_id = entry_row.id;
    IF line_count < 2 OR debit_sum <> credit_sum OR debit_sum <= 0 THEN
        RAISE EXCEPTION 'Posted journal entry must have at least two balanced nonzero lines'
            USING ERRCODE = '23514';
    END IF;

    IF entry_row.reversal_of_id IS NULL AND EXISTS (
        SELECT 1 FROM journal_entry_lines line
        JOIN accounts account ON account.id = line.account_id
        WHERE line.journal_entry_id = entry_row.id
          AND (NOT account.is_active OR NOT account.allows_movement)
    ) THEN
        RAISE EXCEPTION 'Posted journal entry requires active movement accounts'
            USING ERRCODE = '23514';
    END IF;

    IF entry_row.reversal_of_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM journal_entries
            WHERE id = entry_row.reversal_of_id AND status = 'POSTED'
        ) THEN
            RAISE EXCEPTION 'Reversal requires an existing posted journal entry'
                USING ERRCODE = '23514';
        END IF;

        -- Exact multiset equality preserves account and amount allocation,
        -- including repeated lines; descriptions and position need not match.
        IF EXISTS (
            SELECT account_id, purpose, debit, credit FROM journal_entry_lines
            WHERE journal_entry_id = entry_row.id
            EXCEPT ALL
            SELECT account_id, purpose, credit, debit FROM journal_entry_lines
            WHERE journal_entry_id = entry_row.reversal_of_id
        ) OR EXISTS (
            SELECT account_id, purpose, credit, debit FROM journal_entry_lines
            WHERE journal_entry_id = entry_row.reversal_of_id
            EXCEPT ALL
            SELECT account_id, purpose, debit, credit FROM journal_entry_lines
            WHERE journal_entry_id = entry_row.id
        ) THEN
            RAISE EXCEPTION 'Reversal lines must mirror the original entry exactly'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_entries_validate_at_commit_trg
AFTER INSERT OR UPDATE OF status ON "journal_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_at_commit();
