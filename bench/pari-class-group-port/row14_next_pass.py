"""Narrow resident control edge between row-14 HNF checkpoints."""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .collector_next_pass import pari_prepare_next_small_norm_pass
from .prepared_class_group_resumable import _pari_prepare_relation_search


@native
def pari_row14_prepare_next_pass(
    permutation: Int64Buffer,
    rows: int,
    h_rows: int,
    need: int,
    squash_index: int,
    search_ideals: IntegerBuffer,
    outer_permutation: IntegerBuffer,
    automorphism_count: int,
    outer: Int64Buffer,
    cache: IntegerBuffer,
    schedule: Int64Buffer,
    log_completed: IntegerBuffer,
    control: Int64Buffer,
) -> int:
    """Prepare the exact source search list and next small-norm pass."""
    if len(control) < 3:
        raise ValueError("short row-14 next-pass control")
    search_count, next_squash = _pari_prepare_relation_search(
        permutation,
        rows,
        h_rows,
        need,
        squash_index,
        search_ideals,
        outer_permutation,
    )
    status = pari_prepare_next_small_norm_pass(
        need,
        int(outer[14]),
        int(outer[15]),
        h_rows,
        automorphism_count,
        outer,
        cache,
        schedule,
        log_completed,
    )
    control[0] = search_count
    control[1] = next_squash
    control[2] = status
    return status


__all__ = ["pari_row14_prepare_next_pass"]
