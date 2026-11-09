from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Status(str, Enum):
    ELIGIBLE = "ELIGIBLE"
    NOT_ELIGIBLE = "NOT_ELIGIBLE"
    UNKNOWN = "UNKNOWN"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


@dataclass(frozen=True)
class Decision:
    """Every engine decision carries its bylaw provenance."""

    status: Status
    reason_ar: str
    reason_en: str
    rule_code: str
    article: str
    page: str
    anomaly_ids: tuple[str, ...] = ()
    details: dict[str, Any] = field(default_factory=dict)
    flags: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "reason_ar": self.reason_ar,
            "reason_en": self.reason_en,
            "rule_code": self.rule_code,
            "article": str(self.article),
            "page": str(self.page),
            "anomaly_ids": list(self.anomaly_ids),
            "flags": list(self.flags),
            "details": self.details,
        }


def eligible(
    reason_en: str,
    reason_ar: str,
    rule_code: str,
    article: str,
    page: str,
    anomaly_ids: Iterable[str] = (),
    flags: Iterable[str] = (),
    details: dict[str, Any] | None = None,
) -> Decision:
    return Decision(
        Status.ELIGIBLE,
        reason_ar,
        reason_en,
        rule_code,
        article,
        page,
        tuple(anomaly_ids),
        details or {},
        tuple(flags),
    )


def not_eligible(
    reason_en: str,
    reason_ar: str,
    rule_code: str,
    article: str,
    page: str,
    anomaly_ids: Iterable[str] = (),
    details: dict[str, Any] | None = None,
    flags: Iterable[str] = (),
) -> Decision:
    return Decision(
        Status.NOT_ELIGIBLE,
        reason_ar,
        reason_en,
        rule_code,
        article,
        page,
        tuple(anomaly_ids),
        details or {},
        tuple(flags),
    )


def unknown(
    reason_en: str,
    reason_ar: str,
    rule_code: str,
    article: str,
    page: str,
    anomaly_ids: Iterable[str] = (),
    details: dict[str, Any] | None = None,
) -> Decision:
    return Decision(
        Status.UNKNOWN,
        reason_ar,
        reason_en,
        rule_code,
        article,
        page,
        tuple(anomaly_ids),
        details or {},
    )


def review_required(
    reason_en: str,
    reason_ar: str,
    rule_code: str,
    article: str,
    page: str,
    anomaly_ids: Iterable[str] = (),
    details: dict[str, Any] | None = None,
    flags: Iterable[str] = (),
) -> Decision:
    return Decision(
        Status.REVIEW_REQUIRED,
        reason_ar,
        reason_en,
        rule_code,
        article,
        page,
        tuple(anomaly_ids),
        details or {},
        tuple(flags),
    )
