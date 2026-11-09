from __future__ import annotations

from app.rules import graduation, standing

from .conftest import attempt, student, term


def _full_program(data, program="CS"):
    prog = data.program(program)
    codes: list[str] = list(data.common_compulsory)
    codes += list(prog.get("compulsory") or [])
    codes += list(prog.get("labs") or [])
    codes += list(prog.get("project") or [])
    for key in ("field_training", "selected_topic"):
        if prog.get(key):
            codes.append(prog[key])
    # Pools: mandatory first then fill credits.
    for pool_code in data.pool_codes_for_program(program).values():
        pool = data.pool(pool_code)
        required = int(pool.get("credits_required", 0))
        chosen = list(pool.get("mandatory") or [])
        earned = sum(data.courses[c].credits for c in chosen)
        for code in pool.get("courses") or []:
            if earned >= required:
                break
            if code not in chosen:
                chosen.append(code)
                earned += data.courses[code].credits
        codes += chosen
    return list(dict.fromkeys(codes))


def test_full_program_is_136(data):
    for program in ("CS", "IT", "AI", "DS"):
        codes = _full_program(data, program)
        total = sum(data.courses[c].credits for c in codes)
        assert total == 136, (program, total)


def test_graduation_audit_eligible(data):
    codes = _full_program(data, "CS")
    s = student(
        program="CS",
        cgpa=3.60,
        level=4,
        regular_semesters_completed=8,
        completed=[attempt(c, data.courses[c].credits, 90, "A-") for c in codes],
    )
    report = graduation.audit_graduation(data, s, term())
    assert report["eligible_to_graduate"] is True
    assert report["missing"] == []
    assert report["honors"] is True
    assert report["decision"]["status"] == "ELIGIBLE"
    assert report["decision"]["article"] == "17"


def test_graduation_audit_lists_missing(data):
    s = student(program="CS", cgpa=1.8, level=3, regular_semesters_completed=3, completed=[])
    report = graduation.audit_graduation(data, s, term())
    assert report["eligible_to_graduate"] is False
    requirements = {m["requirement"] for m in report["missing"]}
    assert "credit_hours" in requirements
    assert "cgpa" in requirements
    assert "field_training" in requirements
    assert "graduation_project" in requirements
    assert "regular_semesters" in requirements


def test_honors_requires_no_failure(data):
    codes = _full_program(data, "CS")
    completed = [attempt(c, data.courses[c].credits, 90, "A-") for c in codes]
    completed.append(attempt("CSB1201", 3, 40, "F", status="failed"))
    s = student(
        program="CS",
        cgpa=3.60,
        level=4,
        regular_semesters_completed=8,
        completed=completed,
    )
    report = graduation.audit_graduation(data, s, term())
    assert report["honors"] is False
    assert "A-REG-04" in report["honors_decision"]["anomaly_ids"]


def test_probation_after_first_semester(data):
    s = student(cgpa=1.50, regular_semesters_completed=2, first_semester_non_transfer=False)
    report = standing.evaluate_standing(data, s, term())
    assert report["probation"] is True
    assert report["decision"]["status"] == "REVIEW_REQUIRED"
    assert report["decision"]["rule_code"] == "R-PROB-16.5"
    assert report["consecutive_warnings"] == 1


def test_no_probation_in_first_semester(data):
    s = student(cgpa=1.50, regular_semesters_completed=0, first_semester_non_transfer=True)
    report = standing.evaluate_standing(data, s, term())
    assert report["probation"] is False


def test_dismissal_after_four_consecutive_warnings(data):
    s = student(cgpa=1.40, regular_semesters_completed=5, consecutive_warnings=3, total_warnings=3)
    report = standing.evaluate_standing(data, s, term())
    assert report["dismissal_risk"] is True
    assert report["dismissal_decision"]["rule_code"] == "R-DISMISS-21"
    assert report["consecutive_warnings"] == 4


def test_final_chance_at_109_credits(data):
    from .conftest import passed_credits

    s = student(cgpa=1.2, completed=passed_credits(109), regular_semesters_completed=6)
    report = standing.evaluate_standing(data, s, term())
    assert report["final_chance"] is True


def test_whatif_only_identical_codes_equivalent(data):
    s = student(
        program="CS",
        completed=[attempt("CSC3101", 3), attempt("UNI1101", 1), attempt("CSC3103", 3)],
    )
    report = graduation.what_if_major_switch(data, s, "IT")
    assert report["decision"]["status"] == "REVIEW_REQUIRED"
    assert "CSC3101" in report["equivalent_codes"]
    assert "CSC3103" in report["non_equivalent_codes"]
    assert report["decision"]["flags"] == ["WHATIF_REVIEW"]
