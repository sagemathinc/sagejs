# Field 3 analytic acceptance owner

This lane closes the analytic input to `compute_R` without importing an
observed class number, regulator, denominator, relation lattice, or unit.
It deliberately assumes PARI 2.17.4's GRH-bound and `bad_check` policies; it
does not convert those policies into an independent certificate.

## Exact source map

The pristine source is PARI 2.17.4 `src/basemath/buch2.c` from archive SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`:

- `primeneeded`, lines 518–545: choose the residue-product bound;
- `compute_invres`, lines 549–600: accumulate the inverse residue;
- `compute_multiple_of_R`, lines 2979–3031: upstream owner of the multiple and
  coordinate matrix joined here;
- `bad_check`, lines 3040–3048, and `compute_R`, lines 3062–3104: rational
  reconstruction, HNF, regulator, and analytic acceptance;
- `myprecdbl`, lines 3711–3715: retry after `compute_R` PRECI;
- lines 3825–3831: derive `invhr` once before `START`;
- lines 4093–4131: RELAT versus PRECI handling in the acceptance loop;
- lines 4142–4177: later `getfu` PRECI is terminal `not_given`, not a Buchall
  precision restart.

## Owner schema

`pari_field3_analytic_preparation` accepts only the exact polynomial,
discriminant, signature, roots of unity, and prepared prime decompositions.
Two bounded latches authenticate the logical catalog independently of spare
buffer capacity. It computes `LOGD`, the residue bound, inverse residue, and
`invhr`. Its six-word owner state is:

```
[bound, processed primes, catalog latch 1, catalog latch 2,
 inverse-hr latch, ready]
```

`pari_field3_analytic_acceptance` joins that owner to:

- the authenticated 273-word C3 logarithm owner;
- a completed rank-two, 13-column regulator-multiple owner whose state is
  `[status, rows, columns, precision, C3 latch 1, C3 latch 2, complete]`;
- the live terminal two-by-two HNF, joined through
  `[status, rows, HNF latch 1, HNF latch 2, complete]`.

It derives `h` from the HNF diagonal and derives `h*invhr` live. The existing
full `pari_regulator_reconstruction` derives the denominator bound
`2*kR*h*invhr`, rational denominator, relation HNF, regulator, and
`bad_check((h*invhr)*R)`. Candidate buffers are private scratch; result owners
publish together only when `compute_R` accepts. The six-word diagnostic state
is:

```
[compute_R status, retry flag, retry target,
 terminal getfu flag, published, current precision]
```

RELAT returns without a retry. `compute_R` PRECI invokes the live
`myprecdbl` policy. A later `getfu` PRECI leaves the accepted analytic owners
published and reports terminal failure without authorizing another attempt.

## Prohibited fixtures

Neither entry may consume the observed field-3 `invhr`, class number, HNF
determinant, denominator bound, rational denominator, coordinate answer,
regulator, relation lattice, unit, or a precision known to succeed. In
particular, the 153152-bit `make_M` guard is not a retry target: a genuine
153088-bit `compute_R` PRECI requests 229632 bits. No 153k arithmetic is run in
this lane.

## Validation

`check_field3_analytic_acceptance.cjs` rebuilds the low-precision prepared
catalog and analytic value from pristine PARI, then runs both CPython and the
compiled JavaScript backend. A separate pristine-PARI reconstruction case
checks the accepted regulator and relations. Mutation cases reject altered
catalog, C3, and `invhr` owners before scratch or result publication. Synthetic
cases cover accepted publication, RELAT, 192→384 `compute_R` PRECI, and
terminal `getfu` PRECI.
