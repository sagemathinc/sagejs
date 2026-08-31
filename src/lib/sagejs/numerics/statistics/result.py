"""Canonical numerical results with statistics-specific explanations."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from sagejs.plotting import PlotAnimation, PlotSpec

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

    def explanation(self) -> dict[str, Any]:
        """Return a detached structured interpretation of recorded evidence."""
        value = self.value
        interpretation: list[str] = []
        limitations: list[str] = []
        if not self.success:
            interpretation.append(
                "No successful statistical claim is made because execution ended with status "
                + self.status
                + "."
            )
        elif self.operation == "descriptive_statistics" and isinstance(value, dict):
            interpretation.append(
                "The recorded sample has center "
                + str(value.get("mean"))
                + " and standard deviation "
                + str(value.get("standard_deviation"))
                + "."
            )
            limitations.append(
                "This summary describes the supplied observations; it does not establish representativeness or causality."
            )
        elif self.operation == "distribution_curve" and isinstance(value, dict):
            interpretation.append(
                "The curve evaluates the recorded "
                + str(value.get("function"))
                + " within explicit finite display bounds."
            )
            limitations.append(
                "Display samples are a visualization and do not widen the distribution's qualified parameter or tail envelope."
            )
        elif self.operation == "random_sample" and isinstance(value, list):
            interpretation.append(
                str(len(value))
                + " draws were completed in replay order using the recorded generator state."
            )
            limitations.append(
                "A realized sample does not by itself demonstrate distributional quality or cryptographic security."
            )
        elif self.operation in (
            "mean_confidence_interval",
            "one_sample_t_test",
            "two_sample_t_test",
        ) and isinstance(value, dict):
            if "p_value" in value:
                interpretation.append(
                    "The p-value "
                    + str(value.get("p_value"))
                    + " is a tail probability under the null model, not the probability that the null is true."
                )
                interpretation.append(
                    "The recorded decision at the configured alpha is "
                    + ("reject." if value.get("reject_at_alpha") else "do not reject.")
                )
            else:
                interpretation.append(
                    "The interval reports a long-run coverage procedure for the population mean."
                )
            limitations.append(
                "The arithmetic records assumptions but cannot establish independence, normality, or representative sampling."
            )
        elif self.operation.endswith("regression") and isinstance(value, dict):
            interpretation.append(
                "The fitted line has slope "
                + str(value.get("slope"))
                + " and intercept "
                + str(value.get("intercept"))
                + "."
            )
            if self.operation == "huber_regression":
                weights = value.get("weights")
                if isinstance(weights, list):
                    downweighted = sum(float(weight) < 0.8 for weight in weights)
                    interpretation.append(
                        str(downweighted)
                        + " observations have final Huber weight below 0.8."
                    )
                limitations.append(
                    "The robust coefficients do not imply classical p-values or immunity to leverage points."
                )
            elif self.operation == "theil_sen_regression":
                limitations.append(
                    "The robust slope interval does not provide an intercept interval or predictive validation."
                )
            else:
                limitations.append(
                    "In-sample fit does not establish predictive performance, absence of overfit, association as causation, or valid extrapolation."
                )
        else:
            interpretation.append(
                "The operation completed with independently recorded validation evidence."
            )
        if not self.validation.passed:
            limitations.append(
                "Independent validation did not pass, so no validated-approximate success claim is available."
            )
        return materialize_object(
            {
                "schema_version": 1,
                "kind": "statistics-explanation",
                "operation": self.operation,
                "headline": self.method + " " + self.operation.replace("_", " "),
                "outcome": {
                    "success": self.success,
                    "status": self.status,
                },
                "method": self.method,
                "interpretation": interpretation,
                "evidence": {
                    "truth_level": self.validation.truth_level,
                    "validation_passed": self.validation.passed,
                    "checks": self.validation.to_dict()["checks"],
                    "evaluations": self.evaluations,
                    "iterations": self.iterations,
                    "retained_trace_events": len(self.trace.events),
                    "trace_truncated": self.trace.truncated,
                },
                "assumptions": list(self._statistics_assumptions),
                "limitations": limitations,
                "diagnostics": [value.to_dict() for value in self.diagnostics],
            },
            "$.statistics.explanation",
        )

    structured_explanation = explanation

    def explain(self) -> str:
        lines = [super().explain()]
        record = self.explanation()
        interpretations = record["interpretation"]
        if isinstance(interpretations, list) and interpretations:
            lines.append("interpretation:")
            lines.extend("- " + str(value) for value in interpretations)
        if self._statistics_assumptions:
            lines.append("assumptions:")
            lines.extend("- " + value for value in self._statistics_assumptions)
        limitations = record["limitations"]
        if isinstance(limitations, list) and limitations:
            lines.append("limitations:")
            lines.extend("- " + str(value) for value in limitations)
        return "\n".join(lines)

    def to_dict(self) -> dict[str, Any]:
        """Return the canonical result schema as a fully detached object."""
        record = materialize_object(super().to_dict(), "$.statistics.result")
        payload = record["domain_payload"]
        if not isinstance(payload, dict):
            raise TypeError("canonical domain payload must be a mapping")
        payload["explanation"] = self.explanation()
        return record

    def to_plot_spec(self) -> PlotSpec:
        """Return a semantic plot derived solely from recorded evidence."""
        from .visualization import statistics_plot

        return statistics_plot(self)

    plot = to_plot_spec

    def to_plot_animation(self) -> PlotAnimation:
        """Return a resource-bounded animation of recorded semantic evidence."""
        from .visualization import statistics_animation

        return statistics_animation(self)

    animate = to_plot_animation

    def __repr__(self) -> str:
        return (
            "StatisticsResult(operation='"
            + self.operation
            + "', status='"
            + self.status
            + "')"
        )
