"""PARI 2.17.4 smooth relation normalization and resident cache insertion.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This entry excludes automorphism images; it does not implement add_rel's
automorphism branch or the surrounding ideal-search stopping logic.
"""

from sagejs.native import IntegerBuffer, native

from .relation_cache import pari_prepared_add_relation
from .smooth_relation import pari_prepared_smooth_relation


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
) -> tuple[int, int, int, int]:
    """Return upstream k, appended flag, nz hint and updated factor count.

    Each appended record owns a copy of the normalized integral-basis
    coordinates in the corresponding row of generators. Its generator token
    is its one-based record index. Existing rows must use the same convention.
    All buffers are distinct and caller-owned, with the full cache capacity
    preallocated. An appended record is retained even when upstream k is zero;
    the caller must not equate appending with a positive acceptance return.
    """
    degree = int(len(candidate))
    if len(state) < 4 or degree < 1:
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
