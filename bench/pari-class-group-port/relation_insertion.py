"""PARI 2.17.4 smooth relation normalization and resident cache insertion.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This entry excludes automorphism images; it does not implement add_rel's
automorphism branch or the surrounding ideal-search stopping logic.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .relation_cache import (
    pari_prepared_add_relation,
    pari_prepared_initialize_relations,
)
from .smooth_relation import pari_prepared_smooth_relation


@native
def pari_initialize_owned_relations(
    additional: int,
    primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    complete: IntegerBuffer,
    ramification: IntegerBuffer,
    state: IntegerBuffer,
    basis: IntegerBuffer,
    records: IntegerBuffer,
    hashes: IntegerBuffer,
    metadata: IntegerBuffer,
    relation: IntegerBuffer,
    scratch: IntegerBuffer,
    degree: int,
    generators: IntegerBuffer,
) -> int:
    """Initialize PARI's rational relations with owned coordinate generators.

    The prepared integral basis must start with 1, as in the nf interchange.
    Rational prime p then has coordinates (p, 0, ..., 0). Convert metadata to
    the one-based row IDs used by `pari_insert_smooth_relation`, without
    changing the initial relation lattice or cache decisions. Unused generator
    slots are untouched; all buffers must be distinct and caller-owned.
    """
    capacity = 10 * (int(len(relation)) + additional) + 50
    if additional < 0 or degree < 1 or len(generators) < capacity * degree:
        raise ValueError("invalid initial generator allocation")
    count = pari_prepared_initialize_relations(
        additional,
        primes,
        offsets,
        counts,
        complete,
        ramification,
        state,
        basis,
        records,
        hashes,
        metadata,
        relation,
        scratch,
    )
    for row in range(count):
        generators[row * degree] = metadata[3 * row]
        for coordinate in range(1, degree):
            generators[row * degree + coordinate] = 0
        metadata[3 * row] = row + 1
    return count


@native
def pari_insert_smooth_relation(
    jid: int,
    jid0: int,
    e0: int,
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
    count: int,
    subfactor: IntegerBuffer,
    extra: IntegerBuffer,
    extra_count: int,
    primes: IntegerBuffer,
    ramification: IntegerBuffer,
    candidate: IntegerBuffer,
    relation: IntegerBuffer,
    state: IntegerBuffer,
    basis: IntegerBuffer,
    records: IntegerBuffer,
    hashes: IntegerBuffer,
    metadata: IntegerBuffer,
    scratch: IntegerBuffer,
    generators: IntegerBuffer,
    progress: Int64Buffer,
    track_fact: int,
) -> tuple[int, int, int, int]:
    """Return upstream k, appended flag, nz hint and updated factor count.

    Each appended record owns a copy of the normalized integral-basis
    coordinates in the corresponding row of generators. Its generator token
    is its one-based record index. Existing rows must use the same convention.
    All buffers are distinct and caller-owned, with the full cache capacity
    preallocated. An appended record is retained even when upstream k is zero;
    the caller must not equate appending with a positive acceptance return.
    When track_fact is nonzero, progress[1] is incremented after normalization
    and before cache insertion, matching the upstream Nfact diagnostic point.
    """
    degree = int(len(candidate))
    if len(state) < 4 or degree < 1 or len(progress) < 2:
        raise ValueError("invalid smooth relation generator state")
    if state[1] < 0 or len(generators) < state[1] * degree:
        raise ValueError("insufficient exact generator storage")
    count, nz, content = pari_prepared_smooth_relation(
        jid,
        jid0,
        e0,
        indices,
        exponents,
        count,
        subfactor,
        extra,
        extra_count,
        primes,
        ramification,
        candidate,
        relation,
    )
    row = state[0]
    if track_fact != 0:
        progress[1] += 1
    random_relation = 0
    if extra_count >= 0:
        random_relation = 1
    status, appended = pari_prepared_add_relation(
        relation,
        nz,
        row + 1,
        0,
        0,
        random_relation,
        state,
        basis,
        records,
        hashes,
        metadata,
        scratch,
    )
    if appended != 0:
        for i in range(degree):
            generators[row * degree + i] = candidate[i]
    return status, appended, nz, count
