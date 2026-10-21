import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_owned
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.models import Resume, User
from app.schemas.api import Page, ResumeDetail, ResumeManualIn, ResumeSummary, ResumeUpdate
from app.services.resume_parser import ALLOWED, extract_text, parse_resume, validate_upload
from app.services.textutil import normalize_text

router = APIRouter(prefix="/resumes", tags=["resumes"])


def _summary(r: Resume) -> ResumeSummary:
    s = ResumeSummary.model_validate(r)
    s.has_file = bool(r.stored_filename)
    return s


def _detail(r: Resume) -> ResumeDetail:
    return ResumeDetail(**_summary(r).model_dump(), text=r.text, parsed=r.parsed)


def _make_default_if_first(db: Session, user: User, r: Resume) -> None:
    has_default = db.scalar(select(func.count()).select_from(Resume).where(Resume.user_id == user.id, Resume.is_default.is_(True)))
    if not has_default:
        r.is_default = True


@router.post("", response_model=ResumeDetail, status_code=201)
def upload_resume(file: UploadFile = File(...), name: str | None = Form(default=None, max_length=120),
                  user: User = Depends(current_user), db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    data = file.file.read(s.max_upload_bytes + 1)  # bounded read: never buffer an unbounded upload
    filename = (file.filename or "resume").replace("\\", "/").rsplit("/", 1)[-1][:255]
    ext = validate_upload(filename, data, s.max_upload_bytes)
    text = normalize_text(extract_text(ext, data), s.max_resume_text_chars)
    if len(text) < 50:
        raise AppError(422, "no_text", "We couldn't find readable text (scanned/image-only PDF?). Paste your resume text manually instead.")
    s.upload_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    stored = f"{uuid.uuid4().hex}{ext}"  # random name: the user-supplied filename never touches the filesystem
    (s.upload_dir / stored).write_bytes(data)
    r = Resume(user_id=user.id, name=(name or filename.rsplit(".", 1)[0])[:120] or "Resume", original_filename=filename,
               stored_filename=stored, mime_type=ALLOWED[ext], size_bytes=len(data), text=text, parsed=parse_resume(text).model_dump())
    _make_default_if_first(db, user, r)
    db.add(r)
    db.commit()
    return _detail(r)


@router.post("/manual", response_model=ResumeDetail, status_code=201)
def create_manual(body: ResumeManualIn, user: User = Depends(current_user), db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    text = normalize_text(body.text, s.max_resume_text_chars)
    r = Resume(user_id=user.id, name=body.name.strip(), text=text, size_bytes=len(text.encode()), parsed=parse_resume(text).model_dump())
    _make_default_if_first(db, user, r)
    db.add(r)
    db.commit()
    return _detail(r)


@router.get("", response_model=Page[ResumeSummary])
def list_resumes(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Resume).where(Resume.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Resume.is_default.desc(), Resume.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[_summary(r) for r in rows], total=total, limit=limit, offset=offset)


@router.get("/{resume_id}", response_model=ResumeDetail)
def get_resume(resume_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _detail(get_owned(db, Resume, resume_id, user))


@router.patch("/{resume_id}", response_model=ResumeDetail)
def update_resume(resume_id: int, body: ResumeUpdate, user: User = Depends(current_user), db: Session = Depends(get_db),
                  s: Settings = Depends(get_settings)):
    r = get_owned(db, Resume, resume_id, user)
    if body.name is not None:
        r.name = body.name.strip()
    if body.text is not None:  # manual correction of extracted text: re-parse so findings stay consistent
        r.text = normalize_text(body.text, s.max_resume_text_chars)
        r.parsed = parse_resume(r.text).model_dump()
    if body.is_default is True:
        db.execute(update(Resume).where(Resume.user_id == user.id).values(is_default=False))
        r.is_default = True
    elif body.is_default is False:
        r.is_default = False
    db.commit()
    return _detail(r)


@router.delete("/{resume_id}", status_code=204)
def delete_resume(resume_id: int, user: User = Depends(current_user), db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    r = get_owned(db, Resume, resume_id, user)
    stored, was_default = r.stored_filename, r.is_default
    db.delete(r)
    db.commit()
    if stored:
        (s.upload_dir / Path(stored).name).unlink(missing_ok=True)
    if was_default:
        nxt = db.scalar(select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc()))
        if nxt:
            nxt.is_default = True
            db.commit()


@router.get("/{resume_id}/download")
def download_resume(resume_id: int, user: User = Depends(current_user), db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    r = get_owned(db, Resume, resume_id, user)
    path = s.upload_dir / Path(r.stored_filename or "").name
    if not r.stored_filename or not path.is_file():
        raise AppError(404, "no_file", "No original file is stored for this resume.")
    return FileResponse(path, media_type=r.mime_type or "application/octet-stream", filename=r.original_filename or "resume",
                        content_disposition_type="attachment", headers={"X-Content-Type-Options": "nosniff"})
