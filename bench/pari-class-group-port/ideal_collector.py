"""PARI 2.17.4 prepared ideal relation collector without automorphism images.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is a prepared-ideal segment, not the full small_norm/rnd_rel engine.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native

from .candidate_admission import pari_next_smooth_candidate
from .relation_insertion import pari_insert_smooth_relation


@native
def pari_collect_ideal_relations(
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
    nrelid: int,
    track_fact: int,
    jid: int,
    jid0: int,
    e0: int,
    subfactor: IntegerBuffer,
    extra: IntegerBuffer,
    extra_count: int,
    relation_primes: IntegerBuffer,
    ramification: IntegerBuffer,
    relation: IntegerBuffer,
    relation_state: IntegerBuffer,
    relation_basis: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_hashes: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation_scratch: IntegerBuffer,
    generators: IntegerBuffer,
    progress: Int64Buffer,
) -> int:
    """Return 1 at cache target or first smooth probe, 0 at ideal search end.

    Negative search statuses and unresolved-factorization status 2 are retained.
    progress is relid, Nfact, stopped, terminal status, initially all zero.
    relation_state has the cache's six slots, including target in slot 5.
    The source's cache-target check precedes incrementing relid. A quota stop
    returns 0, unlike a cache-target stop. Resuming a terminal call is inert.
    All input/configuration data and distinct borrowed buffers stay resident.
    Automorphism images are excluded explicitly; this is not a general add_rel.
    """
    if nrelid < 0 or len(progress) < 4 or len(relation_state) < 6:
        raise ValueError("invalid prepared ideal collector state")
    if progress[2] != 0:
        return int(progress[3])
    while True:
        result = pari_next_smooth_candidate(
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
            admission_matrix_m,
            admission_matrix_p,
            admission_matrix_e,
            admission_embedding_m,
            admission_embedding_p,
            admission_embedding_e,
            admission_real_count,
            admission_ideal_norm,
            admission_ideal,
            admission_mode,
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
            diagnostic,
        )
        if result != 1:
            progress[2] = 1
            progress[3] = result
            return result
        if nrelid == 0:
            progress[2] = 1
            progress[3] = 1
            return 1
        status, appended, nz, count = pari_insert_smooth_relation(
            jid,
            jid0,
            e0,
            admission_indices,
            admission_exponents,
            int(counters[2]),
            subfactor,
            extra,
            extra_count,
            relation_primes,
            ramification,
            element,
            relation,
            relation_state,
            relation_basis,
            relation_records,
            relation_hashes,
            relation_metadata,
            relation_scratch,
            generators,
            progress,
            track_fact,
        )
        counters[2] = count
        if status > 0:
            if relation_state[0] >= relation_state[5]:
                progress[2] = 1
                progress[3] = 1
                return 1
            progress[0] += 1
            if progress[0] == nrelid:
                progress[2] = 1
                progress[3] = 0
                return 0
