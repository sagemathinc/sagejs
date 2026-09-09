# Reusing freed exact-checkpoint blocks

Status: compiler implementation under qualification, not release-ready.
The mathematical Python source and declared arena limits are unchanged.

## Motivation and evidence

In the complex-cubic `volume16` experiment, two 16-factor fields exhaust the
3 MiB temporary arena. Instrumenting GMP allocation lifetimes gives:

| Field | Accumulated checkpoint bytes | Peak live block bytes |
| --- | ---: | ---: |
| `3.1.16355768.1` | 6,011,392 | 303,264 |
| `3.1.16912280.1` | 9,585,440 | 370,960 |

The previous free hook counts a free but does not recycle its block. Much of
the checkpoint's storage is therefore dead allocation traffic. Backtraces
locate the first overflow in fifth-root unit saturation and dependency-unit
coordinate multiplication. These measurements come from disposable
instrumentation, not a timed or publicly certified artifact.

Recycling removes the exceptions in a generated-core experiment. It does not
make the underlying incomplete mathematical certificates complete: both
fields still decline. The first-effort survey remains 979/1012 successes,
with correct accepted class numbers/invariants and all 64 output words
unchanged on the original 1,010 nonexceptional cases. This has now also been
repeated using the canonical compiler with its corrected fingerprint, not
only the edited generated-core experiment. All 256 affected-regime fields
agree on acceptance and all 64 output words across fmpz, GMP, and JavaScript.
This is same-source differential evidence, not independent certificate replay.

The final artifact has source hash
`d3e32776889299c5a89125007414eedb410ed08a91e4c6090dda3ba86711a16d`,
core hash `4ddb949ec0c84adfd10843de62c634f39e03569f97b3aae8875ad858ff6dcd36`,
and cache key `fa927a259e9b40c29788d58ff324f0835bfd04a0122f3bd2daaba439d00e4260`.

## Storage contract

Allocation rounds the header plus payload to a power-of-two span and assigns
it to a size-class bin. A checkpoint owns a fixed array of free-list heads;
heads and links are one-based offsets into its existing stable reservation.
Zero denotes the empty list. No free-list nodes are separately allocated.

Only GMP's explicit free and the obsolete block of a moving GMP realloc make
a block reusable. Its former requested-length word becomes the next offset;
that metadata is no longer live once the caller releases the allocation.
Taking a block from a bin restores its requested length. The header size is
unchanged. Bin operations preserve the block span and alignment.

Realloc preserves the original prefix. A request that fits the current span
retains the block. A growing last block can extend in place, subject to the
same reservation and soft-limit checks. Otherwise it allocates a new block,
copies the minimum of the old requested length and new requested length,
and only then recycles the old block. No live buffer moves without the caller
performing realloc and receiving its new address.

The owning checkpoint is found by allocator provenance, not inferred from the
currently active checkpoint. Internal nested-checkpoint tests exercise frees
of an outer allocation while an inner checkpoint is active. This does **not**
relax the compiler's independent prohibition of nested mathematical arenas.
Suspended allocations remain upstream-owned. Checkpoint begin zeroes all bin
heads; no offset survives the reservation's final unmap.

Soft-limit exhaustion remains sticky. Reusing a block cannot clear a previous
violation or make that attempt eligible for publication. Upstream overflow
and recommended retry shifts retain their separate accounting. The allocator
does not raise the caller's capacity or add a new retry policy.

### Argument to review

Under the GMP allocation contract (no use-after-free, invalid realloc, or
double free), each owned block is either live or appears in exactly one bin.
Allocation removes one matching free block or appends a disjoint fresh span.
Free moves a live block into its owning bin. Moving realloc preserves the old
contents until the copy completes, then performs the same live-to-free
transition. Induction on these operations gives disjoint live allocations,
valid content prefixes, and no reuse of a live allocation. Existing all-exit
owner cleanup and publication restrictions still govern checkpoint teardown.

This is a systems argument to be reviewed, not a Lean proof. Full normative
architecture integration must explain that the checkpoint now combines
bump allocation with a reusable pool rather than describing every allocation
as monotonic. Power-of-two rounding can increase individual block footprints;
both that tradeoff and per-call overhead require representative benchmarks.

## Cache provenance

The existing compiler fingerprint omitted `gmp-checkpoint-allocator.cjs` even
though its contents are embedded in the isolated core. This allowed different
allocator bodies to receive the same cache key. The compiler now fingerprints
the file, and a focused test evaluates the actual fingerprint function with
only this dependency changed. Earlier diagnostic builds used fresh cache
directories and separately recorded core hashes; their cache-key collision
must not be presented as authenticated compiler equivalence.

