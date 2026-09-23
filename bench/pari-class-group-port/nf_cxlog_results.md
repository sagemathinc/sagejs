# Prepared famat `nf_cxlog` checkpoint

This checkpoint translates the totally-real cubic portion of PARI 2.17.4
`src/basemath/base3.c:1502-1586`. It is the archimedean multiplier boundary
used by `class_group_gen`, not the relation-log scalar path.

## Implemented contract

`pari_prepared_famat_cxlog` accepts packed factored multipliers for degree-three
signature `(3, 0)`. It preserves:

- `nf_to_scalar_or_basis` provenance supplied by explicit factor kinds;
- `Q_primpart` for integral basis columns;
- source factor order;
- ignored positive rational factors;
- even-parity suppression and odd-parity `i*pi` for negative rationals;
- exact exponent multiplication for basis factors, including exponent zero;
- PARI's `low_prec` frontier at 64-bit real embeddings; and
- atomic publication of each complete 21-word `Ga` column.

The resident status records the committed prefix, exact failing
generator/factor, and counts for the four material dispatch branches. A failed
column is not copied to `Ga`; preceding columns remain valid for a precision
retry.

This first cut intentionally rejects scalar-shaped values labeled as basis
columns and does not accept arbitrary rational basis coordinates. `genback`'s
integral reduction factors and separately represented rational scalar factors
fit the boundary. The mixed-signature norm preflight and complex-place
weighting remain the next extension.

## Differential receipt

Command:

```bash
node bench/pari-class-group-port/check_nf_cxlog.cjs \
  /home/user/upstream/pari-2.17.4 \
  /home/user/upstream/pari-2.17.4.tar.gz
```

Result:

```json
{"cases":9,"successful":8,"lowPrecisionFrontiers":1,"malformedRejected":4,"atomicPrefixBackends":3,"backends":["PARI","CPython","javascript","gmp","tagged"],"traceSha256":"8e6425a30d6e7d74c4d34ca5ee0f814bbf3bca5e70744dfc5f5a3bbb4f44f12e","coreBytes":8250793}
```

The fixture matrix covers empty/all-skipped famats, positive rationals,
negative even and odd exponents, positive/negative basis exponents,
nonprimitive basis normalization, a source-significant zero exponent, mixed
source-order accumulation, and the low-precision return. Every successful
seven-word cell agrees exactly. Branch counters agree in CPython, JavaScript,
GMP, and tagged execution. The atomic two-generator control commits an empty
first column and retains all sentinels in a failing second column on every
compiled backend.

Pinned inputs:

- PARI archive SHA-256:
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- pristine `base3.c` SHA-256:
  `5cbf4ebd6c70deb06cfd83f94b8d86368e60cd084f318a003a8ee14821e1cbea`;
- field: `x^3 - 20010*x + 20018`;
- ordinary precision: 192 bits.

These are correctness receipts, not performance measurements and not yet an
actual `genback -> Ge -> Ga` class-generator trace.
