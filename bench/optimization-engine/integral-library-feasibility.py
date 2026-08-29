"""Implementation-faithful feasibility target for dense prime-field integrals.

This is deliberately bench-only.  It models the proposed public dispatcher
without patching it: an explicitly permitted Node host may split a long
`GF(p)` polynomial into bounded FLINT blocks, while every guard miss enters
the existing generic `Polynomial.integral` operation.  Candidate storage is
private until the sole final publication.

The module is ordinary CPython-parseable Python.  When Sage.js executes it as
a program it emits one machine-readable receipt after exercising the real
packed kernel (Node) or the real generic fallback (browser).
"""

from __future__ import annotations

import json
from typing import Any

import sagejs.runtime as runtime


FROZEN_EPOCH_ID = (
    "sha256:a8f9f317c7945ddcd931ae8eabe6482fd5feef2c95199cdcd7bd1b00a5390bb3"
)
REPRESENTATIVE_WORKLOAD_ID = (
    "sha256:acafa1b0dde04685c7f3312bcb3bad9ee35a3a79a834ae5d27d5d982f8ef30d8"
)
HELD_OUT_WORKLOAD_ID = (
    "sha256:059ee19cbae72114c77c03c944def822999fcec8c4a79b76f0265c70f0461612"
)
FLINT_PACKAGE = "@sagemath/sagejs-flint"
FLINT_EXPORT = "ffiNmodPolyIntegral"

# These are selection-time safety bounds, not wall-clock guarantees.
MAX_BLOCK_PRIME = 65_537
MAX_SOURCE_LENGTH = 100_000
MAX_PERIODS = 256


def state_record() -> dict[str, Any]:
    """Return fresh, externally inspectable candidate-effect accounting."""
    return {
        "capabilityQueries": 0,
        "kernelLoads": 0,
        "aggregateAllocations": 0,
        "blockAllocations": 0,
        "inputViews": 0,
        "nativeCalls": 0,
        "placements": 0,
        "fallbackRestarts": 0,
        "publications": 0,
        "checkpoints": [],
    }


def _node_host_policy_allows_dynamic_ffi() -> bool:
    process = runtime.reflect.get(runtime.global_object, "process")
    versions = (
        runtime.undefined
        if process is runtime.undefined
        else runtime.reflect.get(process, "versions")
    )
    node = (
        runtime.undefined
        if versions is runtime.undefined
        else runtime.reflect.get(versions, "node")
    )
    return node is not runtime.undefined


def _long_route_domain(source_length: int, prime: int, host_allowed: bool) -> bool:
    """Check every static guard without importing or allocating anything."""
    return (
        host_allowed
        and prime >= 2
        and prime <= MAX_BLOCK_PRIME
        and source_length >= prime
        and source_length <= MAX_SOURCE_LENGTH
        and source_length < MAX_PERIODS * prime
    )


def _exact_integral_capability() -> bool:
    """Query the reviewed package and exact export, treating absence as false."""
    try:
        backend = runtime.require_module(FLINT_PACKAGE)
        candidate = runtime.reflect.get(backend, FLINT_EXPORT)
        return runtime.jstype(candidate) == "function"
    except KeyboardInterrupt:
        raise
    except Exception:
        return False


def _buffer_view(source: Any, start: int, stop: int) -> Any:
    subarray = runtime.reflect.get(source, "subarray")
    return runtime.reflect.apply(subarray, source, [start, stop])


def _buffer_set(destination: Any, source: Any, start: int) -> None:
    setter = runtime.reflect.get(destination, "set")
    runtime.reflect.apply(setter, destination, [source, start])


def _trim_uint64_buffer(source: Any) -> Any:
    length = len(source)
    while length > 0 and source[length - 1] == 0:
        length -= 1
    if length == len(source):
        return source
    return runtime.uint64_buffer_prefix(source, length)


def _default_native_factory() -> Any:
    module = __import__(
        "sagejs.kernels.polynomial.structural_flint",
        fromlist=["structural_flint"],
    )
    return module.flint_prime_polynomial_integral


