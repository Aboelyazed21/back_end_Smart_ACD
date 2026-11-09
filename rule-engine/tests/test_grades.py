from __future__ import annotations

from app.rules import grades

from .conftest import attempt


def test_sgpa_golden_value(data):
    attempts = [
        attempt("CSC3101", 3, 92, "A"),
        attempt("CSC3102", 3, 80, "B"),
        attempt("MTH1101", 2, 50, "D-"),
    ]
    result = grades.compute_gpa(data, attempts, attempts)
    assert result["quality_points"] == 22.1
    assert result["total_credits"] == 8
    assert result["sgpa"] == 2.76
    assert result["cgpa"] == 2.76


def test_grade_boundaries(data):
    cases = [
        (96, "A+", 4.0),
        (95.99, "A", 3.7),
        (92, "A", 3.7),
        (88, "A-", 3.4),
        (84, "B+", 3.2),
        (80, "B", 3.0),
        (76, "B-", 2.8),
        (72, "C+", 2.6),
        (68, "C", 2.4),
        (64, "C-", 2.2),
        (60, "D+", 2.0),
        (55, "D", 1.5),
        (50, "D-", 1.0),
        (49.99, "F", 0.0),
    ]
    for pct, letter, points in cases:
        assert grades.letter_for_percentage(pct) == letter
        assert grades.points_for_letter(letter) == points


def test_absent_counts_as_f(data):
    absent = attempt("CSC3101", 3, 0, "Abs", status="absent")
    result = grades.compute_gpa(data, [absent])
    assert result["cgpa"] == 0.0
    assert result["total_credits"] == 3


def test_withdrawn_and_incomplete_excluded(data):
    attempts = [
        attempt("CSC3101", 3, 80, "B"),
        attempt("CSC3102", 3, 0, "W", status="withdrawn"),
        attempt("CSC3103", 3, 0, "I", status="incomplete"),
        attempt("CSC3104", 3, 0, "Con", status="continued"),
    ]
    result = grades.compute_gpa(data, attempts)
    assert result["total_credits"] == 3
    assert result["cgpa"] == 3.0


def test_repeat_cap_failed_then_91(data):
    failed = attempt("CSB1201", 3, 45, "F", status="failed", attempt_no=1)
    repeated = attempt("CSB1201", 3, 91, "A-", status="passed", attempt_no=2, is_repeat=True)
    result = grades.compute_gpa(data, [failed, repeated])
    # Recorded as 83% = B = 3.00, credits counted once.
    assert result["total_credits"] == 3
    assert result["cgpa"] == 3.0
    assert result["repeat_cap_applied"] == ["CSB1201"]
    assert grades.apply_repeat_cap(repeated)["letter"] == "B"
    assert grades.apply_repeat_cap(repeated)["points"] == 3.0


def test_improvement_repeat_cap_without_flag_uses_attempt_no(data):
    repeated = attempt("CSC3101", 3, 95, "A", attempt_no=2)
    assert grades.apply_repeat_cap(repeated)["percentage"] == 83


def test_round_half_up():
    assert grades.round_half_up(2.7625, 2) == 2.76
    assert grades.round_half_up(2.765, 2) == 2.77
    assert grades.round_half_up(2.755, 2) == 2.76


def test_classification(data):
    labels = {}
    for cgpa in [0.5, 1.5, 2.2, 2.7, 3.2, 3.9]:
        idx, _ = grades.classify_cgpa(data, cgpa)
        labels[cgpa] = idx
    assert labels == {0.5: 0, 1.5: 1, 2.2: 2, 2.7: 3, 3.2: 4, 3.9: 5}
