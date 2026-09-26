"""PARI 2.17.4 `buch2.c:bad_subFB`, from factor-base group metadata.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The upstream clone bit marks a group containing all prime divisors of p;
it is mathematical metadata here, not an instruction to clone storage.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_bad_subfactor_ideal(
    ideal_index: int, group_offset: int, group_size: int, complete_group: bool
) -> bool:
    """Translate `isclone(LP) && t == F->iLP[p] + lg(LP)-1`.

    `ideal_index` is the one-based active ideal index. `group_offset` is
    `F->iLP[p]`, the number of active ideals preceding its group, and
    `group_size` is `lg(LP)-1`. The complete flag comes from FBgen, which
    sets it precisely when the group contains all prime divisors of p.
    It must not be inferred merely from the number of selected ideals.
    """
    if (
        group_offset < 0
        or group_size < 1
        or ideal_index <= group_offset
        or ideal_index > group_offset + group_size
    ):
        raise ValueError("invalid active subfactor group")
    return complete_group and ideal_index == group_offset + group_size


@native
def pari_bad_subfactor_flags(
    group_offsets: IntegerBuffer,
    group_sizes: IntegerBuffer,
    complete_groups: IntegerBuffer,
    group_count: int,
    active_count: int,
    flags: IntegerBuffer,
) -> int:
    """Materialize bad_subFB for consecutive active groups, without selection.

    Compact group arrays contain FBgen's active groups in their original
    order. Output index t-1 stores the predicate for upstream index t.
    The first `active_count` flags are replaced; any tail is untouched.
    All metadata is checked before writes. Input/output owners are disjoint.
    This adapter neither chooses a factor base nor computes completeness.
    """
    if group_count < 0 or active_count < 0:
        raise ValueError("invalid subfactor flag dimensions")
    if (
        len(group_offsets) < group_count
        or len(group_sizes) < group_count
        or len(complete_groups) < group_count
        or len(flags) < active_count
    ):
        raise ValueError("short subfactor flag storage")
    end = 0
    for group in range(group_count):
        size = group_sizes[group]
        if (
            group_offsets[group] != end
            or size < 1
            or (complete_groups[group] != 0 and complete_groups[group] != 1)
        ):
            raise ValueError("invalid subfactor group metadata")
        end += size
        if end > active_count:
            raise ValueError("subfactor groups exceed active count")
    if end != active_count:
        raise ValueError("subfactor groups do not cover active count")
    for group in range(group_count):
        offset = group_offsets[group]
        size = group_sizes[group]
        complete = complete_groups[group] == 1
        for position in range(size):
            if pari_bad_subfactor_ideal(offset + position + 1, offset, size, complete):
                flags[offset + position] = 1
            else:
                flags[offset + position] = 0
    return active_count
