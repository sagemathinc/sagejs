"""Deterministic bounded-relation witnesses for Native Kernel v31."""

from sagejs.native import NativeExactArena, NativeRecord, native, uint64


class RelationKey(NativeRecord):
    residue: uint64
    source: uint64


@native
def bounded_relation_summary(memory_limit: uint64, temporary_limit: uint64) -> uint64:
    """Exercise collision, replacement, membership, and missing-key paths."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        weights = workspace.bounded_map(RelationKey, uint64, 2)
        admitted = workspace.bounded_set(RelationKey, 2)
        first = RelationKey(1, 2)
        second = RelationKey(3, 4)
        missing = RelationKey(5, 6)
        result: uint64 = 0
        if weights.insert(first, 7):
            result += 1
        if weights.insert(second, 11):
            result += 2
        weights.insert(first, 17)
        if weights.contains(first):
            result += 4
        result += weights.get(first, 19)
        result += weights.get(missing, 19)
        result += len(weights)
        if admitted.add(first):
            result += 8
        if admitted.add(second):
            result += 16
        admitted.add(first)
        if admitted.contains(second):
            result += 32
        result += len(admitted)
        return result


@native
def bounded_relation_map_full(memory_limit: uint64, temporary_limit: uint64) -> uint64:
    """Fail deterministically when a colliding map exceeds its fixed capacity."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        weights = workspace.bounded_map(RelationKey, uint64, 2)
        weights.insert(RelationKey(1, 2), 7)
        weights.insert(RelationKey(3, 4), 11)
        weights.insert(RelationKey(5, 6), 13)
        return len(weights)


@native
def bounded_relation_set_full(memory_limit: uint64, temporary_limit: uint64) -> uint64:
    """Fail deterministically when a colliding set exceeds its fixed capacity."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        admitted = workspace.bounded_set(RelationKey, 2)
        admitted.add(RelationKey(1, 2))
        admitted.add(RelationKey(3, 4))
        admitted.add(RelationKey(5, 6))
        return len(admitted)
