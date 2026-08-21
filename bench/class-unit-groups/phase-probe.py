"""Stream bounded class/unit phase timings for the Selmer degree-seven case."""

import json
import time

import sagejs.number_fields.class_unit_analytic as analytic


def emit(kind, **details):
    print(
        "SAGEJS_CLASS_UNIT_TRACE|"
        + json.dumps({"kind": kind, **details}, sort_keys=True),
        flush=True,
    )


workspace_type = analytic.ZetaLogResidueWorkspace
original_threshold = workspace_type.threshold
original_rational_primes = workspace_type.rational_primes_below
original_splitting = workspace_type.splitting_types
original_plan = workspace_type.prime_power_plan
original_finite = workspace_type.finite_term
original_construction = workspace_type._record_certificate_construction
original_replay = workspace_type._record_certificate_replay


def timed(workspace, operation, callback):
    """Run one original exact method with observation-only timing."""
    started = time.perf_counter_ns()
    try:
        return callback()
    finally:
        emit(
            "zeta-workspace",
            operation=operation,
            elapsed_seconds=(time.perf_counter_ns() - started) / 1_000_000_000,
            diagnostics=workspace.diagnostics(),
        )


def traced_threshold(workspace, target, precision, maximum):
    return timed(
        workspace,
        "threshold",
        lambda: original_threshold(workspace, target, precision, maximum),
    )


def traced_rational_primes(workspace, bound):
    return timed(
        workspace,
        "rational-primes",
        lambda: original_rational_primes(workspace, bound),
    )


def traced_splitting(workspace, primes, block_size):
    return timed(
        workspace,
        "splitting",
        lambda: original_splitting(workspace, primes, block_size),
    )


def traced_plan(workspace, threshold, splitting):
    return timed(
        workspace,
        "prime-power-plan",
        lambda: original_plan(workspace, threshold, splitting),
    )


def traced_finite(workspace, plan, precision):
    return timed(
        workspace,
        "finite-term",
        lambda: original_finite(workspace, plan, precision),
    )


def traced_construction(workspace, started):
    original_construction(workspace, started)
    emit(
        "zeta-workspace",
        operation="certificate-construction",
        diagnostics=workspace.diagnostics(),
    )


def traced_replay(workspace, started):
    original_replay(workspace, started)
    emit(
        "zeta-workspace",
        operation="certificate-replay",
        diagnostics=workspace.diagnostics(),
    )


workspace_type.threshold = traced_threshold
workspace_type.rational_primes_below = traced_rational_primes
workspace_type.splitting_types = traced_splitting
workspace_type.prime_power_plan = traced_plan
workspace_type.finite_term = traced_finite
workspace_type._record_certificate_construction = traced_construction
workspace_type._record_certificate_replay = traced_replay


def progress(event):
    emit("engine-progress", event=event)


R = PolynomialRing(QQ, "x")  # noqa: F821 - Sage.js prelude
x = R.gen()
K = NumberField(x**7 - x - 1, "a7")  # noqa: F821 - Sage.js prelude
started = time.perf_counter_ns()
result = K.class_unit_group(
    proof=False,
    max_factor_base_bound=10_000,
    max_factor_base_size=2_048,
    max_candidates_per_ideal=128,
    max_random_terms=7,
    max_coefficient_bound=5,
    max_partial_relations=4_096,
    max_relation_attempts=6_144,
    max_relations=6_144,
    large_prime_bound_multiplier=20,
    precision_bits=128,
    max_precision_bits=1_024,
    max_analytic_prime_bound=1_000_000,
    max_memory_bytes=1_024 * 1_024 * 1_024,
    progress=progress,
)
emit(
    "terminal",
    elapsed_seconds=(time.perf_counter_ns() - started) / 1_000_000_000,
    complete=result.complete,
    proof_status=result.proof_status,
    reason=result.reason,
    diagnostics=result.diagnostics,
)
