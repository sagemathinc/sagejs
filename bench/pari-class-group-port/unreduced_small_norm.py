"""Unreduced ideal packets through PARI 2.17.4 small_norm collection.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Original ideal HNFs/norms or prime descriptors are supplied. Prime mode builds
the ideal HNF and norm; both modes compute rank, LLL, embeddings and QR in this
closure. Ideal products, L_jid construction, automorphism images and the outer
class/unit driver remain explicit dependencies.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native
from .unreduced_ideal_collector import pari_collect_unreduced_ideal
from .ideal_schedule import pari_next_small_norm_ideal
from .prime_ideal_hnf import pari_prime_ideal_hnf


@native
def pari_collect_unreduced_ideals(
    matrix: IntegerBuffer,
    ideal: IntegerBuffer,
    n: int,
    precision: int,
    scale: float,
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
    preparation_rounded_embedding: IntegerBuffer,
    preparation_embedding: IntegerBuffer,
    preparation_original: IntegerBuffer,
    preparation_basis: IntegerBuffer,
    preparation_transform: IntegerBuffer,
    preparation_flags: IntegerBuffer,
    preparation_rank_diagnostic: IntegerBuffer,
    preparation_selection: IntegerBuffer,
    preparation_stages: IntegerBuffer,
    preparation_flatter_input: IntegerBuffer,
    preparation_current: IntegerBuffer,
    preparation_flatter_transform: IntegerBuffer,
    preparation_total_work: IntegerBuffer,
    preparation_step_t: IntegerBuffer,
    preparation_step_s: IntegerBuffer,
    preparation_product: IntegerBuffer,
    preparation_next_basis: IntegerBuffer,
    preparation_y: IntegerBuffer,
    preparation_diagnostic: IntegerBuffer,
    preparation_r1: IntegerBuffer,
    preparation_r2: IntegerBuffer,
    preparation_r3: IntegerBuffer,
    preparation_t1: IntegerBuffer,
    preparation_t2: IntegerBuffer,
    preparation_t3: IntegerBuffer,
    preparation_integers: IntegerBuffer,
    preparation_inverse: IntegerBuffer,
    preparation_first: IntegerBuffer,
    preparation_second: IntegerBuffer,
    preparation_final: IntegerBuffer,
    preparation_rounded: IntegerBuffer,
    preparation_mu: Float64Buffer,
    preparation_r: Float64Buffer,
    preparation_s: Float64Buffer,
    preparation_approximate: Float64Buffer,
    preparation_exponents: IntegerBuffer,
    preparation_float_gram: Float64Buffer,
    preparation_gram: IntegerBuffer,
    preparation_mu_exponents: IntegerBuffer,
    preparation_r_exponents: IntegerBuffer,
    preparation_s_exponents: IntegerBuffer,
    preparation_alpha: IntegerBuffer,
    preparation_column_exponents: IntegerBuffer,
    preparation_float_scratch: Float64Buffer,
    preparation_temporary: Float64Buffer,
    preparation_state: Int64Buffer,
    search_ideals: IntegerBuffer,
    packet_ids: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    schedule: Int64Buffer,
    construct_primes: int,
    basis_table: IntegerBuffer,
    packet_primes: IntegerBuffer,
    packet_generators: IntegerBuffer,
    packet_inert: IntegerBuffer,
    hnf_generator: IntegerBuffer,
    hnf_matrix: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_pivots: IntegerBuffer,
) -> int:
    """Visit original ideal packets, retaining relations across preparations.

    Packets supply either original HNF/norms or prime descriptors. In the
    latter mode compute HNF and norm inside this closure, using the prepared
    field basis table; distinguished-ideal products are not yet supported.
    All packet inputs are disjoint from mutable workspaces.
    Follow the existing upstream schedule/stop policy; unsupported preparation
    stops this schedule with a sticky dependency status rather than advancing.
    """
    packets = len(packet_ids)
    square = n * n
    if n < 3 or n > 4 or construct_primes < 0 or construct_primes > 1:
        raise ValueError("invalid unreduced ideal packets")
    if len(admission_ideal) < square:
        raise ValueError("insufficient original ideal packet storage")
    if construct_primes == 0:
        if len(packet_norms) != packets or len(packet_ideals) < packets * square:
            raise ValueError("insufficient original ideal packet data")
    else:
        if jid0 != 0 or e0 != 0:
            raise ValueError("distinguished-ideal products remain unported")
        if len(packet_primes) != packets or len(packet_inert) != packets:
            raise ValueError("invalid prime descriptor count")
        if len(packet_generators) < packets * n or len(hnf_generator) < n:
            raise ValueError("insufficient prime generator storage")
    if len(preparation_state) < 1:
        raise ValueError("insufficient resident preparation state")
    while True:
        selected = pari_next_small_norm_ideal(
            search_ideals,
            ramification,
            admission_group_f,
            n,
            jid0,
            e0,
            schedule,
            state,
            counters,
            progress,
        )
        if selected == 0:
            return int(schedule[3])
        packet = 0
        while packet < packets and packet_ids[packet] != selected:
            packet += 1
        if packet == packets:
            raise ValueError("scheduled ideal has no original packet")
        if construct_primes == 0:
            for i in range(square):
                admission_ideal[i] = packet_ideals[packet * square + i]
            ideal_norm = packet_norms[packet]
        else:
            for i in range(n):
                hnf_generator[i] = packet_generators[packet * n + i]
            pari_prime_ideal_hnf(
                basis_table,
                hnf_generator,
                n,
                packet_primes[packet],
                packet_inert[packet],
                hnf_matrix,
                hnf_work,
                hnf_pivots,
                admission_ideal,
            )
            # pr_norm = powiu(p, f). Native variable-exponent integer powers
            # are not yet supported. Dispatch this bounded residue degree to
            # constant exact powers; PARI's word-power fast path is an explicit
            # arithmetic-leaf substitution, not presumed equal backend cost.
            residue_degree = admission_group_f[selected - 1]
            if residue_degree < 1 or residue_degree > n:
                raise ValueError("invalid prime residue degree")
            if residue_degree == 1:
                ideal_norm = packet_primes[packet]
            elif residue_degree == 2:
                ideal_norm = packet_primes[packet] ** 2
            elif residue_degree == 3:
                ideal_norm = packet_primes[packet] ** 3
            else:
                ideal_norm = packet_primes[packet] ** 4
        preparation_state[0] = 0
        status = pari_collect_unreduced_ideal(
            matrix,
            ideal,
            n,
            precision,
            scale,
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
            ideal_norm,
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
            nrelid,
            track_fact,
            selected,
            jid0,
            e0,
            subfactor,
            extra,
            extra_count,
            relation_primes,
            ramification,
            relation,
            relation_state,
            relation_basis,
            relation_records,
            relation_hashes,
            relation_metadata,
            relation_scratch,
            generators,
            progress,
            preparation_rounded_embedding,
            preparation_embedding,
            preparation_original,
            preparation_basis,
            preparation_transform,
            preparation_flags,
            preparation_rank_diagnostic,
            preparation_selection,
            preparation_stages,
            preparation_flatter_input,
            preparation_current,
            preparation_flatter_transform,
            preparation_total_work,
            preparation_step_t,
            preparation_step_s,
            preparation_product,
            preparation_next_basis,
            preparation_y,
            preparation_diagnostic,
            preparation_r1,
            preparation_r2,
            preparation_r3,
            preparation_t1,
            preparation_t2,
            preparation_t3,
            preparation_integers,
            preparation_inverse,
            preparation_first,
            preparation_second,
            preparation_final,
            preparation_rounded,
            preparation_mu,
            preparation_r,
            preparation_s,
            preparation_approximate,
            preparation_exponents,
            preparation_float_gram,
            preparation_gram,
            preparation_mu_exponents,
            preparation_r_exponents,
            preparation_s_exponents,
            preparation_alpha,
            preparation_column_exponents,
            preparation_float_scratch,
            preparation_temporary,
            preparation_state,
        )
        if status <= -11:
            schedule[2] = 1
            schedule[3] = status
            return status
