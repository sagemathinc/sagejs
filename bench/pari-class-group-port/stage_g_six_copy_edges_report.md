# Stage G short-power proof: seven unconditional copy edges

## Result

The fixed-width comparison refinement closes the short-power proof. The frozen
Stage-G artifact now emits exactly seven authenticated unconditional
`int64_pari_flx_copy` calls:

- evaluator origin `int64_pari_flx_flxqv_eval:192`;
- short-power origins `int64_pari_flxq_powu:167`, `184`, `193`, `198`, `207`,
  and `243`.

The evaluator edge is a legitimate consequence of the same generic proof. It
is included explicitly in the census rather than hidden or artificially
excluded. All four frozen packets, 7,081 active outputs, post-call buffers, and
all nine malformed/error cases replay exactly.

The code-shape gate also passes. The candidate retains 11 validated views but
has zero UInt64 descriptor locals and zero data, length, or offset descriptor
assignments. Relative to the fresh same-compiler three-edge control, the
seven-edge artifact is slightly smaller:

| measure | three-edge control | seven-edge candidate | delta |
|---|---:|---:|---:|
| generated core bytes | 6,320,362 | 6,317,228 | -3,134 |
| addon bytes | 354,880 | 354,880 | 0 |
| ELF text bytes | 347,735 | 347,607 | -128 |
| checked int64 arithmetic sites | 257 | 245 | -12 |
| signed buffer-index calls | 61 | 59 | -2 |

## Timing

The control and both candidates were emitted while the three compiler-source
hashes recorded in the evidence file remained unchanged. Each fresh candidate
process used two warmups and seven alternating retained pairs, with batches
calibrated to at least one second.

```text
three-edge pooled geometric mean   2.341237838 ms/catalog
seven-edge pooled geometric mean   2.210680477 ms/catalog
seven-edge / three-edge            0.944235755
smallest paired ratio              0.934525352
largest paired ratio               0.952944060
```

All 14 pairs favor the seven-edge artifact, for a measured reduction of
**5.58%** at the packet-zero boundary. The canonical driver nevertheless marks
this `qualified: false`, so this is not presented as meeting its stronger
performance threshold. It is a successful semantic, provenance, and code-shape
integration with a consistent measured improvement.

Exact source identities, artifact hashes, raw timing arrays, and output
directories are retained in
[`stage_g_six_copy_edges_evidence.json`](./stage_g_six_copy_edges_evidence.json).

## Why the final proof appeared only after typed-domain refinement

The `flxq_sqr` and `flxq_mul` summaries already expressed their successful
return as `-1` or at most `dt - 1`. In scalar-summary analysis, parameters begin
with their full declared fixed-width domains, so the ordinary preflight
`0 <= dt <= 4` reduced those summaries to `[-1, 3]`.

Actual call-fact analysis can enter a private function without an interval for
a scalar argument. Literal seeding supplied the comparison constants, but the
comparison refiner previously required both operands to already have
intervals. Seeding a missing operand from its declared `int64` or `uint64`
domain makes the same source preflight effective in actual call-fact analysis.
That is a generic, sound rule: it does not assume a catalog value or special
case `powu`.

## Reproduction

Frozen fixture:

```text
/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
SHA-256 f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
```

Build the same-compiler three-edge control:

```bash
node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-XFCs0p \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views stage-g \
  > /tmp/powu-three-edge-stable-control.json
```

Its output directory in the captured run was
`/tmp/sagejs-stage-a-catalog-RhByNa`. Run the exact-seven integration against
that control:

```bash
node bench/pari-class-group-port/check_stage_g_six_copy_edges.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-RhByNa \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views \
  > /tmp/powu-seven-edge.json
```

The driver fails closed if the origin set changes, any edge is guarded, any
descriptor is materialized, any replay differs, or a malformed case crosses a
different boundary.
