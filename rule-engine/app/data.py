from __future__ import annotations

import json
import threading
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import regulation_dir


@dataclass(frozen=True)
class Course:
    code: str
    name_ar: str
    name_en: str
    credits: int
    category: str
    level_hint: int
    term_hint: int
    prereq_codes: tuple[str, ...]
    min_passed_credit_hours: int | None
    counts_in_gpa: bool
    roles: dict[str, str]
    anomaly_ids: tuple[str, ...]

    @property
    def is_project(self) -> bool:
        return self.category == "graduation_project"

    @property
    def is_field_training(self) -> bool:
        return self.category == "field_training"


@dataclass(frozen=True)
class Anomaly:
    id: str
    severity: str
    type: str
    title_ar: str
    title_en: str
    description_ar: str
    description_en: str
    sources: tuple[dict[str, Any], ...]
    affected_courses: tuple[str, ...]
    affected_rules: tuple[str, ...]
    working_value: str | None
    status: str
    engine_behavior: str

    @property
    def is_open(self) -> bool:
        return self.status == "open"

    @property
    def is_blocking(self) -> bool:
        return self.is_open and self.severity == "blocking"

    @property
    def is_warning(self) -> bool:
        return self.is_open and self.severity == "warning"

    @property
    def article(self) -> str:
        if not self.sources:
            return "N/A"
        return str(self.sources[0].get("article", "N/A"))

    @property
    def page(self) -> str:
        if not self.sources:
            return "N/A"
        return str(self.sources[0].get("page", "N/A"))


@dataclass(frozen=True)
class RuleRef:
    rule_code: str
    article: str
    page: str
    title_ar: str
    summary_ar: str
    clause: str


