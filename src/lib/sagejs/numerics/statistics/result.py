"""Structured statistics results and renderer-neutral PlotSpec views."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from sagejs.plotting import PlotSpec, Provenance, make_layer

from .._json import canonical_json, materialize_json, materialize_object
from ..trace import NumericalTrace


STATISTICS_SCHEMA_VERSION = 1


def _required_number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(name + " must be numeric")
    return float(value)


class StatisticsResult:
    """One inspectable statistical computation with assumptions and checks."""

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
        diagnostics: Sequence[Mapping[str, Any]] = (),
        trace: NumericalTrace | None = None,
        evaluations: int = 0,
        iterations: int = 0,
        elapsed_ms: float = 0.0,
        reproducibility: Mapping[str, Any] | None = None,
        domain_payload: Mapping[str, Any] | None = None,
    ) -> None:
        if not operation:
            raise ValueError("operation must be nonempty")
        if not status:
            raise ValueError("status must be nonempty")
        self._operation = operation
        self._success = bool(success)
        self._status = status
        self._value = materialize_json(value, "$.statistics.value")
        self._method = method
        self._validation = materialize_object(validation, "$.statistics.validation")
        self._assumptions = tuple(str(value) for value in assumptions)
        self._diagnostics = tuple(
            materialize_object(value, "$.statistics.diagnostic")
            for value in diagnostics
        )
        self._trace = trace
        self._evaluations = int(evaluations)
        self._iterations = int(iterations)
        self._elapsed_ms = float(elapsed_ms)
        self._reproducibility = materialize_object(
            reproducibility, "$.statistics.reproducibility"
        )
        self._domain_payload = materialize_object(
            domain_payload, "$.statistics.domain_payload"
        )

    @property
    def operation(self) -> str:
        return self._operation

    @property
    def success(self) -> bool:
        return self._success

    @property
    def status(self) -> str:
        return self._status

    @property
    def value(self) -> Any:
        return materialize_json(self._value, "$.statistics.value")

    @property
    def method(self) -> str:
        return self._method

    @property
    def validation(self) -> dict[str, Any]:
        return materialize_object(self._validation, "$.statistics.validation")

    @property
    def assumptions(self) -> tuple[str, ...]:
        return self._assumptions

    @property
    def diagnostics(self) -> tuple[dict[str, Any], ...]:
        return tuple(
            materialize_object(value, "$.statistics.diagnostic")
            for value in self._diagnostics
        )

    @property
    def trace(self) -> NumericalTrace | None:
        return self._trace

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": STATISTICS_SCHEMA_VERSION,
            "domain": "statistics",
            "operation": self._operation,
            "success": self._success,
            "status": self._status,
            "value": self.value,
            "validation": self.validation,
            "diagnostics": [dict(value) for value in self._diagnostics],
            "assumptions": list(self._assumptions),
            "method": self._method,
            "backend": "ordinary-python",
            "precision": {"kind": "binary64", "bits": 53},
            "iterations": self._iterations,
            "evaluations": self._evaluations,
            "elapsed_ms": self._elapsed_ms,
            "trace": None if self._trace is None else self._trace.to_dict(),
            "reproducibility": materialize_object(
                self._reproducibility, "$.statistics.reproducibility"
            ),
            "domain_payload": materialize_object(
                self._domain_payload, "$.statistics.domain_payload"
            ),
            "provenance": {
                "implementation": "sagejs.numerics.statistics",
                "implementation_kind": "ordinary_python",
                "source_transparent": True,
            },
        }

    def to_json(self) -> str:
        return canonical_json(self.to_dict())

    def explain(self) -> str:
        lines = [
            self._method + " " + self._operation.replace("_", " "),
            "status: " + self._status,
            "validation: "
            + str(self._validation.get("truth_level", "indeterminate"))
            + ("; passed" if self._validation.get("passed") else "; not passed"),
        ]
        if self._assumptions:
            lines.append("assumptions:")
            lines.extend("- " + value for value in self._assumptions)
        for item in self._diagnostics:
            lines.append("diagnostic: " + str(item.get("code", "unknown")))
        return "\n".join(lines)

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
                    source_intent={"operation": self._operation, "role": "observed"},
                    style={"color": "#3366cc", "size": 8},
                    legend={"label": "observed", "show": True},
                ),
                make_layer(
                    "line",
                    {"x": line_x, "y": line_y},
                    ordinal=1,
                    namespace="statistics",
                    source_intent={"operation": self._operation, "role": "fitted"},
                    style={"color": "#dd8452", "width": 2},
                    legend={"label": self._method, "show": True},
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
                    source_intent={"operation": self._operation, "role": "interval"},
                    style={"color": "#3366cc", "width": 3},
                ),
                make_layer(
                    "point",
                    {"x": [estimate], "y": [0.0]},
                    ordinal=1,
                    namespace="statistics",
                    source_intent={"operation": self._operation, "role": "estimate"},
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
                        "operation": self._operation,
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
                metadata={"operation": self._operation, "method": self._method},
            ),
        )

    plot = to_plot_spec

    def __repr__(self) -> str:
        return (
            "StatisticsResult(operation='"
            + self._operation
            + "', status='"
            + self._status
            + "')"
        )
