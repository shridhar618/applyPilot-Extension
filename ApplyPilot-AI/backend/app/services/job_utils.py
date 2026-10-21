from app.models import Job
from app.schemas.analysis import JobAnalysis, JobRequirementsEdit


def effective_analysis(job: Job) -> JobAnalysis:
    """Machine analysis with the user's manual corrections applied on top (user edits always win)."""
    a = JobAnalysis(**job.analysis)
    if job.requirements_override:
        o = JobRequirementsEdit(**job.requirements_override)
        if o.required_skills is not None:
            a.required_skills = o.required_skills
            a.classification_confidence = "high"
        if o.preferred_skills is not None:
            a.preferred_skills = o.preferred_skills
        if o.min_years_experience is not None:
            a.min_years_experience = o.min_years_experience
        if o.education_level is not None:
            a.education_level = o.education_level
        taken = set(a.required_skills) | set(a.preferred_skills)
        a.mentioned_skills = [s for s in a.mentioned_skills if s not in taken]
    return a
