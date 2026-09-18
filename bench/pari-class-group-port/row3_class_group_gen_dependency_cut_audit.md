# Row 3 `class_group_gen` executable dependency cut

This is a deliberately bounded Phase-5 cut on frozen development-panel row 3,
the totally real cubic

```text
x^3 - 20000000022*x + 20000000042
```

Its already-authenticated live replay has a nontrivial cyclic class group of
order six.  The new executable does **not** take that class number, invariant,
PARI generator, reduced ideal, or terminal PARI result as an input.  The checker
first authenticates the immutable row-3 presentation owner using the existing
manifest-bound verifier, then crosses only two neutral/computed owners into the
compiled source: the accepted `2 x 2` presentation `W` and the terminal
factor-base permutation.

## Executed source cut

`row3_class_group_gen_dependency_cut.py` calls the existing attributed
translation of PARI 2.17.4 `ZM_snfall`/`class_group_gen` and therefore computes:

- the full `D`, `U`, `U^-1`, and `V` Smith state;
- both exact inverse-HNF divisions, `Ur = U + D*Y` and
  `Uir = U^-1 + W*X`;
- the complete `M1` and `M2` matrices;
- the non-unit invariant and class order as outputs; and
- the exact signed factor-base exponent request which PARI would pass from the
  active `Uir` column to `genback`.

The request is transported back through the authenticated terminal permutation
to original factor-base coordinates.  The checker verifies `U*W*V=D`, both
inverse identities, native callback freedom, CPython/native agreement, and the
detached frozen answer only **after** computation.  Duplicate and out-of-range
permutations fail before the Smith-complete bit or a genback request is
published.

## Intentional fail-closed frontier

The row-3 owner contains exact factor ideals and the multiplication tensor, but
it does not contain a source-derived reduced-ideal candidate owner for PARI's
`idealpowred`/`genback` schedule.  The existing signed cubic genback experiment
is for a different field and hard-wired candidate set.  Reusing it, importing a
PARI generator, or substituting a new reduction policy would make this a false
same-algorithm claim.

Consequently the root returns diagnostic status `1` after preparing one honest
genback request, with `genbackRequestsCompleted = 0` and missing-owner code `1`.
It publishes no ideal generator and is not a class-group result.  This isolates
the next dependency precisely: authenticate or compute the row-3 bounded
reduced-ideal candidates and generalize the cubic signed ideal-power/reduction
backend without any answer-derived runtime owner.

Run against a freshly produced immutable row-3 presentation owner:

```bash
node bench/pari-class-group-port/check_row3_class_group_gen_dependency_cut.cjs \
  ROW3_PRESENTATION_OWNER.json
```

The receipt is diagnostic, untimed, and not qualification evidence.
For a compiler-only smoke test, `--protocol-only` uses the documented row-3
diagonal presentation and identity permutation, labels the receipt
`authenticOwnerChecked=false`, and makes no frozen-owner claim.
