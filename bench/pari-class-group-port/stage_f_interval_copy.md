# Stage F: interval-proved polynomial copy

## Conclusion

The local interval proof for `int64_pari_flx_copy` is correct and removes the
five intended generated element-bounds checks. It does not make the catalog
faster. Two isolated same-tip comparisons put Stage F about 12.6% and 12.8%
slower than Stage E.

The machine-code evidence explains the result. GCC had already optimized the
Stage-E copy into a compact 0x294-byte routine despite the five checks still
being visible in generated C. Stage F changes the compiler's inlining and code
layout: the checked-copy wrapper grows to 0x5e8 bytes, a separate 0x1a5-byte
fast clone survives, object text grows by 5,534 bytes, two additional private
symbols survive, and eight additional call instructions remain. Removing the
source-level checks therefore saves no demonstrated machine work while the
local dispatch and altered inlining cost substantially more.

This rejects the current local-variant shape as a performance optimization. It
does not reject interval proofs generally. A useful next version must fuse the
proof into the existing checked helper without adding a dispatch wrapper or a
second body, and must demonstrate a machine-code reduction before full timing.

## Exact identities

The compiler candidate is clean commit
`670dda5539173ab937a47dffb5c150466b39aa38` on
`agent/virtual-u64-fixed-views`.

The exact fixture is:

```text
/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
sha256 f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
```

The frozen starting build is
`/tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented`. The same compiler
commit rebuilt both comparison arms:

```text
Stage E control     /tmp/sagejs-stage-a-catalog-ag3Jht
Stage F candidate   /tmp/sagejs-stage-a-catalog-2sJXqU
```

The generated-core identities are:

```text
Stage E  04923fbaef0dd5f2b67aedbd3d016ef2c54e26d0ebaab65032224955f1804853
Stage F  fb1d6667be87a3e741b8a43ef36f25944a8c8dc631143c131b81ee8a0e7c4c37
```

## Declaration and static gates

Stage F retains all four Stage-E region capabilities:

```text
int64-arithmetic
direct-buffer-access
verified-span-access
virtual-fixed-uint64-views
```

It adds exactly one local declaration:

```javascript
{
  function: "int64_pari_flx_copy",
  guard: [
    { kind: "int64-range", parameter: "da", minimum: -1, maximum: 8 },
  ],
  capabilities: ["interval-view-access"],
}
```

The driver requires 37 prepared variants: the 36 ordinary graph members and
one local fast clone. It finds exactly five structural claims with authority
`checked-region-virtual-view-range-v1`. Every claim proves a logical index in
`[0, 8]` into a length-nine view, and the claims cover both unit steps `-1`
and `1`.

The ordinary private-copy name becomes a wrapper. Its true arm calls
`int64_pari_flx_copy__local_fast_0`; its false arm calls the already-emitted
ordinary `tagged_int64_pari_flx_copy`. The fast clone retains both view
validations and no `UInt64Buffer index out of range` failure site.

The whole private-graph census is:

| Static generated-C site | Stage E | Stage F | Delta |
| --- | ---: | ---: | ---: |
| Checked `int64` arithmetic | 275 | 273 | -2 |
| All buffer-bounds failures | 68 | 63 | -5 |
| View-validation failures | 11 | 11 | 0 |
| `UInt64` descriptor locals | 0 | 0 | 0 |
| View data/length/offset materializations | 0 | 0 | 0 |
| Signed buffer-index calls | 67 | 62 | -5 |
| `UInt64` bounds failures | 68 | 63 | -5 |
| `Int64` bounds failures | 0 | 0 | 0 |

Thus the proof and lowering performed exactly the intended five-check removal,
while preserving validation at the checked boundary.

## Reproduction

Build both arms from the same compiler tip:

```bash
node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views \
  stage-e

node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views \
  stage-f
```

Run the committed independent harness in two fresh processes, supplying the
Stage-E directory as its first comparison arm and Stage F as its candidate:

```bash
node bench/pari-class-group-port/benchmark_virtualized_fixed_views.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-ag3Jht \
  /tmp/sagejs-stage-a-catalog-2sJXqU
```

The generic harness calls its first arm `stage-d` in JSON; for these invocations
that label denotes the exact Stage-E control above.

## Correctness

