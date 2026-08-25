---
title: "Split even-degree hyperelliptic Jacobians"
---

# Split even-degree hyperelliptic Jacobians

Sage.js supports exact Jacobian arithmetic for smooth genus-2 and genus-3
even-degree hyperelliptic curves over odd prime fields when the two points at
infinity are rational. These are called **split even-degree models**.

For a curve

```text
y^2 + h(x)y = f(x),
```

the infinity values are the roots of

```text
t^2 + h_(g+1)t - f_(2g+2) = 0.
```

The two roots are ordered by their canonical prime-field lifts. The first is
the distinguished `infinity_plus` used by `J(P)`; the second is
`infinity_minus`.

## Basic arithmetic

This example is executed verbatim by
`test/hyperelliptic-even-degree-jacobian.cjs`.

<!-- tested-example:basic:start -->
```sage
R.<x> = GF(13)[]
H = HyperellipticCurve(x^8 + x + 1)
J = Jacobian(H)

assert J.model_kind() == "even-degree-split-two-infinity"
infinity_plus, infinity_minus = J.infinity_points()
assert tuple(int(P[1]) for P in (infinity_plus, infinity_minus)) == (1, 12)

P = H([1, 4])
Q = H([2, 5])
D = J(P)
E = J(Q)

assert str(D) == "(x + 12, 4 : 1)"
assert str(E) == "(x + 11, 5 : 1)"
assert str(D - E) == "(x^2 + 10*x + 2, 4*x : 1)"
assert J(P, Q) == D - E
assert J(P, P).is_zero()
assert D + (-D) == J.zero()
assert 7*D == D.scalar_multiple(7, algorithm="reference")

assert J(infinity_plus).is_zero()
assert not J(infinity_minus).is_zero()
assert J.point_to_divisor(P, basepoint=infinity_minus) == J(P, infinity_minus)

data = D.to_data()
assert data["schema"] == "sagejs.hyperelliptic.split-mumford-divisor.v1"
assert J.divisor_from_data(data) == D
assert J.prepared_arithmetic().capability()["selected"] == "reference"
True
```
<!-- tested-example:basic:end -->

The printed triple `(u, v : n)` is the complete canonical value. The integer
`n` is the balanced infinity coordinate; omitting it can change the divisor
class. Accordingly, split elements expose
`D.mumford_coordinates() == (u,v,n)`. The older `D.uv()` accessor is rejected
on split elements because `(u,v)` alone is not authoritative.

`J(P)` means `[P-infinity_plus]`. Use `J(P,Q)` for `[P-Q]` or pass an explicit
`basepoint` to `point_to_divisor` when the choice matters.

## Complete small finite groups

Enumeration includes every allowed infinity weight for every affine Mumford
pair. It is checked against the independently computed Frobenius order.

<!-- tested-example:group:start -->
```sage
R.<x> = GF(5)[]
H = HyperellipticCurve(x^6 + x + 1)
J = H.jacobian()

elements = J.points(max_elements=1000, max_candidates=100000)
assert len(elements) == J.order() == 31
assert J.group_structure(algorithm="exhaustive") == (31,)
assert all((D-D).is_zero() for D in elements)

infinity_classes = [J(R(1), R(0), n) for n in range(3)]
assert len(set(infinity_classes)) == 3
True
```
<!-- tested-example:group:end -->

`J.random_element()`, element orders, order certificates, complete
enumeration, and certified finite abelian group structure use the same exact
reference group law.

## Generalized equations

The implementation is not restricted to `h=0`. For example:

```sage
R.<x> = GF(7)[]
f = x^5 - x^4 + x^2 - x
h = x^3 + 1
H = HyperellipticCurve(f, h)
J = H.jacobian()
D1 = J(x^2 + x, 0)
D2 = J(x^2, -x)
assert str(D1 + D2) == "(x^2 + 2*x + 4, x + 4 : 0)"
```

## Capability boundary

The initial split implementation is ordinary exact Python. `algorithm="auto"`
and `algorithm="reference"` use this implementation.
`algorithm="native"` raises an explicit capability error: the existing packed
schema is authenticated specifically for odd-degree, one-infinity models and
is never reused for split divisors.

The following remain explicit future extensions:

- even-degree models whose infinity points are quadratic conjugates;
- characteristic two;
- split arithmetic over `QQ` or finite extension fields as a claimed public
  envelope;
- Kummer coordinates, heights, saturation, and rational torsion;
- prepared/native split arithmetic.

Curve point counting and local Frobenius computations may support a broader
model envelope than Jacobian arithmetic. Unsupported Jacobian consumers fail
with a model-specific error rather than silently converting the curve or
discarding the infinity coordinate.
