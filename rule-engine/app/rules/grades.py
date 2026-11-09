from __future__ import annotations

from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from ..data import RegulationData
from ..schemas import Attempt

SPECIAL_GRADES = {
    "Abs": {"points": 0.0, "counts_in_gpa": True, "passed": False},
    "F": {"points": 0.0, "counts_in_gpa": True, "passed": False},
    "W": {"counts_in_gpa": False, "passed": False},
    "I": {"counts_in_gpa": False, "passed": False},
    "Con": {"counts_in_gpa": False, "passed": False},
    "P": {"counts_in_gpa": False, "passed": True},
}

ENGLISH_CLASSIFICATION = {
    0: "Very weak",
    1: "Weak",
    2: "Acceptable",
    3: "Good",
    4: "Very good",
    5: "Excellent",
}


def round_half_up(value: float, decimals: int = 2) -> float:
    quant = Decimal(1).scaleb(-decimals)
    return float(Decimal(str(value)).quantize(quant, rounding=ROUND_HALF_UP))


def letter_for_percentage(pct: float) -> str:
    if pct >= 96:
        return "A+"
    if pct >= 92:
        return "A"
    if pct >= 88:
        return "A-"
    if pct >= 84:
        return "B+"
    if pct >= 80:
        return "B"
    if pct >= 76:
        return "B-"
    if pct >= 72:
        return "C+"
    if pct >= 68:
        return "C"
    if pct >= 64:
        return "C-"
    if pct >= 60:
        return "D+"
    if pct >= 55:
        return "D"
    if pct >= 50:
        return "D-"
    return "F"


def points_for_letter(letter: str) -> float:
    table = {
        "A+": 4.0,
        "A": 3.7,
        "A-": 3.4,
        "B+": 3.2,
        "B": 3.0,
        "B-": 2.8,
        "C+": 2.6,
        "C": 2.4,
        "C-": 2.2,
        "D+": 2.0,
        "D": 1.5,
        "D-": 1.0,
        "F": 0.0,
        "Abs": 0.0,
        "W": 0.0,
        "I": 0.0,
        "Con": 0.0,
        "P": 0.0,
    }
    return table.get(letter, 0.0)


def minimum_pct_for_letter(letter: str) -> float:
    mapping = {
        "A+": 96,
        "A": 92,
        "A-": 88,
        "B+": 84,
        "B": 80,
        "B-": 76,
        "C+": 72,
        "C": 68,
        "C-": 64,
        "D+": 60,
        "D": 55,
        "D-": 50,
        "F": 0,
        "Abs": 0,
    }
    return mapping.get(letter, 0.0)


def is_repeat(attempt: Attempt) -> bool:
    return bool(attempt.is_repeat or attempt.attempt_no > 1)


def recorded_percentage(attempt: Attempt, repeat_cap_pct: float = 83) -> float | None:
    """Percentage actually recorded in the student record.

    A repeated course (failed-course repeat or CGPA-improvement repeat) keeps
    its best actual grade but is capped at 83% (= B, 3.00 points) per
    Articles 16.11 / 16.14 / 16.15.
    """
    if attempt.percentage is not None:
        pct = float(attempt.percentage)
    elif attempt.grade_letter:
        pct = minimum_pct_for_letter(attempt.grade_letter)
    else:
        return None
    if is_repeat(attempt):
        pct = min(pct, repeat_cap_pct)
    return pct


def attempt_points(attempt: Attempt) -> tuple[float, bool]:
    """Return (grade points, counts_in_gpa) for one attempt."""
    letter = (attempt.grade_letter or "").strip()
    if attempt.status in {"withdrawn", "incomplete", "continued", "in_progress"}:
        return 0.0, False
    if letter in {"W", "I", "Con", "P"}:
        return 0.0, False
    if attempt.status == "absent" or letter == "Abs":
        return 0.0, bool(attempt.counts_in_gpa)
    pct = recorded_percentage(attempt)
    if pct is None:
        return 0.0, False
    if letter and letter not in {"F", "Abs"} and not is_repeat(attempt) and attempt.percentage is None:
        return points_for_letter(letter), bool(attempt.counts_in_gpa)
    return points_for_letter(letter_for_percentage(pct)), bool(attempt.counts_in_gpa)


