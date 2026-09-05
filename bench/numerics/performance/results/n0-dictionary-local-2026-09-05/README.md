# Isolated dictionary-optimization comparison

This local N0 comparison applies only PR #124's arithmetic-neutral dictionary
change `ad8a1b6a7` to the frozen numerical baseline `bd26cfefb`, producing
`45093cdeabea5874ef54ad7d3752c2b0578ba24b` on
`perf/numerical-dictionary-study`. It is not a comparison against all changes
in #124's parent stack, nor a source-current mainline release qualification.

The candidate has a fresh complete eight-stage build (10m30s); its optional
native addon/production pack is absent. All eight build stages completed, but
that is not native-package qualification. Six focused dictionary/result-binding
tests pass. The collector verifies clean source and current build artifacts in
both checkouts, and forces the same ordinary-source numerical route throughout.
No new native numerical function or library is selected by this experiment.

One serial A/B/B/A campaign, three warmups and seven samples per row, runs on
the local Linux x64 development host with Node 26.8.1. Each block has its own
session; the collector, workload, numerical-source digest, answers, methods,
work counts, trace byte counts and retained-event counts match across all
blocks. The built compiler/runtime identities differ as intended. Raw samples,
first-call timings, source/artifact hashes and host load are in the four JSONs.

Warm public-call medians in milliseconds:

| Workload | A1 | B1 (#124 change) | B2 | A2 |
| --- | ---: | ---: | ---: | ---: |
| Root, no trace | 18.104 | 18.821 | 18.556 | 20.948 |
| Root, summary | 15.919 | 14.949 | 15.001 | 16.082 |
| Bounded minimum, no trace | 17.535 | 16.423 | 16.465 | 17.587 |
| Bounded minimum, summary | 27.578 | 25.227 | 24.965 | 27.197 |
| Classroom ODE, no trace | 88.691 | 85.087 | 84.402 | 90.864 |
| Classroom ODE, summary | 80.820 | 81.769 | 82.536 | 90.573 |
| Describe 20,000, no trace | 1556.916 | 1588.277 | 1548.584 | 1551.656 |
| Describe 20,000, summary | 1580.065 | 1576.396 | 1554.419 | 1550.817 |

Interpretation: roughly 6–9% improvements in the root-summary and bounded-minimum
examples, a smaller no-trace ODE difference, and no clear improvement in the
statistics or noisier rows. **No priority latency target passes.** This is
consistent with dictionary construction being useful shared overhead work, not
a substitute for numerical arithmetic/representation acceleration. Do not infer
that every numerical workload gains, or use dictionary microbenchmark speedups
as solver speedups.

These remain provisional local observations, not confirmed persistent-host
speedup claims. The release owner was already building on `bench-1`, so no
competing benchmark was started there. Quiet-host confirmation, browser runs,
Node-floor coverage, phase attribution and cold/peak-memory measurements remain
open. No release or performance/payload threshold was changed.

Reproduce each block from the study checkout, selecting the frozen baseline
or candidate with `--root`:

```sh
node bench/numerics/performance/run.cjs --root /path/to/selected/checkout \
  --runtime sagejs --cases root-brent,bounded-minimum,ode-classroom,describe-20000 \
  --levels none,summary --output build/numerical-performance/block.json
```
