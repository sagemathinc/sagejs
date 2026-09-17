"""Frozen native suffix control for the prepared real-cubic `h = 1` run.

The resident candidate and live owner bridge produce all mathematical inputs to
this suffix.  This module keeps their exact owners in the same generated addon
while it expands compact unit provenance, replays the principal relations,
rebuilds the p2,176 embeddings and logarithms, evaluates the regulator minor,
and publishes a diagnostic state.  No exact arithmetic is delegated to
the JavaScript host.

This remains an internal fixed-field experiment. Fixed logical shapes and
retry precision make it a component control, not a live completion authority,
independent unit-saturation proof, or general regulator proof.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .cubic_embedding_rebuild import pari_cubic_embedding_rebuild
from .cubic_embedding_precision_rebuild import (
    pari_cubic_embedding_precision_rebuild,
)
from .cubic_precision_rebuild import pari_cubic_sunit_precision_rebuild
from .exponential import pari_real_resize
from .live_retry_control import pari_live_retry_transition
from .regulator_determinant import pari_regulator_determinant
from .unit_reconstruction_signed import pari_getfu_signed_real_cubic


@native
def _unified_cubic_multiply(
    a0: int,
    a1: int,
    a2: int,
    b0: int,
    b1: int,
    b2: int,
    tensor: IntegerBuffer,
) -> tuple[int, int, int]:
    """Multiply two integral-basis triples with the resident tensor."""
    m0 = a0 * tensor[0] + a1 * tensor[9] + a2 * tensor[18]
    m1 = a0 * tensor[1] + a1 * tensor[10] + a2 * tensor[19]
    m2 = a0 * tensor[2] + a1 * tensor[11] + a2 * tensor[20]
    m3 = a0 * tensor[3] + a1 * tensor[12] + a2 * tensor[21]
    m4 = a0 * tensor[4] + a1 * tensor[13] + a2 * tensor[22]
    m5 = a0 * tensor[5] + a1 * tensor[14] + a2 * tensor[23]
    m6 = a0 * tensor[6] + a1 * tensor[15] + a2 * tensor[24]
    m7 = a0 * tensor[7] + a1 * tensor[16] + a2 * tensor[25]
    m8 = a0 * tensor[8] + a1 * tensor[17] + a2 * tensor[26]
    return (
        m0 * b0 + m3 * b1 + m6 * b2,
        m1 * b0 + m4 * b1 + m7 * b2,
        m2 * b0 + m5 * b1 + m8 * b2,
    )


@native
def _unified_cubic_norm(a0: int, a1: int, a2: int, tensor: IntegerBuffer) -> int:
    """Return the determinant of multiplication by one cubic element."""
    m0 = a0 * tensor[0] + a1 * tensor[9] + a2 * tensor[18]
    m1 = a0 * tensor[1] + a1 * tensor[10] + a2 * tensor[19]
    m2 = a0 * tensor[2] + a1 * tensor[11] + a2 * tensor[20]
    m3 = a0 * tensor[3] + a1 * tensor[12] + a2 * tensor[21]
    m4 = a0 * tensor[4] + a1 * tensor[13] + a2 * tensor[22]
    m5 = a0 * tensor[5] + a1 * tensor[14] + a2 * tensor[23]
    m6 = a0 * tensor[6] + a1 * tensor[15] + a2 * tensor[24]
    m7 = a0 * tensor[7] + a1 * tensor[16] + a2 * tensor[25]
    m8 = a0 * tensor[8] + a1 * tensor[17] + a2 * tensor[26]
    return (
        m0 * (m4 * m8 - m7 * m5) - m3 * (m1 * m8 - m7 * m2) + m6 * (m1 * m5 - m4 * m2)
    )


@native
def _unified_cubic_divide_exact(
    a0: int,
    a1: int,
    a2: int,
    b0: int,
    b1: int,
    b2: int,
    tensor: IntegerBuffer,
) -> tuple[int, int, int]:
    """Divide integral cubic elements, rejecting a nonintegral quotient."""
    m0 = b0 * tensor[0] + b1 * tensor[9] + b2 * tensor[18]
    m1 = b0 * tensor[1] + b1 * tensor[10] + b2 * tensor[19]
    m2 = b0 * tensor[2] + b1 * tensor[11] + b2 * tensor[20]
    m3 = b0 * tensor[3] + b1 * tensor[12] + b2 * tensor[21]
    m4 = b0 * tensor[4] + b1 * tensor[13] + b2 * tensor[22]
    m5 = b0 * tensor[5] + b1 * tensor[14] + b2 * tensor[23]
    m6 = b0 * tensor[6] + b1 * tensor[15] + b2 * tensor[24]
    m7 = b0 * tensor[7] + b1 * tensor[16] + b2 * tensor[25]
    m8 = b0 * tensor[8] + b1 * tensor[17] + b2 * tensor[26]
    determinant = (
        m0 * (m4 * m8 - m7 * m5) - m3 * (m1 * m8 - m7 * m2) + m6 * (m1 * m5 - m4 * m2)
    )
    if determinant == 0:
        raise ValueError("zero principal relation denominator")
    c0 = m4 * m8 - m7 * m5
    c1 = m2 * m7 - m1 * m8
    c2 = m1 * m5 - m2 * m4
    q0, q1, q2 = _unified_cubic_multiply(a0, a1, a2, c0, c1, c2, tensor)
    if q0 % determinant != 0 or q1 % determinant != 0 or q2 % determinant != 0:
        raise ValueError("nonintegral principal relation quotient")
    return q0 // determinant, q1 // determinant, q2 // determinant


@native
def _unified_cubic_power(
    a0: int, a1: int, a2: int, exponent: int, tensor: IntegerBuffer
) -> tuple[int, int, int]:
    """Binary powering for a nonnegative exact cubic exponent."""
    if exponent < 0:
        raise ValueError("negative exponent at exact power boundary")
    r0, r1, r2 = 1, 0, 0
    while exponent != 0:
        if exponent % 2 != 0:
            r0, r1, r2 = _unified_cubic_multiply(r0, r1, r2, a0, a1, a2, tensor)
        exponent //= 2
        if exponent != 0:
            a0, a1, a2 = _unified_cubic_multiply(a0, a1, a2, a0, a1, a2, tensor)
    return r0, r1, r2


@native
def _unified_relation_product(
    generators: IntegerBuffer,
    exponents: IntegerBuffer,
    exponent_offset: int,
    relation_count: int,
    tensor: IntegerBuffer,
) -> tuple[int, int, int]:
    """Replay one signed principal-relation word."""
    positive0, positive1, positive2 = 1, 0, 0
    negative0, negative1, negative2 = 1, 0, 0
    for relation in range(relation_count):
        exponent = exponents[exponent_offset + relation]
        source = 3 * relation
        if exponent > 0:
            power0, power1, power2 = _unified_cubic_power(
                generators[source],
                generators[source + 1],
                generators[source + 2],
                exponent,
                tensor,
            )
            positive0, positive1, positive2 = _unified_cubic_multiply(
                positive0,
                positive1,
                positive2,
                power0,
                power1,
                power2,
                tensor,
            )
        elif exponent < 0:
            power0, power1, power2 = _unified_cubic_power(
                generators[source],
                generators[source + 1],
                generators[source + 2],
                -exponent,
                tensor,
            )
            negative0, negative1, negative2 = _unified_cubic_multiply(
                negative0,
                negative1,
                negative2,
                power0,
                power1,
                power2,
                tensor,
            )
    return _unified_cubic_divide_exact(
        positive0,
        positive1,
        positive2,
        negative0,
        negative1,
        negative2,
        tensor,
    )


@native
def pari_unified_full_h1_suffix(
    polynomial: IntegerBuffer,
    basis: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    generators: IntegerBuffer,
    cleanup_transform: IntegerBuffer,
    active_hnf_transform: IntegerBuffer,
    compact_provenance: IntegerBuffer,
    expected_regulator: IntegerBuffer,
    kernel_relation_map: IntegerBuffer,
    retained_relation_map: IntegerBuffer,
    kernel_factors: IntegerBuffer,
    exact_units_integral: IntegerBuffer,
    exact_units_power: IntegerBuffer,
    exact_norms: IntegerBuffer,
    root_m: IntegerBuffer,
    root_p: IntegerBuffer,
    root_e: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    embedding_state: Int64Buffer,
    atom_logs: IntegerBuffer,
    transformed_logs: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_result: IntegerBuffer,
    rebuilt_logs: IntegerBuffer,
    phase_scratch: IntegerBuffer,
    rebuilt_phases: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    transcendental_a: IntegerBuffer,
    transcendental_b: IntegerBuffer,
    transcendental_p: IntegerBuffer,
    transcendental_q: IntegerBuffer,
    transcendental_stack: IntegerBuffer,
    clean_state: Int64Buffer,
    precision_state: Int64Buffer,
    determinant_values: IntegerBuffer,
    determinant_work: IntegerBuffer,
    determinant_output: IntegerBuffer,
    determinant_pivots: Int64Buffer,
    determinant_state: Int64Buffer,
    authority_state: Int64Buffer,
) -> int:
    """Run the frozen exact suffix and publish its diagnostic state.

    `authority_state` is status, kernel factors checked, exact units checked,
    embedding rebuilt, logs rebuilt, determinant evaluated, the absolute p192
    mantissa delta from the resident accepted regulator, and terminal
    authority-complete bit. The final bit always remains zero: the fixed retry
    precision and observed logical shapes are sentinels, not live policy.
    """
    if (
        len(polynomial) < 4
        or len(basis) < 9
        or len(multiplication_tensor) < 27
        or len(generators) < 219
        or len(cleanup_transform) < 73 * 73
        or len(active_hnf_transform) < 15 * 15
        or len(compact_provenance) < 14
        or len(expected_regulator) < 3
        or len(kernel_relation_map) < 7 * 73
        or len(retained_relation_map) < 2 * 73
        or len(kernel_factors) < 21
        or len(exact_units_integral) < 6
        or len(exact_units_power) < 6
        or len(exact_norms) < 2
        or len(authority_state) < 8
    ):
        raise ValueError("short unified h1 suffix owner")
    for i in range(8):
        authority_state[i] = 0
    authority_state[0] = -1

    for kernel in range(7):
        for relation in range(73):
            value = 0
            for column in range(15):
                value += (
                    active_hnf_transform[15 * kernel + column]
                    * cleanup_transform[73 * column + relation]
                )
            kernel_relation_map[73 * kernel + relation] = value
        factor0, factor1, factor2 = _unified_relation_product(
            generators, kernel_relation_map, 73 * kernel, 73, multiplication_tensor
        )
        norm = _unified_cubic_norm(factor0, factor1, factor2, multiplication_tensor)
        if norm != -1 and norm != 1:
            raise ValueError("kernel relation did not reconstruct a unit")
        kernel_factors[3 * kernel] = factor0
        kernel_factors[3 * kernel + 1] = factor1
        kernel_factors[3 * kernel + 2] = factor2
        authority_state[1] = kernel + 1

    for unit in range(2):
        for relation in range(73):
            value = 0
            for kernel in range(7):
                value += (
                    compact_provenance[7 * unit + kernel]
                    * kernel_relation_map[73 * kernel + relation]
                )
            retained_relation_map[73 * unit + relation] = value
        direct0, direct1, direct2 = _unified_relation_product(
            generators, retained_relation_map, 73 * unit, 73, multiplication_tensor
        )
        factored0, factored1, factored2 = 1, 0, 0
        for kernel in range(7):
            exponent = compact_provenance[7 * unit + kernel]
            source = 3 * kernel
            if exponent > 0:
                power0, power1, power2 = _unified_cubic_power(
                    kernel_factors[source],
                    kernel_factors[source + 1],
                    kernel_factors[source + 2],
                    exponent,
                    multiplication_tensor,
                )
                factored0, factored1, factored2 = _unified_cubic_multiply(
                    factored0,
                    factored1,
                    factored2,
                    power0,
                    power1,
                    power2,
                    multiplication_tensor,
                )
            elif exponent < 0:
                power0, power1, power2 = _unified_cubic_power(
                    kernel_factors[source],
                    kernel_factors[source + 1],
                    kernel_factors[source + 2],
                    -exponent,
                    multiplication_tensor,
                )
                factored0, factored1, factored2 = _unified_cubic_divide_exact(
                    factored0,
                    factored1,
                    factored2,
                    power0,
                    power1,
                    power2,
                    multiplication_tensor,
                )
        if direct0 != factored0 or direct1 != factored1 or direct2 != factored2:
            raise ValueError("direct and factored exact-unit replay disagree")
        norm = _unified_cubic_norm(direct0, direct1, direct2, multiplication_tensor)
        if norm != -1 and norm != 1:
            raise ValueError("selected exact element is not a unit")
        target = 3 * unit
        exact_units_integral[target] = direct0
        exact_units_integral[target + 1] = direct1
        exact_units_integral[target + 2] = direct2
        exact_units_power[target] = direct0 - 13345 * direct2
        exact_units_power[target + 1] = direct1 + 2 * direct2
        exact_units_power[target + 2] = direct2
        exact_norms[unit] = norm
        authority_state[2] = unit + 1

    status = pari_cubic_embedding_rebuild(
        polynomial,
        basis,
        2176,
        root_m,
        root_p,
        root_e,
        embedding_m,
        embedding_p,
        embedding_e,
        embedding_state,
    )
    if status != 0:
        authority_state[0] = 1
        return 1
    authority_state[3] = 1
    # ``make_M`` publishes basis columns, while the S-unit evaluator consumes
    # one contiguous basis row per real place.  Transpose each packed plane in
    # this same owner domain; the earlier split-addon worker missed this edge.
    for index in range(3):
        left = index
        right = 3 * index
        temporary = embedding_m[left]
        embedding_m[left] = embedding_m[right]
        embedding_m[right] = temporary
        temporary = embedding_p[left]
        embedding_p[left] = embedding_p[right]
        embedding_p[right] = temporary
        temporary = embedding_e[left]
        embedding_e[left] = embedding_e[right]
        embedding_e[right] = temporary
    temporary = embedding_m[5]
    embedding_m[5] = embedding_m[7]
    embedding_m[7] = temporary
    temporary = embedding_p[5]
    embedding_p[5] = embedding_p[7]
    embedding_p[7] = temporary
    temporary = embedding_e[5]
    embedding_e[5] = embedding_e[7]
    embedding_e[7] = temporary
    status = pari_cubic_sunit_precision_rebuild(
        embedding_m,
        embedding_p,
        embedding_e,
        generators,
        retained_relation_map,
        73,
        2176,
        atom_logs,
        transformed_logs,
        clean_scratch,
        clean_result,
        rebuilt_logs,
        phase_scratch,
        rebuilt_phases,
        log_cache,
        pi_cache,
        transcendental_a,
        transcendental_b,
        transcendental_p,
        transcendental_q,
        transcendental_stack,
        clean_state,
        precision_state,
    )
    if status != 0:
        authority_state[0] = 2
        return 2
    authority_state[4] = 1

    # Rows zero and one of both rebuilt columns, in determinant column order.
    for entry in range(4):
        source = 1
        if entry == 1:
            source = 8
        elif entry == 2:
            source = 22
        elif entry == 3:
            source = 29
        for word in range(3):
            determinant_values[3 * entry + word] = rebuilt_logs[source + word]
    status = pari_regulator_determinant(
        determinant_values,
        2,
        determinant_work,
        determinant_output,
        determinant_pivots,
        determinant_state,
    )
    if status != 0:
        authority_state[0] = 3
        return 3
    authority_state[5] = 1
    resized_m, resized_p, resized_e = pari_real_resize(
        abs(determinant_output[0]),
        determinant_output[1],
        determinant_output[2],
        192,
    )
    regulator_delta = abs(resized_m - abs(expected_regulator[0]))
    # This comparison is diagnostic only. The direct p192 schedule is not
    # bitwise coherent with the p2,176 schedule resized to p192, and an
    # observed delta is not a mathematical enclosure or source-policy bound.
    if resized_p != expected_regulator[1] or resized_e != expected_regulator[2]:
        regulator_delta = -1
    determinant_output[0] = resized_m
    determinant_output[1] = resized_p
    determinant_output[2] = resized_e
    authority_state[6] = regulator_delta
    authority_state[7] = 0
    authority_state[0] = 0
    return 0


@native
def pari_live_retrying_h1_suffix(
    resident_root_m: IntegerBuffer,
    resident_root_p: IntegerBuffer,
    resident_root_e: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    generators: IntegerBuffer,
    cleanup_transform: IntegerBuffer,
    active_hnf_transform: IntegerBuffer,
    compact_provenance: IntegerBuffer,
    retry_unit_transform: IntegerBuffer,
    retry_factor_transform: IntegerBuffer,
    degree: int,
    relation_count: int,
    relation_capacity: int,
    active_columns: int,
    active_capacity: int,
    compact_factor_count: int,
    factor_capacity: int,
    unit_rank: int,
    initial_precision: int,
    precision_resource_cap: int,
    retry_flagged: int,
    staged_kernel_relations: IntegerBuffer,
    staged_retained_relations: IntegerBuffer,
    staged_retry_relations: IntegerBuffer,
    staged_kernel_factors: IntegerBuffer,
    staged_relation_units: IntegerBuffer,
    root_m: IntegerBuffer,
    root_p: IntegerBuffer,
    root_e: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    embedding_packed: IntegerBuffer,
    embedding_state: Int64Buffer,
    atom_logs: IntegerBuffer,
    transformed_logs: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_result: IntegerBuffer,
    rebuilt_logs: IntegerBuffer,
    phase_scratch: IntegerBuffer,
    rebuilt_phases: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    transcendental_a: IntegerBuffer,
    transcendental_b: IntegerBuffer,
    transcendental_p: IntegerBuffer,
    transcendental_q: IntegerBuffer,
    transcendental_stack: IntegerBuffer,
    clean_state: Int64Buffer,
    precision_state: Int64Buffer,
    getfu_clean_logs: IntegerBuffer,
    getfu_clean_phases: Int64Buffer,
    getfu_factor: IntegerBuffer,
    getfu_matep: IntegerBuffer,
    getfu_transformed_arch: IntegerBuffer,
    getfu_transformed_clean: IntegerBuffer,
    getfu_transformed_phases: Int64Buffer,
    getfu_exponentials: IntegerBuffer,
    getfu_solve_work: IntegerBuffer,
    getfu_solve_rhs: IntegerBuffer,
    getfu_solved: IntegerBuffer,
    getfu_rounded: IntegerBuffer,
    getfu_multiplication: IntegerBuffer,
    getfu_inverse: IntegerBuffer,
    getfu_candidate_units: IntegerBuffer,
    getfu_normalized_factor: IntegerBuffer,
    staged_getfu_units: IntegerBuffer,
    staged_getfu_logs: IntegerBuffer,
    staged_getfu_phases: Int64Buffer,
    staged_getfu_factor: IntegerBuffer,
    getfu_state: Int64Buffer,
    getfu_pivots: Int64Buffer,
    getfu_exp_cache: IntegerBuffer,
    getfu_exp_a: IntegerBuffer,
    getfu_exp_b: IntegerBuffer,
    getfu_exp_p: IntegerBuffer,
    getfu_exp_q: IntegerBuffer,
    getfu_exp_stack: IntegerBuffer,
    determinant_values: IntegerBuffer,
    determinant_work: IntegerBuffer,
    staged_regulator: IntegerBuffer,
    determinant_pivots: Int64Buffer,
    determinant_state: Int64Buffer,
    retry_state: Int64Buffer,
    published_retained_relations: IntegerBuffer,
    published_units: IntegerBuffer,
    published_norms: IntegerBuffer,
    published_logs: IntegerBuffer,
    published_phases: Int64Buffer,
    published_regulator: IntegerBuffer,
    terminal_state: Int64Buffer,
) -> int:
    """Retry from live precision until exact getfu success or caller cap.

    The logical dimensions and precision ceiling are live inputs. All
    precision-dependent storage is supplied once and reused on every attempt.
    A return of one means the next source-policy precision exceeded the caller
    cap; public mathematical outputs remain untouched. Return zero publishes
    exact units, their live relation words, retry logs, phases, and regulator
    together only after signed getfu succeeds and agrees with exact relation
    replay up to inversion.
    """
    if degree != 3 or unit_rank != 2:
        raise ValueError("live retry suffix requires a totally real cubic of rank two")
    if (
        relation_count < 1
        or relation_count > relation_capacity
        or active_columns < 1
        or active_columns > active_capacity
        or compact_factor_count < 1
        or compact_factor_count > factor_capacity
        or initial_precision < 64
        or initial_precision % 64 != 0
        or precision_resource_cap < initial_precision
        or precision_resource_cap % 64 != 0
        or retry_flagged < 0
        or retry_flagged > 1
    ):
        raise ValueError("invalid live retry dimensions or resource cap")
    if (
        len(resident_root_m) < degree
        or len(resident_root_p) < degree
        or len(resident_root_e) < degree
        or len(multiplication_tensor) < degree * degree * degree
        or len(generators) < degree * relation_count
        or len(cleanup_transform) < relation_capacity * active_columns
        or len(active_hnf_transform) < active_capacity * compact_factor_count
        or len(compact_provenance) < unit_rank * compact_factor_count
        or len(retry_unit_transform) < unit_rank * compact_factor_count
        or len(retry_factor_transform) < unit_rank * unit_rank
        or len(staged_kernel_relations) < factor_capacity * relation_capacity
        or len(staged_retained_relations) < unit_rank * relation_capacity
        or len(staged_retry_relations) < unit_rank * relation_capacity
        or len(staged_kernel_factors) < degree * factor_capacity
        or len(staged_relation_units) < degree * unit_rank
        or len(terminal_state) < 16
        or len(retry_state) < 6
        or len(published_retained_relations) < unit_rank * relation_capacity
        or len(published_units) < degree * unit_rank
        or len(published_norms) < unit_rank
        or len(published_logs) < 3 * degree * unit_rank
        or len(published_phases) < degree * unit_rank
        or len(published_regulator) < 3
    ):
        raise ValueError("short live retry suffix owner")
    for i in range(16):
        terminal_state[i] = 0
    terminal_state[0] = -1
    terminal_state[5] = relation_count
    terminal_state[6] = active_columns
    terminal_state[7] = compact_factor_count
    terminal_state[8] = unit_rank
    terminal_state[15] = precision_resource_cap

    for factor in range(compact_factor_count):
        for relation in range(relation_count):
            value = 0
            for column in range(active_columns):
                value += (
                    active_hnf_transform[active_capacity * factor + column]
                    * cleanup_transform[relation_capacity * column + relation]
                )
            staged_kernel_relations[relation_capacity * factor + relation] = value
        factor0, factor1, factor2 = _unified_relation_product(
            generators,
            staged_kernel_relations,
            relation_capacity * factor,
            relation_count,
            multiplication_tensor,
        )
        norm = _unified_cubic_norm(factor0, factor1, factor2, multiplication_tensor)
        if norm != -1 and norm != 1:
            raise ValueError("live kernel relation did not reconstruct a unit")
        staged_kernel_factors[degree * factor] = factor0
        staged_kernel_factors[degree * factor + 1] = factor1
        staged_kernel_factors[degree * factor + 2] = factor2
        terminal_state[9] = factor + 1

    for unit in range(unit_rank):
        for relation in range(relation_count):
            value = 0
            retry_value = 0
            for factor in range(compact_factor_count):
                value += (
                    compact_provenance[compact_factor_count * unit + factor]
                    * staged_kernel_relations[relation_capacity * factor + relation]
                )
                retry_value += (
                    retry_unit_transform[compact_factor_count * unit + factor]
                    * staged_kernel_relations[relation_capacity * factor + relation]
                )
            staged_retained_relations[relation_capacity * unit + relation] = value
            # The precision rebuild leaf accepts the live logical count, so
            # its two rows are packed at that stride rather than the larger
            # caller-owned publication capacity.
            staged_retry_relations[relation_count * unit + relation] = retry_value
        direct0, direct1, direct2 = _unified_relation_product(
            generators,
            staged_retained_relations,
            relation_capacity * unit,
            relation_count,
            multiplication_tensor,
        )
        target = degree * unit
        staged_relation_units[target] = direct0
        staged_relation_units[target + 1] = direct1
        staged_relation_units[target + 2] = direct2
        terminal_state[10] = unit + 1

    current_precision = initial_precision
    while current_precision <= precision_resource_cap:
        terminal_state[1] += 1
        terminal_state[2] = current_precision
        embedding_status = pari_cubic_embedding_precision_rebuild(
            resident_root_m,
            resident_root_p,
            resident_root_e,
            current_precision,
            root_m,
            root_p,
            root_e,
            embedding_m,
            embedding_p,
            embedding_e,
            embedding_state,
        )
        terminal_state[11] = embedding_status
        if embedding_status != 0:
            terminal_state[0] = 2
            return 2
        rebuild_status = pari_cubic_sunit_precision_rebuild(
            embedding_m,
            embedding_p,
            embedding_e,
            generators,
            staged_retry_relations,
            relation_count,
            current_precision,
            atom_logs,
            transformed_logs,
            clean_scratch,
            clean_result,
            rebuilt_logs,
            phase_scratch,
            rebuilt_phases,
            log_cache,
            pi_cache,
            transcendental_a,
            transcendental_b,
            transcendental_p,
            transcendental_q,
            transcendental_stack,
            clean_state,
            precision_state,
        )
        terminal_state[12] = rebuild_status
        if rebuild_status != 0:
            terminal_state[4] = 4
            pari_live_retry_transition(
                4,
                current_precision,
                clean_state[3],
                current_precision,
                1,
                retry_state,
            )
            if retry_state[3] > precision_resource_cap:
                terminal_state[0] = 1
                return 1
            current_precision = retry_state[3]
            continue

        for column in range(degree):
            for row in range(degree):
                source = degree * row + column
                target = 3 * (degree * column + row)
                embedding_packed[target] = embedding_m[source]
                embedding_packed[target + 1] = embedding_p[source]
                embedding_packed[target + 2] = embedding_e[source]
        for entry in range(degree * unit_rank):
            getfu_clean_logs[3 * entry] = rebuilt_logs[7 * entry + 1]
            getfu_clean_logs[3 * entry + 1] = rebuilt_logs[7 * entry + 2]
            getfu_clean_logs[3 * entry + 2] = rebuilt_logs[7 * entry + 3]
            getfu_clean_phases[entry] = rebuilt_phases[entry]
        for i in range(unit_rank * unit_rank):
            getfu_factor[i] = retry_factor_transform[i]
        getfu_status = pari_getfu_signed_real_cubic(
            getfu_clean_logs,
            getfu_clean_phases,
            getfu_factor,
            embedding_packed,
            multiplication_tensor,
            current_precision,
            current_precision,
            getfu_matep,
            getfu_transformed_arch,
            getfu_transformed_clean,
            getfu_transformed_phases,
            getfu_exponentials,
            getfu_solve_work,
            getfu_solve_rhs,
            getfu_solved,
            getfu_rounded,
            getfu_multiplication,
            getfu_inverse,
            getfu_candidate_units,
            getfu_normalized_factor,
            staged_getfu_units,
            staged_getfu_logs,
            staged_getfu_phases,
            staged_getfu_factor,
            getfu_state,
            getfu_pivots,
            getfu_exp_cache,
            getfu_exp_a,
            getfu_exp_b,
            getfu_exp_p,
            getfu_exp_q,
            getfu_exp_stack,
        )
        terminal_state[3] = getfu_status
        if getfu_status != 0:
            if getfu_status != 3:
                terminal_state[0] = 3
                return 3
            terminal_state[4] = 3
            pari_live_retry_transition(
                3,
                current_precision,
                getfu_state[1],
                0,
                retry_flagged,
                retry_state,
            )
            if retry_state[3] > precision_resource_cap:
                terminal_state[0] = 1
                return 1
            current_precision = retry_state[3]
            continue

        for unit in range(unit_rank):
            target = degree * unit
            direct0 = staged_relation_units[target]
            direct1 = staged_relation_units[target + 1]
            direct2 = staged_relation_units[target + 2]
            actual0 = staged_getfu_units[target]
            actual1 = staged_getfu_units[target + 1]
            actual2 = staged_getfu_units[target + 2]
            inverse0, inverse1, inverse2 = _unified_cubic_divide_exact(
                1, 0, 0, direct0, direct1, direct2, multiplication_tensor
            )
            inverted = False
            if actual0 == inverse0 and actual1 == inverse1 and actual2 == inverse2:
                inverted = True
            elif actual0 != direct0 or actual1 != direct1 or actual2 != direct2:
                raise ValueError("getfu unit detached from exact relation replay")
            for relation in range(relation_count):
                value = staged_retained_relations[relation_capacity * unit + relation]
                if inverted:
                    value = -value
                staged_retained_relations[relation_capacity * unit + relation] = value
            staged_getfu_factor[unit] = _unified_cubic_norm(
                actual0, actual1, actual2, multiplication_tensor
            )
            if staged_getfu_factor[unit] != -1 and staged_getfu_factor[unit] != 1:
                raise ValueError("getfu published a nonunit")
        for entry in range(unit_rank * unit_rank):
            source = 0
            if entry == 1:
                source = 3
            elif entry == 2:
                source = 9
            elif entry == 3:
                source = 12
            for word in range(3):
                determinant_values[3 * entry + word] = staged_getfu_logs[source + word]
        regulator_status = pari_regulator_determinant(
            determinant_values,
            unit_rank,
            determinant_work,
            staged_regulator,
            determinant_pivots,
            determinant_state,
        )
        terminal_state[13] = regulator_status
        if regulator_status != 0:
            terminal_state[0] = 4
            return 4
        for unit in range(unit_rank):
            target = degree * unit
            for relation in range(relation_count):
                published_retained_relations[relation_capacity * unit + relation] = (
                    staged_retained_relations[relation_capacity * unit + relation]
                )
            published_units[target] = staged_getfu_units[target]
            published_units[target + 1] = staged_getfu_units[target + 1]
            published_units[target + 2] = staged_getfu_units[target + 2]
            published_norms[unit] = staged_getfu_factor[unit]
        for i in range(3 * degree * unit_rank):
            published_logs[i] = staged_getfu_logs[i]
        for i in range(degree * unit_rank):
            published_phases[i] = staged_getfu_phases[i]
        for i in range(3):
            published_regulator[i] = staged_regulator[i]
        terminal_state[14] = 1
        terminal_state[0] = 0
        return 0

    terminal_state[0] = 1
    return 1
