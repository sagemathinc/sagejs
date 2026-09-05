# N1 persistent-host trace evidence

This supplements the [local comparison](../n1-local-2026-09-05/README.md), not
the full numerical performance program or a product-release qualification.
Baseline is `cfbdb8a097fdf16b8d9d48680f9c773ea7cc393a`; trace candidate is
`14fdd4117f4ffcad7e0ef6f865a832b37faecb34`. No PR #124 or result-binding
optimization is included. All runs force dynamic Python-mode execution.

## Linux ARM64: independent A/B/B/A confirmation

`bench-arm`, Neoverse-N1, Node 26.5.1. Both source candidates passed complete
eight-stage builds in dedicated detached worktrees without the optional native
addons. No build or other timing campaign ran on the host during measurement.
The four files retain initial host load, exact clean source/build identities,
every sample, first-call observations, and process-memory snapshots. They use
the identical collector and workload hashes, three warmups and seven samples.

Order is **whole-corpus blocks** A1, B1, B2, A2; it is not per-request randomized
interleaving. All 15 result/work/trace observations match across all four blocks.
Values below are warm public-call medians in milliseconds, with full required
mathematical validation/result construction included. Trace-only rows are
separate collection witnesses, not solver timings.

| Workload / trace | A1 baseline | B1 candidate | B2 candidate | A2 baseline |
| --- | ---: | ---: | ---: | ---: |
| Brent root / none | 50.423 | 47.642 | 48.083 | 52.274 |
| Brent root / summary | 47.283 | 39.807 | 40.689 | 48.468 |
| Brent root / iterations | 133.207 | 57.207 | 57.476 | 127.740 |
| Bounded minimum / none | 48.887 | 40.156 | 39.956 | 48.308 |
| Bounded minimum / summary | 123.652 | 56.184 | 53.643 | 108.898 |
| Bounded minimum / iterations | 142.266 | 55.853 | 56.862 | 139.776 |
| Classroom ODE / none | 204.451 | 163.458 | 163.939 | 196.128 |
| Classroom ODE / summary | 205.967 | 159.377 | 158.391 | 194.271 |
| Classroom ODE / iterations | 573.495 | 231.513 | 227.260 | 540.418 |
| Trace 32 / iterations | 1,132.901 | 79.562 | 77.144 | 1,011.489 |
| Trace 128 / iterations | 20,079.078 | 363.844 | 365.302 | 18,623.416 |

This independently confirms the severe retained-history cost and its removal.
It does not establish every small untraced improvement as significant, supply
a tail-latency distribution, or meet the program's much tighter targets.
Collection still performs bounded retention selection when evicting events.

## Windows and macOS candidate coverage

`candidate-windows-x64-1.json` and `candidate-macos-arm64-1.json` each contain
18 completed three-warmup/seven-sample rows at the same source candidate. They
are **candidate-only observations**, not baseline speedup comparisons.

- Windows x64, Node 26.5.1: complete build passed; optional native addons and
  unprepared numerical reactors were explicitly absent. Focused trace/common/
  optimization/ODE checks passed 16 tests, with one optional live-SciPy skip.
- macOS ARM64, Homebrew Node 26.5.0: stages 1–7 passed. Direct NLopt reactor
  compilation produced the exact expected Wasm SHA
  `8abe4760d3be541fa9d86ad3af6c33eb3241d3e423fd20e4fc85393c141678eb`
  (72,592 bytes), but zlib 1.2.12 produced gzip size 28,548 versus manifest
  29,234. Brotli size 23,996 agreed. The verifier correctly refused to bless
  the differing report. Stage 8 then consumed the unchanged, exact-source
  authenticated ARM handoff, identity
  `sha256:93c273be2020276eeaaae15725fd0748df3c31dc38d0e0001ec4166281885057`.
  Its receipt duration covers only the resumed installation, not all build
  time. Trace checks passed 2 tests; common/optimization/ODE passed 14 with one
  optional live-SciPy skip. A separate root-language suite passed 4 checks but
  its Sage scalar-view check required the absent FLINT addon; that is **not**
  a full-suite pass. The Python-mode timed root remained usable and checked.

No manifest, mathematical receipt or release threshold was changed to obtain
these records. Native compilation, public browser worker execution, npm/SEA
packaging and peak memory are not qualified by these dynamic host observations.

## Outstanding checks

The extra disk on `bench-1` is now available; its baseline and trace-candidate
builds passed and the corresponding A/B/B/A measurement is in progress.

PR #132's routine Linux gate and all three cross-platform CI smokes passed.
Its separate browser job rejected eager payload size (gzip 17,528,500 against
17,400,000; Brotli 9,615,417 against 9,600,000) before public parity execution.
PR #140's routine gate hit a pre-existing group fallback test's 30-second child
timeout; the identical test passed locally in 14.1 seconds. Neither failure is
reported as green, and payload/deadline limits have not been relaxed here.
