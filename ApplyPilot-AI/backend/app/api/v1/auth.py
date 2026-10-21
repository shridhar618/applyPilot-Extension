from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core.db import get_db
from app.core.errors import AppError
from app.core.ratelimit import auth_rate_limit
from app.core.security import create_access_token, hash_password, verify_password
from app.core.config import Settings, get_settings
from app.models import Application, Job, Resume, ResumeJobMatch, User
from app.schemas.api import LoginIn, RegisterIn, TokenOut, UserOut, UserUpdate

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_for(user: User) -> TokenOut:
    token, ttl = create_access_token(user.id, user.token_version)
    return TokenOut(access_token=token, expires_in=ttl, user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, status_code=201, dependencies=[Depends(auth_rate_limit)])
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise AppError(409, "email_taken", "An account with this email already exists.")
    user = User(email=body.email, password_hash=hash_password(body.password), full_name=body.full_name.strip())
    db.add(user)
    db.commit()
    return _token_for(user)


@router.post("/login", response_model=TokenOut, dependencies=[Depends(auth_rate_limit)])
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    if not verify_password(body.password, user.password_hash if user else None) or user is None:
        raise AppError(401, "invalid_credentials", "Incorrect email or password.")
    return _token_for(user)


@router.post("/logout", status_code=204)
def logout(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Invalidates every token issued so far for this account (token_version bump)."""
    user.token_version += 1
    db.commit()
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.ai_consent is not None and body.ai_consent != user.ai_consent:
        user.ai_consent = body.ai_consent
        user.ai_consent_at = datetime.now(timezone.utc) if body.ai_consent else None
    db.commit()
    return user


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)


@router.delete("/me", status_code=204, dependencies=[Depends(auth_rate_limit)])
def delete_account(body: DeleteAccountIn, user: User = Depends(current_user), db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    """Permanently deletes the account, all its records (DB cascade) and its stored resume files. Requires the password."""
    if not verify_password(body.password, user.password_hash):
        raise AppError(403, "invalid_password", "Password is incorrect.")
    stored = [r.stored_filename for r in db.scalars(select(Resume).where(Resume.user_id == user.id)) if r.stored_filename]
    db.delete(user)
    db.commit()
    for name in stored:
        (s.upload_dir / Path(name).name).unlink(missing_ok=True)
    return Response(status_code=204)


@router.get("/me/export")
def export_my_data(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Machine-readable copy of everything we store about the user (GDPR-style data portability)."""
    def rows(model):
        return db.scalars(select(model).where(model.user_id == user.id)).unique().all()
    return {
        "user": {"email": user.email, "full_name": user.full_name, "ai_consent": user.ai_consent},
        "resumes": [{"id": r.id, "name": r.name, "filename": r.original_filename, "text": r.text, "parsed": r.parsed} for r in rows(Resume)],
        "jobs": [{"id": j.id, "title": j.title, "company": j.company, "url": j.url, "description": j.description, "analysis": j.analysis} for j in rows(Job)],
        "matches": [{"id": m.id, "resume_id": m.resume_id, "job_id": m.job_id, "score": m.score, "result": m.result} for m in rows(ResumeJobMatch)],
        "applications": [{"id": a.id, "job_id": a.job_id, "status": a.status, "notes": a.notes, "next_action": a.next_action} for a in rows(Application)],
    }
