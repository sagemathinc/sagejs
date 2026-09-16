# Kummer correction resultant valuation

This checkpoint translates PARI 2.17.4 `base2.c:ZpX_resultant_val`,
`Zlx_sylvester_echelon`, and the square, early-abort branch of
`hnf_snf.c:zlm_echelon`. Copyright belongs to the PARI group;
the translation is GPL-2.0-or-later, without warranty.

## Boundary and source correspondence

`pari_kummer_resultant_valuation(f, g, n, degree_g, p, limit, work, trace)`
accepts ascending signed integer coefficient buffers, a monic cubic or
quartic `f`, and `0 <= degree_g < n`. Primehood is a caller precondition.
Independent work and trace owners require `n*n+n` and 25 entries respectively.
Trace entry zero counts attempts; triples contain the source precision label,
actual modulus, and valuation (`-1` for a zero pivot).

The source multiplication-by-g matrix is built column by column using
multiplication by x and reduction modulo f. Elimination chooses the first
minimum-valuation pivot in each bottom row, swaps columns, normalizes the unit
part modulo the reduced modulus, and eliminates earlier columns in descending
order. The modular inverse reuses the already translated PARI `Fl_inv` helper.
There is no determinant shortcut or replacement factorization algorithm.

The literal precision behavior matters: after an unsuccessful attempt, q is
squared even when the precision label m is subsequently clamped to the caller
limit. Thus the actual q can exceed p^limit. This behavior is preserved and
the oracle checks the full attempt trace, not just the returned valuation.

The current representation corridor is q <= 3037000493, limit <= 64. Larger
actual moduli raise explicitly, including during escalation, rather than
returning a mathematical answer. Dimension and buffer checks precede mutation;
a later precision frontier may leave scratch and trace partially written.
No mathematical safety limit or production dispatch is changed.

## Qualification

Run the checker with the pinned PARI source directory and 2.17.4 archive.
The checker extracts the original source functions and adds trace observation,
then links PARI's actual echelon implementation. The unused large-modulus
branch is disabled in this word-corridor oracle. A separate PARI program
constructs actual `idealprimedec_kummer` primitive polynomial inputs from
factorization, basis conversion, centering and primitive-part extraction.
It excludes index-dividing primes from these straightforward Kummer fixtures.

Final formatted source receipt:

- `/tmp/sagejs-kummer-resultant-YpJvt7/fixtures.json`.
- 481 cases across CPython, generated JavaScript, GMP and tagged native.
- 15 actual unramified, noninert Kummer generators from the four selected
  cubic/quartic fields; two require the scalar correction.
- Signed polynomial controls, zero resultants, and precision escalation
  (including clamped-label/squared-modulus behavior).
- Exact valuation and entire precision trace agree with PARI. Native scratch
  agrees with CPython, including sentinels. Six fail-before-write guards and
  the later word-modulus frontier are exercised in all four modes.
- Source SHA256 `ecd673e09a08aa2f77fa441bdc6e439409f0c8f40a75bf229e5435715519f545`.
- Core SHA256 `38851d8f118e3231e39f9300d9ffc2cf56186266536d913686e11918c8d7cd07`.
- Metered final run: 6.74 CPU seconds including compilation, 186876 KiB peak
  child RSS; one thread and 4 GiB address cap. This is not a speed claim.

Still excluded: arbitrary degree, nonmonic input, large word/big-integer
moduli, and the surrounding Kummer factor/basis/correction driver. This
dependency checkpoint does not constitute end-to-end class-group completion.