def guarded_flint_block_integral(
    source: Any,
    prime: int,
    *,
    host_allowed: bool | None = None,
    capability_probe: Any = None,
    native_factory: Any = None,
    allocate: Any = None,
    view: Any = None,
    place: Any = None,
    check_interrupt: Any = None,
    fallback: Any = None,
    publish: Any = None,
    state: dict[str, Any] | None = None,
) -> Any:
    """Execute the bounded candidate or the untouched generic fallback.

    A checked native `False` restarts the generic operation.  Unexpected
    native exceptions propagate exactly; notably, `KeyboardInterrupt` is
    explicitly re-raised and never becomes a fallback signal.
    """
    if state is None:
        state = state_record()
    if host_allowed is None:
        host_allowed = _node_host_policy_allows_dynamic_ffi()
    if capability_probe is None:
        capability_probe = _exact_integral_capability
    if native_factory is None:
        native_factory = _default_native_factory
    if allocate is None:
        allocate = runtime.uint64_buffer
    if view is None:
        view = _buffer_view
    if place is None:
        place = _buffer_set
    if check_interrupt is None:
        check_interrupt = lambda _event: runtime.check_interrupt()
    if fallback is None:
        fallback = lambda value: value.integral()
    if publish is None:
        publish = lambda value, output: value._new(_trim_uint64_buffer(output))

    source_length = source._coefficient_length()
    storage = source._storage

    # Every cap misses before the exact capability query or candidate effects.
    if not _long_route_domain(source_length, prime, host_allowed):
        state["fallbackRestarts"] += 1
        return fallback(source)

    state["capabilityQueries"] += 1
    try:
        capable = capability_probe()
    except KeyboardInterrupt:
        raise
    except Exception:
        capable = False
    if not capable:
        state["fallbackRestarts"] += 1
        return fallback(source)

    # Complete in increasing order.  There is intentionally no interrupt poll,
    # allocation, import, or foreign call before a singular generic fallback.
    for singular in range(prime - 1, source_length, prime):
        if storage[singular] != 0:
            state["fallbackRestarts"] += 1
            return fallback(source)

    def checkpoint(event: str) -> None:
        state["checkpoints"].append(event)
        check_interrupt(event)

    checkpoint("candidate:before-allocation")
    native_call = native_factory()
    state["kernelLoads"] += 1
    output = allocate(source_length + 1)
    state["aggregateAllocations"] += 1

    block_index = 0
    for start in range(0, source_length, prime):
        available = min(prime - 1, source_length - start)
        if available == 0:
            continue
        checkpoint("block:" + str(block_index) + ":before-allocation-and-call")
        block_source = view(storage, start, start + available)
        block_output = allocate(available + 1)
        state["inputViews"] += 1
        state["blockAllocations"] += 1
        state["nativeCalls"] += 1
        try:
            valid = native_call(
                block_output,
                block_source,
                available + 1,
                available,
                prime,
            )
        except KeyboardInterrupt:
            raise
        if not valid:
            state["fallbackRestarts"] += 1
            return fallback(source)
        checkpoint("block:" + str(block_index) + ":after-call")
        place(output, block_output, start)
        state["placements"] += 1
        checkpoint("block:" + str(block_index) + ":after-placement")
        block_index += 1

    checkpoint("candidate:before-publication")
    result = publish(source, output)
    state["publications"] += 1
    return result


def _make_polynomial(prime: int, source_length: int) -> tuple[Any, list[int], Any]:
    finite_fields = __import__("sagejs._baselib.finite_fields", fromlist=["GF"])
    polynomial_module = __import__(
        "sagejs._baselib.polynomial", fromlist=["PolynomialRing"]
    )
    field = finite_fields.GF(prime)
    ring = polynomial_module.PolynomialRing(field, "x")
    coefficients = [
        (index * index + 3 * index - 7) % prime for index in range(source_length)
    ]
    for singular in range(prime - 1, source_length, prime):
        coefficients[singular] = 0
    return ring, coefficients, ring(coefficients)


def _fallback_counter(record: dict[str, int]) -> Any:
    def fallback(value: Any) -> Any:
        record["calls"] += 1
        return value.integral()

    return fallback


def _actual_native() -> Any:
    return _default_native_factory()


def _injected_native(actual: Any, target: int, mode: str) -> tuple[Any, dict[str, int]]:
    record = {"calls": 0}

    def call(*args: Any) -> bool:
        current = record["calls"]
        record["calls"] += 1
        if current == target:
            if mode == "false":
                return False
            if mode == "exception":
                raise RuntimeError("injected native exception " + str(target))
            raise KeyboardInterrupt("injected native interrupt " + str(target))
        return actual(*args)

    return call, record