def _select_best(attempts: Iterable[Attempt]) -> dict[str, dict[str, Any]]:
    """Latest/highest attempt per course, credits counted once."""
    best: dict[str, dict[str, Any]] = {}
    for attempt in attempts:
        points, counted = attempt_points(attempt)
        pct = recorded_percentage(attempt)
        current = best.get(attempt.code)
        candidate = {
            "code": attempt.code,
            "credits": int(attempt.credits),
            "points": points,
            "percentage": pct,
            "letter": (attempt.grade_letter or (letter_for_percentage(pct) if pct is not None else None)),
            "status": attempt.status,
            "counts_in_gpa": counted,
            "attempt_no": attempt.attempt_no,
            "is_repeat": is_repeat(attempt),
        }
        if current is None:
            best[attempt.code] = candidate
            continue
        # Highest recorded points wins; ties prefer a passing latest attempt.
        if (candidate["points"], candidate["percentage"] or 0) > (
            current["points"],
            current["percentage"] or 0,
        ):
            best[attempt.code] = candidate
    return best


def compute_gpa(
    data: RegulationData,
    completed: Iterable[Attempt],
    term_attempts: Iterable[Attempt] | None = None,
    repeat_cap_pct: float | None = None,
) -> dict[str, Any]:
    cap = repeat_cap_pct if repeat_cap_pct is not None else float(data.gpa.get("repeat_cap_pct", 83))
    completed_list = list(completed)
    term_list = list(term_attempts) if term_attempts is not None else []

    # CGPA: best counted attempt per code, credits once.
    best = _select_best(completed_list)
    total_points = 0.0
    total_credits = 0
    records: list[dict[str, Any]] = []
    capped_courses: list[str] = []
    for code, row in sorted(best.items()):
        if not row["counts_in_gpa"] or row["credits"] <= 0:
            continue
        total_credits += row["credits"]
        total_points += row["points"] * row["credits"]
        if row["is_repeat"] and (row["percentage"] or 0) >= cap:
            capped_courses.append(code)
        records.append(row)
    cgpa = round_half_up(total_points / total_credits, 2) if total_credits else 0.0

    # SGPA: attempts in the requested term only, credits once per code.
    sgpa = cgpa
    sgpa_credits = total_credits
    sgpa_points = total_points
    if term_list:
        term_best = _select_best(term_list)
        sgpa_points = 0.0
        sgpa_credits = 0
        for code, row in sorted(term_best.items()):
            if not row["counts_in_gpa"] or row["credits"] <= 0:
                continue
            sgpa_credits += row["credits"]
            sgpa_points += row["points"] * row["credits"]
        sgpa = round_half_up(sgpa_points / sgpa_credits, 2) if sgpa_credits else 0.0

    classification = classify_cgpa(data, cgpa)
    return {
        "sgpa": sgpa,
        "cgpa": cgpa,
        "total_credits": total_credits,
        "qualifying_points": round_half_up(total_points, 2),
        "quality_points": round_half_up(total_points, 2),
        "sgpa_credits": sgpa_credits,
        "sgpa_points": round_half_up(sgpa_points, 2),
        "courses": records,
        "repeat_cap_applied": capped_courses,
        "repeat_cap_pct": cap,
        "classification": classification,
        "classification_en": ENGLISH_CLASSIFICATION.get(classification[0], "Unknown"),
    }


def classify_cgpa(data: RegulationData, cgpa: float) -> tuple[int, str]:
    for idx, row in enumerate(data.overall_classification or []):
        lo = float(row.get("min", 0))
        hi = row.get("max_exclusive")
        if cgpa >= lo and (hi is None or cgpa < float(hi)):
            return idx, row.get("label_ar", "")
    return 0, ""


def gpa_from_scratch(
    data: RegulationData, attempts: Iterable[Attempt], repeat_cap_pct: float = 83
) -> tuple[float, int]:
    best = _select_best(attempts)
    credits = 0
    points = 0.0
    for row in best.values():
        if row["counts_in_gpa"] and row["credits"] > 0:
            credits += row["credits"]
            points += row["points"] * row["credits"]
    return (round_half_up(points / credits, 2) if credits else 0.0), credits


def apply_repeat_cap(attempt: Attempt, cap_pct: float = 83) -> dict[str, Any]:
    pct = recorded_percentage(attempt, cap_pct)
    points = points_for_letter(letter_for_percentage(pct)) if pct is not None else 0.0
    return {
        "percentage": pct,
        "letter": letter_for_percentage(pct) if pct is not None else None,
        "points": points,
        "capped": is_repeat(attempt) and attempt.percentage is not None and attempt.percentage > cap_pct,
    }
