# Field-3 complex logarithm columns audit

## Scope

This lane translates only the complex-place half of PARI 2.17.4
`buch2.c:get_log_embed` for the frozen mixed quartic
`x^4 - 2000022*x - 2000042`. It consumes the already qualified 153,088-bit
prepared embedding owner and the retained 301 principal generators. It does
not form the retained 301-by-13 unit transform, solve for units, estimate a
regulator, or consume an expected class-group answer.

The translated operation is:

1. preserve the original scalar-vs-column provenance;
2. for a column, reproduce `RgM_RgC_mul`'s source-order accumulation at the
   unique complex place;
3. use the real-axis logarithm dispatch for an exact scalar/axis value and the
   qualified complex AGM path only for a genuinely non-axis value;
4. retain the unweighted principal `(log(abs(z)), arg(z))`; and
5. publish PARI's raw complex-place entry by doubling both components.

All arithmetic source is ordinary CPython-parseable Python. The implementation
is a source-transparent native leaf with the same-source dynamic fallback.

## Owners and association

The public leaf admits only the exact frozen polynomial, common-denominator
integral basis, `make_M` state, prepared embedding matrix, source-order
principal generators, relation descriptors, and nonnegative relation matrix.
The `make_M` guard state requires a 153,152-bit root/M precision owner for the
153,088-bit request. The common basis denominator 37 remains attached until
the already-qualified embedding owner has been constructed; this leaf does
not cancel it or rebuild a differently associated matrix.

The complex row is represented by realified matrix rows 8 and 12. Matrix-vector
accumulation starts with the exact identity column and then follows
`RgMrow_RgC_mul_i` left-to-right. Exact zero stays exact until a nonzero real
term is added. Coordinates are bounded to one signed machine word before any
workspace or public-output mutation.

In this retained owner, columns 0 through 25 are all positive exact scalars.
The other 275 columns are non-axis at the complex place. They cover every
quadrant. Column 184 has the smallest real/imaginary component ratio and is
retained as a cancellation sentinel. The implementation still fails closed
for a future non-scalar real-axis value because that precision-association
case is not present in this owner.

## Independent exact checks

Before invoking translated logarithms, the checker replays all 301 exact norm
consequences from the retained multiplication tensor:

- construct multiplication-by-generator as an exact 4-by-4 matrix;
- compute its determinant by fraction-free Bareiss elimination; and
- compare its absolute value with the product of all 288 factor-base norms to
  the retained relation exponents.

This is a mathematical check over the full owners; its digest is only an
integrity receipt and is not used as proof.

The pristine PARI differential is frozen before translated execution. It
covers all 26 scalar/axis cases, representative nonscalar columns in all four
quadrants, the near-axis column 184, and terminal source column 300. Both the
unweighted principal components and the fully weighted raw packed entry are
compared bit-for-bit. One authentic nonscalar case is replayed through the
ordinary CPython and JavaScript paths as well as GMP.

## Transaction and batching contract

The batch width is at most four. Every owner, shape, precision, descriptor,
relation sign, source-order identifier, and coordinate bound is checked before
cache or output mutation. Results are first staged in private scratch and are
copied into both public outputs only after the entire batch succeeds.

The deterministic full-corpus schedule is 76 batches with starts
`0, 4, ..., 300`, width four except for the final width-one batch. The focused
differential deliberately does not spend several hours evaluating all 275
non-axis AGM logarithms; every unmeasured column follows the identical bounded
kernel and the schedule is recorded explicitly for the later accepted-column
and regulator campaign.

## Honesty boundary

This result establishes a source-order, cross-runtime complex-logarithm owner.
It does not establish that the final transformed logarithm matrix has full
unit rank, that reconstructed units are fundamental, or that the regulator is
accepted. Those claims require multiplying these raw columns by the separately
retained exact transform and completing the independent unit/regulator replay.

## Focused-run receipt

The authorized focused command was
`node bench/pari-class-group-port/check_field3_complex_log_columns.cjs`, under
the checker's 4 GiB address-space ceiling, 3.5 GiB aggregate-RSS abort, and
600-second wall clock limit. It exited with status 1 after reaching a peak
aggregate RSS of 1,417,144 KiB. The failure happened in the final CPython
same-source control, before publication: Python 3.14's `_pylong` helper loaded
the repository's `src/lib/decimal.py` after the checker prepended `src/lib` to
`sys.path`, rather than the standard-library `decimal` module it requires.

The checker now imports standard-library `decimal` before inserting repository
paths. This is a narrowly frozen harness correction; it does not alter the
mathematical implementation or any native artifact. A cheap preflight then
loaded `/usr/lib/python3.14/decimal.py`, imported this module after repository
path injection, and parsed one 153,088-bit JSON integer.

The subsequently authorized final focused run passed. It authenticated all
301 norm consequences and matched every packed component of all 32 selected
PARI columns across GMP, including all 26 scalar columns and six non-axis
quadrant/cancellation/terminal sentinels. The one-column CPython and JavaScript
controls passed, as did both transactional rejection checks. The monitored
wall time was 320,241 ms, native selected execution was 303,107.764737 ms, and
peak aggregate RSS was 1,489,284 KiB. The output digest is
`d256d2a4f2f2251a8cd6902206de37387b60fe27dd4bf44f0e7d771d00b6236d`.

Only the qualified prefix was published, at
`/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority/translated-log-columns/complex-log-prefix-f0a842ef820888e76b4421684a98a3cfd4654c47dee8896d63f204df7e7174fd.json`,
with SHA-256
`f0a842ef820888e76b4421684a98a3cfd4654c47dee8896d63f204df7e7174fd`.
No full 301-column approximate-log owner was evaluated or published.
