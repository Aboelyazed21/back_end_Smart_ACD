from __future__ import annotations

from typing import Any

from ..data import RegulationData
from ..decisions import eligible, not_eligible, review_required
from ..schemas import StudentRecord, Term
from . import grades


def _passed_credits(data: RegulationData, student: StudentRecord) -> int:
    return student.effective_passed_credits()


def audit_graduation(
    data: RegulationData, student: StudentRecord, term: Term
) -> dict[str, Any]:
    """Graduation audit: list every unmet requirement (Article 17)."""
    gpa = grades.compute_gpa(data, student.completed, student.current)
    cgpa = student.cgpa if student.cgpa is not None else gpa["cgpa"]
    passed = student.passed_codes()
    passed_credits = _passed_credits(data, student)
    required_credits = int(data.graduation.get("min_credits", 136))
    program = data.program(student.program)
    missing: list[dict[str, Any]] = []

    if passed_credits < required_credits:
        missing.append(
            {
                "requirement": "credit_hours",
                "required": required_credits,
                "actual": passed_credits,
                "remaining": required_credits - passed_credits,
                "rule_code": "R-GRAD-17",
                "article": "17",
                "page": "16",
                "message_en": f"{required_credits - passed_credits} credit hours remaining.",
                "message_ar": f"متبقٍ {required_credits - passed_credits} ساعة معتمدة.",
            }
        )
    if cgpa < float(data.graduation.get("min_cgpa", 2.0)):
        missing.append(
            {
                "requirement": "cgpa",
                "required": float(data.graduation.get("min_cgpa", 2.0)),
                "actual": cgpa,
                "rule_code": "R-GRAD-17",
                "article": "17",
                "page": "16",
                "message_en": "CGPA is below 2.00.",
                "message_ar": "المعدل التراكمي أقل من 2.00.",
            }
        )

    # Non-credit requirements (field training).
    field_code = program.get("field_training")
    if field_code and field_code not in passed:
        missing.append(
            {
                "requirement": "field_training",
                "course_code": field_code,
                "rule_code": "R-TRAIN-13",
                "article": "13",
                "page": "10",
                "message_en": "Field training (0 credits) has not been passed.",
                "message_ar": "لم يتم اجتياز التدريب الميداني (0 ساعة).",
            }
        )

    # Graduation project.
    projects = program.get("project") or []
    if projects and not all(code in passed for code in projects):
        missing.append(
            {
                "requirement": "graduation_project",
                "course_codes": [c for c in projects if c not in passed],
                "rule_code": "R-PROJECT-13.7",
                "article": "13",
                "page": "10",
                "message_en": "Graduation project requirements are not complete.",
                "message_ar": "متطلبات مشروع التخرج غير مكتملة.",
            }
        )

    # Elective pools.
    pool_status: list[dict[str, Any]] = []
    for pool_key, pool_code in data.pool_codes_for_program(student.program).items():
        pool = data.pool(pool_code)
        required = int(pool.get("credits_required", 0))
        completed = [c for c in (pool.get("courses") or []) if c in passed]
        earned = sum(data.courses[c].credits for c in completed if c in data.courses)
        mandatory = pool.get("mandatory") or []
        mandatory_missing = [c for c in mandatory if c not in passed]
        satisfied = earned >= required and not mandatory_missing
        pool_status.append(
            {
                "pool": pool_code,
                "required_credits": required,
                "earned_credits": earned,
                "satisfied": satisfied,
                "mandatory_missing": mandatory_missing,
            }
        )
        if not satisfied:
            anomaly = ["A-REG-05"] if pool_code == "UNIV_ELECTIVE" and mandatory_missing else []
            missing.append(
                {
                    "requirement": f"elective_pool:{pool_code}",
                    "required_credits": required,
                    "earned_credits": earned,
                    "rule_code": "R-GRAD-17",
                    "article": "17",
                    "page": "16",
                    "anomaly_ids": anomaly,
                    "message_en": f"Elective pool {pool_code} is not satisfied ({earned}/{required} credits).",
                    "message_ar": f"المجموعة الاختيارية {pool_code} غير مستوفاة ({earned}/{required} ساعة).",
                }
            )

    # Minimum regular semesters.
    min_semesters = int(data.graduation.get("min_regular_semesters", 6))
    if student.regular_semesters_completed < min_semesters:
        missing.append(
            {
                "requirement": "regular_semesters",
                "required": min_semesters,
                "actual": student.regular_semesters_completed,
                "rule_code": "R-GRAD-DURATION",
                "article": "6",
                "page": "6",
                "message_en": f"At least {min_semesters} regular semesters are required.",
                "message_ar": f"يلزم {min_semesters} فصول نظامية على الأقل.",
            }
        )

    if student.regular_semesters_completed > int(data.durations.get("max_regular_semesters", 16)):
        missing.append(
            {
                "requirement": "max_duration",
                "rule_code": "R-GRAD-DURATION",
                "article": "6",
                "page": "6",
                "message_en": "Maximum study duration (16 regular semesters) exceeded.",
                "message_ar": "تم تجاوز المدة القصوى للدراسة (16 فصلاً نظامياً).",
            }
        )

    eligible_to_graduate = len(missing) == 0
    honors_rule = data.rule("R-HONORS-16.4", ("16", "14"))
    failed_attempts = [a for a in student.completed if a.status in {"failed", "absent"}]
    honors = (
        eligible_to_graduate
        and cgpa >= float(data.honors.get("min_cgpa", 3.0))
        and student.regular_semesters_completed <= int(data.honors.get("max_regular_semesters", 8))
        and not failed_attempts
    )
    honors_decision = (
        eligible(
            "Honors requirements are met (CGPA >= 3.00, <= 8 regular semesters, no failure).",
            "تحققت متطلبات مرتبة الشرف (المعدل >= 3.00، <= 8 فصول نظامية، بلا رسوب).",
            "R-HONORS-16.4",
            honors_rule.article,
            honors_rule.page,
            anomaly_ids=["A-REG-04"],
            flags=["HONORS"],
        )
        if honors
        else not_eligible(
            "Honors requirements are not met.",
            "متطلبات مرتبة الشرف غير مستوفاة.",
            "R-HONORS-16.4",
            honors_rule.article,
            honors_rule.page,
            anomaly_ids=["A-REG-04"],
        )
    )

    decision = (
        eligible(
            "All graduation requirements are met.",
            "كل متطلبات التخرج مستوفاة.",
            "R-GRAD-17",
            "17",
            "16",
            anomaly_ids=["A-REG-03"],
        )
        if eligible_to_graduate
        else not_eligible(
            f"{len(missing)} graduation requirement(s) remain.",
            f"متبقٍ {len(missing)} من متطلبات التخرج.",
            "R-GRAD-17",
            "17",
            "16",
            anomaly_ids=["A-REG-03"],
            details={"missing_count": len(missing)},
        )
    )

    return {
        "student_id": student.id,
        "program": student.program,
        "term": term.model_dump(),
        "passed_credits": passed_credits,
        "required_credits": required_credits,
        "cgpa": cgpa,
        "eligible_to_graduate": eligible_to_graduate,
        "missing": missing,
        "elective_pools": pool_status,
        "honors": honors,
        "honors_decision": honors_decision.to_dict(),
        "decision": decision.to_dict(),
        "advisory_only": True,
    }


