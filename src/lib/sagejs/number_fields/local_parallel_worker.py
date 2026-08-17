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
    run_local_jobs,
)


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
    multiprocessing = __import__(
        "multiprocessing", fromlist=["worker_module_available"]
    )
    capability_query = getattr(multiprocessing, "worker_module_available", None)
    available = True
    if capability_query is not None:
        available = bool(capability_query("sagejs.number_fields.local_parallel_worker"))
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


__all__ = ["execute_public_local_job", "run_public_local_jobs"]
