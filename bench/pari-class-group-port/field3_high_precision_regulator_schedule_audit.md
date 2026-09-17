# Field 3 high-precision regulator schedule audit

## Claim

This lane prepares, but does not complete, C4 for

```text
x^4 - 2000022*x - 2000042
```

The ordinary CPython-parseable coordinator accepts only the eventual complete
C3 `A` owner: 39 column-major logarithms (3 rows by 13 columns), each encoded
as one seven-word real/complex scalar. It also requires the exact polynomial,
signature/dimension/order protocol, a positive C3 generation, four out-of-band
hash words, and two independently recomputed modular owner latches. The hash is
authority supplied by C3; the latches bind that authority to the 273 integers
actually presented to C4.

Precision retry authority is explicit rather than inferred: attempt zero at
153,088 bits may request 153,152 bits, and attempt one must name 153,088 as its
predecessor and has no further authorized step. The 192-bit synthetic
differential has a separate one-attempt protocol.

The coordinator extracts the real rows without reassociation, calls the
source-ordered regulator-multiple graph, then replays the denominator-bound
part of PARI 2.17.4 `compute_R`: `bestappr`, denominator LCM, approximation
gate, integral scaling, wide HNF, determinant/denominator-power scaling, and
the small-regulator gate. On success it publishes only:

- a packed candidate regulator `[mantissa, precision, exponent]`;
- a column-major exact 2 by 13 candidate relation matrix;
- its common denominator and diagnostic state;
- the authenticated C3 hash and latches.

Publication is fail-atomic. Scratch and diagnostic owners may record a failed
attempt, but the candidate regulator, relation matrix, hash, and latches are
written only after every implemented gate succeeds. An incomplete C3 owner
returns status 7 before changing any owner.

## Precision corridor

The previous 2,304/4,096/4,352-bit validation limits were prototype limits,
not mathematical boundaries. This lane lifts the connected regulator scalar,
preparation, pivot, matrix-transform, sum, division, and `bestappr` checks to
the already reviewed 154,112-bit packed-real corridor. Operations needing a
guard word stop at 154,048 bits. Thus both requested C3 precisions, 153,088 and
153,152 bits, remain within the same bounded primitive corridor.

The test intentionally runs the reconstruction source at both target
precisions using synthetic identity coordinates. This is a dynamic fallback
test, not a performance claim and not a substitute for the missing C3 owner.
No heavy native build was run in this lane.

## Independent replay

`check_field3_high_precision_regulator_schedule.cjs` compiles a small UBSan
oracle against pristine PARI 2.17.4, authenticated by the release archive
SHA-256

```text
02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53
```

The oracle constructs a fresh 192-bit 2 by 13 identity/zero coordinate matrix
and executes PARI's `bestappr`, `Q_denom`, `ZM_hnf`, triangular determinant,
and regulator scaling. It supplies no field-3 answer. The Python replay agrees
exactly on the packed regulator, all 26 relation entries, denominator,
approximation bits, and rank. Existing leaf and regulator-multiple
differentials remain the authority for the imported connected call graph.

The checker also covers:

- both target precisions through the ordinary Python fallback;
- incomplete-C3 rejection with complete owner immutability;
- polynomial, signature/order, retry schedule, hash, and packed-owner
  mutations;
- a complete synthetic rank-zero C3 owner that cannot publish any candidate.

## Deliberately missing cut

There is no authentic complete 153,088/153,152-bit C3 `A` owner yet. Therefore
this lane does not publish a real field-3 regulator or relation matrix and does
not use any frozen 192-bit `A`, `L`, regulator, lattice, or unit checkpoint.

Moreover, PARI's final acceptance is not only the denominator reconstruction.
It applies the analytic `bad_check(z*R)` condition, where `z` contains the
field-derived `h*invhr` factor, and may request greater precision. That owner is
not among the permitted C3 inputs. The coordinator consequently marks every
successful result `analytic pending = 1`; it never labels the candidate an
accepted complete regulator/L owner.

The exact remaining dependency chain is:

1. C3 publishes the complete high-precision 273-word `A` owner with its hash,
   generation, dimensions, precision, and ordering.
2. A separate authenticated field-derived analytic owner supplies `h*invhr`
   (or an equivalently replayable derivation) and the precision retry authority
   needed for PARI's `bad_check`.
3. Only after that gate may the candidate be promoted and consumed by
   `cleanarch`/`getfu`. Those stages are explicitly outside this C4 lane.

This separation prevents a frozen low-precision answer or an answer-derived
transform from silently becoming mathematical authority.
