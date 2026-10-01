-- An account referenced by a posted journal line is part of immutable history.
-- Names and active status remain editable, but its classification cannot drift.
CREATE OR REPLACE FUNCTION prevent_posted_account_reclassification()
RETURNS trigger AS $$
BEGIN
  IF (NEW.code IS DISTINCT FROM OLD.code
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
      OR NEW.level IS DISTINCT FROM OLD.level)
     AND EXISTS (
       SELECT 1 FROM journal_entry_lines WHERE account_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'Account with posted journal lines cannot change code, type, parent or level';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER account_posted_identity_guard
BEFORE UPDATE OF code, type, parent_id, level ON accounts
FOR EACH ROW EXECUTE FUNCTION prevent_posted_account_reclassification();
