"""Authenticate the complete live owner set for the field-3 quartic cut.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The post-``rnd_rel``/LIE diagnostic reaches an accepted 301-column relation
system before reducing it to the two-dimensional class presentation. This
leaf authenticates that exact live state and publishes bounded integrity
latches for its logical prefixes. It does not reconstruct relations from HNF,
accept an answer fixture, or replace the original live owners as mathematical
authority. Exact replay must retain and consume those owners themselves.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


@native
def _pari_field3_integer_fingerprint(
    owner: IntegerBuffer,
    logical_length: int,
    seed: int,
    output: IntegerBuffer,
    offset: int,
) -> int:
    """Stream two bounded integrity latches over one exact owner prefix."""
    modulus1 = 2305843009213693951
    modulus2 = 2305843009213693921
    first = (seed + logical_length) % modulus1
    second = (seed * 3 + logical_length) % modulus2
    index = 0
    while index < logical_length:
        value = owner[index]
        first = (first * 1000003 + value % modulus1 + index + 1) % modulus1
        second = (second * 1000033 + value % modulus2 + index + 1) % modulus2
        index += 1
    output[offset] = first
    output[offset + 1] = second
    return offset + 2


@native
def _pari_field3_int64_fingerprint(
    owner: Int64Buffer,
    logical_length: int,
    seed: int,
    output: IntegerBuffer,
    offset: int,
) -> int:
    """Stream the same latches over one machine-integer owner prefix."""
    modulus1 = 2305843009213693951
    modulus2 = 2305843009213693921
    first = (seed + logical_length) % modulus1
    second = (seed * 3 + logical_length) % modulus2
    index = 0
    while index < logical_length:
        value = owner[index]
        first = (first * 1000003 + value % modulus1 + index + 1) % modulus1
        second = (second * 1000033 + value % modulus2 + index + 1) % modulus2
        index += 1
    output[offset] = first
    output[offset + 1] = second
    return offset + 2


@native
def pari_field3_full_owner_authority(
    terminal_action: int,
    relation_state: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_basis: IntegerBuffer,
    relation_hashes: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    principal_generators: IntegerBuffer,
    log_completed: IntegerBuffer,
    relation_logs: IntegerBuffer,
    packet_ids: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    packet_primes: IntegerBuffer,
    packet_generators: IntegerBuffer,
    packet_inert: IntegerBuffer,
    relation_primes: IntegerBuffer,
    ramification: IntegerBuffer,
    hnf_permutation: Int64Buffer,
    outer_permutation: IntegerBuffer,
    random_state: IntegerBuffer,
    random_schedule: Int64Buffer,
    random_subfactor: IntegerBuffer,
    random_subfactor_count: int,
    small_schedule: Int64Buffer,
    outer_state: Int64Buffer,
    driver_state: Int64Buffer,
    hnf_state: Int64Buffer,
    control_state: Int64Buffer,
    fingerprints: IntegerBuffer,
    authority_state: Int64Buffer,
) -> int:
    """Authenticate the live 288-by-301 relation-owner generation.

    This intentionally admits only the frozen mixed-quartic path. The caller
    keeps all original owners live and passes them directly to later exact
    replay. The two fingerprints per owner are integrity/generation latches,
    not collision-free equality proofs and not mathematical certificates.

    Every capacity, terminal-state, descriptor, provenance, and permutation
    check precedes the first output write. Thus rejection leaves both compact
    outputs untouched. ``authority_state`` records status followed by rows,
    columns, degree, places, factor-base count, relation cells, cache-basis
    cells, metadata cells, generator cells, log cells, ideal cells, descriptor
    cells, RNG words, random subfactor count, H rows, B columns, HNF columns,
    driver pass, absolute ``done_small``, authenticated permutation cells,
    authenticated scheduler cells, fingerprint count, and cache capacity.
    """
    rows = 288
    columns = 301
    degree = 4
    places = 3
    factor_count = 288
    relation_cells = rows * columns
    basis_cells = rows * rows
    metadata_cells = 3 * columns
    generator_cells = degree * columns
    log_cells = 7 * places * columns
    ideal_cells = degree * degree * factor_count
    descriptor_cells = degree * factor_count
    rng_words = 66
    fingerprint_count = 48
    if (
        len(relation_state) < 6
        or len(log_completed) < 1
        or len(random_schedule) < 12
        or len(small_schedule) < 4
        or len(outer_state) < 19
        or len(driver_state) < 8
        or len(hnf_state) < 9
        or len(control_state) < 6
        or len(fingerprints) < fingerprint_count
        or len(authority_state) < 24
    ):
        raise ValueError("short field-3 authority state")
    if random_subfactor_count < 1 or random_subfactor_count > factor_count:
        raise ValueError("invalid field-3 random subfactor count")
    if (
        len(relation_records) < relation_cells
        or len(relation_basis) < basis_cells
        or len(relation_hashes) < columns
        or len(relation_metadata) < metadata_cells
        or len(principal_generators) < generator_cells
        or len(relation_logs) < log_cells
        or len(packet_ids) < factor_count
        or len(packet_ideals) < ideal_cells
        or len(packet_norms) < factor_count
        or len(packet_primes) < factor_count
        or len(packet_generators) < descriptor_cells
        or len(packet_inert) < factor_count
        or len(relation_primes) < factor_count
        or len(ramification) < factor_count
        or len(hnf_permutation) < rows
        or len(outer_permutation) < rows
        or len(random_state) < rng_words
        or len(random_subfactor) < random_subfactor_count
    ):
        raise ValueError("short live field-3 owner")

    if (
        terminal_action != 0
        or relation_state[0] != columns
        or relation_state[2] != 0
        or relation_state[4] != columns
        or relation_state[5] != columns
        or log_completed[0] != columns
        or hnf_state[0] != 2
        or hnf_state[2] != 286
        or hnf_state[7] != columns
        or hnf_state[8] != 0
        or control_state[3] != 2
        or control_state[4] != 286
        or control_state[5] != columns
        or driver_state[0] != 3
        or driver_state[2] != 4
        or driver_state[4] != 0
        or driver_state[7] != columns
        or outer_state[2] != 292
        or outer_state[14] == 0
        or outer_state[17] != 1
        or random_schedule[9] != 0
        or random_schedule[4] != random_subfactor_count
        or small_schedule[2] == 0
    ):
        return 1

    column = 0
    while column < columns:
        if (
            relation_metadata[3 * column] != column + 1
            or relation_metadata[3 * column + 1] != 0
            or relation_metadata[3 * column + 2] != 0
            or relation_hashes[column] < 1
            or relation_hashes[column] > rows
        ):
            return 2
        column += 1

    packet = 0
    while packet < factor_count:
        if (
            packet_ids[packet] != packet + 1
            or packet_norms[packet] <= 0
            or packet_primes[packet] <= 1
            or packet_primes[packet] != relation_primes[packet]
            or ramification[packet] <= 0
            or (packet_inert[packet] != 0 and packet_inert[packet] != 1)
            or hnf_permutation[packet] < 1
            or hnf_permutation[packet] > rows
            or outer_permutation[packet] != hnf_permutation[packet]
        ):
            return 3
        prior = 0
        while prior < packet:
            if hnf_permutation[packet] == hnf_permutation[prior]:
                return 3
            prior += 1
        packet += 1
    slot = 0
    while slot < random_subfactor_count:
        if random_subfactor[slot] < 1 or random_subfactor[slot] > factor_count:
            return 4
        slot += 1

    offset = 0
    offset = _pari_field3_integer_fingerprint(
        relation_records, relation_cells, 1, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        relation_basis, basis_cells, 2, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        relation_hashes, columns, 3, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        relation_metadata, metadata_cells, 4, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        principal_generators, generator_cells, 5, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        relation_logs, log_cells, 6, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        packet_ids, factor_count, 7, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        packet_ideals, ideal_cells, 8, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        packet_norms, factor_count, 9, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        packet_primes, factor_count, 10, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        packet_generators, descriptor_cells, 11, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        packet_inert, factor_count, 12, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        relation_primes, factor_count, 13, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        ramification, factor_count, 14, fingerprints, offset
    )
    offset = _pari_field3_int64_fingerprint(
        hnf_permutation, rows, 15, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        outer_permutation, rows, 16, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        random_state, rng_words, 17, fingerprints, offset
    )
    offset = _pari_field3_int64_fingerprint(
        random_schedule, 12, 18, fingerprints, offset
    )
    offset = _pari_field3_integer_fingerprint(
        random_subfactor, random_subfactor_count, 19, fingerprints, offset
    )
    offset = _pari_field3_int64_fingerprint(small_schedule, 4, 20, fingerprints, offset)
    offset = _pari_field3_int64_fingerprint(outer_state, 19, 21, fingerprints, offset)
    offset = _pari_field3_int64_fingerprint(driver_state, 8, 22, fingerprints, offset)
    offset = _pari_field3_int64_fingerprint(hnf_state, 9, 23, fingerprints, offset)
    offset = _pari_field3_int64_fingerprint(control_state, 6, 24, fingerprints, offset)

    authority_state[0] = 0
    authority_state[1] = rows
    authority_state[2] = columns
    authority_state[3] = degree
    authority_state[4] = places
    authority_state[5] = factor_count
    authority_state[6] = relation_cells
    authority_state[7] = basis_cells
    authority_state[8] = metadata_cells
    authority_state[9] = generator_cells
    authority_state[10] = log_cells
    authority_state[11] = ideal_cells
    authority_state[12] = descriptor_cells
    authority_state[13] = rng_words
    authority_state[14] = random_subfactor_count
    authority_state[15] = hnf_state[0]
    authority_state[16] = hnf_state[2]
    authority_state[17] = hnf_state[7]
    authority_state[18] = driver_state[2]
    authority_state[19] = outer_state[2]
    authority_state[20] = 2 * rows
    authority_state[21] = 12 + random_subfactor_count + 4 + 19 + 8 + 9 + 6
    authority_state[22] = offset
    authority_state[23] = relation_state[1]
    return 0


__all__ = ["pari_field3_full_owner_authority"]
