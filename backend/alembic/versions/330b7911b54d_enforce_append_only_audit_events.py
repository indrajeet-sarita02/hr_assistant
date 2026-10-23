"""enforce append only audit events

Revision ID: 330b7911b54d
Revises: 1276118a9304
Create Date: 2026-10-22 16:36:26.724651

"""
from typing import Sequence, Union

from alembic import op

from app.db.audit_guard import install_audit_guard, remove_audit_guard

# revision identifiers, used by Alembic.
revision: str = "330b7911b54d"
down_revision: Union[str, Sequence[str], None] = "1276118a9304"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Make the audit log append-only at the database layer.

    Application code only inserts audit rows, but a compromised or buggy path
    must not be able to rewrite history. A database role with DDL rights can of
    course drop the trigger; production deployments should also restrict DDL and
    ship audit rows to immutable/WORM storage.
    """
    install_audit_guard(op.get_bind())


def downgrade() -> None:
    """Remove append-only protection."""
    remove_audit_guard(op.get_bind())
