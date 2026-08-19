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
    ResultPayload,
    conservative_peak_bytes,
    make_schedule,
    run_local_jobs,
)

PUBLIC_DECISION_SCHEMA = "sagejs.number-fields.public-local-worker-decision.v2"
PUBLIC_PARALLEL_BENCHMARK = "bench/number-field-maximal-order-parallel-worker.cjs:v2"
PUBLIC_PARALLEL_SETUP_MARGIN_MICROS = 20_000_000
PUBLIC_PARALLEL_PARENT_RSS_BYTES = 640 * 1024 * 1024
PUBLIC_PARALLEL_WORKER_RSS_BYTES = 224 * 1024 * 1024
PUBLIC_OM_CANDIDATE_SCHEMA = "sagejs.number-fields.om-worker-candidate.v1"
PUBLIC_OM_OVERLAP_PARENT_BYTES = 640 * 1024 * 1024
AUTHENTICATED_OM_WORKER_PROOF_SCHEMA = (
    "sagejs.number-fields.authenticated-om-worker-proof.v1"
)
_OM_WORKER_MODULE = "sagejs.number_fields.local_parallel_worker"
_OM_WORKER_FUNCTION = "execute_public_om_candidate_job"
_OM_WORKER_PROOF_TOKEN = object()


class AuthenticatedOMWorkerProof:
    """Immutable current-call proof issued for one exact precompiled OM job."""

    def __init__(self, token: Any, job: JobPayload, candidate: tuple[Any, ...]) -> None:
        if token is not _OM_WORKER_PROOF_TOKEN:
            raise TypeError("authenticated OM worker proofs are module-issued")
        self.job = validate_om_candidate_job(job)
        self.basis_numerator = tuple(
            tuple(int(value) for value in row) for row in candidate[3]
        )
        self.basis_denominator = int(candidate[4])
        self.index = int(candidate[5])
        self.certificate_id = str(candidate[6])
        self.__dict__["_authentication_snapshot"] = self._snapshot()

    def _snapshot(self) -> tuple[Any, ...]:
        return (
            AUTHENTICATED_OM_WORKER_PROOF_SCHEMA,
            self.job,
            self.basis_numerator,
            self.basis_denominator,
            self.index,
            self.certificate_id,
        )

    @property
    def certified(self) -> bool:
        return self.__dict__.get("_authentication_snapshot") == self._snapshot()


def validate_om_candidate_job(job: Any) -> JobPayload:
    """Validate the exact OM shape accepted by the attested worker boundary."""
    from sagejs.number_fields.local_parallel import validate_local_job

    canonical = validate_local_job(job)
    if canonical[6] != "om-maxmin":
        raise ValueError("an attested OM worker needs an OM job")
    return canonical


def authenticated_om_worker_proof_matches(
    proof: Any,
    *,
    job: JobPayload,
    basis_numerator: list[list[int]],
    basis_denominator: int,
    index: int,
) -> bool:
    """Bind one live current-call proof to exact parent-owned order fields."""
    try:
        return bool(
            type(proof) is AuthenticatedOMWorkerProof
            and proof.certified
            and proof.job == validate_om_candidate_job(job)
            and proof.basis_numerator
            == tuple(tuple(int(value) for value in row) for row in basis_numerator)
            and proof.basis_denominator == int(basis_denominator)
            and proof.index == int(index)
        )
    except (AttributeError, TypeError, ValueError):
        return False


class _PublicOMWorkerHandle:
    def __init__(self, pool: Any, result: Any, job: JobPayload) -> None:
        self.pool = pool
        self.result = result
        self.job = job
        self.consumed = False


def start_public_om_candidate_job(job: JobPayload) -> Any | None:
    """Start one exact allowlisted OM job and return its private live handle."""
    canonical = validate_om_candidate_job(job)
    if not public_worker_capability():
        return None
    multiprocessing = __import__(
        "multiprocessing",
        fromlist=["_precompiled_module_pool", "worker_memory_budget_bytes"],
    )
    budget = multiprocessing.worker_memory_budget_bytes()
    predicted_peak = PUBLIC_OM_OVERLAP_PARENT_BYTES + int(canonical[5])
    if budget is None or predicted_peak > int(budget):
        return None
    pool = multiprocessing._precompiled_module_pool(processes=1)
    submit = getattr(pool, "_apply_precompiled_async", None)
    if submit is None:
        pool.terminate()
        pool.join()
        return None
    try:
        result = submit(_OM_WORKER_MODULE, _OM_WORKER_FUNCTION, (canonical,))
        return _PublicOMWorkerHandle(pool, result, canonical)
    except Exception:
        pool.terminate()
        pool.join()
        raise


