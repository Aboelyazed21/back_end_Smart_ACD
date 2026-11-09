from __future__ import annotations

from datetime import time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Season = Literal["fall", "spring", "summer"]
AttemptStatus = Literal[
    "passed", "failed", "in_progress", "withdrawn", "incomplete", "continued", "absent"
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Term(StrictModel):
    season: Season
    academic_year: str = Field(pattern=r"^\d{4}-\d{4}$")
    week: int = Field(default=1, ge=0, le=30)
    is_first_semester: bool = False


class Attempt(StrictModel):
    code: str = Field(pattern=r"^[A-Z]{3}\d{4}$")
    credits: int = Field(ge=0, le=12)
    percentage: float | None = Field(default=None, ge=0, le=100)
    grade_letter: str | None = Field(default=None, max_length=4)
    status: AttemptStatus = "passed"
    attempt_no: int = Field(default=1, ge=1, le=20)
    counts_in_gpa: bool = True
    is_repeat: bool = False
    term: str | None = Field(default=None, max_length=32)
    course_level: int | None = Field(default=None, ge=1, le=4)

    @model_validator(mode="after")
    def _grade_or_pct(self) -> Attempt:
        if self.status in {"passed", "failed", "absent"} and self.percentage is None and not self.grade_letter:
            raise ValueError("a completed attempt needs percentage or grade_letter")
        if self.grade_letter is not None and len(self.grade_letter) > 4:
            raise ValueError("invalid grade letter")
        return self


class StudentRecord(StrictModel):
    id: str = Field(min_length=1, max_length=64)
    program: Literal["CS", "IT", "AI", "DS"]
    cgpa: float | None = Field(default=None, ge=0, le=4)
    passed_credits: int = Field(default=0, ge=0, le=300)
    transfer_credits: int = Field(default=0, ge=0, le=300)
    level: int | None = Field(default=None, ge=1, le=8)
    completed: list[Attempt] = Field(default_factory=list)
    current: list[Attempt] = Field(default_factory=list)
    regular_semesters_completed: int = Field(default=0, ge=0, le=40)
    suspension_semesters: int = Field(default=0, ge=0, le=20)
    improvement_courses_count: int = Field(default=0, ge=0, le=100)
    warning_no: int = Field(default=0, ge=0, le=20)
    consecutive_warnings: int = Field(default=0, ge=0, le=20)
    total_warnings: int = Field(default=0, ge=0, le=20)
    first_semester_non_transfer: bool = False
    previous_incomplete_courses: list[str] = Field(default_factory=list)
    remaining_credits: int | None = Field(default=None, ge=0, le=300)
    attendance_pct: float | None = Field(default=None, ge=0, le=100)
    semesters: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _safe_id(cls, value: str) -> str:
        if any(ch in value for ch in "<>\"';&\x00\n\r"):
            raise ValueError("invalid student id")
        return value

    def passed_codes(self) -> set[str]:
        return {a.code for a in self.completed if a.status == "passed"}

    def failed_codes(self) -> set[str]:
        return {a.code for a in self.completed if a.status in {"failed", "absent"}}

    def attempted(self) -> list[Attempt]:
        return list(self.completed) + list(self.current)

    def effective_passed_credits(self) -> int:
        """Passed credits, de-duplicated by course code, plus accepted transfer."""
        best: dict[str, int] = {}
        for attempt in self.completed:
            if attempt.status != "passed":
                continue
            best[attempt.code] = max(best.get(attempt.code, 0), attempt.credits)
        return sum(best.values()) + max(0, self.transfer_credits)


class MeetingTime(StrictModel):
    day: Literal["sat", "sun", "mon", "tue", "wed", "thu", "fri"]
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    room: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _ordered(self) -> MeetingTime:
        if self.start >= self.end:
            raise ValueError("meeting start must be before end")
        return self


class ExamSlot(StrictModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class Offering(StrictModel):
    code: str = Field(pattern=r"^[A-Z]{3}\d{4}$")
    enrolled_count: int = Field(default=0, ge=0, le=5000)
    season: Season | None = None
    meeting_times: list[MeetingTime] = Field(default_factory=list)
    exam: ExamSlot | None = None
    active: bool = True


class BaseContext(StrictModel):
    resolved_anomaly_ids: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("resolved_anomaly_ids")
    @classmethod
    def _codes(cls, values: list[str]) -> list[str]:
        for value in values:
            if not value.startswith("A-"):
                raise ValueError("invalid anomaly id")
        return values


class EligibilityRequest(BaseContext):
    student: StudentRecord
    course_code: str = Field(pattern=r"^[A-Z]{3}\d{4}$")
    term: Term
    offerings: list[Offering] = Field(default_factory=list, max_length=300)
    planned_credits: int | None = Field(default=None, ge=0, le=21)
    graduation_possible: bool = False


class BulkEligibilityRequest(BaseContext):
    student: StudentRecord
    course_codes: list[str] = Field(min_length=1, max_length=100)
    term: Term
    offerings: list[Offering] = Field(default_factory=list, max_length=300)
    planned_credits: int | None = Field(default=None, ge=0, le=21)
    graduation_possible: bool = False

    @field_validator("course_codes")
    @classmethod
    def _codes(cls, values: list[str]) -> list[str]:
        for value in values:
            if not (len(value) == 7 and value[:3].isalpha() and value[3:].isdigit()):
                raise ValueError(f"invalid course code: {value}")
        return values


class PlanRequest(BaseContext):
    student: StudentRecord
    term: Term
    offerings: list[Offering] = Field(default_factory=list, max_length=400)
    max_credits: int | None = Field(default=None, ge=0, le=21)
    graduation_possible: bool = False
    planning_slot: str | None = Field(default=None, pattern=r"^[1-4]-[12]$")
    preferences: dict[str, Any] = Field(default_factory=dict)

    @field_validator("preferences")
    @classmethod
    def _prefs(cls, value: dict[str, Any]) -> dict[str, Any]:
        allowed = {"avoid_days", "compress_days", "prefer_morning"}
        if set(value) - allowed:
            raise ValueError("unknown planner preference")
        return value


class GpaSimulateRequest(StrictModel):
    student: StudentRecord
    term: Term
    simulated: list[Attempt] = Field(default_factory=list, max_length=30)
    future_cgpa_target: float | None = Field(default=None, ge=0, le=4)


class StandingRequest(StrictModel):
    student: StudentRecord
    term: Term


class GraduationRequest(StrictModel):
    student: StudentRecord
    term: Term


class EarlyWarningRequest(StrictModel):
    student: StudentRecord
    term: Term


class WhatIfRequest(StrictModel):
    student: StudentRecord
    target_program: Literal["CS", "IT", "AI", "DS"]


class RagAskRequest(StrictModel):
    question: str = Field(min_length=2, max_length=1500)
    language: Literal["ar", "en", "auto"] = "auto"
    student_id: str | None = Field(default=None, max_length=64)
    term: Term | None = None

    @field_validator("question")
    @classmethod
    def _clean(cls, value: str) -> str:
        forbidden = ["\x00", "\x01", "\x02", "\x1b"]
        for token in forbidden:
            if token in value:
                raise ValueError("control characters are not allowed")
        return value


class HealthResponse(StrictModel):
    status: Literal["ok"]
    engine_version: str
    regulation_loaded: bool
    policy_chunks: int
    database: bool


class DecisionResponse(StrictModel):
    status: Literal["ELIGIBLE", "NOT_ELIGIBLE", "UNKNOWN", "REVIEW_REQUIRED"]
    reason_ar: str
    reason_en: str
    rule_code: str
    article: str
    page: str
    anomaly_ids: list[str]
    flags: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class CourseDecision(DecisionResponse):
    course_code: str


class EligibilityResponse(BaseModel):
    decisions: list[CourseDecision]
    planned_credits: int
    max_credits: int
    load_decision: DecisionResponse


class PlanItem(BaseModel):
    course_code: str
    credits: int
    priority: int
    source: str
    decision: DecisionResponse
    meeting_times: list[MeetingTime] = Field(default_factory=list)


class PlanResponse(BaseModel):
    status: Literal["DRAFT"] = "DRAFT"
    student_id: str
    program: str
    term: Term
    total_credits: int
    max_credits: int
    items: list[PlanItem]
    excluded: list[CourseDecision]
    load_decision: DecisionResponse
    advisory_only: Literal[True] = True
    engine_version: str


class GpaResult(BaseModel):
    sgpa: float
    cgpa: float
    total_credits: int
    quality_points: float
    courses: list[dict[str, Any]]
    repeat_cap_applied: list[str] = Field(default_factory=list)
    classification: str
    flags: list[str] = Field(default_factory=list)


class Citation(BaseModel):
    article: str
    clause: str = ""
    page: int | str
    source: str = "BUA-AIDM.pdf"
    title: str = ""


class RagAnswer(BaseModel):
    answer: str = Field(min_length=1, max_length=4000)
    answer_language: Literal["ar", "en"]
    citations: list[Citation] = Field(default_factory=list, max_length=5)
    confidence: float = Field(ge=0, le=1)
    escalate: bool
    escalate_reason: str | None = None
    anomaly_ids: list[str] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)