class RegulationData:
    """Immutable view over the OCR-extracted, college-validated bylaw data."""

    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or regulation_dir()
        self.courses: dict[str, Course] = {}
        self.programs: dict[str, dict[str, Any]] = {}
        self.common_compulsory: tuple[str, ...] = ()
        self.elective_pools: dict[str, dict[str, Any]] = {}
        self.recommended_plans: dict[str, dict[str, list[dict[str, Any]]]] = {}
        self.grade_scale: list[dict[str, Any]] = []
        self.special_grades: dict[str, dict[str, Any]] = {}
        self.levels: list[dict[str, Any]] = []
        self.load: dict[str, Any] = {}
        self.rules: dict[str, RuleRef] = {}
        self.rules_list: list[dict[str, Any]] = []
        self.anomalies: dict[str, Anomaly] = {}
        self.meta: dict[str, Any] = {}
        self.dates: dict[str, Any] = {}
        self.assessment: dict[str, Any] = {}
        self.graduation: dict[str, Any] = {}
        self.honors: dict[str, Any] = {}
        self.probation: dict[str, Any] = {}
        self.field_training: dict[str, Any] = {}
        self.graduation_project: dict[str, Any] = {}
        self.durations: dict[str, Any] = {}
        self.transfer: dict[str, Any] = {}
        self.gpa: dict[str, Any] = {}
        self.attendance_min_pct: int = 75
        self.min_students_to_open_course: int = 5
        self.overall_classification: list[dict[str, Any]] = []
        self._load()

    # ------------------------------------------------------------------ load
    def _read(self, name: str) -> Any:
        path = self.base_dir / name
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)

    def _load(self) -> None:
        raw_courses = self._read("courses.json")["courses"]
        for item in raw_courses:
            pre = item.get("prerequisites") or {}
            course = Course(
                code=item["code"],
                name_ar=item.get("name_ar", ""),
                name_en=item.get("name_en", ""),
                credits=int(item.get("credits", 0)),
                category=item.get("category", ""),
                level_hint=int(item.get("level_hint", 1)),
                term_hint=int(item.get("term_hint", 1)),
                prereq_codes=tuple(pre.get("all_of") or ()),
                min_passed_credit_hours=pre.get("min_passed_credit_hours"),
                counts_in_gpa=bool(item.get("counts_in_gpa", True)),
                roles=dict(item.get("roles") or {}),
                anomaly_ids=tuple(item.get("anomaly_ids") or ()),
            )
            self.courses[course.code] = course

        programs = self._read("programs.json")
        self.programs = programs["programs"]
        self.common_compulsory = tuple(programs.get("common_compulsory") or ())
        self.elective_pools = programs.get("elective_pools") or {}
        self.recommended_plans = programs.get("recommended_plans") or {}

        reg = self._read("regulation_rules.json")
        self.meta = reg.get("meta") or {}
        self.grade_scale = reg.get("grade_scale") or []
        self.special_grades = reg.get("special_grades") or {}
        self.levels = reg.get("levels") or []
        self.load = reg.get("load") or {}
        self.dates = reg.get("dates") or {}
        self.assessment = reg.get("assessment") or {}
        self.graduation = reg.get("graduation") or {}
        self.honors = reg.get("honors") or {}
        self.probation = reg.get("probation") or {}
        self.field_training = reg.get("field_training") or {}
        self.graduation_project = reg.get("graduation_project") or {}
        self.durations = reg.get("durations") or {}
        self.transfer = reg.get("transfer") or {}
        self.gpa = reg.get("gpa") or {}
        self.attendance_min_pct = int(reg.get("attendance_min_pct", 75))
        self.min_students_to_open_course = int(reg.get("min_students_to_open_course", 5))
        self.overall_classification = reg.get("overall_classification") or []
        for item in reg.get("rules") or []:
            ref = RuleRef(
                rule_code=item["rule_code"],
                article=str(item.get("article", "")),
                page=str(item.get("page", "")),
                title_ar=item.get("title_ar", ""),
                summary_ar=item.get("summary_ar", ""),
                clause=str(item.get("clause", "")),
            )
            self.rules[ref.rule_code] = ref
            self.rules_list.append(item)

        raw_anoms = self._read("anomalies.json")["anomalies"]
        for item in raw_anoms:
            anomaly = Anomaly(
                id=item["id"],
                severity=item.get("severity", "info"),
                type=item.get("type", ""),
                title_ar=item.get("title_ar", ""),
                title_en=item.get("title_en", item.get("title_ar", "")),
                description_ar=item.get("description_ar", ""),
                description_en=item.get("description_en", ""),
                sources=tuple(item.get("sources") or ()),
                affected_courses=tuple(item.get("affected_courses") or ()),
                affected_rules=tuple(item.get("affected_rules") or ()),
                working_value=item.get("working_value"),
                status=item.get("status", "open"),
                engine_behavior=item.get("engine_behavior", ""),
            )
            self.anomalies[anomaly.id] = anomaly

    # ---------------------------------------------------------------- helpers
    def rule(self, code: str, fallback: tuple[str, str] = ("N/A", "N/A")) -> RuleRef:
        return self.rules.get(
            code, RuleRef(code, fallback[0], fallback[1], "", "", "")
        )

    def anomaly(self, anomaly_id: str) -> Anomaly | None:
        return self.anomalies.get(anomaly_id)

    def open_anomalies_for_course(
        self, code: str, resolved: Iterable[str] = ()
    ) -> list[Anomaly]:
        resolved_set = set(resolved)
        out: list[Anomaly] = []
        course = self.courses.get(code)
        candidate_ids: set[str] = set(course.anomaly_ids if course else ())
        for anomaly in self.anomalies.values():
            if code in anomaly.affected_courses:
                candidate_ids.add(anomaly.id)
        for anomaly_id in sorted(candidate_ids):
            anomaly = self.anomalies.get(anomaly_id)
            if anomaly and anomaly.is_open and anomaly.id not in resolved_set:
                out.append(anomaly)
        return out

    def blocking_anomalies(
        self, codes: Iterable[str], resolved: Iterable[str] = ()
    ) -> list[Anomaly]:
        seen: dict[str, Anomaly] = {}
        for code in codes:
            for anomaly in self.open_anomalies_for_course(code, resolved):
                if anomaly.severity == "blocking":
                    seen[anomaly.id] = anomaly
        return list(seen.values())

    def warning_anomalies(
        self, codes: Iterable[str], resolved: Iterable[str] = ()
    ) -> list[Anomaly]:
        seen: dict[str, Anomaly] = {}
        for code in codes:
            for anomaly in self.open_anomalies_for_course(code, resolved):
                if anomaly.severity == "warning":
                    seen[anomaly.id] = anomaly
        return list(seen.values())

    def anomalies_by_rule(self, rule_code: str, resolved: Iterable[str] = ()) -> list[Anomaly]:
        resolved_set = set(resolved)
        return [
            a
            for a in self.anomalies.values()
            if a.is_open and a.id not in resolved_set and rule_code in a.affected_rules
        ]

    def program(self, program: str) -> dict[str, Any]:
        return self.programs.get(program, {})

    def pool(self, pool_code: str) -> dict[str, Any]:
        return self.elective_pools.get(pool_code, {})

    def pool_codes_for_program(self, program: str) -> dict[str, str]:
        """Return the elective pools a program must satisfy."""
        pools = {
            "UNIV_ELECTIVE": "UNIV_ELECTIVE",
            "HUMANITIES_ELECTIVE": "HUMANITIES_ELECTIVE",
            "BASIC_COMPUTING_ELECTIVE": "BASIC_COMPUTING_ELECTIVE",
        }
        prog = self.programs.get(program) or {}
        if prog.get("elective_pool"):
            pools["PROGRAM_ELECTIVE"] = prog["elective_pool"]
        return pools

    def course_role_in_program(self, code: str, program: str) -> str | None:
        course = self.courses.get(code)
        if not course:
            return None
        role = course.roles.get(program) or course.roles.get("ALL")
        if role:
            return role
        for pool_key, pool_code in self.pool_codes_for_program(program).items():
            if code in (self.pool(pool_code).get("courses") or []):
                return f"elective:{pool_code}"
        return None

    def is_in_program(self, code: str, program: str) -> bool:
        return self.course_role_in_program(code, program) is not None

    def pool_for_course(self, code: str, program: str) -> str | None:
        role = self.course_role_in_program(code, program)
        if role and role.startswith("elective:"):
            return role.split(":", 1)[1]
        for pool_code in self.pool_codes_for_program(program).values():
            if code in (self.pool(pool_code).get("courses") or []):
                return pool_code
        return None

    def program_credit_total(self, program: str) -> int:
        prog = self.programs.get(program) or {}
        codes = list(self.common_compulsory) + list(prog.get("compulsory") or [])
        codes += list(prog.get("labs") or []) + list(prog.get("project") or [])
        if prog.get("field_training"):
            codes.append(prog["field_training"])
        if prog.get("selected_topic"):
            codes.append(prog["selected_topic"])
        total = sum(self.courses[c].credits for c in codes if c in self.courses)
        for pool_code in self.pool_codes_for_program(program).values():
            total += int(self.pool(pool_code).get("credits_required", 0))
        return total

    def plan_level_credit(self, program: str, level: int) -> int:
        plans = dict(self.recommended_plans.get("COMMON") or {})
        plans.update(self.recommended_plans.get(program) or {})
        total = 0
        for slot, items in plans.items():
            if not slot.startswith(f"{level}-"):
                continue
            for item in items:
                if "course" in item and item["course"] in self.courses:
                    total += self.courses[item["course"]].credits
                else:
                    total += int(item.get("credits", 0))
        return total


_lock = threading.Lock()
_data: RegulationData | None = None


def get_data() -> RegulationData:
    global _data
    if _data is None:
        with _lock:
            if _data is None:
                _data = RegulationData()
    return _data


def reset_data_cache() -> None:
    """Test helper."""
    global _data
    with _lock:
        _data = None
