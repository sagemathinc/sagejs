"""Domain result record for validated adaptive integration."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from .._json import materialize_object
from ..diagnostics import NumericalDiagnostic
from ..model import (
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
)
from ..trace import NumericalTrace


class IntegrationResult(NumericalResult):
    """A numerical result with quadrature-specific error evidence.

    `status` retains the small shared result vocabulary.  `stop_reason`
    classifies integration-specific outcomes such as a depth, interval, or
    workspace-memory limit without weakening the shared schema.
    """

    def __init__(
        self,
        problem: NumericalProblem,
        plan: NumericalPlan,
        *,
        success: bool,
        status: str,
        stop_reason: str,
        value: float | None,
        validation: NumericalValidation,
        estimated_error: float | None,
        requested_tolerance: float | None,
        final_intervals: Sequence[Mapping[str, Any]],
        diagnostics: Sequence[NumericalDiagnostic | Mapping[str, Any]] = (),
        iterations: int = 0,
        evaluations: int = 0,
        elapsed_ms: float = 0.0,
        trace: NumericalTrace | None = None,
        measurements: Mapping[str, Any] | None = None,
        provenance: Mapping[str, Any] | None = None,
        domain_payload: Mapping[str, Any] | None = None,
    ) -> None:
        integration_payload = materialize_object(
            domain_payload, "$.integration_result.domain_payload"
        )
        super().__init__(
            problem,
            plan,
            success=success,
            status=status,
            value=value,
            validation=validation,
            diagnostics=diagnostics,
            iterations=iterations,
            evaluations=evaluations,
            elapsed_ms=elapsed_ms,
            trace=trace,
            measurements=measurements,
            provenance=provenance,
            domain_payload=integration_payload,
        )
        self._integration_stop_reason = str(stop_reason)
        self._integration_estimated_error = estimated_error
        self._integration_requested_tolerance = requested_tolerance
        self._integration_final_intervals = tuple(
            materialize_object(value, "$.integration_result.final_intervals")
            for value in final_intervals
        )
        self._integration_elapsed_ms = float(elapsed_ms)
        self._integration_domain_payload = integration_payload

    @property
    def stop_reason(self) -> str:
        """Return the exact integration-specific termination classification."""
        return self._integration_stop_reason

    @property
    def error_estimate(self) -> float | None:
        """Return error evidence for the value or retained solver estimate."""
        return self._integration_estimated_error

    @property
    def requested_tolerance(self) -> float | None:
        """Return the final combined absolute/relative target."""
        return self._integration_requested_tolerance

    @property
    def final_intervals(self) -> tuple[dict[str, Any], ...]:
        """Return detached records for the final adaptive partition."""
        return tuple(
            materialize_object(value, "$.integration_result.final_intervals")
            for value in self._integration_final_intervals
        )

    def explain(self) -> str:
        """Explain method choice, evidence, refinement, and failure honestly."""
        transform = "direct finite interval"
        plan_record = self.plan_record.to_dict()
        capability = plan_record.get("capability")
        if isinstance(capability, dict):
            selected_transform = capability.get("selected_transform")
            if isinstance(selected_transform, str):
                transform = selected_transform.replace("_", " ")
        lines = [
            "adaptive Gauss-Kronrod definite integral",
            "status: " + self.stop_reason,
            "method: " + self.method + "; " + transform,
            "estimate: " + ("unavailable" if self.value is None else str(self.value)),
        ]
        solver_estimate = self._integration_domain_payload.get("solver_estimate")
        solver_estimate_semantics = self._integration_domain_payload.get(
            "solver_estimate_semantics"
        )
        if (
            self.value is None
            and solver_estimate is not None
            and solver_estimate_semantics == "unvalidated_best_complete_partition"
        ):
            lines.append(
                "unvalidated best-complete-partition estimate: "
                + str(solver_estimate)
                + "; suppressed as the result value"
            )
        if self.error_estimate is not None:
            lines.append(
                "reported absolute-error evidence: " + str(self.error_estimate)
            )
        if self.requested_tolerance is not None:
            lines.append(
                "requested absolute/relative target: " + str(self.requested_tolerance)
            )
        initial_partition = None
        retained_subdivisions = 0
        for event in self.trace.events:
            data = event.data
            if event.kind == "phase" and data.get("phase") == "initial_partition":
                active = data.get("active_intervals")
                if isinstance(active, int) and not isinstance(active, bool):
                    initial_partition = active
            elif event.kind == "iteration":
                retained_subdivisions += 1
        if initial_partition is not None:
            lines.append(
                "initial partition: "
                + str(initial_partition)
                + " complete interval rule"
                + ("" if initial_partition == 1 else "s")
                + " established atomically"
            )
        elif self._integration_final_intervals:
            components = {
                str(record.get("component"))
                for record in self._integration_final_intervals
            }
            lines.append(
                "initial partition: trace event unavailable; final evidence spans "
                + str(len(components))
                + " component"
                + ("" if len(components) == 1 else "s")
            )
        elif self.stop_reason == "zero_interval":
            lines.append(
                "initial partition: unnecessary for an exact zero-width interval"
            )
        else:
            lines.append("initial partition: no complete partition was retained")
        lines.append(
            "partition: "
            + str(len(self._integration_final_intervals))
            + " active intervals after "
            + str(self.iterations)
            + " subdivisions"
        )
        if self.iterations > 0:
            lines.append(
                "refinement: repeatedly bisected the retained interval with the "
                + "largest local error; "
                + str(retained_subdivisions)
                + " subdivision event"
                + (" was" if retained_subdivisions == 1 else "s were")
                + " retained in the bounded trace"
            )
        else:
            lines.append(
                "refinement: no adaptive subdivision was required or completed"
            )
        lines.append(
            "resources: "
            + str(self.evaluations)
            + " callback evaluations; "
            + str(round(self._integration_elapsed_ms, 3))
            + " ms"
        )
        validation = self.validation.to_dict()
        checks = validation.get("checks")
        independent = None
        if isinstance(checks, list):
            for check in checks:
                if (
                    isinstance(check, dict)
                    and check.get("kind") == "independent_gauss_legendre_8"
                ):
                    independent = check
        if isinstance(independent, dict):
            independent_line = (
                "independent check: Gauss-Legendre 8 on the final partition; "
                + (
                    "agreement passed"
                    if independent.get("passed") is True
                    else "agreement did not pass"
                )
            )
            difference = self._integration_domain_payload.get("independent_difference")
            independent_estimate = self._integration_domain_payload.get(
                "independent_estimate"
            )
            if independent_estimate is not None:
                independent_line += "; independent estimate " + str(
                    independent_estimate
                )
            if difference is not None:
                independent_line += "; absolute difference " + str(difference)
            lines.append(independent_line)
        if not self.success:
            solver_stop_reason = self._integration_domain_payload.get(
                "solver_stop_reason"
            )
            reason = {
                "maximum_evaluations": "the callback evaluation budget was exhausted",
                "maximum_elapsed_time": "the hard elapsed-time budget was exhausted",
                "maximum_intervals": "the active-interval budget was exhausted",
                "maximum_depth": "the selected interval reached the subdivision-depth limit",
                "maximum_memory": "the conservative workspace-memory budget was exhausted",
                "interval_too_small": "no representable interior refinement node remained",
                "roundoff_detected": "repeated subdivision no longer reduced the error evidence",
                "cancelled": "the cancellation callback requested termination",
                "callback_error": "a user callback raised an exception",
                "nonfinite_evaluation": "a required callback evaluation was nonfinite",
                "validation_failed": "the independent rule did not agree within the requested tolerance",
                "invalid_problem": "the requested problem is outside the supported contract",
            }.get(
                self.stop_reason, "the solver did not establish validated convergence"
            )
            if solver_stop_reason == "converged" and self.stop_reason != "converged":
                lines.append(
                    "why this failed: the adaptive solver met its embedded-error "
                    + "target, but "
                    + reason
                )
            else:
                lines.append("why this failed: " + reason)
        if self.trace.truncated:
            lines.append(
                "trace: bounded policy retained a deterministic subset; missing "
                + "iterations are omitted rather than interpolated"
            )
        for diagnostic in self.diagnostics:
            lines.append("diagnostic: " + diagnostic.code)
        return "\n".join(lines)

    def plot(self, view: str = "partition") -> Any:
        """Return a retained-evidence partition or convergence PlotSpec."""
        from .visualization import integration_plot

        return integration_plot(self, view=view)

    def convergence_plot(self) -> Any:
        """Return the retained global error and tolerance history."""
        from .visualization import integration_convergence_plot

        return integration_convergence_plot(self)

    def to_plot_spec(self, view: str = "partition") -> Any:
        """Return the canonical static semantic view for the selected view."""
        return self.plot(view=view)

    def animate(self) -> Any:
        """Return a bounded PlotAnimation of retained refinement events."""
        from .visualization import integration_animation

        return integration_animation(self)

    def to_animation(self) -> Any:
        """Return the canonical retained-evidence refinement animation."""
        return self.animate()
