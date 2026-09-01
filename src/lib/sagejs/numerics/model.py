"""Agent-readable problem, plan, validation, provenance, and result records."""

from __future__ import annotations

import hashlib
import math
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from ._json import (
    JSONValue,
    canonical_json,
    materialize_array,
    materialize_json,
    materialize_object,
)
from .diagnostics import NumericalDiagnostic, materialize_diagnostic
from .trace import NumericalTrace, TracePolicy

NUMERICAL_SCHEMA_VERSION = 1
TRUTH_LEVELS = (
    "exact",
    "rigorous",
    "validated_approximate",
    "heuristic",
    "indeterminate",
)
STATUS_CODES = (
    "converged",
    "exact_root",
    "invalid_bracket",
    "maximum_iterations",
    "maximum_evaluations",
    "maximum_elapsed_time",
    "zero_derivative",
    "nonfinite_evaluation",
    "cancelled",
    "callback_error",
    "stagnation",
    "validation_failed",
    "invalid_problem",
    "backend_failure",
)
SUCCESS_STATUS_CODES = ("converged", "exact_root")

FUNCTION_RECORD_KINDS = (
    "none",
    "expression",
    "module_function",
    "source",
    "opaque_callback",
    "explicit_callback",
    "dense_binary64_data",
    "polynomial_coefficients",
    "sampled_data",
    "statistics_operation",
    "analytic_reference",
    "parameterized_decay",
)

_HEX_DIGITS = "0123456789abcdef"


