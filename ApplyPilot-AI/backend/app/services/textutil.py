import re
import unicodedata

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def normalize_text(text: str, max_chars: int = 200_000) -> str:
    """Strip control chars, normalise unicode/whitespace. Untrusted input: never interpreted, only stored/analysed."""
    text = unicodedata.normalize("NFKC", text or "")
    text = _CTRL.sub("", text).replace("\r\n", "\n").replace("\r", "\n").replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:max_chars]


INJECTION_PATTERNS = [
    r"ignore (?:all |any )?(?:the )?(?:previous|prior|above) (?:instructions|prompts?)",
    r"disregard (?:all |any )?(?:the )?(?:previous|prior|above)",
    r"you are now\b", r"system prompt", r"reveal your (?:instructions|prompt)",
    r"(?:score|rate) (?:this|the) (?:candidate|resume) (?:as )?(?:100|10/10|perfect)",
    r"<\s*/?\s*(?:system|assistant)\s*>",
]
_INJ = re.compile("|".join(INJECTION_PATTERNS), re.I)


def looks_like_prompt_injection(text: str) -> bool:
    return bool(_INJ.search(text or ""))
