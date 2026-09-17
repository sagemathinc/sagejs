"""Join the live field-3 HNF owners to the mixed-quartic class suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the narrow PARI 2.17.4 `class_group_gen` join for the frozen
field-3 mixed quartic.  The resident retry driver publishes `W` in the
logical prefix of its H owner, `C` in the logical prefix of its transformed
log owner, and the final factor-base permutation.  This leaf selects the
corresponding prepared prime descriptors, reconstructs their multiplication
matrices from the prepared integral-basis table, and feeds those values to the
existing mixed-quartic assembly.  No class invariant, generator ideal,
principal correction, or expected descriptor is an input.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .prime_ideal_hnf import pari_basis_multiplication_table
from .quartic_class_group_assembly import pari_mixed_quartic_class_group_assembly


@native
def pari_field3_live_class_suffix(
    live_h: IntegerBuffer,
    live_c: IntegerBuffer,
    hnf_state: Int64Buffer,
    outer_perm: IntegerBuffer,
    packet_count: int,
    packet_primes: IntegerBuffer,
    packet_generators: IntegerBuffer,
    packet_inert: IntegerBuffer,
    basis_table: IntegerBuffer,
    relation_hnf: IntegerBuffer,
    relation_logs: IntegerBuffer,
    selected_primes: IntegerBuffer,
    selected_tau: IntegerBuffer,
    descriptor_generator: IntegerBuffer,
    descriptor_tau: IntegerBuffer,
    generator_ideals: IntegerBuffer,
    generated_ideals: IntegerBuffer,
    relation_exponents: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_numerators: IntegerBuffer,
    factor_denominators: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    tau_scratch: IntegerBuffer,
    ideal_scratch: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    smith: IntegerBuffer,
    left: IntegerBuffer,
    left_inverse: IntegerBuffer,
    right: IntegerBuffer,
    ur: IntegerBuffer,
    y: IntegerBuffer,
    uir: IntegerBuffer,
    x: IntegerBuffer,
    m1: IntegerBuffer,
    m2: IntegerBuffer,
    invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    ga: IntegerBuffer,
    gd: IntegerBuffer,
    generator_arch: IntegerBuffer,
    smith_column: IntegerBuffer,
    smith_product: IntegerBuffer,
    smith_augmented: IntegerBuffer,
    left_inverse_state: Int64Buffer,
    right_inverse_state: Int64Buffer,
    first_division_state: Int64Buffer,
    second_division_state: Int64Buffer,
    smith_state: Int64Buffer,
    cx_state: Int64Buffer,
    c_m1: IntegerBuffer,
    ga_diagonal: IntegerBuffer,
    c_m2: IntegerBuffer,
    ga_ur: IntegerBuffer,
    gd_work: IntegerBuffer,
    generator_arch_work: IntegerBuffer,
    assembly_state: Int64Buffer,
    retained_packet_indices: IntegerBuffer,
    retained_packet_primes: IntegerBuffer,
    retained_packet_generators: IntegerBuffer,
    retained_packet_tau: IntegerBuffer,
    retained_order_exponents: IntegerBuffer,
    retained_order_m1: IntegerBuffer,
    retained_principal_offsets: IntegerBuffer,
    retained_principal_kinds: IntegerBuffer,
    retained_principal_numerators: IntegerBuffer,
    retained_principal_denominators: IntegerBuffer,
    retained_principal_exponents: IntegerBuffer,
    suffix_state: Int64Buffer,
) -> int:
    """Publish class generators and their exact retained witness material.

    The admitted terminal shape is the authentic two-row field-3 quotient.
    `outer_perm` is one-based, exactly as PARI's `F.perm`.  Published
    descriptor/order/principal owners are transactional; the established
    quartic leaf retains its own publication guarantees.

    `suffix_state` is status, H rows, live C columns, first and second
    selected one-based packet indices, reconstructed descriptor matrices,
    checked Smith-order rows, retained principal factors, class number,
    invariant count, generator count, and retained witness cells.
    """
    degree = 4
    places = 3
    dimension = 2
    active = 2
    ideal_size = 16
    log_width = 7
    if len(hnf_state) < 9 or len(suffix_state) < 12:
        raise ValueError("short field-3 live suffix state")
    if packet_count < active:
        raise ValueError("short field-3 descriptor population")
    if (
        len(live_h) < dimension * dimension
        or len(live_c) < places * dimension * log_width
        or len(outer_perm) < packet_count
        or len(packet_primes) < packet_count
        or len(packet_generators) < packet_count * degree
        or len(packet_inert) < packet_count
        or len(basis_table) < degree * degree * degree
        or len(relation_hnf) < dimension * dimension
        or len(relation_logs) < places * dimension * log_width
        or len(selected_primes) < active
        or len(selected_tau) < active * ideal_size
        or len(descriptor_generator) < degree
        or len(descriptor_tau) < ideal_size
    ):
        raise ValueError("short field-3 live descriptor owner")
    if (
        len(retained_packet_indices) < active
        or len(retained_packet_primes) < active
        or len(retained_packet_generators) < active * degree
        or len(retained_packet_tau) < active * ideal_size
        or len(retained_order_exponents) < active * dimension
        or len(retained_order_m1) < dimension * dimension
        or len(retained_principal_offsets) < active + 1
        or len(retained_principal_kinds) < active
        or len(retained_principal_numerators) < active
        or len(retained_principal_denominators) < active
        or len(retained_principal_exponents) < active
    ):
        raise ValueError("short field-3 retained witness owner")
    for i in range(12):
        suffix_state[i] = 0
    suffix_state[0] = -1
    if hnf_state[0] != dimension or hnf_state[7] < dimension:
        return 1

    for i in range(dimension * dimension):
        relation_hnf[i] = live_h[i]
    for i in range(places * dimension * log_width):
        relation_logs[i] = live_c[i]

    first_index = -1
    second_index = -1
    for generator in range(active):
        packet_index = outer_perm[generator] - 1
        if packet_index < 0 or packet_index >= packet_count:
            return 2
        if generator == 0:
            first_index = packet_index
        else:
            second_index = packet_index
        if generator != 0 and packet_index == first_index:
            return 2
        prime = packet_primes[packet_index]
        if (
            prime <= 1
            or prime >= 18446744073709551616
            or packet_inert[packet_index] != 0
        ):
            return 2
        selected_primes[generator] = prime
        for i in range(degree):
            descriptor_generator[i] = packet_generators[packet_index * degree + i]
        pari_basis_multiplication_table(
            basis_table, descriptor_generator, degree, descriptor_tau
        )
        for i in range(ideal_size):
            selected_tau[generator * ideal_size + i] = descriptor_tau[i]

    status = pari_mixed_quartic_class_group_assembly(
        relation_hnf,
        relation_logs,
        selected_primes,
        selected_tau,
        dimension,
        active,
        generator_ideals,
        generated_ideals,
        relation_exponents,
        factor_offsets,
        factor_kinds,
        factor_numerators,
        factor_denominators,
        factor_exponents,
        tau_scratch,
        ideal_scratch,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        smith,
        left,
        left_inverse,
        right,
        ur,
        y,
        uir,
        x,
        m1,
        m2,
        invariants,
        class_number,
        ga,
        gd,
        generator_arch,
        smith_column,
        smith_product,
        smith_augmented,
        left_inverse_state,
        right_inverse_state,
        first_division_state,
        second_division_state,
        smith_state,
        cx_state,
        c_m1,
        ga_diagonal,
        c_m2,
        ga_ur,
        gd_work,
        generator_arch_work,
        assembly_state,
    )
    if status != 0:
        return 3

    # Retain provenance only after the complete class assembly succeeds.
    for generator in range(active):
        packet_index = first_index
        if generator != 0:
            packet_index = second_index
        retained_packet_indices[generator] = packet_index + 1
        retained_packet_primes[generator] = selected_primes[generator]
        for i in range(degree):
            retained_packet_generators[generator * degree + i] = packet_generators[
                packet_index * degree + i
            ]
        for i in range(ideal_size):
            retained_packet_tau[generator * ideal_size + i] = selected_tau[
                generator * ideal_size + i
            ]
    for i in range(active * dimension):
        retained_order_exponents[i] = relation_exponents[i]
    for i in range(dimension * dimension):
        retained_order_m1[i] = m1[i]
    for i in range(active + 1):
        retained_principal_offsets[i] = factor_offsets[i]
    for i in range(active):
        retained_principal_kinds[i] = factor_kinds[i]
        retained_principal_numerators[i] = factor_numerators[i]
        retained_principal_denominators[i] = factor_denominators[i]
        retained_principal_exponents[i] = factor_exponents[i]

    suffix_state[0] = 0
    suffix_state[1] = dimension
    suffix_state[2] = hnf_state[7]
    suffix_state[3] = first_index + 1
    suffix_state[4] = second_index + 1
    suffix_state[5] = active * ideal_size
    suffix_state[6] = assembly_state[4]
    suffix_state[7] = factor_offsets[active]
    suffix_state[8] = class_number[0]
    suffix_state[9] = smith_state[1]
    suffix_state[10] = active
    suffix_state[11] = (
        2 * active
        + active * degree
        + active * ideal_size
        + active * dimension
        + dimension * dimension
        + active
        + 1
        + 4 * active
    )
    return 0


__all__ = ["pari_field3_live_class_suffix"]
