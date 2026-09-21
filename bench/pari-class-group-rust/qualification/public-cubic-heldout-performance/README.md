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

The receipt generated from source commit `c223dc332` records exact agreement
in all 180 alternating pairs. Summed per-field medians are 1.579 seconds for
Rust and 0.591 seconds for PARI 2.17.4, or a 2.673x weighted gap. The geometric
mean is 3.832x, p90 is 6.42x, and the maximum is 7.17x. Rust's summed stage
medians are 0.615 seconds for relation collection, 0.366 seconds for candidate
authentication, 0.506 seconds for unit and analytic completion, and 0.078
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
Borrowing the authenticated high-precision relation-log cache through unit
reconstruction and independent replay removes a complete arbitrary-precision
matrix clone per attempt. Summed completion fell another 3.4 ms to 0.621
seconds. The Rust total varied upward by 3.3 ms because relation collection
varied upward by 5.2 ms; the weighted ratio also reflects a 6.6 ms upward
change in the PARI sum.
The bounded precision driver now retains ownership of complete prepared and
authenticated evidence across retries. It clones only for a nonfinal attempt
and moves the existing evidence into the final permitted attempt, preserving
failure atomicity while eliminating the common full-presentation copy. Summed
completion fell from 0.621 to 0.588 seconds and the Rust total from 1.918 to
1.887 seconds.
Copy-on-write dependency reconstruction now borrows the lattice owned by the
authenticated presentation and allocates only when exact reduction is needed;
the sealed result no longer stores the same evidence twice. The 2.6 ms total
change and 3.3 ms upward completion-stage change are within campaign noise, so
this receipt treats the change as a storage/ownership improvement rather than
a stage-speed claim.
The current receipt adds rigorous early rejection of an unchanged continuation
candidate once the Belabas--Friedman tail is below `1/4` and the entire exact
index enclosure lies strictly above one. The formerly worst tiny field fell
from 54.46 to 41.69 ms and its completion stage from 28.67 to 15.06 ms; its
ratio fell from 12.13x to 8.65x. The retry-heavy field 0012's completion fell
from 107.91 to 101.35 ms. Whole-panel Rust time varied upward by 29 ms while
PARI varied upward by 25 ms, so the absolute aggregate is not claimed as a
speedup; the deterministic removed work and focused paired campaign establish
the optimization, while this clean receipt establishes the improved tail.
The current campaign also moves the dense/compact authentication crossover
from its conservative one-million-work ceiling to the measured 20,000-work
boundary. The formerly worst tiny field's authentication fell from 15.80 to
4.82 ms and its complete call from 41.69 to 30.72 ms. Fields 0019, 0020, and
0022 similarly fell from 26.95 to 24.77 ms, 26.36 to 22.40 ms, and 43.94 to
35.54 ms. Across the panel, authentication fell by 21.67 ms and total Rust
time by 15.44 ms; the maximum ratio fell from 8.65x to 6.86x.
The current campaign replaces a checked-overflow branch on every dependency
multiply-add with one rigorous absolute-sum proof per dependency. Proven rows
use branch-free `i128` accumulation; unproved rows restart exactly in GMP.
The same verifier covers both candidate authentication and final completion
replay. Relative to the preceding clean receipt, summed Rust time fell by
64.23 ms, authentication by 33.36 ms, and completion by 28.95 ms. Field 0012
fell from 364.76 to 337.28 ms. PARI's simultaneous sum fell by 7.54 ms, and
its smallest field varied enough to move the maximum ratio upward; the
absolute Rust stage reductions and weighted ratio are the useful comparison.
Compact class-map validation now consumes retained relation-matrix columns in
place. It accumulates only quotient-width exact coordinates and compares
machine-word principal-relation transcripts directly with borrowed GMP
coefficients, while the generic diagonal representation retains the original
materialized-vector path. This removes a full GMP relation-vector allocation
and clone at each of three independent exact validation boundaries. Relative
to the preceding clean receipt, all twelve Rust field medians fell: summed
authentication dropped by 85.58 ms, total Rust time by 84.81 ms, and field
0012 by 22.99 ms. PARI varied upward by 4.32 ms. The weighted ratio therefore
fell from 3.05x to 2.89x, the first clean campaign below 3x.
Final sealed-evidence authentication now reuses the same rigorously bounded
batch verifier instead of folding every dependency and unit relation through a
fresh GMP accumulator for every column. A row is admitted to the fixed-width
path only after its complete absolute sum is proved to fit in `i128`; all
unproved rows restart exactly in GMP. Relative to the preceding clean receipt,
summed Rust time fell by 127.81 ms, candidate authentication by 17.03 ms, and
unit/analytic completion by 50.48 ms. Field 0012 fell by 37.94 ms to 276.34
ms. PARI simultaneously varied downward by 20.32 ms, so the weighted gap fell
from 2.89x to 2.77x; the maximum remains dominated by variation in a
few-millisecond PARI case.
Answer-free relation continuation now also retains the previously authenticated
quotient map as producer data. Reuse requires the identical square block and
exact surplus prefix plus an independently recomputed, unchanged class order;
the enlarged presentation then rechecks every relation image, mixed-modulus
right inverse, dependency, saturation certificate, and freshly solved
generator-order witness. Relative to the preceding clean receipt, summed
authentication fell by 18.99 ms, total Rust time by 24.50 ms, and field 0012
by 14.72 ms. PARI simultaneously varied downward by 3.67 ms, taking the
weighted gap from 2.77x to 2.75x.
An unchanged quotient map now also retains its previously authenticated
generator-order witnesses as producer data. Their relation coefficients are
extended only with exact zeros, and the complete nonzero target equations are
replayed against the enlarged relation matrix through a conservatively bounded
`i128` route with whole-row GMP fallback. A CPU-pinned 31-pair A/B comparison
on retry-heavy field 0012 reduced authentication by 4.96 ms and total time by
5.49 ms. In the clean campaign the same field fell by 3.03 ms, including 3.96
ms in authentication. Unrelated relation and completion variation increased
the twelve-field Rust sum by 9.82 ms, so the aggregate 2.748x ratio is
statistically unchanged from 2.746x; no aggregate speedup is claimed.

