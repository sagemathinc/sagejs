# Stage G1: direct-result private copy edge

## Result

Stage G1 proves that the compiler can replace three proved private calls to
`int64_pari_flx_copy` with one genuine scalar-returning machine core. The core
has no status or output-result ABI, preserves the public checked copy path, and
passes the entire frozen semantic matrix.

This particular whole-program shape is nevertheless **rejected**. It fails two
machine gates frozen in
[`direct_result_private_edge_protocol.md`](./direct_result_private_edge_protocol.md):

- object and linked-addon call instructions increase by 13; and
- copy-related text relocations increase from 68 to 77.

The acceptance timing campaign was therefore not run. Incidental timings made
inside the build driver are diagnostic construction checks and are excluded
from this result.

The permanent numeric record is
[`stage_g1_direct_result_evidence.json`](./stage_g1_direct_result_evidence.json).

## Exact inputs

The three arms were rebuilt from the same clean compiler checkout:

```text
compiler worktree  /home/user/sagejs-worktrees/virtual-u64-fixed-views
compiler commit    35a1acbfd4be784e555267adc3520a1cb86509d0
compiler status    clean
fixture            /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
fixture sha256     f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
baseline build     /tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented
```

All arms used `-O3 -fPIC -Wall -Wextra -ffunction-sections
-fdata-sections`, linked with `--gc-sections`, and emitted the identical
`binding.gyp` SHA-256
`9521eb22d6b3f5d293115c36606daebd91f7c953e5f11c9a63ecd3bf08893c43`.

The build commands were:

```bash
node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views stage-d \
  > /tmp/direct-stage-d2-35a1acbfd.json

node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views stage-e \
  > /tmp/direct-stage-e2-35a1acbfd.json

node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views stage-g \
  > /tmp/direct-stage-g-35a1acbfd.json
```

The resulting directories and core identities were:

| arm | directory | generated-core SHA-256 |
|---|---|---|
| Stage D | `/tmp/sagejs-stage-a-catalog-HD0RF6` | `9ee37b3c0cb15c0be6a7ea0b5ef07e9cc6f9a06ec9b80057f4bd3b1947c9169f` |
| Stage E | `/tmp/sagejs-stage-a-catalog-SBxCj2` | `04923fbaef0dd5f2b67aedbd3d016ef2c54e26d0ebaab65032224955f1804853` |
| Stage G1 | `/tmp/sagejs-stage-a-catalog-OLBXHS` | `502a705a6bb85a8f77e4bd8606c04c3ab58dc4d5e5819f89a6888d7b90453698` |

## Semantic gates

The independent harness now has a `--validate-only` mode so correctness can be
established before spending or accidentally reporting a timing campaign:

```bash
node bench/pari-class-group-port/benchmark_virtualized_fixed_views.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-SBxCj2 \
  /tmp/sagejs-stage-a-catalog-OLBXHS \
  --validate-only \
  > /tmp/direct-result-validation-35a1acbfd.json
```

It passed:

- 12 valid comparisons: four packets through JavaScript, GMP, and tagged
  entry paths;
- 27 malformed comparisons: nine malformed packets through all three entry
  paths, including outcome and every post-call buffer; and
- 45 public-copy comparisons: 15 degree, bounds, exact-overlap,
  left-overlap, right-overlap, and disjoint cases through all three public
  backends.

The packet-zero tagged oracle still covers all 7,081 active outputs. The
ordinary public `int64_pari_flx_copy` remains checked and host-callable; the
new direct core is private.

## IR and generated-C shape

The reconstructed preparation contains 37 variants: the original 36-member
private graph plus one direct-result leaf. Exactly three operations in
`int64_pari_flxq_powu` call it. Each operation is backed by the local
`da in [-1, 8]` guard and five authenticated virtual-view range proofs.

The generated direct definition is

```text
sagejs_direct_sagejs_checked_r0_int64_pari_flx_copy__local_fast_0
```

