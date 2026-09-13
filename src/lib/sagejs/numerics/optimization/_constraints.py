"""Internal nonlinear-constraint contracts for explicit optimization methods."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from ..model import NumericalConstraint, NumericalProblem


def normalize_constraints(
    constraints: Sequence[Any],
) -> list[NumericalConstraint]:
    """Normalize SciPy-shaped scalar constraints without evaluating callbacks."""
    if isinstance(constraints, (str, bytes, bytearray)):
        raise TypeError("constraints must be a sequence of mappings")
    if len(constraints) > 512:
        raise ValueError("at most 512 scalar nonlinear constraints are supported")
    answer: list[NumericalConstraint] = []
    for index, item in enumerate(constraints):
        if not isinstance(item, Mapping):
            raise TypeError(
                "constraint " + str(index) + " must be a mapping with type and fun"
            )
        raw_kind = item.get("type", item.get("kind"))
        kind = str(raw_kind).lower()
        if kind not in ("ineq", "eq"):
            raise ValueError(
                "constraint " + str(index) + " type must be 'ineq' or 'eq'"
            )
        function = item.get("fun", item.get("function"))
        if not callable(function):
            raise TypeError("constraint " + str(index) + " fun must be callable")
        try:
            tolerance = float(item.get("tolerance", 1.0e-8))
        except (TypeError, ValueError, OverflowError):
            raise ValueError(
                "constraint " + str(index) + " tolerance must be nonnegative"
            ) from None
        if not math.isfinite(tolerance) or tolerance < 0.0:
            raise ValueError(
                "constraint " + str(index) + " tolerance must be nonnegative"
            )
        answer.append(
            NumericalConstraint(
                "inequality" if kind == "ineq" else "equality",
                function,
                tolerance=tolerance,
            )
        )
    return answer


def problem_constraints(problem: NumericalProblem) -> list[NumericalConstraint]:
    """Return live scalar constraints from a numerical problem."""
    return problem.constraints


def constraint_records(
    constraints: Sequence[NumericalConstraint],
) -> list[dict[str, Any]]:
    """Return detached callback-free planning descriptors."""
    return [{"kind": item.kind, "tolerance": item.tolerance} for item in constraints]