def _optional_sha256(value: Any, name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(name + " must be a lowercase SHA-256 digest or None")
    if len(value) != 64 or any(character not in _HEX_DIGITS for character in value):
        raise ValueError(name + " must be a lowercase SHA-256 digest or None")
    return value


def _function_record(
    value: Mapping[str, Any] | None,
    path: str,
    *,
    live_callback: bool,
) -> dict[str, JSONValue]:
    if value is None:
        value = {
            "kind": "opaque_callback" if live_callback else "none",
            "replayable": False if live_callback else True,
        }
    record = materialize_object(value, path)
    kind = record.get("kind")
    if kind not in FUNCTION_RECORD_KINDS:
        raise ValueError(
            path + ".kind must be one of " + ", ".join(FUNCTION_RECORD_KINDS)
        )
    if not isinstance(record.get("replayable"), bool):
        raise TypeError(path + ".replayable must be a boolean")
    return record


def _nonnegative_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(name + " must be a nonnegative integer")
    return value


def _nonnegative_finite(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(name + " must be a nonnegative finite number")
    answer = float(value)
    if not math.isfinite(answer) or answer < 0.0:
        raise ValueError(name + " must be a nonnegative finite number")
    return answer


def _nonempty_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or value == "":
        raise TypeError(name + " must be a nonempty string")
    return value


def _optional_nonnegative_finite(value: Any, name: str) -> float | None:
    if value is None:
        return None
    return _nonnegative_finite(value, name)


def _precision_record(numeric_type: str) -> dict[str, JSONValue]:
    normalized = numeric_type.lower().replace("_", "-")
    if normalized == "complex-binary64":
        return {"kind": "complex-binary64", "bits": 53}
    if "binary64" in normalized:
        return {"kind": "binary64", "bits": 53}
    return {"kind": numeric_type, "bits": None}


def _execution_target(
    backend: str,
    capability: Mapping[str, Any],
    declared: Mapping[str, Any] | None,
) -> dict[str, JSONValue]:
    record = materialize_object(declared, "$.plan.execution_target")
    implementation_kind = record.get("implementation_kind")
    if implementation_kind is None:
        implementation_kind = (
            "ordinary_python" if backend == "ordinary-python" else "external_artifact"
        )
    if not isinstance(implementation_kind, str) or implementation_kind == "":
        raise TypeError("execution target implementation_kind must be nonempty")
    source_digest = _optional_sha256(
        record.get("source_digest", capability.get("source_digest")),
        "execution target source_digest",
    )
    artifact_sha256 = _optional_sha256(
        record.get("artifact_sha256", capability.get("artifact_sha256")),
        "execution target artifact_sha256",
    )
    receipt_sha256 = _optional_sha256(
        record.get(
            "qualification_receipt_sha256",
            capability.get("qualification_receipt_sha256"),
        ),
        "execution target qualification_receipt_sha256",
    )
    if implementation_kind == "ordinary_python":
        if artifact_sha256 is not None or receipt_sha256 is not None:
            raise ValueError(
                "ordinary Python execution targets cannot declare artifact or receipt digests"
            )
        binding_status = (
            "source_digest_bound" if source_digest is not None else "source_transparent"
        )
    elif receipt_sha256 is not None and artifact_sha256 is None:
        raise ValueError(
            "execution target qualification receipt requires an artifact digest"
        )
    elif artifact_sha256 is None:
        binding_status = "declared_unbound"
    elif receipt_sha256 is None:
        binding_status = "artifact_digest_bound"
    else:
        binding_status = "receipt_qualified"
    return {
        "backend": backend,
        "implementation_kind": implementation_kind,
        "source_digest": source_digest,
        "artifact_sha256": artifact_sha256,
        "qualification_receipt_sha256": receipt_sha256,
        "binding_status": binding_status,
    }


def _limitation_records(
    declared: Sequence[Any], domain_payload: Mapping[str, Any]
) -> list[JSONValue]:
    records: list[JSONValue] = []
    seen: set[str] = set()

    def append(code: str, detail: Any = None) -> None:
        if code in seen:
            return
        if code == "":
            raise ValueError("numerical limitation codes must be nonempty")
        seen.add(code)
        records.append(
            {
                "code": code,
                "detail": materialize_json(detail, "$.result.limitations.detail"),
            }
        )

    for value in declared:
        if isinstance(value, str):
            append(value)
        elif isinstance(value, Mapping):
            code = value.get("code")
            if not isinstance(code, str):
                raise TypeError("numerical limitation mappings require a string code")
            append(code, value.get("detail"))
        else:
            raise TypeError("numerical limitations must be strings or mappings")
    domain = domain_payload.get("limitations")
    if isinstance(domain, Mapping):
        for key in sorted(domain):
            detail = domain[key]
            if detail is not False and detail is not None:
                append(str(key), detail)
    elif isinstance(domain, Sequence) and not isinstance(
        domain, (str, bytes, bytearray)
    ):
        for value in domain:
            if isinstance(value, str):
                append(value)
            elif isinstance(value, Mapping):
                code = value.get("code")
                if isinstance(code, str):
                    append(code, value.get("detail"))
    return records


class ResourceBudget:
    """Hard execution and trace budgets carried by every problem."""

    def __init__(
        self,
        *,
        max_iterations: int = 100,
        max_evaluations: int = 256,
        max_elapsed_ms: int = 30_000,
        max_trace_events: int = 256,
        max_trace_bytes: int = 1_000_000,
    ) -> None:
        values = {
            "max_iterations": max_iterations,
            "max_evaluations": max_evaluations,
            "max_elapsed_ms": max_elapsed_ms,
            "max_trace_events": max_trace_events,
            "max_trace_bytes": max_trace_bytes,
        }
        minimums = {
            "max_iterations": 1,
            "max_evaluations": 1,
            "max_elapsed_ms": 1,
            "max_trace_events": 2,
            "max_trace_bytes": 1024,
        }
        for name in values:
            value = values[name]
            minimum = minimums[name]
            if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
                raise ValueError(name + " must be an integer at least " + str(minimum))
        self._values = values

    def __getattr__(self, name: str) -> int:
        if name not in self._values:
            raise AttributeError(name)
        return self._values[name]

    def to_dict(self) -> dict[str, JSONValue]:
        return dict(self._values)

    @classmethod
    def capability_record(cls) -> dict[str, JSONValue]:
        """Describe common fields without overstating domain enforcement."""
        return {
            "common_fields": {
                "max_iterations": "domain_enforced",
                "max_evaluations": "domain_enforced_callback_accounting",
                "max_elapsed_ms": "cooperative_domain_enforcement",
                "max_trace_events": "hard_retention_limit",
                "max_trace_bytes": "hard_retention_limit",
            },
            "not_common_fields": {
                "max_callback_depth": "unsupported_common_contract",
                "max_allocation_bytes": "unsupported_common_contract",
                "max_memory_bytes": "domain_specific_only",
            },
            "domain_specific": {
                "sweeps.parameter_sweep": [
                    "max_input_bytes",
                    "max_result_bytes",
                    "max_memory_bytes_cooperative",
                    "max_concurrency",
                ]
            },
        }


class NumericalConstraint:
    """Live scalar nonlinear constraint with serialized intent."""

    def __init__(
        self,
        kind: str,
        function: Callable[[list[float]], Any],
        *,
        tolerance: float,
        function_record: Mapping[str, Any] | None = None,
    ) -> None:
        if kind not in ("inequality", "equality"):
            raise ValueError("invalid constraint kind")
        if not callable(function):
            raise TypeError("constraint function must be callable")
        self._kind = kind
        self._function = function
        self._tolerance = float(tolerance)
        if not math.isfinite(self._tolerance) or self._tolerance < 0.0:
            raise ValueError("constraint tolerance must be finite and nonnegative")
        self._function_record = _function_record(
            function_record, "$.constraint.function", live_callback=True
        )

    @property
    def kind(self) -> str:
        return self._kind

    @property
    def function(self) -> Callable[[list[float]], Any]:
        return self._function

    @property
    def tolerance(self) -> float:
        return self._tolerance

    @property
    def replayable(self) -> bool:
        return self._function_record.get("replayable") is True

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "kind": self._kind,
            "sense": "greater_equal" if self._kind == "inequality" else "equal",
            "count": 1,
            "tolerances": [self._tolerance],
            "function": materialize_object(self._function_record, "$.constraint"),
        }


class NumericalProblem:
    """Immutable semantic problem intent with an optional live callback."""

    def __init__(
        self,
        domain: str,
        operation: str,
        *,
        function: Callable[..., Any] | None = None,
        derivative: Callable[..., Any] | None = None,
        function_record: Mapping[str, Any] | None = None,
        numeric_type: str = "binary64",
        variables: Sequence[Any] = (),
        initial_data: Mapping[str, Any] | None = None,
        bounds: Mapping[str, Any] | None = None,
        tolerances: Mapping[str, Any] | None = None,
        method: str = "auto",
        derivative_record: Mapping[str, Any] | None = None,
        constraints: Sequence[NumericalConstraint] = (),
        resource_budget: ResourceBudget | None = None,
        trace_policy: TracePolicy | None = None,
        source_intent: Mapping[str, Any] | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> None:
        if not isinstance(domain, str) or domain == "":
            raise TypeError("problem domain must be a nonempty string")
        if not isinstance(operation, str) or operation == "":
            raise TypeError("problem operation must be a nonempty string")
        if function is not None and not callable(function):
            raise TypeError("problem function must be callable")
        if derivative is not None and not callable(derivative):
            raise TypeError("problem derivative must be callable")
        self._domain = domain
        self._operation = operation
        self._function = function
        self._derivative = derivative
        self._function_record = _function_record(
            function_record,
            "$.problem.function",
            live_callback=function is not None,
        )
        if not isinstance(numeric_type, str) or numeric_type == "":
            raise TypeError("problem numeric_type must be a nonempty string")
        self._numeric_type = numeric_type
        self._variables = materialize_array(variables, "$.problem.variables")
        self._initial_data = materialize_object(initial_data, "$.problem.initial_data")
        self._bounds = materialize_object(bounds, "$.problem.bounds")
        self._tolerances = materialize_object(tolerances, "$.problem.tolerances")
        self._method = _nonempty_string(method, "problem method")
        self._derivative_record = _function_record(
            derivative_record,
            "$.problem.derivative",
            live_callback=derivative is not None,
        )
        self._constraints = tuple(constraints)
        for constraint in self._constraints:
            if not isinstance(constraint, NumericalConstraint):
                raise TypeError("invalid numerical constraint")
        if resource_budget is not None and not isinstance(
            resource_budget, ResourceBudget
        ):
            raise TypeError("problem resource_budget must be a ResourceBudget")
        self._resource_budget = (
            ResourceBudget() if resource_budget is None else resource_budget
        )
        if trace_policy is not None and not isinstance(trace_policy, TracePolicy):
            raise TypeError("problem trace_policy must be a TracePolicy")
        self._trace_policy = (
            TracePolicy(
                max_events=self._resource_budget.max_trace_events,
                max_bytes=self._resource_budget.max_trace_bytes,
            )
            if trace_policy is None
            else trace_policy
        )
        if self._trace_policy.max_events > self._resource_budget.max_trace_events:
            raise ValueError(
                "trace policy max_events exceeds the problem resource budget"
            )
        if self._trace_policy.max_bytes > self._resource_budget.max_trace_bytes:
            raise ValueError(
                "trace policy max_bytes exceeds the problem resource budget"
            )
        self._source_intent = materialize_object(
            source_intent, "$.problem.source_intent"
        )
        self._metadata = materialize_object(metadata, "$.problem.metadata")

    @property
    def domain(self) -> str:
        return self._domain

    @property
    def operation(self) -> str:
        return self._operation

    @property
    def function(self) -> Callable[..., Any] | None:
        return self._function

    @property
    def derivative(self) -> Callable[..., Any] | None:
        return self._derivative

    @property
    def method(self) -> str:
        return self._method

    @property
    def numeric_type(self) -> str:
        return self._numeric_type

    @property
    def bounds(self) -> dict[str, Any]:
        return materialize_object(self._bounds, "$.problem.bounds")

    @property
    def initial_data(self) -> dict[str, Any]:
        return materialize_object(self._initial_data, "$.problem.initial_data")

    @property
    def tolerances(self) -> dict[str, Any]:
        return materialize_object(self._tolerances, "$.problem.tolerances")

    @property
    def resource_budget(self) -> ResourceBudget:
        return self._resource_budget

    @property
    def trace_policy(self) -> TracePolicy:
        return self._trace_policy

    @property
    def function_record(self) -> dict[str, Any]:
        return materialize_object(self._function_record, "$.problem.function")

    @property
    def source_intent(self) -> dict[str, Any]:
        return materialize_object(self._source_intent, "$.problem.source_intent")

    @property
    def constraints(self) -> list[NumericalConstraint]:
        return list(self._constraints)

    @property
    def replayable(self) -> bool:
        return (
            self._function_record.get("replayable") is True
            and self._derivative_record.get("replayable") is True
            and all(constraint.replayable for constraint in self._constraints)
        )

    def to_dict(self) -> dict[str, JSONValue]:
        record: dict[str, JSONValue] = {
            "schema_version": NUMERICAL_SCHEMA_VERSION,
            "domain": self._domain,
            "operation": self._operation,
            "numeric_type": self._numeric_type,
            "variables": materialize_array(self._variables, "$.problem.variables"),
            "function": self.function_record,
            "derivative": materialize_object(
                self._derivative_record, "$.problem.derivative"
            ),
            "initial_data": self.initial_data,
            "bounds": self.bounds,
            "tolerances": self.tolerances,
            "method_request": self._method,
            "resource_budget": self._resource_budget.to_dict(),
            "trace_policy": self._trace_policy.to_dict(),
            "source_intent": self.source_intent,
            "metadata": materialize_object(self._metadata, "$.problem.metadata"),
        }
        # Preserve the established wire identity of every unconstrained
        # numerical problem. Constraints are an optional semantic extension,
        # not an empty field that invalidates unrelated evidence receipts.
        if len(self._constraints) != 0:
            record["constraints"] = [
                constraint.to_dict() for constraint in self._constraints
            ]
        return record

    @property
    def digest(self) -> str:
        return hashlib.sha256(
            canonical_json(self.to_dict()).encode("utf-8")
        ).hexdigest()


class NumericalPlan:
    """Explicit, inspectable resolution from a problem to an execution path."""

    def __init__(
        self,
        problem: NumericalProblem,
        *,
        method: str,
        backend: str,
        reason: str,
        capability: Mapping[str, Any],
        fallback: Mapping[str, Any] | None = None,
        expected_resources: Mapping[str, Any] | None = None,
        execution_target: Mapping[str, Any] | None = None,
        rejected_alternatives: Sequence[Any] = (),
        diagnostics: Sequence[NumericalDiagnostic | Mapping[str, Any]] = (),
    ) -> None:
        if not isinstance(problem, NumericalProblem):
            raise TypeError("plan problem must be a NumericalProblem")
        self._problem = problem
        self._method = _nonempty_string(method, "plan method")
        self._backend = _nonempty_string(backend, "plan backend")
        self._reason = _nonempty_string(reason, "plan selection reason")
        self._capability = materialize_object(capability, "$.plan.capability")
        self._fallback = materialize_object(fallback, "$.plan.fallback")
        self._expected_resources = materialize_object(
            expected_resources, "$.plan.expected_resources"
        )
        self._execution_target = _execution_target(
            self._backend, self._capability, execution_target
        )
        self._rejected = materialize_array(
            rejected_alternatives, "$.plan.rejected_alternatives"
        )
        self._diagnostics = tuple(
            materialize_diagnostic(value) for value in diagnostics
        )

    @property
    def problem(self) -> NumericalProblem:
        return self._problem

    @property
    def method(self) -> str:
        return self._method

    @property
    def backend(self) -> str:
        return self._backend

    @property
    def execution_target(self) -> dict[str, JSONValue]:
        return materialize_object(self._execution_target, "$.plan.execution_target")

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "schema_version": NUMERICAL_SCHEMA_VERSION,
            "problem_digest": self._problem.digest,
            "operation": self._problem.operation,
            "method": self._method,
            "backend": self._backend,
            "selection_reason": self._reason,
            "numeric_type": self._problem.numeric_type,
            "capability": materialize_object(self._capability, "$.plan.capability"),
            "fallback": materialize_object(self._fallback, "$.plan.fallback"),
            "expected_resources": materialize_object(
                self._expected_resources, "$.plan.expected_resources"
            ),
            "execution_target": self.execution_target,
            "rejected_alternatives": materialize_array(
                self._rejected, "$.plan.rejected_alternatives"
            ),
            "diagnostics": [
                materialize_object(value, "$.plan.diagnostics")
                for value in self._diagnostics
            ],
        }


class NumericalValidation:
    """Independent mathematical checks, separate from solver termination."""

    def __init__(
        self,
        truth_level: str,
        passed: bool,
        *,
        checks: Sequence[Any] = (),
        residual: float | None = None,
        error_estimate: float | None = None,
        condition_estimate: float | None = None,
    ) -> None:
        if truth_level not in TRUTH_LEVELS:
            raise ValueError("unknown numerical truth level: " + truth_level)
        if not isinstance(passed, bool):
            raise TypeError("validation passed must be a boolean")
        self._truth_level = truth_level
        self._passed = passed
        self._checks = materialize_array(checks, "$.validation.checks")
        self._residual = _optional_nonnegative_finite(residual, "validation residual")
        self._error_estimate = _optional_nonnegative_finite(
            error_estimate, "validation error_estimate"
        )
        self._condition_estimate = _optional_nonnegative_finite(
            condition_estimate, "validation condition_estimate"
        )

    @property
    def passed(self) -> bool:
        return self._passed

    @property
    def truth_level(self) -> str:
        return self._truth_level

    @property
    def residual(self) -> float | None:
        return self._residual

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "truth_level": self._truth_level,
            "passed": self._passed,
            "checks": materialize_array(self._checks, "$.validation.checks"),
            "residual": self._residual,
            "error_estimate": self._error_estimate,
            "condition_estimate": self._condition_estimate,
        }


