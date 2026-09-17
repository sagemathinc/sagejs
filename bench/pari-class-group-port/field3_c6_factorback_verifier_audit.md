# Field-3 C6 exact factorback verifier

## Result

This lane supplies the missing cold correspondence proof between PARI's
factored unit representation and C6's materialized algebraic integers. It does
not run the authentic 153,088-bit field and does not import an expected-unit
fixture.

The authenticated source owner contains the 301-by-2 raw unit transform, 301
exact principal-generator coordinates, the complete 288-by-301 relation
matrix, the 64-cell integral-basis multiplication tensor, C5's prepared clean
logs, the field embeddings, and explicit packed precision, `2*pi`, phase
period, and rounding authority. The independently authenticated C6 owner
contains the inverse mask, adjusted transform, two materialized quartic units,
and their published logs. Both owners must bind the same field, run,
precision, generation, and C5 hash.

## Exact replay

For each factored column the verifier:

1. proves `relationRecords * Wraw == 0` in every one of the 288 divisor rows;
2. evaluates the signed product of all 301 principal generators in the exact
   quartic algebra, using `fractions.Fraction` for negative powers;
3. requires integral coordinates and determinant norm `+1` or `-1`, hence its
   principal ideal is exactly the unit ideal;
4. independently solves for and multiplies by the exact algebraic inverse;
5. repeats the norm and inverse proof for the C6 materialized unit;
6. recomputes PARI's strict coefficient-squared-norm inverse choice and checks
   the complete adjusted Wraw column;
7. compares the selected factorback unit with the materialized unit up to the
   only admitted torsion choices, `1` and `-1`;
8. checks C5's prepared-clean to C6 sign/inverse identities exactly; and
9. independently evaluates each materialized unit in all three embeddings and
   recomputes its packed logarithms. Real entries must agree exactly at the
   recorded packed policy. Imaginary entries may differ only by an integral
   multiple of the authenticated place period (`2*pi`, or `4*pi` for the
   weighted complex place), within the recorded source-rounding tolerance.

This deliberately does **not** require a direct byte-exact
`rawLogs * Wraw == C6 logs` identity for authentic owners. The HNF schedule can
round intermediate packed values and `cleanarchunit` reduces phases. A flat
raw-log multiplication is retained only as an exact synthetic regression in
the checker. Missing precision, period, place multiplier, or tolerance
authority fails closed.

## Authentication and atomicity

Both JSON inputs must be regular mode-0444 files selected by explicit SHA-256.
Duplicate keys, noncanonical integers, detached C5 ancestry, wrong dimensions,
and non-success C6 owners are rejected before a receipt exists. Only after all
exact algebraic and logarithmic checks pass is a canonical receipt written to a
temporary file, flushed, atomically renamed under its content hash, and changed
to mode 0444. Repeating the same verification is byte-idempotent.

The receipt contains hashes and proof summaries, not an alternate unit answer.
Failures cannot publish partial coordinates or a partial success state.

## Focused evidence

Run:

```bash
node bench/pari-class-group-port/check_field3_c6_factorback_verifier.cjs
```

The checker asks pristine PARI 2.17.4 directly for norms and inverses of two
low-cost units in `Q[x]/(x^4-2)`. It then generates a 301-column source owner:

- `(2q)/2 = q`, where `q = 1+x+x^2+x^3` and coefficient normalization chooses
  `q^-1 = -1+x`;
- `(3(1+x))/3 = 1+x`, retained without inversion;
- the first published unit differs from the selected factorback by torsion
  `-1`, while the second differs by `+1`.

The exact relation columns, embeddings, packed logs, and period are generated
in the checker, not copied from an answer tape. The checker also exercises a
flat formal packed-log transform solely as an exact synthetic regression. It
rejects mutations to Wraw, a principal generator, relation entry,
multiplication tensor, materialized unit, inverse mask, C6 log, adjusted Wraw,
C5 prepared log, embedding, phase authority, owner digest, and JSON
uniqueness. Every failed case leaves the content-addressed output directory
unchanged. A second positive case shifts a C6/C5 phase pair by the authenticated
`2*pi` period and proves that the equivalent phase class is accepted.

The focused receipt SHA-256 is
`4d15856ace75611823bc06d9df4ca14b8b479f99a4586764e313b1c8ca4b297a`.
It is synthetic test evidence, not an authentic field-3 answer.

## Deferred boundary

The authentic 153,088-bit factorback and logarithm replay remain deferred.
The current cold logarithm evaluator intentionally supports only bounded
64--384-bit qualification inputs. The integration lane must construct the
source owner from the final immutable raw-relation, C5, and C6 owners, including
the exact embedding and period authority, before extending and running the
same replay at authentic precision. That work remains outside the timed native
core.
