from __future__ import annotations

from collections.abc import Iterable

from ..data import Anomaly, Course, RegulationData
from ..decisions import Decision, eligible, not_eligible, review_required, unknown
from ..schemas import Offering, StudentRecord, Term
from . import levels, load

FIELD_TRAINING_RULE = ("13", "10")
PROJECT_RULE = ("13", "10")
CATALOG_RULE = ("24", "22")
OFFERING_RULE = ("9", "8")


def _effective_level(data: RegulationData, student: StudentRecord) -> int:
    if student.level:
        return student.level
    return int(levels.level_for_credits(data, student.effective_passed_credits())["level"])


def _improvement_allowed(data: RegulationData, student: StudentRecord, course: Course) -> tuple[bool, str]:
    level = _effective_level(data, student)
    if student.cgpa is None:
        return False, "R-REPEAT-16.6"
    if student.cgpa < 2.0:
        allowed = course.level_hint in {level, max(1, level - 1)}
        return allowed, "R-REPEAT-16.14"
    return student.improvement_courses_count < 3 and course.level_hint <= level, "R-REPEAT-16.15"


def _blocking(course: Course, data: RegulationData, resolved: set[str]) -> list[Anomaly]:
    codes = [course.code, *course.prereq_codes]
    return data.blocking_anomalies(codes, resolved)


def _mention(anomalies: list[Anomaly]) -> str:
    return ", ".join(f"{a.id} ({a.title_ar})" for a in anomalies)


