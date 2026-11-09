from __future__ import annotations

from app.rules import eligibility

from .conftest import all_offerings, attempt, passed_credits, student, term


def check(data, s, code, **kw):
    return eligibility.check_eligibility(
        data, s, code, kw.pop("term", term()), all_offerings(), **kw
    )


def test_prerequisite_failed_is_not_eligible(data):
    s = student(completed=[attempt("CSB1201", 3, 45, "F", status="failed")])
    d = check(data, s, "CSB2201")
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-REG-09.5"
    assert "CSB1201" in d.details["missing_prerequisites"]
    assert d.article and d.page


def test_prerequisite_passed_is_eligible(data):
    s = student(completed=[attempt("CSB1201", 3, 70, "C")])
    d = check(data, s, "CSB2201")
    assert d.status.value == "ELIGIBLE"


def test_concurrent_failed_prerequisite_review(data):
    s = student(
        completed=[attempt("CSB1201", 3, 45, "F", status="failed")],
        current=[attempt("CSB1201", 3, 45, "F", status="failed", attempt_no=2)],
    )
    d = check(data, s, "CSB2201")
    assert d.status.value == "REVIEW_REQUIRED"
    assert d.rule_code == "R-REG-09.8"


def test_field_training_67_not_eligible(data):
    s = student(program="CS", level=3, completed=passed_credits(67))
    d = check(data, s, "CSC3206")
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-TRAIN-13"
    assert d.article == "13"


def test_field_training_68_eligible(data):
    s = student(program="CS", level=3, completed=passed_credits(68))
    d = check(data, s, "CSC3206")
    assert d.status.value == "ELIGIBLE"


def test_graduation_project_95_not_eligible(data):
    s = student(program="CS", level=4, completed=passed_credits(92) + [attempt("CSB2105", 3)])
    assert s.effective_passed_credits() == 95
    d = check(data, s, "CSC4105")
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-PROJECT-13.7"
    assert "A-REG-06" in d.anomaly_ids


def test_graduation_project_96_with_prerequisite_eligible(data):
    s = student(program="CS", level=4, completed=passed_credits(93) + [attempt("CSB2105", 3)])
    assert s.effective_passed_credits() == 96
    d = check(data, s, "CSC4105")
    assert d.status.value == "ELIGIBLE"
    assert "A-REG-06" in d.anomaly_ids  # warning working value attached


def test_graduation_project_not_in_summer(data):
    s = student(program="CS", level=4, completed=passed_credits(93) + [attempt("CSB2105", 3)])
    d = check(data, s, "CSC4105", term=term("summer"))
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-PROJECT-13.7"


def test_dsc3102_blocking_anomaly_review(data):
    s = student(program="DS", level=3)
    d = check(data, s, "DSC3102")
    assert d.status.value == "REVIEW_REQUIRED"
    assert d.anomaly_ids == ("A-CAT-11",)
    assert d.details["escalate"] is True
    assert d.rule_code in data.rules or d.rule_code.startswith("ANOMALY-")


def test_missing_course_unknown(data):
    s = student()
    d = check(data, s, "ZZZ9999")
    assert d.status.value == "UNKNOWN"
    assert d.rule_code == "R-CAT-EXISTS"


def test_missing_math2_unknown_a_reg_07(data):
    s = student()
    d = check(data, s, "MTH1108")
    assert d.status.value == "UNKNOWN"
    assert d.anomaly_ids == ("A-REG-07",)


def test_offering_below_five_unknown(data):
    s = student()
    offerings = [o.model_copy(update={"enrolled_count": 4}) for o in all_offerings()]
    d = eligibility.check_eligibility(data, s, "CSC3101", term(), offerings)
    assert d.status.value == "UNKNOWN"
    assert d.rule_code == "R-REG-MIN-STUDENTS"


def test_inactive_offering_unknown(data):
    s = student()
    offerings = [o.model_copy(update={"active": False}) for o in all_offerings()]
    d = eligibility.check_eligibility(data, s, "CSC3101", term(), offerings)
    assert d.status.value == "UNKNOWN"


def test_already_passed_not_eligible(data):
    s = student(
        cgpa=2.50,
        improvement_courses_count=3,
        completed=[attempt("CSC3101", 3, 75, "C+")],
    )
    d = check(data, s, "CSC3101")
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-REPEAT-16.6"


def test_improvement_repeat_under_two_cgpa(data):
    s = student(cgpa=1.90, completed=[attempt("CSC3101", 3, 60, "D+")])
    d = check(data, s, "CSC3101")
    assert d.status.value == "ELIGIBLE"
    assert d.rule_code == "R-REPEAT-16.14"
    assert "REPEAT_CAP_83" in d.flags


def test_improvement_repeat_max_three_when_cgpa_above_two(data):
    s = student(cgpa=2.60, improvement_courses_count=3, completed=[attempt("CSC3101", 3, 60, "D+")])
    d = check(data, s, "CSC3101")
    assert d.status.value == "NOT_ELIGIBLE"


def test_program_membership_enforced(data):
    s = student(program="CS", completed=[attempt("CSB2101", 3)])
    d = check(data, s, "INF3101")
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-REG-PROGRAM"


def test_summer_restricted_reason(data):
    s = student(program="CS", level=3, cgpa=3.0)
    d = check(data, s, "UNI1103", term=term("summer"))
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-ACA-06.3"


def test_summer_failed_course_allowed(data):
    s = student(
        program="CS",
        level=3,
        cgpa=1.5,
        completed=[attempt("UNI1101", 1, 40, "F", status="failed")],
    )
    d = check(data, s, "UNI1101", term=term("summer"))
    assert d.status.value == "ELIGIBLE"
    assert "SUMMER_REASON_FAILED_COURSE" in d.flags


def test_warning_anomaly_attached(data):
    s = student(program="CS")
    d = check(data, s, "UNI1204")
    assert d.status.value == "ELIGIBLE"
    assert "A-REG-05" in d.anomaly_ids


def test_load_hard_cap_per_course(data):
    s = student(cgpa=1.5)
    d = check(data, s, "UNI1101", planned_credits=16)
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-LOAD-MAX"
