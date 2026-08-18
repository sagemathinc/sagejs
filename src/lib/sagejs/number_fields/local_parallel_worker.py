"""Pointer-free arithmetic worker for independent maximal-order components.

The worker accepts and returns only the immutable tuple contracts from
`sagejs.number_fields.local_parallel`.  Every field, equation order, and native
resource is reconstructed inside the isolated worker and discarded there.
This makes the same module-level callable usable by CPython's process pool and
Sage.js's lightweight worker-thread pool without transferring parent objects.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.local_parallel import (
    JobPayload,
    ResultPayload,
    make_schedule,
    run_local_jobs,
)

PUBLIC_DECISION_SCHEMA = "sagejs.number-fields.public-local-worker-decision.v1"
PUBLIC_PARALLEL_BENCHMARK = "bench/number-field-maximal-order-parallel-worker.cjs:v1"
PUBLIC_PARALLEL_SETUP_MARGIN_MICROS = 20_000_000
PUBLIC_PARALLEL_PARENT_RSS_BYTES = 640 * 1024 * 1024
PUBLIC_PARALLEL_WORKER_RSS_BYTES = 224 * 1024 * 1024
PUBLIC_PARALLEL_MEMORY_BUDGET_BYTES = 1536 * 1024 * 1024


def public_worker_capability() -> bool:
    """Return whether this runtime can import the exact worker module.

    Ordinary CPython process workers import installed modules normally.  The
    smaller Sage.js worker runtime instead exposes a read-only query for the
    generated allowlist; missing optional assets therefore fail closed.
    """
    multiprocessing = __import__(
        "multiprocessing", fromlist=["worker_module_available"]
    )
    capability_query = getattr(multiprocessing, "worker_module_available", None)
    if capability_query is None:
        return True
    return bool(capability_query("sagejs.number_fields.local_parallel_worker"))


def _predicted_critical_path(jobs: tuple[JobPayload, ...], workers: int) -> int:
    loads = [0 for _ in range(max(1, workers))]
    ordered = sorted(jobs, key=lambda job: (-int(job[4]), job[1], int(job[3])))
    for job in ordered:
        target = min(range(len(loads)), key=lambda index: (loads[index], index))
        loads[target] += int(job[4])
    return max(loads, default=0)


def public_worker_decision(
    jobs: list[JobPayload] | tuple[JobPayload, ...],
    *,
    after_native_fallback: bool,
    cpu_count: int | None = None,
    memory_budget_bytes: int = PUBLIC_PARALLEL_MEMORY_BUDGET_BYTES,
    worker_capability: bool | None = None,
) -> dict[str, Any]:
    """Return the measured fallback-only public parallel gate.

    The time model is deliberately conservative and affects execution mode,
    never the mathematical algorithm or canonical result.  Four fresh worker
    realms measured about 1.43 GB peak RSS on the reference corpus, so the
    memory estimate includes fixed evaluator overhead rather than pretending
    that the small wire payload is the whole cost.
    """
    actual_capability = public_worker_capability()
    capability = actual_capability
    if worker_capability is not None:
        capability = actual_capability and bool(worker_capability)
    candidate = make_schedule(
        jobs,
        cpu_count=cpu_count,
        worker_capability=capability,
    )
    canonical_jobs = tuple(jobs)
    workers = int(candidate[2])
    predicted_total = sum(int(job[4]) for job in canonical_jobs)
    predicted_critical = _predicted_critical_path(canonical_jobs, workers)
    predicted_savings = max(0, predicted_total - predicted_critical)
    predicted_peak = (
        PUBLIC_PARALLEL_PARENT_RSS_BYTES + workers * PUBLIC_PARALLEL_WORKER_RSS_BYTES
    )
    selected = True
    reason = "measured-native-fallback-crossover"
    if not after_native_fallback:
        selected = False
        reason = "native-first-boundary"
    elif not capability:
        selected = False
        reason = "precompiled-worker-module-unavailable"
    elif candidate[1] != "parallel":
        selected = False
        reason = str(candidate[6])
    elif predicted_savings < PUBLIC_PARALLEL_SETUP_MARGIN_MICROS:
        selected = False
        reason = "predicted-savings-below-setup-margin"
    elif predicted_peak > int(memory_budget_bytes):
        selected = False
        reason = "measured-peak-exceeds-memory-budget"
    return {
        "schema": PUBLIC_DECISION_SCHEMA,
        "selected": selected,
        "reason": reason,
        "after_native_fallback": bool(after_native_fallback),
        "worker_capability": capability,
        "candidate_schedule": candidate,
        "predicted_total_micros": predicted_total,
        "predicted_critical_path_micros": predicted_critical,
        "predicted_savings_micros": predicted_savings,
        "required_setup_margin_micros": PUBLIC_PARALLEL_SETUP_MARGIN_MICROS,
        "predicted_peak_rss_bytes": predicted_peak,
        "memory_budget_bytes": int(memory_budget_bytes),
        "measured_vector001_median": {
            "sequential_total_micros": 55_214_067,
            "parallel_total_micros": 36_545_808,
            "sequential_peak_rss_bytes": 596_627_456,
            "parallel_peak_rss_bytes": 1_427_484_672,
            "fresh_samples": 3,
        },
        "benchmark": PUBLIC_PARALLEL_BENCHMARK,
    }


def execute_public_local_job(job: JobPayload) -> ResultPayload:
    """Reconstruct and solve one local order using only canonical wire data.

    Exceptions become one deterministic fatal result.  The parent scheduler
    consequently has identical cancellation and public error semantics for
    arithmetic failures and independently rejected certificates.
    """
    from sagejs.number_fields.local_parallel import (
        local_job_component,
        make_fatal_result,
        make_local_result,
        validate_local_job,
    )

    canonical_job = validate_local_job(job)
    coefficients = [int(value) for value in canonical_job[1]]
    component = local_job_component(canonical_job)
    prime = int(component.base)
    algorithm = str(canonical_job[6])
    try:
        from sagejs.number_fields.maximal_order_engine import (
            _MAX_WORD_PRIME,
            _arbitrary_prime_local_order,
            _basis_from_order,
            _cache_discriminant_from_basis,
            _exact_integer,
            _forced_local_order,
            _index_from_discriminants,
        )

        algebra = __import__("sagejs._baselib.algebra", fromlist=["QQ"])
        number_fields = __import__(
            "sagejs._baselib.number_fields", fromlist=["NumberField"]
        )
        polynomials = __import__(
            "sagejs._baselib.polynomial", fromlist=["PolynomialRing"]
        )
        polynomial_ring = polynomials.PolynomialRing(algebra.QQ, "x")
        field = number_fields.NumberField(polynomial_ring(coefficients), "a")
        equation_order = field.equation_order()
        equation_discriminant = _exact_integer(equation_order.discriminant())
        if prime > _MAX_WORD_PRIME:
            local_order, used_algorithm, details = _arbitrary_prime_local_order(
                field,
                coefficients,
                1,
                equation_discriminant,
                prime,
            )
        else:
            local_order, used_algorithm, details = _forced_local_order(
                field,
                coefficients,
                1,
                equation_order,
                equation_discriminant,
                prime,
                algorithm,
            )
        basis = _basis_from_order(local_order, 1)
        local_discriminant = _cache_discriminant_from_basis(
            local_order,
            basis,
            equation_discriminant,
        )
        local_index = _index_from_discriminants(
            equation_discriminant,
            local_discriminant,
        )
        used = str(used_algorithm)
        fallback = bool(details.get("fallback", False))
        return make_local_result(
            canonical_job,
            basis.numerator,
            basis.denominator,
            local_index,
            prime ** int(canonical_job[2][4]),
            (
                ("fallback", fallback),
                ("local-index", local_index),
                ("prime", prime),
                ("requested-algorithm", algorithm),
                ("used-algorithm", used),
            ),
            peak_bytes=int(canonical_job[5]),
        )
    except Exception:
        return make_fatal_result(
            canonical_job,
            "pointer-free local maximal-order arithmetic failed",
        )


def run_public_local_jobs(
    jobs: list[JobPayload] | tuple[JobPayload, ...],
    *,
    max_workers: int | None = None,
    cpu_count: int | None = None,
    worker_capability: bool | None = None,
    policy: tuple[Any, ...] | None = None,
) -> tuple[Any, ...]:
    """Run public pointer-free jobs through the deterministic bounded pool.

    Lightweight workers may import this module only from the generated,
    precompiled task-module graph.  Query that exact capability before pool
    construction and fall back sequentially when the optional asset is absent.
    An explicit false value remains useful for differential measurements; an
    explicit true value never overrides the host capability boundary.
    """
    available = public_worker_capability()
    capability = available
    if worker_capability is not None:
        capability = available and bool(worker_capability)
    if policy is None:
        return run_local_jobs(
            jobs,
            execute_public_local_job,
            max_workers=max_workers,
            cpu_count=cpu_count,
            worker_capability=capability,
        )
    return run_local_jobs(
        jobs,
        execute_public_local_job,
        max_workers=max_workers,
        cpu_count=cpu_count,
        worker_capability=capability,
        policy=policy,
    )


__all__ = [
    "PUBLIC_DECISION_SCHEMA",
    "PUBLIC_PARALLEL_BENCHMARK",
    "PUBLIC_PARALLEL_MEMORY_BUDGET_BYTES",
    "PUBLIC_PARALLEL_PARENT_RSS_BYTES",
    "PUBLIC_PARALLEL_SETUP_MARGIN_MICROS",
    "PUBLIC_PARALLEL_WORKER_RSS_BYTES",
    "execute_public_local_job",
    "public_worker_capability",
    "public_worker_decision",
    "run_public_local_jobs",
]
