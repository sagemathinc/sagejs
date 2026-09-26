# Signed cubic ideal powers and `genback`

This lane connects the restricted cubic reduction tail to PARI 2.17.4's
signed `idealpowred` and `buch2.c:genback` schedules. The implementation is
ordinary CPython-parseable Python and compiles source-transparently for the
JavaScript, GMP, and tagged integer backends.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

## Connected interface

`pari_cubic_idealpowred_tape` accepts an integral cubic ideal HNF, exponent
`-3..-1` or `1..3`, an integral-basis multiplication table, and an ordered
T2-candidate tape. It performs PARI's exact schedule:

1. binary square and multiply in `gen_pow_i` order;
2. reduction after every square/multiply;
3. inversion of the already reduced positive result for a negative exponent;
4. the final negative or `+/-1` reduction;
5. ordered factored-principal square, concatenation, and inversion.

`pari_cubic_genback_tape` visits nonzero relation entries in prime-base order,
calls the signed power entry, multiplies each later term into the accumulated
extended ideal, and reduces after every multiplication. It returns the number
of nonzero relation entries and mutates caller-owned result storage.

The tape makes one remaining dependency explicit: each triple is the exact
first T2/LLL candidate that `idealpseudomin` would select. It is consumed once
per reduction, and exhaustion fails closed. This avoids pretending candidate
selection was ported by the scheduling code; the existing ranked-LLL graph can
later supply the same triples without changing the arithmetic interface.

## Exact arithmetic

- `pari_cubic_ideal_hnf_multiply` forms all nine products of cubic HNF basis
  columns. Two six-column `ZM_hnfmodid` passes produce the canonical HNF while
  retaining bounded workspace.
- `pari_cubic_ideal_hnf_inverse_scaled` computes
  `(I intersect Z) * I^-1` as the intersection of nine exact multiplication
  congruence kernels. This is independently equivalent to PARI's trace-dual
  construction and avoids importing hidden `nf[5]` ownership.
- Compact factors preserve source order. A non-scalar reduction translates
  rational content through the same numerator/denominator integer factors as
  `Q_to_famat`; the scalar early-exit retains the raw rational factor used by
  `ext_mul`. This distinction is visible at exponent `-3`.
- The current bounded HNF dependency requires positive moduli below `2^64`.

## Pristine source oracles

The frozen totally real cubic is

```text
x^3 - 20010*x + 20018.
```

The checker reconstructs every T2 tape using only public pristine PARI 2.17.4
operations:

```text
J = HNF((I intersect Z) * I^-1)
y = J * first_column(qflll(G0 * J))
```

It checks exact signed powers of the first prime above 191 for every nonzero
exponent from `-3` through `3`. For each result `(J,F)`, it independently
replays

```text
HNF(J * principal(F)) = HNF(P^e).
```

The connected two-prime `genback` fixture uses the first primes above 191 and
193 with exponent vector `(3,-2)`. Five reductions produce

```text
J = [27417,11945,15915; 0,1,0; 0,0,1]
F = (4472,-11,-3) * 78^-1
    * (-1174,-15,0)^-1
    * (-78254,457,-7) * 9139^-1.
```

The independent replay is

```text
HNF(J * principal(F)) = HNF(P_191^3 * P_193^-2).
```

## Remaining gaps

- Wire the existing connected T2/LLL implementation directly instead of
  supplying its exact candidate tape.
- Lift the deliberately frozen exponent range and word-sized HNF modulus once
  the class-group driver demonstrates a larger requirement.
- Generalize the cubic congruence/integral-basis buffers to arbitrary degree.
- Connect the result to `class_group_gen`'s final unit reconstruction and
  public class-group object construction.

Run the focused differential and malformed-input checker with:

```bash
node bench/pari-class-group-port/check_signed_ideal_genback.cjs
```

Set `PARI_GP` or pass the first argument to select a pristine PARI 2.17.4
binary. When present, its exact candidates, extended ideals, and independent
principal witnesses must all match the frozen controls.
