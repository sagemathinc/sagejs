"""Bounded packed permutation-group center computation.

The ordinary Python body is both the exact dynamic oracle and the source
lowered by `@native`.  Permutations use one-based images in row-major packed
storage, matching `src/baselib/groups.py`.  The kernel enumerates the exact
generator closure in the public breadth-first order and tests centrality
against the generators, which is equivalent to testing against the generated
group.

All allocation belongs to the caller.  The finite `element_capacity` and
`max_work` values bound closure growth and all permutation-coordinate work.
The status buffer contains `(status, element_count, center_count, work)` where
status is 0 for success, 1 for an invalid ABI/input, 2 for the work bound, and
3 for the element-capacity bound.  Partial output on a nonzero status is
private scratch; the public adapter discards it and runs the exact fallback.
"""

from __future__ import annotations

from sagejs.native import UInt64Buffer, native, uint64


@native
def packed_permutation_center(
    elements: UInt64Buffer,
    center_indices: UInt64Buffer,
    generators: UInt64Buffer,
    hash_table: UInt64Buffer,
    result_status: UInt64Buffer,
    degree: uint64,
    generator_count: uint64,
    element_capacity: uint64,
    max_work: uint64,
) -> uint64:
    """Enumerate a bounded closure and write its exact center indices.

    The reviewed production slice accepts degree at most 8, at most 4
    generators, at most 40320 elements, and at most 12000000 coordinate
    operations.  `hash_table` must have at least twice `element_capacity`
    entries so open addressing always finds an empty slot before capacity is
    exhausted.
    """
    zero: uint64 = 0
    one: uint64 = 1
    two: uint64 = 2
    three: uint64 = 3
    if len(result_status) != 4:
        return one
    result_status[0] = 1
    result_status[1] = 0
    result_status[2] = 0
    result_status[3] = 0
    if degree == 0 or degree > 8:
        return one
    if generator_count == 0 or generator_count > 4:
        return one
    if element_capacity == 0 or element_capacity > 40320:
        return one
    if max_work == 0 or max_work > 12000000:
        return one
    if len(generators) != degree * generator_count:
        return one
    if len(elements) != degree * element_capacity:
        return one
    if len(center_indices) != element_capacity:
        return one
    if len(hash_table) < 2 * element_capacity:
        return one

    work: uint64 = zero
    generator_index: uint64 = zero
    valid: uint64 = one
    while generator_index < generator_count and valid != 0:
        point: uint64 = zero
        while point < degree and valid != 0:
            image = generators[generator_index * degree + point]
            work = work + one
            if image == 0 or image > degree:
                valid = zero
            previous: uint64 = zero
            while previous < point and valid != 0:
                work = work + one
                if generators[generator_index * degree + previous] == image:
                    valid = zero
                previous = previous + one
            point = point + one
        generator_index = generator_index + one
    if valid == zero:
        result_status[3] = work
        return one

    hash_slots = len(hash_table)
    slot: uint64 = zero
    while slot < hash_slots:
        hash_table[slot] = 0
        slot = slot + one

    point = zero
    identity_hash: uint64 = zero
    while point < degree:
        image = point + one
        elements[point] = image
        identity_hash = (identity_hash * 17 + image) % hash_slots
        point = point + one
    hash_table[identity_hash] = one

    element_count: uint64 = one
    cursor: uint64 = zero
    while cursor < element_count:
        generator_index = zero
        while generator_index < generator_count:
            candidate_hash: uint64 = zero
            point = zero
            while point < degree:
                if work >= max_work:
                    result_status[0] = two
                    result_status[1] = element_count
                    result_status[3] = work
                    return two
                generator_image = generators[generator_index * degree + point]
                image = elements[cursor * degree + generator_image - one]
                candidate_hash = (candidate_hash * 17 + image) % hash_slots
                work = work + one
                point = point + one

            slot = candidate_hash
            found: uint64 = zero
            searching: uint64 = one
            while searching != 0:
                stored = hash_table[slot]
                if stored == zero:
                    searching = zero
                else:
                    stored_index = stored - one
                    equal: uint64 = one
                    point = zero
                    while point < degree and equal != 0:
                        if work >= max_work:
                            result_status[0] = two
                            result_status[1] = element_count
                            result_status[3] = work
                            return two
                        generator_image = generators[generator_index * degree + point]
                        image = elements[cursor * degree + generator_image - one]
                        if elements[stored_index * degree + point] != image:
                            equal = zero
                        work = work + one
                        point = point + one
                    if equal != 0:
                        found = one
                        searching = zero
                    else:
                        slot = (slot + one) % hash_slots

            if found == zero:
                if element_count >= element_capacity:
                    result_status[0] = three
                    result_status[1] = element_count
                    result_status[3] = work
                    return three
                point = zero
                while point < degree:
                    generator_image = generators[generator_index * degree + point]
                    elements[element_count * degree + point] = elements[
                        cursor * degree + generator_image - one
                    ]
                    point = point + one
                hash_table[slot] = element_count + one
                element_count = element_count + one
            generator_index = generator_index + one
        cursor = cursor + one

    center_count: uint64 = zero
    element_index: uint64 = zero
    while element_index < element_count:
        central: uint64 = one
        generator_index = zero
        while generator_index < generator_count and central != 0:
            point = zero
            while point < degree and central != 0:
                if work >= max_work:
                    result_status[0] = two
                    result_status[1] = element_count
                    result_status[2] = center_count
                    result_status[3] = work
                    return two
                generator_image = generators[generator_index * degree + point]
                element_image = elements[element_index * degree + point]
                left = elements[element_index * degree + generator_image - one]
                right = generators[generator_index * degree + element_image - one]
                if left != right:
                    central = zero
                work = work + one
                point = point + one
            generator_index = generator_index + one
        if central != 0:
            center_indices[center_count] = element_index
            center_count = center_count + one
        element_index = element_index + one

    result_status[0] = zero
    result_status[1] = element_count
    result_status[2] = center_count
    result_status[3] = work
    return zero


__all__ = ["packed_permutation_center"]