The independent harness executed all four frozen packets under JavaScript,
GMP, and tagged backends, for 12 valid comparisons. Outcomes and every
post-call buffer matched. Tagged results also matched all 7,081 active frozen
outputs.

It then executed the nine malformed cases under all three backends, for 27
comparisons. Exception type/message or return value, as applicable, and every
post-call buffer matched. The cases were short state, bad degree, short
coefficients, short primes, short word workspace, short output, nonmonic
polynomial, invalid prime, and oversized prime.

## Paired timing

The boundary is tagged frozen packet zero; packing and assertions are excluded.
Each fresh process ran three warmup rounds and seven alternating pairs, targeted
1,200 ms per batch, and rejected retained batches shorter than 900 ms.

| Isolated run | Stage E geometric mean | Stage F geometric mean | F / E |
| --- | ---: | ---: | ---: |
| 1 | 2.177583 ms | 2.451786 ms | 1.125920 |
| 2 | 2.174535 ms | 2.452003 ms | 1.127598 |

The result is large, stable, and in the wrong direction. Stage F is not a
candidate for integration on performance grounds.

## Object, symbol, and call census

| Artifact | Stage E | Stage F | Delta |
| --- | ---: | ---: | ---: |
| Generated core source | 6,305,446 B | 6,304,344 B | -1,102 B |
| Private generated source | 1,355,770 B | 1,354,376 B | -1,394 B |
| Relocatable object text | 212,853 B | 218,387 B | +5,534 B |
| Linked ELF text | 347,495 B | 353,209 B | +5,714 B |
| Linked addon | 354,880 B | 363,072 B | +8,192 B |
| Surviving checked private symbols | 11 | 13 | +2 |
| Object call instructions | 1,771 | 1,779 | +8 |
| Linked-addon call instructions | 1,850 | 1,858 | +8 |

The relevant `nm -S --size-sort` changes are:

| Private symbol | Stage E | Stage F |
| --- | ---: | ---: |
| `int64_pari_flx_copy` | 0x294 | 0x5e8 |
| `int64_pari_flx_copy__local_fast_0` | absent | 0x1a5 |
| `int64_shift_right` | absent | 0x85 |
| `int64_pari_flx_normalize` | 0x596 | 0x762 |
| `_int64_pari_flx_divrem` | 0xb8c | 0xe58 |
| `int64_pari_flx_gcd` | 0x156b | 0x1f3d |
| `int64_pari_flx_small_ddf.constprop.0` | 0x211c | 0x2148 |
| `int64_pari_flx_small_degfact.constprop.0` | 0x2145 | 0x2297 |

The following commands produced the census:

```bash
size BUILD/build/Release/obj.target/sagejs_native_kernel/kernel.o

nm -S --size-sort \
  BUILD/build/Release/obj.target/sagejs_native_kernel/kernel.o \
  | rg 'tagged_sagejs_checked_r0'

objdump -d BUILD/build/Release/obj.target/sagejs_native_kernel/kernel.o \
  | rg -c '\bcall\s'

objdump -d BUILD/build/Release/sagejs_native_kernel.node \
  | rg -c '\bcall\s'
```

PC-relative relocation targets also move in the same direction: ordinary
`tagged_int64_pari_flx_copy` references increase from 46 to 50, while the
candidate adds references to the fast clone and newly surviving shift helper.
This is consistent with the additional calls and broader inlining changes;
the performance loss is not localized to five saved conditional branches.

## Implication

Generated-C check counts are not sufficient evidence of runtime work. For this
bounded length-nine helper, GCC already converts the Stage-E routine into a
compact unrolled implementation. Adding a source-level local specialization
can make the final program worse by crossing inlining thresholds even when its
own body contains fewer checks.

Before timing another local proof across the full catalog, impose two machine
gates relative to its same-tip control:

1. the target helper plus all newly introduced wrappers/clones must shrink in
   total object code, or at minimum not grow;
2. the count and size of unrelated surviving private symbols and calls must not
   increase.

For `int64_pari_flx_copy`, the promising compiler design is a proven-body
replacement at each already-private call edge, not a runtime guard wrapper.
The caller's abstract facts should select the body during checked-graph
construction; an unproved call should keep using the ordinary checked path.
That preserves the semantic split without presenting GCC with two bodies and a
new dispatch boundary.
