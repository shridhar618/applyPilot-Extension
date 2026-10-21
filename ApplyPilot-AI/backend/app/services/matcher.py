"""Explainable, deterministic resume-to-job scoring.

The score is an ESTIMATE from a documented heuristic -- not an official ATS score and not validated against hiring outcomes.
Components that can't be assessed (e.g. the job states no minimum experience) are excluded and their weight is
redistributed across the assessable ones, so candidates are never penalised for unknowns.
"""
import math
import re
from collections import Counter

from app.core.config import Settings
from app.schemas.analysis import JobAnalysis, MatchResult, ParsedResume, ScoreComponent, SkillFinding
from app.services.resume_parser import EDU_RANK
from app.services.skills import find_skills

# Partial credit per evidence level (documented assumption, tunable here).
EVIDENCE_CREDIT = {"evidenced": 1.0, "stated": 0.7, "needs_verification": 0.5, "absent": 0.0}
LABELS = {
    "required_skills": "Required skill coverage", "preferred_skills": "Preferred skill coverage",
    "semantic": "Semantic relevance", "experience": "Experience alignment", "education": "Education alignment",
}
_STOP = set("a an the and or of to in for with on at by from as is are be this that we you our your will can it its their they have has "
            "who what which about role job work team company experience years year skills ability strong good including such etc using use "
            "must should may new more all any".split())


def _tokens(text: str) -> list[str]:
    words = [w for w in re.findall(r"[a-z][a-z0-9+#.]{1,}", text.lower()) if w not in _STOP]
    return words + [f"{a} {b}" for a, b in zip(words, words[1:])]


def lexical_similarity(a: str, b: str) -> float:
    """Cosine similarity over sublinear-TF unigram+bigram vectors."""
    ca, cb = Counter(_tokens(a)), Counter(_tokens(b))
    if not ca or not cb:
        return 0.0
    va = {t: 1 + math.log(c) for t, c in ca.items()}
    vb = {t: 1 + math.log(c) for t, c in cb.items()}
    dot = sum(v * vb.get(t, 0.0) for t, v in va.items())
    na, nb = math.sqrt(sum(v * v for v in va.values())), math.sqrt(sum(v * v for v in vb.values()))
    return dot / (na * nb) if na and nb else 0.0


def _embedding_similarity(a: str, b: str) -> float | None:
    """Optional backend (UNVERIFIED in this repo's CI -- requires `pip install sentence-transformers`)."""
    try:
        from sentence_transformers import SentenceTransformer, util  # type: ignore
        model = _embedding_similarity.__dict__.setdefault("_m", SentenceTransformer("all-MiniLM-L6-v2"))
        e = model.encode([a[:6000], b[:6000]], convert_to_tensor=True)
        return float(util.cos_sim(e[0], e[1]))
    except Exception:
        return None


def semantic_similarity(resume_text: str, job_text: str, settings: Settings) -> tuple[float, str, list[str]]:
    notes: list[str] = []
    if settings.semantic_backend == "sentence-transformers":
        v = _embedding_similarity(resume_text, job_text)
        if v is not None:
            return max(0.0, min(1.0, v / 0.6)), "sentence-transformers (all-MiniLM-L6-v2)", notes
        notes.append("sentence-transformers is configured but unavailable; fell back to lexical similarity.")
        cal = settings.semantic_calibration
    else:
        cal = settings.semantic_calibration
    return max(0.0, min(1.0, lexical_similarity(resume_text, job_text) / cal)), "lexical cosine (TF unigram+bigram)", notes


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def classify_skill(skill: str, resume: ParsedResume) -> tuple[str, str | None]:
    """Evidence level + a supporting snippet from the resume (never fabricated: it is verbatim resume text)."""
    sec = resume.sections
    recognized = [k for k in sec if k != "header"]
    if skill not in resume.skills_found:
        return "absent", None
    for key in ("experience", "projects"):
        for sent in _split_sentences(sec.get(key, "")):
            if skill in find_skills(sent):
                return "evidenced", sent[:220]
    if skill in find_skills(sec.get("skills", "")):
        return "stated", None
    if len(recognized) < 2:  # sections weren't detected: can't tell where it appears, so don't penalise
        return "stated", None
    return "needs_verification", None


def _coverage(skills: list[str], resume: ParsedResume, req: str) -> tuple[float | None, list[SkillFinding]]:
    findings = []
    for s in skills:
        status, ev = classify_skill(s, resume)
        findings.append(SkillFinding(skill=s, requirement=req, status=status, evidence=ev))  # type: ignore[arg-type]
    if not skills:
        return None, findings
    return sum(EVIDENCE_CREDIT[f.status] for f in findings) / len(skills), findings


