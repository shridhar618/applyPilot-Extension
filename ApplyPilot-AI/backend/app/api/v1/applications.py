import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_owned
from app.core.db import get_db
from app.core.errors import AppError
from app.models import APPLICATION_STATUSES, Application, Job, Resume, User, utcnow
from app.schemas.api import ApplicationCreate, ApplicationOut, ApplicationUpdate, Page

router = APIRouter(prefix="/applications", tags=["applications"])
SORTS = {"created_at": Application.created_at, "updated_at": Application.updated_at, "follow_up_on": Application.follow_up_on}


def _check_resume(db: Session, user: User, resume_id: int | None) -> None:
    if resume_id is not None:
        get_owned(db, Resume, resume_id, user)


@router.post("", response_model=ApplicationOut, status_code=201)
def create_application(body: ApplicationCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_owned(db, Job, body.job_id, user)
    _check_resume(db, user, body.resume_id)
    if db.scalar(select(Application).where(Application.user_id == user.id, Application.job_id == body.job_id)):
        raise AppError(409, "duplicate_application", "You're already tracking this job.")
    app = Application(user_id=user.id, job_id=body.job_id, resume_id=body.resume_id, status=body.status, notes=body.notes,
                      applied_on=utcnow() if body.status == "applied" else None)
    db.add(app)
    db.commit()
    return app


@router.get("", response_model=Page[ApplicationOut])
def list_applications(status: str | None = None, q: str | None = Query(None, max_length=100), sort: str = "updated_at", order: str = "desc",
                      limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    if status and status not in APPLICATION_STATUSES:
        raise AppError(422, "invalid_status", f"status must be one of: {', '.join(APPLICATION_STATUSES)}")
    if sort not in SORTS or order not in ("asc", "desc"):
        raise AppError(422, "invalid_sort", f"sort must be one of {', '.join(SORTS)}; order asc|desc")
    stmt = select(Application).join(Job, Application.job_id == Job.id).where(Application.user_id == user.id)
    if status:
        stmt = stmt.where(Application.status == status)
    if q:
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(or_(Job.title.ilike(like, escape="\\"), Job.company.ilike(like, escape="\\")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    col = SORTS[sort]
    rows = db.scalars(stmt.order_by(col.desc() if order == "desc" else col.asc()).limit(limit).offset(offset)).unique().all()
    return Page(items=[ApplicationOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)


def _csv_safe(v) -> str:
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s  # blocks spreadsheet formula injection


@router.get("/export.csv")
def export_csv(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Application).where(Application.user_id == user.id).order_by(Application.created_at)).unique().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["title", "company", "location", "url", "status", "applied_on", "follow_up_on", "next_action", "notes"])
    for a in rows:
        w.writerow([_csv_safe(x) for x in (a.job.title, a.job.company, a.job.location, a.job.url, a.status, a.applied_on, a.follow_up_on, a.next_action, a.notes)])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="applications.csv"'})


@router.get("/{app_id}", response_model=ApplicationOut)
def get_application(app_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return get_owned(db, Application, app_id, user)


@router.patch("/{app_id}", response_model=ApplicationOut)
def update_application(app_id: int, body: ApplicationUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    app = get_owned(db, Application, app_id, user)
    data = body.model_dump(exclude_unset=True)
    if "resume_id" in data:
        _check_resume(db, user, data["resume_id"])
    for k, v in data.items():
        if k == "status" and v is None:
            continue
        setattr(app, k, v)
    if data.get("status") == "applied" and app.applied_on is None and "applied_on" not in data:
        app.applied_on = utcnow()
    db.commit()
    return app


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Application, app_id, user))
    db.commit()
