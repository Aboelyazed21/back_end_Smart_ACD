from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.main import app

TOKEN = os.environ.get("ENGINE_SERVICE_TOKEN", "test-engine-token-0123456789abcdef")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

from .conftest import all_offerings, attempt, student, term  # noqa: E402


def client() -> TestClient:
    return TestClient(app)


def test_health_is_public():
    response = client().get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["regulation_loaded"] is True
    assert body["policy_chunks"] > 0


def test_engine_requires_service_token():
    response = client().post("/engine/standing", json={})
    assert response.status_code == 401
    assert "detail" in response.json()


def test_engine_rejects_wrong_token():
    response = client().post("/engine/standing", headers={"Authorization": "Bearer wrong"}, json={})
    assert response.status_code == 401


def test_eligibility_endpoint():
    payload = {
        "student": student(
            program="CS",
            level=3,
            cgpa=2.6,
            completed=[attempt("MTH1201", 3, 70, "C")],
        ).model_dump(),
        "course_code": "CSC3101",
        "term": term().model_dump(),
        "offerings": [o.model_dump() for o in all_offerings()],
        "planned_credits": 12,
    }
    response = client().post("/engine/eligibility", headers=HEADERS, json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["decision"]["status"] == "ELIGIBLE"
    assert body["decision"]["article"]
    assert body["load_decision"]["status"]


def test_bulk_eligibility_endpoint():
    payload = {
        "student": student(
            program="CS",
            level=3,
            cgpa=2.6,
            completed=[attempt("MTH1201", 3, 70, "C")],
        ).model_dump(),
        "course_codes": ["CSC3101", "CSC3102"],
        "term": term().model_dump(),
        "offerings": [o.model_dump() for o in all_offerings()],
        "planned_credits": 12,
    }
    response = client().post("/engine/eligibility/bulk", headers=HEADERS, json=payload)
    assert response.status_code == 200
    assert len(response.json()["decisions"]) == 2


def test_plan_endpoint_returns_draft():
    payload = {
        "student": student(program="CS", level=1, cgpa=None, first_semester_non_transfer=True).model_dump(),
        "term": term().model_dump(),
        "offerings": [o.model_dump() for o in all_offerings()],
    }
    response = client().post("/engine/plan", headers=HEADERS, json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "DRAFT"
    assert body["advisory_only"] is True
    assert all(i["decision"]["status"] == "ELIGIBLE" for i in body["items"])


def test_gpa_simulate_endpoint():
    payload = {
        "student": student(
            program="CS",
            completed=[attempt("CSC3101", 3, 80, "B"), attempt("CSC3102", 3, 70, "C")],
        ).model_dump(),
        "term": term().model_dump(),
        "simulated": [attempt("CSC3103", 3, 92, "A").model_dump()],
    }
    response = client().post("/engine/gpa/simulate", headers=HEADERS, json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["projected"]["cgpa"] > body["current"]["cgpa"]
    assert body["repeat_cap_pct"] == 83


def test_standing_endpoint():
    payload = {"student": student(cgpa=1.5, regular_semesters_completed=3).model_dump(), "term": term().model_dump()}
    response = client().post("/engine/standing", headers=HEADERS, json=payload)
    assert response.status_code == 200
    assert response.json()["probation"] is True


def test_graduation_audit_endpoint():
    payload = {"student": student(program="CS", cgpa=1.8, level=3).model_dump(), "term": term().model_dump()}
    response = client().post("/engine/graduation-audit", headers=HEADERS, json=payload)
    assert response.status_code == 200
    assert response.json()["eligible_to_graduate"] is False


def test_whatif_endpoint():
    payload = {"student": student(program="CS").model_dump(), "target_program": "IT"}
    response = client().post("/engine/whatif", headers=HEADERS, json=payload)
    assert response.status_code == 200
    assert response.json()["decision"]["status"] == "REVIEW_REQUIRED"


def test_early_warning_endpoint():
    payload = {"student": student(cgpa=1.4, regular_semesters_completed=9).model_dump(), "term": term().model_dump()}
    response = client().post("/engine/early-warning", headers=HEADERS, json=payload)
    assert response.status_code == 200
    assert response.json()["risk_level"] in {"MEDIUM", "HIGH"}


def test_rag_endpoint_schema():
    response = client().post(
        "/engine/rag/ask", headers=HEADERS, json={"question": "ما هي شروط التخرج؟", "language": "ar"}
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) >= {"answer", "citations", "confidence", "escalate", "flags"}
    assert body["citations"] or body["escalate"]


def test_validation_rejects_unknown_fields():
    response = client().post(
        "/engine/rag/ask",
        headers=HEADERS,
        json={"question": "ما شروط التخرج؟", "role": "admin"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_validation_rejects_bad_course_code():
    payload = {
        "student": student().model_dump(),
        "course_code": "DROP TABLE",
        "term": term().model_dump(),
        "offerings": [],
    }
    response = client().post("/engine/eligibility", headers=HEADERS, json=payload)
    assert response.status_code == 422
