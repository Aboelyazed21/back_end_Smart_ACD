from __future__ import annotations

from collections.abc import Iterable
from dataclasses import replace
from typing import Any

from ..data import RegulationData
from ..decisions import Decision
from ..rules import eligibility, load
from ..schemas import Offering, PlanItem, PlanRequest, StudentRecord, Term

MAX_EXCLUDED = 120


def _candidate_codes(data: RegulationData, program: str) -> list[str]:
    prog = data.program(program)
    codes: list[str] = []
    for group in ("compulsory", "labs", "project"):
        codes.extend(prog.get(group) or [])
    if prog.get("field_training"):
        codes.append(prog["field_training"])
    if prog.get("selected_topic"):
        codes.append(prog["selected_topic"])
    codes.extend(data.common_compulsory)
    for pool_code in data.pool_codes_for_program(program).values():
        codes.extend(data.pool(pool_code).get("courses") or [])
    seen: set[str] = set()
    out: list[str] = []
    for code in codes:
        if code in data.courses and code not in seen:
            seen.add(code)
            out.append(code)
    return out


def _downstream_counts(data: RegulationData, codes: Iterable[str]) -> dict[str, int]:
    reverse: dict[str, set[str]] = {}
    for course in data.courses.values():
        for prereq in course.prereq_codes:
            reverse.setdefault(prereq, set()).add(course.code)

    def count(code: str, seen: set[str]) -> int:
        total = 0
        for child in reverse.get(code, set()):
            if child in seen:
                continue
            seen.add(child)
            total += 1 + count(child, seen)
        return total

    return {code: count(code, set()) for code in codes}


def _slot_for(student: StudentRecord, term: Term, planning_slot: str | None) -> str:
    if planning_slot:
        return planning_slot
    level = student.level or 1
    return f"{level}-{1 if term.season in {'fall', 'summer'} else 2}"


def _slot_codes(data: RegulationData, program: str, slot: str) -> list[tuple[str, int]]:
    plans: dict[str, list[dict[str, Any]]] = {}
    plans.update(data.recommended_plans.get("COMMON") or {})
    plans.update(data.recommended_plans.get(program) or {})
    out: list[tuple[str, int]] = []
    for item in plans.get(slot) or []:
        if "course" in item:
            out.append((item["course"], int(data.courses[item["course"]].credits)))
        elif "elective_pool" in item:
            pool = data.pool(item["elective_pool"])
            for code in pool.get("courses") or []:
                if code in data.courses:
                    out.append((code, int(data.courses[code].credits)))
    return out


