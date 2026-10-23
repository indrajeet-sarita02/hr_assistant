from __future__ import annotations

from sqlalchemy import Connection, text

_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql
"""

_TRIGGER_SQL = (
    """
CREATE TRIGGER audit_events_no_update_delete
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH STATEMENT EXECUTE PROCEDURE reject_audit_event_mutation()
""",
    """
CREATE TRIGGER audit_events_no_truncate
BEFORE TRUNCATE ON audit_events
FOR EACH STATEMENT EXECUTE PROCEDURE reject_audit_event_mutation()
""",
)

_DROP_SQL = (
    "DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events",
    "DROP TRIGGER IF EXISTS audit_events_no_update_delete ON audit_events",
    "DROP FUNCTION IF EXISTS reject_audit_event_mutation()",
)


def install_audit_guard(bind: Connection) -> None:
    """Install database-level append-only protection for `audit_events`."""
    bind.execute(text(_FUNCTION_SQL))
    for statement in _TRIGGER_SQL:
        bind.execute(text(statement))


def remove_audit_guard(bind: Connection) -> None:
    for statement in _DROP_SQL:
        bind.execute(text(statement))
