# Allocation and temporary-lifetime experiment frontier

The calling-thread PC evidence in `native_sampling_results.md` motivates this
investigation. Preserve the same PARI 2.17.4 arithmetic, candidate order and
termination decisions; no runtime speed conclusion follows from source counts.

## What the current compiler actually does

- `exact-analysis.cjs:storageAnalysis` identifies mutated integer parameters,
  borrowed parameters and nonoverlapping scratch-slot assignments.
- The GMP emitter uses `storage.scratchSlots` and `storage.slots`.
- `tagged-backend.cjs:emitTaggedFunction` instead creates one tagged owner per
  integer local or mutated parameter. Unmodified parameters are already borrowed.
- The six `pari_signed_real_sum` parameters really are rebound: the Python swaps
  both mantissas, precisions and exponents when their exponent order is reversed.
  Their entry copies are not evidence of a missing read-only-parameter analysis.
- Tagged small values initialize without GMP allocation; promoted big values
  retain capacity within an owner, and its final cleanup releases that capacity.

## Safe optimization boundaries

Existing scratch-slot liveness is a candidate for tagged reuse, but must not be
applied mechanically. The word-to-tagged promotion block currently restores all
locals. With shared slots, restoring a dead local could overwrite a live local
before resumption. A general implementation needs per-resume liveness, including
loop-carried values, failing-operation operands and short-circuit state.

A bounded initial slot experiment could cover only functions without promotion
resumption, leaving the others unchanged. Initialize and clear each physical
slot once. Keep borrowed parameters outside cleanup and preserve simultaneous
call/tuple inputs and outputs. Such a subset is a runtime experiment, not a
replacement for the overall prepared-field class-group objective.

Another possible route is compiler-managed reusable arithmetic storage across
helper calls. Existing `NativeExactArena` must be audited first: its ownership
guards are essential, and an arena reset must not invalidate returned values or
caller-owned resources. Do not change GMP's global allocator hooks around a
single call without proving allocator-domain and lifetime safety.

The current arena audit identifies three additional constraints. Packed external
IntegerBuffer/Float64Buffer owners are not the forbidden foreign-resource case,
but their writes prevent transparent retry on exhaustion. An arena wrapper uses
the GMP workspace bridge, so compare GMP against GMP-plus-arena, not tagged
against GMP-plus-arena. Finally, the allocator is bump-only until the enclosing
checkpoint exits: `free` records traffic but does not reclaim individual spans.
It is not yet equivalent to PARI's frequently restored stack pointer.

The existing virtual reservation policy multiplies base capacity by 256, capped
at 64 GiB. An 8 MiB temporary slab therefore reserves 2 GiB of address space;
16 MiB reserves 4 GiB before the process's other mappings. That matters under
the unchanged 4 GiB address-space cap. Allocation counts must inform any arena
trial; do not raise the cap or mistake resident-child budget for total memory.

## Measurement before optimization

Count allocator calls and requested bytes in precisely the prepared invocation,
separately from compilation, input setup/reset and output checking. Include GMP
allocations even when GMP is statically linked into the kernel addon. Require
known-count controls and thread isolation; preserve original allocation behavior.
Requested allocation bytes are not peak live bytes and realloc traffic is not
net memory growth. Report instrumentation overhead separately, not as a new
paired speed measurement. Repeat the corresponding pinned PARI boundary before
claiming its hot path is allocation-free.

## Required regression cases

Disjoint big temporaries; overflow after slot reuse; promotion in loops and
conditions; nested calls and tuple swaps; repeated arguments; early returns;
exceptions after big-to-small transitions; mixed Float64 helpers; and exact
PARI cancellation/rounding controls. Preserve caller values, avoid double clear,
and verify generated source provenance and all existing isolation limits.

Status: reviewed design observations only. No allocator/runtime change has
been implemented by this checkpoint, and no improvement over the approximately
35x prepared-path gap is claimed.
