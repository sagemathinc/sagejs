# Main-based trace accounting: paired evidence

Baseline: `5b307b65fc350763abd52062e57f1c7a3666f925`.
Candidate: `db7c806b072b6f1d181f92532b75f1d395428a42`.
Both were freshly built with the same current-main compiler and independent
local dependencies. Neither has the optional FLINT addon; all measured calls
use the explicitly disabled-native ordinary numerical path.

The four serial blocks ran A1/B1/B2/A2 after builds and other tests finished.
Each case has three warmups and seven retained samples per block. All 60
recorded observations agree by workload and trace policy, including method,
validation classification, independent error, work counts and trace sizes.
Raw first-use/preparation times, samples, hashes, host identity and process
memory snapshots are retained in `local-{A1,B1,B2,A2}.json`.
`comparison.json` checks observations and preserves separate block medians.

| Workload / trace policy | Baseline block medians (ms) | Candidate block medians (ms) |
| --- | ---: | ---: |
| Append 32 events / iterations | 930.33, 925.66 | 79.08, 82.34 |
| Append 128 events / iterations | 14518.28, 14466.88 | 307.89, 305.79 |
| Brent root / none | 50.07, 48.52 | 41.22, 42.03 |
| Brent root / summary | 45.42, 47.76 | 39.32, 38.68 |
| Brent root / iterations | 136.25, 128.87 | 63.62, 58.39 |
| Bounded minimum / none | 48.29, 49.62 | 40.11, 40.04 |
| Bounded minimum / summary | 123.81, 120.63 | 58.99, 55.12 |
| Bounded minimum / iterations | 143.67, 139.81 | 56.29, 62.81 |
| Classroom ODE / none | 193.40, 183.65 | 151.68, 148.13 |
| Classroom ODE / summary | 184.98, 179.43 | 144.11, 147.78 |
| Classroom ODE / iterations | 564.93, 562.95 | 213.12, 218.30 |

The trace-only rows time collection without final serialization. Public solver
rows include the solver's own validation and structured-result construction;
benchmark-only assertions and observation serialization are outside the clock.
The `none` policy can still retain forced terminal events; it does not promise
zero trace-related work.

For this below-cap workload, increasing retained events fourfold increases
baseline collection time about sixteenfold versus roughly fourfold for the
candidate. This corroborates the no-history-serialization regression witness.
It does not claim constant-time eviction: the existing deterministic eviction
policy still scans a bounded retained list.

## Limits

The preceding table is local timing evidence. The independent `bench-1`
confirmation is below; do not pool different hosts or runtime versions.
Neither campaign is release qualification, a SciPy speed comparison, or
completion of N0/N1.

All three public solver cases remain above their program latency targets.
No reliable tail-latency, cold-import, peak-memory, million-event, or full
optimization/ODE-domain claim follows from these samples. Process memory
snapshots do not measure worker peaks. The initial corpus's remaining domains
and the N2–N6 acceleration/qualification work remain open.

## Independent persistent-host confirmation

`bench-1` used its own fresh baseline/candidate checkouts and dependencies,
Node 26.5.1 on Linux x64, and the same source, collector, workload, and policy
identities. The shared checkout was untouched. The host was explicitly handed
off by the Python lane; all builds and the passing accounting oracle finished
before the serial A1/B1/B2/A2 timing blocks. CPU work was released afterward.
The baseline and candidate both lacked optional native adapters/reactors and
the collector explicitly disabled native selection, as in the local campaign.

`bench1-{A1,B1,B2,A2}.json` retains all samples and startup/preparation records.
`bench1-comparison.json` checks completion, exact source/compiler/workload
identities, matching policies, seven samples/three warmups, recomputed medians,
and identical observations in all 60 records. This confirms the observed gains
without reclassifying any unmeasured route or changing a performance target.

| Workload / trace policy | Baseline block medians (ms) | Candidate block medians (ms) |
| --- | ---: | ---: |
| Append 32 events / iterations | 931.08, 919.70 | 74.83, 81.53 |
| Append 128 events / iterations | 14499.87, 14217.85 | 294.89, 306.11 |
| Brent root / none | 47.54, 46.52 | 38.60, 39.99 |
| Brent root / summary | 44.30, 45.61 | 36.52, 37.65 |
| Brent root / iterations | 124.91, 123.49 | 58.64, 53.73 |
| Bounded minimum / none | 46.64, 46.72 | 38.80, 38.78 |
| Bounded minimum / summary | 118.48, 117.24 | 51.30, 57.53 |
| Bounded minimum / iterations | 136.70, 134.42 | 54.62, 54.33 |
| Classroom ODE / none | 181.31, 181.93 | 148.54, 144.97 |
| Classroom ODE / summary | 175.16, 178.36 | 138.47, 142.70 |
| Classroom ODE / iterations | 540.48, 539.59 | 204.10, 212.92 |

The trace-only `none`/`summary` controls remain about 1–3 ms and show small
mixed changes; they do not support a broad claim of universal improvement.
The retained-event and public solver gains agree directionally on both hosts.

## Separate browser correctness and payload evidence

After the timing campaign, the full trace-accounting oracle passed in the
production public workers for Chromium 151, Firefox 153, and WebKit 26.5.
These are correctness runs, not browser performance samples.
`browser-artifact.json` retains the authenticated source-bound artifact and
per-file/group sizes. The existing payload and topology budgets passed without
changes: eager-core gzip 17,185,965 / 17,600,000 bytes and Brotli
9,673,209 / 9,700,000 bytes. Full installed distribution and four-platform
qualification are not implied by these narrow checks.
