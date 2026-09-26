# Phase 2: validated virtual fixed `uint64` views

## Conclusion

Virtualizing the eleven fixed `uint64` subviews is correct, but it does not
make the prime-degree catalog faster. The candidate removes every generated
buffer-descriptor declaration and construction site targeted by this phase,
yet two independent same-tip measurements put it between 0.28% and 0.57%
slower than Stage D. The linked object has exactly the same text size and the
same eleven surviving private functions.

This is useful negative evidence. GCC had already scalarized the materialized
descriptors. A subsequent proof should remove work that remains in the machine
code--especially view validations, per-access bounds checks, or private-call
status handling--rather than merely representing the same fixed views without
local structs.

## Immutable identities

The compiler candidate is commit
`2d22ea208d7b1eaf6a77c17c2b495d7b1757f741` on
`agent/virtual-u64-fixed-views`. Its new capability is
`virtual-fixed-uint64-views`.

The experiment uses this exact fixture file and its raw-byte digest:

```text
/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
sha256 f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
```

This identity matters. The unrelated fixture
`/tmp/sagejs-analytic-invhr-d88QqB/fixtures.json` currently has the previously
reported `c9ee...` digest. An older prime-degree fixture also has identical
input packets but different expected post-call snapshots. Neither is a valid
substitute for this comparison.

Both builds use the frozen baseline directory
`/tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented`. The Stage-E
driver was added in experiment commit `c4c66c8bc`; it retains Stage A and Stage
D unchanged and adds only `virtual-fixed-uint64-views` to the three Stage-D
capabilities:

```text
int64-arithmetic
direct-buffer-access
verified-span-access
virtual-fixed-uint64-views
```

The compiler worktree was clean when both outputs were built. The driver also
normalizes the compiler include path in the copied binding so this frozen
baseline remains rebuildable after its original temporary compiler directory
is gone.

## Reproduction

From the experiment worktree, build same-tip control and candidate outputs:

```bash
node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views \
  stage-d

node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views \
  stage-e
```

The builds measured here were:

```text
Stage D  /tmp/sagejs-stage-a-catalog-WU8F3m
Stage E  /tmp/sagejs-stage-a-catalog-aFllaE
```

Run the independent benchmark harness from experiment commit `a5fb2e843`:

```bash
node bench/pari-class-group-port/benchmark_virtualized_fixed_views.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-WU8F3m \
  /tmp/sagejs-stage-a-catalog-aFllaE \
  /tmp/sagejs-stage-a-catalog-WU8F3m
```

The third build argument is the materialized reference. It intentionally names
the Stage-D output in this same-tip comparison.

## Correctness

The independent harness checked all four frozen packets under each of the
JavaScript, GMP, and tagged backends: 12 successful executions in total. It
compared the returned value and every post-call buffer. All 7,081 active
outputs agreed, and the tagged executions agreed with the frozen oracle.

It separately checked nine malformed packets under all three backends: 27
executions. Return codes or exception type and message, as applicable, and all
post-call buffers agreed. The cases were short state, bad degree, short
coefficients, short primes, short word workspace, short output, nonmonic
polynomial, invalid prime, and oversized prime.

## Static census

The following counts are in the generated private graph:

| Site | Stage D | Stage E | Removed |
| --- | ---: | ---: | ---: |
| View-validation failures | 11 | 11 | 0 |
| `UInt64` buffer-descriptor locals | 22 | 0 | 22 |
| View data assignments | 11 | 0 | 11 |
| View length assignments | 11 | 0 | 11 |
| View offset adjustments | 11 | 0 | 11 |
| Signed buffer-index calls | 67 | 67 | 0 |
| `UInt64` bounds failures | 68 | 68 | 0 |
| `Int64` bounds failures | 0 | 0 | 0 |
| Checked `int64` arithmetic sites | 275 | 275 | 0 |

Thus the capability did exactly what it claimed at the generated-C level, but
did not prove away validation or element bounds checks.

