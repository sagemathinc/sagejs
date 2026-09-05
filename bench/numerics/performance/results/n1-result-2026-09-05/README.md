# N1 result-binding evidence and refreshed bottlenecks

Status: local measurements plus **independent Linux x64 confirmation**, 2026-09-05. This is the second,
separately reviewable N1 change, stacked on [PR #132](https://github.com/sagemathinc/sagejs/pull/132).
It does not complete the performance program or qualify new native defaults.

## Change and candidates

`NumericalResult` now recognizes when its plan holds the identical problem
object. That binding needs no serialization/hash comparison. Distinct objects
still receive the existing content comparison, with each digest explicitly
read once. No hash cache was added, mathematical checking remains enabled,
and exported results still contain recomputable problem/plan provenance.

- Before: `14fdd4117f4ffcad7e0ef6f865a832b37faecb34`, including the trace fix.
- After: `bd26cfefbd8f4fcce9579b754ff309d05f9252cf`, only result binding plus
  its regression fixtures added to that numerical/runtime source.
- Neither includes PR #124 or later compiler/runtime work. The subsequent
  merge of PR #132's evidence/dashboard-discovery fix is not a newly timed
  mathematical implementation.
- Linux x64 AMD EPYC 7B13, Node 26.8.1 and CPython 3.14.4. Raw files bind
  source, collector, workload, generated artifacts, host load and every sample.
- Forced dynamic Python-mode Sage.js, three warmups and seven samples per row.
  Source was clean with a current eight-stage build receipt at collection.
  The after candidate was built without optional native addons; the before
  checkout had them installed. Neither timing run selected their kernels.
- Runs were serial, without another local build/timing campaign. This is not
  paired per-request interleaving or quiet persistent-host confirmation; host
  load is recorded rather than assumed absent. Do not call these ratios
  confirmed across platforms.

## Public timings

Milliseconds, summary trace except where noted. The before values are the
previous trace PR's second local run, not a newly interleaved control. The
after columns are independent sessions. Both after runs have **identical
recorded answers, method/backend, work counts, truth level and trace witnesses**
to that before run for all nine root/minimum/ODE rows.

| Public case | Before | After run 1 | After run 2 |
| --- | ---: | ---: | ---: |
| Brent root / none | 28.744 | 20.591 | 20.969 |
| Brent root / summary | 26.596 | 15.775 | 16.595 |
| Brent root / iterations | 37.805 | 27.558 | 27.838 |
| Bounded minimum / none | 26.830 | 17.379 | 18.087 |
| Bounded minimum / summary | 36.805 | 26.196 | 26.697 |
| Bounded minimum / iterations | 40.535 | 29.633 | 29.181 |
| Classroom ODE / none | 113.861 | 95.765 | 91.973 |
| Classroom ODE / summary | 118.049 | 92.256 | 89.175 |
| Classroom ODE / iterations | 165.416 | 144.523 | 136.802 |

The structural result is stronger than the timing attribution: the common
identity-bound constructor makes zero problem snapshots instead of hashing
twice. There is no timing noise in that count. This still leaves cheap roots
well above the proposed 1 ms target and classroom ODEs above 5 ms.

## Independent persistent x64 comparison

After the disk expansion, `bench-1` built both exact source candidates in
dedicated detached worktrees without optional native addons. The files
`result-paired-{A1,B1,B2,A2}.json` use whole-corpus A/B/B/A blocks on AMD EPYC
7B13 / Node 26.5.1. There was no concurrent build or timing campaign on the
host. Each row has three warmups and seven samples, with required public
validation/result creation included. All nine mathematical/work/trace
observations match, as do collector/workload hashes; each candidate's built
artifact digest is identical between its two blocks.

| Public case (ms) | A1 trace only | B1 result fix | B2 result fix | A2 trace only |
| --- | ---: | ---: | ---: | ---: |
| Brent root / none | 30.953 | 18.652 | 20.303 | 30.703 |
| Brent root / summary | 26.881 | 15.826 | 15.825 | 26.963 |
| Brent root / iterations | 38.632 | 27.744 | 27.517 | 38.353 |
| Bounded minimum / none | 26.979 | 17.250 | 17.087 | 26.437 |
| Bounded minimum / summary | 35.510 | 26.213 | 25.828 | 35.949 |
| Bounded minimum / iterations | 38.162 | 28.253 | 27.729 | 38.171 |
| Classroom ODE / none | 114.889 | 88.030 | 91.354 | 117.337 |
| Classroom ODE / summary | 112.002 | 84.778 | 87.472 | 115.713 |
| Classroom ODE / iterations | 145.547 | 127.807 | 132.457 | 149.405 |

This independently confirms the local improvement on these workloads. It is
not browser/four-platform performance qualification, a tail-latency study or
a pass of the program's much tighter public-call targets.

## Broader current baseline

The following **single-session** medians refresh the next work queue. CPython
runs the same ordinary Python source and public operations, including each
operation's result validation. These are not SciPy timings, not measurements
of the explicit library routes, and not evidence that a particular library
will remove every observed cost. Public output/trace observations and
independent known-answer checks are outside timing; the solver's own required
checking is inside it. Full first-call/sample records are retained.

| Public case, summary trace | Dynamic Sage.js ms | Same-source CPython ms |
| --- | ---: | ---: |
| Rosenbrock 2D / Nelder–Mead | 210.314 | 3.514 |
| Rosenbrock 20D / analytic-gradient BFGS | 1,391.487 | 30.923 |
| Four-observation exponential least squares | 41.538 | 0.903 |
| Describe 20,000 observations | 1,568.253 | 18.147 |
| Dense solve, 16 × 16 | 744.400 | 9.697 |
| Sine quadrature | 27.887 | 0.580 |
| 32-node interpolation construction | 163.584 | 2.089 |
| FFT, 256-value impulse | 2,615.329 | 5.075 |

The dense, statistics and FFT gaps remain severe. In particular, a backend-only
FFT comparison would omit the current independent sampled-DFT/roundtrip checks
and communication costs. Accelerate checking too; do not remove it to improve
the chart. The interpolation row measures construction, not retained queries.
The long ODE, browser engines, native/library alternatives, sustained workloads,
peak memory and isolated startup/payload accounting are still unmeasured here.

## Correctness and dependency checks

`test/numerics/performance/result-bookkeeping.py` passes under CPython and a
freshly built Sage.js runtime. It observes zero snapshots for identical
bindings, one snapshot per object for distinct equivalent bindings, rejection
of different content, repeated rechecking after subclass content mutation,
detached outward records, and retained type/status/truth/finite-value/budget
guards. This is not a mutable-content cache.

The explicit local digest reads also avoid a compiler defect exposed by this
witness: a differing property-to-property `!=` comparison can read each
property twice in generated JavaScript. That finding and its exact minimal
reproducer were handed to the compiler lane in
[Discussion #104](https://github.com/sagemathinc/sagejs/discussions/104#discussioncomment-18300596).
No compiler change is smuggled into this PR.

The fresh addon-free build passes the focused result witnesses and 20 common
contract, root-evidence, optimization, and ODE tests. The combined Sage/Python
frontend test initially failed in its **Sage decimal-literal constructor**:
`create_real_literal` requests the MPFR-backed FLINT package before invoking
the numerical solver. Python mode passes without that package. This is not a
new result-hashing dependency; Sage's arbitrary-precision literal contract
must not be silently replaced by binary64. After supplying the unchanged,
already validated FLINT direct addon and generated FFI adapter from the baseline,
the complete Sage/Python fitting/ODE frontend test passes too. That native-equipped
check is separate from the addon-free Python-mode timing records; copying an
addon was not a numerical-source fix or an addon-free Sage-mode pass.

## Next implementation boundary

A coarse instrumented `describe` diagnostic (three warmups, seven calls) found
median whole-call time 1,589 ms, input conversion plus budget checking 496 ms,
corrected centered sum of squares 479 ms, mean 126 ms, and bounded visual sample
0.68 ms. This was local temporary instrumentation with no overhead calibration;
it is a prioritization aid, not an authenticated profile or an exact partition
of total time. Do not sum unrelated phase medians into a speed claim.

N2 therefore needs both a checked packed-input path and a coarse stable
reduction region. Preserve arbitrary iterator/conversion/cancellation callback
order on the generic path; moving `guard.check(1)` out of such a loop would
change observable semantics. Preserve accurate summation, scaling and overflow
behavior instead of replacing `math.fsum` with a naive sum. A packed kernel
alone cannot eliminate the measured input/budget cost. Public one-shot and
retained-data measurements must remain separate.
