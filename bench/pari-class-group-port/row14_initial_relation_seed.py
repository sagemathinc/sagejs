"""Seed an owned relation cache from an authenticated sparse capsule.

This is a representation boundary, not a mathematical oracle.  It accepts
only sparse relation columns and scalar principal generators, runs the normal
relation-cache insertion policy, and publishes no HNF or class/unit result.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .relation_cache import pari_prepared_add_relation


@native
def pari_connected_relation_seed_count(
    rows: int,
    additional: int,
    target: int,
    state: IntegerBuffer,
) -> int:
    """Return zero for a fresh cache or validate a complete seeded prefix.

    `state[3]` is the relation-cache additional-column count (`target - rows`).
    It is not the outer collector's independent `Nrelid` scheduling value.
    """
    if rows < 1 or additional < 0 or target != rows + additional or len(state) < 6:
        raise ValueError("invalid connected relation seed dimensions")
    last = int(state[0])
    if last == 0:
        return 0
    capacity = 10 * target + 50
    if (
        last < 1
        or last >= target
        or state[1] != capacity
        or state[2] < 0
        or state[3] < 0
        or state[4] != 0
        or state[5] != target
    ):
        raise ValueError("invalid connected preseeded relation cache")
    return last


@native
def pari_seed_sparse_owned_relations(
    rows: int,
    degree: int,
    additional: int,
    target: int,
    offsets: Int64Buffer,
    indices: Int64Buffer,
    values: Int64Buffer,
    multipliers: Int64Buffer,
    source_nz: Int64Buffer,
    state: IntegerBuffer,
    basis: IntegerBuffer,
    records: IntegerBuffer,
    hashes: IntegerBuffer,
    metadata: IntegerBuffer,
    relation: IntegerBuffer,
    scratch: IntegerBuffer,
    generators: IntegerBuffer,
) -> int:
    """Insert the complete authenticated sparse prefix into fresh owners."""
    count = int(len(multipliers))
    capacity = 10 * target + 50
    if (
        rows < 1
        or degree < 1
        or additional < 0
        or target != rows + additional
        or count < 1
        or len(offsets) != count + 1
        or len(source_nz) != count
        or len(indices) != len(values)
        or len(state) < 6
        or len(basis) < rows * rows
        or len(records) < capacity * rows
        or len(hashes) < capacity
        or len(metadata) < 3 * capacity
        or len(relation) < rows
        or len(scratch) < rows
        or len(generators) < degree * capacity
    ):
        raise ValueError("invalid sparse relation seed owners")
    if offsets[0] != 0 or offsets[count] != len(indices):
        raise ValueError("invalid sparse relation seed offsets")
    for i in range(rows * rows):
        basis[i] = 0
    for i in range(rows):
        relation[i] = 0
    for i in range(6):
        state[i] = 0
    state[1] = capacity
    state[2] = rows
    state[3] = additional
    state[5] = target
    for column in range(count):
        start = int(offsets[column])
        end = int(offsets[column + 1])
        if start < 0 or end <= start or end > len(indices):
            raise ValueError("invalid sparse relation seed column")
        first = rows
        for entry in range(start, end):
            index = int(indices[entry])
            value = int(values[entry])
            if index < 0 or index >= rows or value == 0:
                raise ValueError("invalid sparse relation seed entry")
            if relation[index] != 0:
                raise ValueError("duplicate sparse relation seed entry")
            relation[index] = value
            if index < first:
                first = index
        if source_nz[column] != first + 1:
            raise ValueError("sparse relation seed nz changed")
        row = int(state[0])
        status, appended = pari_prepared_add_relation(
            relation,
            first + 1,
            int(multipliers[column]),
            0,
            0,
            0,
            state,
            basis,
            records,
            hashes,
            metadata,
            scratch,
        )
        if appended != 1 or status <= 0 or row != column:
            raise ValueError("sparse relation seed was not an independent prefix")
        for coordinate in range(degree):
            generators[row * degree + coordinate] = 0
        generators[row * degree] = multipliers[column]
        metadata[3 * row] = row + 1
        for entry in range(start, end):
            relation[indices[entry]] = 0
    return int(state[0])


__all__ = ["pari_connected_relation_seed_count", "pari_seed_sparse_owned_relations"]
