"""Spectral result explanations and lazy semantic visualization entry points."""

from __future__ import annotations

from typing import Any

from .._json import canonical_json
from ..model import NumericalResult

SPECTRAL_EXPLANATION_SCHEMA_VERSION = 1


def _operation_title(operation: str) -> str:
    return {
        "symmetric_eigen": "Hermitian eigensystem",
        "general_eigen": "general eigensystem",
        "singular_value_decomposition": "reduced singular-value decomposition",
        "fourier_transform": "forward discrete Fourier transform",
        "inverse_fourier_transform": "inverse discrete Fourier transform",
        "convolution": "linear convolution",
        "sparse_linear_solve": "sparse linear solve",
        "sparse_dominant_eigen": "sparse dominant eigensystem",
    }.get(operation, operation.replace("_", " "))


def _interpretation(operation: str) -> str:
    return {
        "symmetric_eigen": (
            "Eigenvalues are ordered real spectral coordinates and the returned "
            "eigenvectors form an independently checked orthonormal basis."
        ),
        "general_eigen": (
            "Right eigenvectors are returned only when their complete basis and "
            "the complex Schur factors pass independent conditioning and "
            "reconstruction checks."
        ),
        "singular_value_decomposition": (
            "Singular values measure directional amplification; a steep or "
            "zero-ending spectrum exposes numerical rank and conditioning."
        ),
        "fourier_transform": (
            "DFT bins are frequencies modulo one cycle per sample. Without a "
            "physical sample rate or band-limit, distinct continuous frequencies "
            "in the same alias class cannot be distinguished."
        ),
        "inverse_fourier_transform": (
            "The inverse DFT reconstructs one finite periodic sample record; its "
            "frequency labels remain defined modulo one cycle per sample."
        ),
        "convolution": (
            "The reported coefficients are linear convolution. FFT execution uses "
            "zero padding so circular wraparound does not alias output terms."
        ),
        "sparse_linear_solve": (
            "The returned vector is accepted only after an independent residual "
            "and normwise backward-error check."
        ),
        "sparse_dominant_eigen": (
            "Power iteration is attempted only when separated Hermitian "
            "Gershgorin intervals certify a unique dominant eigenvalue magnitude."
        ),
    }.get(operation, "The result carries operation-specific validation evidence.")


def _has_convergence_trace(result: SpectralResult) -> bool:
    metrics = (
        "backward_residual",
        "residual_norm",
        "off_diagonal_norm",
        "lower_triangle_norm",
        "maximum_column_correlation",
        "coupling_norm",
        "block_size",
    )
    return any(
        event.kind in ("iteration", "phase")
        and any(
            isinstance(event.data.get(metric), (int, float))
            and not isinstance(event.data.get(metric), bool)
            for metric in metrics
        )
        for event in result.trace.events
    )


def _available_plots(
    operation: str, has_value: bool, has_convergence: bool
) -> list[str]:
    answer = ["convergence"] if has_convergence else []
    if operation in ("symmetric_eigen", "general_eigen", "sparse_dominant_eigen"):
        if has_value:
            answer.insert(0, "eigenvalues")
        if operation == "general_eigen":
            answer.append("conditioning")
    elif operation == "singular_value_decomposition":
        if has_value:
            answer[:0] = ["singular_values", "conditioning"]
    elif operation in ("fourier_transform", "inverse_fourier_transform"):
        if has_value:
            answer[:0] = ["spectrum", "aliasing"]
    elif operation == "convolution":
        if has_value:
            answer[:0] = ["coefficients", "aliasing"]
    return answer


def _failure_modes(result: SpectralResult) -> list[dict[str, Any]]:
    operation = result.problem.operation
    validation = result.validation.to_dict()
    checks_value = validation.get("checks")
    checks = checks_value if isinstance(checks_value, list) else []
    diagnostic_codes = [diagnostic.code for diagnostic in result.diagnostics]
    conditioning_checks = (
        "eigenbasis_reciprocal_condition",
        "eigenbasis_inverse_residual",
        "eigenbasis_reconstruction",
        "left_singular_vector_orthogonality",
        "right_singular_vector_orthogonality",
    )
    conditioning_detected = "ill_conditioned" in diagnostic_codes or any(
        isinstance(check, dict)
        and check.get("kind") in conditioning_checks
        and check.get("passed") is not True
        for check in checks
    )
    if operation == "singular_value_decomposition" and isinstance(result.value, dict):
        singular_values = result.value.get("singular_values")
        if isinstance(singular_values, list) and singular_values:
            largest = float(singular_values[0])
            smallest = float(singular_values[-1])
            conditioning_detected = (
                conditioning_detected
                or smallest == 0.0
                or (smallest > 0.0 and largest / smallest >= 1.0e12)
            )
    convergence_detected = result.status in (
        "maximum_iterations",
        "maximum_evaluations",
        "maximum_elapsed_time",
        "stagnation",
        "cancelled",
    )
    modes: list[dict[str, Any]] = []
    if operation in ("general_eigen", "singular_value_decomposition"):
        modes.append(
            {
                "kind": "conditioning",
                "detected": conditioning_detected,
                "visualizer": "conditioning",
                "explanation": (
                    "A small basis reciprocal condition or collapsed singular "
                    "spectrum makes componentwise spectral answers sensitive to "
                    "binary64 perturbations."
                ),
            }
        )
    modes.append(
        {
            "kind": "convergence",
            "detected": convergence_detected,
            "visualizer": "convergence",
            "explanation": (
                "Retained semantic trace metrics show progress toward the method's "
                "residual, coupling, correlation, or stage-completion target."
            ),
        }
    )
    if operation in (
        "fourier_transform",
        "inverse_fourier_transform",
        "convolution",
    ):
        modes.append(
            {
                "kind": "aliasing",
                "detected": False,
                "visualizer": "aliasing",
                "explanation": (
                    "Aliasing is a sampling or circular-wrap interpretation issue, "
                    "not a failure inferable from finite coefficients alone."
                ),
            }
        )
    return modes


