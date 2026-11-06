"""Single scheduler entrypoint for background jobs (§10.3).

Usage:
    uv run python -m app.workers.scheduler                # run every job once
    uv run python -m app.workers.scheduler --once outbox  # one job, one run
    uv run python -m app.workers.scheduler --loop 60      # all jobs, sleep 60s

Jobs are plain ``(Session) -> counts`` callables that commit their own
transactions, so compose a supervisor loop or invoke the worker modules
directly (``python -m app.workers.outbox`` keeps working).
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable
from typing import TYPE_CHECKING

from app.core.logging import configure_logging, get_logger

if TYPE_CHECKING:  # pragma: no cover - typing only
    from sqlalchemy.orm import Session

from app.workers.document_scanning import scan_pending_documents
from app.workers.idempotency_cleanup import cleanup_expired_keys
from app.workers.outbox import process_pending_events
from app.workers.reminders import run_reminder_scan
from app.workers.report_exports import process_pending_exports
from app.workers.retention import process_approved_deletion_requests

logger = get_logger(__name__)

# Registry is ordered so the relay runs before jobs that generate more work.
JOBS: dict[str, Callable[["Session"], dict[str, int]]] = {
    "outbox": process_pending_events,
    "reminders": run_reminder_scan,
    "exports": process_pending_exports,
    "document_scanning": scan_pending_documents,
    "retention": process_approved_deletion_requests,
    "idempotency_cleanup": cleanup_expired_keys,
}


def run_job(db: "Session", name: str) -> dict[str, int]:
    job = JOBS[name]
    started = time.perf_counter()
    try:
        counts = job(db)
    except Exception:
        db.rollback()
        logger.exception("job_unexpected_failure", extra={"event": "worker", "job": name})
        counts = {"failed": 1}
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    logger.info(
        "job_run_complete",
        extra={
            "event": "worker",
            "job": name,
            "duration_ms": duration_ms,
            **counts,
        },
    )
    return counts


def run_all(db: "Session") -> dict[str, dict[str, int]]:
    results: dict[str, dict[str, int]] = {}
    for name in JOBS:
        results[name] = run_job(db, name)
    return results


def main() -> None:
    from app.core.config import settings

    configure_logging(settings.debug)
    parser = argparse.ArgumentParser(
        prog="python -m app.workers.scheduler",
        description="Run HR Assistant background jobs (§10.3 catalogue).",
    )
    parser.add_argument(
        "--once",
        metavar="JOB",
        choices=sorted(JOBS),
        default=None,
        help="run a single job once and exit",
    )
    parser.add_argument(
        "--loop",
        metavar="SECONDS",
        type=int,
        default=None,
        help="run all jobs, sleep SECONDS, repeat until interrupted",
    )
    args = parser.parse_args()

    from app.db.session import SessionLocal

    if args.once is not None:
        with SessionLocal() as db:
            run_job(db, args.once)
        return
    if args.loop is not None:
        if args.loop < 1:
            raise SystemExit("--loop SECONDS must be at least 1")
        while True:
            with SessionLocal() as db:
                run_all(db)
            time.sleep(args.loop)
    with SessionLocal() as db:
        run_all(db)


if __name__ == "__main__":
    main()