def check_eligibility(
    data: RegulationData,
    student: StudentRecord,
    course_code: str,
    term: Term,
    offerings: Iterable[Offering] = (),
    planned_credits: int | None = None,
    resolved_anomalies: Iterable[str] = (),
    graduation_possible: bool = False,
) -> Decision:
    """Eligibility pipeline, stopping at the first non-ELIGIBLE result."""
    resolved = set(resolved_anomalies)
    offering_map = {o.code: o for o in offerings}
    course = data.courses.get(course_code)

    # (a) course exists, is active and has a viable offering
    if course is None:
        if course_code in {"MTH1108"}:
            anomaly = data.anomaly("A-REG-07")
            return unknown(
                "Math-2 / remedial course has no catalog code in the bylaws (open blocking anomaly A-REG-07).",
                "مقرر رياضيات 2 / الدراسات التمهيدية بدون كود في الكتالوج (عيب مانع A-REG-07).",
                "R-ADM-REMEDIAL",
                anomaly.article if anomaly else "5",
                anomaly.page if anomaly else "5",
                anomaly_ids=["A-REG-07"],
                details={"missing_code": course_code, "escalate": True},
            )
        return unknown(
            f"Course {course_code} does not exist in the AIDM catalog.",
            f"المقرر {course_code} غير موجود في كتالوج كلية الذكاء الاصطناعي وإدارة البيانات.",
            "R-CAT-EXISTS",
            CATALOG_RULE[0],
            CATALOG_RULE[1],
            details={"course_code": course_code},
        )
    offering = offering_map.get(course_code)
    if offering is None:
        return unknown(
            f"Course {course_code} is not offered in {term.season} {term.academic_year}.",
            f"المقرر {course_code} غير مطروح في {term.season} {term.academic_year}.",
            "R-REG-OFFER",
            OFFERING_RULE[0],
            OFFERING_RULE[1],
            details={"course_code": course_code, "escalate": False},
        )
    if not offering.active:
        return unknown(
            f"Course {course_code} has no active offering.",
            f"لا يوجد طرح فعّال للمقرر {course_code}.",
            "R-REG-OFFER",
            OFFERING_RULE[0],
            OFFERING_RULE[1],
            details={"course_code": course_code},
        )
    if offering.enrolled_count < int(data.min_students_to_open_course):
        return unknown(
            f"Course {course_code} has {offering.enrolled_count} students; a course opens only with at least 5.",
            f"عدد الطلاب في {course_code} هو {offering.enrolled_count}؛ لا يُفتح المقرر بأقل من 5 طلاب.",
            "R-REG-MIN-STUDENTS",
            "9",
            "8",
            details={"course_code": course_code, "enrolled_count": offering.enrolled_count},
        )

    # (b) open blocking anomaly on the course or a prerequisite
    blocking = _blocking(course, data, resolved)
    if blocking:
        first = blocking[0]
        rule_code = next(
            (r for r in first.affected_rules if r in data.rules), f"ANOMALY-{first.id}"
        )
        return review_required(
            f"Open blocking bylaw anomaly {_mention(blocking)} affects {course_code}; the engine cannot decide.",
            f"يوجد عيب مانع مفتوح في اللائحة {_mention(blocking)} يؤثر على {course_code}؛ لا يمكن للمحرك أن يقرر.",
            rule_code,
            first.article,
            first.page,
            anomaly_ids=[a.id for a in blocking],
            details={
                "course_code": course_code,
                "blocking_anomalies": [a.id for a in blocking],
                "escalate": True,
                "auto_escalation": True,
            },
        )

    passed = student.passed_codes()
    failed = student.failed_codes()
    all_attempts: dict[str, list] = {}
    for attempt in student.attempted():
        all_attempts.setdefault(attempt.code, []).append(attempt)

    # (c) already passed
    if course_code in passed:
        allowed, improvement_rule = _improvement_allowed(data, student, course)
        if allowed:
            rule = data.rule(improvement_rule, ("16", "15"))
            return eligible(
                "The course was already passed; this is a CGPA-improvement repeat. The recorded grade is capped at 83% (B, 3.00).",
                "المقرر ناجح بالفعل؛ هذه إعادة لتحسين المعدل التراكمي. تُسجَّل الدرجة بحد أقصى 83% (B، 3.00).",
                improvement_rule,
                rule.article,
                rule.page,
                anomaly_ids=[a.id for a in data.warning_anomalies([course_code], resolved)],
                flags=["IMPROVEMENT_REPEAT", "REPEAT_CAP_83"],
                details={"course_code": course_code, "repeat_cap_pct": data.gpa.get("repeat_cap_pct", 83)},
            )
        rule = data.rule("R-REPEAT-16.6", ("16", "14"))
        return not_eligible(
            f"Course {course_code} was already passed and no CGPA-improvement path applies.",
            f"المقرر {course_code} ناجح بالفعل ولا ينطبق مسار تحسين المعدل التراكمي.",
            "R-REPEAT-16.6",
            rule.article,
            rule.page,
            flags=["ALREADY_PASSED"],
            details={"course_code": course_code},
        )

    # (d) prerequisites must be passed
    missing: list[str] = []
    failed_prereqs: list[str] = []
    for prereq in course.prereq_codes:
        if prereq in passed:
            continue
        missing.append(prereq)
        if prereq in failed:
            failed_prereqs.append(prereq)
    if missing:
        graduation_related = bool(student.program and data.is_in_program(course_code, student.program))
        concurrent_codes = {a.code for a in student.current}
        concurrent_failed = [p for p in failed_prereqs if p in concurrent_codes]
        if concurrent_failed and graduation_related:
            rule = data.rule("R-REG-09.8", ("9", "9"))
            return review_required(
                f"Prerequisite(s) {', '.join(concurrent_failed)} are being taken concurrently and were failed while {course_code} affects graduation; the concurrent-prerequisite exception needs the advisor and college council.",
                f"المتطلب السابق {', '.join(concurrent_failed)} يُدرس حالياً ورسب فيه والمقرر {course_code} يؤثر على التخرج؛ استثناء التسجيل المتزامن يحتاج المرشد ومجلس الكلية.",
                "R-REG-09.8",
                rule.article,
                rule.page,
                details={
                    "course_code": course_code,
                    "missing_prerequisites": missing,
                    "concurrent_failed_prerequisites": concurrent_failed,
                    "escalate": True,
                },
            )
        rule = data.rule("R-REG-09.5", ("9", "8"))
        return not_eligible(
            f"Missing prerequisite(s): {', '.join(missing)}. A prerequisite must be passed before registration.",
            f"المتطلبات السابقة غير مكتملة: {', '.join(missing)}. يجب اجتياز المتطلب قبل التسجيل.",
            "R-REG-09.5",
            rule.article,
            rule.page,
            details={"course_code": course_code, "missing_prerequisites": missing},
        )

    # (e) minimum passed credit hours attached to the course
    if course.min_passed_credit_hours is not None:
        passed_credits = student.effective_passed_credits()
        if passed_credits < int(course.min_passed_credit_hours):
            if course.is_field_training:
                rule = data.rule("R-TRAIN-13", FIELD_TRAINING_RULE)
                return not_eligible(
                    f"Field training requires at least {course.min_passed_credit_hours} passed credits; the student has {passed_credits}.",
                    f"التدريب الميداني يتطلب اجتياز {course.min_passed_credit_hours} ساعة على الأقل؛ لدى الطالب {passed_credits} ساعة.",
                    "R-TRAIN-13",
                    rule.article,
                    rule.page,
                    details={
                        "course_code": course_code,
                        "passed_credits": passed_credits,
                        "required_credits": course.min_passed_credit_hours,
                    },
                )
            rule = data.rule("R-REG-09.5", ("9", "8"))
            return not_eligible(
                f"Course {course_code} requires {course.min_passed_credit_hours} passed credits; the student has {passed_credits}.",
                f"المقرر {course_code} يتطلب {course.min_passed_credit_hours} ساعة مجتازة؛ لدى الطالب {passed_credits} ساعة.",
                "R-REG-09.5",
                rule.article,
                rule.page,
                details={
                    "course_code": course_code,
                    "passed_credits": passed_credits,
                    "required_credits": course.min_passed_credit_hours,
                },
            )

    # (f) graduation project: 96 credits AND fall/spring only (A-REG-06 enforced as working value)
    if course.is_project:
        required = int(data.graduation_project.get("min_passed_credit_hours", 96))
        passed_credits = student.effective_passed_credits()
        if passed_credits < required:
            rule = data.rule("R-PROJECT-13.7", PROJECT_RULE)
            return not_eligible(
                f"Graduation project requires at least {required} passed credits (70%); the student has {passed_credits}.",
                f"مشروع التخرج يتطلب اجتياز {required} ساعة على الأقل (70%)؛ لدى الطالب {passed_credits} ساعة.",
                "R-PROJECT-13.7",
                rule.article,
                rule.page,
                anomaly_ids=["A-REG-06"],
                details={"course_code": course_code, "passed_credits": passed_credits, "required_credits": required},
            )
        if term.season not in (data.graduation_project.get("register_in") or ["fall", "spring"]):
            rule = data.rule("R-PROJECT-13.7", PROJECT_RULE)
            return not_eligible(
                "The graduation project may only be registered in fall or spring, not in the summer term.",
                "لا يُسجَّل مشروع التخرج إلا في الفصل الخريفي أو الربيعي، لا في الفصل الصيفي.",
                "R-PROJECT-13.7",
                rule.article,
                rule.page,
                anomaly_ids=["A-REG-06"],
                details={"course_code": course_code, "season": term.season},
            )

    # (g) summer term is restricted to the bylaw reasons and 9 credits
    if term.season == "summer":
        allowed_reasons: list[str] = []
        if course_code in failed:
            allowed_reasons.append("failed_course")
        already_passed = course_code in passed
        if already_passed:
            allowed, _ = _improvement_allowed(data, student, course)
            if allowed:
                allowed_reasons.append("raise_cgpa")
        if levels.would_promote(data, student.effective_passed_credits(), course.credits):
            allowed_reasons.append("level_promotion")
        remaining = student.remaining_credits
        if remaining is None:
            remaining = max(0, int(data.graduation.get("min_credits", 136)) - student.effective_passed_credits())
        if remaining <= course.credits or graduation_possible:
            allowed_reasons.append("finish_graduation")
        if not allowed_reasons:
            rule = data.rule("R-ACA-06.3", ("6", "6"))
            return not_eligible(
                "Summer registration is allowed only to repeat a failed course, raise CGPA, be promoted, or finish graduation.",
                "لا يُسمح بالتسجيل الصيفي إلا لإعادة مقرر رسب فيه الطالب أو رفع المعدل التراكمي أو الانتقال للمستوى الأعلى أو استكمال التخرج.",
                "R-ACA-06.3",
                rule.article,
                rule.page,
                details={"course_code": course_code, "season": "summer"},
            )
        if planned_credits is not None and planned_credits > int(data.load.get("summer_max", 9)):
            rule = data.rule("R-ACA-06.3", ("6", "6"))
            return not_eligible(
                f"Summer load may not exceed {data.load.get('summer_max', 9)} credits.",
                f"لا يجوز أن يتجاوز العبء الصيفي {data.load.get('summer_max', 9)} ساعات.",
                "R-ACA-06.3",
                rule.article,
                rule.page,
                details={"planned_credits": planned_credits},
            )
    else:
        allowed_reasons = ["regular_term"]

    # (h) program membership / valid elective pool
    if student.program and not data.is_in_program(course_code, student.program):
        return not_eligible(
            f"Course {course_code} is not part of the {student.program} program or a valid elective pool.",
            f"المقرر {course_code} ليس ضمن برنامج {student.program} ولا ضمن مجموعة اختيارية صالحة.",
            "R-REG-PROGRAM",
            "9",
            "8",
            details={"course_code": course_code, "program": student.program},
        )
    pool = data.pool_for_course(course_code, student.program) if student.program else None
    flags = [f"SUMMER_REASON_{r.upper()}" for r in allowed_reasons if r != "regular_term"]
    warning_anomalies = data.warning_anomalies([course_code, *course.prereq_codes], resolved)
    anomaly_ids = [a.id for a in warning_anomalies]

    # (i) load limit at plan level (hard maximum only; REVIEW is surfaced separately)
    if planned_credits is not None:
        limit, _, _ = load.max_load_for(data, student, term, graduation_possible)
        if planned_credits > limit:
            rule = data.rule("R-LOAD-MAX", ("8", "8"))
            return not_eligible(
                f"Adding this course makes the planned load {planned_credits} credits, above the {limit}-credit maximum.",
                f"إضافة هذا المقرر تجعل العبء المخطط {planned_credits} ساعة، أعلى من الحد الأقصى {limit} ساعة.",
                "R-LOAD-MAX",
                rule.article,
                rule.page,
                details={"planned_credits": planned_credits, "max_credits": limit},
            )

    rule = data.rule("R-REG-09.5", ("9", "8"))
    return eligible(
        f"Course {course_code} is available and all registration requirements are met.",
        f"المقرر {course_code} متاح وكل متطلبات التسجيل مستوفاة.",
        "R-REG-09.5",
        rule.article,
        rule.page,
        anomaly_ids=anomaly_ids,
        flags=flags,
        details={
            "course_code": course_code,
            "credits": course.credits,
            "elective_pool": pool,
            "warning_working_values": {
                a.id: a.working_value for a in warning_anomalies if a.working_value
            },
        },
    )


def check_many(
    data: RegulationData,
    student: StudentRecord,
    course_codes: Iterable[str],
    term: Term,
    offerings: Iterable[Offering] = (),
    planned_credits: int | None = None,
    resolved_anomalies: Iterable[str] = (),
    graduation_possible: bool = False,
) -> list[Decision]:
    offering_list = list(offerings)
    resolved = list(resolved_anomalies)
    return [
        check_eligibility(
            data,
            student,
            code,
            term,
            offering_list,
            planned_credits,
            resolved,
            graduation_possible,
        )
        for code in course_codes
    ]
