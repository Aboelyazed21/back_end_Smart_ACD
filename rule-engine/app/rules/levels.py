from __future__ import annotations

from ..data import RegulationData


def level_for_credits(data: RegulationData, passed_credits: int) -> dict[str, object]:
    """Passed-credit boundaries: 0-25, 26-61, 62-95, 96-135."""
    for row in data.levels:
        lo = int(row["min_credits"])
        hi = row["max_exclusive"]
        if passed_credits >= lo and (hi is None or passed_credits < int(hi)):
            return {
                "level": int(row["level"]),
                "name": row.get("name", ""),
                "min_credits": lo,
                "max_exclusive": hi,
            }
    return {"level": 4, "name": "Senior", "min_credits": 96, "max_exclusive": None}


def next_level_credits(data: RegulationData, current_level: int) -> int | None:
    for row in data.levels:
        if int(row["level"]) == current_level + 1:
            return int(row["min_credits"])
    return None


def would_promote(data: RegulationData, passed_credits: int, added_credits: int) -> bool:
    current = int(level_for_credits(data, passed_credits)["level"])
    after = int(level_for_credits(data, passed_credits + added_credits)["level"])
    return after > current