class NumericalResult:
    """Common structured result envelope with domain-specific `value`."""

    def __init__(
        self,
        problem: NumericalProblem,
        plan: NumericalPlan,
        *,
        success: bool,
        status: str,
        value: Any = None,
        validation: NumericalValidation,
        diagnostics: Sequence[NumericalDiagnostic | Mapping[str, Any]] = (),
        iterations: int = 0,
        evaluations: int = 0,
        elapsed_ms: float = 0.0,
        trace: NumericalTrace | None = None,
        measurements: Mapping[str, Any] | None = None,
        provenance: Mapping[str, Any] | None = None,
        domain_payload: Mapping[str, Any] | None = None,
        limitations: Sequence[Any] = (),
    ) -> None:
        if status not in STATUS_CODES:
            raise ValueError("unknown numerical status code: " + status)
        if not isinstance(problem, NumericalProblem):
            raise TypeError("result problem must be a NumericalProblem")
        if not isinstance(plan, NumericalPlan):
            raise TypeError("result plan must be a NumericalPlan")
        if plan.problem.digest != problem.digest:
            raise ValueError("result plan was resolved for a different problem")
        if not isinstance(validation, NumericalValidation):
            raise TypeError("result validation must be a NumericalValidation")
        if not isinstance(success, bool):
            raise TypeError("result success must be a boolean")
        status_is_success = status in SUCCESS_STATUS_CODES
        if success and not status_is_success:
            raise ValueError("a successful result contradicts its solver status")
        if success and not validation.passed:
            raise ValueError("a successful result requires passed validation")
        self._problem = problem
        self._plan = plan
        self._success = success
        self._status = status
        self._value = materialize_json(value, "$.result.value")
        self._validation = validation
        self._diagnostics = tuple(
            materialize_diagnostic(value) for value in diagnostics
        )
        self._iterations = _nonnegative_integer(iterations, "result iterations")
        self._evaluations = _nonnegative_integer(evaluations, "result evaluations")
        if self._iterations > problem.resource_budget.max_iterations:
            raise ValueError("result iterations exceed the problem resource budget")
        if self._evaluations > problem.resource_budget.max_evaluations:
            raise ValueError("result evaluations exceed the problem resource budget")
        self._elapsed_ms = _nonnegative_finite(elapsed_ms, "result elapsed_ms")
        if trace is not None and not isinstance(trace, NumericalTrace):
            raise TypeError("result trace must be a NumericalTrace")
        self._trace = NumericalTrace(problem.trace_policy) if trace is None else trace
        if self._trace.policy.to_dict() != problem.trace_policy.to_dict():
            raise ValueError(
                "result trace policy differs from the problem trace policy"
            )
        self._measurements = materialize_object(measurements, "$.result.measurements")
        self._provenance = materialize_object(provenance, "$.result.provenance")
        self._domain_payload = materialize_object(
            domain_payload, "$.result.domain_payload"
        )
        self._limitations = _limitation_records(limitations, self._domain_payload)

    @property
    def value(self) -> Any:
        return materialize_json(self._value, "$.result.value")

    @property
    def success(self) -> bool:
        return self._success

    @property
    def status(self) -> str:
        return self._status

    @property
    def method(self) -> str:
        return self._plan.method

    @property
    def backend(self) -> str:
        return self._plan.backend

    @property
    def validation(self) -> NumericalValidation:
        return self._validation

    @property
    def residual(self) -> float | None:
        return self._validation.residual

    @property
    def diagnostics(self) -> tuple[NumericalDiagnostic, ...]:
        return tuple(
            NumericalDiagnostic.from_dict(value) for value in self._diagnostics
        )

    @property
    def trace(self) -> NumericalTrace:
        return self._trace

    @property
    def iterations(self) -> int:
        return self._iterations

    @property
    def evaluations(self) -> int:
        return self._evaluations

    @property
    def problem(self) -> NumericalProblem:
        return self._problem

    @property
    def plan_record(self) -> NumericalPlan:
        return self._plan

    @property
    def limitations(self) -> list[JSONValue]:
        return materialize_array(self._limitations, "$.result.limitations")

    def _provenance_record(self) -> dict[str, JSONValue]:
        record = materialize_object(self._provenance, "$.result.provenance")
        target = self._plan.execution_target
        record["planned_execution_target"] = target
        source = _optional_sha256(
            record.get("source_digest"), "provenance source_digest"
        )
        artifact = _optional_sha256(
            record.get("artifact_sha256"), "provenance artifact_sha256"
        )
        receipt = _optional_sha256(
            record.get("qualification_receipt_sha256"),
            "provenance qualification_receipt_sha256",
        )
        record["source_digest"] = source
        record["artifact_sha256"] = artifact
        record["qualification_receipt_sha256"] = receipt
        observed_kind = record.get("implementation_kind")
        planned_kind = target["implementation_kind"]
        if observed_kind is None:
            if source is not None or artifact is not None or receipt is not None:
                raise ValueError(
                    "observed provenance digests require an implementation_kind"
                )
            record["execution_binding_status"] = (
                "source_transparent_or_unobserved"
                if planned_kind == "ordinary_python"
                else "external_execution_unobserved"
            )
            return record
        if not isinstance(observed_kind, str) or observed_kind == "":
            raise TypeError("provenance implementation_kind must be nonempty")
        if planned_kind == "ordinary_python":
            if observed_kind != "ordinary_python":
                raise ValueError("observed implementation kind contradicts the plan")
            if artifact is not None or receipt is not None:
                raise ValueError(
                    "ordinary Python provenance cannot carry artifact or receipt digests"
                )
            planned_source = target["source_digest"]
            if planned_source is not None and source not in (None, planned_source):
                raise ValueError("observed source digest contradicts the plan")
            record["execution_binding_status"] = (
                "source_digest_bound" if source is not None else "source_transparent"
            )
            return record
        if observed_kind == "ordinary_python":
            raise ValueError("observed implementation kind contradicts the plan")
        if planned_kind != "external_artifact" and observed_kind != planned_kind:
            raise ValueError("observed implementation kind contradicts the plan")
        planned_source = target["source_digest"]
        planned_artifact = target["artifact_sha256"]
        planned_receipt = target["qualification_receipt_sha256"]
        if planned_source is not None and source not in (None, planned_source):
            raise ValueError("observed source digest contradicts the plan")
        if planned_artifact is not None and artifact not in (None, planned_artifact):
            raise ValueError("observed artifact digest contradicts the plan")
        if planned_receipt is not None and receipt not in (None, planned_receipt):
            raise ValueError("observed qualification receipt contradicts the plan")
        if receipt is not None and artifact is None:
            raise ValueError(
                "observed qualification receipt requires an artifact digest"
            )
        if artifact is None:
            record["execution_binding_status"] = "external_artifact_unbound"
        elif receipt is None:
            record["execution_binding_status"] = "artifact_digest_bound"
        elif (
            target["binding_status"] == "receipt_qualified"
            and artifact == planned_artifact
            and receipt == planned_receipt
        ):
            record["execution_binding_status"] = "receipt_qualified"
        else:
            raise ValueError(
                "an observed receipt is not bound to the planned qualified artifact"
            )
        return record

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "schema_version": NUMERICAL_SCHEMA_VERSION,
            "problem_digest": self._problem.digest,
            "success": self._success,
            "status": self._status,
            "value": self.value,
            "validation": self._validation.to_dict(),
            "diagnostics": [
                materialize_object(value, "$.result.diagnostics")
                for value in self._diagnostics
            ],
            "method": self.method,
            "backend": self.backend,
            "precision": _precision_record(self._problem.numeric_type),
            "iterations": self._iterations,
            "evaluations": self._evaluations,
            "elapsed_ms": self._elapsed_ms,
            "measurements": materialize_object(
                self._measurements, "$.result.measurements"
            ),
            "trace": self._trace.to_dict(),
            "provenance": self._provenance_record(),
            "limitations": self.limitations,
            "reproducibility": {
                "replayable": self._problem.replayable,
                "problem": self._problem.to_dict(),
                "plan": self._plan.to_dict(),
            },
            "domain_payload": materialize_object(
                self._domain_payload, "$.result.domain_payload"
            ),
        }

    def to_json(self) -> str:
        return canonical_json(self.to_dict())

    def explain(self) -> str:
        lines = [
            self.method + " " + self._problem.operation.replace("_", " "),
            "status: " + self._status,
            "validation: "
            + self._validation.truth_level
            + ("; passed" if self._validation.passed else "; not passed"),
            "iterations/evaluations: "
            + str(self._iterations)
            + "/"
            + str(self._evaluations),
        ]
        if self._validation.residual is not None:
            lines.append("residual: " + str(self._validation.residual))
        for diagnostic in self.diagnostics:
            lines.append("diagnostic: " + diagnostic.code)
        return "\n".join(lines)

    def verify(self, method: str = "bisection") -> "NumericalResult":
        if self._problem.operation != "scalar_root":
            raise NotImplementedError(
                "independent verification is not implemented for this operation"
            )
        from .roots import solve_root_problem

        return solve_root_problem(self._problem, method=method)

    def refine(self, tolerance: float = 1e-13) -> "NumericalResult":
        if self._problem.operation != "scalar_root":
            raise NotImplementedError(
                "refinement is not implemented for this operation"
            )
        from .roots import refine_root_result

        return refine_root_result(self, tolerance)

    def code(self, language: str | None = None) -> str | dict[str, str]:
        raise NotImplementedError(
            "canonical numerical results do not retain frontend language intent; "
            "emit code from FrontendExecutionResult.to_code(language)"
        )

    def to_code(self, language: str | None = None) -> str | dict[str, str]:
        """Return equivalent source through the operation's language emitter."""
        return self.code(language)

    def to_markdown(self) -> str:
        """Return a compact evidence-derived Markdown explanation."""
        lines = [
            "### " + self.method + " " + self._problem.operation.replace("_", " "),
            "",
            "- Status: `" + self._status + "`",
            "- Success: `" + ("true" if self._success else "false") + "`",
            "- Validation: `"
            + self._validation.truth_level
            + "` ("
            + ("passed" if self._validation.passed else "not passed")
            + ")",
            "- Iterations/evaluations: `"
            + str(self._iterations)
            + "/"
            + str(self._evaluations)
            + "`",
        ]
        if self._validation.residual is not None:
            lines.append("- Residual: `" + str(self._validation.residual) + "`")
        if self._diagnostics:
            lines.append(
                "- Diagnostics: "
                + ", ".join("`" + str(item["code"]) + "`" for item in self._diagnostics)
            )
        return "\n".join(lines)

    def plot(self) -> Any:
        if self._problem.operation != "scalar_root":
            raise NotImplementedError("plotting is not implemented for this operation")
        from .visualization import root_plot

        return root_plot(self)

    def to_plot_spec(self) -> Any:
        """Return the renderer-neutral PlotSpec view for this result."""
        return self.plot()

    def animate(self) -> Any:
        if self._problem.operation != "scalar_root":
            raise NotImplementedError("animation is not implemented for this operation")
        from .visualization import root_animation

        return root_animation(self)

    def to_animation(self) -> Any:
        """Return the bounded semantic animation for this result."""
        return self.animate()

    def __repr__(self) -> str:
        if self._value is None:
            return "NumericalResult(status='" + self._status + "')"
        return str(self._value)
