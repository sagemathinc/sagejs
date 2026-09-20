# Row-6 Rust candidate diagnostic

This is an answer-free, candidate-only timing probe for
`x^3 - 2000000000010*x + 2000000000018`. It exercises the existing Rust
coefficient-box collector with bounded two-minute checkpoints and records
resource usage via Linux `/proc` sampling plus `getrusage(2)`.

The original shared Rust `PreparedCubic` API accepted only a unimodular `i64`
basis. Row 6's maximal order has index three in the equation order; PARI
2.17.4 gives the integral basis

```text
[1, x, (x^2 + x - 1333333333340) / 3].
```

The validated prepared-field path now represents that rational basis directly.
It derives maximal-order prime ideals as exact rank-three GMP lattices, handles
the index prime through the replayed multiplication algebra, and computes
valuations by membership in exact ideal powers. The older equation-order
diagnostics remain historical receipts; the executable's default route is now
the maximal order. Its output remains a relation-lattice candidate, not a
completed class group.

Run one checkpoint with:

```sh
./run.sh 1 120
```

The faithful translated collector is still protected by the
`UpstreamAssumedH1` capability and cannot be invoked for row 6. This is an
intentional truthful limitation, not a reason to weaken the capability.

`analyze_catalog.py` reproduces the factor-catalog ceiling and residue-scan
work directly from the neutral polynomial. It does not invoke PARI and does
not contain the class number or invariant factors.

## 2026-09-20 historical equation-order checkpoint

The coefficient-box path did **not** finish even at radius 1. The original
hard checkpoint terminated it after 120.022629029 seconds (22,568 KiB kernel
maximum RSS). A second instrumented run terminated after 10.014035887 seconds
and proved that the standalone factor base had already completed in
133.034173 ms with 1,202 ideals.

Bounded prefix probes then excluded the other setup stages:

- all 216 complete-prime initial cache rows took about 4.3 ms and left 986
  missing pivots;
- exact norm-form recovery took 2.080 microseconds, the prime sieve 0.274320
  ms, prime-product preparation 3.011099 ms, and the factor-base prime product
  0.054320 ms;
- radius-1 rational admission visited 24 shell points, tested 12 primitive
  canonical points, found one rationally smooth norm and rejected 11, all in
  0.035480 ms.

The first slow/failing boundary was the first smooth candidate's prime-ideal
valuation (`refine_element_factorization`). That candidate is `x - 1`, whose
norm is `3^2`, and the factor base has exactly one prime ideal above 3. In a
complete one-prime group the exact norm identity determines the local
valuation without repeated division. Adding that general shortcut eliminated
the hang: the same radius-1 command now finishes in 286.293295 ms, including a
134.080102 ms standalone factor-base construction and 146.891242 ms for the
collector's independently repeated factor base plus enumeration.

That completed diagnostic has 217 rows for 1,202 generators (216 seeded rows
plus the new `x - 1` relation), so it is visibly rank deficient and is not a
class-group candidate. This is also not evidence that the faithful row-6
algorithm is slow: the probe remains forced into the nonmaximal equation order
by that former boundary. It motivated the maximal-order bridge below.

`results/diagnosis.json` records the exact checkpoint and prefix measurements.
There is no full-rank relation presentation, candidate class group, HNF, or
Smith timing from this lane.

## 2026-09-20 maximal-order bridge

The new exact factor-base path derives bound 9,196 and exactly 1,130 ideals
over 740 rational primes. The 1,130 dimension agrees with the independently
recorded PARI prepared-field frontier; it is not supplied to the Rust runtime.
For the ramified index prime, the multiplication table proves the unique
character `[1, 1, 1]` modulo 3, its kernel has norm 3, and exact ideal powers
prove `v_P(x-1)=2`.

The radius-1 maximal-order run completes in 236.650092 ms including its own
factor-base construction; a separately timed factor-base construction takes
227.616573 ms. It begins with 203 independent rational relations and admits
one searched relation, leaving 927 of 1,130 pivots missing. A radius-64 run
visits 2,146,560 shell points in 3.015112088 seconds, admits ten searched
relations, and still leaves 918 pivots missing. The arbitrary-precision norm
front is required: even bounded radius-32 coordinates in this integral basis
can exceed `i128`.

These results close the representation/valuation blocker but also decisively
reject coefficient-box enumeration as the route to row-6 completion. The next
algorithmic milestone is to drive these exact maximal-order ideals through the
faithful small-norm/LLL relation schedule, continuation HNF, and completion
logic.
