# Alternating held-out cubic performance campaign

This harness measures the twelve permanent cubic regression fields after their
correctness remediation. It reuses only the frozen public polynomials from the
original held-out selection. Expected answers are never loaded. Every measured
pair alternates the Rust coefficient-only executable and the authenticated
PARI 2.17.4 public-call control; exact public results are compared in memory and
discarded.

The checked receipt contains raw kernel/stage timings, field identities,
aggregate ratios, artifact identities, and booleans recording exact agreement.
It contains no polynomial coefficients, class numbers, invariant factors,
discriminants, signatures, units, or hashes of those answers.

Run from the repository root:

```bash
python3 bench/pari-class-group-rust/qualification/public-cubic-heldout-performance/run.py
```

The process pins itself and both child arms to the first logical CPU in its
inherited affinity set. One excluded warmup per arm precedes fifteen measured
alternating pairs per field. Kernel clocks exclude process startup and JSON
serialization, matching the existing public-cubic performance boundary.

The campaign must run from a clean committed source closure. Commit changes to
this harness before running it; the generated `receipt.json` is the sole
expected post-run change within that closure.

## Current result

The receipt generated from source commit `2233d78a9` records exact agreement
in all 180 alternating pairs. Summed per-field medians are 1.915 seconds for
Rust and 0.578 seconds for PARI 2.17.4, or a 3.31x weighted gap. The geometric
mean is 4.82x, p90 is 8.46x, and the maximum is 12.76x. Rust's summed stage
medians are 0.612 seconds for relation collection, 0.543 seconds for candidate
authentication, 0.625 seconds for unit and analytic completion, and 0.077
seconds for public preparation. Exact continuation retains the FLINT
fraction-free factorization only when the selected square relation block is
identical and the previous surplus is an exact prefix; it recomputes and
independently verifies the complete enlarged presentation. This reduced the
Rust sum from 2.045 seconds and candidate authentication from 0.593 seconds in
the preceding receipt. On the retry-heavy field 0012, authentication fell from
196.1 to 178.7 ms and the complete call from 406.1 to 390.2 ms. Minting the
immutable class-map binding once after exact constructor verification then
reduced summed authentication from 0.571 to 0.548 seconds and the Rust total
from 2.013 to 1.995 seconds. Field 0012 fell again to 169.7 ms authentication
and 379.9 ms total. The geometric, p90, and maximum ratios remain sensitive to
simultaneous PARI variation on the few-millisecond cases.
Loading the exact unit exponents before evaluating compact principal generators
then omits a generator only when it has zero support across every unit. This
reduced summed unit/analytic completion from 0.693 to 0.625 seconds and the
Rust total from 1.995 to 1.915 seconds, while retaining the same independently
enclosed regulator. Field 0012 fell again to 366.0 ms total.
