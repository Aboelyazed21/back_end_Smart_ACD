from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("ENGINE_SERVICE_TOKEN", "test-engine-token-0123456789abcdef")
os.environ.setdefault("APP_ENV", "test")

import pytest

from app.data import get_data
from app.schemas import Attempt, Offering, StudentRecord, Term


@pytest.fixture(scope="session")
def data():
    return get_data()


def term(season="fall", week=1, year="2026-2027") -> Term:
    return Term(season=season, academic_year=year, week=week, is_first_semester=False)


def all_offerings(enrolled=10) -> list[Offering]:
    return [
        Offering(code=code, enrolled_count=enrolled, season="fall")
        for code in get_data().courses
    ]


def student(**overrides) -> StudentRecord:
    base = dict(
        id="11111111-1111-1111-1111-111111111111",
        program="CS",
        cgpa=2.50,
        passed_credits=0,
        transfer_credits=0,
        level=3,
        completed=[],
        current=[],
        regular_semesters_completed=4,
        first_semester_non_transfer=False,
    )
    base.update(overrides)
    return StudentRecord(**base)


def attempt(code: str, credits: int = 3, pct: float = 70, letter: str = "C", status="passed", **kw) -> Attempt:
    return Attempt(
        code=code,
        credits=credits,
        percentage=pct,
        grade_letter=letter,
        status=status,
        counts_in_gpa=True,
        **kw,
    )


def passed_credits(total: int) -> list[Attempt]:
    """Build a synthetic passed history with exactly ``total`` credits."""
    out: list[Attempt] = []
    idx = 0
    while total >= 3:
        out.append(attempt(f"ZZZ{1000 + idx}", credits=3))
        total -= 3
        idx += 1
    if total:
        out.append(attempt(f"ZZZ{1000 + idx}", credits=total, pct=70))
    return out
