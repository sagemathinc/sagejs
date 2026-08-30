"""Reusable resident exact-workspace witness for Native Kernel C5b."""

from typing import Tuple

from sagejs.ffi.flint import (
    NativeExactWorkspace,
    native_exact_workspace,
    native_exact_workspace_borrow,
    native_exact_workspace_borrow_addmul,
    native_exact_workspace_borrow_entry,
    native_exact_workspace_borrow_generation,
    native_exact_workspace_borrow_set,
    native_exact_workspace_borrow_submul,
    native_exact_workspace_borrow_swap,
    native_exact_workspace_generation,
    native_exact_workspace_reset,
)
from sagejs.native import NativeExactArena, native, uint64


@native
def create_relation_workspace(
    capacity: uint64,
    maximum_bits: uint64,
    memory_limit: uint64,
    specification_high: uint64,
    specification_low: uint64,
) -> NativeExactWorkspace:
    """Create one context-owned workspace with authenticated fixed shape."""
    return native_exact_workspace(
        capacity,
        maximum_bits,
        memory_limit,
        specification_high,
        specification_low,
    )


@native
def accumulate_relation_workspace(
    workspace: NativeExactWorkspace,
    expected_generation: uint64,
    specification_high: uint64,
    specification_low: uint64,
    first: int,
    second: int,
    rounds: uint64,
    arena_memory_limit: uint64,
    temporary_limit: uint64,
) -> Tuple[int, int, uint64]:
    """Mutate private resident state during one authenticated lexical borrow."""
    with NativeExactArena(arena_memory_limit, temporary_limit) as arena:
        borrow = arena.foreign_resource(
            native_exact_workspace_borrow,
            workspace,
            expected_generation,
            specification_high,
            specification_low,
        )
        native_exact_workspace_borrow_set(borrow, 0, first)
        native_exact_workspace_borrow_set(borrow, 1, second)
        for index in range(rounds):
            native_exact_workspace_borrow_addmul(borrow, 0, second, index)
            native_exact_workspace_borrow_submul(borrow, 1, first, index)
        native_exact_workspace_borrow_swap(borrow, 0, 1)
        result_first = native_exact_workspace_borrow_entry(borrow, 0)
        result_second = native_exact_workspace_borrow_entry(borrow, 1)
        generation = native_exact_workspace_borrow_generation(borrow)
        return result_first, result_second, generation


@native
def reset_relation_workspace(
    workspace: NativeExactWorkspace,
    expected_generation: uint64,
    specification_high: uint64,
    specification_low: uint64,
) -> uint64:
    """Reset private acceleration state and publish only its new generation."""
    native_exact_workspace_reset(
        workspace,
        expected_generation,
        specification_high,
        specification_low,
    )
    return native_exact_workspace_generation(workspace)
