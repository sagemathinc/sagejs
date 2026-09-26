# Field-3 C6 high-precision `getfu` preparation

## Result

This lane closes the bounded implementation boundary for C6 without running
the authentic 153,088-bit attempt.  Ordinary CPython-parseable source now
connects an accepted C5 unit-lattice owner to rebuilt embeddings and the exact
64-cell multiplication tensor, runs the existing PARI 2.17.4 mixed-quartic
`getfu` translation once, and publishes only one of:

- two exact quartic units, normalized logarithms, adjusted getfu factor, and
  the complete adjusted 301-by-2 raw unit transform; or
- the faithful terminal flag-zero result `not_given(LARGE)` or
  `not_given(PRECI)`, with no exact-unit arrays exposed and no Buchall retry.

The authentic field-3 result remains deliberately unpublished.  C6 cannot run
until the complete C5 owner exists, and this lane was explicitly forbidden
from using an old suffix/unit answer fixture or launching the expensive 153k
calculation.

## Source correspondence

The connected cut is `pari-2.17.4/src/basemath/buch2.c:1129-1172`:

1. rebuild `matep` with `fixarch`;
2. apply `U = lll(real_i(matep))` retained by C5;
3. reject nonnegative `RgM_expbitprec` as `LARGE` or `PRECI`;
4. compute `gexp`, `RgM_solve_realimag`, and `grndtoi`;
5. authenticate each reconstructed coordinate vector using `zk_inv` semantics,
   norm `±1`, non-scalarity, and an exact product-one replay;
6. choose the inverse exactly when its coefficient squared norm is smaller;
7. apply that same sign to the logarithm column, getfu factor, and full raw
   unit-transform column.

The arithmetic leaf remains
`getfu_mixed_quartic.py:pari_getfu_mixed_quartic`.  C6's root rederives all four
prepared 18-cell arrays from C5's pre-getfu clean matrix and factor and compares
them cell-for-cell before calling that leaf.  The arrays are redundancy for an
authenticated join, not trusted numerical answers.

## Bounded storage

The old leaf rejected every precision above 768 bits.  It now admits word
precisions through 153,088 bits, but only after a preflight which occurs before
state or public-output writes:

- 3 cells for each resident exponential and pi cache;
- 512 coefficient cells and 91 binary-splitting stack cells through 768 bits;
- 16,385 coefficient cells and 105 stack cells above 768 bits, matching the
  already qualified neutral 153,088-bit `pi`, `log(2)`, and complex-exp probes.

The C6 root performs the same preflight.  All exponential, solve, rounded-unit,
normalization, and adjusted-Wraw arrays are caller-owned scratch.  Exact unit,
log, factor, Wraw, and success-state buffers are copied only after all gates
pass.  Exceptions leave every public buffer unchanged; terminal `LARGE` and
`PRECI` publish only their status record.

## Authenticated publication

`field3_high_precision_getfu_coordinator.cjs` requires immutable mode-0444 C5,
embedding, and native-candidate owners with explicit byte hashes.  It checks
their ancestry and field identity.  In particular, C5 must carry well-formed
full-terminal, C3, and accepted-C4 digests plus a terminal analytic acceptance
state at the same precision.  The coordinator then independently replays:

- both multiplication matrices from exact unit coordinates and the 64-cell
  tensor;
- determinant/norm `±1` and multiplication by the computed inverse equal to
  one;
- the strict coefficient-norm inverse choice;
- the corresponding signs on logs, factor columns, and all 602 Wraw cells;
- the C6 success/terminal state contract.

Only then does it atomically rename a content-addressed mode-0444
`field3-c6-getfu` owner.  Repeating publication is byte-idempotent.  A terminal
owner is rejected if it contains any exact-unit material.

## Focused evidence

Run:

```bash
node bench/pari-class-group-port/check_field3_high_precision_getfu.cjs
```

The focused checker reports:

- a fresh instrumented pristine-PARI 2.17.4 field-3 trace, followed by the
  translated p192 leaf on independently reconstructed clean/getfu inputs;
- one source-level C6 join with controlled arithmetic output, exercising both
  direct and inverse normalization;
- exact unit norms `[-1, -1]`, inverse mask `1`, product-one checks, and all 301
  rows of each Wraw column;
- fail-atomic high-precision capacity, non-unimodular/large-coefficient, and
  prepared-owner mutation rejection;
- actual coordinator publication for success, `LARGE`, and `PRECI`;
- four post-arithmetic owner mutations rejected and byte-identical repeated
  publication.

The observed success owner SHA-256 in the focused synthetic publication is
`19b22a5bd99cded8cdb6f24e2385d48bedc73cfd5cf609f8959fbfdf0d7756bf`.
That hash is test evidence, not an authentic field-3 answer.

The new root has not yet been compiled in this isolated lane because its fresh
worktree intentionally has no trusted `dist/`, while the shared integration
build was known to be partial.  Native compilation and the authentic 153k run
are integration gates after C5 publishes its real owner; neither is claimed by
this preparation result.
