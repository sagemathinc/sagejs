# Where the cutoff-768 target spends its remaining time

This is diagnostic evidence following the
[cutoff experiment](cubic-pari-cutoff-experiment.md), not a production change.
The target is $x^3-x^2-11x-63$, with class group $C_3$. The experimental
source is the `ca2e588b5` mathematical implementation with initial analytic
cutoff 768 and unchanged exact acceptance/refinement rules.

## Measured native phases

On `opt`, instrument a separate copy of the generated core with nested
monotonic clocks. Every generated exact helper records inclusive and exclusive
time; the field-analysis foreign call is separately wrapped. Run 1,100 fixed
effort-five target calls, subtract the first 100, and check that exclusive
durations sum exactly to the measured root's inclusive duration. No production
core or header is modified. The diagnostic copy explicitly disclaims its
inherited cache identity as an identity for the instrumented artifact.

The warmed instrumented root averages 2.361761 ms. The uninstrumented median
from the preceding experiment is 2.151935 ms; these measurements differ in
instrumentation and sampling and must not be treated as interchangeable.

| Disjoint top-level work on this target | Inclusive ms/call |
| --- | ---: |
| Foreign field analysis | 0.334191 |
| Certified GRH generator-bound search | 0.154163 |
| Adjacent-ideal relation collection | 0.481961 |
| Bounded exact closure attempt | 0.919126 |
| Remaining root/setup work | 0.472320 |

Within the closure attempt, analytic-plan construction takes 0.239642 ms and
evaluation takes 0.227481 ms. These are **included in** the closure row, not
additional top-level costs. Their combined cost is about 19.8% of the
instrumented root. Removing them hypothetically would not by itself explain
the whole difference from PARI's 1.234 ms diagnostic median. This is a cost
attribution argument, not a rigorous counterfactual timing bound.

Other distributed costs include integer square roots (27 ceiling-square-root
calls, 0.080024 ms inclusive), fixed-point analysis verification (0.078709 ms),
dependency-prefix reduction (0.125116 ms inclusive), and the root's own
exclusive work (0.239268 ms). These overlap the top-level categories above.

## Reconcile enumeration counters before optimizing them

The clock reports 284 calls to `_cubic_reduced_ellipsoid_candidate`, while the
earlier PARI debug trace reports thirteen small-norm candidates. Those are
different boundaries and do not establish a twentyfold difference in useful
search work.

A separate generated-core diagnostic logs the coefficient triple and returned
candidate status on every call. One complete target run gives:

| Event | Count |
| --- | ---: |
| Bounding-box proposals examined | 284 |
| Rejected by nonpositive canonical sign | 164 |
| Positive-sign proposals | 120 |
| Accepted primitive nonscalar ellipsoid candidates | 11 |

The three ideal parameter rows have respectively 84/5, 125/3, and 75/3
proposals/accepted candidates. The complete detached 64-slot output agrees
with the uninstrumented cutoff-768 target output.

In PARI 2.17.4 `buch2.c:Fincke_Pohst_ideal`, the `Nsmall` counter increments
only **after** a completed vector passes the primitive and nonscalar tests,
just before `factorgen`. PARI's `small_norm` summary therefore reports a
boundary comparable to the eleven accepted Sage.js candidates, not all 284
bounding-box proposals. Sage.js makes nineteen smooth-relation attempts in
total, including other relation producers, and publishes thirteen proof rows;
these counters also must not be conflated.

There is genuine enumeration overhead: Sage.js scans a lexicographic box and
filters it with the quadratic form; PARI uses centered, branch-pruned
Fincke--Pohst enumeration in Cholesky coordinates. But the entire Sage.js
candidate-filter helper costs only 0.114751 ms inclusive here. Even removing
that helper entirely cannot explain the whole remaining gap. A replacement
must also preserve the resumable cursor, proposal budgets, and exact relation
authentication; matching PARI's proposal order alone is not a correctness proof.

## Consequences for the next campaign step

1. Do not optimize only the analytic cutoff. Its target win is real but small,
   and the frozen survey already exposes additional refinement on 276 fields.
2. Do not infer a search-space failure from incomparable counters. The target
   already collects a comparable number of useful short elements.
3. Measure the latest **public** target path with the correct current runtime
   identity. The older public baseline and the newer native-only diagnostic
   cannot be combined into a current public performance claim.
4. Treat the remaining work as an integrated pipeline problem: field analysis,
   generator certification, relation construction, exact linear algebra, and
   analytic/unit certification each consume meaningful time. Select further
   changes by measured reducible cost and generality, not by the largest-looking
   raw loop counter.

## Evidence identities

Ignored local files in `build/cubic-next-evidence/`:

- `cutoff768-opt-exclusive.json`: SHA-256
  `f212f5f55f69ea834ff66c850a49266c81f027651642305d972f0f7bd999c6d0`.
- `cutoff768-opt-exclusive.log`: SHA-256
  `c92c092dfc8650af926ce0961b9d0b0cf29719ef85246446eb1a709be88fe783`.
- `cutoff768-ellipsoid-counter.log`: SHA-256
  `4f89f8806a4dad693c44e08dd12e4860123ce8ca6ed61e00b1bab013091eefa9`.

Instrumented generated copies and drivers are experimental artifacts, not
qualified native releases. This analysis supplies no new independent exact
replay, unseen-neighbor result, or public PARI win.