class SpectralResult(NumericalResult):
    """Numerical result with spectral explanations and renderer-neutral views."""

    @property
    def domain_payload(self) -> dict[str, Any]:
        record = self.to_dict().get("domain_payload")
        return dict(record) if isinstance(record, dict) else {}

    def explanation(self) -> dict[str, Any]:
        """Return a versioned JSON-safe explanation of semantics and evidence."""
        operation = self.problem.operation
        validation = self.validation.to_dict()
        checks = validation.get("checks")
        evidence = list(checks) if isinstance(checks, list) else []
        warnings = [diagnostic.to_dict() for diagnostic in self.diagnostics]
        has_convergence = _has_convergence_trace(self)
        plots = _available_plots(operation, self.value is not None, has_convergence)
        result_animation = self.value is not None and operation in (
            "symmetric_eigen",
            "general_eigen",
            "sparse_dominant_eigen",
            "singular_value_decomposition",
            "fourier_transform",
            "inverse_fourier_transform",
            "convolution",
        )
        animation_kinds: list[str] = []
        if has_convergence:
            animation_kinds.append("convergence")
        if result_animation:
            animation_kinds.append("result")
        return {
            "schema_version": SPECTRAL_EXPLANATION_SCHEMA_VERSION,
            "domain": "spectral",
            "operation": operation,
            "title": _operation_title(operation),
            "summary": self.method
            + " returned "
            + self.status
            + (" with validated evidence." if self.success else " without success."),
            "status": self.status,
            "success": self.success,
            "method": self.method,
            "backend": self.backend,
            "truth_level": self.validation.truth_level,
            "interpretation": _interpretation(operation),
            "evidence": evidence,
            "warnings": warnings,
            "failure_modes": _failure_modes(self),
            "resources": {
                "iterations": self.iterations,
                "evaluations": self.evaluations,
                "retained_trace_events": len(self.trace.events),
                "trace_truncated": self.trace.truncated,
            },
            "visualization": {
                "available_static_kinds": plots,
                "available_animation_kinds": animation_kinds,
                "default_static_kind": plots[0] if plots else None,
                "computed_evidence_only": True,
            },
        }

    def explanation_json(self) -> str:
        """Serialize `explanation()` canonically for agents and notebooks."""
        return canonical_json(self.explanation())

    def explain(self) -> str:
        """Return a concise accessible narrative derived from `explanation()`."""
        record = self.explanation()
        lines = [
            str(record["title"]),
            "status: " + self.status,
            "method/backend: " + self.method + "/" + self.backend,
            "validation: "
            + self.validation.truth_level
            + ("; passed" if self.validation.passed else "; not passed"),
            str(record["interpretation"]),
        ]
        for mode in record["failure_modes"]:
            if isinstance(mode, dict) and mode.get("detected") is True:
                lines.append("detected failure mode: " + str(mode.get("kind")))
        if self.trace.truncated:
            lines.append("trace: deterministically truncated to its configured budget")
        for diagnostic in self.diagnostics:
            lines.append("diagnostic: " + diagnostic.code)
        return "\n".join(lines)

    def plot(self, kind: str = "auto") -> Any:
        """Return an operation-appropriate static semantic PlotSpec."""
        from .visualization import spectral_plot

        return spectral_plot(self, kind=kind)

    def to_plot_spec(self, kind: str = "auto") -> Any:
        """Alias `plot()` for generic PlotSpec-aware consumers."""
        return self.plot(kind)

    def animate(self, kind: str = "auto") -> Any:
        """Return a bounded semantic PlotAnimation from retained evidence."""
        from .visualization import spectral_animation

        return spectral_animation(self, kind=kind)


__all__ = ["SPECTRAL_EXPLANATION_SCHEMA_VERSION", "SpectralResult"]