def _fake_guard_contract() -> dict[str, Any]:
    """Prove each exact static boundary before any capability query/effect."""
    cases = [
        ("prime-at-cap", 65_537, 65_537, True),
        ("prime-over-cap", 65_538, 65_538, False),
        ("length-at-cap", 65_537, 100_000, True),
        ("length-over-cap", 65_537, 100_001, False),
        ("period-strict-below", 257, 256 * 257 - 1, True),
        ("period-at-boundary", 257, 256 * 257, False),
        ("existing-short-route", 257, 256, False),
    ]
    observed = []
    for name, prime, source_length, expected in cases:
        actual = _long_route_domain(source_length, prime, True)
        assert actual == expected
        observed.append(
            {
                "name": name,
                "prime": prime,
                "sourceLength": source_length,
                "eligible": actual,
            }
        )
    return {
        "caps": {
            "maximumPrime": MAX_BLOCK_PRIME,
            "maximumSourceLength": MAX_SOURCE_LENGTH,
            "strictMaximumPeriods": MAX_PERIODS,
        },
        "boundaryCases": observed,
        "allExact": True,
    }


def _role_fallback_audit(
    role: str,
    workload_id: str,
    prime: int,
    source_length: int,
    projection_indices: list[int],
    expected_projection: list[int],
) -> dict[str, Any]:
    """Execute the actual browser/portable generic route on reviewed inputs."""
    ring, coefficients, polynomial = _make_polynomial(prime, source_length)
    untouched = ring(coefficients)
    state = state_record()
    output = guarded_flint_block_integral(
        polynomial,
        prime,
        host_allowed=False,
        capability_probe=lambda: (_ for _ in ()).throw(
            AssertionError("capability query after denied host policy")
        ),
        state=state,
    )
    projection = [int(output[index].lift()) for index in projection_indices]
    assert projection == expected_projection
    assert output.derivative() == polynomial
    assert polynomial == untouched
    assert state["capabilityQueries"] == 0
    assert state["aggregateAllocations"] == 0
    assert state["nativeCalls"] == 0
    assert state["publications"] == 0

    bad_coefficients = list(coefficients)
    bad_coefficients[prime - 1] = 1
    bad = ring(bad_coefficients)
    observed_error = None
    try:
        guarded_flint_block_integral(bad, prime, host_allowed=False)
    except Exception as error:
        observed_error = [type(error).__name__, str(error)]
    expected_error = [
        "ZeroDivisionError",
        "inverse of Mod(0, " + str(prime) + ") does not exist",
    ]
    assert observed_error == expected_error
    return {
        "role": role,
        "workloadId": workload_id,
        "prime": prime,
        "sourceLength": source_length,
        "route": "untouched-generic-fallback",
        "projection": projection,
        "derivativeReplay": True,
        "inputUntouched": True,
        "singularError": observed_error,
        "state": state,
    }


