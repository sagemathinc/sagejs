# Isolated dictionary optimization: persistent Linux x64 confirmation

This is the quiet `bench-1` confirmation of the earlier local N0 experiment.
Only PR #124's dictionary change `ad8a1b6a7` is applied to the frozen baseline
`bd26cfefbd8f4fcce9579b754ff309d05f9252cf`, producing candidate
`45093cdeabea5874ef54ad7d3752c2b0578ba24b`. It does not measure all of #124's
parent stack or qualify a mainline release.

The candidate's complete eight-stage build finished in 10m18s, followed by six
passing dictionary/result-binding tests. Optional exact native adapters and
the production native pack are absent; this is an ordinary numerical-source
comparison, not native packaging qualification. Both checkouts have independent
current build receipts and clean frozen source. No release checkout was changed.

One serial A/B/B/A campaign ran on the persistent AMD EPYC 7B13 Linux x64 host
with Node 26.5.1, after the release-owner build finished. Each separate session
uses three warmups and seven timed samples per row. Source/build identities,
raw samples, first-call timings, process-memory snapshots, and host load are
retained in the four JSON files. Memory snapshots are not isolated peaks.

All four records have identical collector, workload and numerical-source hashes;
all 32 public observations agree in answers, methods, validation error, status,
evaluation/iteration counts, trace bytes, and event counts. The compiler/runtime
and built-artifact identities differ as intended. Raw collector metadata still
lists the generic unresolved items; this paired campaign supplies the host
confirmation for these eight rows only, not the other outstanding evidence.

Warm complete public-call medians, milliseconds:

| Workload | A1 | B1 | B2 | A2 |
| --- | ---: | ---: | ---: | ---: |
| Root, no trace | 20.566 | 19.212 | 18.821 | 20.308 |
| Root, summary | 15.976 | 14.691 | 14.467 | 15.805 |
| Bounded minimum, no trace | 17.774 | 16.331 | 15.630 | 17.398 |
| Bounded minimum, summary | 26.970 | 25.432 | 24.320 | 26.741 |
| Classroom ODE, no trace | 90.820 | 82.850 | 82.950 | 89.879 |
| Classroom ODE, summary | 88.196 | 73.864 | 80.403 | 87.160 |
| Describe 20,000, no trace | 1516.435 | 1556.728 | 1545.956 | 1576.208 |
| Describe 20,000, summary | 1520.853 | 1524.422 | 1542.523 | 1566.475 |

These observations confirm modest shared-overhead gains: roughly 7–9% for
roots, bounded minimum and no-trace ODE, with a noisier 12% average improvement
in the ODE-summary row. Statistics remains essentially unchanged. The ratios
compare the averages of the two block medians, not a statistical confidence
bound or a guarantee for arbitrary workloads. **No priority latency target
passes.** The interpreter change is worthwhile but does not replace coarse
native/library numerical regions or representation work.

Browser coverage, minimum-Node coverage, phase attribution, cold-import isolation
and peak-memory measurement remain separate work. No source, default, payload
ceiling or release threshold was promoted by this experiment.

```sh
node bench/numerics/performance/run.cjs --root /path/to/frozen/checkout \
  --runtime sagejs --cases root-brent,bounded-minimum,ode-classroom,describe-20000 \
  --levels none,summary --output build/numerical-performance/new-block.json
```
