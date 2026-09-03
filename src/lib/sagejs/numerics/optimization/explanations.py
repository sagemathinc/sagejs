"""Structured, evidence-derived explanations for optimization results."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .._json import materialize_object


def _active_bounds(result: Any) -> list[dict[str, Any]]:
    bounds = result.problem.bounds
    point = result.value
    if result.problem.operation == "scalar_minimum":
        interval = bounds.get("interval")
        if not (
            isinstance(interval, list)
            and len(interval) == 2
            and isinstance(point, (int, float))
        ):
            return []
        records = [[float(interval[0]), float(interval[1])]]
        values = [float(point)]
    else:
        variables = bounds.get("variables")
        if not isinstance(variables, list) or not isinstance(point, list):
            return []
        records = variables
        values = [float(value) for value in point]
    answer: list[dict[str, Any]] = []
    for index in range(min(len(records), len(values))):
        record = records[index]
        if not isinstance(record, list) or len(record) != 2:
            continue
        value = values[index]
        tolerance = 1.0e-10 * max(1.0, abs(value))
        lower = record[0]
        upper = record[1]
        if isinstance(lower, (int, float)) and abs(value - float(lower)) <= tolerance:
            answer.append({"variable": index, "side": "lower", "bound": float(lower)})
        if isinstance(upper, (int, float)) and abs(value - float(upper)) <= tolerance:
            answer.append({"variable": index, "side": "upper", "bound": float(upper)})
    return answer


def _constraint_record(result: Any) -> dict[str, Any]:
    bounds = result.problem.bounds
    if result.problem.operation == "scalar_minimum":
        interval = bounds.get("interval")
        return {
            "kind": "finite_interval",
            "bounds": interval if isinstance(interval, list) else [],
            "active": _active_bounds(result),
            "nonlinear_constraints_supported": False,
        }
    variables = bounds.get("variables")
    bounded = isinstance(variables, list) and any(
        isinstance(item, list) and item != [None, None] for item in variables
    )
    return {
        "kind": "box_bounds" if bounded else "none",
        "bounds": variables if isinstance(variables, list) else [],
        "active": _active_bounds(result),
        "nonlinear_constraints_supported": False,
    }


def _identifiability_record(result: Any) -> dict[str, Any]:
    if result.problem.operation not in (
        "nonlinear_least_squares",
        "curve_fit",
        "linear_fit",
    ):
        return {"applicable": False, "state": "not_applicable"}
    diagnostics = result.domain_payload.get("parameter_diagnostics")
    if not isinstance(diagnostics, Mapping):
        return {
            "applicable": True,
            "state": "unavailable",
            "narrative": "No returned-point parameter diagnostic is available.",
        }
    ill_conditioned = diagnostics.get("rank_deficient_or_ill_conditioned") is True
    covariance_available = diagnostics.get("covariance_available") is True
    if ill_conditioned:
        state = "rank_deficient_or_ill_conditioned"
        narrative = (
            "The returned-point Jacobian does not support well-conditioned "
            "independent parameter estimates; rescale, add data, or reformulate."
        )
    elif covariance_available:
        state = "locally_identifiable"
        narrative = (
            "The returned-point normal matrix is invertible within the reported "
            "binary64 conditioning check."
        )
    else:
        state = "unavailable"
        narrative = "Parameter covariance is unavailable at the returned point."
    return {
        "applicable": True,
        "state": state,
        "narrative": narrative,
        "covariance_available": covariance_available,
        "condition_estimate": diagnostics.get("normal_matrix_condition_estimate"),
        "standard_errors": diagnostics.get("standard_errors", []),
        "reason": diagnostics.get("reason"),
    }


def _scale_record(result: Any) -> dict[str, Any]:
    payload = result.domain_payload
    residual_scale = payload.get("residual_scale")
    squared_cost_unavailable = (
        result.problem.operation in ("nonlinear_least_squares", "curve_fit")
        and isinstance(residual_scale, (int, float))
        and float(residual_scale) != 0.0
        and result.objective is None
    )
    return {
        "objective_available": result.objective is not None,
        "squared_cost_outside_binary64": squared_cost_unavailable,
        "residual_norm": payload.get("residual_norm"),
        "residual_scale": residual_scale,
        "scaled_sum_of_squares": payload.get("scaled_sum_of_squares"),
    }


def _failure_record(result: Any) -> dict[str, Any]:
    validation = result.validation.to_dict()
    checks = validation.get("checks")
    failed_checks: list[Any] = []
    if isinstance(checks, list):
        for check in checks:
            if isinstance(check, dict) and check.get("passed") is not True:
                failed_checks.append(dict(check))
    diagnostic_records = [diagnostic.to_dict() for diagnostic in result.diagnostics]
    why: list[str] = []
    actions: list[str] = []
    for diagnostic in diagnostic_records:
        if diagnostic.get("severity") == "info":
            continue
        message = diagnostic.get("message")
        if isinstance(message, str) and message not in why:
            why.append(message)
        suggested = diagnostic.get("suggested_actions")
        if isinstance(suggested, list):
            for action in suggested:
                if isinstance(action, str) and action not in actions:
                    actions.append(action)
    for check in failed_checks:
        if isinstance(check, dict) and isinstance(check.get("kind"), str):
            why.append("Independent check failed: " + str(check["kind"]) + ".")
    if result.success:
        narrative = "Solver termination and independent validation support the result."
    elif result.status == "converged":
        narrative = (
            "The solver reported convergence, but independent validation did not "
            "support a successful result."
        )
    else:
        narrative = "The computation stopped with status " + result.status + "."
    return {
        "narrative": narrative,
        "stop_reason": result.domain_payload.get("stop_reason"),
        "failed_checks": failed_checks,
        "why": why,
        "suggested_actions": actions,
    }


def optimization_explanation(result: Any) -> dict[str, Any]:
    """Return one detached structured explanation derived from result evidence."""
    validation = result.validation.to_dict()
    trace = result.trace.to_dict()
    plan = result.plan_record.to_dict()
    record: dict[str, Any] = {
        "schema_version": 1,
        "operation": result.problem.operation,
        "method": result.method,
        "backend": result.backend,
        "selection_reason": plan.get("selection_reason"),
        "outcome": {
            "success": result.success,
            "solver_status": result.status,
            "validation_truth_level": result.validation.truth_level,
            "validation_passed": result.validation.passed,
        },
        "solution": {
            "value": result.value,
            "objective": result.objective,
            "validation_residual": result.residual,
        },
        "validation": validation,
        "constraints": _constraint_record(result),
        "identifiability": _identifiability_record(result),
        "scale_evidence": _scale_record(result),
        "failure": _failure_record(result),
        "progress": {
            "iterations": result.iterations,
            "evaluations": result.evaluations,
            "trace_level": result.problem.trace_policy.level,
            "trace_observed_events": trace.get("observed_events"),
            "trace_retained_events": trace.get("retained_events"),
            "trace_truncated": result.trace.truncated,
        },
        "diagnostics": [item.to_dict() for item in result.diagnostics],
        "provenance": {
            "problem_digest": result.problem.digest,
            "callback_replayable": result.problem.replayable,
        },
    }
    return dict(materialize_object(record, "$.optimization_explanation"))


def render_optimization_explanation(result: Any) -> str:
    """Render the structured explanation as concise deterministic text."""
    record: dict[str, Any] = optimization_explanation(result)
    outcome = record["outcome"]
    solution = record["solution"]
    progress = record["progress"]
    lines = [
        str(record["method"]) + " " + str(record["operation"]).replace("_", " "),
        "status: " + str(outcome["solver_status"]),
        "backend: " + str(record["backend"]),
        "validation: "
        + str(outcome["validation_truth_level"])
        + ("; passed" if outcome["validation_passed"] is True else "; not passed"),
        "iterations/evaluations: "
        + str(progress["iterations"])
        + "/"
        + str(progress["evaluations"]),
    ]
    if solution["objective"] is not None:
        lines.append("objective: " + str(solution["objective"]))
    elif record["scale_evidence"]["squared_cost_outside_binary64"] is True:
        lines.append(
            "objective: unavailable because the squared cost is outside binary64"
        )
    if solution["validation_residual"] is not None:
        lines.append("validation residual: " + str(solution["validation_residual"]))
    checks = record["validation"]["checks"]
    if isinstance(checks, list):
        for check in checks:
            if isinstance(check, dict) and "kind" in check:
                lines.append(
                    "check "
                    + str(check["kind"])
                    + ": "
                    + ("passed" if check.get("passed") is True else "failed")
                )
    identifiability = record["identifiability"]
    if identifiability["applicable"] is True:
        lines.append("identifiability: " + str(identifiability["state"]))
    if outcome["success"] is not True:
        lines.append("why: " + str(record["failure"]["narrative"]))
    if progress["trace_truncated"] is True:
        lines.append("trace: truncated to its configured budget")
    return "\n".join(lines)
