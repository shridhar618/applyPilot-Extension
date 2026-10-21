from app.core.config import Settings
from app.schemas.analysis import JobAnalysis
from app.services.jd_analyzer import analyze_job
from app.services.matcher import compute_match, lexical_similarity
from app.services.resume_parser import parse_resume
from tests.conftest import JOB_TEXT, RESUME_TEXT

S = Settings(env="test")


def _score(resume_text, job: JobAnalysis, job_text="Data engineer role"):
    return compute_match(resume_text, parse_resume(resume_text), job_text, job, S)


def comp(res, key):
    return next(c for c in res.components if c.key == key)


def test_unassessable_components_are_excluded_not_penalised():
    job = JobAnalysis(required_skills=["Python"], classification_confidence="high")  # no experience/education/preferred stated
    res = _score(RESUME_TEXT, job)
    for key in ("preferred_skills", "experience", "education"):
        assert comp(res, key).assessable is False and comp(res, key).effective_weight == 0
    assert abs(sum(c.effective_weight for c in res.components) - 1.0) < 1e-3
    assert comp(res, "required_skills").effective_weight + comp(res, "semantic").effective_weight == 1.0


def test_evidence_levels_are_distinguished():
    job = JobAnalysis(required_skills=["Python", "SQL", "Kafka", "AWS"], classification_confidence="high")
    status = {f.skill: f.status for f in _score(RESUME_TEXT, job).skill_findings}
    assert status == {"Python": "evidenced", "SQL": "stated", "Kafka": "stated", "AWS": "absent"}


def test_skill_outside_skills_experience_projects_needs_verification():
    text = "Jane\nSUMMARY\nI enjoy Terraform and tinkering.\nSKILLS\nPython\nEXPERIENCE\nDev, Acme Jan 2020 - Dec 2021\nWrote Python services.\n"
    job = JobAnalysis(required_skills=["Terraform"], classification_confidence="high")
    assert _score(text, job).skill_findings[0].status == "needs_verification"


def test_unsectioned_resume_is_not_penalised_for_unknown_placement():
    text = "Jane Doe. I know Python and SQL and have built dashboards for a few clients over several years of freelance work."
    job = JobAnalysis(required_skills=["Python"], classification_confidence="high")
    assert _score(text, job).skill_findings[0].status == "stated"


def test_experience_alignment_math():
    job = JobAnalysis(required_skills=["Python"], min_years_experience=4, classification_confidence="high")
    text = "Jane\nSKILLS\nPython\nEXPERIENCE\nDev Jan 2023 - Dec 2024\nWrote Python code.\nEDUCATION\nBCA 2019 - 2022\n"
    assert comp(_score(text, job), "experience").value == 0.5  # 2 of 4 years


def test_fresher_with_no_experience_section_scores_zero_years_not_unknown():
    job = JobAnalysis(required_skills=["Python"], min_years_experience=2, classification_confidence="high")
    text = "Jane\nSKILLS\nPython\nEDUCATION\nBCA 2019 - 2022\nPROJECTS\nPython scraper\n"
    c = comp(_score(text, job), "experience")
    assert c.assessable and c.value == 0.0


def test_unparseable_experience_dates_are_not_assessable():
    job = JobAnalysis(required_skills=["Python"], min_years_experience=2, classification_confidence="high")
    text = "Jane\nSKILLS\nPython\nEXPERIENCE\nWorked at Acme for a long time doing Python things.\n"
    assert comp(_score(text, job), "experience").assessable is False


def test_education_gap_scoring():
    job = JobAnalysis(required_skills=["Python"], education_level="master", classification_confidence="high")
    text = "Jane\nSKILLS\nPython\nEDUCATION\nB.Tech in CS 2018 - 2022\n"
    assert comp(_score(text, job), "education").value == 0.5
    job.education_level = "phd"
    assert comp(_score(text, job), "education").value == 0.0


def test_custom_weights_are_respected():
    job = analyze_job(JOB_TEXT)
    heavy = Settings(env="test", score_weights={"required_skills": 1.0, "preferred_skills": 0, "semantic": 0, "experience": 0, "education": 0})
    res = compute_match(RESUME_TEXT, parse_resume(RESUME_TEXT), JOB_TEXT, job, heavy)
    assert res.score == round(100 * comp(res, "required_skills").value, 1)


def test_better_resume_scores_higher_and_score_is_deterministic():
    job = analyze_job(JOB_TEXT)
    weak = "Sam\nSKILLS\nPhotoshop\nEXPERIENCE\nBarista Jan 2020 - Dec 2022\nServed coffee.\n"
    a = _score(RESUME_TEXT, job, JOB_TEXT).score
    assert a > _score(weak, job, JOB_TEXT).score
    assert a == _score(RESUME_TEXT, job, JOB_TEXT).score


def test_no_labelled_sections_flags_low_confidence():
    job = analyze_job("We use Python, SQL and Docker every day on our platform team working with data engineers on many projects across the company.")
    assert job.classification_confidence == "low" and not job.required_skills
    res = _score(RESUME_TEXT, job)
    assert any("no labelled Requirements" in n for n in res.notes)


def test_lexical_similarity_bounds():
    assert lexical_similarity("python sql docker", "python sql docker") > 0.99
    assert lexical_similarity("python sql", "baking bread flour") == 0
    assert lexical_similarity("", "x") == 0
