# Cubic class-generator order witness replay

## Boundary

This focused experiment closes one exact omission in the connected PARI 2.17.4
class-group suffix for

```text
x^3 - 200*x + 7.
```

The preceding signed-`genback` and class-assembly work produces the nontrivial
class-group generator

```text
I = [[38,21,34],[0,1,0],[0,0,1]],   Cl(K) = [24].
```

It also preserves the Smith column `[-3,-1]`, relation HNF
`[[12,7],[0,2]]`, `M1=[1,-12]`, and source-order reduction factors

```text
1/8, 1/5, (-17 + w)^-1, 40.
```

`pari_cubic_generator_order_witness_frozen` authenticates and retains that
material, then independently replays the exact order relation

```text
I^24 = (-8468276398993147
        - 902686052011765*w
        - 63907780848204*w^2).
```

PARI is used only as an out-of-boundary test oracle. The ordinary Python source
does not import, call, or link PARI.

## Exact arithmetic

The older cubic ideal-product helper deliberately accepts only an HNF modulus
below `2^64`. This order relation has norm

```text
82187603825523214603738912597460647936,
```

so the replay adds a private exact column-HNF operation. It performs integer
Bezout column operations directly and has no machine-word modulus. Binary
powering uses six exact ideal products and preserves every reduced HNF:

1. `I^2`;
2. `I^4`;
3. `I^8`;
4. the accumulator `I^8`;
5. `I^16`;
6. the accumulator `I^24`.

The witness element is independently converted to its multiplication matrix,
that matrix is put in exact column HNF, and all nine cells are compared with
the denominator-scaled `I^24`. Only after the comparison succeeds are the
power ideal, principal HNF, six-matrix reduction trace, and four compact
`genback` factors published. Algebraic rejection is transactional.

## Focused evidence

Run:

```bash
node bench/pari-class-group-port/check_generator_order_witness.cjs
```

The checker first pins the PARI 2.17.4 archive and independently confirms the
generator, invariant, Smith identity, reduction factors, exact 24th power,
principal generator, principal ideal, and norm. The same ordinary source then
agrees through CPython and the JavaScript, GMP, and tagged native backends.

Five mutations are rejected on every native backend while every published
owner retains its guard value:

- a generator-ideal entry;
- the invariant `24`;
- a principal-generator coefficient;
- a retained factor exponent;
- the Smith relation column.

Focused receipt:

- source SHA-256:
  `aa0555d573bdd7a1b0b483fbc7d924da9b002fe3ce0ab01b75ce624a56de6b19`;
- generated core SHA-256:
  `4d52a864beabd376a1cd925f79a609ccb7ca634d7518639c0b5bd591ab42e60d`;
- generated core size: `2,630,962` bytes;
- callbacks matching `napi_call_function`, `PyObject_Call`, or `v8::`: none.

## Scope and handoff

This is intentionally a frozen, correctness-only replay leaf. It does not
replace generic class-group arithmetic, certify the analytic relation search,
or claim qualified timing. The exact principal generator currently comes from
the authenticated PARI correspondence fixture; deriving it from retained
relation principal elements is the next generalization.

The final-result lane can retain this leaf's `power_ideal`, `principal_hnf`,
`power_trace`, and compact factors as the exact order witness for the sole
nontrivial invariant. No shared class-assembly file or result schema is changed
by this lane.
