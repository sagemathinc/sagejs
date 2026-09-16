# Stage G loop-success proof: eleven unconditional copy edges

## Result

Compiler revision `6e603fe2d` proves immediate successful assignments inside
the remaining unsupported `powu` loops. The frozen Stage-G artifact now emits
exactly eleven authenticated unconditional `int64_pari_flx_copy` calls:

- evaluator origin `int64_pari_flx_flxqv_eval:192`;
- `powu` origins `167`, `184`, `193`, `198`, `207`, `243`, `327`, `336`,
  `350`, and `360`.

All four frozen packets, 7,081 active outputs, post-call buffers, and all nine
malformed/error cases replay exactly. The driver fails closed if this origin
set changes or any edge becomes guarded.

The candidate retains 11 validated views but has zero UInt64 descriptor locals
and zero data, length, or offset descriptor assignments. Relative to the
frozen seven-edge baseline, the eleven-edge artifact is slightly smaller and
moves four calls from checked relocation dispatch to direct dispatch:

| measure | seven-edge baseline | eleven-edge candidate | delta |
|---|---:|---:|---:|
| generated core bytes | 6,317,228 | 6,317,020 | -208 |
| addon bytes | 354,880 | 354,880 | 0 |
| ELF text bytes | 347,607 | 347,503 | -104 |
| checked-copy relocations | 12 | 8 | -4 |
| direct copy calls | 8 | 12 | +4 |

## Timing

The final candidate process used two warmups and seven alternating retained
pairs, with batches calibrated to at least one second.

```text
seven-edge geometric mean     2.197845875 ms/catalog
eleven-edge geometric mean    2.114490837 ms/catalog
eleven-edge / seven-edge      0.962074212
smallest paired ratio         0.958824090
largest paired ratio          0.963776643
```

All seven pairs favor the eleven-edge artifact, for a measured reduction of
**3.79%** at the packet-zero boundary. The canonical driver nevertheless marks
this `qualified: false`, so this remains a successful semantic, provenance,
and code-shape integration rather than a claim that the stronger performance
threshold was met.

Exact source identities, artifact hashes, raw timing arrays, and output
directories are retained in
[`stage_g_six_copy_edges_evidence.json`](./stage_g_six_copy_edges_evidence.json).

## Reproduction

Frozen fixture:

```text
/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
SHA-256 f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
```

The frozen seven-edge baseline is
`/tmp/sagejs-stage-a-catalog-hvTOh8`. Run the exact-eleven integration against
compiler commit `6e603fe2d`:

```bash
node bench/pari-class-group-port/check_stage_g_six_copy_edges.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-hvTOh8 \
  /home/user/sagejs-worktrees/virtual-u64-fixed-views \
  > /tmp/powu-eleven-edge.json
```

The authoritative captured candidate is
`/tmp/sagejs-stage-a-catalog-imzRDp`; its raw report is
`/tmp/powu-eleven-edge-final.json` with SHA-256
`16f563c8df6f92513535c38349024a60c03d4f074080f42156383eac9a055695`.
