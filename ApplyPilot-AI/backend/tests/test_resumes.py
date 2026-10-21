import io
import zipfile

from app.core.config import get_settings
from tests.conftest import RESUME_TEXT, make_docx, make_pdf, manual_resume, upload


def test_upload_pdf_parses_sections_and_skills(client, user_a):
    r = upload(client, user_a, make_pdf(), "My CV.pdf")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_default"] is True and body["has_file"] is True
    assert {"skills", "experience", "education", "projects"} <= set(body["parsed"]["sections"])
    assert {"Python", "SQL", "Docker", "FastAPI"} <= set(body["parsed"]["skills_found"])
    assert body["parsed"]["education_level"] == "master"
    assert body["parsed"]["contact"]["email"] == "asha@example.com"


def test_upload_docx(client, user_a):
    r = upload(client, user_a, make_docx(), "cv.docx")
    assert r.status_code == 201 and "Python" in r.json()["parsed"]["skills_found"]


def test_rejects_wrong_extension(client, user_a):
    r = upload(client, user_a, b"hello world", "cv.exe")
    assert r.status_code == 415 and r.json()["error"]["code"] == "unsupported_type"


def test_rejects_pdf_extension_with_other_content(client, user_a):
    r = upload(client, user_a, b"MZ\x90\x00 definitely not a pdf" * 10, "cv.pdf")
    assert r.status_code == 415 and r.json()["error"]["code"] == "content_mismatch"


def test_rejects_fake_docx_zip(client, user_a):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("hello.txt", "hi")
    r = upload(client, user_a, buf.getvalue(), "cv.docx")
    assert r.status_code == 415


def test_rejects_empty_and_oversize(client, user_a, monkeypatch):
    assert upload(client, user_a, b"", "cv.pdf").status_code == 400
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 1000)
    r = upload(client, user_a, make_pdf(), "cv.pdf")
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large"


def test_rejects_image_only_pdf(client, user_a):
    import fitz
    doc = fitz.open()
    doc.new_page()
    r = upload(client, user_a, doc.tobytes(), "scan.pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "no_text"


def test_path_traversal_filename_is_harmless(client, user_a):
    r = upload(client, user_a, make_pdf(), "../../etc/passwd.pdf")
    assert r.status_code == 201
    assert r.json()["original_filename"] == "passwd.pdf"
    assert all(p.parent == get_settings().upload_dir for p in get_settings().upload_dir.glob("*"))


def test_default_resume_logic(client, user_a):
    a = manual_resume(client, user_a, name="First")
    b = manual_resume(client, user_a, name="Second")
    assert a["is_default"] is True and b["is_default"] is False
    client.patch(f"/api/v1/resumes/{b['id']}", headers=user_a, json={"is_default": True})
    items = client.get("/api/v1/resumes", headers=user_a).json()["items"]
    assert [i["name"] for i in items if i["is_default"]] == ["Second"]
    client.delete(f"/api/v1/resumes/{b['id']}", headers=user_a)
    items = client.get("/api/v1/resumes", headers=user_a).json()["items"]
    assert len(items) == 1 and items[0]["is_default"] is True  # default falls back to the remaining resume


def test_manual_text_correction_reparses(client, user_a):
    r = manual_resume(client, user_a, text=RESUME_TEXT.replace("Kafka", "Redis"))
    assert "Kafka" not in r["parsed"]["skills_found"]
    r2 = client.patch(f"/api/v1/resumes/{r['id']}", headers=user_a, json={"text": RESUME_TEXT}).json()
    assert "Kafka" in r2["parsed"]["skills_found"]


def test_download_original_file_only(client, user_a):
    r = upload(client, user_a, make_pdf(), "cv.pdf").json()
    d = client.get(f"/api/v1/resumes/{r['id']}/download", headers=user_a)
    assert d.status_code == 200 and d.content.startswith(b"%PDF") and d.headers["x-content-type-options"] == "nosniff"
    m = manual_resume(client, user_a)
    assert client.get(f"/api/v1/resumes/{m['id']}/download", headers=user_a).status_code == 404


def test_cross_user_access_is_blocked_everywhere(client, user_a, user_b):
    r = upload(client, user_a, make_pdf(), "cv.pdf").json()
    rid = r["id"]
    assert client.get(f"/api/v1/resumes/{rid}", headers=user_b).status_code == 404
    assert client.patch(f"/api/v1/resumes/{rid}", headers=user_b, json={"name": "hacked"}).status_code == 404
    assert client.get(f"/api/v1/resumes/{rid}/download", headers=user_b).status_code == 404
    assert client.delete(f"/api/v1/resumes/{rid}", headers=user_b).status_code == 404
    assert client.get("/api/v1/resumes", headers=user_b).json()["total"] == 0
    assert client.get(f"/api/v1/resumes/{rid}", headers=user_a).status_code == 200  # still intact


def test_pagination(client, user_a):
    for i in range(5):
        manual_resume(client, user_a, name=f"R{i}")
    page = client.get("/api/v1/resumes?limit=2&offset=2", headers=user_a).json()
    assert page["total"] == 5 and len(page["items"]) == 2 and page["limit"] == 2 and page["offset"] == 2
    assert client.get("/api/v1/resumes?limit=1000", headers=user_a).status_code == 422
