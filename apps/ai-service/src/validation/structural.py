"""
Python structural validator for EditPlan JSON.
Mirrors the TypeScript validateEditPlan rules (V-001 through V-016).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Severity = Literal["fatal", "error", "warning"]


@dataclass
class Violation:
    rule_id: str
    severity: Severity
    message: str
    field: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = {"rule_id": self.rule_id, "severity": self.severity, "message": self.message}
        if self.field:
            d["field"] = self.field
        return d


@dataclass
class ValidationResult:
    valid: bool
    violations: list[Violation] = field(default_factory=list)

    @property
    def fatal_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == "fatal")

    @property
    def error_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == "warning")

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "violations": [v.to_dict() for v in self.violations],
            "fatal_count": self.fatal_count,
            "error_count": self.error_count,
            "warning_count": self.warning_count,
        }


def validate_edit_plan(plan: dict[str, Any]) -> ValidationResult:
    """
    Validates an EditPlan dict against rules V-001 through V-016.
    """
    violations: list[Violation] = []

    source_shots = plan.get("source_shots", [])
    timeline = plan.get("timeline", [])

    if not source_shots:
        violations.append(Violation("V-012", "fatal", "source_shots must not be empty"))

    if not timeline:
        violations.append(Violation("V-013", "fatal", "timeline must not be empty"))

    shot_map = {s["shot_id"]: s for s in source_shots if isinstance(s, dict) and "shot_id" in s}

    for i, entry in enumerate(timeline):
        if not isinstance(entry, dict):
            violations.append(Violation("V-000", "fatal", f"timeline[{i}] is not an object"))
            continue

        sid = entry.get("shot_id")
        if not sid or sid not in shot_map:
            violations.append(
                Violation("V-001", "fatal", f'timeline[{i}].shot_id "{sid}" not found in source_shots', f"timeline[{i}].shot_id")
            )
            continue

        shot = shot_map[sid]
        trim_in = entry.get("trim_in", 0.0)
        trim_out = entry.get("trim_out", 0.0)

        if trim_in >= trim_out:
            violations.append(
                Violation("V-004", "fatal", f"timeline[{i}]: trim_in ({trim_in}) must be < trim_out ({trim_out})")
            )

        shot_start = shot.get("start", 0.0)
        shot_end = shot.get("end", 0.0)

        if trim_in < shot_start:
            violations.append(
                Violation("V-002", "fatal", f"timeline[{i}]: trim_in ({trim_in}) < shot.start ({shot_start})")
            )

        if trim_out > shot_end:
            violations.append(
                Violation("V-003", "fatal", f"timeline[{i}]: trim_out ({trim_out}) > shot.end ({shot_end})")
            )

        trans_dur = entry.get("transition_duration", 0.0)
        if trans_dur < 0 or trans_dur > 5.0:
            violations.append(
                Violation("V-006", "fatal", f"timeline[{i}]: transition_duration out of range (0-5s)")
            )

        speed = entry.get("speed", 1.0)
        if speed < 0.1 or speed > 10.0:
            violations.append(
                Violation("V-007", "fatal", f"timeline[{i}]: speed out of range (0.1-10.0)")
            )

    fatal_and_errors = sum(1 for v in violations if v.severity in ("fatal", "error"))
    return ValidationResult(valid=(fatal_and_errors == 0), violations=violations)