def compute_match(resume_text: str, resume: ParsedResume, job_text: str, job: JobAnalysis, settings: Settings) -> MatchResult:
    notes: list[str] = []
    required, preferred = list(job.required_skills), list(job.preferred_skills)
    scored_mentioned = False
    if not required and not preferred and job.mentioned_skills:
        # No labelled structure at all: treat mentioned skills as required, flagged as low confidence.
        required, scored_mentioned = list(job.mentioned_skills), True
        notes.append("The posting has no labelled Requirements section, so every skill mentioned was treated as required. Edit the requirements for a more accurate score.")

    req_cov, req_f = _coverage(required, resume, "required")
    pref_cov, pref_f = _coverage(preferred, resume, "preferred")
    findings = req_f + pref_f
    if not scored_mentioned:
        for s in job.mentioned_skills:
            status, ev = classify_skill(s, resume)
            findings.append(SkillFinding(skill=s, requirement="mentioned", status=status, evidence=ev))  # type: ignore[arg-type]
        if job.mentioned_skills:
            notes.append("Skills only mentioned in responsibilities/other text are shown but not scored.")

    sem_val, sem_method, sem_notes = semantic_similarity(resume_text, job_text, settings)
    notes += sem_notes

    # Experience
    exp_val, exp_detail = None, "The posting states no minimum experience."
    if job.min_years_experience is not None:
        if resume.years_experience is None:
            exp_detail = f"Posting asks for {job.min_years_experience:g}+ years, but your experience dates couldn't be parsed."
        else:
            exp_val = min(1.0, resume.years_experience / job.min_years_experience) if job.min_years_experience > 0 else 1.0
            exp_detail = f"Posting asks for {job.min_years_experience:g}+ years; your resume shows about {resume.years_experience:g}. {resume.years_note}"
    # Education
    edu_val, edu_detail = None, "The posting states no specific degree level."
    if job.education_level:
        if resume.education_level is None:
            edu_detail = f"Posting asks for a {job.education_level}'s-level qualification; one couldn't be detected on your resume."
        else:
            gap = EDU_RANK[job.education_level] - EDU_RANK[resume.education_level]
            edu_val = 1.0 if gap <= 0 else (0.5 if gap == 1 else 0.0)
            edu_detail = f"Posting asks for {job.education_level}; resume shows {resume.education_level} (degrees in progress count if listed)."

    def detail_cov(label: str, val, items):
        if val is None:
            return f"No {label} skills were identified in the posting."
        return f"{sum(1 for f in items if f.status != 'absent')}/{len(items)} {label} skills appear on your resume; credit is weighted by how well each is evidenced."

    raw = {
        "required_skills": (req_cov, detail_cov("required", req_cov, req_f)),
        "preferred_skills": (pref_cov, detail_cov("preferred", pref_cov, pref_f)),
        "semantic": (sem_val, f"Overall wording overlap between resume and posting ({sem_method})."),
        "experience": (exp_val, exp_detail), "education": (edu_val, edu_detail),
    }
    weights = {k: float(settings.score_weights.get(k, 0)) for k in raw}
    assessable_total = sum(w for k, w in weights.items() if raw[k][0] is not None)
    components = []
    for k, (val, detail) in raw.items():
        ok = val is not None and assessable_total > 0
        components.append(ScoreComponent(key=k, label=LABELS[k], weight=weights[k], effective_weight=round(weights[k] / assessable_total, 4) if ok else 0.0,
                                         value=None if val is None else round(val, 3), assessable=ok, detail=detail))
    score = round(100 * sum(c.effective_weight * (c.value or 0) for c in components), 1)

    strengths, concerns, actions = [], [], []
    ev = [f for f in findings if f.status == "evidenced" and f.requirement != "mentioned"]
    if ev:
        strengths.append(f"{len(ev)} job skill(s) are backed by experience or project text: {', '.join(f.skill for f in ev[:6])}.")
    for f in findings:
        if f.requirement == "mentioned":
            continue
        if f.status == "absent" and f.requirement == "required":
            concerns.append(f"'{f.skill}' is required but doesn't appear on your resume.")
            actions.append(f"If you genuinely have {f.skill} experience, add it where truthful. If not, treat it as a learning goal rather than adding it.")
        elif f.status == "stated" and f.requirement == "required":
            actions.append(f"'{f.skill}' is only listed in a skills section. If you've used it in a project or job, add a bullet showing how.")
        elif f.status == "needs_verification":
            actions.append(f"'{f.skill}' appears outside your skills/experience/projects sections; confirm it's represented accurately.")
    if exp_val is not None and exp_val < 1:
        concerns.append(f"Your resume shows less experience than the stated {job.min_years_experience:g}+ years.")
    if job.injection_suspected:
        concerns.append("The job text contains instruction-like phrases aimed at AI tools. They were ignored; treat this posting with caution.")
    if job.classification_confidence == "low":
        notes.append("Requirement classification confidence is low; review the extracted requirements.")
    notes.append("Weights are configurable starting assumptions, not validated against real hiring outcomes.")
    return MatchResult(score=score, components=components, skill_findings=findings, strengths=strengths, concerns=concerns,
                       recommended_actions=actions[:10], semantic_method=sem_method, notes=notes)