It returns `int64_t` directly, takes the buffer and scalar arguments, and has
no status argument, output-result pointer, failure label, view validation,
index failure, or signed-index helper. Its source retains the three checked
range-latch increments required by the corrected proof policy. GCC specializes
the one surviving machine symbol to 57 bytes with no calls:

```text
sagejs_direct_sagejs_checked_r0_int64_pari_flx_copy__local_fast_0.constprop.0.isra.0
```

There is exactly one 660-byte ordinary checked private-copy machine body and
one 57-byte direct body. There is no second checked clone or guarded dispatch
wrapper. Thus the direct ABI transformation itself is real and compact.

### The 14 descriptor locals are real

Stage E's historical entry-to-native private slice has zero materialized
`sagejs_uint64_buffer` view locals. Stage G1 has 14. Whole-core diffing shows
that this is not an artifact of where the textual slice begins:

- `_int64_pari_flx_divrem` gains eight descriptor locals for four views; and
- `int64_pari_flx_mul` gains six descriptor locals for three views.

The corresponding seven `.data`, seven `.length`, and seven `.data +=`
assignments replace Stage E's scalar virtual data/length representation. The
direct core itself has no descriptor local, and the checked copy body is
unchanged. Local direct-result preparation is therefore perturbing view
virtualization elsewhere in the prepared graph; G2 must preserve Stage E's
global virtualization facts.

## Machine evidence

The static commands were:

```bash
size "$OBJ" "$ADDON"
nm -S --size-sort "$OBJ"
objdump -dr "$OBJ"
objdump -d "$OBJ" | rg -c '\bcall[q]?\s'
objdump -d "$ADDON" | rg -c '\bcall[q]?\s'
objdump -r "$OBJ" | rg 'int64_pari_flx_copy|sagejs_direct_'
```

| measure | Stage E | Stage G1 | delta |
|---|---:|---:|---:|
| generated core | 6,305,446 | 6,323,708 | +18,262 |
| private textual slice | 1,355,770 | 1,373,792 | +18,022 |
| object bytes | 346,832 | 345,848 | -984 |
| object text | 212,853 | 211,250 | -1,603 |
| linked ELF text | 347,495 | 345,895 | -1,600 |
| addon bytes | 354,880 | 354,880 | 0 |
| object call instructions | 1,771 | 1,784 | **+13** |
| addon call instructions | 1,850 | 1,863 | **+13** |
| checked-private-copy text relocations | 23 | 7 | -16 |
| direct-copy text relocations | 0 | 2 | +2 |
| ordinary-tagged-copy text relocations | 45 | 68 | +23 |
| all copy text relocations | 68 | 77 | **+9** |

The 13 extra object calls are fully localized:

| surviving checked-region function | Stage E | Stage G1 | delta |
|---|---:|---:|---:|
| `flx_gcd` | 0 | 4 | +4 |
| `flx_normalize` | 0 | 2 | +2 |
| `_flx_divrem` | 0 | 2 | +2 |
| `flx_small_ddf` | 39 | 40 | +1 |
| `flxq_mul` | 3 | 4 | +1 |
| `flx_mul` | 23 | 24 | +1 |
| `flxq_sqr` | 15 | 16 | +1 |
| `flx_small_degfact` | 11 | 12 | +1 |

This is a GCC IPA/code-shape effect rather than cost inside the 57-byte direct
leaf: the leaf has no machine calls. Stage G1 changes enough surrounding C to
make GCC retain calls that Stage E inlined, even while total text shrinks.

## Gate decision and next experiment

Stage G1 passes semantic replay, emits the intended direct ABI, reduces
checked-private-copy relocations, and reduces object and ELF text. It fails the
predeclared total-copy-relocation and total-call gates. No acceptance timing
was run, so this report makes no Stage-G1 performance claim and does not compare
it to the historical 1.39 ms mechanical-C ceiling or 2.03 ms PARI control.

The next experiment should keep the narrow direct-result mechanism but restore
Stage E's seven virtual views and recover the eight affected inlining choices.
That calls for targeted private-graph code-shape/inlining control, not a global
optimization flag change. Only a same-tip G2 that passes these static gates
should enter the two-process, 14-pair timing protocol.
