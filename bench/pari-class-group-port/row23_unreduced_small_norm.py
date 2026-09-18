"""Row-23 unreduced ideal packets through PARI 2.17.4 small_norm collection.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Original ideal HNFs/norms or prime descriptors are supplied. Prime mode builds
the ideal HNF and norm; both modes compute rank, LLL, embeddings and QR in this
closure. Mode 2 also constructs a supplied distinguished prime power and its
products. Mode 3 selects its exponent from the supplied ordered factor base.
Input L_jid/factor-base preparation, automorphism images and the full class/unit
driver remain explicit dependencies. This copy admits only the authenticated
row-23 prebuilt-packet corridor.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native
from .unreduced_ideal_collector import pari_collect_unreduced_ideal
from .ideal_schedule import pari_next_small_norm_ideal
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .prime_ideal_hnf import pari_basis_multiplication_table
from .prime_ideal_power import pari_positive_prime_power_hnf
from .integral_power import pari_nonnegative_integer_power
from .integral_log import pari_integral_log
from .composite_ideal_hnf import pari_integral_ideal_mul_two
from .connected_outer_schedule import (
    pari_start_connected_outer,
    pari_end_connected_outer,
)


@native
def pari_collect_row23_unreduced_ideals(
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
    search_count: int,
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
    power_ideal: IntegerBuffer,
    power_alpha: IntegerBuffer,
    power_metadata: IntegerBuffer,
    power_primitive: IntegerBuffer,
    power_temporary: IntegerBuffer,
    power_diagnostic: IntegerBuffer,
    power_multiplication: IntegerBuffer,
    power_work: IntegerBuffer,
    power_triangular: IntegerBuffer,
    power_moduli: IntegerBuffer,
    product_primitive: IntegerBuffer,
    product_matrix: IntegerBuffer,
    outer_mode: int,
    outer_ru: int,
    outer_state: Int64Buffer,
    outer_minidx: IntegerBuffer,
    outer_present: IntegerBuffer,
    outer_live: IntegerBuffer,
    outer_perm: IntegerBuffer,
    outer_multiplier: IntegerBuffer,
) -> int:
    """Visit the exact row-23 original packets from a fresh relation cache.

    Packets supply either original HNF/norms or prime descriptors. In the
    latter mode compute HNF and norm inside this closure, using the prepared
    field basis table. Mode 2 additionally constructs the distinguished prime
    power once and multiplies it by each visited prime. Its exponent and prime
    descriptor are explicit inputs. Mode 3 instead computes the upstream
    exponent from the last factor-base prime norm and retains it in metadata.
    All packet inputs are disjoint from mutable workspaces.
    Follow the existing upstream schedule/stop policy; unsupported preparation
    stops this schedule with a sticky dependency status rather than advancing.
    `search_count` is the live search prefix length, not its buffer capacity.
    With `outer_mode=1`, also execute one outer scheduling iteration in this
    closure. Prepared need/preallocation/A/R/W and factor-base state are still
    supplied. Outer j selects constructed primes (zero) or the selected-exponent
    distinguished path (positive); do not supply j/e0 as an alternative policy.
    See `connected_outer_schedule.py` for sticky outcome-state codes. Mode zero
    leaves the outer buffers unused and retains the original collector entry.
    """
    packets = len(packet_ids)
    square = n * n
    if (
        n != 5
        or construct_primes != 0
        or outer_mode != 0
        or precision != 192
        or admission_real_count != 5
        or admission_mode != 2
        or len(relation) != 31
        or len(relation_state) < 6
        or relation_state[0] != 0
        or relation_state[5] != 40
        or packets != 31
        or search_count != 31
        or len(search_ideals) < 31
        or len(packet_ideals) != 31 * 25
        or len(packet_norms) != 31
    ):
        raise ValueError("unsupported row-23 unreduced ideal corridor")
    for i in range(31):
        if packet_ids[i] < 1 or packet_ids[i] > 31:
            raise ValueError("invalid row-23 packet identity")
        if search_ideals[i] < 1 or search_ideals[i] > 31:
            raise ValueError("invalid row-23 search identity")
        for j in range(i):
            if packet_ids[j] == packet_ids[i]:
                raise ValueError("duplicate row-23 packet identity")
            if search_ideals[j] == search_ideals[i]:
                raise ValueError("duplicate row-23 search identity")
    if outer_mode < 0 or outer_mode > 1:
        raise ValueError("invalid outer collection mode")
    if outer_mode == 1:
        if len(outer_state) < 19:
            raise ValueError("invalid connected outer state")
        if outer_state[17] != 0:
            return int(outer_state[18])
    if search_count < 0 or search_count > len(search_ideals):
        raise ValueError("invalid live ideal search length")
    if outer_mode == 1:
        if len(schedule) < 4 or schedule[1] != 0 or schedule[2] != 0:
            raise ValueError("connected outer collector schedule is not fresh")
        outcome = pari_start_connected_outer(
            len(relation),
            outer_ru,
            outer_state,
            search_ideals,
            search_count,
            outer_minidx,
            outer_present,
            outer_live,
            outer_perm,
            outer_multiplier,
            relation_state,
            relation_basis,
        )
        if outcome == 0:
            return int(outer_state[18])
        jid0 = outer_state[12]
        e0 = 0
        construct_primes = 1
        if jid0 != 0:
            construct_primes = 3
        nrelid = outer_state[1]
        search_count = outer_state[13]
    if n != 5 or construct_primes != 0:
        raise ValueError("invalid unreduced ideal packets")
    if len(admission_ideal) < square:
        raise ValueError("insufficient original ideal packet storage")
    if construct_primes == 0:
        if len(packet_norms) != packets or len(packet_ideals) < packets * square:
            raise ValueError("insufficient original ideal packet data")
    else:
        if construct_primes == 1 and (jid0 != 0 or e0 != 0):
            raise ValueError("distinguished-ideal products remain unported")
        if construct_primes == 2 and (jid0 < 1 or e0 < 0 or e0 >= 512):
            raise ValueError("invalid distinguished prime power")
        if construct_primes == 3 and (jid0 < 1 or e0 != 0):
            raise ValueError("selected distinguished exponent requires zero input")
        if len(packet_primes) != packets or len(packet_inert) != packets:
            raise ValueError("invalid prime descriptor count")
        if len(packet_generators) < packets * n or len(hnf_generator) < n:
            raise ValueError("insufficient prime generator storage")
    if len(preparation_state) < 1:
        raise ValueError("insufficient resident preparation state")
    if construct_primes >= 2:
        if len(schedule) < 4 or len(power_metadata) < 4:
            raise ValueError("insufficient distinguished power state")
        if len(ramification) != len(admission_group_f):
            raise ValueError("inconsistent distinguished prime descriptors")
        if construct_primes == 3:
            if len(power_metadata) < 5 or len(relation_primes) == 0:
                raise ValueError("insufficient selected exponent state")
            if len(relation_primes) != len(admission_group_f):
                raise ValueError("inconsistent ordered factor base")
            if schedule[2] != 0 or schedule[1] != 0:
                e0 = power_metadata[4]
        if schedule[2] == 0 and schedule[1] == 0:
            power_packet = 0
            while power_packet < packets and packet_ids[power_packet] != jid0:
                power_packet += 1
            if power_packet == packets or jid0 > len(ramification):
                raise ValueError("distinguished prime has no descriptor")
            prime_norm = pari_nonnegative_integer_power(
                packet_primes[power_packet], admission_group_f[jid0 - 1]
            )
            if construct_primes == 3:
                last = len(relation_primes) - 1
                last_norm = pari_nonnegative_integer_power(
                    relation_primes[last], admission_group_f[last]
                )
                e0 = pari_integral_log(last_norm * last_norm, prime_norm, power_work)
                if e0 < 0 or e0 >= 512:
                    raise ValueError(
                        "selected distinguished exponent outside supported power domain"
                    )
            if e0 == 0:
                # base4.c:idealpow_aux returns matid(N) before ideal dispatch.
                if len(power_ideal) < square:
                    raise ValueError("insufficient identity ideal storage")
                for i in range(square):
                    power_ideal[i] = 0
                for i in range(n):
                    power_ideal[i * n + i] = 1
            else:
                for i in range(n):
                    hnf_generator[i] = packet_generators[power_packet * n + i]
                pari_positive_prime_power_hnf(
                    basis_table,
                    hnf_generator,
                    n,
                    packet_primes[power_packet],
                    ramification[jid0 - 1],
                    admission_group_f[jid0 - 1],
                    e0,
                    power_primitive,
                    power_temporary,
                    power_alpha,
                    power_metadata,
                    power_diagnostic,
                    power_multiplication,
                    power_work,
                    power_triangular,
                    power_moduli,
                    power_ideal,
                )
            power_metadata[3] = pari_nonnegative_integer_power(prime_norm, e0)
            if construct_primes == 3:
                power_metadata[4] = e0
    while True:
        if outer_mode == 1:
            selected = pari_next_small_norm_ideal(
                outer_live,
                search_count,
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
        else:
            selected = pari_next_small_norm_ideal(
                search_ideals,
                search_count,
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
            if outer_mode == 1:
                return pari_end_connected_outer(
                    int(schedule[3]),
                    len(relation),
                    outer_state,
                    outer_live,
                    outer_perm,
                    relation_state,
                    relation_basis,
                )
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
            if construct_primes >= 2:
                if packet_inert[packet] == 0:
                    pari_basis_multiplication_table(
                        basis_table, hnf_generator, n, hnf_matrix
                    )
                pari_integral_ideal_mul_two(
                    power_ideal,
                    hnf_matrix,
                    packet_primes[packet],
                    n,
                    packet_inert[packet],
                    packet_primes[packet],
                    product_primitive,
                    product_matrix,
                    power_work,
                    power_triangular,
                    power_moduli,
                    admission_ideal,
                )
            else:
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
            residue_degree = admission_group_f[selected - 1]
            if residue_degree < 1 or residue_degree > n:
                raise ValueError("invalid prime residue degree")
            ideal_norm = pari_nonnegative_integer_power(
                packet_primes[packet], residue_degree
            )
            if construct_primes >= 2:
                ideal_norm *= power_metadata[3]
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
            if outer_mode == 1:
                return pari_end_connected_outer(
                    status,
                    len(relation),
                    outer_state,
                    outer_live,
                    outer_perm,
                    relation_state,
                    relation_basis,
                )
            return status
