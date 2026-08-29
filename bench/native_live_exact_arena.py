"""Neutral capacity-planned exact-arena witnesses for Native Kernel v26."""

from sagejs.native import NativeExactArena, native, uint64


@native
def live_arena_relation_step(
    memory_limit: uint64,
    maximum_bits: uint64,
    left: int,
    right: int,
    repetitions: uint64,
) -> tuple[int, int, uint64]:
    """Keep a relation matrix and pivot vector in one exact ownership region."""
    with NativeExactArena(memory_limit) as workspace:
        relations = workspace.integer_matrix(2, 3, maximum_bits)
        pivots = workspace.integer_vector(2, maximum_bits)
        relations[0, 1] = left
        pivots[1] = right
        for _iteration in range(repetitions):
            relations.addmul(0, 1, pivots[1], right)
            pivots.submul(1, relations[0, 1], left)
        relations.swap_rows(0, 1)
        return relations[1, 1], pivots[1], len(relations)


@native
def live_arena_shared_limit(memory_limit: uint64, value: int) -> int:
    """Expose aggregate base and payload charging across two child owners."""
    with NativeExactArena(memory_limit) as workspace:
        matrix = workspace.integer_matrix(2, 2, 8)
        vector = workspace.integer_vector(2, 8)
        matrix[0, 0] = value
        vector[0] = value
        return matrix[0, 0] + vector[0]
