# Equal-bound honesty dispatch

PARI 2.17.4's `buchall` driver calls `be_honest` only under the source
condition `F.KCZ2 > F.KCZ` (`src/basemath/buch2.c:4134-4140`). The function
itself is not entered when the two factor-base group counts are equal.

The authentic resident preparation for the class-number-one cubic
`x^3 - 20018*x + 20034` computes

```
C1=333, C2=333, KC=66, KCZ=48, KCZ2=48, KC2=66.
```

`pari_honesty_dispatch_from_factor_base` consumes those generated counters and
the connected preparation state. It first verifies that the preparation has
reached the completed factor-base phase and that its copied `KC` and `KCZ`
agree. It then validates monotonicity and evaluates the exact source predicate.
There is no honesty status, skip bit, class number, or PARI answer argument.

Mutation coverage demonstrates the semantic distinction:

- the authentic `KCZ=KCZ2=48` state derives `equal-bound-source-skip`;
- changing only `KCZ2` to 49 derives `honesty-required`;
- changing display bounds without changing the group counts does not override
  PARI's actual predicate;
- changing the connected preparation's copied counters rejects authentication;
- nonmonotone counts reject without mutating either input.

This component closes only the equal-count dispatch decision. It does not make
an unequal-bound `be_honest` computation complete and does not certify the
factor base independently of the resident preparation that produced the state.
