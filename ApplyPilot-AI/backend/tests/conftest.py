import io
import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="applypilot-test-")
os.environ.update({"APPLYPILOT_ENV": "test", "APPLYPILOT_DATABASE_URL": "sqlite://", "APPLYPILOT_UPLOAD_DIR": os.path.join(_TMP, "up"),
                   "APPLYPILOT_RATE_LIMIT_ENABLED": "false", "APPLYPILOT_AI_PROVIDER": "none"})

import fitz  # noqa: E402
import pytest  # noqa: E402
from docx import Document  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.config import get_settings  # noqa: E402
from app.core.db import Base, get_db, make_engine  # noqa: E402
from app.core.ratelimit import limiter  # noqa: E402
from app.main import app  # noqa: E402

RESUME_TEXT = """Asha Rao
asha@example.com | +91 98765 43210 | github.com/asharao
SUMMARY
Final-year student interested in data engineering.
SKILLS
Python, SQL, Docker, Kafka
EXPERIENCE
Data Intern, Acme Corp  Jun 2024 - Aug 2024
Built ETL pipelines with Python and Airflow serving three analytics teams.
EDUCATION
MCA, PES University 2025 - 2027
PROJECTS
RAG chatbot using FastAPI and LangChain with PostgreSQL storage
"""

JOB_TEXT = """Data Engineer Intern
Responsibilities
- Build ETL pipelines using Spark and Airflow
Requirements
- Bachelor's degree in Computer Science
- 1+ years of experience with Python and SQL
- Familiarity with AWS
Nice to have
- Kafka, Docker
"""


@pytest.fixture()
def client():
    engine = make_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    limiter.reset()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()


def register(client, email="a@example.com", password="correct-horse-battery"):
    r = client.post("/api/v1/auth/register", json={"email": email, "password": password, "full_name": "Test"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def user_a(client):
    return register(client, "a@example.com")


@pytest.fixture()
def user_b(client):
    return register(client, "b@example.com")


def make_pdf(text: str = RESUME_TEXT) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    y = 60
    for line in text.split("\n"):
        page.insert_text((50, y), line, fontsize=10)
        y += 14
    out = doc.tobytes()
    doc.close()
    return out


def make_docx(text: str = RESUME_TEXT) -> bytes:
    d = Document()
    for line in text.split("\n"):
        d.add_paragraph(line)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def upload(client, headers, data: bytes, filename: str, name: str | None = None):
    return client.post("/api/v1/resumes", headers=headers, files={"file": (filename, data)}, data={"name": name} if name else {})


def manual_resume(client, headers, text=RESUME_TEXT, name="Main"):
    r = client.post("/api/v1/resumes/manual", headers=headers, json={"name": name, "text": text})
    assert r.status_code == 201, r.text
    return r.json()


def make_job(client, headers, text=JOB_TEXT, title="Data Engineer Intern", company="Acme", **kw):
    r = client.post("/api/v1/jobs", headers=headers, json={"title": title, "company": company, "description": text, **kw})
    assert r.status_code in (200, 201), r.text
    return r.json()
