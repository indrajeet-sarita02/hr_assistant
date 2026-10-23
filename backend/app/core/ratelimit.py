from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from app.core.config import settings
from app.core.errors import rate_limited


class InMemoryRateLimiter:
    """Process-local fixed-window limiter.

    Suitable for a single development instance and as a fail-safe in front of a
    shared limiter. Production deployments should use the API gateway/Redis
    implementation documented in backend.md.
    """

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        if not settings.rate_limit_enabled or limit <= 0:
            return
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] < cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window_seconds - (now - events[0])))
                raise rate_limited(retry_after)
            events.append(now)
            if len(self._events) > 10_000:
                # Bound memory in long-running development processes.
                for stale_key in [k for k, v in self._events.items() if not v or v[-1] < cutoff]:
                    self._events.pop(stale_key, None)


limiter = InMemoryRateLimiter()


def limit_auth(key: str) -> None:
    limiter.check(f"auth:{key}", settings.rate_limit_auth_per_minute)


def limit_ai(key: str) -> None:
    limiter.check(f"ai:{key}", settings.rate_limit_ai_per_minute)


def limit_write(key: str) -> None:
    limiter.check(f"write:{key}", settings.rate_limit_write_per_minute)


def limit_public_write(key: str) -> None:
    limiter.check(f"public-write:{key}", settings.rate_limit_public_write_per_minute)
