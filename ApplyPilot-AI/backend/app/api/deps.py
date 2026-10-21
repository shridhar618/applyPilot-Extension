from typing import TypeVar

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import Base, get_db
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.models import User

_bearer = HTTPBearer(auto_error=False)
M = TypeVar("M", bound=Base)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    """Authentication is enforced here, server-side, on every private route."""
    unauth = AppError(401, "unauthorized", "Please sign in again.")
    if creds is None:
        raise unauth
    payload = decode_access_token(creds.credentials)
    if not payload:
        raise unauth
    try:
        user = db.get(User, int(payload["sub"]))
    except (ValueError, KeyError):
        raise unauth
    if user is None or payload.get("tv") != user.token_version:
        raise unauth
    return user


def get_owned(db: Session, model: type[M], obj_id: int, user: User) -> M:
    """Fetch a row only if it belongs to `user`. Returns 404 (not 403) so other users' IDs can't be probed."""
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "user_id", None) != user.id:
        raise AppError(404, "not_found", f"{model.__name__} not found.")
    return obj


SettingsDep = Depends(get_settings)
__all__ = ["current_user", "get_owned", "get_db", "Settings", "SettingsDep"]
