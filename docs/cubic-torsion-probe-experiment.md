# Exact torsion-only recovery probe

Research checkpoint, 2026-09-09. This is an isolated source-copy experiment,
not a production shortcut, a public timing result, or a new PARI win.

## Mathematical rule and placement

The [elementary norm argument](cubic-recovery-conditioning.md#an-elementary-exact-negative-certificate)
proves that a non-torsion unit of a complex cubic field satisfies
$|\log|\sigma(u)||>1/5$. It uses no GRH assumption. The full class-group
algorithm still has its existing explicit analytic assumptions.

After computing an exact HNF kernel basis from authenticated principal
relations, the probe computes outward generator-log intervals at the existing
analytic scale and precision. It then forms signed interval dot products
for every kernel basis vector. For scale $S>0$, it certifies torsion only if
every resulting interval $[L,U]$ satisfies $-S\leq5L\leq5U\leq S$.
Since the basis spans the entire integer kernel, success proves that the
current relation set supplies no non-torsion unit. Conditioning that same
basis with LLL cannot change this mathematical fact.

The predicate in `bench/class-unit-groups/cubic-torsion-prefix.py` checks
only the interval arithmetic. Authentication of the relations, HNF basis,
and interval enclosures remains the caller's responsibility. Its result must
not be treated as a standalone certificate for arbitrary matrices.

The builder inserts this probe before the existing recovery LLL call. On
success it returns the existing insufficient-unit status `0`, without touching
the unit result owner. On any inconclusive interval test it executes the
original LLL, coefficient-precision calculation, logarithms, reconstruction,
and regulator authentication. That entire original tail is byte-identical.

An unsuccessful *new low-precision* log attempt is inconclusive; it does not
authorize a torsion conclusion. The original higher-precision computation
still runs and retains its fatal checks. Its complete active log rectangle is
refilled before use, so partially written probe logs are not consumed as proof.
Arena exhaustion is not cleared or reinterpreted as successful recovery. The
additional work could introduce resource declines outside the tested corpus;
this is one reason the experiment is not production-qualified.

The low-precision probe avoids choosing precision from potentially large raw
dependency coefficients. Large coefficients may simply widen the dot-product
intervals until the test becomes inconclusive; there is no heuristic rounding
or assumption that a tiny midpoint means zero.

## Source and correctness evidence

Input is the isolated resumable-plus-batch-log source, SHA-256
`64aa44ef9fb7628a74bf34038d92b6031d8411e3f36bdec729bc058a5954ba79`.
Probe source SHA-256:
`54e8b63ea830fb07acf79ea92a5f77c979c3ad694ba0a87b2304216eb26220e9`.
The transformation adds 2,139 Python bytes. No production source, source
allowance, arena limit, or public receipt contract is changed. The larger
resumable scheduler also remains isolated. Do not promote these additions by
raising the source allowance.

On the frozen 1,012 development fields, all observations and every output
slot agree with the input source, including all 51 declines. There are 961
acceptances, no gains, no losses, and no exceptions. Every accepted class
number and invariant agrees with the corpus. This is not independent exact
replay of the experimental source and does not exercise the reserved unseen
neighbors.

Tests execute the actual predicate against 1,200 deterministic exact rational
interval cases, including signed 130-bit-plus coefficients and scales up to
256 bits. Explicit cases cover equality at the threshold, each side outside
the threshold, malformed intervals, nonpositive scales, and empty dimensions.
The original recovery fault-injection suite runs against the transformed
helper, covering fallback failures and transactional result publication.

A separate compiled arena witness runs 185 cases through JavaScript, GMP,
and fmpz, with poisoned inactive matrix rows and columns. All agree with an
independent BigInt interval oracle. The witness includes an unbounded resident
integer vector, matching the production call graph's fmpz qualification;
the initial resource-only witness was not qualified for the fmpz backend and
its failed test is retained. This is not a compiler-policy change. The first
control-flow test also had a corrected harness error (passing a local as a
keyword parameter); the earlier failed log is retained.

## Controlled timing

On `opt`, pinned to CPU 0, seven rounds alternate forward/reverse order.
Each sample has 64 native calls or 256 fresh PARI `bnfinit(f,0)` calls, following
20 warmups. Native execution retains the existing 5, 1, 7, 8 retry policy and
preallocated input/scratch boundary. These are uninstrumented medians, not
public API or certificate-replay times.

| Polynomial | Resumable + batch logs | Torsion probe | PARI |
| --- | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 5.084 ms | 4.276 ms | 1.543 ms |
| $x^3+27x-159$ | 4.512 ms | 4.053 ms | 1.504 ms |
| $x^3-x^2+56x+99$ | 4.760 ms | 4.403 ms | 1.504 ms |
| $x^3+146x-156$ | 5.336 ms | 4.775 ms | 1.699 ms |
| $x^3+9x-55$ | 1.807 ms | 1.800 ms | 1.188 ms |
| $x^3-x^2+3x-4$ | 1.274 ms | 1.285 ms | 1.008 ms |
| $x^3-x^2-11x-63$ | 2.172 ms | 2.200 ms | 1.227 ms |

Median paired probe/baseline ratios are 0.8431, 0.8996, 0.9249, 0.8998,
1.0028, 1.0096, and 1.0057. Separate medians and the median paired ratio need
not move in the same direction on noisy small differences. There is no claim
of universal non-regression; the controls have small paired regressions.

## Profiling the reason for the improvement

Separate generated-core instrumentation compares all 64 output slots with
the uninstrumented reference for 1,100 calls, discards the first 100 calls,
and checks exact conservation of inclusive/exclusive durations. These times
include instrumentation overhead and are not interchangeable with the table.

For the target, recovery runs once, its torsion predicate runs once, and
**recovery LLL is never called**. Total recovery takes 0.202 ms, including
0.065 ms in HNF and 0.021 ms in the predicate; the rest includes log formation
and orchestration. The earlier conditioned profile took about 1.05 ms in
recovery, including 0.81 ms in LLL.

For $x^3+27x-159$, all three recovery attempts likewise skip LLL. Together
they take 0.267 ms, including 0.056 ms in HNF and 0.012 ms in the predicate.
Thus the speedup is tied to a proved, exercised early-exit condition, not a
global removal of conditioning. The LLL fallback still exists for other inputs.

## Next steps and remaining limits

The proof is written down, but is not yet Lean-formalized. Formalizing the
norm-to-log-gap implication and the interval/kernel composition would be a
well-scoped first certificate project.

Before production integration, refactor the scheduling/log orchestration
without exceeding the source allowance, measure inconclusive-probe cases and
resource behavior, and rerun independent replay plus platform qualification.
The remaining target gap is not mostly recovery: adjacent relation collection
was about 2.3 ms in the earlier instrumented profile, versus PARI's roughly
1.5 ms for the entire computation. That is the next substantial algorithmic
target. Presentation refresh, about 0.01 ms, is not.

The current candidate filter contributes about 0.73 ms inclusive; eliminating
it alone cannot close the remaining gap. The
[earlier counter audit](cubic-cutoff768-cost-ledger.md#reconcile-enumeration-counters-before-optimizing-them)
also explains why bounding-box proposal counts cannot be compared directly
with PARI's count of primitive nonscalar small-norm elements. Preserve that
distinction in any next enumeration experiment.
