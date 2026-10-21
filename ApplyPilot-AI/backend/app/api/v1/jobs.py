from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_owned
from app.core.db import get_db
from app.models import Job, User
from app.schemas.analysis import JobRequirementsEdit
from app.schemas.api import JobIn, JobOut, JobPreviewOut, Page
from app.services.jd_analyzer import analyze_job
from app.services.job_utils import effective_analysis
from app.services.textutil import normalize_text

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _out(job: Job, duplicate: bool = False) -> JobOut:
    return JobOut(id=job.id, title=job.title, company=job.company, location=job.location, employment_type=job.employment_type,
                  salary_text=job.salary_text, url=job.url, source=job.source, adapter=job.adapter, description=job.description,
                  analysis=effective_analysis(job), requirements_override=job.requirements_override, created_at=job.created_at, duplicate=duplicate)


@router.post("/analyze", response_model=JobPreviewOut)
def analyze(body: JobIn, user: User = Depends(current_user)):
    """Stateless: analyse a job description without saving anything."""
    return JobPreviewOut(analysis=analyze_job(normalize_text(body.description, 60_000)))


@router.post("", response_model=JobOut, status_code=201)
def create_job(body: JobIn, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    desc = normalize_text(body.description, 60_000)
    conds = []
    if body.url:
        conds.append(Job.url == body.url)
    if body.company.strip():
        conds.append((func.lower(Job.title) == body.title.strip().lower()) & (func.lower(Job.company) == body.company.strip().lower()))
    existing = db.scalar(select(Job).where(Job.user_id == user.id, or_(*conds))) if conds else None
    if existing:  # duplicate detection: refresh the snapshot instead of creating a second record
        existing.description, existing.analysis = desc, analyze_job(desc).model_dump()
        db.commit()
        response.status_code = 200
        return _out(existing, duplicate=True)
    job = Job(user_id=user.id, title=body.title.strip(), company=body.company.strip(), location=body.location.strip(),
              employment_type=body.employment_type.strip(), salary_text=body.salary_text.strip(), url=body.url, source=body.source,
              adapter=body.adapter, description=desc, analysis=analyze_job(desc).model_dump())
    db.add(job)
    db.commit()
    return _out(job)


@router.get("", response_model=Page[JobOut])
def list_jobs(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Job).where(Job.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Job.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[_out(j) for j in rows], total=total, limit=limit, offset=offset)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(get_owned(db, Job, job_id, user))


@router.put("/{job_id}/requirements", response_model=JobOut)
def edit_requirements(job_id: int, body: JobRequirementsEdit, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """User corrections to the extracted requirements (replaces any earlier edits)."""
    job = get_owned(db, Job, job_id, user)
    job.requirements_override = body.model_dump(exclude_none=True) or None
    db.commit()
    return _out(job)


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Job, job_id, user))
    db.commit()
