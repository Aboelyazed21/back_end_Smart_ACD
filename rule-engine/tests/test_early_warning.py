from __future__ import annotations

from app.rules import early_warning

from .conftest import attempt, student, term


def test_early_warning_low_risk(data):
    s = student(cgpa=3.2, regular_semesters_completed=3)
    report = early_warning.early_warning(data, s, term())
    assert report["risk_level"] == "LOW"


def test_early_warning_high_risk(data):
    s = student(
        cgpa=1.4,
        regular_semesters_completed=10,
        consecutive_warnings=2,
        warning_no=2,
        attendance_pct=60,
        completed=[
            attempt("CSC3101", 3, 40, "F", status="failed"),
            attempt("CSC3102", 3, 35, "F", status="failed"),
            attempt("CSC3103", 3, 30, "F", status="failed"),
        ],
        semesters=[{"sgpa": 2.0}, {"sgpa": 1.4}],
    )
    report = early_warning.early_warning(data, s, term())
    assert report["risk_level"] == "HIGH"
    codes = {i["code"] for i in report["indicators"]}
    assert "CGPA_BELOW_2" in codes
    assert "ATTENDANCE_BELOW_75" in codes
    assert "FAILED_COURSES" in codes
    assert "SGPA_DECLINING" in codes
    assert report["advisory_only"] is True
