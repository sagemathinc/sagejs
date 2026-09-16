# Small odd-prime equal-degree factorization

This translates PARI 2.17.4 `FpX_factor.c` `Flx_edf_simple`, `Flx_edf`,
and `Flx_edf_rec`, not a deterministic replacement. Inputs are monic,
squarefree, equal-degree polynomial blocks of total degree at most four,
and the original squarefree layer's Frobenius polynomial. The latter may
have greater degree than the block: source reduction happens inside EDF.
Primehood and valid equal-degree decomposition are caller preconditions.

The public entry retains the source threshold
`r <= expu(p) * expu(expu(p))`. Simple EDF retains ten random shifts per
nonzero trace attempt, normalization after splitting, and left-before-right
recursion. The other branch uses the translated randomized quotient minimal
polynomial and recursive splitting of that polynomial, preserving factor
order and RNG consumption. No factor sorting is performed here.

Random polynomial coefficients are generated in ascending order by resident
PARI RNG calls. For unit factor degree, auttrace returns its input. For
factor degree two it performs the complete source auttrace square, including
the otherwise unused automorphism composition before trace composition.
`brent_kung_optpow(3,2,1)=3` requires four powers; their source prefix is
one, copy, square, multiply. Shared block evaluation supports this case.

Packed polynomials have nine zero-padded coefficients. Recursive frames
reserve 2,048 integer entries; the largest leaf requirement is the minimal
polynomial's 1,536-entry scratch at frame offset 144. Eight frames reserve
16,384 entries and cover the alternating EDF/recursive splitter paths for
at most four factors. Siblings reuse frames after the preceding child
returns. Owners/spans are disjoint by caller contract. Mathematical failures
may leave partial factor outputs and advanced RNG state, as documented.

The checker uses literal source EDF functions linked to pinned PARI. It
compares factor order, complete 66-word RNG state, random-polynomial and
scalar-shift call counts, all same-source scratch entries, preserved tails,
and atomic domain/storage guards across CPython, JavaScript, GMP and tagged
backends. Inputs include exhaustive squarefree equal-degree monic blocks
over F3/F5, three/four-factor splitting at larger primes, and blocks from
the four existing field polynomials. A dedicated mixed quartic checks
passing an unreduced original-layer Frobenius into a smaller block.

Historical diagnostics: the first CP run exposed the four-power auttrace
dependency and stopped explicitly. An initial successful 168-case test
preceded the original-layer Frobenius guard correction. The subsequent
in-flight 168-case receipt is not a current-source receipt: the source
changed during its lifetime. Only the final frozen-source replay should
be used for qualification. This is correctness validation, not timing.

Final frozen-source qualification: 169 cases pass all four backends,
including the original-layer Frobenius case and atomic invalid-input guards.
Artifact: `/tmp/sagejs-flx-small-edf-Rbr6t4/fixtures.json`.
Source SHA256: `a35f5a9c5be0fce0eb2915268a722e7473c63cd80bcfbc290626e6d4d65fca4a`.
Core SHA256: `ac2b1bf63381454f453669958ff60a0eb53df82083652f21e545c73583d926b6`.
Final run consumed 54.885312 CPU seconds, peak RSS 407,504 KiB under the
unchanged 4 GiB cap. All four diagnostic invocations together consumed
145.340169 CPU seconds, including the failed frontier run and superseded
receipts. Independent source review confirmed recursive order and frame
capacity after identifying the original-Frobenius guard correction.
