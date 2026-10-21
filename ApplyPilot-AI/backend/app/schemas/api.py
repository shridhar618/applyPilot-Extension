from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import APPLICATION_STATUSES
from app.schemas.analysis import JobAnalysis, JobRequirementsEdit, MatchResult, ParsedResume

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth ----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(default="", max_length=120)

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    ai_consent: bool


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    ai_consent: bool | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# ---- resumes ----
class ResumeSummary(ORM):
    id: int
    name: str
    original_filename: str | None
    size_bytes: int
    is_default: bool
    created_at: datetime
    updated_at: datetime
    has_file: bool = False


class ResumeDetail(ResumeSummary):
    text: str
    parsed: ParsedResume


class ResumeManualIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=50, max_length=200_000)


class ResumeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    text: str | None = Field(default=None, min_length=50, max_length=200_000)
    is_default: bool | None = None


# ---- jobs ----
class JobIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    company: str = Field(default="", max_length=300)
    location: str = Field(default="", max_length=300)
    employment_type: str = Field(default="", max_length=60)
    salary_text: str = Field(default="", max_length=200)
    url: str | None = Field(default=None, max_length=2048)
    source: Literal["auto", "manual"] = "manual"
    adapter: str | None = Field(default=None, max_length=40)
    description: str = Field(min_length=30, max_length=60_000)

    @field_validator("url")
    @classmethod
    def _http_only(cls, v: str | None) -> str | None:
        if v and not v.lower().startswith(("http://", "https://")):
            raise ValueError("url must start with http:// or https://")
        return v or None


class JobOut(ORM):
    id: int
    title: str
    company: str
    location: str
    employment_type: str
    salary_text: str
    url: str | None
    source: str
    adapter: str | None
    description: str
    analysis: JobAnalysis
    requirements_override: JobRequirementsEdit | None
    created_at: datetime
    duplicate: bool = False


class JobPreviewOut(BaseModel):
    analysis: JobAnalysis


# ---- matches ----
class MatchCreate(BaseModel):
    resume_id: int
    job_id: int


class MatchPreviewIn(BaseModel):
    resume_id: int
    job: JobIn


class MatchOut(BaseModel):
    id: int | None = None
    resume_id: int
    job_id: int | None = None
    score: float
    result: MatchResult
    created_at: datetime | None = None


class AIStatus(BaseModel):
    configured: bool
    provider: str | None
    model: str | None
    consent_given: bool


# ---- applications ----
Status = Literal[tuple(APPLICATION_STATUSES)]  # type: ignore[valid-type]


class ApplicationCreate(BaseModel):
    job_id: int
    resume_id: int | None = None
    status: Status = "saved"
    notes: str = Field(default="", max_length=10_000)


class ApplicationUpdate(BaseModel):
    status: Status | None = None
    resume_id: int | None = None
    notes: str | None = Field(default=None, max_length=10_000)
    next_action: str | None = Field(default=None, max_length=300)
    follow_up_on: datetime | None = None
    applied_on: datetime | None = None


class ApplicationJob(ORM):
    id: int
    title: str
    company: str
    location: str
    url: str | None


class ApplicationOut(ORM):
    id: int
    job: ApplicationJob
    resume_id: int | None
    status: str
    applied_on: datetime | None
    notes: str
    next_action: str
    follow_up_on: datetime | None
    created_at: datetime
    updated_at: datetime
