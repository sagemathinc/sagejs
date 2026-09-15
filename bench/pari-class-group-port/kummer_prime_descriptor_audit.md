# Prepared Kummer prime descriptors

`kummer_prime_descriptor.py` connects PARI 2.17.4
`base2.c:idealprimedec_kummer` from a prepared number-field structure and one
actual monic factor with multiplicity. It does not factor the defining
polynomial and does not run `nfinit`. The equation-index condition remains a
caller precondition: the prime must not divide that index.

Inputs are the monic defining polynomial, integer `invzk`, `zkprimpart` as a
column-major coefficient matrix and its column degrees, positive `zkden`, the
integral multiplication table, factor, multiplicity, degree and prime.
These are prepared `nf` data or factorization output, not supplied descriptor
answers. Outputs contain the actual centered generator, tau, residue degree,
ramification index, inert marker and correction diagnostics.

## Source correspondence and representation boundaries

- `FpX_div` selects the small word-prime `Flx_divrem` basecase, including at
  prime 2. The existing quotient-only `pari_flx_div` is reused. This does not
  substitute binary polynomial division, despite prime 2.
- `poltobasis` follows integer `ZM_ZX_mul`, then signed `centermod`, preserving
  both signs at the half-modulus tie. The integer matrix is not a denominator-
  cleared rational approximation: it is the actual `nf_get_invzk`.
- `nf_to_scalar_or_alg` retains its scalar-column shortcut. Otherwise basis
  polynomials are combined in ascending basis order and rational coefficients
  normalized against `zkden`. Fixed coefficient slots replace generic
  polynomial/scalar objects. Zero polynomial products are not multiplied out;
  generic dispatch and object-allocation costs are not reproduced.
- `Q_content_v` descends through the actual polynomial degree, with separate
  integer/fraction `Q_gcd` branches. Content is positive; exactly one becomes
  absent. Primitive extraction copies when content is absent, uses exact
  division for integer content, and follows `Q_muli_to_int`/
  `Q_divmuli_to_int` branches for fractional content. Integer and rational
  representation primitives remain explicit mappings, not identical machine
  instruction claims.
- Correction runs only at multiplicity one, with
  `v=f-v_p(cw)*n`, unchanged `ZpX_resultant_val` threshold `v+1`, and the source
  signed constant-coordinate adjustment. Existing resultant word-modulus and
  precision frontiers remain unchanged and raise explicitly.
- `zk_multable` copies its first column and invokes the existing integral-basis
  multiplication for later columns. Published tau is detached, unlike source
  shallow aliases. Inert tau is scalar one, marked in state; no fake identity
  matrix is produced. Mathematical errors precede publication, but resource
  exhaustion during scalar stores is not transactional.

All input/output/scratch owners must be disjoint. Buffer lengths and obvious
dimension/canonicality constraints are checked before mutation. Arbitrary
inconsistent prepared fields, composite primes and nonfactors are not claimed
to be validated. Numeric domains are cubic/quartic and word primes at most
3037000493, further restricted by the existing resultant precision corridor.

## Qualification

The checker extracts and instruments the actual upstream Kummer body and
also compares every returned descriptor with the uninstrumented PARI entry.
Its oracle factors the four selected defining polynomials at 2/3/5/7/37,
skipping primes dividing the equation index. There are 30 actual descriptors:
two corrected generators, seven multiplicities greater than one and three
inert cases. The cubic at prime 5 supplies an actual fractional content `1/3`.
Exact generators, tau, primitive polynomials, content, thresholds and branch
flags match on CPython, generated JavaScript, native GMP and tagged backends.
Twenty-eight malformed-input controls preserve all owners on preflight
failure; all outputs and scratch buffers retain sentinel tails.

Final artifact: `/tmp/sagejs-kummer-descriptor-d0LHo3/fixtures.json`.
Candidate SHA256:
`7dbe7fbad68876a69d3014a0b0bf4f012c3e18a752fd969434214edc3c2ae306`.
Core SHA256:
`1f89554b2d915ababfe76e4bd91a1bc51b61e36bb9ec36dd21da6b7261c94742`.
Execution was metered under a 4 GiB address-space cap. These are correctness
receipts, not performance comparisons or an end-to-end class-group result.