def _role_candidate_audit(
    role: str,
    workload_id: str,
    prime: int,
    source_length: int,
    projection_indices: list[int],
    expected_projection: list[int],
) -> dict[str, Any]:
    """Exercise every failure and interruption schedule on the real kernel."""
    ring, coefficients, polynomial = _make_polynomial(prime, source_length)
    untouched = ring(coefficients)
    baseline = polynomial.integral()
    actual = _actual_native()

    success_state = state_record()
    candidate = guarded_flint_block_integral(polynomial, prime, state=success_state)
    projection = [int(candidate[index].lift()) for index in projection_indices]
    assert candidate == baseline
    assert candidate.derivative() == polynomial
    assert projection == expected_projection
    assert polynomial == untouched
    assert success_state["publications"] == 1
    call_count = (source_length + prime - 1) // prime
    assert success_state["nativeCalls"] == call_count
    event_schedule = list(success_state["checkpoints"])
    assert len(event_schedule) == 3 * call_count + 2

    # Exact capability absence and probe exceptions are both false, before
    # allocations/import/native/publication.  KeyboardInterrupt is not false.
    guard_failures = []
    for name, probe in [
        ("missing-export", lambda: False),
        ("probe-exception", lambda: (_ for _ in ()).throw(RuntimeError("denied"))),
    ]:
        state = state_record()
        fallback_record = {"calls": 0}
        result = guarded_flint_block_integral(
            polynomial,
            prime,
            capability_probe=probe,
            fallback=_fallback_counter(fallback_record),
            state=state,
        )
        assert result == baseline
        assert fallback_record["calls"] == 1
        assert state["aggregateAllocations"] == 0
        assert state["kernelLoads"] == 0
        assert state["nativeCalls"] == 0
        assert state["publications"] == 0
        guard_failures.append({"injection": name, "state": state})
    guard_interrupt = None
    try:
        guarded_flint_block_integral(
            polynomial,
            prime,
            capability_probe=lambda: (_ for _ in ()).throw(
                KeyboardInterrupt("capability interrupt")
            ),
        )
    except KeyboardInterrupt as error:
        guard_interrupt = [type(error).__name__, str(error)]
    assert guard_interrupt == ["KeyboardInterrupt", "capability interrupt"]

    # A characteristic hole enters the untouched route before the candidate's
    # first poll, allocation, kernel import, or native call.
    bad_coefficients = list(coefficients)
    bad_coefficients[prime - 1] = 1
    bad = ring(bad_coefficients)
    singular_state = state_record()
    singular_poll_count = {"calls": 0}

    def forbidden_poll(_event: str) -> None:
        singular_poll_count["calls"] += 1
        raise AssertionError("candidate poll preceded singular generic fallback")

    singular_error = None
    try:
        guarded_flint_block_integral(
            bad,
            prime,
            check_interrupt=forbidden_poll,
            state=singular_state,
        )
    except Exception as error:
        singular_error = [type(error).__name__, str(error)]
    expected_error = [
        "ZeroDivisionError",
        "inverse of Mod(0, " + str(prime) + ") does not exist",
    ]
    assert singular_error == expected_error
    assert singular_poll_count["calls"] == 0
    assert singular_state["aggregateAllocations"] == 0
    assert singular_state["kernelLoads"] == 0
    assert singular_state["nativeCalls"] == 0
    assert singular_state["publications"] == 0

    checked_false = []
    ordinary_exceptions = []
    native_interruptions = []
    for target in range(call_count):
        injected, calls = _injected_native(actual, target, "false")
        state = state_record()
        fallback_record = {"calls": 0}
        result = guarded_flint_block_integral(
            polynomial,
            prime,
            native_factory=lambda injected=injected: injected,
            fallback=_fallback_counter(fallback_record),
            state=state,
        )
        assert result == baseline
        assert polynomial == untouched
        assert calls["calls"] == target + 1
        assert fallback_record["calls"] == 1
        assert state["publications"] == 0
        checked_false.append(
            {
                "targetCall": target,
                "calls": calls["calls"],
                "placementsBeforeRestart": state["placements"],
            }
        )

        injected, calls = _injected_native(actual, target, "exception")
        state = state_record()
        fallback_record = {"calls": 0}
        observed = None
        try:
            guarded_flint_block_integral(
                polynomial,
                prime,
                native_factory=lambda injected=injected: injected,
                fallback=_fallback_counter(fallback_record),
                state=state,
            )
        except RuntimeError as error:
            observed = [type(error).__name__, str(error)]
        assert observed == ["RuntimeError", "injected native exception " + str(target)]
        assert calls["calls"] == target + 1
        assert fallback_record["calls"] == 0
        assert state["publications"] == 0
        ordinary_exceptions.append(
            {
                "targetCall": target,
                "exception": observed,
                "placementsBeforeException": state["placements"],
            }
        )

        injected, calls = _injected_native(actual, target, "interrupt")
        state = state_record()
        fallback_record = {"calls": 0}
        observed = None
        try:
            guarded_flint_block_integral(
                polynomial,
                prime,
                native_factory=lambda injected=injected: injected,
                fallback=_fallback_counter(fallback_record),
                state=state,
            )
        except KeyboardInterrupt as error:
            observed = [type(error).__name__, str(error)]
        assert observed == [
            "KeyboardInterrupt",
            "injected native interrupt " + str(target),
        ]
        assert calls["calls"] == target + 1
        assert fallback_record["calls"] == 0
        assert state["publications"] == 0
        native_interruptions.append(
            {
                "targetCall": target,
                "exception": observed,
                "placementsBeforeInterrupt": state["placements"],
            }
        )

    poll_interruptions = []
    for target in range(len(event_schedule)):
        poll_record = {"seen": 0, "event": None}

        def injected_poll(event: str) -> None:
            current = poll_record["seen"]
            poll_record["seen"] += 1
            if current == target:
                poll_record["event"] = event
                raise KeyboardInterrupt("injected poll interrupt " + str(target))

        state = state_record()
        fallback_record = {"calls": 0}
        observed = None
        try:
            guarded_flint_block_integral(
                polynomial,
                prime,
                check_interrupt=injected_poll,
                fallback=_fallback_counter(fallback_record),
                state=state,
            )
        except KeyboardInterrupt as error:
            observed = [type(error).__name__, str(error)]
        assert observed == [
            "KeyboardInterrupt",
            "injected poll interrupt " + str(target),
        ]
        assert fallback_record["calls"] == 0
        assert state["publications"] == 0
        assert polynomial == untouched
        poll_interruptions.append(
            {
                "targetPoll": target,
                "event": poll_record["event"],
                "nativeCallsBeforeInterrupt": state["nativeCalls"],
                "placementsBeforeInterrupt": state["placements"],
            }
        )

    # One exact retry after the exhaustive schedules proves source reusability.
    retry_state = state_record()
    retry = guarded_flint_block_integral(polynomial, prime, state=retry_state)
    assert retry == baseline
    assert retry.derivative() == polynomial
    assert polynomial == untouched
    assert retry_state["publications"] == 1

    return {
        "role": role,
        "workloadId": workload_id,
        "prime": prime,
        "sourceLength": source_length,
        "route": "bounded-flint-block-candidate",
        "projection": projection,
        "derivativeReplay": True,
        "inputUntouched": True,
        "successState": success_state,
        "guardFailures": guard_failures,
        "capabilityKeyboardInterrupt": guard_interrupt,
        "singularAdversary": {
            "exception": singular_error,
            "candidatePolls": singular_poll_count["calls"],
            "state": singular_state,
        },
        "nativeFalseSchedules": checked_false,
        "nativeExceptionSchedules": ordinary_exceptions,
        "nativeKeyboardInterruptSchedules": native_interruptions,
        "pollInterruptionSchedules": poll_interruptions,
        "successfulRetry": {
            "exact": True,
            "derivativeReplay": True,
            "state": retry_state,
        },
        "noPartialPublication": True,
    }


