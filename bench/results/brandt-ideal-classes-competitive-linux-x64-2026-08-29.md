# Integral Brandt ideal classes: final Linux x64 performance report

## Result

This is the source-frozen final report for the optimization program in
`agents/brandt-ideal-classes-performance-plan.md`. It compares equal work:
construct every genuine locally principal Eichler right-ideal class, prove
mass completion, and construct the first complete good-prime Brandt matrix.
Dimensions and complete characteristic polynomials agree exactly among
Sage.js, SageMath, and Magma on every common row.

The implementation is much faster than the frozen 2026-08-28 baseline, but
it does **not** meet the proposed final $2\times$ Magma gate. That miss is part
of the result, not hidden by comparing the faster spectral-only realization
or cached operators.

## Frozen identity

- Sage.js source: `07bc15f6243891173d650395fb904d1518849ce4`
- host: Linux x64, AMD EPYC 7B13, Node.js v26.7.0
- SageMath: 10.9-compatible `/home/user/sagelite/sage`
- Magma: V2.18-5
- primary receipt SHA-256:
  `92628943591e58abc2a15f7376351ebc81ef0a7c5af10b33161d65f8cea6f1bd`
- scaling receipt SHA-256:
  `8db6609e79af782ce27b86d552a55c1f7e0e7e475b1db517bb6e5fac207abb4a`
- composite-discriminant receipt SHA-256:
  `da1ed7e7fe126a92ed09d0210b184e351cb251e93b5496c974fc1e12b1c4b0d4`
- stage-profile SHA-256:
  `0951b2cacaeb89a604e1ea93f6c2d8396b7f36a854147822a44bab9dbd98a120`

The primary receipt contains two warmups and seven measured fresh-process
samples. Each accepted Magma operator row repeats work until at least
$100\,\mathrm{ms}$ of aggregate CPU time is measured. The scaling and
composite rows are one-sample descriptive stress tests.

## Primary equal-contract comparison

Times below are resident construction plus the first uncached operator. They
exclude process startup, cached lookup, and characteristic-polynomial display.

| $(D,N,\ell)$ | $h$ | old Sage.js | final Sage.js median | Magma median | Sage.js / Magma | old / final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| $(11,2,3)$ | 3 | $28.063$ s | $1.654$ s | $0.0752$ s | $21.37\times$ | $16.97\times$ |
| $(37,2,3)$ | 9 | $64.649$ s | $3.503$ s | $0.2702$ s | $12.96\times$ | $18.45\times$ |

All seven samples have identical class counts and complete characteristic
polynomials in all three systems. Sage.js additionally verifies exact mass,
row sums, the complete operator digest, and the integral pairing digest.

The primary Sage.js fresh-process wall-time median is $8.445$ seconds and its
peak-RSS median is $346{,}411{,}008$ bytes. Magma's process wall time in this
receipt includes many repeated fresh modules and operators for timer
resolution, so it is not a raw-startup comparison. Its mathematical medians
above are the repeated CPU totals divided by the recorded repeat counts.

## Scaling and composite-discriminant rows

| $(D,N,\ell)$ | $h$ | Sage.js combined | Magma combined | ratio | oracle status |
| --- | ---: | ---: | ---: | ---: | --- |
| $(37,11,2)$ | 36 | $14.723$ s | $1.7156$ s | $8.58\times$ | SageMath and Magma exact |
| $(101,11,2)$ | 100 | $209.906$ s | $12.2528$ s | $17.13\times$ | SageMath and Magma exact |
| $(30,7,11)$ | 8 | $8.958$ s | $1.2211$ s | $7.34\times$ | Magma exact; SageMath unsupported |
| $(66,5,7)$ | 12 | $12.302$ s | $1.6925$ s | $7.27\times$ | Magma exact; SageMath unsupported |

SageMath's public Brandt module rejects the two composite quaternion
discriminants. On those rows Sage.js checks its integral result internally
against the independent Jacquet--Langlands spectrum and externally against
Magma's complete characteristic polynomial.

The dimension-$100$ row proves that the exact implementation completes at the
intended scale, but its time and $446{,}115{,}840$-byte process peak show that
large-class-number competitiveness and the proposed memory envelope remain
open work.

