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

The receipt generated from source commit `7c1be261c` records exact agreement
in all 180 alternating pairs. Summed per-field medians are 2.129 seconds for
Rust and 0.612 seconds for PARI 2.17.4, or a 3.48x weighted gap. The geometric
mean is 4.90x, p90 is 8.03x, and the maximum is 12.20x. Rust's summed stage
medians are 0.632 seconds for relation collection, 0.628 seconds for candidate
authentication, 0.724 seconds for unit and analytic completion, and 0.080
seconds for public preparation.