def _overlaps(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    return a_start < b_end and b_start < a_end


def _timetable_ok(selected: list[Offering], candidate: Offering) -> tuple[bool, str]:
    for existing in selected:
        for a in existing.meeting_times:
            for b in candidate.meeting_times:
                if a.day == b.day and _overlaps(a.start, a.end, b.start, b.end):
                    return False, "TIMETABLE_CONFLICT"
        if existing.exam and candidate.exam:
            if (
                existing.exam.date == candidate.exam.date
                and _overlaps(existing.exam.start, existing.exam.end, candidate.exam.start, candidate.exam.end)
            ):
                return False, "EXAM_CONFLICT"
    return True, ""


def _day_preference(selected: list[Offering], candidate: Offering, compress: bool) -> int:
    if not compress or not candidate.meeting_times:
        return 0
    used = {m.day for o in selected for m in o.meeting_times}
    new_days = {m.day for m in candidate.meeting_times} - used
    return len(new_days)


def generate_plan(data: RegulationData, request: PlanRequest) -> dict[str, Any]:
    """Advisory DRAFT plan. Non-ELIGIBLE courses are never included."""
    student = request.student
    term = request.term
    resolved = set(request.resolved_anomaly_ids)
    offerings = {o.code: o for o in request.offerings}
    limit, load_flags, load_anomalies = load.max_load_for(
        data, student, term, request.graduation_possible
    )
    cap = limit if request.max_credits is None else min(limit, request.max_credits)
    if student.cgpa is not None and student.cgpa < 2.0 and term.season != "summer":
        # A-REG-01/02 conservative working draft.
        cap = min(cap, 12)
        load_flags = [*load_flags, "CONSERVATIVE_DRAFT_12"]

    candidates = _candidate_codes(data, student.program)
    downstream = _downstream_counts(data, candidates)
    passed = student.passed_codes()
    failed = student.failed_codes()
    selected: list[PlanItem] = []
    selected_offerings: list[Offering] = []
    excluded: list[Decision] = []
    chosen: set[str] = set()
    total_credits = 0

    def try_add(code: str, priority: int, source: str, planned: int | None = None) -> bool:
        nonlocal total_credits
        if code in chosen or total_credits >= cap:
            return False
        course = data.courses.get(code)
        if not course:
            return False
        prospective = total_credits + course.credits
        # A plan must never exceed the resolved credit cap (requested, regulatory
        # or probationary). Skipping is preferable to an over-limit draft.
        if prospective > cap:
            return False
        offering = offerings.get(code)
        if offering is None:
            return False
        decision = eligibility.check_eligibility(
            data,
            student,
            code,
            term,
            request.offerings,
            planned_credits=prospective,
            resolved_anomalies=resolved,
            graduation_possible=request.graduation_possible,
        )
        if decision.status.value != "ELIGIBLE":
            if len(excluded) < MAX_EXCLUDED:
                excluded.append(replace(decision, details={**decision.details, "course_code": code}))
            return False
        ok, conflict = _timetable_ok(selected_offerings, offering)
        if not ok:
            if len(excluded) < MAX_EXCLUDED:
                excluded.append(
                    replace(
                        decision,
                        flags=(*decision.flags, conflict),
                        details={**decision.details, "course_code": code, "conflict": conflict},
                    )
                )
            return False
        selected.append(
            PlanItem(
                course_code=code,
                credits=course.credits,
                priority=priority,
                source=source,
                decision=decision.to_dict(),
                meeting_times=offering.meeting_times,
            )
        )
        selected_offerings.append(offering)
        chosen.add(code)
        total_credits += course.credits
        return True

    # (1) failed courses first.
    failed_sorted = sorted(
        [c for c in failed if c in candidates],
        key=lambda c: (data.courses[c].level_hint, -downstream.get(c, 0), c),
    )
    for code in failed_sorted:
        try_add(code, 1, "failed_course")

    # (2) critical prerequisite path (most downstream unlocks).
    critical = sorted(
        [c for c in candidates if c not in passed and c not in chosen],
        key=lambda c: (-downstream.get(c, 0), data.courses[c].level_hint, c),
    )
    for code in critical:
        if downstream.get(code, 0) <= 0:
            continue
        try_add(code, 2, "critical_path")

    # (3) recommended plan for the next level/term.
    slot = _slot_for(student, term, request.planning_slot)
    for code, _credits in _slot_codes(data, student.program, slot):
        try_add(code, 3, "recommended_plan")

    # (4) electives to fill pool credits (mandatory UNI1204 first for A-REG-05).
    for pool_key, pool_code in data.pool_codes_for_program(student.program).items():
        pool = data.pool(pool_code)
        required = int(pool.get("credits_required", 0))
        earned = sum(
            data.courses[c].credits
            for c in (pool.get("courses") or [])
            if c in passed and c in data.courses
        )
        mandatory = [c for c in (pool.get("mandatory") or []) if c not in passed]
        for code in mandatory:
            try_add(code, 4, f"elective:{pool_code}:mandatory")
        if earned >= required:
            continue
        pool_candidates = sorted(
            [c for c in (pool.get("courses") or []) if c in data.courses and c not in chosen],
            key=lambda c: (data.courses[c].level_hint, c),
        )
        for code in pool_candidates:
            if earned >= required:
                break
            if try_add(code, 4, f"elective:{pool_code}"):
                earned += data.courses[code].credits

    # (5) field-training window in summer.
    if term.season == "summer":
        ft = data.program(student.program).get("field_training")
        if ft:
            try_add(ft, 5, "field_training_summer")

    # Fill remaining capacity with any eligible program course, keeping the
    # recommended order and never breaking a prerequisite chain.
    if total_credits < cap:
        for code in critical:
            if total_credits >= cap:
                break
            try_add(code, 6, "fill")

    # Day compression: reorder display only (selection already conflict-free).
    if request.preferences.get("compress_days"):
        selected.sort(key=lambda item: (item.priority, len({m.day for m in item.meeting_times}), item.course_code))

    load_decision = load.evaluate_load(
        data,
        student,
        term,
        total_credits,
        graduation_possible=request.graduation_possible,
        resolved_anomalies=resolved,
    )

    return {
        "status": "DRAFT",
        "student_id": student.id,
        "program": student.program,
        "term": term.model_dump(),
        "total_credits": total_credits,
        "max_credits": cap,
        "items": [item.model_dump() for item in selected],
        "excluded": [d.to_dict() for d in excluded],
        "load_decision": load_decision.to_dict(),
        "load_flags": load_flags,
        "load_anomaly_ids": load_anomalies,
        "advisory_only": True,
        "engine_version": "1.0.0",
        "planning_slot": slot,
    }
