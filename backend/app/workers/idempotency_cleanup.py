"""Idempotency-key cleanup worker (FR-034, §6.9).

Expired ``idempotency_keys`` rows are deleted on a schedule so the replay
window (``settings.idempotency_ttl_hours``) is enforced by the key's
``expires_at`` and the table does not grow unboundedly. Deletion runs in
bounded, restartable batches.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import IdempotencyKey

logger = get_logger(__name__)

BATCH_SIZE = 500


def cleanup_expired_keys(db: Session, batch_size: int = BATCH_SIZE) -> dict[str, int]:
    """Delete expired idempotency rows in bounded batches.

    The batch is selected first and then deleted by ID list; this keeps each
    statement small and makes the loop idempotent (a rerun finds nothing).
    """

    now = datetime.now(UTC)
    deleted = 0
    while True:
        ids = list(
            db.scalars(
                select(IdempotencyKey.id)
                .where(IdempotencyKey.expires_at < now)
                .limit(batch_size)
            )
        )
        if not ids:
            break
        db.execute(delete(IdempotencyKey).where(IdempotencyKey.id.in_(ids)))
        deleted += len(ids)
        db.commit()
    if deleted:
        logger.info(
            "idempotency_cleanup_complete",
            extra={"event": "idempotency_cleanup", "deleted": deleted},
        )
    return {"deleted": deleted}


def main() -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        result = cleanup_expired_keys(db)
    print(result)


if __name__ == "__main__":
    main()
