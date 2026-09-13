"""Agent-first structured numerical computing for Sage.js."""

from .capabilities import capabilities, describe, plan, supports
from .diagnostics import NumericalDiagnostic, diagnostic_registry
from .model import (
    NUMERICAL_SCHEMA_VERSION,
    STATUS_CODES,
    TRUTH_LEVELS,
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from .roots import find_root, root_problem, solve_root_problem
from .trace import (
    TRACE_LEVELS,
    TRACE_SCHEMA_VERSION,
    NumericalTrace,
    TraceEvent,
    TracePolicy,
)

__all__ = [
    "NUMERICAL_SCHEMA_VERSION",
    "STATUS_CODES",
    "TRACE_LEVELS",
    "TRACE_SCHEMA_VERSION",
    "TRUTH_LEVELS",
    "NumericalDiagnostic",
    "NumericalPlan",
    "NumericalProblem",
    "NumericalResult",
    "NumericalTrace",
    "NumericalValidation",
    "ResourceBudget",
    "TraceEvent",
    "TracePolicy",
    "capabilities",
    "describe",
    "diagnostic_registry",
    "find_root",
    "plan",
    "root_problem",
    "solve_root_problem",
    "supports",
]
