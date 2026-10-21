import json

from pydantic import BaseModel, Field

from app.schemas.analysis import MatchResult
from app.services.ai.base import AIProvider, run_structured, untrusted


class MatchExplanation(BaseModel):
    summary: str = Field(max_length=1200)
    top_priorities: list[str] = Field(max_length=5)
    caveats: list[str] = Field(default_factory=list, max_length=4)


def explain_match(provider: AIProvider, result: MatchResult, resume_text: str, job_title: str, job_text: str) -> MatchExplanation:
    system = ("You explain a deterministic resume-to-job compatibility result to a job seeker in plain, encouraging but honest language. "
              "Base every statement on the findings and documents provided. Do not suggest adding skills the candidate hasn't evidenced; "
              "suggest documenting real experience or learning the skill instead. top_priorities: the most valuable actions, most important first.")
    findings = json.dumps({"estimated_score": result.score, "components": [c.model_dump() for c in result.components],
                           "skill_findings": [f.model_dump(exclude={"evidence"}) for f in result.skill_findings]})
    user = f"Scored findings (trusted, produced by our algorithm):\n{findings}\n\n{untrusted('resume', resume_text)}\n\n{untrusted('job_posting:' + job_title[:80], job_text)}"
    return run_structured(provider, system, user, MatchExplanation)
