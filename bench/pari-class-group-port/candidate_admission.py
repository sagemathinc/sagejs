"""Connected PARI 2.17.4 ideal search through smooth factor admission.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared ideals, embeddings and prime decompositions remain external inputs.
"""

from sagejs.native import (
    Float64Buffer,
    Int64Buffer,
    IntegerBuffer,
    diagnostic_stage_switch,
    native,
)

from .candidate_search import pari_next_factor_candidate
from .ideal_admission import pari_prepared_factorgen


@native
def pari_next_smooth_candidate(
    matrix: IntegerBuffer,
    ideal: IntegerBuffer,
    n: int,
    precision: int,
    scale: float,
    skipfirst: int,
    track_small: int,
    reduction: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
    float_q: Float64Buffer,
    float_v: Float64Buffer,
    bound: Float64Buffer,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    x: Int64Buffer,
    y: Float64Buffer,
    z: Float64Buffer,
    inc: Int64Buffer,
    state: Int64Buffer,
    cursor_output: Int64Buffer,
    element: IntegerBuffer,
    counters: Int64Buffer,
    admission_matrix_m: IntegerBuffer,
    admission_matrix_p: IntegerBuffer,
    admission_matrix_e: IntegerBuffer,
    admission_embedding_m: IntegerBuffer,
    admission_embedding_p: IntegerBuffer,
    admission_embedding_e: IntegerBuffer,
    admission_real_count: int,
    admission_ideal_norm: int,
    admission_ideal: IntegerBuffer,
    admission_mode: int,
    admission_factor_product: int,
    admission_primes: IntegerBuffer,
    admission_products: IntegerBuffer,
    admission_factorlimit: int,
    admission_prime_limit: int,
    admission_rational_factors: IntegerBuffer,
    admission_rational_exponents: IntegerBuffer,
    admission_prime_offsets: IntegerBuffer,
    admission_prime_counts: IntegerBuffer,
    admission_group_tau: IntegerBuffer,
    admission_group_e: IntegerBuffer,
    admission_group_f: IntegerBuffer,
    admission_group_inert: IntegerBuffer,
    admission_tau: IntegerBuffer,
    admission_x: IntegerBuffer,
    admission_y: IntegerBuffer,
    admission_spare: IntegerBuffer,
    admission_stack: IntegerBuffer,
    admission_primitive: IntegerBuffer,
    admission_columns: IntegerBuffer,
    admission_values: IntegerBuffer,
    admission_temporary: IntegerBuffer,
    admission_indices: IntegerBuffer,
    admission_exponents: IntegerBuffer,
    diagnostic: IntegerBuffer,
    bounded_real: int,
) -> int:
    """Yield 1 for a smooth candidate, 0 at exhaustion, 2 for missing factoring.

    Search failures retain -1/-2/-3. Counters have four resident entries:
    factor attempts, Nsmall, current factor-list length, unresolved flag.
    Initialize all to zero. An unresolved factorization is sticky: resuming
    cannot silently skip that candidate. Diagnostic holds rounded norm,
    rounding-error exponent and unresolved residual for the last admission.
    Rejected factorgen inputs stay inside this native call. Relation assembly
    and insertion are not performed. All buffers are distinct and caller-owned;
    the ideal for admission is the original search ideal, not its reduced basis.
    """
    if len(counters) < 4 or len(diagnostic) < 3:
        raise ValueError("smooth candidate state or diagnostic storage too small")
    if counters[3] != 0:
        return 2
    while True:
        diagnostic_stage_switch(1)
        available = pari_next_factor_candidate(
            matrix,
            ideal,
            n,
            precision,
            scale,
            skipfirst,
            track_small,
            reduction,
            vectors,
            betas,
            norms,
            column,
            float_q,
            float_v,
            bound,
            cache,
            a,
            b,
            p,
            q,
            stack,
            x,
            y,
            z,
            inc,
            state,
            cursor_output,
            element,
            counters,
        )
        if available != 1:
            diagnostic_stage_switch(0)
            return available
        diagnostic_stage_switch(2)
        status, norm, error, count, residual = pari_prepared_factorgen(
            admission_matrix_m,
            admission_matrix_p,
            admission_matrix_e,
            admission_embedding_m,
            admission_embedding_p,
            admission_embedding_e,
            admission_real_count,
            admission_ideal_norm,
            element,
            admission_ideal,
            admission_mode,
            n,
            admission_factor_product,
            admission_primes,
            admission_products,
            admission_factorlimit,
            admission_prime_limit,
            admission_rational_factors,
            admission_rational_exponents,
            admission_prime_offsets,
            admission_prime_counts,
            admission_group_tau,
            admission_group_e,
            admission_group_f,
            admission_group_inert,
            admission_tau,
            admission_x,
            admission_y,
            admission_spare,
            admission_stack,
            admission_primitive,
            admission_columns,
            admission_values,
            admission_temporary,
            admission_indices,
            admission_exponents,
            int(counters[2]),
            bounded_real,
        )
        diagnostic_stage_switch(0)
        counters[2] = count
        diagnostic[0] = norm
        diagnostic[1] = error
        diagnostic[2] = residual
        if status == 2:
            counters[3] = 1
            return 2
        if status != 0:
            return 1
