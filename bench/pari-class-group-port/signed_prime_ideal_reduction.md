# Restricted signed cubic prime-ideal reduction

This Phase-5 milestone ports the exact arithmetic tail needed after PARI has
selected a T2-small element. It is deliberately narrower than generic
`idealpowred` and generic `genback`.

Source: PARI 2.17.4 `src/basemath/base4.c`, especially `pr_inv_p`,
`idealred0`, `idealpseudomin`, and `idealpowred`. The translation is
GPL-2.0-or-later and retains explicit source attribution.

## Implemented boundary

- `pari_cubic_inverse_prime_init` implements
  `pr_inv_p(P) = ZM_hnfmodid(pr_get_tau(P), p)` and publishes the separately
  owned rational content `1/p`.
- `pari_cubic_inverse_first_column` specializes
  `ZM_gauss(zk_multable(y), e_1)`, `Q_denom`, and `Q_muli_to_int` to degree
  three. It returns a primitive numerator and positive denominator.
- `pari_cubic_idealred_candidate` implements the remainder of `idealred0`
  after `idealpseudomin` has selected `y`: exact multiplication by `y`, exact
  division by `I intersect Z`, `hnfmodid`, PARI's `gexpo` choice between `y`
  and `y^-1`, and ordered factored-principal/content updates.
- Compact factor records have explicit capacity and ownership. Kind 0 is a
  rational `a/d`; kind 1 is an integral-basis element `(a,b,c)`. Four value
  slots and one exponent are used per active record. Factors are appended in
  source order and inversion negates exponents without reordering.

All public buffers are caller-owned, disjoint, and mutated in place. Matrices
are row-major. The multiplication table uses the repository's established
`((i*n+j)*n+k)` coefficient layout. The same ordinary Python source runs as
the fallback and compiles for the JavaScript and GMP integer backends.

## Exact source fixture

The checker uses PARI 2.17.4 and the totally real cubic

```text
x^3 - 20010*x + 20018
```

with the degree-one prime descriptor above 191 whose tau matrix is

```text
[-59, 753702, 29523486;
   57,   6553,   126708;
    3,    174,    -6671]
```

The negative-prime initialization gives

```text
191*P^-1 = [191, 0, 44; 0, 191, 19; 0, 0, 1].
```

For the pinned T2 candidate `y = (-58,1,0)`, exact reduction gives

```text
J = [1650,1592,18; 0,1,0; 0,0,3],
factor = y^-1,
y^-1 = (-1102,19,1) / 315150.
```

The checker independently asks PARI for the complete signed controls
`idealpow(nf,[P,factor(1)],e,1)` for every nonzero `e` from -3 through 3.
For each control it replays the defining identity

```text
hnf(J * principal(F)) = hnf(P^e).
```

This matters at exponent -3: one final reduction of the unreduced power does
not reproduce PARI's result. The control therefore freezes the binary
intermediate-reduction behavior required of the later generic power lane.

## Explicit remaining dependencies

- T2 candidate selection (`G*I`, connected exact LLL, first transformed
  column) is intentionally an input boundary here. Existing connected LLL
  modules own it.
- Multiplication/squaring of arbitrary extended ideals, their binary schedule,
  and generic matrix-ideal inversion remain for the signed-power integration
  lane.
- Generic `genback`, arbitrary degree, fractional input ideals, nontrivial
  content normalization beyond this exact source branch, and unit
  reconstruction are not claimed by this milestone.

Run:

```bash
node bench/pari-class-group-port/check_signed_prime_ideal_reduction.cjs
```

Set `PARI_GP` (or pass the first argument) to select a pinned PARI 2.17.4
binary. The checked-in exact controls remain available when the binary is not
present; a present binary must report version 2.17.4 and pass all independent
replay identities.
