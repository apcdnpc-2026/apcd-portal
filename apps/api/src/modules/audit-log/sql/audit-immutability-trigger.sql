-- =============================================================================
-- Audit Log Immutability Trigger
-- =============================================================================
-- This trigger prevents any UPDATE or DELETE operations on the audit_logs table,
-- ensuring that once an audit record is written, it cannot be modified or removed.
-- This is essential for maintaining a tamper-proof audit trail.
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. Operation % is forbidden.', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_immutable'
  ) THEN
    CREATE TRIGGER trg_audit_immutable
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
  END IF;
END $$;