def finish_public_om_candidate_job(
    handle: Any,
    *,
    timeout: float | None = None,
) -> tuple[tuple[Any, ...], AuthenticatedOMWorkerProof] | None:
    """Join an OM job and issue a proof only for its attested exact result."""
    if type(handle) is not _PublicOMWorkerHandle or handle.consumed:
        return None
    handle.consumed = True
    try:
        candidate = handle.result._get_attested_module_result(
            _OM_WORKER_MODULE, _OM_WORKER_FUNCTION, timeout
        )
        if (
            not isinstance(candidate, tuple)
            or len(candidate) != 7
            or candidate[0] != PUBLIC_OM_CANDIDATE_SCHEMA
            or candidate[1] != handle.job
            or candidate[2] != "ok"
            or not isinstance(candidate[3], tuple)
            or not candidate[3]
            or isinstance(candidate[4], bool)
            or not isinstance(candidate[4], int)
            or int(candidate[4]) < 1
            or isinstance(candidate[5], bool)
            or not isinstance(candidate[5], int)
            or int(candidate[5]) < 1
            or not isinstance(candidate[6], str)
            or not candidate[6]
        ):
            return None
        degree = len(handle.job[1]) - 1
        if len(candidate[3]) != degree or any(
            not isinstance(row, tuple)
            or len(row) != degree
            or any(
                isinstance(value, bool) or not isinstance(value, int) for value in row
            )
            for row in candidate[3]
        ):
            return None
        proof = AuthenticatedOMWorkerProof(
            _OM_WORKER_PROOF_TOKEN, handle.job, candidate
        )
        if not proof.certified:
            return None
        return candidate, proof
    finally:
        handle.pool.close()
        handle.pool.join()


def cancel_public_om_candidate_job(handle: Any) -> None:
    """Terminate one unfinished OM job without accepting partial evidence."""
    if type(handle) is _PublicOMWorkerHandle and not handle.consumed:
        handle.consumed = True
        handle.pool.terminate()
        handle.pool.join()


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


def execute_public_om_candidate_job(job: JobPayload) -> tuple[Any, ...]:
    """Construct one OM candidate without rebuilding a public number field.

    This narrow worker boundary is intentionally only a candidate producer.
    The parent must independently authenticate the returned local order before
    it can contribute a maximality witness or enter the public field cache.
    """
    from sagejs.number_fields.local_parallel import (
        local_job_component,
        validate_local_job,
    )

    canonical_job = validate_local_job(job)
    if canonical_job[6] != "om-maxmin":
        return (
            PUBLIC_OM_CANDIDATE_SCHEMA,
            canonical_job,
            "fatal",
            (),
            1,
            1,
            "an OM worker needs an OM job",
        )
    coefficients = tuple(int(value) for value in canonical_job[1])
    component = local_job_component(canonical_job)
    prime = int(component.base)
    try:
        from sagejs.number_fields.local_polygons import factor_mod_prime
        from sagejs.number_fields.om_auto_selector import select_om_local_basis

        factors = factor_mod_prime(list(coefficients), prime)
        selection = select_om_local_basis(
            coefficients,
            prime,
            local_discriminant_valuation=int(canonical_job[2][4]),
            factor_degrees=tuple(int(item["degree"]) for item in factors),
            factor_multiplicities=tuple(int(item["multiplicity"]) for item in factors),
        )
        result = selection.result
        if not selection.selected or result is None or result.order_basis is None:
            return (
                PUBLIC_OM_CANDIDATE_SCHEMA,
                canonical_job,
                "fallback",
                (),
                1,
                1,
                str(selection.reason),
            )
        basis = result.order_basis
        local_index = int(result.local_result.index)
        return (
            PUBLIC_OM_CANDIDATE_SCHEMA,
            canonical_job,
            "ok",
            tuple(tuple(int(value) for value in row) for row in basis.numerator),
            int(basis.denominator),
            local_index,
            str(result.type_tree.certificate_id),
        )
    except Exception as error:
        return (
            PUBLIC_OM_CANDIDATE_SCHEMA,
            canonical_job,
            "fatal",
            (),
            1,
            1,
            type(error).__name__ + ": " + str(error),
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
    "AUTHENTICATED_OM_WORKER_PROOF_SCHEMA",
    "AuthenticatedOMWorkerProof",
    "PUBLIC_DECISION_SCHEMA",
    "PUBLIC_PARALLEL_BENCHMARK",
    "PUBLIC_PARALLEL_PARENT_RSS_BYTES",
    "PUBLIC_PARALLEL_SETUP_MARGIN_MICROS",
    "PUBLIC_PARALLEL_WORKER_RSS_BYTES",
    "PUBLIC_OM_CANDIDATE_SCHEMA",
    "PUBLIC_OM_OVERLAP_PARENT_BYTES",
    "authenticated_om_worker_proof_matches",
    "cancel_public_om_candidate_job",
    "execute_public_om_candidate_job",
    "execute_public_local_job",
    "finish_public_om_candidate_job",
    "public_worker_capability",
    "public_worker_decision",
    "run_public_local_jobs",
    "start_public_om_candidate_job",
]
