"""Canonical numerical results with statistics-specific PlotSpec views."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from sagejs.plotting import PlotSpec, Provenance, make_layer

from .._json import materialize_json, materialize_object
from ..diagnostics import NumericalDiagnostic
from ..model import (
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from ..trace import NumericalTrace


def _required_number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(name + " must be numeric")
    return float(value)


def _optional_number(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


class StatisticsResult(NumericalResult):
    """A canonical `NumericalResult` with statistical assumptions and plots."""

    def __init__(
        self,
        operation: str,
        *,
        success: bool,
        status: str,
        value: Any,
        method: str,
        validation: Mapping[str, Any],
        assumptions: Sequence[str] = (),
        diagnostics: Sequence[NumericalDiagnostic | Mapping[str, Any]] = (),
        trace: NumericalTrace | None = None,
        evaluations: int = 0,
        iterations: int = 0,
        elapsed_ms: float = 0.0,
        resource_budget: ResourceBudget | None = None,
        reproducibility: Mapping[str, Any] | None = None,
        domain_payload: Mapping[str, Any] | None = None,
    ) -> None:
        if not isinstance(operation, str) or operation == "":
            raise ValueError("operation must be nonempty")
        assumptions_record = tuple(str(item) for item in assumptions)
        replay_record = materialize_object(
            reproducibility, "$.statistics.reproducibility"
        )
        function_record: dict[str, Any] = {
            "kind": "statistics_operation",
            "replayable": replay_record.get("replayable") is True,
        }
        if replay_record:
            function_record["evidence"] = replay_record
        problem = NumericalProblem(
            "statistics",
            operation,
            function_record=function_record,
            method=method,
            resource_budget=resource_budget,
            trace_policy=None if trace is None else trace.policy,
            source_intent={"operation": operation, "method": method},
            metadata={"assumptions": list(assumptions_record)},
        )
        plan = NumericalPlan(
            problem,
            method=method,
            backend="ordinary-python",
            reason="The requested statistics method is implemented in ordinary Python.",
            capability={
                "domain": "statistics",
                "numeric_type": "binary64",
                "source_transparent": True,
            },
            fallback={
                "available": False,
                "reason": "The implementation is already the portable dynamic path.",
            },
            expected_resources={
                "bounded_by": problem.resource_budget.to_dict(),
            },
        )
        validation_record = NumericalValidation(
            str(validation.get("truth_level", "indeterminate")),
            bool(validation.get("passed", False)),
            checks=validation.get("checks", ()),
            residual=_optional_number(
                validation.get("residual", validation.get("residual_norm"))
            ),
            error_estimate=_optional_number(validation.get("error_estimate")),
            condition_estimate=_optional_number(
                validation.get(
                    "condition_estimate", validation.get("condition_indicator")
                )
            ),
        )
        payload = materialize_object(domain_payload, "$.statistics.domain_payload")
        payload["statistics_assumptions"] = list(assumptions_record)
        detached_value = materialize_json(value, "$.statistics.value")
        diagnostic_records = list(diagnostics)
        if status == "validation_failed":
            diagnostic_records.append(NumericalDiagnostic("validation_failed"))
        self._statistics_assumptions = assumptions_record
        super().__init__(
            problem,
            plan,
            success=success,
            status=status,
            value=detached_value,
            validation=validation_record,
            diagnostics=diagnostic_records,
            iterations=iterations,
            evaluations=evaluations,
            elapsed_ms=elapsed_ms,
            trace=trace,
            measurements={"statistics_operation": operation},
            provenance={
                "implementation": "sagejs.numerics.statistics",
                "implementation_kind": "ordinary_python",
                "source_transparent": True,
            },
            domain_payload=payload,
        )

    @property
    def operation(self) -> str:
        return self.problem.operation

    @property
    def value(self) -> Any:
        """Return a detached JSON-compatible view of the statistical value."""
        return materialize_json(self._value, "$.statistics.value")

    @property
    def assumptions(self) -> tuple[str, ...]:
        return self._statistics_assumptions

    def explain(self) -> str:
        lines = [super().explain()]
        if self._statistics_assumptions:
            lines.append("assumptions:")
            lines.extend("- " + value for value in self._statistics_assumptions)
        return "\n".join(lines)

    def to_dict(self) -> dict[str, Any]:
        """Return the canonical result schema as a fully detached object."""
        return materialize_object(super().to_dict(), "$.statistics.result")

    def to_plot_spec(self) -> PlotSpec:
        """Return a semantic plot derived solely from recorded evidence."""
        plot = self._domain_payload.get("plot")
        if not isinstance(plot, dict):
            raise ValueError("this result has no PlotSpec-ready payload")
        kind = plot.get("kind")
        if kind == "regression":
            x = plot["x"]
            y = plot["y"]
            line_x = plot["line_x"]
            line_y = plot["line_y"]
            layers = [
                make_layer(
                    "point",
                    {"x": x, "y": y},
                    ordinal=0,
                    namespace="statistics",
                    source_intent={"operation": self.operation, "role": "observed"},
                    style={"color": "#3366cc", "size": 8},
                    legend={"label": "observed", "show": True},
                ),
                make_layer(
                    "line",
                    {"x": line_x, "y": line_y},
                    ordinal=1,
                    namespace="statistics",
                    source_intent={"operation": self.operation, "role": "fitted"},
                    style={"color": "#dd8452", "width": 2},
                    legend={"label": self.method, "show": True},
                ),
            ]
            axes = {"x": {"label": "x"}, "y": {"label": "y"}}
        elif kind == "interval":
            estimate = _required_number(plot["estimate"], "plot estimate")
            lower = _required_number(plot["lower"], "plot lower bound")
            upper = _required_number(plot["upper"], "plot upper bound")
            layers = [
                make_layer(
                    "line",
                    {"x": [lower, upper], "y": [0.0, 0.0]},
                    ordinal=0,
                    namespace="statistics",
                    source_intent={"operation": self.operation, "role": "interval"},
                    style={"color": "#3366cc", "width": 3},
                ),
                make_layer(
                    "point",
                    {"x": [estimate], "y": [0.0]},
                    ordinal=1,
                    namespace="statistics",
                    source_intent={"operation": self.operation, "role": "estimate"},
                    style={"color": "#dd8452", "size": 10},
                ),
            ]
            axes = {
                "x": {"label": str(plot.get("parameter", "estimate"))},
                "y": {"visible": False},
            }
        elif kind == "distribution":
            layers = [
                make_layer(
                    "line",
                    {"x": plot["x"], "y": plot["y"]},
                    ordinal=0,
                    namespace="statistics",
                    source_intent={
                        "operation": self.operation,
                        "role": plot["function"],
                    },
                    style={"color": "#3366cc", "width": 2},
                )
            ]
            axes = {"x": {"label": "x"}, "y": {"label": plot["function"]}}
        else:
            raise ValueError("unknown statistics plot payload kind")
        return PlotSpec(
            2,
            layers,
            axes_or_scene=axes,
            viewport={"responsive": True},
            provenance=Provenance(
                "sagejs.numerics.statistics",
                source_language="python",
                constructor="StatisticsResult.to_plot_spec",
                metadata={"operation": self.operation, "method": self.method},
            ),
        )

    plot = to_plot_spec

    def __repr__(self) -> str:
        return (
            "StatisticsResult(operation='"
            + self.operation
            + "', status='"
            + self.status
            + "')"
        )
