"""Generic resident rank-four lattice canonicalization and classification.

This witness deliberately knows nothing about Brandt modules or quaternion
ideals.  It accepts detached rank-four integral bases plus independently
expected HNF fingerprints, keeps FLINT matrices and classification state live
inside one exact arena, and publishes only after every fingerprint and bounded
classification operation succeeds.
"""

from sagejs.ffi.flint import (
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_hnf_transform,
    fmpz_matrix_set_entry,
)
from sagejs.native import (
    IntegerBuffer,
    NativeExactArena,
    NativeRecord,
    UInt64Buffer,
    native,
    uint64,
)


class RankFourHnfKey(NativeRecord):
    e00: uint64
    e01: uint64
    e02: uint64
    e03: uint64
    e10: uint64
    e11: uint64
    e12: uint64
    e13: uint64
    e20: uint64
    e21: uint64
    e22: uint64
    e23: uint64
    e30: uint64
    e31: uint64
    e32: uint64
    e33: uint64


class RankFourClassification(NativeRecord):
    source_index: uint64
    class_index: uint64


@native
def rank_four_lattice_workspace(
    bases: IntegerBuffer,
    expected_hnfs: UInt64Buffer,
    published_hnfs: UInt64Buffer,
    published_classes: UInt64Buffer,
    published_incidence: UInt64Buffer,
    lattice_count: uint64,
    class_capacity: uint64,
    maximum_bits: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    """Canonicalize and classify detached rank-four bases transactionally."""
    entry_count = lattice_count * 16
    incidence_count = lattice_count * class_capacity
    if lattice_count == 0 or class_capacity == 0:
        return -1
    if maximum_bits == 0 or maximum_bits > 64:
        return -1
    if class_capacity > lattice_count:
        return -1
    if len(bases) != entry_count or len(expected_hnfs) != entry_count:
        return -1
    if len(published_hnfs) != entry_count:
        return -1
    if len(published_classes) != lattice_count:
        return -1
    if len(published_incidence) != incidence_count:
        return -1

    with NativeExactArena(memory_limit, temporary_limit) as arena:
        dimension: uint64 = 4
        source = arena.foreign_resource(fmpz_matrix, dimension, dimension)
        hnf = arena.foreign_resource(fmpz_matrix, dimension, dimension)
        transform = arena.foreign_resource(fmpz_matrix, dimension, dimension)
        canonical = arena.integer_matrix(lattice_count, 16, maximum_bits)
        classifications = arena.records(RankFourClassification, lattice_count)
        classes = arena.bounded_map(RankFourHnfKey, uint64, class_capacity)
        incidence = arena.sparse_integer_rows(
            lattice_count,
            class_capacity,
            lattice_count,
            1,
        )
        class_count: uint64 = 0

        for lattice_index in range(lattice_count):
            base_offset = lattice_index * 16
            for row in range(dimension):
                for column in range(dimension):
                    entry = row * dimension + column
                    if not fmpz_matrix_set_entry(
                        source,
                        row,
                        column,
                        bases[base_offset + entry],
                    ):
                        return -1
            if not fmpz_matrix_hnf_transform(hnf, transform, source):
                return -1
            for row in range(dimension):
                for column in range(dimension):
                    entry = row * dimension + column
                    value = fmpz_matrix_entry(hnf, row, column)
                    if value != expected_hnfs[base_offset + entry]:
                        return 0
                    canonical[lattice_index, entry] = value

            key = RankFourHnfKey(
                expected_hnfs[base_offset],
                expected_hnfs[base_offset + 1],
                expected_hnfs[base_offset + 2],
                expected_hnfs[base_offset + 3],
                expected_hnfs[base_offset + 4],
                expected_hnfs[base_offset + 5],
                expected_hnfs[base_offset + 6],
                expected_hnfs[base_offset + 7],
                expected_hnfs[base_offset + 8],
                expected_hnfs[base_offset + 9],
                expected_hnfs[base_offset + 10],
                expected_hnfs[base_offset + 11],
                expected_hnfs[base_offset + 12],
                expected_hnfs[base_offset + 13],
                expected_hnfs[base_offset + 14],
                expected_hnfs[base_offset + 15],
            )
            if classes.contains(key):
                class_index = classes.get(key, 0)
            else:
                class_index = class_count
                if not classes.insert(key, class_index):
                    return -1
                class_count = class_count + 1
            classifications[lattice_index] = RankFourClassification(
                lattice_index,
                class_index,
            )
            incidence.append(lattice_index, class_index, 1)

        # Validate the complete resident result before the first public write.
        for lattice_index in range(lattice_count):
            metadata = classifications[lattice_index]
            if metadata.source_index != lattice_index:  # type: ignore[attr-defined]
                return 0
            if metadata.class_index >= class_count:  # type: ignore[attr-defined]
                return 0
            for publish_entry in range(dimension * dimension):
                output_index = lattice_index * 16 + publish_entry
                if (
                    canonical[lattice_index, publish_entry]
                    != expected_hnfs[output_index]
                ):
                    return 0
            for class_index in range(class_capacity):
                incidence_value = incidence.get(
                    lattice_index,
                    class_index,
                    0,
                )
                expected_incidence: uint64 = 0
                if class_index == metadata.class_index:  # type: ignore[attr-defined]
                    expected_incidence = 1
                if incidence_value != expected_incidence:
                    return 0

        # Every remaining operation is a bounded write into preflighted output.
        for lattice_index in range(lattice_count):
            metadata = classifications[lattice_index]
            published_classes[lattice_index] = metadata.class_index  # type: ignore[attr-defined]
            for publish_entry in range(dimension * dimension):
                output_index = lattice_index * 16 + publish_entry
                published_hnfs[output_index] = expected_hnfs[output_index]
            for class_index in range(class_capacity):
                incidence_index = lattice_index * class_capacity + class_index
                expected_incidence: uint64 = 0
                if class_index == metadata.class_index:  # type: ignore[attr-defined]
                    expected_incidence = 1
                published_incidence[incidence_index] = expected_incidence
        return class_count
    return -1


__all__ = ["rank_four_lattice_workspace"]
