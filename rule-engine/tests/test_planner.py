from __future__ import annotations

from app.planner.planner import generate_plan
from app.schemas import PlanRequest

from .conftest import all_offerings, attempt, student, term


def test_plan_is_draft_and_only_eligible(data):
    s = student(program="CS", level=1, cgpa=None, first_semester_non_transfer=True, regular_semesters_completed=0)
    request = PlanRequest(student=s, term=term(), offerings=all_offerings())
    plan = generate_plan(data, request)
    assert plan["status"] == "DRAFT"
    assert plan["advisory_only"] is True
    assert plan["items"]
    for item in plan["items"]:
        assert item["decision"]["status"] == "ELIGIBLE"
        assert item["decision"]["rule_code"]
        assert item["decision"]["article"]
        assert item["decision"]["page"]
    assert plan["total_credits"] <= plan["max_credits"]


def test_plan_prioritises_failed_courses(data):
    s = student(
        program="CS",
        level=3,
        cgpa=2.2,
        completed=[
            attempt("CSC3101", 3, 40, "F", status="failed"),
            attempt("MTH1201", 3, 70, "C"),
            attempt("CSB1201", 3, 60, "D+"),
        ],
    )
    plan = generate_plan(data, PlanRequest(student=s, term=term(), offerings=all_offerings()))
    codes = [i["course_code"] for i in plan["items"]]
    assert "CSC3101" in codes
    first = plan["items"][0]
    assert first["source"] in {"failed_course", "REVIEW_PLACEHOLDER"} or first["priority"] == 1


def test_plan_never_exceeds_load(data):
    s = student(program="CS", level=2, cgpa=1.5, remaining_credits=60)
    plan = generate_plan(data, PlanRequest(student=s, term=term(), offerings=all_offerings()))
    assert plan["total_credits"] <= 12
    assert plan["total_credits"] <= plan["max_credits"]


def test_plan_never_exceeds_requested_cap(data):
    s = student(program="CS", level=2, cgpa=3.0)
    plan = generate_plan(
        data,
        PlanRequest(student=s, term=term(), offerings=all_offerings(), max_credits=15),
    )
    assert plan["total_credits"] <= 15
    assert plan["total_credits"] <= plan["max_credits"]


def test_plan_respects_timetable_conflicts(data):
    offerings = all_offerings()
    # Give every offering the same meeting time so only one can be scheduled.
    from app.schemas import MeetingTime

    conflict = MeetingTime(day="sun", start="09:00", end="10:30")
    offerings = [o.model_copy(update={"meeting_times": [conflict]}) for o in offerings]
    s = student(program="CS", level=3, cgpa=3.2)
    plan = generate_plan(data, PlanRequest(student=s, term=term(), offerings=offerings))
    assert len(plan["items"]) == 1
    assert any("TIMETABLE_CONFLICT" in e["flags"] for e in plan["excluded"])


def test_plan_exam_conflict(data):
    from app.schemas import ExamSlot

    offerings = all_offerings()
    exam = ExamSlot(date="2027-01-10", start="09:00", end="11:00")
    offerings = [o.model_copy(update={"exam": exam}) for o in offerings]
    s = student(program="CS", level=3, cgpa=3.2)
    plan = generate_plan(data, PlanRequest(student=s, term=term(), offerings=offerings))
    assert len(plan["items"]) == 1
    assert any("EXAM_CONFLICT" in e["flags"] for e in plan["excluded"])


def test_probation_plan_capped_at_12(data):
    s = student(program="CS", level=2, cgpa=1.95, remaining_credits=80)
    plan = generate_plan(data, PlanRequest(student=s, term=term(), offerings=all_offerings()))
    assert plan["max_credits"] == 12
    assert plan["total_credits"] <= 12
    assert plan["load_decision"]["status"] == "ELIGIBLE"
    assert "A-REG-01" in plan["load_decision"]["anomaly_ids"]
