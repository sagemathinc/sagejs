# Row-6 Rust candidate diagnostic

This is an answer-free, candidate-only timing probe for
`x^3 - 2000000000010*x + 2000000000018`. It exercises the existing Rust
coefficient-box collector with bounded two-minute checkpoints and records
resource usage via Linux `/proc` sampling plus `getrusage(2)`.

The current shared Rust `PreparedCubic` API accepts a monic `i64` polynomial
and a unimodular `i64` basis. Row 6's maximal order has index three in the
equation order; PARI 2.17.4 gives the integral basis

```text
[1, x, (x^2 + x - 1333333333340) / 3].
```

That denominator cannot be expressed by the current API. Consequently this
probe uses the identity basis and measures only the equation-order search. Its
output is not a class-group result, even if it happens to reach full rank.

Run one checkpoint with:

```sh
./run.sh 1 120
```

The faithful translated collector is currently protected by the
`UpstreamAssumedH1` capability and cannot be invoked for row 6. This is an
intentional truthful limitation, not a reason to weaken the capability.

`analyze_catalog.py` reproduces the factor-catalog ceiling and residue-scan
work directly from the neutral polynomial. It does not invoke PARI and does
not contain the class number or invariant factors.

## 2026-09-20 checkpoint

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

Thus the first slow/failing boundary is the first smooth candidate's
prime-ideal valuation (`refine_element_factorization`), before a new relation
can be reported. This is not evidence that the faithful row-6 algorithm is
slow: the probe is forced into the nonmaximal equation order by the current
basis representation, precisely where ideal valuation at the index prime is
not a valid substitute for maximal-order arithmetic.

`results/diagnosis.json` records the exact checkpoint and prefix measurements.
There is no candidate class group, relation presentation, HNF, or Smith timing
from this lane.