## Artifact sizes and symbols

| Artifact | Stage D | Stage E | Delta |
| --- | ---: | ---: | ---: |
| Generated core source | 6,307,459 B | 6,305,446 B | -2,013 B |
| Private core source | 1,357,783 B | 1,355,770 B | -2,013 B |
| Adapter source | 161,062 B | 161,062 B | 0 B |
| Relocatable object text | 212,853 B | 212,853 B | 0 B |
| Linked addon | 354,880 B | 354,880 B | 0 B |
| Linked ELF text | 347,495 B | 347,495 B | 0 B |

The generated-core digests are
`9ee37b3c0cb15c0be6a7ea0b5ef07e9cc6f9a06ec9b80057f4bd3b1947c9169f`
for Stage D and
`04923fbaef0dd5f2b67aedbd3d016ef2c54e26d0ebaab65032224955f1804853`
for Stage E.

`nm -S --size-sort` reports the same eleven surviving
`tagged_sagejs_checked_r0_*` private symbols with identical sizes in both
objects:

```text
int64_pari_flx_div
int64_pari_flxq_mul
int64_pari_flx_sub.constprop.0
int64_pari_flx_copy
int64_pari_flx_normalize
int64_pari_flxq_sqr.constprop.0
_int64_pari_flx_divrem
int64_pari_flx_mul.constprop.0
int64_pari_flx_gcd
int64_pari_flx_small_ddf.constprop.0
int64_pari_flx_small_degfact.constprop.0
```

The census command was:

```bash
nm -S --size-sort \
  BUILD/build/Release/obj.target/sagejs_native_kernel/kernel.o \
  | rg 'tagged_sagejs_checked_r0'
```

## Timing

The timed boundary is tagged frozen packet zero. Packing, build work, and
assertions are excluded. Each process performed three warmup rounds followed
by seven alternating pairs, targeting 1,200 ms per batch and retaining only
batches of at least 900 ms.

| Run | Stage D geometric mean | Stage E geometric mean | E / D |
| --- | ---: | ---: | ---: |
| 1 | 2.180886 ms | 2.186971 ms | 1.002790 |
| 2, fresh process | 2.171750 ms | 2.184092 ms | 1.005683 |

Both runs are neutral to slightly slower. They provide no evidence of a
runtime improvement from virtualizing the descriptor structs.

## Disassembly

The complete relocatable-object disassemblies were compared with:

```bash
objdump -dr STAGE_D/build/Release/obj.target/sagejs_native_kernel/kernel.o \
  > /tmp/phase2-d-objdump.txt
objdump -dr STAGE_E/build/Release/obj.target/sagejs_native_kernel/kernel.o \
  > /tmp/phase2-e-objdump.txt
diff -u /tmp/phase2-d-objdump.txt /tmp/phase2-e-objdump.txt
```

Ignoring the input filename and generated constant-pool symbol numbering, the
diff contains only two substantive basic-block changes. One reverses the order
of two equivalent validation comparisons in `int64_pari_flx_copy`; the other
uses the opposite base register for an equivalent address-range expression in
`_int64_pari_flx_divrem`. There is no descriptor setup left to remove from the
linked machine code. This explains both the identical text sizes and the
neutral timing result: GCC already performed the desired scalar replacement.

## Next implication

Do not broaden `virtual-fixed-uint64-views` as a performance campaign on this
evidence alone. It is a valid generated-source simplification, but it does not
close the measured gap.

The next bounded experiment should change machine work that survived Stage E.
The most direct candidates, in order, are:

1. propagate each validated view's span far enough to remove its retained
   private view validation and element bounds checks;
2. eliminate repeated status/error ABI handling across proven private calls;
3. target one of the eleven surviving uninlined private functions under an
   explicit, local inlining budget.

Each should retain the same public checked path, frozen fixture, malformed
matrix, alternating timing protocol, and same-tip capability-off control.
