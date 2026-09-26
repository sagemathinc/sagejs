# Frozen panel row 8: authentic matched flag-zero C6

Status: complete at the accepted 192-bit precision.

The authenticated C5 v2 owner continues through PARI 2.17.4's complete
mixed-quartic `getfu` numerical path. The translated source rebuilds
`fixarch(A)`, applies the private getfu LLL factor, evaluates all six complex
exponentials, solves the realified `4 x 4` system with two right-hand sides,
and rounds all eight basis coefficients. The exact terminal state is:

```text
[PRECI, max-real=15, phase-accuracy=-185, solve=0,
 worst-round-error=69863, inverse-mask=0, verified-units=0, det=1]
```

Because rounding fails, inverse and unit authentication are not entered and
no unit, log, or adjusted-factor output is published. Flag zero passes
`ptU == NULL`; source `getfu` also assigns `*ptA` only after successful
rounding. The public pre-getfu `9 x 2 U` and `3 x 2 A` therefore remain exactly
the compact C5 owners. The private candidate `A * [1,0;-2,1]` is retained only
as authenticated input to C6.

## Input authority

C6 consumes immutable C5 v2 SHA-256
`f93fa0ff5f68531646f213d799339e87a7b2d338e18457399fe81d6b0fb1df21`
and accepted-retry SHA-256
`b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591`.
The mode-0644 W0 file is admitted only after rechecking SHA-256
`4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1`
and prepared-NF authority
`f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01`.
Only `prepared.embeddingM` and `prepared.multiplicationTensor` cross the C6
boundary. W0 event arrays and the precision-corridor answer tape do not.

The row-major realified W0 embedding is converted canonically to getfu's
column-major three-place real and imaginary triple arrays. Exact digests pin
that conversion and the tensor before arithmetic. After arithmetic, independent
pristine digests pin `archReal`, `archImag`, both clean arrays, the solved
matrix, and rounded coefficients. Thus the oracle is comparison-only.

## Schedule bug found and fixed

The earlier C5 v1 owner accidentally passed a row-major rank-two helper result
to the column-major logarithm transform. Its identity result hid the mismatch.
The authentic factor is PARI column-major `[1,0,-2,1]` (helper row-major
`[1,-2,0,1]`). The shared `fixarch` translation now also follows the source
complex-place rule `s + x/2`, halving both stored real and imaginary parts of
`x` while adding the full real correction `s`.

This distinction prevents a subtle false conclusion: a getfu run with the
wrong identity factor reaches rounding error 66433. It is not the matched PARI
path. The corrected private factor reproduces 69863 exactly.

## Immutable owner and validation

The production C6 owner is:

```text
/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel8-authority/
  c6-getfu-not-given-d1f4e9e2ce4ae987952cbce8e8af9d6c9ede318f5ffa89b185fbd003ab5e28df.json
```

It is content-addressed, atomically published, idempotent, and mode `0444`.
`check_panel8_c6_getfu.cjs` runs CPython and compiled JavaScript-exact/native
GMP paths, pins the exact state and arithmetic digests, poisons every public
output, rejects short storage, rejects six owner/prepared mutations, and checks
publication identity. The generated native core is 13,438,145 bytes and has no
Python callback.
