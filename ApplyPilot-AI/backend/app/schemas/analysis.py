from typing import Literal

from pydantic import BaseModel, Field

EvidenceStatus = Literal["evidenced", "stated", "needs_verification", "absent", "not_assessable"]


class ParsedResume(BaseModel):
    sections: dict[str, str] = Field(default_factory=dict)
    contact: dict[str, str] = Field(default_factory=dict)
    skills_found: list[str] = Field(default_factory=list)
    years_experience: float | None = None
    years_note: str = ""
    education_level: str | None = None
    warnings: list[str] = Field(default_factory=list)


class JobAnalysis(BaseModel):
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    mentioned_skills: list[str] = Field(default_factory=list)  # in description, not classified as required/preferred
    classification_confidence: Literal["high", "low"] = "low"
    min_years_experience: float | None = None
    education_level: str | None = None
    education_text: str = ""
    responsibilities: list[str] = Field(default_factory=list)
    soft_skills: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    injection_suspected: bool = False


class JobRequirementsEdit(BaseModel):
    """User corrections to extracted requirements. Any provided field replaces the machine value."""
    required_skills: list[str] | None = Field(default=None, max_length=60)
    preferred_skills: list[str] | None = Field(default=None, max_length=60)
    min_years_experience: float | None = Field(default=None, ge=0, le=40)
    education_level: Literal["diploma", "bachelor", "master", "phd"] | None = None


class ScoreComponent(BaseModel):
    key: str
    label: str
    weight: float
    effective_weight: float  # weight after redistributing away from non-assessable components
    value: float | None  # 0..1, None when not assessable
    assessable: bool
    detail: str


class SkillFinding(BaseModel):
    skill: str
    requirement: Literal["required", "preferred", "mentioned"]
    status: EvidenceStatus
    evidence: str | None = None


class MatchResult(BaseModel):
    label: str = "Estimated resume-to-job compatibility (not an official ATS score)"
    score: float
    components: list[ScoreComponent]
    skill_findings: list[SkillFinding]
    strengths: list[str]
    concerns: list[str]
    recommended_actions: list[str]
    semantic_method: str
    notes: list[str] = Field(default_factory=list)
