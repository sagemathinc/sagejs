"""Prepared packet boundary around PARI 2.17.4 small_norm collection.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Ideal multiplication, LLL and packet preparation remain external.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native
from .ideal_collector import pari_collect_ideal_relations
from .ideal_schedule import pari_next_small_norm_ideal


@native
def pari_collect_prepared_ideals(
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
    search_ideals: IntegerBuffer,
    packet_ids: IntegerBuffer,
    packet_matrices: IntegerBuffer,
    packet_reduced_ideals: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    packet_skips: IntegerBuffer,
    schedule: Int64Buffer,
) -> int:
    """Run the prepared ideal schedule in one closed native call.

    Packet rows contain G*reduced_ideal triples, reduced ideals, original ideals,
    norms and skip-first flags. IDs match the factor-base ideal numbering.
    Input packet storage must be distinct from all mutable working buffers.
    Return the schedule terminal status; zero includes schedule exhaustion.
    This does not implement upstream ideal preparation or automorphism images.
    """
    packets = len(packet_ids)
    square = n * n
    if n < 2 or n > 10 or len(packet_norms) != packets or len(packet_skips) != packets:
        raise ValueError("invalid prepared ideal packets")
    if len(packet_matrices) < packets * 3 * square:
        raise ValueError("insufficient prepared matrix packets")
    if (
        len(packet_reduced_ideals) < packets * square
        or len(packet_ideals) < packets * square
    ):
        raise ValueError("insufficient prepared ideal packets")
    if len(matrix) < 3 * square or len(ideal) < square or len(admission_ideal) < square:
        raise ValueError("insufficient mutable packet workspace")
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
            raise ValueError("scheduled ideal has no prepared packet")
        for i in range(3 * square):
            matrix[i] = packet_matrices[packet * 3 * square + i]
        for i in range(square):
            ideal[i] = packet_reduced_ideals[packet * square + i]
            admission_ideal[i] = packet_ideals[packet * square + i]
        status = pari_collect_ideal_relations(
            matrix,
            ideal,
            n,
            precision,
            scale,
            packet_skips[packet],
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
            packet_norms[packet],
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
        )