The class-map binding is now an injective versioned binary encoding rather
than a decimal-text encoding of every exact coordinate. Machine-size values
use a tagged fixed-width representation; larger GMP values use an explicit
sign and little-endian magnitude length. A CPU-pinned 31-pair A/B comparison
on field 0012 reduced authentication by 5.56 ms and the complete call by 4.99
ms. A separate 7-pair diagnostic across the twelve fields reduced summed
authentication by 22.59 ms and total time by 23.18 ms. In the clean campaign,
authentication fell by 6.83 ms, but unrelated preparation, collection, and
completion variation raised Rust's sum by 16.17 ms while PARI rose by 16.56
ms. The ratio change from 2.748x to 2.699x is therefore not an aggregate Rust
speed claim.

Callgrind supplies deterministic work evidence for the same field-0012
executable. The preceding generator-witness-cache binary executed
2,977,680,082 instructions; the binary-binding executable executed
2,884,489,129, a reduction of 93,190,953 instructions (3.13%). The former
roughly 160.8-million-instruction binding computation disappears from the
reported call graph, and inclusive class-map construction falls to 72.1
million instructions. The two raw profiles have SHA-256 digests
`0dd9be2c10b53317a7851f95015b85ba58dafe3d20676309604ea49a040fc89a`
and `dc78ed296a1fe47b657b81113a5430e48a1ed9401f619d664ffb31e3b360a0c4`,
respectively. They were collected on the same optimization VM with Valgrind
3.22.0, one public coefficient-only request, and identical Callgrind options.

The collector factor-base authority, complete relation/principal-generator
transcript, and final principal-witness binding now use the same binary exact-
integer representation. Their independent domain separators were bumped, and
the consumer still hashes every live value before entering the trusted compact
path. A CPU-pinned 31-pair field-0012 A/B comparison reduced authentication by
1.26 ms and the complete call by 1.62 ms. Callgrind fell from 2,884,489,129 to
2,860,684,127 instructions, a deterministic reduction of 23,805,002 (0.83%).
In the clean panel, summed authentication fell by 19.31 ms and Rust total time
fell by 44.12 ms; PARI simultaneously fell by 10.67 ms, and the other Rust
stages also varied downward. The focused comparison and instruction count
establish the authority-encoding gain; the complete aggregate reduction is
not attributed solely to it.
