from __future__ import annotations

from typing import Any

from ..data import RegulationData
from ..schemas import StudentRecord, Term
from . import grades, load, standing


def early_warning(
    data: RegulationData, student: StudentRecord, term: Term
) -> dict[str, Any]:
    """Explainable early-warning indicators; advisory only."""
    gpa = grades.compute_gpa(data, student.completed, student.current)
    cgpa = student.cgpa if student.cgpa is not None else gpa["cgpa"]
    passed_credits = student.effective_passed_credits()
    current_load = sum(a.credits for a in student.current)
    limit, load_flags, load_anomalies = load.max_load_for(data, student, term)
    failed = [a for a in student.completed if a.status in {"failed", "absent"}]
    failed_codes = sorted({a.code for a in failed})
    attendance = student.attendance_pct
    sgpas = [float(s.get("sgpa", 0)) for s in student.semesters if s.get("sgpa") is not None]
    declining = len(sgpas) >= 2 and sgpas[-1] < sgpas[-2]

    indicators: list[dict[str, Any]] = []
    risk_points = 0

    if cgpa < 2.0:
        risk_points += 35
        indicators.append(
            {
                "code": "CGPA_BELOW_2",
                "severity": "high",
                "message_en": f"CGPA {cgpa} is below 2.00.",
                "message_ar": f"المعدل التراكمي {cgpa} أقل من 2.00.",
                "rule_code": "R-PROB-16.5",
                "article": "16",
                "page": "14",
            }
        )
    if failed_codes:
        risk_points += min(25, 5 * len(failed_codes))
        indicators.append(
            {
                "code": "FAILED_COURSES",
                "severity": "high" if len(failed_codes) >= 3 else "medium",
                "message_en": f"{len(failed_codes)} failed course(s): {', '.join(failed_codes[:8])}.",
                "message_ar": f"عدد المقررات الراسب فيها {len(failed_codes)}: {', '.join(failed_codes[:8])}.",
                "rule_code": "R-REPEAT-16.6",
                "article": "16",
                "page": "14",
            }
        )
    if declining:
        risk_points += 15
        indicators.append(
            {
                "code": "SGPA_DECLINING",
                "severity": "medium",
                "message_en": f"SGPA declined from {sgpas[-2]} to {sgpas[-1]}.",
                "message_ar": f"انخفض المعدل الفصلي من {sgpas[-2]} إلى {sgpas[-1]}.",
                "rule_code": "R-GPA-16.2",
                "article": "16",
                "page": "13",
            }
        )
    if attendance is not None and attendance < int(data.attendance_min_pct):
        risk_points += 20
        indicators.append(
            {
                "code": "ATTENDANCE_BELOW_75",
                "severity": "high",
                "message_en": f"Attendance {attendance}% is below 75%; deprivation from the final exam is possible.",
                "message_ar": f"نسبة الحضور {attendance}% أقل من 75%؛ قد يُحرم الطالب من الامتحان النهائي.",
                "rule_code": "R-ATT-11",
                "article": "11",
                "page": "9",
            }
        )
    if student.consecutive_warnings >= 2 or student.warning_no >= 2:
        risk_points += 15
        indicators.append(
            {
                "code": "REPEATED_WARNINGS",
                "severity": "high",
                "message_en": "Two or more academic warnings; a third successive warning bars the student from the final exam.",
                "message_ar": "إنذاران أكاديميان أو أكثر؛ الإنذار الثالث المتتالي يحرم الطالب من الامتحان النهائي.",
                "rule_code": "R-ATT-11",
                "article": "11",
                "page": "9",
            }
        )
    if current_load > limit:
        risk_points += 10
        indicators.append(
            {
                "code": "LOAD_OVER_LIMIT",
                "severity": "medium",
                "message_en": f"Current load {current_load} exceeds the {limit}-credit cap.",
                "message_ar": f"العبء الحالي {current_load} يتجاوز الحد {limit} ساعة.",
                "rule_code": "R-LOAD-MAX",
                "article": "8",
                "page": "8",
                "anomaly_ids": load_anomalies,
            }
        )
    if student.regular_semesters_completed >= 12:
        risk_points += 10
        indicators.append(
            {
                "code": "NEAR_MAX_DURATION",
                "severity": "medium",
                "message_en": f"{student.regular_semesters_completed} regular semesters used of the 16 allowed.",
                "message_ar": f"استُهلك {student.regular_semesters_completed} فصلاً نظامياً من 16 مسموحاً.",
                "rule_code": "R-GRAD-DURATION",
                "article": "6",
                "page": "6",
            }
        )

    risk_points = min(100, risk_points)
    if risk_points >= 60:
        level = "HIGH"
    elif risk_points >= 30:
        level = "MEDIUM"
    else:
        level = "LOW"

    standing_report = standing.evaluate_standing(data, student, term)
    return {
        "student_id": student.id,
        "program": student.program,
        "term": term.model_dump(),
        "risk_level": level,
        "risk_score": risk_points,
        "cgpa": cgpa,
        "passed_credits": passed_credits,
        "failed_course_codes": failed_codes,
        "current_load": current_load,
        "max_load": limit,
        "indicators": indicators,
        "probation": standing_report["probation"],
        "dismissal_risk": standing_report["dismissal_risk"],
        "recommended_actions": [
            "ادفع الطالب لمراجعة المرشد الأكاديمي" if level != "LOW" else "متابعة دورية",
            "سجّل المقررات الراسب فيها أولاً" if failed_codes else "الالتزام بالخطة الموصى بها",
        ],
        "advisory_only": True,
    }