## Where time remains

The source-current profiler attributes $99.77\%$ of the $(11,2)$ row and
$99.98\%$ of the $(37,2)$ row to named stages. On $(37,2)$ the largest
exclusive costs are:

| stage | calls | exclusive time |
| --- | ---: | ---: |
| exact norm-plan setup | 119 | $2.279$ s |
| lattice canonicalization | 147 | $0.898$ s |
| Eichler-order construction | 1 | $0.610$ s |
| direct neighbors | 9 | $0.506$ s |
| theta-series publication | 72 | $0.191$ s |
| Brandt-series orchestration | 1 | $0.113$ s |
| positive ideal equivalence | 28 | $0.105$ s |
| compiled theta recurrence | 64 | $0.076$ s |

This is no longer primarily a sparse-matrix problem. The remaining gap is in
the exact integral lattice/order pipeline around the compiled rank-four
recurrence: plan construction, canonicalization, order construction, and
neighbor objects. The native arithmetic kernels themselves are comparatively
small.

## Retained implementation

The completed implementation keeps ordinary exact Python as mathematical
authority and adds:

- immutable rank-four reduction and norm-enumeration plans;
- theta-prefix indexing and exact connecting-quaternion replay;
- traversal and local-splitting reuse;
- exact recursive Gram pruning instead of full coordinate boxes;
- exactly $\ell+1$ projective neighbors;
- independent direct-graph and Brandt-series Hecke algorithms with a measured
  automatic selector;
- compact detached integer rows with lazy public quaternion materialization;
- source-transparent GMP exact-vector and theta-count kernels; and
- dynamic, native Node, standalone GMP, and public Wasm differential evidence.

The final portable package contains 282 compiled production kernels and the
Brandt public-Wasm test reproduces the exact $D=11,N=1,T_2$ matrix,
characteristic polynomial, dimension, mass, and certificate. The standalone
rank-four executable also tests success, capacity failure, and memory failure
without a JS runtime.

## Gate disposition

- Exactness, dual-algorithm agreement, mass certificates, and the primary
  competitor oracle: **pass**.
- More than $3\times$ improvement over the original integral implementation:
  **pass** ($16.97\times$ and $18.45\times$ on the primary rows).
- Named-stage attribution above $90\%$: **pass**.
- Dynamic/native/standalone/Wasm exact recurrence evidence: **pass**.
- Completion at class number at least 100: **pass**, descriptively.
- Final resident time within $2\times$ Magma: **fail**, honestly measured.
- No stage above $10\times$ Magma on every medium/large row: **fail** on the
  dimension-$100$ row.
- Incremental memory within $2\times$ Magma and bounded growth over 100 fresh
  class sets: **not established**.
- Native Windows x64, Linux arm64, and macOS arm64 final receipts: **not
  collected here**; portability is covered by the source-transparent fallback,
  Wasm package, and CI, but no cross-platform timing claim is made.

## Validation disposition

- `pnpm build`: pass, including all 38 production native-kernel families.
- focused Brandt ideal, module, and standalone tests: 12/12 pass.
- strict CPython/Ruff/Pyright: 263 modules, zero errors.
- `pnpm architecture:check`: pass.
- `pnpm test:unit`: 84/84 files pass.
- `pnpm test:portable`: 73/73 files pass.
- focused public FLINT-Wasm Brandt test: pass against the authenticated
  282-kernel artifact.
- `pnpm test:native`: all builds, production-kernel tests, lifecycle fuzzing,
  and sanitizers reached by the suite pass; the suite then stops at an
  unrelated, reproducible dense-rational-matrix performance failure in
  `select_rows_300`, `select_columns_300`, and `stack_300x300` (about
  $34$--$35\,\mathrm{ms}$ against $15\,\mathrm{ms}$ budgets). No Brandt code or
  receipt depends on those operations, and their budgets were not changed.

The right public recommendation remains unchanged: use
`realization="ideal-classes"` when the distinguished integral quaternionic
lattice, pairing, or component group is required. Use the automatic
Jacquet--Langlands or supersingular realization for spectral work.
