"""Validated one-dimensional adaptive numerical integration.

The public entry point is `integrate`.  It returns an `IntegrationResult`
whose termination status, error evidence, resource use, semantic trace, and
PlotSpec view remain available after the scalar value is inspected.
"""

from .adaptive import (
    INTEGRATION_CAPABILITY,
    integrate,
    integration_capabilities,
    integration_problem,
    plan_integration,
    solve_integration_problem,
)
from .result import IntegrationResult
from .visualization import integration_plot

__all__ = [
    "INTEGRATION_CAPABILITY",
    "IntegrationResult",
    "integrate",
    "integration_capabilities",
    "integration_plot",
    "integration_problem",
    "plan_integration",
    "solve_integration_problem",
]
