from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_owned
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.models import Job, Resume, ResumeJobMatch, User
from app.schemas.analysis import MatchResult, ParsedResume
from app.schemas.api import AIStatus, MatchCreate, MatchOut, MatchPreviewIn, Page
from app.services.ai.base import get_provider, require_provider
from app.services.ai.tasks import MatchExplanation, explain_match
from app.services.jd_analyzer import analyze_job
from app.services.job_utils import effective_analysis
from app.services.matcher import compute_match
from app.services.textutil import normalize_text

router = APIRouter(tags=["matches"])


@router.post("/matches/preview", response_model=MatchOut)
def preview(body: MatchPreviewIn, user: User = Depends(current_user), db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    """Score a resume against an unsaved job (e.g. straight from the extension). Nothing is persisted."""
    resume = get_owned(db, Resume, body.resume_id, user)
    desc = normalize_text(body.job.description, 60_000)
    res = compute_match(resume.text, ParsedResume(**resume.parsed), f"{body.job.title}\n{desc}", analyze_job(desc), s)
    return MatchOut(resume_id=resume.id, score=res.score, result=res)


@router.post("/matches", response_model=MatchOut, status_code=201)
def create_match(body: MatchCreate, user: User = Depends(current_user), db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    resume, job = get_owned(db, Resume, body.resume_id, user), get_owned(db, Job, body.job_id, user)
    res = compute_match(resume.text, ParsedResume(**resume.parsed), f"{job.title}\n{job.description}", effective_analysis(job), s)
    m = ResumeJobMatch(user_id=user.id, resume_id=resume.id, job_id=job.id, score=res.score, result=res.model_dump())
    db.add(m)
    db.commit()
    return MatchOut(id=m.id, resume_id=m.resume_id, job_id=m.job_id, score=m.score, result=res, created_at=m.created_at)


@router.get("/matches", response_model=Page[MatchOut])
def list_matches(job_id: int | None = None, resume_id: int | None = None, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(ResumeJobMatch).where(ResumeJobMatch.user_id == user.id)
    if job_id is not None:
        q = q.where(ResumeJobMatch.job_id == job_id)
    if resume_id is not None:
        q = q.where(ResumeJobMatch.resume_id == resume_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(ResumeJobMatch.created_at.desc()).limit(limit).offset(offset)).all()
    items = [MatchOut(id=m.id, resume_id=m.resume_id, job_id=m.job_id, score=m.score, result=MatchResult(**m.result), created_at=m.created_at) for m in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("/matches/{match_id}/explain", response_model=MatchExplanation)
def explain(match_id: int, user: User = Depends(current_user), db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    """AI narrative over the deterministic result. Requires a configured provider AND the user's explicit consent."""
    m = get_owned(db, ResumeJobMatch, match_id, user)
    provider = require_provider(s)
    if not user.ai_consent:
        raise AppError(403, "ai_consent_required", "Enable AI processing in Settings first. Your resume and the job text are sent to your configured AI provider for this feature.")
    resume, job = get_owned(db, Resume, m.resume_id, user), get_owned(db, Job, m.job_id, user)
    return explain_match(provider, MatchResult(**m.result), resume.text, job.title, job.description)


@router.get("/ai/status", response_model=AIStatus)
def ai_status(user: User = Depends(current_user), s: Settings = Depends(get_settings)):
    p = get_provider(s)
    return AIStatus(configured=p is not None, provider=p.name if p else None, model=p.model if p else None, consent_given=user.ai_consent)
