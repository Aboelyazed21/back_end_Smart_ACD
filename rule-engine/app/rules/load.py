from __future__ import annotations

from collections.abc import Iterable

from ..data import RegulationData
from ..decisions import Decision, Status, eligible, not_eligible, review_required
from ..schemas import StudentRecord, Term


def base_max_load(cgpa: float | None) -> int:
    """Article 8: maximum load from CGPA at semester start."""
    if cgpa is None:
        return 18
    if cgpa >= 3.0:
        return 21
    if cgpa >= 2.0:
        return 18
    if cgpa >= 1.0:
        return 15
    return 12


def max_load_for(
    data: RegulationData,
    student: StudentRecord,
    term: Term,
    graduation_possible: bool = False,
) -> tuple[int, list[str], list[str]]:
    """Return (max credits, flags, anomaly_ids) for the term.

    A-REG-01 / A-REG-02 / A-REG-09 are attached as flags; blocking conflicts
    are resolved at the decision layer with REVIEW_REQUIRED.
    """
    flags: list[str] = []
    anomaly_ids: list[str] = []
    if term.season == "summer":
        return int(data.load.get("summer_max", 9)), ["SUMMER_MAX_9"], []

    if student.first_semester_non_transfer and (student.cgpa is None or student.level == 1):
        limit = int(data.load.get("new_student_first_semester_max", 18))
        flags.append("FIRST_SEMESTER_MAX_18")
    else:
        limit = base_max_load(student.cgpa)
        if student.cgpa is not None and student.cgpa < 2.0:
            anomaly_ids.extend(["A-REG-01", "A-REG-02"])
            flags.append("PROBATION_LOAD_CONFLICT")
    if graduation_possible:
        limit = max(limit, int(data.load.get("graduation_possible_max", 21)))
        flags.append("GRADUATION_POSSIBLE_21")
        if any(a.is_open for a in data.anomalies_by_rule("R-LOAD-MAX")):
            anomaly_ids.append("A-REG-09")
    if student.previous_incomplete_courses:
        limit += int(data.load.get("extra_course_if_previous_incomplete", 1)) * 3
        flags.append("INCOMPLETE_EXTRA_COURSE")
    return limit, flags, anomaly_ids


