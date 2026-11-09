from __future__ import annotations

from app.rules import levels, load

from .conftest import student, term


def test_level_boundaries(data):
    assert levels.level_for_credits(data, 0)["level"] == 1
    assert levels.level_for_credits(data, 25)["level"] == 1
    assert levels.level_for_credits(data, 26)["level"] == 2
    assert levels.level_for_credits(data, 61)["level"] == 2
    assert levels.level_for_credits(data, 62)["level"] == 3
    assert levels.level_for_credits(data, 95)["level"] == 3
    assert levels.level_for_credits(data, 96)["level"] == 4
    assert levels.level_for_credits(data, 135)["level"] == 4


def test_load_golden(data):
    assert load.base_max_load(3.0) == 21
    assert load.base_max_load(2.99) == 18
    assert load.base_max_load(2.0) == 18
    assert load.base_max_load(1.99) == 15
    assert load.base_max_load(1.0) == 15
    assert load.base_max_load(0.99) == 12


def test_first_semester_new_student_18(data):
    s = student(cgpa=None, level=1, first_semester_non_transfer=True, regular_semesters_completed=0)
    decision = load.evaluate_load(data, s, term(), 18)
    assert decision.status.value == "ELIGIBLE"
    assert "FIRST_SEMESTER_MAX_18" in decision.flags


def test_graduation_possible_21(data):
    s = student(cgpa=2.7)
    decision = load.evaluate_load(data, s, term(), 21, graduation_possible=True)
    assert decision.status.value == "ELIGIBLE"
    assert decision.details["max_credits"] == 21


def test_probation_10_credits_review_a_reg_01(data):
    s = student(cgpa=1.95)
    decision = load.evaluate_load(data, s, term(), 10)
    assert decision.status.value == "REVIEW_REQUIRED"
    assert decision.rule_code == "R-LOAD-MIN"
    assert decision.anomaly_ids == ("A-REG-01",)


def test_probation_12_credits_conservative_draft(data):
    s = student(cgpa=1.95)
    decision = load.evaluate_load(data, s, term(), 12)
    assert decision.status.value == "ELIGIBLE"
    assert "A-REG-01" in decision.anomaly_ids
    assert "A-REG-02" in decision.anomaly_ids
    assert "CONSERVATIVE_DRAFT" in decision.flags


def test_probation_14_credits_review_a_reg_02(data):
    s = student(cgpa=1.95)
    decision = load.evaluate_load(data, s, term(), 14)
    assert decision.status.value == "REVIEW_REQUIRED"
    assert decision.anomaly_ids == ("A-REG-02",)


def test_load_max_and_min(data):
    s = student(cgpa=3.2, remaining_credits=40)
    assert load.evaluate_load(data, s, term(), 22).status.value == "NOT_ELIGIBLE"
    assert load.evaluate_load(data, s, term(), 8).status.value == "NOT_ELIGIBLE"


def test_min_load_waived_when_remaining_lt_9(data):
    s = student(cgpa=2.5, remaining_credits=6)
    assert load.evaluate_load(data, s, term(), 6).status.value == "ELIGIBLE"


def test_summer_cap_9(data):
    s = student(cgpa=3.2)
    d = load.evaluate_load(data, s, term("summer"), 10)
    assert d.status.value == "NOT_ELIGIBLE"
    assert d.rule_code == "R-ACA-06.3"
