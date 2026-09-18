# Row-19 live flag-zero unit result

This suffix closes the unit boundary for
`3.1.1086061775432017340256300.107` without taking the frozen W0 trace as a
runtime input. It consumes two immutable live owners:

- terminal relations, logs, generators, and regulator:
  `f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76`;
- primitive compact rank-one unit:
  `d0537e45fc9ecb8c89e7252325f612262363df1d84dbe0c507f0e47ea6ac4116`.

The published final owner is
`/scratch/sagejs-row19-live-unit-result/row19-live-unit-result-ee4828c398ad0b59446e669ac24c1fb482bfc4f7226cf83a92b4f1b67ae44ea9.json.gz`.
Its uncompressed SHA-256 is
`ee4828c398ad0b59446e669ac24c1fb482bfc4f7226cf83a92b4f1b67ae44ea9`,
its compressed SHA-256 is
`3c6b50dd3372bf8e7a840a2de5d0ae4933dba3cd09e02198e67288337601a326`,
and the file is mode `0444`.

## Exact compact algebraic unit

The algebraic unit is retained as an exact signed product of all 430
authenticated principal relation generators. Its inverse is the same product
with every exponent negated. The result directly verifies all 424 ideal
valuations vanish, so the product generates the unit ideal.

The multiplication tensor gives the exact integer norm of each principal
generator. Factoring those norms uses 307 rational primes, with maximum 3433.
After weighting by the unit exponents, every rational-prime valuation is zero;
the sign parity is positive. Thus both the factored unit and inverse have exact
norm `+1`, and their formal product is exactly `1`. The generator-norm vector
has SHA-256
`b452a96b0c3ee5fe00fd6d350eeecb8f479eadc72191ade84013688aebb0bc5f`.

The packed live logs are combined as exact dyadic rationals. The real-place
log agrees with the accepted regulator within `2^-120`, while the sum of the
real and complex-place real components satisfies the mixed-cubic product
formula within `2^-160`. Both residuals and the unreduced exact fractions are
published, rather than rounded decimal assertions.

## Why expanded coordinates are absent

This is an intentional source result, not an unfinished factorback. For unit
rank one, `getfu`'s real LLL factor has absolute value one. After `fixarch`,
the two real components both have PARI exponent 21. In pinned PARI 2.17.4
`buch2.c`, `expbitprec` accepts real exponents only through 20;
`RgM_expbitprec` therefore returns `LONG_MAX`, which `getfu` maps to
`not_given(fupb_LARGE)` before exponential reconstruction, rounding, unit
authentication, or exact factorback. Flag zero consequently requires no
expanded power-basis unit or inverse. The final owner fails closed with
`expandedUnit=null`, `expandedInverse=null`, and retains the exact compact
unit/inverse correspondence for final assembly.

The checker appends a stage-local wrapper to pristine PARI 2.17.4 `buch2.c`
(SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`),
converts the published dyadics to authentic 192-bit `t_REAL` inputs, and
observes reason code 2 with a null `fu`. Only after the live immutable owner is
published does it read frozen W0
`0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9`;
that differential confirms `fu=null` and the same regulator. W0 is never an
input to composition.

Run the focused check with:

```bash
node bench/pari-class-group-port/check_row19_live_unit_result.cjs
```
