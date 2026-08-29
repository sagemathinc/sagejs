"""Fixed-schema resident-record witnesses for Native Kernel v31."""

from sagejs.native import NativeExactArena, NativeRecord, native, uint64


class RelationMetadata(NativeRecord):
    witness_index: uint64
    provenance_index: uint64


@native
def live_arena_record_checksum(
    memory_limit: uint64,
    temporary_limit: uint64,
    capacity: uint64,
) -> uint64:
    """Store and reload detached scalar relation metadata in one arena."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        metadata = workspace.records(RelationMetadata, capacity)
        checksum: uint64 = 0
        for index in range(capacity):
            metadata[index] = RelationMetadata(index, index * 3)
        for index in range(capacity):
            entry = metadata[index]
            checksum += entry.witness_index + entry.provenance_index
        return checksum + len(metadata)


@native
def live_arena_record_default(
    memory_limit: uint64,
    temporary_limit: uint64,
) -> uint64:
    """Expose deterministic zero initialization and complete-record copies."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        metadata = workspace.records(RelationMetadata, 2)
        initial = metadata[1]
        metadata[0] = RelationMetadata(5, 7)
        copied = metadata[0]
        return (
            initial.witness_index
            + initial.provenance_index
            + copied.witness_index
            + copied.provenance_index
        )


@native
def live_arena_record_probe(
    memory_limit: uint64,
    temporary_limit: uint64,
    index: uint64,
) -> uint64:
    """Exercise checked record-vector indexing on every generated target."""
    with NativeExactArena(memory_limit, temporary_limit) as workspace:
        metadata = workspace.records(RelationMetadata, 2)
        metadata[index] = RelationMetadata(11, 13)
        return metadata[index].witness_index + metadata[index].provenance_index