def evaluate_load(
    data: RegulationData,
    student: StudentRecord,
    term: Term,
    planned_credits: int,
    graduation_possible: bool = False,
    resolved_anomalies: Iterable[str] = (),
) -> Decision:
    resolved = set(resolved_anomalies)
    limit, flags, anomaly_ids = max_load_for(data, student, term, graduation_possible)
    anomaly_ids = [a for a in anomaly_ids if a not in resolved]
    rule = data.rule("R-LOAD-MAX", ("8", "8"))
    min_rule = data.rule("R-LOAD-MIN", ("8", "8"))

    if term.season == "summer" and planned_credits > int(data.load.get("summer_max", 9)):
        return not_eligible(
            f"Summer load is {planned_credits} credits; the maximum is {data.load.get('summer_max', 9)}.",
            f"العبء الصيفي {planned_credits} ساعة والحد الأقصى {data.load.get('summer_max', 9)} ساعة.",
            "R-ACA-06.3",
            "6",
            "6",
            details={"planned_credits": planned_credits, "max_credits": limit},
        )

    if planned_credits > limit:
        return not_eligible(
            f"Planned load {planned_credits} credits exceeds the maximum {limit} for CGPA {student.cgpa}.",
            f"العبء المخطط {planned_credits} ساعة يتجاوز الحد الأقصى {limit} ساعة للمعدل التراكمي {student.cgpa}.",
            "R-LOAD-MAX",
            rule.article,
            rule.page,
            details={"planned_credits": planned_credits, "max_credits": limit},
        )

    remaining = student.remaining_credits
    if remaining is None:
        remaining = max(0, int(data.graduation.get("min_credits", 136)) - student.effective_passed_credits())
    min_waived = remaining < int(data.load.get("min_waived_if_remaining_credits_lt", 9))
    if planned_credits < int(data.load.get("min_regular", 9)) and not min_waived:
        return not_eligible(
            f"Regular load must be at least {data.load.get('min_regular', 9)} credits unless fewer than {data.load.get('min_waived_if_remaining_credits_lt', 9)} credits remain.",
            f"الحد الأدنى للعبء الدراسي {data.load.get('min_regular', 9)} ساعات إلا إذا تبقى أقل من {data.load.get('min_waived_if_remaining_credits_lt', 9)} ساعات للتخرج.",
            "R-LOAD-MIN",
            min_rule.article,
            min_rule.page,
            details={"planned_credits": planned_credits, "remaining_credits": remaining},
        )

    # Blocking conflicts A-REG-01 (min 9 vs 12) and A-REG-02 (max 15 vs 12).
    unresolved = {a for a in ("A-REG-01", "A-REG-02") if a not in resolved}
    if student.cgpa is not None and student.cgpa < 2.0:
        if 9 <= planned_credits <= 11 and "A-REG-01" in unresolved:
            anomaly = data.anomaly("A-REG-01")
            return review_required(
                "The bylaws conflict on the minimum load for a student on probation (9 vs 12 credits). An advisor must confirm the load.",
                "تعارض في اللائحة حول الحد الأدنى لعبء الطالب المنذر أكاديمياً (9 مقابل 12 ساعة). يجب أن يعتمد المرشد العبء.",
                "R-LOAD-MIN",
                anomaly.article if anomaly else "8",
                anomaly.page if anomaly else "8",
                anomaly_ids=["A-REG-01"],
                details={"planned_credits": planned_credits, "working_value": "advisor decision required"},
            )
        if 13 <= planned_credits <= 15 and "A-REG-02" in unresolved:
            anomaly = data.anomaly("A-REG-02")
            return review_required(
                "The bylaws conflict on the maximum load for a student on probation (15 vs 12 credits). The conservative draft is 12 credits.",
                "تعارض في اللائحة حول الحد الأقصى لعبء الطالب المنذر (15 مقابل 12 ساعة). المسودة المحافظة هي 12 ساعة.",
                "R-LOAD-MAX",
                anomaly.article if anomaly else "8",
                anomaly.page if anomaly else "8",
                anomaly_ids=["A-REG-02"],
                details={"planned_credits": planned_credits, "working_value": "draft at 12"},
            )
        if planned_credits == 12 and unresolved:
            return eligible(
                "Load 12 is the conservative working draft for a student on probation; both conflicting anomalies remain open and are flagged for advisor review.",
                "العبء 12 ساعة هو المسودة المحافظة للطالب المنذر؛ التعارضان ما زالا مفتوحين ومُعلّمان لمراجعة المرشد.",
                "R-LOAD-MAX",
                rule.article,
                rule.page,
                anomaly_ids=sorted(unresolved),
                flags=["CONSERVATIVE_DRAFT", *flags],
                details={"planned_credits": planned_credits, "max_credits": limit},
            )

    return eligible(
        f"Planned load {planned_credits} credits is within the {limit}-credit limit.",
        f"العبء المخطط {planned_credits} ساعة داخل الحد الأقصى {limit} ساعة.",
        "R-LOAD-MAX",
        rule.article,
        rule.page,
        anomaly_ids=anomaly_ids,
        flags=flags,
        details={"planned_credits": planned_credits, "max_credits": limit},
    )


def load_report(
    data: RegulationData, student: StudentRecord, term: Term, graduation_possible: bool = False
) -> dict:
    limit, flags, anomaly_ids = max_load_for(data, student, term, graduation_possible)
    return {
        "max_credits": limit,
        "flags": flags,
        "anomaly_ids": anomaly_ids,
        "status": Status.ELIGIBLE.value,
    }
