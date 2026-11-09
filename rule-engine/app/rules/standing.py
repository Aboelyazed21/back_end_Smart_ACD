from __future__ import annotations

from typing import Any

from ..data import RegulationData
from ..decisions import eligible, not_eligible, review_required
from ..schemas import StudentRecord, Term
from . import grades, levels


def evaluate_standing(
    data: RegulationData, student: StudentRecord, term: Term
) -> dict[str, Any]:
    """Academic standing, probation and dismissal risk (Articles 16.5 and 21)."""
    gpa = grades.compute_gpa(data, student.completed, student.current)
    cgpa = student.cgpa if student.cgpa is not None else gpa["cgpa"]
    passed_credits = student.effective_passed_credits()
    level = levels.level_for_credits(data, passed_credits)
    probation_rule = data.rule("R-PROB-16.5", ("16", "14"))

    is_first = student.regular_semesters_completed == 0 or student.first_semester_non_transfer
    probation = cgpa < float(data.probation.get("cgpa_lt", 2.0)) and not is_first
    previous_consecutive = student.consecutive_warnings
    previous_total = student.total_warnings
    consecutive = previous_consecutive + 1 if probation else 0
    total = previous_total + 1 if probation else previous_total
    warning_no = student.warning_no + (1 if probation else 0)

    max_semesters = int(data.durations.get("max_regular_semesters", 16))
    duration_exceeded = (
        student.regular_semesters_completed > max_semesters
        and student.suspension_semesters < 0
    )
    dismissal_consecutive = int(data.durations.get("dismissal_consecutive_warnings", 4))
    dismissal_total = int(data.durations.get("dismissal_total_warnings", 6))
    dismissal_risk = (
        consecutive >= dismissal_consecutive
        or total >= dismissal_total
        or student.regular_semesters_completed > max_semesters
    )
    final_chance_credits = int(data.durations.get("final_chance_min_credits", 109))
    final_chance = passed_credits >= final_chance_credits

    suspension_ok = (
        student.suspension_semesters <= int(data.durations.get("suspension_max_total", 6))
    )
    graduation_possible = passed_credits >= int(data.graduation.get("min_credits", 136)) - 21

    if probation:
        decision = review_required(
            f"CGPA {cgpa} is below 2.00 after a semester; the student is on academic probation and must raise the CGPA.",
            f"المعدل التراكمي {cgpa} أقل من 2.00 بعد فصل دراسي؛ الطالب تحت الملاحظة الأكاديمية ويجب رفع المعدل.",
            "R-PROB-16.5",
            probation_rule.article,
            probation_rule.page,
            anomaly_ids=["A-REG-01", "A-REG-02"],
            details={
                "cgpa": cgpa,
                "consecutive_warnings": consecutive,
                "total_warnings": total,
                "dismissal_risk": dismissal_risk,
                "final_chance": final_chance,
            },
            flags=["ACADEMIC_PROBATION"],
        )
    else:
        decision = eligible(
            f"CGPA {cgpa} meets the 2.00 standing threshold.",
            f"المعدل التراكمي {cgpa} يستوفي حد 2.00 للموقف الأكاديمي.",
            "R-PROB-16.5",
            probation_rule.article,
            probation_rule.page,
            flags=["GOOD_STANDING"],
            details={"cgpa": cgpa, "consecutive_warnings": consecutive, "total_warnings": total},
        )

    dismissal_decision = None
    if dismissal_risk:
        rule = data.rule("R-DISMISS-21", ("21", "18"))
        dismissal_decision = review_required(
            "Dismissal risk: 4 consecutive warnings, 6 total warnings, or max duration exceeded; the college council must decide.",
            "خطر الفصل: 4 إنذارات متتالية أو 6 إنذارات إجمالية أو تجاوز المدة القصوى؛ القرار لمجلس الكلية.",
            "R-DISMISS-21",
            rule.article,
            rule.page,
            details={
                "consecutive_warnings": consecutive,
                "total_warnings": total,
                "regular_semesters_completed": student.regular_semesters_completed,
                "final_chance": final_chance,
            },
            flags=["DISMISSAL_RISK"],
        )
    if not suspension_ok:
        rule = data.rule("R-SUSP-14", ("14", "11"))
        suspension_decision = not_eligible(
            "Suspension exceeds the maximum of four consecutive or six total regular semesters.",
            "تجاوز الإيقاف الحد الأقصى أربعة فصول متتالية أو ستة فصول إجمالاً.",
            "R-SUSP-14",
            rule.article,
            rule.page,
            details={"suspension_semesters": student.suspension_semesters},
        )
    else:
        suspension_decision = eligible(
            "Suspension count is within the bylaw limits.",
            "عدد فصول الإيقاف داخل حدود اللائحة.",
            "R-SUSP-14",
            data.rule("R-SUSP-14", ("14", "11")).article,
            data.rule("R-SUSP-14", ("14", "11")).page,
            details={"suspension_semesters": student.suspension_semesters},
        )

    return {
        "student_id": student.id,
        "program": student.program,
        "term": term.model_dump(),
        "sgpa": gpa["sgpa"],
        "cgpa": cgpa,
        "passed_credits": passed_credits,
        "level": level["level"],
        "level_name": level["name"],
        "probation": probation,
        "warning_no": warning_no,
        "consecutive_warnings": consecutive,
        "total_warnings": total,
        "dismissal_risk": dismissal_risk,
        "final_chance": final_chance,
        "max_regular_semesters": max_semesters,
        "regular_semesters_completed": student.regular_semesters_completed,
        "graduation_possible_this_semester": graduation_possible,
        "classification": gpa["classification"],
        "classification_en": gpa["classification_en"],
        "decision": decision.to_dict(),
        "dismissal_decision": dismissal_decision.to_dict() if dismissal_decision else None,
        "suspension_decision": suspension_decision.to_dict(),
        "advisory_only": True,
    }