def run_feasibility_receipt() -> dict[str, Any]:
    host_allowed = _node_host_policy_allows_dynamic_ffi()
    roles = [
        (
            "representative",
            REPRESENTATIVE_WORKLOAD_ID,
            65_537,
            70_000,
            [0, 1, 2, 65_536, 65_537, 65_538, 70_000],
            [0, 65_530, 32_767, 9, 0, 65_530, 52_453],
        ),
        (
            "held-out",
            HELD_OUT_WORKLOAD_ID,
            257,
            10_000,
            [0, 1, 2, 256, 257, 258, 10_000],
            [0, 250, 127, 9, 0, 250, 146],
        ),
    ]
    if host_allowed:
        assert _exact_integral_capability()
        results = [_role_candidate_audit(*role) for role in roles]
        route = "bounded-flint-block-candidate"
    else:
        results = [_role_fallback_audit(*role) for role in roles]
        route = "untouched-generic-fallback"
    return {
        "schema": "sagejs.optimization-integral-library-feasibility-execution/v1",
        "frozenEpochId": FROZEN_EPOCH_ID,
        "hostPolicy": "node-dynamic-ffi" if host_allowed else "portable-generic",
        "executedRoute": route,
        "staticGuardContract": _fake_guard_contract(),
        "roles": results,
        "claims": {
            "candidateImplementedInProduction": False,
            "directSynchronousHardLatencyBound": False,
            "persistentNativeResources": 0,
            "unexpectedNativeExceptionsPropagate": True,
            "keyboardInterruptExplicitlyRethrown": True,
            "singlePublicConstructionOnSuccess": True,
        },
    }


def emit_feasibility_receipt() -> None:
    print(
        "SAGEJS_INTEGRAL_FEASIBILITY|"
        + json.dumps(run_feasibility_receipt(), sort_keys=True, separators=(",", ":"))
    )


if __name__ == "__main__":
    emit_feasibility_receipt()
