"""Deterministic scheduling contracts for independent maximal-order work.

The local number-field algorithms deliberately live elsewhere.  This module
owns the narrow P5 isolation boundary between those algorithms and Sage.js's
worker pool.  Values crossing that boundary are recursively immutable tuples
of exact integers, strings, booleans, and `None`; in particular, they never
contain a FLINT resource, pointer, parent object, or host identity.

The public constructors validate and canonicalize every payload.  Callers can
therefore use `run_local_jobs` with a module-level worker function, then
consume the returned CRT/HNF plan without depending on worker completion
order.  The same code is ordinary CPython and provides a sequential fallback
when workers are unavailable or the measured setup threshold predicts a loss.

The parent runtime and its exact precompiled-module allowlist are trusted.  A
worker result is not trusted merely because it crossed that boundary: it must
contain the complete canonical job that produced it, and the parent validates
that binding plus every mathematical payload field before merging.  This is
an integrity boundary, not a cryptographic authentication protocol for a
hostile parent process.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Iterable, TypeAlias, cast

from sagejs.number_fields.maximal_order_contracts import (
    DiscriminantComponent,
    LocalOrderResult,
    OrderBasis,
)

WireScalar: TypeAlias = int | str | bool | None
WireValue: TypeAlias = WireScalar | tuple["WireValue", ...]
# Tuple positions are schema-versioned and runtime-validated.  ``Any`` at this
# alias boundary reflects that positional schemas cannot be expressed as one
# recursive homogeneous tuple type; it does not weaken the wire validator.
JobPayload: TypeAlias = tuple[Any, ...]
ResultPayload: TypeAlias = tuple[Any, ...]

JOB_SCHEMA = "sagejs.number-fields.local-job.v1"
COMPONENT_SCHEMA = "sagejs.number-fields.local-component.v1"
RESULT_SCHEMA = "sagejs.number-fields.local-result.v2"
POLICY_SCHEMA = "sagejs.number-fields.local-policy.v1"
SCHEDULE_SCHEMA = "sagejs.number-fields.local-schedule.v1"
MERGE_SCHEMA = "sagejs.number-fields.local-merge-plan.v1"
MERGE_STEP_SCHEMA = "sagejs.number-fields.local-merge-step.v1"
RESOURCE_SCHEMA = "sagejs.number-fields.local-resources.v1"
RUN_SCHEMA = "sagejs.number-fields.local-run.v1"

# Creating four isolated Sage.js evaluators plus their first payload round trip
# costs roughly 19 seconds on the P5 reference host under a representative
# CPU-bound load.  A branch must represent at least 3 seconds and the full
# batch at least 35 seconds of predicted local work before parallel execution
# is selected.  These deliberately conservative values keep tiny fields
# sequential on slower CI and Windows hosts as well.
DEFAULT_POLICY: tuple[Any, ...] = (
    POLICY_SCHEMA,
    3,  # minimum independent components
    35_000_000,  # minimum total predicted local work, microseconds
    3_000_000,  # minimum predicted work for each useful worker, microseconds
    4,  # implementation-wide worker ceiling
    512 * 1024 * 1024,  # conservative P5 peak-memory ceiling
    "bench/number-field-local-parallel.cjs:v1",
)


class LocalPayloadError(ValueError):
    """Raised when a local job or result is not canonical wire data."""


class LocalCertificationError(ArithmeticError):
    """Raised after a local worker reports a fatal certification failure."""


class LocalWorkerError(RuntimeError):
    """Raised after a worker or worker-pool transport fails."""


def _integer(value: Any, label: str, minimum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise LocalPayloadError(label + " must be an exact integer")
    answer = int(value)
    if minimum is not None and answer < minimum:
        raise LocalPayloadError(label + " must be at least " + str(minimum))
    return answer


def _wire_value(value: Any, label: str = "wire value") -> WireValue:
    if value is None or isinstance(value, str) or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, tuple):
        return tuple(_wire_value(item, label) for item in value)
    raise LocalPayloadError(
        label + " must contain only exact integers, strings, booleans, None, and tuples"
    )


def _freeze_json(value: Any, label: str = "contract value") -> WireValue:
    """Freeze one shared-contract dictionary as deterministic wire data."""
    if value is None or isinstance(value, str) or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, list) or isinstance(value, tuple):
        return ("list", tuple(_freeze_json(item, label) for item in value))
    if isinstance(value, dict):
        entries = []
        if any(not isinstance(key, str) for key in value):
            raise LocalPayloadError(label + " dictionary keys must be strings")
        for key in sorted(value):
            entries.append((key, _freeze_json(value[key], label)))
        return ("dict", tuple(entries))
    raise LocalPayloadError(label + " is not an exact shared-contract value")


def _thaw_json(value: Any, label: str = "contract value") -> Any:
    """Decode data produced by :func:`_freeze_json`."""
    canonical = _wire_value(value, label)
    if not isinstance(canonical, tuple):
        return canonical
    if len(canonical) != 2 or canonical[0] not in ("list", "dict"):
        raise LocalPayloadError(label + " has an invalid container tag")
    entries = canonical[1]
    if not isinstance(entries, tuple):
        raise LocalPayloadError(label + " has invalid container entries")
    if canonical[0] == "list":
        return [_thaw_json(item, label) for item in entries]
    answer: dict[str, Any] = {}
    for entry in entries:
        if not isinstance(entry, tuple) or len(entry) != 2:
            raise LocalPayloadError(label + " has an invalid dictionary entry")
        key = entry[0]
        if not isinstance(key, str) or key in answer:
            raise LocalPayloadError(label + " has an invalid dictionary key")
        answer[key] = _thaw_json(entry[1], label)
    return answer


def _wire_evidence_to_json(value: WireValue) -> Any:
    if isinstance(value, tuple):
        return [_wire_evidence_to_json(item) for item in value]
    return value


def _component_contract(value: Any) -> DiscriminantComponent:
    if isinstance(value, DiscriminantComponent):
        return _component_from_dict(value.to_dict())
    if isinstance(value, dict):
        return _component_from_dict(value)
    prime = _integer(value, "local prime", 2)
    return DiscriminantComponent(
        prime,
        "proven-prime",
        evidence={"source": "canonical-local-job"},
    )


def _component_from_dict(value: dict[str, Any]) -> DiscriminantComponent:
    return DiscriminantComponent(
        value["value"],
        value["state"],
        base=value.get("base"),
        exponent=value.get("exponent", 1),
        evidence=value.get("evidence", {}),
    )


def _validate_component_wire(value: Any) -> dict[str, Any]:
    thawed = _thaw_json(value, "discriminant component")
    if not isinstance(thawed, dict):
        raise LocalPayloadError("discriminant component must decode to a dictionary")
    component_value = _integer(thawed.get("value"), "component value", 1)
    state = thawed.get("state")
    if state not in (
        "proven-prime",
        "probable-prime-awaiting-proof",
        "composite",
        "unresolved-coprime-component",
    ):
        raise LocalPayloadError("invalid discriminant component state")
    base = _integer(thawed.get("base"), "component base", 1)
    exponent = _integer(thawed.get("exponent"), "component exponent", 1)
    if base**exponent != component_value:
        raise LocalPayloadError(
            "component base and exponent do not reproduce its value"
        )
    if not isinstance(thawed.get("evidence"), dict):
        raise LocalPayloadError("component evidence must be a dictionary")
    return thawed


def _component_from_wire(value: Any) -> DiscriminantComponent:
    thawed = _validate_component_wire(value)
    return _component_from_dict(thawed)


def _basis_from_dict(value: dict[str, Any]) -> OrderBasis:
    basis = OrderBasis(
        value["numerator"],
        value["denominator"],
        canonical=bool(value.get("canonical", False)),
    )
    if value.get("degree") != basis.degree:
        raise LocalPayloadError("order-basis degree evidence is stale")
    if value.get("determinant_numerator") != basis.determinant_numerator:
        raise LocalPayloadError("order-basis determinant evidence is stale")
    return basis


def _local_result_from_wire(value: Any) -> LocalOrderResult:
    thawed = _thaw_json(value, "local-order result")
    if not isinstance(thawed, dict):
        raise LocalPayloadError("local-order result must decode to a dictionary")
    component_value = thawed.get("component")
    if not isinstance(component_value, dict):
        raise LocalPayloadError("local-order result component is invalid")
    component = _component_from_dict(component_value)
    basis_value = thawed.get("basis")
    if basis_value is None:
        basis = None
    elif isinstance(basis_value, dict):
        basis = _basis_from_dict(basis_value)
    else:
        raise LocalPayloadError("local-order result basis is invalid")
    evidence = thawed.get("evidence")
    trace = thawed.get("trace")
    state = thawed.get("state")
    algorithm = thawed.get("algorithm")
    if not isinstance(evidence, dict) or not isinstance(trace, list):
        raise LocalPayloadError("local-order result evidence is invalid")
    if not isinstance(state, str) or not isinstance(algorithm, str):
        raise LocalPayloadError("local-order result state or algorithm is invalid")
    return LocalOrderResult(
        state,
        algorithm,
        component,
        basis=basis,
        index=thawed.get("index", 1),
        discriminant=thawed.get("discriminant"),
        evidence=evidence,
        trace=trace,
        message=thawed.get("message"),
    )


def _integer_tuple(values: Iterable[Any], label: str) -> tuple[int, ...]:
    return tuple(_integer(value, label) for value in values)


def _canonical_basis_contract(
    numerator_rows: Iterable[Iterable[Any]], denominator: Any, degree: int
) -> tuple[tuple[tuple[int, ...], ...], int, int]:
    rows = tuple(
        tuple(_integer(entry, "basis numerator entry") for entry in row)
        for row in _canonical_matrix(numerator_rows, degree)
    )
    denominator_value = _integer(denominator, "basis denominator", 1)
    common = denominator_value
    for row in rows:
        for entry in row:
            common = _gcd(common, entry)
    if common > 1:
        denominator_value //= common
        rows = tuple(tuple(entry // common for entry in row) for row in rows)
    determinant = _determinant(rows)
    if determinant == 0:
        raise LocalPayloadError("a local basis numerator must be nonsingular")
    return rows, denominator_value, determinant


def _determinant(rows: tuple[tuple[int, ...], ...]) -> int:
    degree = len(rows)
    matrix = [list(row) for row in rows]
    sign = 1
    previous = 1
    for pivot_index in range(degree - 1):
        pivot_row = pivot_index
        while pivot_row < degree and matrix[pivot_row][pivot_index] == 0:
            pivot_row += 1
        if pivot_row == degree:
            return 0
        if pivot_row != pivot_index:
            matrix[pivot_index], matrix[pivot_row] = (
                matrix[pivot_row],
                matrix[pivot_index],
            )
            sign = -sign
        pivot = matrix[pivot_index][pivot_index]
        for row in range(pivot_index + 1, degree):
            for column in range(pivot_index + 1, degree):
                numerator = (
                    matrix[row][column] * pivot
                    - matrix[row][pivot_index] * matrix[pivot_index][column]
                )
                if previous != 1:
                    if numerator % previous != 0:
                        raise ArithmeticError(
                            "fraction-free basis determinant division failed"
                        )
                    numerator //= previous
                matrix[row][column] = numerator
            matrix[row][pivot_index] = 0
        previous = pivot
    return sign * matrix[degree - 1][degree - 1]


def canonical_polynomial(coefficients: Iterable[Any]) -> tuple[int, ...]:
    """Return canonical constant-first storage for a monic integer polynomial."""
    answer = _integer_tuple(coefficients, "polynomial coefficient")
    if len(answer) < 2:
        raise LocalPayloadError("an equation polynomial must have positive degree")
    if answer[-1] != 1:
        raise LocalPayloadError("an equation polynomial must be monic")
    return answer


def canonical_factor(coefficients: Iterable[Any], prime: Any) -> tuple[int, ...]:
    """Return a monic constant-first factor over `GF(prime)`."""
    p = _integer(prime, "local prime", 2)
    answer = tuple(
        value % p for value in _integer_tuple(coefficients, "factor coefficient")
    )
    while len(answer) > 1 and answer[-1] == 0:
        answer = answer[:-1]
    if len(answer) < 2 or answer[-1] != 1:
        raise LocalPayloadError("a local factor must be monic and nonconstant")
    return answer


def _digest_parts(parts: Iterable[Any]) -> int:
    """Return a stable unsigned 63-bit FNV-1a digest of canonical values."""
    state = 1469598103934665603
    for part in parts:
        text = repr(part)
        for character in text:
            state ^= ord(character)
            state = (state * 1099511628211) & 0x7FFFFFFFFFFFFFFF
        state ^= 255
        state = (state * 1099511628211) & 0x7FFFFFFFFFFFFFFF
    return state


def make_local_job(
    polynomial_coefficients: Iterable[Any],
    prime: Any,
    component_index: Any,
    factor_coefficients: Iterable[Any],
    discriminant_valuation: Any,
    predicted_micros: Any,
    predicted_peak_bytes: Any,
    *,
    algorithm: str = "round2",
    seed: Any | None = None,
) -> JobPayload:
    """Construct one canonical immutable local-component job.

    `predicted_micros` and `predicted_peak_bytes` come from the maximal
    order selector.  They are evidence used only for scheduling and never
    influence the mathematical result.
    """
    polynomial = canonical_polynomial(polynomial_coefficients)
    component_contract = _component_contract(prime)
    p = component_contract.base
    ordinal = _integer(component_index, "component index", 0)
    factor = canonical_factor(factor_coefficients, p)
    valuation = _integer(discriminant_valuation, "discriminant valuation", 0)
    work = _integer(predicted_micros, "predicted work", 0)
    peak = _integer(predicted_peak_bytes, "predicted peak bytes", 0)
    if not isinstance(algorithm, str) or not algorithm:
        raise LocalPayloadError("algorithm must be a nonempty string")
    if seed is None:
        deterministic_seed = _digest_parts(
            (polynomial, p, ordinal, factor, valuation, algorithm)
        )
    else:
        deterministic_seed = _integer(seed, "seed", 0)
    component: tuple[Any, ...] = (
        COMPONENT_SCHEMA,
        p,
        ordinal,
        factor,
        valuation,
        _freeze_json(component_contract.to_dict(), "discriminant component"),
    )
    return (
        JOB_SCHEMA,
        polynomial,
        component,
        deterministic_seed,
        work,
        peak,
        algorithm,
    )


def validate_local_job(job: Any) -> JobPayload:
    """Validate and return a canonical local job payload."""
    value = _wire_value(job, "local job")
    if not isinstance(value, tuple) or len(value) != 7 or value[0] != JOB_SCHEMA:
        raise LocalPayloadError("invalid local job schema")
    polynomial = value[1]
    component = value[2]
    if not isinstance(polynomial, tuple):
        raise LocalPayloadError("local job polynomial must be a tuple")
    if not isinstance(component, tuple) or len(component) != 6:
        raise LocalPayloadError("invalid local component schema")
    if component[0] != COMPONENT_SCHEMA:
        raise LocalPayloadError("invalid local component schema")
    component_contract = _validate_component_wire(component[5])
    if component_contract["base"] != component[1]:
        raise LocalPayloadError("local component base does not match its worker prime")
    if canonical_polynomial(polynomial) != polynomial:
        raise LocalPayloadError("local job is not canonically encoded")
    p = _integer(component[1], "local prime", 2)
    _integer(component[2], "component index", 0)
    if (
        not isinstance(component[3], tuple)
        or canonical_factor(component[3], p) != component[3]
    ):
        raise LocalPayloadError("local factor is not canonically encoded")
    _integer(component[4], "discriminant valuation", 0)
    _integer(value[3], "seed", 0)
    _integer(value[4], "predicted work", 0)
    _integer(value[5], "predicted peak bytes", 0)
    if value[6] not in ("dedekind", "round2", "polygon", "round4", "om-maxmin"):
        raise LocalPayloadError("invalid local maximal-order algorithm")
    return value


def local_job_key(job: Any) -> tuple[Any, ...]:
    """Return the stable sort/identity key for one local job."""
    value = validate_local_job(job)
    polynomial = value[1]
    component = value[2]
    assert isinstance(polynomial, tuple)
    assert isinstance(component, tuple)
    return (
        polynomial,
        component[1],
        component[2],
        component[3],
        value[3],
    )


def local_job_component(job: Any) -> DiscriminantComponent:
    """Reconstruct the shared discriminant-component record for a worker."""
    value = validate_local_job(job)
    component = value[2]
    assert isinstance(component, tuple)
    return _component_from_wire(component[5])


def _canonical_jobs(jobs: Iterable[Any]) -> tuple[JobPayload, ...]:
    values = tuple(validate_local_job(job) for job in jobs)
    if not values:
        return ()
    polynomial = values[0][1]
    if any(job[1] != polynomial for job in values):
        raise LocalPayloadError("one local run cannot mix equation polynomials")
    ordered = tuple(sorted(values, key=local_job_key))
    keys = tuple(local_job_key(job) for job in ordered)
    if len(set(keys)) != len(keys):
        raise LocalPayloadError("local job keys must be unique")
    return ordered


def _canonical_certificate(
    certificate: Iterable[tuple[Any, Any]],
) -> tuple[Any, ...]:
    entries: list[tuple[Any, ...]] = []
    for entry in certificate:
        if not isinstance(entry, tuple) or len(entry) != 2:
            raise LocalPayloadError("certificate entries must be pairs")
        name, evidence = entry
        if not isinstance(name, str) or not name:
            raise LocalPayloadError("certificate names must be nonempty strings")
        entries.append((name, _wire_value(evidence, "certificate evidence")))
    entries.sort(key=lambda entry: str(entry[0]))
    names = tuple(entry[0] for entry in entries)
    if len(set(names)) != len(names):
        raise LocalPayloadError("certificate names must be unique")
    return tuple(entries)


def _certificate_evidence(certificate: Any) -> dict[str, Any]:
    return {str(entry[0]): _wire_evidence_to_json(entry[1]) for entry in certificate}


def _canonical_matrix(rows: Iterable[Iterable[Any]], degree: int) -> tuple[Any, ...]:
    matrix = tuple(_integer_tuple(row, "basis numerator entry") for row in rows)
    if len(matrix) != degree or any(len(row) != degree for row in matrix):
        raise LocalPayloadError(
            "a local basis numerator must be square of field degree"
        )
    return matrix


def make_local_result(
    job: Any,
    numerator_rows: Iterable[Iterable[Any]],
    denominator: Any,
    local_index: Any,
    certified_modulus: Any,
    certificate: Iterable[tuple[Any, Any]],
    *,
    peak_bytes: Any = 0,
    elapsed_micros: Any = 0,
) -> ResultPayload:
    """Construct a successful immutable local-basis result."""
    canonical_job = validate_local_job(job)
    polynomial = canonical_job[1]
    component = canonical_job[2]
    assert isinstance(polynomial, tuple)
    assert isinstance(component, tuple)
    p = _integer(component[1], "local prime", 2)
    modulus = _integer(certified_modulus, "certified modulus", 1)
    remaining = modulus
    while remaining % p == 0:
        remaining //= p
    if remaining != 1:
        raise LocalPayloadError("certified modulus must be a power of the local prime")
    canonical_certificate = _canonical_certificate(certificate)
    matrix_rows, denominator_value, determinant = _canonical_basis_contract(
        numerator_rows,
        denominator,
        len(polynomial) - 1,
    )
    index_value = _integer(local_index, "local index", 1)
    shared_result = {
        "state": "complete",
        "algorithm": canonical_job[6],
        "component": _validate_component_wire(component[5]),
        "basis": {
            "schema": "sagejs.number-fields/order-basis-v1",
            "numerator": [list(row) for row in matrix_rows],
            "denominator": denominator_value,
            "degree": len(matrix_rows),
            "determinant_numerator": determinant,
            "canonical": True,
        },
        "index": index_value,
        "discriminant": None,
        "split": None,
        "evidence": _certificate_evidence(canonical_certificate),
        "trace": [],
        "message": None,
    }
    return (
        RESULT_SCHEMA,
        local_job_key(canonical_job),
        "ok",
        matrix_rows,
        denominator_value,
        index_value,
        modulus,
        canonical_certificate,
        _integer(peak_bytes, "worker peak bytes", 0),
        _integer(elapsed_micros, "elapsed microseconds", 0),
        "",
        _freeze_json(shared_result, "local-order result"),
        canonical_job,
    )


def make_fatal_result(job: Any, message: str) -> ResultPayload:
    """Construct a fatal, certification-safe worker result."""
    if not isinstance(message, str) or not message:
        raise LocalPayloadError("fatal result message must be a nonempty string")
    canonical_job = validate_local_job(job)
    component = canonical_job[2]
    shared_result = {
        "state": "certification-error",
        "algorithm": canonical_job[6],
        "component": _validate_component_wire(component[5]),
        "basis": None,
        "index": 1,
        "discriminant": None,
        "split": None,
        "evidence": {},
        "trace": [],
        "message": message,
    }
    return (
        RESULT_SCHEMA,
        local_job_key(canonical_job),
        "fatal",
        (),
        1,
        1,
        1,
        (),
        0,
        0,
        message,
        _freeze_json(shared_result, "local-order result"),
        canonical_job,
    )


def validate_local_result(result: Any) -> ResultPayload:
    """Validate a successful or fatal local worker result."""
    value = _wire_value(result, "local result")
    if not isinstance(value, tuple) or len(value) != 13 or value[0] != RESULT_SCHEMA:
        raise LocalPayloadError("invalid local result schema")
    if not isinstance(value[1], tuple) or len(value[1]) != 5:
        raise LocalPayloadError("invalid local result job key")
    canonical_job = validate_local_job(value[12])
    if value[1] != local_job_key(canonical_job):
        raise LocalPayloadError("local result job key disagrees with its complete job")
    status = value[2]
    if status not in ("ok", "fatal"):
        raise LocalPayloadError("invalid local result status")
    if status == "fatal":
        if value[3:10] != ((), 1, 1, 1, (), 0, 0):
            raise LocalPayloadError("fatal local result contains noncanonical data")
        if not isinstance(value[10], str) or not value[10]:
            raise LocalPayloadError("fatal local result needs a message")
    else:
        if not isinstance(value[3], tuple) or not value[3]:
            raise LocalPayloadError("successful local result needs a basis")
        degree = len(value[3])
        matrix_rows = cast(tuple[tuple[Any, ...], ...], value[3])
        _canonical_matrix(matrix_rows, degree)
        _integer(value[4], "basis denominator", 1)
        _integer(value[5], "local index", 1)
        _integer(value[6], "certified modulus", 1)
        if not isinstance(value[7], tuple):
            raise LocalPayloadError("local certificate must be a tuple")
        certificate = cast(tuple[tuple[Any, Any], ...], value[7])
        _canonical_certificate(certificate)
        _integer(value[8], "worker peak bytes", 0)
        _integer(value[9], "elapsed microseconds", 0)
        if value[10] != "":
            raise LocalPayloadError("successful local result has an error message")
    shared_result = _local_result_from_wire(value[11])
    expected_state = "complete" if status == "ok" else "certification-error"
    if shared_result.state != expected_state:
        raise LocalPayloadError(
            "local result status disagrees with its shared contract"
        )
    component = canonical_job[2]
    assert isinstance(component, tuple)
    if shared_result.component.to_dict() != _validate_component_wire(component[5]):
        raise LocalPayloadError(
            "local result component disagrees with its complete job"
        )
    if shared_result.algorithm != canonical_job[6]:
        raise LocalPayloadError(
            "local result algorithm disagrees with its complete job"
        )
    if shared_result.index != value[5]:
        raise LocalPayloadError("local result index disagrees with its shared contract")
    if status == "ok":
        assert shared_result.basis is not None
        expected_basis = (
            tuple(
                tuple(entry for entry in row) for row in shared_result.basis.numerator
            ),
            shared_result.basis.denominator,
        )
        if (value[3], value[4]) != expected_basis:
            raise LocalPayloadError(
                "local result basis disagrees with its shared contract"
            )
    elif shared_result.message != value[10]:
        raise LocalPayloadError("fatal message disagrees with its shared contract")
    return value


def local_result_contract(result: Any) -> LocalOrderResult:
    """Reconstruct the central certified-local-result record in the parent."""
    value = validate_local_result(result)
    return _local_result_from_wire(value[11])


def _policy(policy: Any) -> tuple[Any, ...]:
    value = _wire_value(policy, "parallel policy")
    if not isinstance(value, tuple) or len(value) != 7 or value[0] != POLICY_SCHEMA:
        raise LocalPayloadError("invalid parallel policy schema")
    for index, label in (
        (1, "minimum component count"),
        (2, "minimum total work"),
        (3, "minimum worker work"),
        (4, "worker ceiling"),
        (5, "peak-memory ceiling"),
    ):
        _integer(value[index], label, 1)
    if not isinstance(value[6], str) or not value[6]:
        raise LocalPayloadError("parallel policy must name its benchmark evidence")
    return value


def make_schedule(
    jobs: Iterable[Any],
    *,
    max_workers: Any | None = None,
    cpu_count: Any | None = None,
    worker_capability: bool = True,
    policy: Any = DEFAULT_POLICY,
) -> tuple[Any, ...]:
    """Choose a deterministic sequential or bounded parallel schedule."""
    ordered = _canonical_jobs(jobs)
    tuning = _policy(policy)
    requested = tuning[4] if max_workers is None else max_workers
    workers = _integer(requested, "maximum worker count", 1)
    available_value = os.cpu_count() if cpu_count is None else cpu_count
    available = (
        1 if available_value is None else _integer(available_value, "CPU count", 1)
    )
    workers = min(workers, int(tuning[4]), available, max(1, len(ordered)))
    reason = "parallel-threshold-met"
    if not worker_capability:
        workers = 1
        reason = "worker-capability-unavailable"
    elif len(ordered) < int(tuning[1]):
        workers = 1
        reason = "too-few-local-components"
    elif sum(int(job[4]) for job in ordered) < int(tuning[2]):
        workers = 1
        reason = "predicted-work-below-threshold"
    else:
        useful = sum(1 for job in ordered if int(job[4]) >= int(tuning[3]))
        workers = min(workers, max(1, useful))
        if workers < 2:
            reason = "insufficient-work-to-amortize-workers"
    while workers > 1:
        largest = sorted((int(job[5]) for job in ordered), reverse=True)[:workers]
        parent = sum(wire_size(job) for job in ordered)
        if parent + sum(largest) <= int(tuning[5]):
            break
        workers -= 1
        reason = "peak-memory-worker-bound"
    mode = "parallel" if workers > 1 else "sequential"
    return (
        SCHEDULE_SCHEMA,
        mode,
        workers,
        tuple(local_job_key(job) for job in ordered),
        sum(int(job[4]) for job in ordered),
        conservative_peak_bytes(ordered, (), workers),
        reason,
        tuning[6],
    )


def wire_size(value: Any) -> int:
    """Return a deterministic conservative byte count for canonical wire data."""
    canonical = _wire_value(value)
    if canonical is None:
        return 1
    if isinstance(canonical, bool):
        return 1
    if isinstance(canonical, int):
        return max(1, (abs(canonical).bit_length() + 7) // 8) + 2
    if isinstance(canonical, str):
        return len(canonical.encode("utf-8")) + 4
    return 8 + sum(wire_size(item) for item in canonical)


def conservative_peak_bytes(
    jobs: Iterable[Any], results: Iterable[Any], worker_count: Any
) -> int:
    """Bound parent payloads plus the largest simultaneously live workers."""
    ordered_jobs = _canonical_jobs(jobs)
    canonical_results = tuple(validate_local_result(result) for result in results)
    workers = min(
        _integer(worker_count, "worker count", 1),
        max(1, len(ordered_jobs)),
    )
    parent = sum(wire_size(job) for job in ordered_jobs)
    parent += sum(wire_size(result) for result in canonical_results)
    reported = {
        result[1]: int(result[8]) for result in canonical_results if result[2] == "ok"
    }
    peaks = [
        max(int(job[5]), reported.get(local_job_key(job), 0)) for job in ordered_jobs
    ]
    return parent + sum(sorted(peaks, reverse=True)[:workers])


def resource_evidence(
    jobs: Iterable[Any], results: Iterable[Any], worker_count: Any
) -> tuple[Any, ...]:
    """Return inspectable peak-resource accounting for one completed run."""
    ordered_jobs = _canonical_jobs(jobs)
    canonical_results = tuple(validate_local_result(result) for result in results)
    workers = _integer(worker_count, "worker count", 1)
    return (
        RESOURCE_SCHEMA,
        sum(wire_size(job) for job in ordered_jobs),
        sum(wire_size(result) for result in canonical_results),
        sum(int(job[5]) for job in ordered_jobs),
        max((int(result[8]) for result in canonical_results), default=0),
        conservative_peak_bytes(ordered_jobs, canonical_results, workers),
        min(workers, max(1, len(ordered_jobs))),
    )


def _prime_from_key(key: tuple[Any, ...]) -> int:
    return _integer(key[1], "local result prime", 2)


def make_merge_plan(results: Iterable[Any]) -> tuple[Any, ...]:
    """Build a deterministic same-prime/HNF then coprime-CRT/HNF merge plan."""
    canonical = tuple(
        sorted(
            (validate_local_result(item) for item in results), key=lambda item: item[1]
        )
    )
    if any(result[2] == "fatal" for result in canonical):
        raise LocalCertificationError("local maximal-order certification failed")
    if not canonical:
        return (MERGE_SCHEMA, (), (), 1, 1, ("integer-hnf", "empty"))
    keys = tuple(result[1] for result in canonical)
    if len(set(keys)) != len(keys):
        raise LocalPayloadError("local results must have unique job keys")
    leaves: list[tuple[Any, ...]] = []
    nodes: list[tuple[int, int, int]] = []
    for index, result in enumerate(canonical):
        key = result[1]
        assert isinstance(key, tuple)
        prime = _prime_from_key(key)
        modulus = _integer(result[6], "certified modulus", 1)
        remaining = modulus
        while remaining % prime == 0:
            remaining //= prime
        if remaining != 1:
            raise LocalPayloadError("result modulus does not match its local prime")
        leaves.append((index, key, prime, modulus, result[5], "integer-hnf"))
        nodes.append((index, prime, modulus))

    steps: list[tuple[Any, ...]] = []
    next_node = len(nodes)
    by_prime: dict[int, list[tuple[int, int, int]]] = {}
    for node in nodes:
        by_prime.setdefault(node[1], []).append(node)
    prime_nodes: list[tuple[int, int, int]] = []
    for prime in sorted(by_prime):
        current = by_prime[prime][0]
        for right in by_prime[prime][1:]:
            output_modulus = max(current[2], right[2])
            steps.append(
                (
                    MERGE_STEP_SCHEMA,
                    next_node,
                    "same-prime-intersection-hnf",
                    current[0],
                    right[0],
                    current[2],
                    right[2],
                    output_modulus,
                    "integer-hnf",
                )
            )
            current = (next_node, prime, output_modulus)
            next_node += 1
        prime_nodes.append(current)

    level = prime_nodes
    while len(level) > 1:
        following: list[tuple[int, int, int]] = []
        for index in range(0, len(level), 2):
            if index + 1 == len(level):
                following.append(level[index])
                continue
            left = level[index]
            right = level[index + 1]
            if _gcd(left[2], right[2]) != 1:
                raise LocalPayloadError("CRT merge moduli must be coprime")
            output_modulus = left[2] * right[2]
            steps.append(
                (
                    MERGE_STEP_SCHEMA,
                    next_node,
                    "coprime-crt-hnf",
                    left[0],
                    right[0],
                    left[2],
                    right[2],
                    output_modulus,
                    "integer-hnf",
                )
            )
            following.append((next_node, 0, output_modulus))
            next_node += 1
        level = following
    total_index = 1
    for result in canonical:
        total_index *= int(result[5])
    return (
        MERGE_SCHEMA,
        tuple(leaves),
        tuple(steps),
        level[0][2],
        total_index,
        (
            "canonical-result-order",
            "same-prime-intersection-before-crt",
            "pairwise-coprime-crt",
            "integer-hnf-after-every-merge",
        ),
    )


def _gcd(left: int, right: int) -> int:
    a = abs(left)
    b = abs(right)
    while b:
        a, b = b, a % b
    return a


def collect_local_results(
    jobs: Iterable[Any], results: Iterable[Any]
) -> tuple[ResultPayload, ...]:
    """Canonicalize results and prove exact one-to-one job correspondence."""
    ordered_jobs = _canonical_jobs(jobs)
    expected = ordered_jobs
    canonical = tuple(
        sorted(
            (validate_local_result(item) for item in results), key=lambda item: item[1]
        )
    )
    actual = tuple(result[12] for result in canonical)
    if actual != expected:
        raise LocalPayloadError(
            "local results do not correspond exactly to submitted jobs"
        )
    if any(result[2] == "fatal" for result in canonical):
        raise LocalCertificationError("local maximal-order certification failed")
    return canonical


def assemble_local_run(
    jobs: Iterable[Any],
    results: Iterable[Any],
    schedule: Any,
) -> tuple[Any, ...]:
    """Assemble the completion-order-independent P5 result and evidence."""
    ordered_jobs = _canonical_jobs(jobs)
    canonical_results = collect_local_results(ordered_jobs, results)
    canonical_schedule = _wire_value(schedule, "local schedule")
    if not isinstance(canonical_schedule, tuple) or len(canonical_schedule) != 8:
        raise LocalPayloadError("invalid local schedule")
    if canonical_schedule[0] != SCHEDULE_SCHEMA:
        raise LocalPayloadError("invalid local schedule schema")
    if canonical_schedule[3] != tuple(local_job_key(job) for job in ordered_jobs):
        raise LocalPayloadError("local schedule does not describe the submitted jobs")
    worker_count = canonical_schedule[2]
    return (
        RUN_SCHEMA,
        canonical_schedule,
        canonical_results,
        make_merge_plan(canonical_results),
        resource_evidence(ordered_jobs, canonical_results, worker_count),
    )


def run_local_jobs(
    jobs: Iterable[Any],
    worker: Callable[[JobPayload], ResultPayload],
    *,
    max_workers: Any | None = None,
    cpu_count: Any | None = None,
    worker_capability: bool = True,
    policy: Any = DEFAULT_POLICY,
    pool_factory: Callable[[int], Any] | None = None,
) -> tuple[Any, ...]:
    """Execute local jobs sequentially or through a bounded worker pool.

    A fatal certification payload or transport exception terminates the pool
    before the error is exposed.  The public exception type and message are
    independent of which worker completed first.
    """
    ordered_jobs = _canonical_jobs(jobs)
    schedule = make_schedule(
        ordered_jobs,
        max_workers=max_workers,
        cpu_count=cpu_count,
        worker_capability=worker_capability,
        policy=policy,
    )
    if schedule[1] == "sequential" or not ordered_jobs:
        sequential_results = []
        for job in ordered_jobs:
            result = validate_local_result(worker(job))
            if result[2] == "fatal":
                raise LocalCertificationError(
                    "local maximal-order certification failed"
                )
            sequential_results.append(result)
        return assemble_local_run(ordered_jobs, sequential_results, schedule)

    if pool_factory is None:
        from multiprocessing import Pool

        factory: Callable[[int], Any] = Pool
    else:
        factory = pool_factory
    worker_count = int(schedule[2])
    pool = factory(worker_count)
    results: list[ResultPayload] = []
    try:
        # Queue longest predicted jobs first and let the bounded pool pull the
        # next branch whenever any worker becomes free.  The scheduling model
        # uses the same deterministic LPT placement in its critical-path
        # estimate.  Waiting for canonical-key waves made that estimate false:
        # one long branch could strand every sibling until the whole wave
        # finished.  All canonicalization remains parent-side, and retaining
        # individual handles preserves prompt fatal-result cancellation.
        execution_jobs = sorted(
            ordered_jobs,
            key=lambda job: (-int(job[4]), local_job_key(job)),
        )
        pending = [pool.apply_async(worker, (job,)) for job in execution_jobs]
        while pending:
            ready = [handle for handle in pending if handle.ready()]
            if not ready:
                pending[0].wait(0.01)
                continue
            for handle in ready:
                pending.remove(handle)
                result = validate_local_result(handle.get())
                if result[2] == "fatal":
                    pool.terminate()
                    pool.join()
                    raise LocalCertificationError(
                        "local maximal-order certification failed"
                    )
                results.append(result)
        pool.close()
        pool.join()
    except LocalCertificationError:
        raise
    except Exception as error:
        try:
            pool.terminate()
            pool.join()
        except Exception:
            pass
        raise LocalWorkerError("local maximal-order worker execution failed") from error
    return assemble_local_run(ordered_jobs, results, schedule)


__all__ = [
    "DEFAULT_POLICY",
    "LocalCertificationError",
    "LocalPayloadError",
    "LocalWorkerError",
    "assemble_local_run",
    "canonical_factor",
    "canonical_polynomial",
    "collect_local_results",
    "conservative_peak_bytes",
    "local_job_key",
    "local_job_component",
    "local_result_contract",
    "make_local_job",
    "make_local_result",
    "make_fatal_result",
    "make_merge_plan",
    "make_schedule",
    "resource_evidence",
    "run_local_jobs",
    "validate_local_job",
    "validate_local_result",
    "wire_size",
]
