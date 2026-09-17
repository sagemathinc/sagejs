# Field-3 153088-bit roots and prepared embeddings

## Scope and owner

This lane captures the prepared-number-field owner for
`x^4 - 2000022*x - 2000042` in the same pristine PARI 2.17.4 process that
performs `nfinit(..., 192)` followed by `nfnewprec(..., 153088)`. The atomic
capsule binds:

- run identity `pari-2.17.4:nfinit192->nfnewprec153088:field3`;
- polynomial `[-2000042, -2000022, 0, 0, 1]` and signature `(2, 1)`;
- `nf_get_zkden = 37` and the exact `nf_get_zkprimpart` basis;
- all 64 exact multiplication-tensor cells.

Its SHA-256 is
`e515b1795d3973f3cebf1e195993fdf1941891ab07670a182488f38c38788b17`.
The complete pristine trace SHA-256 is
`8ae3beda63f437d4cd43ef8d1b16c212d5004cb957a2536cba5765c794f4059a`.
The tensor is not used as a substitute for basis provenance: the native leaf
checks every basis coefficient, while an independent `Fraction` replay derives
all tensor cells anew from the polynomial and basis.

## Result

Ordinary CPython-parseable source uses exact fixed-point Newton refinement for
the two real roots and Vieta identities for the complex representative. All
four realified packed root triples are bit-exact against pristine PARI. Exact
polynomial residual exponents are `-153132`, `-153126`, `-153126`, and
`-153124`.

The same source evaluates the exact integral basis using PARI's ordinary or
inverse Horner association. Fifteen of the sixteen realified `M` triples are
bit-exact. Entry 6—second real embedding of `x^2-x`—is one mantissa ulp below
PARI, at the identical 153152-bit precision and exponent 13. This is retained
as an explicit diagnostic, not patched with a field-specific constant.

The missing primitive is now exact: `make_M` evaluates the basis from
`F->ro` at `F->prec + F->extraprec`, and only afterwards truncates both `M`
and the exported roots. Re-evaluating from the exported roots therefore cannot
recover every guard-word decision. A pristine experiment shows that one extra
PARI root word makes this cell agree. Closing full `M` requires reproducing or
retaining that pre-truncation `get_roots` state. It does not require a new
product primitive: the reviewed source-matched high-precision product path is
used and the generated core contains `mpz_mul`.

Independent exact dyadic replay also checks every embedding homomorphism
identity against the re-derived tensor. The maximum residual exponent is
`-153120`.

## Focused native probe

The GMP backend compiled successfully and completed the final positive call in
268.4 ms. The probe was run with a 4 GiB address-space limit and 600-second
timeout. Wrong-target and mutated-basis calls reject before changing public
root, embedding, or state buffers. No 192-bit `M`, arbitrary logarithm, or
`getfu` result is consumed or claimed.

Reproduce with:

```bash
prlimit --as=4294967296 -- timeout 600s \
  node bench/pari-class-group-port/check_field3_high_precision_embeddings.cjs
```

The worktree needs the normal built `dist/` tree available to the focused
native compiler; no broad build is part of this lane.