def what_if_major_switch(
    data: RegulationData, student: StudentRecord, target_program: str
) -> dict[str, Any]:
    """Only identical course codes are transferable; anything else needs review."""
    passed = student.passed_codes()
    target = data.program(target_program)
    target_codes: set[str] = set(data.common_compulsory) | set(target.get("compulsory") or [])
    target_codes |= set(target.get("labs") or []) | set(target.get("project") or [])
    if target.get("selected_topic"):
        target_codes.add(target["selected_topic"])
    if target.get("field_training"):
        target_codes.add(target["field_training"])
    for pool_code in data.pool_codes_for_program(target_program).values():
        target_codes |= set(data.pool(pool_code).get("courses") or [])

    current = data.program(student.program)
    current_codes: set[str] = set(data.common_compulsory) | set(current.get("compulsory") or [])
    current_codes |= set(current.get("labs") or []) | set(current.get("project") or [])

    equivalent = sorted(passed & target_codes)
    non_equivalent = sorted(passed - target_codes)
    remaining = sorted(target_codes - passed)
    decision = review_required(
        "Major switch: only identical course codes are treated as equivalent; all other courses need advisor/college review.",
        "تغيير التخصص: تُعادل المقررات المتطابقة الكود فقط؛ أي مقررات أخرى تحتاج مراجعة المرشد/الكلية.",
        "R-ADM-05.2",
        "5",
        "5",
        details={
            "target_program": target_program,
            "equivalent_codes": equivalent,
            "non_equivalent_codes": non_equivalent,
        },
        flags=["WHATIF_REVIEW"],
    )
    return {
        "student_id": student.id,
        "from_program": student.program,
        "target_program": target_program,
        "equivalent_codes": equivalent,
        "non_equivalent_codes": non_equivalent,
        "remaining_target_codes": remaining,
        "estimated_remaining_credits": sum(
            data.courses[c].credits for c in remaining if c in data.courses
        ),
        "decision": decision.to_dict(),
        "advisory_only": True,
    }
