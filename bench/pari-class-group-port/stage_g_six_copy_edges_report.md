# Stage G short-power six-edge integration: rejected materialization

## Decision

The short-power scalar-summary analysis proves exactly the intended six
`int64_pari_flx_copy` calls in `int64_pari_flxq_powu`: existing origins 167,
184, and 243 plus new origins 193, 198, and 207. All six emit the authenticated
unconditional direct-result ABI, and all four frozen packets plus all nine
malformed controls replay exactly, including every post-call buffer.

This integration is nevertheless **rejected before qualification**. Enabling
the summary capability currently attaches summary provenance to the entire
abstract state. Four unrelated private helpers consequently lose their
already-proved virtual UInt64 views:

| private helper | materialized descriptor locals |
|---|---:|
| `int64_pari_flx_copy` | 4 |
| `_int64_pari_flx_divrem` | 8 |
| `int64_pari_flx_mul` | 6 |
| `int64_pari_flx_sqr` | 4 |
| **total** | **22** |

The direct copy leaf itself still has zero descriptor locals. The regression
is in the ordinary private graph that calls through summary-bearing states.
The normal driver preserves the zero-descriptor gate and therefore rejects
this compiler state.

## Same-tip evidence

The control and candidate were both emitted from the same live compiler input.
The three-edge control was built first, then supplied as the baseline to two
fresh six-edge processes. Exact generated hashes and every raw timing sample
are retained in
[`stage_g_six_copy_edges_evidence.json`](./stage_g_six_copy_edges_evidence.json).

| measure | three-edge control | rejected six-edge candidate | delta |
|---|---:|---:|---:|
| generated core bytes | 6,326,308 | 6,374,481 | +48,173 |
| object bytes | 347,264 | 362,104 | +14,840 |
| object text | 212,370 | 225,745 | +13,375 |
| addon bytes | 354,880 | 371,264 | +16,384 |
| ELF text | 347,031 | 360,479 | +13,448 |

Both fresh processes used two warmups and seven alternating retained pairs,
with independently calibrated batches lasting at least one second. All 14
pairs made the six-edge artifact slower:

```text
three-edge pooled geometric mean   2.124094008 ms/catalog
six-edge pooled geometric mean     2.256131184 ms/catalog
six-edge / three-edge              1.062161644
smallest paired ratio              1.051102558
largest paired ratio               1.073145890
```

Thus the materialization costs about **6.22%** at the frozen packet-zero
boundary. This is a rejected diagnostic, not a performance claim for the
short-power proof after its provenance issue is fixed.

## Cause and required correction

The compiler currently copies `previous.summaryDependencies` wholesale into
every private callee's incoming state. Later, `attachCapabilities` refuses to
construct or attach virtual fixed views whenever that set is nonempty. This is
sound but unnecessarily coarse: a scalar result derived from a summary taints
independent buffer lengths, aliases, view shapes, and scalar facts.

The correction must preserve the f690 safety boundary. It must track summary
provenance on the scalar facts or arguments that actually depend on a summary,
then permit virtual-view proofs only from dependency-free facts. Simply
clearing the whole-state dependency set would be unsound. Once that narrower
provenance representation lands, rerun this same driver without the diagnostic
option; success requires zero descriptor locals and the exact six-origin
census before timing is considered.

## Reproduction

The frozen inputs are:

```text
fixture  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
SHA-256 f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
initial control /tmp/sagejs-stage-a-catalog-XFCs0p
compiler /home/user/sagejs-worktrees/virtual-u64-fixed-views
```

Build the same-tip three-edge control:

```bash
node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-XFCs0p \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views stage-g \
  > /tmp/powu-three-edge-same-tip.json
```

The captured control directory was
`/tmp/sagejs-stage-a-catalog-ZSJd3I`, with generated-core SHA-256
`7c4f789106c56c4e62ef46534892a92ef3a4f382cadb47c1f9910c46d6726bfe`.
The normal six-edge command keeps the acceptance gate and fails on the 22
unexpected descriptors:

```bash
node bench/pari-class-group-port/check_stage_g_six_copy_edges.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-ZSJd3I \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views
```

To reproduce and record only the explicitly rejected artifact:

```bash
node bench/pari-class-group-port/check_stage_g_six_copy_edges.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-ZSJd3I \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views \
  --record-rejected-materialization
```

That diagnostic switch changes only the expected descriptor/data/length/offset
census from the accepted zero shape to the exact rejected 22/11/11/11 shape.
It does not suppress the exact-origin, replay, malformed-case, direct-leaf, or
ABI assertions; the emitted report remains diagnostic and unqualified.
