from tests.conftest import JOB_TEXT, make_job, manual_resume


def _create(client, h, **job_kw):
    job = make_job(client, h, **job_kw)
    r = client.post("/api/v1/applications", headers=h, json={"job_id": job["id"]})
    assert r.status_code == 201, r.text
    return r.json()


def test_application_lifecycle_persists(client, user_a):
    a = _create(client, user_a)
    assert a["status"] == "saved" and a["job"]["title"] == "Data Engineer Intern"
    r = client.patch(f"/api/v1/applications/{a['id']}", headers=user_a, json={"status": "applied", "notes": "Referred by Sam", "next_action": "Follow up"})
    assert r.json()["status"] == "applied" and r.json()["applied_on"] is not None
    got = client.get(f"/api/v1/applications/{a['id']}", headers=user_a).json()  # re-read from DB
    assert got["notes"] == "Referred by Sam" and got["next_action"] == "Follow up"
    assert client.delete(f"/api/v1/applications/{a['id']}", headers=user_a).status_code == 204
    assert client.get(f"/api/v1/applications/{a['id']}", headers=user_a).status_code == 404


def test_duplicate_application_rejected(client, user_a):
    a = _create(client, user_a)
    r = client.post("/api/v1/applications", headers=user_a, json={"job_id": a["job"]["id"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_application"


def test_invalid_status_rejected(client, user_a):
    a = _create(client, user_a)
    assert client.patch(f"/api/v1/applications/{a['id']}", headers=user_a, json={"status": "hired!!"}).status_code == 422
    assert client.get("/api/v1/applications?status=bogus", headers=user_a).status_code == 422


def test_filter_search_sort(client, user_a):
    a1 = _create(client, user_a, title="Backend Engineer", company="Alpha", url="https://x.example/1")
    a2 = _create(client, user_a, title="ML Engineer", company="Beta_Co", url="https://x.example/2")
    client.patch(f"/api/v1/applications/{a2['id']}", headers=user_a, json={"status": "interview"})
    assert [i["id"] for i in client.get("/api/v1/applications?status=interview", headers=user_a).json()["items"]] == [a2["id"]]
    assert [i["id"] for i in client.get("/api/v1/applications?q=alpha", headers=user_a).json()["items"]] == [a1["id"]]
    assert client.get("/api/v1/applications?q=%25", headers=user_a).json()["total"] == 0  # '%' is literal, not a wildcard
    assert client.get("/api/v1/applications?q=beta_co", headers=user_a).json()["total"] == 1
    asc = client.get("/api/v1/applications?sort=created_at&order=asc", headers=user_a).json()["items"]
    assert [i["id"] for i in asc] == [a1["id"], a2["id"]]


def test_cross_user_isolation(client, user_a, user_b):
    a = _create(client, user_a)
    jid = a["job"]["id"]
    assert client.get(f"/api/v1/applications/{a['id']}", headers=user_b).status_code == 404
    assert client.patch(f"/api/v1/applications/{a['id']}", headers=user_b, json={"status": "offer"}).status_code == 404
    assert client.delete(f"/api/v1/applications/{a['id']}", headers=user_b).status_code == 404
    assert client.post("/api/v1/applications", headers=user_b, json={"job_id": jid}).status_code == 404  # can't track A's job
    assert client.get("/api/v1/applications", headers=user_b).json()["total"] == 0
    assert client.get(f"/api/v1/applications/{a['id']}", headers=user_a).json()["status"] == "saved"


def test_cannot_attach_another_users_resume(client, user_a, user_b):
    rb = manual_resume(client, user_b)
    job = make_job(client, user_a)
    assert client.post("/api/v1/applications", headers=user_a, json={"job_id": job["id"], "resume_id": rb["id"]}).status_code == 404
    a = _create(client, user_a, url="https://x.example/9")
    assert client.patch(f"/api/v1/applications/{a['id']}", headers=user_a, json={"resume_id": rb["id"]}).status_code == 404


def test_csv_export_neutralises_formulas(client, user_a):
    a = _create(client, user_a, title="=HYPERLINK(\"http://evil\",\"x\")", company="Acme")
    client.patch(f"/api/v1/applications/{a['id']}", headers=user_a, json={"notes": "+cmd|' /C calc'!A0"})
    r = client.get("/api/v1/applications/export.csv", headers=user_a)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    body = r.text
    assert "'=HYPERLINK" in body and "\n=HYPERLINK" not in body and ",+cmd" not in body and "'+cmd" in body


def test_deleting_resume_keeps_application(client, user_a):
    resume, job = manual_resume(client, user_a), make_job(client, user_a)
    a = client.post("/api/v1/applications", headers=user_a, json={"job_id": job["id"], "resume_id": resume["id"]}).json()
    client.delete(f"/api/v1/resumes/{resume['id']}", headers=user_a)
    assert client.get(f"/api/v1/applications/{a['id']}", headers=user_a).json()["resume_id"] is None
