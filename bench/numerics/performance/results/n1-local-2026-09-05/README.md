# N0–N1 local trace-accounting evidence

Status: **provisional local measurements**, 2026-09-05. This is an incremental
performance PR, not completion of N0/N1, qualification of all targets, or a
release. Persistent-host confirmation, browser execution, peak-memory evidence,
the complete corpus, and the program's latency targets remain open.

## Candidates and scope

- Baseline: `cfbdb8a097fdf16b8d9d48680f9c773ea7cc393a`, the unchanged numerical
  implementation plus the initial performance collector.
- Candidate: `14fdd4117f4ffcad7e0ef6f865a832b37faecb34`, incremental trace-byte
  accounting and ODE trace projection, plus collector timeout handling.
- Both descend from main `d520ed4df1b4afbea3199964ffd27fc57efdc1e0`; neither
  includes PR #124. Compiler/runtime source is unchanged between candidates.
- Local Linux x64, Node 26.8.1; full host, source, workload and built-artifact
  identities are in each raw JSON file. The frozen checkouts were clean and
  their build receipts current at collection. The candidate's eight-stage build
  resumed stages 6–8 after supplying its missing validated native prefixes;
  its receipt duration covers those resumed stages, not total build time.
- `SAGEJS_NATIVE_DISABLE=1`: same-source dynamic Python-mode execution. No
  external-library or `@native` speedup is claimed by these measurements.
- Three warmups, seven retained samples per row, independent answer/trace
  observations outside timing. The public timed call includes its own result
  construction and independent mathematical checking. No concurrent builds
  or other timing campaigns ran locally during the retained Sage.js runs.

Run 1 collected baseline traces, then baseline public calls, then the candidate.
Run 2 repeated baseline followed by candidate with the same updated collector
and identical workload source. Each JSON retains every sample and first call.
This is serial before/after repetition, not randomized per-request interleaving
or confirmation on a second quiet host. The first baseline collector lacked
the later censored-batch/worker-teardown handling; timed workload code matches.

## Observed warm public-call medians

Values below are run 2, in milliseconds. Speed ratios are descriptive, not
ratified performance gates. All 15 paired rows have **identical recorded
methods, backends, success/truth levels, independent errors, work counts and
retained trace witnesses**.

| Workload / trace | Baseline | Candidate | Baseline / candidate |
| --- | ---: | ---: | ---: |
| Trace 32 / iterations | 670.682 | 56.515 | 11.87× |
| Trace 128 / iterations | 12,481.025 | 221.478 | 56.35× |
| Brent root / none | 35.673 | 28.744 | 1.24× |
| Brent root / summary | 31.828 | 26.596 | 1.20× |
| Brent root / iterations | 88.836 | 37.805 | 2.35× |
| Bounded minimum / none | 32.849 | 26.830 | 1.22× |
| Bounded minimum / summary | 73.913 | 36.805 | 2.01× |
| Bounded minimum / iterations | 88.846 | 40.535 | 2.19× |
| Classroom ODE / none | 126.152 | 113.861 | 1.11× |
| Classroom ODE / summary | 121.720 | 118.049 | 1.03× |
| Classroom ODE / iterations | 425.646 | 165.416 | 2.57× |

The independent first run shows the same large trace effect: 32 events
676.170 → 60.214 ms, 128 events 12,374.554 → 227.382 ms. Traced public medians
were root 92.067 → 41.263 ms, minimum 87.583 → 40.324 ms, and ODE
379.745 → 184.903 ms. Smaller untraced/summary differences are less decisive;
inspect the distributions and do not extrapolate them to other domains.

The original 256-event/iterations **batch** hit its 600,000 ms timeout before
returning a measurement. The partial baseline file retains eight earlier rows
and `complete: false`; the older collector did not yet save a failure object.
This timeout was observed by the parent session, followed by a teardown race.
It is neither a 600-second per-call time nor a lower bound on the median. The
candidate completed the same 256-event case at 527.828 ms median in run 1;
there is no invented baseline ratio for it.

The optimization removes repeated history serialization: 32 → 128 retained
events increases candidate collection time about 3.9× for 4× the events,
instead of the baseline's 18.6×. Retention selection still examines the bounded
retained set when evicting events; this is not a claim of constant-time arbitrary
head/important/tail eviction or zero serialization cost.

## Correctness and attribution

`test/numerics/performance/trace-accounting.py` compares the implementation
against an independent list-of-dictionaries retention oracle after every append.
It covers all trace levels, count/byte caps, forced/important events, UTF-8 data,
oversized events, exact byte boundaries, eviction and sequence progression,
invalid data, and mutation of input/public nested diagnostic views. An explicit
structural test forbids serialization of previously retained events on append,
projection and eviction. ODE projection is compared with its former full-copy
calculation. The same source passes under CPython and dynamic Sage.js.

Focused collector/corpus tests pass (7 tests), as do common schemas,
Sage/Python fitting frontends, explicit and stiff ODE cases with frozen/live
SciPy oracles (12 tests), and optimization success/failure/budget/visualization
plus existing root-evidence checks (11 tests). Strict Python passes with 367
modules and zero errors. These are focused checks, not the complete release
suite. Architecture checking also exposed a dashboard-discovery issue:
downloaded NLopt Python tests below an ignored `build/source` directory were
being treated as first-party source inputs. The follow-up excludes generated
directories consistently and tests that actual source edits still change the
dashboard identity.

[The profile summary](profile-summary.json) retains the two raw report hashes,
sampling counts, scopes and top generated-engine frames. Type checks, attribute
lookup and method binding dominate many raw engine frames, but only 87/3182 root
samples and 194/6308 ODE samples map to authenticated Python source spans.
Do not turn those few matched samples into a complete phase-percentage chart.
Raw profiles remain local under `build/numerical-performance/`; the checked-in
summary does not pretend they are fully attributed or publicly archived.

Reproduction uses `scripts/optimizer-profile.cjs` with `--language python`,
`--entry entry --prepare prepare --warmups 3`, 20 root or 10 ODE repetitions.
`entry` calls the corresponding public witness in `workloads.py` with iteration
tracing; `prepare` performs one call and checks the known root or exponential
solution. Preparation/import time is outside the sampled region. Profile timing
is instrumentation evidence, not interchangeable with the uninstrumented rows.

## Remaining gaps and next PR

This solves a severe trace-history cost, not numerical performance generally.
Even the candidate's cheap root/minimum is tens of milliseconds, well above the
1 ms ambition; the classroom ODE remains above 100 ms versus a 5 ms ambition.
The iteration-overhead target also remains unmet. No new dense/FFT/library,
native throughput, startup, payload, sustained-job, or peak-memory claim follows.

The next independent N1 slice eliminates redundant problem hashes during result
construction without caching mutable content or dropping validation. Subsequent
N2 work must move measured coarse callback-free arithmetic into source-transparent
kernels, not just decorate callback-heavy solvers. N0 still needs baseline±#124,
actual automatic/library routes, matched SciPy comparisons, broader scaling and
failures, phase/startup/payload/memory measurements, and persistent-host/browser
coverage. `bench-1` was full; ARM64 qualification proceeded independently rather
than deleting another lane's artifacts or inventing a pass.
