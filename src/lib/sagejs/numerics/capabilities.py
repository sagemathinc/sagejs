"""Machine-readable numerical capability registry and planning helpers."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ._json import JSONValue, materialize_json
from .diagnostics import NumericalDiagnostic
from .model import NumericalPlan, NumericalProblem, ResourceBudget

CAPABILITY_SCHEMA_VERSION = 1

_TARGET_PLATFORMS = (
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
)
_TARGET_RUNTIMES = (
    "browser",
    "node",
    "sea",
    "cpython",
)
_RUNTIME_ALIASES = {
    "sagejs-node": "node",
    "sagejs-browser": "browser",
    "sagejs-sea": "sea",
    "browser-wasm": "browser",
}
_CLASSIFICATION_PRIORITY = ("extension", "translated", "faithful")

_ROOT_METHODS: dict[str, dict[str, JSONValue]] = {
    "bisection": {
        "classification": "extension",
        "backend": "ordinary-python",
        "requires": ["finite_sign_change_bracket"],
        "numeric_types": ["binary64"],
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": ["residual", "bracket_invariant"],
        "platforms": [
            "browser",
            "node",
            "sea",
            "cpython",
            "linux-x64",
            "linux-arm64",
            "macos-arm64",
            "windows-x64",
        ],
    },
    "brent": {
        "classification": "translated",
        "backend": "ordinary-python",
        "requires": ["finite_sign_change_bracket"],
        "numeric_types": ["binary64"],
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": ["residual", "bracket_invariant"],
        "platforms": [
            "browser",
            "node",
            "sea",
            "cpython",
            "linux-x64",
            "linux-arm64",
            "macos-arm64",
            "windows-x64",
        ],
    },
    "secant": {
        "classification": "extension",
        "backend": "ordinary-python",
        "requires": ["two_initial_points"],
        "numeric_types": ["binary64"],
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": ["residual"],
        "platforms": [
            "browser",
            "node",
            "sea",
            "cpython",
            "linux-x64",
            "linux-arm64",
            "macos-arm64",
            "windows-x64",
        ],
    },
    "newton": {
        "classification": "extension",
        "backend": "ordinary-python",
        "requires": ["initial_point"],
        "numeric_types": ["binary64"],
        "derivatives": ["analytic", "central_finite_difference"],
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": ["residual"],
        "platforms": [
            "browser",
            "node",
            "sea",
            "cpython",
            "linux-x64",
            "linux-arm64",
            "macos-arm64",
            "windows-x64",
        ],
    },
}


def _root_capabilities() -> dict[str, JSONValue]:
    """Return the detached scalar-root capability document."""
    operations: dict[str, JSONValue] = {
        "scalar_root": {
            "classification": "translated",
            "methods": {
                name: dict(_ROOT_METHODS[name]) for name in sorted(_ROOT_METHODS)
            },
            "frontends": {
                "python": "sagejs.numerics.find_root",
                "sage": "find_root / Expression.find_root",
                "matlab": "fzero",
                "wolfram": "FindRoot",
            },
        }
    }
    return {
        "schema_version": CAPABILITY_SCHEMA_VERSION,
        "domain": "roots",
        "operations": operations,
    }


def _root_supports(problem: NumericalProblem, method: str | None = None) -> bool:
    if problem.operation != "scalar_root":
        return False
    selected = problem.method if method is None else method
    if selected == "auto":
        return True
    return selected in _ROOT_METHODS


def _root_plan(problem: NumericalProblem, method: str | None = None) -> NumericalPlan:
    """Resolve a scalar-root problem without evaluating its callback."""
    if problem.operation != "scalar_root":
        raise NotImplementedError(
            "planning is not implemented for " + problem.operation
        )
    requested = problem.method if method is None else str(method)
    bracket = problem.bounds.get("bracket")
    initial = problem.initial_data.get("points")
    diagnostics: list[NumericalDiagnostic] = []
    rejected: list[dict[str, JSONValue]] = []
    if requested == "auto":
        if isinstance(bracket, list) and len(bracket) == 2:
            selected = "brent"
            reason = (
                "a finite sign-change bracket permits the robust Brent-Dekker method"
            )
        elif (
            problem.derivative is not None
            and isinstance(initial, list)
            and len(initial) >= 1
        ):
            selected = "newton"
            reason = "an initial point and explicit derivative permit Newton iteration"
        elif isinstance(initial, list) and len(initial) >= 2:
            selected = "secant"
            reason = "two initial points permit derivative-free secant iteration"
        elif isinstance(initial, list) and len(initial) == 1:
            selected = "newton"
            reason = "one initial point selects Newton with a central finite-difference derivative"
            diagnostics.append(NumericalDiagnostic("finite_difference_derivative"))
        else:
            raise ValueError(
                "automatic root planning requires a bracket or initial point"
            )
    else:
        selected = requested
        reason = "the caller explicitly requested " + selected
    if selected not in _ROOT_METHODS:
        raise ValueError("unsupported scalar root method: " + selected)
    if selected in ("bisection", "brent") and not (
        isinstance(bracket, list) and len(bracket) == 2
    ):
        raise ValueError(selected + " requires a two-endpoint bracket")
    if selected in ("newton", "secant") and not (
        isinstance(initial, list) and len(initial) >= 1
    ):
        raise ValueError(selected + " requires initial data")
    for name in sorted(_ROOT_METHODS):
        if name != selected:
            rejected.append(
                {"method": name, "reason": "not selected by the resolved policy"}
            )
    return NumericalPlan(
        problem,
        method=selected,
        backend="ordinary-python",
        reason=reason,
        capability=_ROOT_METHODS[selected],
        fallback={"method": "bisection" if isinstance(bracket, list) else "none"},
        expected_resources={
            "max_iterations": problem.resource_budget.max_iterations,
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        rejected_alternatives=rejected,
        diagnostics=diagnostics,
    )


_DOMAIN_NAMES = (
    "roots",
    "approximation",
    "integration",
    "linear_algebra",
    "optimization",
    "ode",
    "spectral",
    "statistics",
    "sweeps",
)

_DOMAIN_ALIASES = {
    "scalar_root": "roots",
    "least_squares": "optimization",
    "fitting": "optimization",
    "nonlinear_systems": "optimization",
}


def _detached_object(value: Any, description: str) -> dict[str, JSONValue]:
    detached = materialize_json(value)
    if not isinstance(detached, dict):
        raise TypeError(description + " must be an object")
    return detached


def _method_ids(capability: Mapping[str, Any]) -> list[str]:
    methods = capability.get("methods")
    if isinstance(methods, dict):
        return sorted(str(name) for name in methods)
    if isinstance(methods, list):
        return sorted(str(name) for name in methods)
    scheduler = capability.get("scheduler")
    if isinstance(scheduler, str) and scheduler != "":
        return [scheduler]
    return []


def _operation_classification(capability: Mapping[str, Any]) -> str:
    declared = capability.get("classification")
    if isinstance(declared, str) and declared in _CLASSIFICATION_PRIORITY:
        return declared
    methods = capability.get("methods")
    classifications: set[str] = set()
    if isinstance(methods, dict):
        for value in methods.values():
            if isinstance(value, dict):
                classification = value.get("classification")
                if (
                    isinstance(classification, str)
                    and classification in _CLASSIFICATION_PRIORITY
                ):
                    classifications.add(classification)
    for classification in _CLASSIFICATION_PRIORITY:
        if classification in classifications:
            return classification
    raise ValueError(
        "numerical operation capability requires an explicit classification "
        "or classified methods"
    )


def _runtime_id(value: Any) -> str:
    selected = _RUNTIME_ALIASES.get(value, value)
    if selected not in _TARGET_RUNTIMES:
        raise ValueError("unknown numerical implementation runtime: " + str(value))
    return str(selected)


def _platform_id(value: Any) -> str:
    if not isinstance(value, str) or value not in _TARGET_PLATFORMS:
        raise ValueError("unknown numerical implementation platform: " + str(value))
    return value


def _declared_array(value: Any, name: str) -> list[Any]:
    if not isinstance(value, list):
        raise TypeError(name + " must be an array")
    return value


def _receipt_digest(value: Any) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ValueError(
            "receipt qualification digests must be lowercase SHA-256 digests"
        )
    return value


def _normalize_receipt_qualification(value: Any) -> dict[str, JSONValue]:
    record = _detached_object(value, "numerical receipt qualification")
    required = {"status", "platforms", "runtimes", "receipt_sha256"}
    if set(record) != required:
        raise ValueError(
            "receipt qualification must contain exactly status, platforms, "
            "runtimes, and receipt_sha256"
        )
    status = record["status"]
    if status not in ("unqualified_in_public_registry", "receipt_qualified"):
        raise ValueError("unknown numerical receipt qualification status")
    platforms = sorted(
        {
            _platform_id(target)
            for target in _declared_array(
                record["platforms"], "receipt qualification platforms"
            )
        }
    )
    runtimes = sorted(
        {
            _runtime_id(target)
            for target in _declared_array(
                record["runtimes"], "receipt qualification runtimes"
            )
        }
    )
    receipts = sorted(
        {
            _receipt_digest(digest)
            for digest in _declared_array(
                record["receipt_sha256"], "receipt qualification digests"
            )
        }
    )
    if status == "unqualified_in_public_registry":
        if platforms or runtimes or receipts:
            raise ValueError(
                "an unqualified receipt record cannot claim platforms, runtimes, "
                "or receipt digests"
            )
    elif not receipts or (not platforms and not runtimes):
        raise ValueError(
            "a receipt-qualified method requires retained receipt digests and "
            "a platform or runtime envelope"
        )
    return _detached_object(
        {
            "status": status,
            "platforms": platforms,
            "runtimes": runtimes,
            "receipt_sha256": receipts,
        },
        "normalized receipt qualification",
    )


def _normalize_method_record(value: Mapping[str, Any]) -> dict[str, JSONValue]:
    record = _detached_object(value, "numerical method capability")
    platforms: list[str] = []
    runtimes: list[str] = []
    declared_platforms = record.pop("platforms", [])
    declared_runtimes = record.pop("runtimes", [])
    for target in _declared_array(declared_platforms, "numerical method platforms"):
        if target in _TARGET_RUNTIMES or target in _RUNTIME_ALIASES:
            runtimes.append(_runtime_id(target))
        else:
            platforms.append(_platform_id(target))
    runtimes.extend(
        _runtime_id(target)
        for target in _declared_array(declared_runtimes, "numerical method runtimes")
    )
    if "implementation_targets" in record:
        raw_targets = _detached_object(
            record["implementation_targets"], "numerical implementation targets"
        )
        if set(raw_targets) != {"platforms", "runtimes"}:
            raise ValueError(
                "implementation targets must contain exactly platforms and runtimes"
            )
        platforms.extend(
            _platform_id(target)
            for target in _declared_array(
                raw_targets["platforms"], "implementation target platforms"
            )
        )
        runtimes.extend(
            _runtime_id(target)
            for target in _declared_array(
                raw_targets["runtimes"], "implementation target runtimes"
            )
        )
    record["implementation_targets"] = materialize_json(
        {
            "platforms": sorted(set(platforms)),
            "runtimes": sorted(set(runtimes)),
        }
    )
    qualification = record.get(
        "receipt_qualification",
        {
            "status": "unqualified_in_public_registry",
            "platforms": [],
            "runtimes": [],
            "receipt_sha256": [],
        },
    )
    record["receipt_qualification"] = _normalize_receipt_qualification(qualification)
    return record


def _normalize_operation_capability(
    capability: Mapping[str, Any],
) -> dict[str, JSONValue]:
    record = _detached_object(capability, "numerical operation capability")
    methods = record.get("methods")
    if isinstance(methods, dict):
        normalized_methods: dict[str, JSONValue] = {}
        for name, value in sorted(methods.items()):
            if not isinstance(value, Mapping):
                raise TypeError(
                    "numerical method capability " + str(name) + " must be an object"
                )
            normalized_methods[str(name)] = _normalize_method_record(value)
        record["methods"] = normalized_methods
    surface: dict[str, JSONValue] = {
        "classification": _operation_classification(record),
        "status": "implemented",
        "methods": materialize_json(_method_ids(record)),
    }
    record["surface"] = surface
    return record


def _normalize_domain_document(
    domain: str, document: Mapping[str, Any]
) -> dict[str, JSONValue]:
    record = _detached_object(document, domain + " capability document")
    operations = record.get("operations")
    if not isinstance(operations, dict):
        raise TypeError(domain + " capability document has no operations")
    record["operations"] = {
        str(name): _normalize_operation_capability(value)
        if isinstance(value, Mapping)
        else value
        for name, value in sorted(operations.items())
    }
    implementation_claims = record.pop("qualification", None)
    if implementation_claims is not None:
        record["implementation_claims"] = _normalize_implementation_claims(
            implementation_claims
        )
    record["receipt_qualification"] = {
        "status": "not_bound_by_public_capability_registry",
        "platforms": [],
        "runtimes": [],
        "receipt_sha256": [],
        "evidence_source": "P8 qualification reports",
    }
    return record


def _normalize_implementation_claims(value: Any) -> JSONValue:
    if isinstance(value, Mapping):
        answer: dict[str, JSONValue] = {}
        for key, item in value.items():
            if key == "runtimes":
                if not isinstance(item, list):
                    raise TypeError("implementation claim runtimes must be an array")
                answer[key] = materialize_json(
                    sorted(set(_runtime_id(target) for target in item))
                )
            elif key == "platforms":
                if not isinstance(item, list):
                    raise ValueError(
                        "implementation claims contain an unknown platform"
                    )
                normalized_platforms: list[str] = []
                for target in item:
                    if not isinstance(target, str) or target not in _TARGET_PLATFORMS:
                        raise ValueError(
                            "implementation claims contain an unknown platform"
                        )
                    normalized_platforms.append(target)
                answer[key] = materialize_json(sorted(set(normalized_platforms)))
            else:
                answer[str(key)] = _normalize_implementation_claims(item)
        return answer
    if isinstance(value, list):
        return [_normalize_implementation_claims(item) for item in value]
    return materialize_json(value)


def _canonical_domain(domain: str) -> str:
    selected = _DOMAIN_ALIASES.get(domain, domain)
    if selected not in _DOMAIN_NAMES:
        raise ValueError("unknown numerical domain: " + domain)
    return selected


def _domain_document(domain: str) -> dict[str, JSONValue]:
    if domain == "roots":
        return _root_capabilities()
    if domain == "approximation":
        from .approximation import capabilities as approximation_capabilities

        return _detached_object(
            approximation_capabilities(), "approximation capability document"
        )
    if domain == "integration":
        from .integration import integration_capabilities

        detail = integration_capabilities()
        return _detached_object(
            {
                "schema_version": detail["schema_version"],
                "domain": "integration",
                "operations": {
                    "definite_integral": detail["capability"],
                },
                "detail": detail,
            },
            "integration capability document",
        )
    if domain == "linear_algebra":
        from .linear_algebra import capabilities as linear_capabilities

        return _detached_object(
            linear_capabilities(), "linear-algebra capability document"
        )
    if domain == "optimization":
        from .optimization import capabilities as optimization_capabilities

        return _detached_object(
            optimization_capabilities(), "optimization capability document"
        )
    if domain == "ode":
        from .ode import ode_capabilities

        detail = ode_capabilities()
        return _detached_object(
            {
                "schema_version": detail["schema_version"],
                "domain": "ode",
                "operations": {
                    "initial_value_problem": {
                        "methods": detail["implemented_methods"],
                        "unsupported_methods": detail["unsupported_methods"],
                        "supported_state": detail["supported_state"],
                        "implementation_targets": detail["implementation_targets"],
                        "limitations": detail["limitations"],
                    },
                    "parameter_sweep": detail["parameter_sweeps"],
                },
                "detail": detail,
            },
            "ODE capability document",
        )
    if domain == "spectral":
        from .spectral import capabilities as spectral_capabilities

        return _detached_object(spectral_capabilities(), "spectral capability document")
    if domain == "statistics":
        from .statistics import capabilities as statistics_capabilities

        return _detached_object(
            statistics_capabilities(), "statistics capability document"
        )
    from .sweeps import sweep_capabilities

    return _detached_object(sweep_capabilities(), "sweep capability document")


def _resource_budget_contract() -> dict[str, JSONValue]:
    from .ode.model import OdeResourceBudget

    record = ResourceBudget.capability_record()
    domain_specific = record.get("domain_specific")
    if not isinstance(domain_specific, dict):
        raise TypeError("resource budget capability has no domain-specific registry")
    domain_specific.update(OdeResourceBudget.domain_capability_record())
    return record


def capabilities(domain: str | None = None) -> dict[str, JSONValue]:
    """Return one domain document or the complete lazy capability index.

    The unfiltered registry uses fully qualified `domain.operation` keys so
    similarly named operations never collide or depend on import order.
    """
    if domain is not None:
        if not isinstance(domain, str):
            raise TypeError("numerical capability domain must be a string or None")
        canonical = _canonical_domain(domain)
        return _normalize_domain_document(canonical, _domain_document(canonical))
    domains: dict[str, JSONValue] = {}
    operation_index: dict[str, JSONValue] = {}
    for domain_name in _DOMAIN_NAMES:
        document = _normalize_domain_document(
            domain_name, _domain_document(domain_name)
        )
        domains[domain_name] = document
        operations = document.get("operations")
        if not isinstance(operations, dict):
            raise TypeError(domain_name + " capability document has no operations")
        for operation_name in sorted(operations):
            operation_index[domain_name + "." + operation_name] = {
                "domain": domain_name,
                "operation": operation_name,
                "capability": operations[operation_name],
            }
    from .frontends import create_frontend_registry

    frontend_index: dict[str, JSONValue] = {}
    for metadata in create_frontend_registry().metadata():
        key = metadata.get("operation_key")
        if not isinstance(key, str) or key == "" or key in frontend_index:
            raise TypeError("invalid or duplicate numerical frontend operation")
        references = metadata.get("capability_operations")
        if not isinstance(references, list) or any(
            not isinstance(reference, str) or reference not in operation_index
            for reference in references
        ):
            raise TypeError(key + " references an unknown numerical capability")
        frontend_index[key] = metadata
    return {
        "schema_version": 3,
        "domains": domains,
        "operation_index": operation_index,
        "frontend_index": frontend_index,
        "resource_budget_contract": _resource_budget_contract(),
        "portability_contract": {
            "implementation_targets": "declared build/runtime targets",
            "receipt_qualification": "empty unless exact retained receipt digests are bound",
        },
    }


def describe(operation: str, domain: str | None = None) -> dict[str, JSONValue]:
    """Describe one operation by qualified name or unambiguous short name."""
    if not isinstance(operation, str) or operation == "":
        raise ValueError("numerical operation must be a nonempty string")
    if domain is not None:
        canonical = _canonical_domain(domain)
        qualified = canonical + "." + operation
    elif "." in operation:
        prefix, short_name = operation.split(".", 1)
        qualified = _canonical_domain(prefix) + "." + short_name
    else:
        registry = capabilities()
        index = registry.get("operation_index")
        if not isinstance(index, dict):
            raise TypeError("numerical capability registry has no operation index")
        matches = [name for name in index if name.endswith("." + operation)]
        if len(matches) == 0:
            raise ValueError("unknown numerical operation: " + operation)
        if len(matches) > 1:
            raise ValueError(
                "ambiguous numerical operation "
                + operation
                + "; use one of "
                + ", ".join(sorted(matches))
            )
        qualified = matches[0]
    registry = capabilities()
    index = registry.get("operation_index")
    if not isinstance(index, dict) or qualified not in index:
        raise ValueError("unknown numerical operation: " + qualified)
    record = index[qualified]
    if not isinstance(record, dict):
        raise TypeError("invalid numerical capability record")
    capability = record.get("capability")
    if not isinstance(capability, dict):
        raise TypeError("numerical operation capability must be an object")
    return dict(capability)


def supports(problem: NumericalProblem, method: str | None = None) -> bool:
    """Return whether the owning numerical domain accepts a problem and method."""
    if not isinstance(problem, NumericalProblem):
        return False
    domain = _DOMAIN_ALIASES.get(problem.domain, problem.domain)
    if domain == "roots":
        return _root_supports(problem, method)
    if domain == "approximation":
        from .approximation import supports as approximation_supports

        return approximation_supports(problem, method)
    if domain == "integration":
        from .integration import supports as integration_supports

        return integration_supports(problem, method)
    if domain == "linear_algebra":
        from .linear_algebra import supports as linear_supports

        return linear_supports(problem, method)
    if domain == "optimization":
        from .optimization import supports as optimization_supports

        return optimization_supports(problem, method)
    if domain == "ode":
        from .ode import OdeProblem, supports_ode

        return isinstance(problem, OdeProblem) and supports_ode(problem, method)
    if domain == "spectral":
        from .spectral import supports as spectral_supports

        return spectral_supports(problem, method)
    if domain == "statistics":
        from .statistics import supports as statistics_supports

        return statistics_supports(problem, method)
    return False


def plan(problem: NumericalProblem, method: str | None = None) -> NumericalPlan:
    """Dispatch side-effect-free planning to the problem's owning domain."""
    if not isinstance(problem, NumericalProblem):
        raise TypeError("numerical planning requires a NumericalProblem")
    domain = _DOMAIN_ALIASES.get(problem.domain, problem.domain)
    if domain == "roots":
        return _root_plan(problem, method)
    if domain == "approximation":
        from .approximation import plan as approximation_plan

        return approximation_plan(problem, method)
    if domain == "integration":
        from .integration import plan_integration

        return plan_integration(problem, method)
    if domain == "linear_algebra":
        from .linear_algebra import plan as linear_plan

        return linear_plan(problem, method)
    if domain == "optimization":
        from .optimization import plan as optimization_plan

        return optimization_plan(problem, method)
    if domain == "ode":
        from .ode import OdeProblem, plan_ode

        if not isinstance(problem, OdeProblem):
            raise TypeError("ODE planning requires an OdeProblem")
        return plan_ode(problem, method)
    if domain == "spectral":
        from .spectral import plan as spectral_plan

        return spectral_plan(problem, method)
    if domain == "statistics":
        from .statistics import plan as statistics_plan

        return statistics_plan(problem, method)
    raise NotImplementedError(
        "planning is not implemented for domain " + problem.domain
    )
