"""Transactional owner extents for the PARI relation-cache corridor.

PARI 2.17.4 algorithm, copyright (C) The PARI group; GPL-2.0-or-later.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


# `capacity_state` is a field-neutral, versioned output protocol. Its slots
# are deliberately scalar extents rather than field- or fixture-specific
# maxima:
#
#   version, stage, rows, degree, places, live target, record reserve,
#   relation state, basis, records, hashes, metadata, relation scratch row,
#   relation scratch, generators, completed-log state, embeddings,
#   log coordinates, log column, search ideals, outer state, minidx, present,
#   live ideals, permutation, multiplier, append relations, append logs,
#   class invariants, driver state, driver trace, total scalar cells.
#
# Stage 1 is the `init_rel` reserve, stage 2 is PARI `pre_allocate`, and stage
# 3 is the exact suffix required by one completed collection pass. Reporting
# mutates only this owner; a caller discards it after allocating fresh owners
# and resumes from its authenticated prepared-nf input.
CAPACITY_SLOTS = 32


@native
def pari_relation_capacity_report(
    rows: int,
    degree: int,
    places: int,
    live_target: int,
    record_reserve: int,
    append_columns: int,
    pass_limit: int,
    stage: int,
    capacity_state: Int64Buffer,
) -> int:
    """Publish exact scalar extents for every relation-coupled owner."""
    if (
        rows < 1
        or degree < 1
        or places < 1
        or live_target < 1
        or record_reserve < live_target
        or append_columns < 0
        or append_columns > record_reserve
        or pass_limit < 1
        or stage < 1
        or stage > 3
        or len(capacity_state) < CAPACITY_SLOTS
    ):
        raise ValueError("invalid relation capacity request")
    width = 7 * places
    capacity_state[0] = 1
    capacity_state[1] = stage
    capacity_state[2] = rows
    capacity_state[3] = degree
    capacity_state[4] = places
    capacity_state[5] = live_target
    capacity_state[6] = record_reserve
    capacity_state[7] = 6
    capacity_state[8] = rows * rows
    capacity_state[9] = rows * record_reserve
    capacity_state[10] = record_reserve
    capacity_state[11] = 3 * record_reserve
    capacity_state[12] = rows
    capacity_state[13] = rows
    capacity_state[14] = degree * record_reserve
    capacity_state[15] = 1
    capacity_state[16] = width * live_target
    capacity_state[17] = degree
    capacity_state[18] = width
    capacity_state[19] = rows
    capacity_state[20] = 19
    capacity_state[21] = rows
    capacity_state[22] = rows
    capacity_state[23] = rows
    capacity_state[24] = rows
    capacity_state[25] = rows
    capacity_state[26] = rows * append_columns
    capacity_state[27] = width * append_columns
    capacity_state[28] = rows
    capacity_state[29] = 8
    capacity_state[30] = 5 * pass_limit
    total = 0
    for i in range(7, 31):
        total += capacity_state[i]
    capacity_state[31] = total
    return record_reserve


@native
def pari_relation_capacity_sufficient(
    rows: int,
    degree: int,
    places: int,
    live_target: int,
    record_reserve: int,
    append_columns: int,
    pass_limit: int,
    relation_state: IntegerBuffer,
    relation_basis: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_hashes: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation: IntegerBuffer,
    relation_scratch: IntegerBuffer,
    generators: IntegerBuffer,
    log_completed: IntegerBuffer,
    log_embeddings: IntegerBuffer,
    log_coordinates: IntegerBuffer,
    log_column: IntegerBuffer,
    search_ideals: IntegerBuffer,
    outer_state: Int64Buffer,
    outer_minidx: IntegerBuffer,
    outer_present: IntegerBuffer,
    outer_live: IntegerBuffer,
    outer_perm: IntegerBuffer,
    outer_multiplier: IntegerBuffer,
    append_new_relations: Int64Buffer,
    append_new_logs: IntegerBuffer,
    class_invariants: IntegerBuffer,
    driver_state: Int64Buffer,
    driver_trace: Int64Buffer,
) -> int:
    """Check the reportable relation-owner boundary before any root write."""
    width = 7 * places
    if (
        len(relation_state) < 6
        or len(relation_basis) < rows * rows
        or len(relation_records) < rows * record_reserve
        or len(relation_hashes) < record_reserve
        or len(relation_metadata) < 3 * record_reserve
        or len(relation) < rows
        or len(relation_scratch) < rows
        or len(generators) < degree * record_reserve
        or len(log_completed) < 1
        or len(log_embeddings) < width * live_target
        or len(log_coordinates) < degree
        or len(log_column) < width
        or len(search_ideals) < rows
        or len(outer_state) < 19
        or len(outer_minidx) < rows
        or len(outer_present) < rows
        or len(outer_live) < rows
        or len(outer_perm) < rows
        or len(outer_multiplier) < rows
        or len(append_new_relations) < rows * append_columns
        or len(append_new_logs) < width * append_columns
        or len(class_invariants) < rows
        or len(driver_state) < 8
        or len(driver_trace) < 5 * pass_limit
    ):
        return 0
    return 1


__all__ = [
    "CAPACITY_SLOTS",
    "pari_relation_capacity_report",
    "pari_relation_capacity_sufficient",
]
