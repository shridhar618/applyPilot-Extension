from pathlib import Path

from app.core.config import get_settings
from app.core.ratelimit import limiter
from tests.conftest import make_pdf, register, upload


def test_register_login_me(client):
    h = register(client)
    assert client.get("/api/v1/auth/me", headers=h).json()["email"] == "a@example.com"
    r = client.post("/api/v1/auth/login", json={"email": "A@Example.com", "password": "correct-horse-battery"})
    assert r.status_code == 200 and r.json()["access_token"]


def test_duplicate_email_conflict(client):
    register(client)
    r = client.post("/api/v1/auth/register", json={"email": "a@example.com", "password": "another-long-password"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


def test_weak_password_rejected_and_not_echoed(client):
    r = client.post("/api/v1/auth/register", json={"email": "x@example.com", "password": "short"})
    assert r.status_code == 422
    assert "short" not in r.text.replace("too short", "").replace("at least", "")  # submitted value not reflected
    assert r.json()["error"]["code"] == "validation_error"


def test_wrong_password_and_unknown_email_look_identical(client):
    register(client)
    a = client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "wrong-password-123"})
    b = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong-password-123"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_private_routes_require_valid_token(client):
    for path in ("/api/v1/auth/me", "/api/v1/resumes", "/api/v1/jobs", "/api/v1/applications", "/api/v1/matches"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_logout_revokes_existing_tokens(client, user_a):
    assert client.get("/api/v1/auth/me", headers=user_a).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=user_a).status_code == 204
    assert client.get("/api/v1/auth/me", headers=user_a).status_code == 401


def test_auth_rate_limit(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    monkeypatch.setattr(get_settings(), "auth_rate_limit_per_minute", 3)
    limiter.reset()
    codes = [client.post("/api/v1/auth/login", json={"email": "z@example.com", "password": "whatever-123"}).status_code for _ in range(5)]
    assert codes[:3] == [401, 401, 401] and codes[3:] == [429, 429]


def test_error_envelope_for_404(client, user_a):
    r = client.get("/api/v1/resumes/999", headers=user_a)
    assert r.status_code == 404 and set(r.json()["error"]) == {"code", "message", "details"}


def test_consent_toggle(client, user_a):
    assert client.get("/api/v1/auth/me", headers=user_a).json()["ai_consent"] is False
    r = client.patch("/api/v1/auth/me", headers=user_a, json={"ai_consent": True})
    assert r.json()["ai_consent"] is True


def test_delete_account_removes_everything(client, user_a, user_b):
    r = upload(client, user_a, make_pdf(), "cv.pdf")
    assert r.status_code == 201
    files_before = list(Path(get_settings().upload_dir).glob("*"))
    assert len(files_before) == 1
    # wrong password refused
    assert client.request("DELETE", "/api/v1/auth/me", headers=user_a, json={"password": "nope-nope-nope"}).status_code == 403
    assert client.request("DELETE", "/api/v1/auth/me", headers=user_a, json={"password": "correct-horse-battery"}).status_code == 204
    assert client.get("/api/v1/auth/me", headers=user_a).status_code == 401
    assert list(Path(get_settings().upload_dir).glob("*")) == []
    assert client.get("/api/v1/auth/me", headers=user_b).status_code == 200  # other accounts untouched
    assert client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "correct-horse-battery"}).status_code == 401


def test_data_export_contains_only_own_data(client, user_a, user_b):
    client.post("/api/v1/resumes/manual", headers=user_b, json={"name": "B-secret", "text": "x" * 80})
    client.post("/api/v1/resumes/manual", headers=user_a, json={"name": "A-resume", "text": "y" * 80})
    data = client.get("/api/v1/auth/me/export", headers=user_a).json()
    assert [r["name"] for r in data["resumes"]] == ["A-resume"]
    assert "B-secret" not in str(data)
