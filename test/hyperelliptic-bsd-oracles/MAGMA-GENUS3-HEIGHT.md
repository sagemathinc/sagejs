# Magma genus-3 canonical-height oracle

This fixture supplies the first external genus-3 canonical-height and
regulator target for the Sage.js BSD arithmetic project.  It is intentionally
separate from `corpus.json`: adding it cannot silently strengthen the existing
phase-coverage claims.

## Exact model and divisor

Sage.js uses the integral generalized odd-degree model

```text
C: y^2 + y = f(x),
f = x^7 - 9*x^6 + 28*x^5 - 32*x^4 + x^3 + 17*x^2 - 6*x,
P = (u,v) = (x*(x-1)*(x-2), 0).
```

Thus `P` is represented by the three rational points `(0,0)`, `(1,0)`, and
`(2,0)`, minus three times the rational point at infinity.  The Holmes move
uses the rational fibre above `x=3`, namely `(3,0)` and `(3,-1)`.  This is
exactly the degree-three, rationally split Mumford envelope implemented by
`genus3_heights.py`.

Magma V2.18-5 implements genus-independent Arakelov heights for `JacHypPt`,
but its analytic Jacobian rejects generalized equations with nonzero `h`:

```text
Runtime error in 'AnalyticJacobian': The curve must be in the form y^2 = f(x)
```

The oracle therefore transports the curve and divisor through

```text
Y = 2*y + 1,
C': Y^2 = 1 + 4*f(x),
P' = (u, 1).
```

This is an isomorphism of curves over `QQ`, hence it induces an isomorphism of
principally polarized Jacobians and preserves the Neron--Tate height.  It is
not a quadratic twist or an isogeny, so there is no height-scaling factor.

## Reproduction

The captured executable reports Magma `2.18-5`.  Reproduce its transcript with

```sh
/home/user/bin/magma -b \
  test/hyperelliptic-bsd-oracles/magma-genus3-height.m
```

and compare stdout byte-for-byte with
`expected-magma-2.18-5-genus3-height.txt`.  On another installation use:

```sh
MAGMA=/path/to/magma \
  node test/hyperelliptic-bsd-oracles/verify-magma-genus3-height.mjs
```

Without `MAGMA`, the verifier is offline: it checks the pinned hashes,
precision refinement, and the equality of Magma's canonical height,
self-pairing, one-by-one height matrix, and rank-one regulator.

The Sage.js exact finite replay is:

```sh
bin/sagejs --python \
  test/hyperelliptic-bsd-oracles/sagejs-genus3-height-finite.py
```

It certifies the complete candidate set
`{2,3,13,101,389,38677}` and the exact local coefficients
`(-3,-3,0,0,0,0)`.  In particular, this fixture exercises good reduction at
`2` on a generalized integral model rather than relying on an unsupported
wild bad-reduction path.

## Result and current boundary

Magma returns

```text
2.14034414827405886132396479358536142092549662636620100130822937009585545...
```

for `CanonicalHeight(P')`, `HeightPairing(P',P')`, the sole entry of
`HeightPairingMatrix([P'])`, and `Regulator([P'])`.  Agreement across 50, 100,
and 160 requested decimal digits makes this a strong numerical oracle, not a
proof or interval enclosure.

At the captured Sage.js revision, the exact finite plan is complete but the
default public archimedean settings stop with
`abel_jacobi_refinement_not_stable` after three refinements.  Raising the
Abel--Jacobi budget to six stabilizes the integrals.  Theta radius 5 still
fails honestly with `theta radius refinement did not stabilize`; radius 6 is
the first bounded setting observed to stabilize both theta pieces.

The slow opt-in replay in `sagejs-genus3-height-radius6.py` then gives

```text
archimedean =  9.6559667042322827251096725984884686590464412131603
finite      = -5.3752784076841650024374320751533705516021590580731
height      =  2.1403441482740588613361202616675490537221410775436
Magma       =  2.1403441482740588613239647935853614209254966263662...
absolute error = 1.21554680821876327966444511774e-20
```

Thus the complete Sage.js finite/archimedean normalization agrees with Magma
to approximately 20 significant decimal digits (19 digits after the decimal
point).  This replay includes the requested-precision capture of each
archimedean pairing and the requested-precision sum of the theta pieces, so it
does not silently round the assembled value at ambient machine precision.
Both radius-6 theta pieces report stable refinement, the finite plan is
complete and exact, and the global answer remains correctly labeled
`rigorous=false` because neither numerical engine supplies an interval proof.

Run the offline integrity check with

```sh
node test/hyperelliptic-bsd-oracles/verify-genus3-height-radius6.mjs
```

The several-minute numerical replay is deliberately opt in:

```sh
SAGEJS_RADIUS6=1 \
  node test/hyperelliptic-bsd-oracles/verify-genus3-height-radius6.mjs
```

The public API now exposes the same bounded settings as

```python
P.canonical_height(
    moving_x=3,
    prec=64,
    abel_max_refinements=6,
    theta_radius=6,
)
```

The recorded script calls this public API directly.  Its approximate
six-minute runtime on the shared capture host is not a benchmark receipt.  The
Magma transcript took approximately nine seconds, while the warmed exact
Sage.js finite replay took approximately three seconds; period integration and
theta evaluation dominate the Sage.js runtime.

The external coverage provided now is therefore:

- genuine Magma genus-3 canonical height and rank-one regulator;
- exact model/divisor normalization under completion of the square;
- complete Sage.js finite-prime support and local coefficients;
- a replayed end-to-end numerical agreement at the explicit radius-6 gate;
- an explicit performance target for accelerating the archimedean path while
  retaining its current honest refinement failures.
