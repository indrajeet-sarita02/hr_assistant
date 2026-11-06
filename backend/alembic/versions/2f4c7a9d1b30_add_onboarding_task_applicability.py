"""add applicability rules to onboarding template tasks

Revision ID: 2f4c7a9d1b30
Revises: 8b2d9f4c1a70
Create Date: 2026-10-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2f4c7a9d1b30"
down_revision: Union[str, Sequence[str], None] = "8b2d9f4c1a70"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Store role/department/title/start-date applicability per template task."""

    op.add_column(
        "onboarding_template_tasks",
        sa.Column(
            "applicability",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("onboarding_template_tasks", "applicability")
