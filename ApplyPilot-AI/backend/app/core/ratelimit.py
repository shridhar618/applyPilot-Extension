"""In-memory sliding-window rate limiter.

Good enough for a single process. For multi-instance production deploys, back this with Redis.
Behind a reverse proxy, make sure the real client IP reaches the app (e.g. uvicorn --proxy-headers).
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_s: float) -> float | None:
        """Returns None if allowed, else seconds until retry."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window_s:
                q.popleft()
            if len(q) >= limit:
                return window_s - (now - q[0])
            q.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def auth_rate_limit(request: Request) -> None:
    s = get_settings()
    if not s.rate_limit_enabled:
        return
    ip = request.client.host if request.client else "unknown"
    wait = limiter.check(f"auth:{ip}", s.auth_rate_limit_per_minute, 60)
    if wait is not None:
        raise AppError(429, "rate_limited", f"Too many attempts. Try again in {int(wait) + 1}s.")
