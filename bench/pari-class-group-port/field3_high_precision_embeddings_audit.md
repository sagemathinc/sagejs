# Field-3 153088-bit roots and prepared embeddings

## Scope and owner

This lane captures the prepared-number-field owner for
`x^4 - 2000022*x - 2000042` in the same pristine PARI 2.17.4 process that
performs `nfinit(..., 192)` followed by `nfnewprec(..., 153088)`. The atomic
capsule binds:

- run identity `pari-2.17.4:nfinit192->nfnewprec153088:field3`;
- polynomial `[-2000042, -2000022, 0, 0, 1]` and signature `(2, 1)`;
- `nf_get_zkden = 37` and the exact `nf_get_zkprimpart` basis;
- all 64 exact multiplication-tensor cells;
- the 153152-bit `make_M` root state produced for the 153088-bit request, and
  the authentic `trunc = 0` choice made by `nfnewprec_shallow`.

Its SHA-256 is
`03a19e230febd45c79dab3b0f42366b8646f8b77a3246d9dc7bd2c16cae5528e`.
The complete pristine trace SHA-256 is
`7ff3153e7fd4acdb5162ce6082726144bc88031a18a993bf6406c983da6c1973`.
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
inverse Horner association. All sixteen realified `M` triples are bit-exact.
The one-ulp discrepancy in the previous lane was not missing numerical root
information: the exported roots are already the authentic 153152-bit
`F->prec + F->extraprec` state consumed by `make_M`.

The decisive source detail is `nf_basden`. It retains the common denominator
37 for every primitive basis polynomial. Thus PARI evaluates `37*x` and
`37*(x^2-x)`, as well as the fourth numerator, before dividing every column by
37. Algebraically cancelling 37 from the first three columns changes one last
word. The port now preserves the primitive numerators and common denominator
through the operation graph. No expected `M` value or field-specific ulp
correction is used.

For this exact `nfnewprec_shallow` path, `make_M_G(&F, 0)` selects
`trunc = 0`; a `gprec_w` shrink is therefore *not* executed. This source fact
is captured explicitly rather than imposing the truncation inferred in the
earlier audit. The generated core still uses the reviewed source-matched
high-precision `mpz_mul` path.

Independent exact dyadic replay also checks every embedding homomorphism
identity against the re-derived tensor. The maximum residual exponent is
`-153120`.

## Focused native probe

The GMP backend compiled successfully and completed the final positive call in
276.7 ms. The probe was run with a 4 GiB address-space limit and 600-second
timeout. Wrong-target, mutated-polynomial, and mutated-basis calls reject
before changing public root, embedding, or state buffers. No 192-bit `M`,
arbitrary logarithm, or `getfu` result is consumed or claimed.

The same positive oracle comparison passes through the ordinary CPython
fallback and generated JavaScript backend as well as GMP.

Reproduce with:

```bash
prlimit --as=4294967296 -- timeout 600s \
  node bench/pari-class-group-port/check_field3_high_precision_embeddings.cjs
```

The worktree needs the normal built `dist/` tree available to the focused
native compiler; no broad build is part of this lane.