## Validation and remaining work

### Controlled allocator timings

On the idle `opt` EPYC host, pinned to CPU 0, the identical `volume16` Python
source was measured with the old and new allocator. The 1,010 fields without
old-allocator exceptions were each run in three rotated rounds, four native
calls per sample, with one untimed warmup and preallocated external scratch.
Both versions use effort five only and the same 1 MiB/3 MiB capacities.
Each sample's final acceptance and all 64 output words are checked.
The two old exceptions are retained as excluded failures, not timed successes.

The sum of per-field median times is 4,106.122 ms with the old bump allocator
and 4,113.093 ms with recycling: **0.17% slower**. The geometric mean ratio is
1.00694. This single pilot does not establish zero regression. PARI `bnfinit`
was also measured, but it completes the computation while 31 of these native
first attempts decline; their totals are not an equal-completion speed claim.
The raw result SHA-256 is
`60f39969952fa62820db24fa8d2d7b6ffda749c51fceea6a2187a66216932afa`.

A separate serial repeat selected four familiar controls and the ten largest
pilot regressions, using nine alternating rounds and 32 calls per sample.
The worst repeated regression is 5.02%, not the pilot's 23.75%. Familiar
class-number-five and class-number-two fields regress 1.19% and 2.94%; the
fourteen-factor field improves 1.09%. This selected diagnostic is not a holdout
or a broad performance guarantee. Size-class calculation and free-list cost
remain optimization targets before claiming no speed loss.

### Rejected fixed-shift size-class experiment

A follow-up replaced the span-rounding and bin-index loops with fixed unsigned
shifts and a binary search. The canonical generated core outside the allocator
was byte-identical to the first recycling build. The 1,012-field survey and
256-field three-backend output comparisons still passed. The experimental
core hash is `e825d231d5a476584c83ceca0783e4612c265013421e885fa2a6d446853424cd`.

It did not improve the same 14-field panel. A direct three-way run, with nine
rotated rounds and 32 calls per sample, measured sums of per-field medians
40.089 ms for the original bump allocator, 40.526 ms for recycling with loops,
and 40.650 ms for fixed-shift recycling. This is a selected diagnostic, not a
universal ordering or statistical significance claim. There is no measured
benefit justifying the replacement, so it was reverted. The independent slow
reference tests remain: all requests below 65,536, both sides of every
power-of-two boundary, overflow, and 100,000 random machine-word requests.
The rejected source and measurements remain in the local evidence bundle.

The new sanitizer witness exercises ten thousand same-size recycle operations,
twenty thousand mixed allocate/reallocate/free operations with content checks,
ten thousand GMP powers, allocator nesting, suspended allocation, sticky
capacity failure, and fresh-checkpoint reset. It processes over 150 MB of
requests below 1 MB high water. The existing scoped/nested/thread-local GMP
allocator test also passes locally.

The related early-checkpoint/lifetime suites initially have nine passes and
two failures. One is a stale 59-child expectation (actual 91), reproduced on
the unchanged parent branch. The other is a missing local FLINT host addon;
after provisioning the matching parent addon, its exact-fallback comparison
passes. Neither issue is concealed by altering the tests. The early-checkpoint
ASan lifecycle witness and nested-arena rejection cases pass.

The fresh broad `test:changed` run completed all eight build stages and the
architecture gate, then failed in the unit tier: 143 files passed before
`test/modular-qexp-source-freeze.cjs` detected a package-graph hash mismatch;
34 files were not started and active siblings were cancelled. The same frozen
hash failure reproduces on the unchanged parent branch. This is a terminal
failed run, not a still-running test or a passing broad qualification.
The follow-up early-checkpoint/nested-arena run has ten passing tests and the
known 91-versus-59 child-count failure, also reproduced on the parent.

Still required before promotion:

- Independent certificate replay and public-path qualification; the canonical
  compiler's first-effort corpus and affected-regime backend checks above pass.
- Resolve the measured small-field overhead and repeat broad controlled
  timings; the existing pilot and longer selected repeat are not a no-regression
  qualification. Include representative non-cubic allocation-heavy kernels.
- Four-platform native qualification, including Windows; the new sanitizer
  executable is Unix-only and explicitly skipped on Windows.
- Review WASI allocation behavior, broader compiler/integration tests, and
  the normative architecture wording.

Local investigation artifacts are retained in the arithmetic lane under
`build/cubic-analytic-schedule-evidence/arena-pressure/`.
