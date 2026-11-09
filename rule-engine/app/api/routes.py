from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from .. import ENGINE_VERSION
from ..config import get_settings
from ..data import get_data
from ..planner.planner import generate_plan
from ..rag.answer import answer_question
from ..rag.store import store
from ..rules import early_warning, eligibility, grades, graduation, load, standing
from ..schemas import (
    BulkEligibilityRequest,
    EarlyWarningRequest,
    EligibilityRequest,
    GpaSimulateRequest,
    GraduationRequest,
    PlanRequest,
    RagAnswer,
    RagAskRequest,
    StandingRequest,
    WhatIfRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _verify_signature(request: Request, body: bytes, timestamp: str | None, signature: str | None) -> None:
    secret = get_settings().hmac_secret
    if not secret:
        return
    if not timestamp or not signature:
        raise HTTPException(status_code=401, detail="missing request signature")
    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="invalid signature timestamp") from exc
    if abs(time.time() - ts) > 300:
        raise HTTPException(status_code=401, detail="stale signature")
    expected = hmac.new(
        secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="invalid signature")


async def require_service_token(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    x_service_token: Annotated[str | None, Header()] = None,
    x_engine_timestamp: Annotated[str | None, Header()] = None,
    x_engine_signature: Annotated[str | None, Header()] = None,
) -> None:
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_service_token:
        token = x_service_token.strip()
    expected = get_settings().service_token
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="invalid service token")
    body = await request.body()
    _verify_signature(request, body, x_engine_timestamp, x_engine_signature)


ServiceAuth = Annotated[None, Depends(require_service_token)]


def _decision(decision, course_code: str | None = None) -> dict[str, Any]:
    payload = decision.to_dict()
    if course_code:
        payload["course_code"] = course_code
    return payload


@router.get("/health")
def health() -> dict[str, Any]:
    data = get_data()
    db_ok = False
    if get_settings().database_url:
        try:
            from ..rag.store import PolicyStore

            with PolicyStore()._connect() as conn:  # noqa: SLF001 - health probe
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            db_ok = True
        except Exception:
            db_ok = False
    return {
        "status": "ok",
        "engine_version": ENGINE_VERSION,
        "regulation_loaded": bool(data.courses),
        "policy_chunks": store.chunk_count,
        "database": db_ok,
    }


@router.post("/engine/eligibility", dependencies=[Depends(require_service_token)])
def eligibility_endpoint(payload: EligibilityRequest) -> dict[str, Any]:
    data = get_data()
    result = eligibility.check_eligibility(
        data,
        payload.student,
        payload.course_code,
        payload.term,
        payload.offerings,
        planned_credits=payload.planned_credits,
        resolved_anomalies=payload.resolved_anomaly_ids,
        graduation_possible=payload.graduation_possible,
    )
    planned = payload.planned_credits
    if planned is None:
        planned = sum(a.credits for a in payload.student.current)
    load_decision = load.evaluate_load(
        data,
        payload.student,
        payload.term,
        planned,
        graduation_possible=payload.graduation_possible,
        resolved_anomalies=payload.resolved_anomaly_ids,
    )
    return {
        "decision": _decision(result, payload.course_code),
        "load_decision": load_decision.to_dict(),
    }


@router.post("/engine/eligibility/bulk", dependencies=[Depends(require_service_token)])
def bulk_eligibility_endpoint(payload: BulkEligibilityRequest) -> dict[str, Any]:
    data = get_data()
    decisions = eligibility.check_many(
        data,
        payload.student,
        payload.course_codes,
        payload.term,
        payload.offerings,
        planned_credits=payload.planned_credits,
        resolved_anomalies=payload.resolved_anomaly_ids,
        graduation_possible=payload.graduation_possible,
    )
    planned = payload.planned_credits
    if planned is None:
        planned = sum(a.credits for a in payload.student.current)
    load_decision = load.evaluate_load(
        data,
        payload.student,
        payload.term,
        planned,
        graduation_possible=payload.graduation_possible,
        resolved_anomalies=payload.resolved_anomaly_ids,
    )
    return {
        "decisions": [
            _decision(decision, code)
            for decision, code in zip(decisions, payload.course_codes, strict=False)
        ],
        "planned_credits": planned,
        "load_decision": load_decision.to_dict(),
    }


@router.post("/engine/plan", dependencies=[Depends(require_service_token)])
def plan_endpoint(payload: PlanRequest) -> dict[str, Any]:
    data = get_data()
    return generate_plan(data, payload)


@router.post("/engine/gpa/simulate", dependencies=[Depends(require_service_token)])
def gpa_simulate_endpoint(payload: GpaSimulateRequest) -> dict[str, Any]:
    data = get_data()
    current = grades.compute_gpa(data, payload.student.completed, payload.student.current)
    simulated = list(payload.simulated)
    combined = list(payload.student.completed) + list(payload.student.current) + simulated
    projected = grades.compute_gpa(data, combined, simulated)
    return {
        "current": current,
        "projected": projected,
        "simulated_courses": len(simulated),
        "repeat_cap_pct": data.gpa.get("repeat_cap_pct", 83),
        "target_reachable": (
            None
            if payload.future_cgpa_target is None
            else projected["cgpa"] >= payload.future_cgpa_target
        ),
        "advisory_only": True,
    }


@router.post("/engine/standing", dependencies=[Depends(require_service_token)])
def standing_endpoint(payload: StandingRequest) -> dict[str, Any]:
    return standing.evaluate_standing(get_data(), payload.student, payload.term)


@router.post("/engine/graduation-audit", dependencies=[Depends(require_service_token)])
def graduation_endpoint(payload: GraduationRequest) -> dict[str, Any]:
    return graduation.audit_graduation(get_data(), payload.student, payload.term)


@router.post("/engine/whatif", dependencies=[Depends(require_service_token)])
def whatif_endpoint(payload: WhatIfRequest) -> dict[str, Any]:
    return graduation.what_if_major_switch(get_data(), payload.student, payload.target_program)


@router.post("/engine/early-warning", dependencies=[Depends(require_service_token)])
def early_warning_endpoint(payload: EarlyWarningRequest) -> dict[str, Any]:
    return early_warning.early_warning(get_data(), payload.student, payload.term)


@router.post("/engine/rag/ask", response_model=RagAnswer, dependencies=[Depends(require_service_token)])
def rag_endpoint(payload: RagAskRequest) -> dict[str, Any]:
    data = get_data()
    result = answer_question(data, payload.question, payload.language)
    return RagAnswer(**result).model_dump()
