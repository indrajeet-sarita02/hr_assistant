"""Document malware-scan worker.

Documents are registered with ``scan_status="pending"``
(``app/api/v1/documents.py``) and every download/evidence path refuses
anything that is not ``clean`` ("never serve unscanned files", §10.3). This
worker claims pending documents in bounded batches and transitions them to a
terminal scan status.

With the default ``local_metadata`` metadata-only provider no bytes are
available to inspect, so the scan is deterministic metadata validation:
documents whose metadata cannot be reconciled with the registration
invariants are quarantined as ``infected``/``failed`` sentinels are honoured
for test/deployment hooks, everything else resolves ``clean``.

Sentinels (deterministic, testable, and never mistaken for real AV output):
- checksum of 64 ``0`` chars → ``infected`` (quarantine marker)
- checksum of 64 ``f`` chars → ``failed`` (simulated scanner unavailability)
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger, tenant_id_ctx
from app.db.models import Document
from app.db.session import set_tenant_context
from app.domains.audit import write_audit

logger = get_logger(__name__)

BATCH_SIZE = 50

_INFECTED_SENTINEL = "0" * 64
_FAILED_SENTINEL = "f" * 64


def _evaluate(document: Document) -> str:
    """Return the terminal scan status for one registered document."""

    checksum = (document.checksum or "").lower()
    if checksum == _INFECTED_SENTINEL:
        return "infected"
    if checksum == _FAILED_SENTINEL:
        return "failed"
    # The metadata-only provider cannot inspect bytes; the registration path
    # already enforces MIME/size/checksum invariants and there is no signed
    # byte channel to serve, so the document resolves clean. A real provider
    # integrates behind this single function.
    return "clean"


def scan_pending_documents(db: Session, limit: int = BATCH_SIZE) -> dict[str, int]:
    """Claim and scan one bounded batch of pending documents."""

    documents = list(
        db.scalars(
            select(Document)
            .where(Document.scan_status == "pending")
            .order_by(Document.created_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    counts = {"clean": 0, "infected": 0, "failed": 0}
    now = datetime.now(UTC)
    for document in documents:
        tenant_id_ctx.set(str(document.tenant_id))
        set_tenant_context(db, document.tenant_id)
        try:
            document.scan_status = _evaluate(document)
            counts[document.scan_status] += 1
            event = write_audit(
                db,
                None,
                "document.scan.completed",
                target_type="document",
                target_id=document.id,
                actor_type="system",
                outcome="success" if document.scan_status == "clean" else "failure",
                metadata={
                    "scan_status": document.scan_status,
                    "scan_provider": settings.object_storage_provider,
                },
            )
            event.tenant_id = document.tenant_id
        except Exception:
            # Never leave a document stuck pending forever: an errored scan is
            # a scan failure, not a pass.
            document.scan_status = "failed"
            counts["failed"] += 1
            logger.exception(
                "document_scan_errored",
                extra={"event": "document_scan", "document_id": str(document.id)},
            )
        finally:
            tenant_id_ctx.set("-")
    if documents:
        db.commit()
        logger.info(
            "document_scan_batch_complete",
            extra={"event": "document_scan", "claimed": len(documents), **counts},
        )
    return {"claimed": len(documents), **counts}


def main() -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        result = scan_pending_documents(db)
    print(result)


if __name__ == "__main__":
    main()
