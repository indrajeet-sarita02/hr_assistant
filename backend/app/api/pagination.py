from __future__ import annotations

from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session


def count_rows(db: Session, stmt: Select[Any]) -> int:
    """Return an efficient total for a filtered SELECT statement.

    Ordering is irrelevant for a count and can make PostgreSQL do unnecessary
    work (or fail when the statement uses a DISTINCT/GROUP BY shape), so the
    caller's ordering is removed from the derived table.
    """
    return (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
        or 0
    )
