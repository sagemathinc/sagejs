"""Pointer-free arithmetic worker for independent maximal-order components.

The worker accepts and returns only the immutable tuple contracts from
`sagejs.number_fields.local_parallel`.  Every field, equation order, and native
resource is reconstructed inside the isolated worker and discarded there.
This makes the same module-level callable usable by CPython's process pool and
Sage.js's lightweight worker-thread pool without transferring parent objects.

Only the trusted parent chooses the callable and the exact allowlisted module
identity.  Workers are nevertheless treated as untrusted result producers:
the result carries its complete canonical input job, and the parent revalidates
that binding before accepting any certificate or merge evidence.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.local_parallel import (
    DEFAULT_POLICY,
    JobPayload,
    LocalCertificationError,
    LocalWorkerError,
    ResultPayload,
    assemble_local_run,
    conservative_peak_bytes,
    make_schedule,
    run_local_jobs,
    validate_local_result,
)

PUBLIC_DECISION_SCHEMA = "sagejs.number-fields.public-local-worker-decision.v2"
PUBLIC_PARALLEL_BENCHMARK = "bench/number-field-maximal-order-parallel-worker.cjs:v2"
PUBLIC_PARALLEL_SETUP_MARGIN_MICROS = 20_000_000
PUBLIC_PARALLEL_PARENT_RSS_BYTES = 640 * 1024 * 1024
PUBLIC_PARALLEL_WORKER_RSS_BYTES = 224 * 1024 * 1024
PUBLIC_PROOF_DECISION_SCHEMA = (
    "sagejs.number-fields.public-local-proof-worker-decision.v1"
)
PUBLIC_PROOF_BENCHMARK = "bench/number-field-local-parallel-proof-workers.cjs:v1"
# One fresh isolated evaluator is conservatively charged one quarter of the
# measured four-worker 19-second startup.  The dedicated benchmark ratchets
# this value only after the precompiled proof graph is measured directly.
PUBLIC_PROOF_SETUP_MICROS = 4_750_000
PUBLIC_PROOF_SAFETY_NUMERATOR = 11
PUBLIC_PROOF_SAFETY_DENOMINATOR = 10


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


def _platform_memory_budget() -> tuple[int | None, str]:
    """Return a conservative runtime-derived budget and its source.

    Sage.js supplies a host capability which accounts for platform/container
    limits.  Ordinary CPython uses currently available physical pages when
    that information exists.  Unknown availability never silently becomes a
    fixed machine-independent allowance.
    """
    multiprocessing = __import__("multiprocessing")
    capability = getattr(multiprocessing, "worker_memory_budget_bytes", None)
    if capability is not None:
        value = capability()
        if value is None:
            return None, "runtime-platform-capability-unavailable"
        return max(0, int(value)), "runtime-platform-capability"
    os = __import__("os")
    sysconf = getattr(os, "sysconf", None)
    if sysconf is None:
        return None, "platform-memory-unavailable"
    try:
        page_size = int(sysconf("SC_PAGE_SIZE"))
        available_pages = int(sysconf("SC_AVPHYS_PAGES"))
    except (OSError, TypeError, ValueError):
        return None, "platform-memory-unavailable"
    available = page_size * available_pages
    if available <= 0:
        return None, "platform-memory-unavailable"
    # Linux cgroup limits can be much smaller than physical availability.
    # These are fixed kernel capability paths, never caller-controlled input.
    try:
        with open("/sys/fs/cgroup/memory.max") as limit_file:
            limit_text = limit_file.read().strip()
        with open("/sys/fs/cgroup/memory.current") as current_file:
            current_text = current_file.read().strip()
        if limit_text != "max":
            remaining = max(0, int(limit_text) - int(current_text))
            available = min(available, remaining)
            source = "cpython-available-pages-and-cgroup-v2"
        else:
            source = "cpython-available-pages"
    except (OSError, TypeError, ValueError):
        source = "cpython-available-pages"
    return available * 3 // 4, source


def public_worker_decision(
    jobs: list[JobPayload] | tuple[JobPayload, ...],
    *,
    after_native_fallback: bool,
    cpu_count: int | None = None,
    memory_budget_bytes: int | None = None,
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
    fixed_runtime_peak = (
        PUBLIC_PARALLEL_PARENT_RSS_BYTES + workers * PUBLIC_PARALLEL_WORKER_RSS_BYTES
    )
    # The measured fixed evaluator allowance dominates current jobs, but the
    # immutable payloads and their per-branch selector estimates are still
    # real live memory.  Account for them instead of silently assuming that a
    # future large basis remains negligible merely because vector001 did.
    wire_and_branch_peak = conservative_peak_bytes(canonical_jobs, (), workers)
    predicted_peak = fixed_runtime_peak + wire_and_branch_peak
    if memory_budget_bytes is None:
        memory_budget, memory_budget_source = _platform_memory_budget()
    else:
        memory_budget = max(0, int(memory_budget_bytes))
        memory_budget_source = "caller-explicit"
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
    elif memory_budget is None:
        selected = False
        reason = "memory-budget-unavailable"
    elif predicted_peak > memory_budget:
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
        "minimum_useful_job_micros": int(DEFAULT_POLICY[3]),
        "useful_job_count": sum(
            1 for job in canonical_jobs if int(job[4]) >= int(DEFAULT_POLICY[3])
        ),
        "fixed_runtime_peak_rss_bytes": fixed_runtime_peak,
        "wire_and_branch_peak_bytes": wire_and_branch_peak,
        "predicted_peak_rss_bytes": predicted_peak,
        "memory_budget_bytes": memory_budget,
        "memory_budget_source": memory_budget_source,
        "measured_vector001_median": {
            "sequential_total_micros": 55_214_067,
            "parallel_total_micros": 36_545_808,
            "sequential_peak_rss_bytes": 596_627_456,
            "parallel_peak_rss_bytes": 1_427_484_672,
            "fresh_samples": 3,
        },
        "benchmark": PUBLIC_PARALLEL_BENCHMARK,
    }


def public_local_proof_worker_decision(
    jobs: list[JobPayload] | tuple[JobPayload, ...],
    *,
    parent_native_predicted_micros: int,
    cpu_count: int | None = None,
    max_workers: int | None = None,
    memory_budget_bytes: int | None = None,
    worker_capability: bool | None = None,
) -> dict[str, Any]:
    """Select external parent/proof overlap from measured input costs."""
    from sagejs.number_fields.local_parallel import (
        _canonical_jobs,
        local_job_key,
        wire_size,
    )

    canonical = _canonical_jobs(jobs)
    parent_work = max(0, int(parent_native_predicted_micros))
    actual_capability = public_worker_capability()
    capability = actual_capability
    if worker_capability is not None:
        capability = actual_capability and bool(worker_capability)
    multiprocessing = __import__("multiprocessing")
    available_value = (
        getattr(multiprocessing, "cpu_count", lambda: 1)()
        if cpu_count is None
        else cpu_count
    )
    available = max(1, int(available_value))
    ceiling = 3 if max_workers is None else max(1, int(max_workers))
    workers = min(ceiling, max(1, available - 1), max(1, len(canonical)))
    worker_total = sum(int(job[4]) for job in canonical)
    worker_critical = _predicted_critical_path(canonical, workers)
    sequential = parent_work + worker_total
    overlap = max(parent_work, worker_critical) + PUBLIC_PROOF_SETUP_MICROS
    safe_overlap = (
        overlap * PUBLIC_PROOF_SAFETY_NUMERATOR // PUBLIC_PROOF_SAFETY_DENOMINATOR
    )
    fixed_runtime_peak = (
        PUBLIC_PARALLEL_PARENT_RSS_BYTES + workers * PUBLIC_PARALLEL_WORKER_RSS_BYTES
    )
    predicted_proof_wire = 0
    for job in canonical:
        degree = len(job[1]) - 1
        coefficient_bits = max(abs(int(value)).bit_length() for value in job[1])
        predicted_proof_wire += max(
            wire_size(job),
            degree * degree * (32 + (coefficient_bits + int(job[2][4]) + 7) // 8),
        )
    predicted_peak = (
        fixed_runtime_peak
        + conservative_peak_bytes(canonical, (), workers)
        + predicted_proof_wire
    )
    if memory_budget_bytes is None:
        memory_budget, memory_source = _platform_memory_budget()
    else:
        memory_budget = max(0, int(memory_budget_bytes))
        memory_source = "caller-explicit"
    selected = True
    reason = "predicted-parent-proof-overlap-crossover"
    if not canonical:
        selected = False
        reason = "no-proof-jobs"
    elif not capability:
        selected = False
        reason = "precompiled-worker-module-unavailable"
    elif available < 2:
        selected = False
        reason = "no-independent-parent-worker-cpu"
    elif min((int(job[4]) for job in canonical), default=0) < 250_000:
        selected = False
        reason = "proof-job-below-measured-worker-floor"
    elif memory_budget is None:
        selected = False
        reason = "memory-budget-unavailable"
    elif predicted_peak > memory_budget:
        selected = False
        reason = "predicted-proof-peak-exceeds-memory-budget"
    elif safe_overlap >= sequential:
        selected = False
        reason = "predicted-overlap-does-not-beat-sequential"
    mode = "parallel" if selected else "sequential"
    schedule = (
        "sagejs.number-fields.local-schedule.v1",
        mode,
        workers if selected else 1,
        tuple(local_job_key(job) for job in canonical),
        worker_total,
        predicted_peak,
        reason,
        PUBLIC_PROOF_BENCHMARK,
    )
    return {
        "schema": PUBLIC_PROOF_DECISION_SCHEMA,
        "selected": selected,
        "reason": reason,
        "worker_capability": capability,
        "worker_count": workers if selected else 1,
        "parent_native_predicted_micros": parent_work,
        "worker_total_predicted_micros": worker_total,
        "worker_critical_path_predicted_micros": worker_critical,
        "sequential_predicted_micros": sequential,
        "overlap_predicted_micros": overlap,
        "safe_overlap_predicted_micros": safe_overlap,
        "setup_predicted_micros": PUBLIC_PROOF_SETUP_MICROS,
        "predicted_proof_wire_bytes": predicted_proof_wire,
        "predicted_peak_rss_bytes": predicted_peak,
        "memory_budget_bytes": memory_budget,
        "memory_budget_source": memory_source,
        "schedule": schedule,
        "benchmark": PUBLIC_PROOF_BENCHMARK,
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


def execute_public_local_proof_job(job: JobPayload) -> ResultPayload:
    """Execute one complete OM or BL job and return only frozen wire data."""
    from sagejs.number_fields.buchmann_lenstra import (
        authenticate_buchmann_lenstra_result,
        buchmann_lenstra_overorder,
        polynomial_discriminant,
    )
    from sagejs.number_fields.local_parallel import (
        local_job_component,
        make_buchmann_lenstra_proof_source,
        make_fatal_result,
        make_local_proof_result,
        make_om_proof_source,
        validate_local_job,
    )

    canonical_job = validate_local_job(job)
    coefficients = tuple(int(value) for value in canonical_job[1])
    component = local_job_component(canonical_job)
    algorithm = str(canonical_job[6])
    try:
        equation_discriminant = polynomial_discriminant(list(coefficients))
        if algorithm == "om-maxmin":
            from sagejs.number_fields.local_polygons import factor_mod_prime
            from sagejs.number_fields.om_auto_selector import select_om_local_basis

            prime = int(component.base)
            factors = factor_mod_prime(list(coefficients), prime)
            selection = select_om_local_basis(
                coefficients,
                prime,
                local_discriminant_valuation=int(canonical_job[2][4]),
                factor_degrees=tuple(int(item["degree"]) for item in factors),
                factor_multiplicities=tuple(
                    int(item["multiplicity"]) for item in factors
                ),
            )
            if not selection.selected or selection.result is None:
                raise ArithmeticError("OM did not produce a complete selected proof")
            result = selection.result
            basis = result.order_basis
            certificate = result.certificate
            if basis is None or certificate is None:
                raise ArithmeticError("OM omitted its basis or certificate")
            local_index = prime**certificate.local_index_valuation
            index_square = local_index * local_index
            if equation_discriminant % index_square != 0:
                raise ArithmeticError(
                    "OM index does not divide the equation discriminant"
                )
            order_discriminant = equation_discriminant // index_square
            proof_source = make_om_proof_source(selection)
            certified_modulus = prime ** int(canonical_job[2][4])
        elif algorithm == "buchmann-lenstra":
            result = buchmann_lenstra_overorder(
                list(coefficients),
                component,
                equation_discriminant=equation_discriminant,
            )
            projection = authenticate_buchmann_lenstra_result(
                list(coefficients),
                result,
                equation_discriminant=equation_discriminant,
            )
            if (
                projection is None
                or result.basis is None
                or result.discriminant is None
            ):
                raise ArithmeticError("BL did not produce a complete accepted proof")
            basis = result.basis
            local_index = int(result.index)
            order_discriminant = int(result.discriminant)
            proof_source = make_buchmann_lenstra_proof_source(result)
            certified_modulus = component.value
        else:
            raise ValueError("a proof worker accepts only OM and BL jobs")
        return make_local_proof_result(
            canonical_job,
            basis.numerator,
            basis.denominator,
            local_index,
            certified_modulus,
            equation_discriminant,
            order_discriminant,
            proof_source,
            peak_bytes=int(canonical_job[5]),
        )
    except Exception:
        return make_fatal_result(
            canonical_job,
            "pointer-free local proof construction failed",
        )


class PublicLocalProofRunHandle:
    """Runtime-local handle for overlapping parent and proof-worker work."""

    def __init__(
        self,
        jobs: tuple[JobPayload, ...],
        schedule: tuple[Any, ...],
        pool: Any,
        pending: list[Any],
        started_ns: int,
        launched_ns: int,
        decision: dict[str, Any] | None,
    ) -> None:
        self.jobs = jobs
        self.schedule = schedule
        self.pool = pool
        self.pending = pending
        self.started_ns = started_ns
        self.launched_ns = launched_ns
        self.decision = decision
        self.timing_evidence: tuple[Any, ...] | None = None
        self.finished = False


def start_public_local_proof_jobs(
    jobs: list[JobPayload] | tuple[JobPayload, ...],
    *,
    max_workers: int | None = None,
    cpu_count: int | None = None,
    worker_capability: bool | None = None,
    policy: tuple[Any, ...] | None = None,
    pool_factory: Any = None,
    parent_native_predicted_micros: int | None = None,
    memory_budget_bytes: int | None = None,
) -> PublicLocalProofRunHandle:
    """Start proof jobs without blocking the independent parent computation."""
    from sagejs.number_fields.local_parallel import _canonical_jobs

    clock = __import__("time")
    started_ns = clock.monotonic_ns()
    ordered = _canonical_jobs(jobs)
    available = public_worker_capability()
    capability = available
    if worker_capability is not None:
        capability = available and bool(worker_capability)
    decision = None
    if parent_native_predicted_micros is None:
        tuning = DEFAULT_POLICY if policy is None else policy
        schedule = make_schedule(
            ordered,
            max_workers=max_workers,
            cpu_count=cpu_count,
            worker_capability=capability,
            policy=tuning,
        )
    else:
        decision = public_local_proof_worker_decision(
            ordered,
            parent_native_predicted_micros=parent_native_predicted_micros,
            cpu_count=cpu_count,
            max_workers=max_workers,
            memory_budget_bytes=memory_budget_bytes,
            worker_capability=capability,
        )
        schedule = decision["schedule"]
    if schedule[1] == "sequential" or not ordered:
        launched_ns = clock.monotonic_ns()
        return PublicLocalProofRunHandle(
            ordered,
            schedule,
            None,
            [],
            started_ns,
            launched_ns,
            decision,
        )
    if pool_factory is None:
        from multiprocessing import Pool

        pool = Pool(int(schedule[2]))
    else:
        pool = pool_factory(int(schedule[2]))
    execution_jobs = sorted(
        ordered,
        key=lambda item: (-int(item[4]), item[1], int(item[3])),
    )
    try:
        pending = [
            pool.apply_async(execute_public_local_proof_job, (item,))
            for item in execution_jobs
        ]
    except Exception as error:
        try:
            pool.terminate()
            pool.join()
        except Exception:
            pass
        raise LocalWorkerError("local proof worker startup failed") from error
    launched_ns = clock.monotonic_ns()
    return PublicLocalProofRunHandle(
        ordered,
        schedule,
        pool,
        pending,
        started_ns,
        launched_ns,
        decision,
    )


def cancel_public_local_proof_jobs(handle: PublicLocalProofRunHandle) -> None:
    """Cancel a live proof run after an independent parent failure."""
    if type(handle) is not PublicLocalProofRunHandle or handle.finished:
        return
    handle.finished = True
    if handle.pool is not None:
        try:
            handle.pool.terminate()
            handle.pool.join()
        except Exception:
            pass


def finish_public_local_proof_jobs(
    handle: PublicLocalProofRunHandle,
) -> tuple[Any, ...]:
    """Join one proof run, preserving fatal-result sibling cancellation."""
    if type(handle) is not PublicLocalProofRunHandle or handle.finished:
        raise LocalWorkerError("local proof worker handle is stale")
    clock = __import__("time")
    joined_started_ns = clock.monotonic_ns()
    results: list[ResultPayload] = []
    completed = False
    try:
        if handle.pool is None:
            for job in handle.jobs:
                result = validate_local_result(execute_public_local_proof_job(job))
                if result[2] == "fatal":
                    raise LocalCertificationError(
                        "local maximal-order certification failed"
                    )
                results.append(result)
        else:
            pending = list(handle.pending)
            while pending:
                ready = [item for item in pending if item.ready()]
                if not ready:
                    pending[0].wait(0.01)
                    continue
                for item in ready:
                    pending.remove(item)
                    result = validate_local_result(item.get())
                    if result[2] == "fatal":
                        handle.pool.terminate()
                        handle.pool.join()
                        raise LocalCertificationError(
                            "local maximal-order certification failed"
                        )
                    results.append(result)
            handle.pool.close()
            handle.pool.join()
        run = assemble_local_run(handle.jobs, results, handle.schedule)
        completed = True
        return run
    except LocalCertificationError:
        raise
    except Exception as error:
        if handle.pool is not None:
            try:
                handle.pool.terminate()
                handle.pool.join()
            except Exception:
                pass
        raise LocalWorkerError("local proof worker execution failed") from error
    finally:
        finished_ns = clock.monotonic_ns()
        handle.timing_evidence = (
            "sagejs.number-fields.local-proof-worker-timing.v1",
            (handle.launched_ns - handle.started_ns) // 1000,
            max(0, joined_started_ns - handle.launched_ns) // 1000,
            (finished_ns - joined_started_ns) // 1000,
            (finished_ns - handle.started_ns) // 1000,
            str(handle.schedule[1]),
            int(handle.schedule[2]),
            completed,
        )
        handle.finished = True


def run_public_local_proof_jobs(
    jobs: list[JobPayload] | tuple[JobPayload, ...],
    **options: Any,
) -> tuple[Any, ...]:
    """Blocking convenience wrapper over the begin/finish proof-worker API."""
    return finish_public_local_proof_jobs(
        start_public_local_proof_jobs(jobs, **options)
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
    "PUBLIC_PARALLEL_PARENT_RSS_BYTES",
    "PUBLIC_PARALLEL_SETUP_MARGIN_MICROS",
    "PUBLIC_PARALLEL_WORKER_RSS_BYTES",
    "PUBLIC_PROOF_BENCHMARK",
    "PUBLIC_PROOF_DECISION_SCHEMA",
    "PUBLIC_PROOF_SETUP_MICROS",
    "PublicLocalProofRunHandle",
    "cancel_public_local_proof_jobs",
    "execute_public_local_job",
    "execute_public_local_proof_job",
    "finish_public_local_proof_jobs",
    "public_worker_capability",
    "public_worker_decision",
    "public_local_proof_worker_decision",
    "run_public_local_jobs",
    "run_public_local_proof_jobs",
    "start_public_local_proof_jobs",
]
