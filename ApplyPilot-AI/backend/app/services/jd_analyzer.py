"""Deterministic job-description analyzer. Treats the JD as untrusted data: it is only pattern-matched, never executed."""
import re

from app.schemas.analysis import JobAnalysis
from app.services.resume_parser import EDU_RANK, detect_education_level
from app.services.skills import find_skills, find_soft_skills
from app.services.textutil import looks_like_prompt_injection

_SECTION_HEADS = {
    "required": r"(?:minimum |basic |key |required |mandatory )?(?:requirements?|qualifications?)(?: \(required\))?|what you(?:'ll| will)? (?:need|bring)|what we(?:'re| are) looking for|must[- ]haves?|you have|who you are|skills required|required skills|your profile|about you",
    "preferred": r"(?:preferred|desired|additional|bonus) (?:qualifications?|skills?|experience)|nice[- ]to[- ]haves?|good[- ]to[- ]haves?|bonus(?: points)?|preferred|a plus|pluses|desirable",
    "responsibilities": r"(?:key |core )?responsibilit(?:y|ies)|what you(?:'ll| will) (?:do|work on)|the role|your role|duties|day[- ]to[- ]day|your impact|the job",
    "other": r"about (?:us|the company|the team)|benefits|perks|what we offer|why join us|compensation|who we are|our (?:culture|mission|values)|equal opportunity|how to apply",
}
_HEAD_RX = {k: re.compile(rf"^\s*(?:{v})\s*:?\s*$", re.I) for k, v in _SECTION_HEADS.items()}
_PREF_CUE = re.compile(r"nice[- ]to[- ]have|preferred|bonus|a plus|good to have|desirable|advantageous|ideally|is a plus|would be a plus|not required", re.I)
_REQ_CUE = re.compile(r"\brequired?\b|must[- ]have|\bmust\b|minimum|essential|mandatory|\bproficien|strong (?:knowledge|experience|understanding)", re.I)

_YEARS = re.compile(r"(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*)?(?:\+\s*)?years?(?:'| of)?\s*(?:of\s+)?(?:relevant\s+|professional\s+|hands[- ]on\s+|industry\s+|work\s+)?(?:experience|exp)", re.I)
_EDU_LINE = re.compile(r"\bdegree\b|bachelor|master|b\.?\s?tech|m\.?\s?tech|\bbca\b|\bmca\b|\bb\.?\s?sc\b|\bm\.?\s?sc\b|ph\.?\s?d|diploma|\bb\.?e\b|computer science", re.I)
_CERT = re.compile(r"\b(AWS Certified[\w\s-]{0,40}|Azure (?:Fundamentals|Administrator|Developer|Data)[\w\s-]{0,30}|Google Cloud (?:Certified|Professional)[\w\s-]{0,30}|CISSP|PMP|CKA|CKAD|Scrum Master|CompTIA [\w+]+|Security\+)", re.I)
_BULLET = re.compile(r"^\s*(?:[-•*·▪●◦–]|\d+[.)])\s*")


def _lines(text: str) -> list[str]:
    return [l.strip() for l in text.split("\n") if l.strip()]


def _dedupe(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def analyze_job(description: str) -> JobAnalysis:
    required: list[str] = []
    preferred: list[str] = []
    mentioned: list[str] = []
    responsibilities: list[str] = []
    edu_lines: list[str] = []
    years_candidates: list[float] = []
    ambiguities: list[str] = []
    explicit_structure = False
    section = "unknown"

    for raw in _lines(description):
        stripped = _BULLET.sub("", raw).strip(" :")
        head = next((k for k, rx in _HEAD_RX.items() if len(stripped) <= 50 and rx.match(stripped)), None)
        if head:
            section = head
            if head in ("required", "preferred"):
                explicit_structure = True
            continue
        skills = find_skills(raw)
        # Inline cue on the line itself beats the surrounding section.
        if _PREF_CUE.search(raw):
            kind = "preferred"
        elif _REQ_CUE.search(raw) and section != "other":
            kind = "required"
        else:
            kind = section
        if kind == "required":
            required += skills
            explicit_structure = True if skills else explicit_structure
        elif kind == "preferred":
            preferred += skills
            explicit_structure = True if skills else explicit_structure
        else:
            mentioned += skills
        if section == "responsibilities" and (_BULLET.match(raw) or len(raw) > 25):
            responsibilities.append(stripped[:300])
        if section != "other":
            for m in _YEARS.finditer(raw):
                lo = float(m.group(1))
                if not _PREF_CUE.search(raw):
                    years_candidates.append(lo)
            if _EDU_LINE.search(raw) and (section in ("required", "unknown") or _REQ_CUE.search(raw)):
                edu_lines.append(stripped[:300])

    required = _dedupe(required)
    preferred = [s for s in _dedupe(preferred) if s not in required]
    mentioned = [s for s in _dedupe(mentioned) if s not in required and s not in preferred]

    # Education: lowest degree level mentioned in requirement lines ("Bachelor's or Master's" -> bachelor).
    levels = [lv for lv in (detect_education_level(l) for l in edu_lines) if lv]
    edu_level = min(levels, key=lambda lv: EDU_RANK[lv]) if levels else None
    if any(re.search(r"or equivalent|equivalent (?:practical )?experience", l, re.I) for l in edu_lines):
        ambiguities.append("The posting accepts equivalent experience in place of a degree; education alignment may not apply.")

    if not required and not preferred and mentioned:
        ambiguities.append("No clearly labelled Requirements/Preferred sections were found, so skills are listed as 'mentioned'. Review and edit them for accuracy.")
    if not (required or preferred or mentioned):
        ambiguities.append("No recognised skills were found in this description. It may be very short, or use skills outside the built-in taxonomy.")
    if len(years_candidates) > 1 and len(set(years_candidates)) > 1:
        ambiguities.append(f"Multiple experience figures appear ({', '.join(str(int(y)) for y in sorted(set(years_candidates)))} years); the lowest was used.")
    if len(description) < 300:
        ambiguities.append("The description is short; extraction may be incomplete.")

    certs = _dedupe(m.group(1).strip() for m in _CERT.finditer(description))
    return JobAnalysis(
        required_skills=required, preferred_skills=preferred, mentioned_skills=mentioned,
        classification_confidence="high" if explicit_structure and required else "low",
        min_years_experience=min(years_candidates) if years_candidates else None,
        education_level=edu_level, education_text="; ".join(edu_lines[:2]),
        responsibilities=responsibilities[:12], soft_skills=find_soft_skills(description), certifications=certs[:6],
        ambiguities=ambiguities, injection_suspected=looks_like_prompt_injection(description),
    )
