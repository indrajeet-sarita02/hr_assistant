"""add organization version for optimistic settings updates

Revision ID: 8b2d9f4c1a70
Revises: 330b7911b54d
Create Date: 2026-10-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "8b2d9f4c1a70"
down_revision: Union[str, Sequence[str], None] = "330b7911b54d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Track the optimistic-concurrency version for tenant settings."""

    op.add_column(
        "organizations",
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "version")
