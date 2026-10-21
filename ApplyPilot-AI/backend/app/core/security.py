import time
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()
_DUMMY_HASH = _hasher.hash("timing-equalizer-not-a-real-password")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Always performs a hash verification so login time doesn't reveal whether an email exists."""
    try:
        ok = _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return ok and password_hash is not None


def create_access_token(user_id: int, token_version: int) -> tuple[str, int]:
    s = get_settings()
    now = int(time.time())
    exp = now + s.access_token_minutes * 60
    payload = {"sub": str(user_id), "tv": token_version, "iat": now, "exp": exp, "jti": uuid.uuid4().hex}
    return jwt.encode(payload, s.secret_key, algorithm=ALGORITHM), exp - now


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
