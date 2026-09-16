# First dependence and quotient minimal polynomial

This checkpoint translates PARI 2.17.4 `get_powers`/`pol_min`, required by
the non-field quotient splitter. It does not substitute a characteristic
polynomial or compute a full kernel and select its first basis vector.

`get_powers` uses `lgcols(mul)`, one greater than the algebra dimension.
Consequently it constructs dimension+2 columns through a^(dimension+1),
performing dimension matrix-vector products even if an early dependence
exists. The port retains this work, then stops Gaussian elimination at the
first dependent column, matching the source `FpM_deplin` path.

The matrix-vector products use exact integer dot products and one final
reduction per row (`FpM_FpC_mul`), not the small-word matrix product dispatcher.
Zero products are computed but not added, as in `ZMrow_ZC_mul_i`. The resulting
dependence vector is trimmed exactly as `RgV_to_RgX`. In an algebra basis
beginning with 1 this is the element minimal polynomial; for arbitrary test
matrices it is only the annihilator relative to the first basis vector.

The shared modular kernel now has a distinct dependence mode and output
capacity of `columns`, while the unchanged full-kernel API reserves
`columns²`. On independence, dependence mode returns zero without writing
output. On dependence it writes the complete vector including zero tails and
returns the first dependent column one-based. Private elimination stops there.

Component receipt `/tmp/sagejs-small-prime-kernel-bJiHXY/fixtures.json`
checks 1,697 matrices across CPython, JavaScript, GMP and tagged execution,
including the exact partial mutated matrix and dependence vector, plus the
existing full-kernel regression. The connected radical/quotient regression
also still passes all 24 cases:
`/tmp/sagejs-quotient-projection-UomYTp/fixtures.json`.

The connected minimal-polynomial receipt
`/tmp/sagejs-quotient-minpoly-Uhun1d/fixtures.json` passes 288 source-oracle
cases in all four execution modes, including every power column, the first
dependence index, coefficient tails and invalid-input guards. The cases are
scalar, companion and general matrices relative to e1; no actual projected
number-field multiplication matrix is claimed here. An additional direct
CPython smoke check passes 390 companion polynomials.

Reproduce under the existing metered process wrapper:

```sh
node bench/pari-class-group-port/check_quotient_minpoly.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

Core SHA-256:
`64e2f96915082f366e6bba86b840be66bf99952d6fa77d1164da1229125a5950`.
Initial compilation/replay used 9.044965 CPU seconds and 251572 KiB peak
child RSS; the final cached replay used 2.158946 CPU seconds, under the
unchanged 4 GiB cap. This is correctness qualification, not timing parity.
Strict library checking passes with zero errors/warnings; the existing stale
optimizer-manifest architecture failure recurs. The earlier module-cache
failure remains unresolved; no full-suite green status is claimed.

## Quadratic-root companion dependency

`small_prime_quadratic_roots.py` translates the direct odd-prime degree-at-most
two root branch, including source valuation/normalization, Jacobi test,
Tonelli--Shanks and sorted distinct roots. It preserves the nonzero-PI modular
power schedules, including the separate base-two path. Reciprocal-based word
multiply/square primitives are explicitly represented by exact product modulo
p; this is not a claim of equal instruction count or performance.

The deterministic nonresidue search currently supports source candidates
2,3,5,7. The later prime-iterator branch is an explicit exception, tested
without output publication; primes 3 and 37 do not require that branch.
The internal nonresidue helper assumes a prime congruent to 1 modulo 4, as
ensured by its square-root caller. Higher-degree root splitting is still
outside this implementation.

Source review found a value-correct but workload-incorrect pure-monomial
shortcut: it skipped normalization of the residual nonzero constant. That
normalization must execute before singleton-zero publication, including the
source inverse for a nonmonic coefficient. This illustrates why output-only
differential tests do not by themselves establish faithful source work.

After that correction, `/tmp/sagejs-small-prime-roots-WYlKEz/fixtures.json`
passes 6,277 PARI/CPython/JavaScript/GMP/tagged cases: 2,599 root cases,
883 square roots and 2,795 modular powers. The separate CPython tracked-call
regression verifies one normalization inverse for 2*x and 2*x², and none
for the constant 2. The tests compare values and this targeted call count;
they do not instrument every word operation in the square-root algorithm.

## Remaining integration

The subsequent [quotient splitting checkpoint](quotient_split_audit.md)
connects this block and the recursive image worklist. The following paragraph
records the frontier at this earlier minimal-polynomial checkpoint.

The next connected block must compute the source second kernel vector's lift
`a=M2*v`, form its exact integral multiplication matrix, reduce it, project
it to the quotient, and use this minimal polynomial and roots to form image
ideals. Use integer matrix-vector products for the lift. Existing general
basis multiplication-table output is row-major; transpose explicitly or build
source `zk_ei_mul` columns directly before using column-major quotient tools.
Kummer removal, further splitting and full prime descriptors remain required
before the original class-group preparation boundary is closed.
