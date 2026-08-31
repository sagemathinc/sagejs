"""Domain result record for validated adaptive integration."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

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
            domain_payload=domain_payload,
        )
        self._integration_stop_reason = str(stop_reason)
        self._integration_estimated_error = estimated_error
        self._integration_requested_tolerance = requested_tolerance
        self._integration_final_intervals = tuple(
            dict(value) for value in final_intervals
        )
        self._integration_elapsed_ms = float(elapsed_ms)

    @property
    def stop_reason(self) -> str:
        """Return the exact integration-specific termination classification."""
        return self._integration_stop_reason

    @property
    def error_estimate(self) -> float | None:
        """Return the conservative reported absolute-error evidence."""
        return self._integration_estimated_error

    @property
    def requested_tolerance(self) -> float | None:
        """Return the final combined absolute/relative target."""
        return self._integration_requested_tolerance

    @property
    def final_intervals(self) -> tuple[dict[str, Any], ...]:
        """Return detached records for the final adaptive partition."""
        return tuple(dict(value) for value in self._integration_final_intervals)

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
        if self.error_estimate is not None:
            lines.append(
                "reported absolute-error evidence: " + str(self.error_estimate)
            )
        if self.requested_tolerance is not None:
            lines.append(
                "requested absolute/relative target: " + str(self.requested_tolerance)
            )
        lines.append(
            "partition: "
            + str(len(self._integration_final_intervals))
            + " active intervals after "
            + str(self.iterations)
            + " subdivisions"
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
            lines.append(
                "independent check: Gauss-Legendre 8 on the final partition; "
                + (
                    "agreement passed"
                    if independent.get("passed") is True
                    else "agreement did not pass"
                )
            )
        if self.trace.truncated:
            lines.append("trace: bounded policy retained a deterministic subset")
        for diagnostic in self.diagnostics:
            lines.append("diagnostic: " + diagnostic.code)
        return "\n".join(lines)

    def plot(self) -> Any:
        """Return a PlotSpec showing the final local-error allocation."""
        from .visualization import integration_plot

        return integration_plot(self)
