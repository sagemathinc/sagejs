---
title: "Computational algebraic number fields"
---

# Computational algebraic number fields

Sage.js now connects exact arithmetic in maximal orders with complex zeta
functions.  The useful feature is not just the number returned by one
calculation: prime decompositions carry replayable certificates, exact ideal
lattices feed exact zeta coefficients, and those coefficients feed numerical
analytic continuation.

This chapter is also a guide to the proof boundary.  Exact signatures, ideal
identities, prime decompositions, coefficients, and the currently supported
unit and class-group certificates are exact.  Complex values, residues,
regulators, plots, and the analytic class-number-formula comparison are
numerical approximations.  General Dedekind-zeta continuation is explicitly
non-rigorous at present.

Every fence marked `sage test` is run by the documentation test suite.  The
larger plotting and general-continuation examples are ordinary executable Sage
fences so that the routine test suite stays quick.

## Arbitrary-complex Riemann zeta

The global `zeta()` function accepts real and complex points, a derivative
order, and an explicit bit precision.  `RiemannZeta()` is the reusable object
interface; it adds batches, jets, the residue, and the entire completed
function

\[
  \xi(s)=s(s-1)\pi^{-s/2}\Gamma(s/2)\zeta(s).
\]

This normalization has no extra factor of one half, so `xi(0) = xi(1) = 1`.

```sage test
RZ = RiemannZeta(80)
s = ComplexField(80)("0.5", "14")
value = RZ(s)
conjugate_error = RZ(s.conjugate()) - value.conjugate()
assert abs(float(conjugate_error.real())) < 1e-18
assert abs(float(conjugate_error.imag())) < 1e-18

functional_error = RZ.xi(s) - RZ.xi(1-s)
assert abs(float(functional_error.real())) < 1e-18
assert abs(float(functional_error.imag())) < 1e-18
assert RZ.residue() == 1
[value, RZ.derivative(2), RZ.xi(s)]
```

For unrelated points, cross the native boundary once with `values()`:

```sage test
points = [CC(2, k/4) for k in range(8)]
batch = RZ.values(points, prec=64)
assert len(batch) == len(points)
assert abs(float((batch[3] - RZ.value(points[3], prec=64)).real())) < 1e-14
assert abs(float((zeta(2, derivative=1) - RZ.derivative(2)).real())) < 1e-14
batch[:3]
```

The raw zeta function really has a pole at one.  An exact request raises a
pole error instead of returning an accidental infinity or `NaN`; use
`residue()` or a deflated jet there.  Nearby representable points are never
snapped to the pole.

```sage test
try:
    RZ(1)
    assert False
except Exception as error:
    assert "pole" in str(error)

regular_part = RZ.deflated_jet(1, 2, prec=80)
assert len(regular_part) == 3
regular_part
```

The evaluator uses FLINT/Arb for values and jets.  The public interface
preserves the requested parent precision and supports at least 512 bits, but a
printed midpoint is not itself a proof enclosure.

## A complete quadratic Dedekind zeta function

For a quadratic field of fundamental discriminant `D`, Sage.js uses the exact
factorization `zeta_K(s) = zeta(s) L(s, chi_D)`.  This route gives fast
arbitrary-complex values, derivatives, batches, completion, the pole residue,
and plots for both real and imaginary quadratic fields.

```sage test
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x^2 - 5, "a")
Z = K.zeta_function(prec=80)

zs = [CC(2, k/3) for k in range(6)]
values = Z.values(zs, prec=64)
assert len(values) == 6
assert Z.algorithm() == "quadratic-product"
assert Z.last_diagnostics()["batched_riemann"]
assert Z.last_diagnostics()["batched_dirichlet"]
values[:3]
```

The completion is frozen as

\[
  \Lambda_K(s)=|D_K|^{s/2}\Gamma_\mathbf{R}(s)^{r_1}
  \Gamma_\mathbf{C}(s)^{r_2}\zeta_K(s),
\]

where `Gamma_R(s) = pi^(-s/2) Gamma(s/2)` and
`Gamma_C(s) = 2 (2*pi)^(-s) Gamma(s)`.  Thus
`Lambda_K(s) = Lambda_K(1-s)` and
`xi_K(s) = s*(s-1)*Lambda_K(s)` is entire.

```sage test
t = CC(0.4, 0.7)
completion_error = Z.completed_value(t) - Z.completed_value(1-t)
assert abs(float(completion_error.real())) < 1e-12
assert abs(float(completion_error.imag())) < 1e-12
assert float(Z.residue(1).real()) > 0
assert abs(float((Z.xi(t) - Z.xi(1-t)).real())) < 1e-12
[Z.derivative(2), Z.residue(1), Z.xi(t)]
```

Quadratic batches also implement the packed plotting protocol.  A large image
is tiled automatically, so its total pixel count is not limited by one native
call.  Automatic plot precision starts cheaply and refines only pixels whose
colors are unstable.

```sage
picture = complex_plot(
    Z, (0, 2), (-4, 4), plot_points=300, interpolation="nearest"
)
picture.save("quadratic-dedekind-zeta.png")
```

The rectangle contains the pole at `s=1`; it appears as a singular feature in
the picture.  For a real-axis graph, choose an interval not containing the pole
or split the graph into two intervals.

## Certified rational-prime decomposition

Prime decomposition happens in the certified maximal order, including at
index-dividing primes where merely factoring the original defining polynomial
modulo `p` is not sufficient.  Each prime ideal retains its exact HNF lattice;
the rational prime and the `(e,f)` pair are authenticated metadata.

```sage test
O = K.maximal_order()
D11 = O.factor_rational_prime(11)
assert D11.verify()["certified"]
assert D11.value() == O.ideal(11)
assert sum(e*P.residue_class_degree() for P, e in D11) == K.degree()

local_data = [
    (P.rational_prime(), e, P.residue_class_degree(), P.norm())
    for P, e in D11
]
assert local_data == [(11, 1, 1, 11), (11, 1, 1, 11)]
P = D11[0][0]
assert P.residue_field().order() == 11
local_data
```

`D11.verify()` independently checks quotient fields, distinctness,
comaximality, the degree identity, and exact reconstruction of `11*O`.  The
producer is normally Dedekind--Kummer and otherwise a presentation-independent
finite-algebra fallback.  Both routes have deterministic resource limits; a
request beyond them raises before unbounded enumeration.

## Fractional ideals, valuations, and serialization

The same exact lattice representation supports inverse and negative powers,
colon and quotient ideals, element and ideal valuations, and reconstructing
factorization.

```sage test
I = O.ideal(11)
assert I * I.inverse() == O.ideal(1)
assert P * (~P) == O.ideal(1)
assert I.valuation(P) == 1
assert P.valuation(P.uniformizer()) == 1

factorization = I.factor()
assert factorization.value() == I
fractional = P / O.ideal(2)
assert fractional.denominator() == 2
assert fractional.numerator() == P
[factorization, fractional]
```

Serialization is versioned and includes a field/order fingerprint plus live
instance identities.  This prevents loading an ideal into a different,
isomorphic-looking field by accident.  Round trips are intentionally scoped to
the same live field and maximal-order objects unless an explicit transport map
is supplied.

```sage test
payload = fractional.to_dict()
copy = O.ideal_from_dict(payload)
assert copy == fractional
assert payload["schema"] == "sagejs.number-fields.ideal.v1"
[payload["schema"], copy]
```

## Exact coefficients and the safe half-plane

If `a_m` is the number of nonzero integral ideals of norm `m`, then
`Z.coefficients(B)` returns the exact list `[a_1, ..., a_B]`.  It consumes a
compact certified stream of `(e,f)` records and does not materialize every
prime ideal.  Local zeta factors depend on residue degrees `f`, not directly
on ramification indices `e`.

```sage test
coefficients = Z.coefficients(20)
assert coefficients[:10] == [1, 0, 0, 1, 1, 0, 0, 0, 1, 0]
assert coefficients[0] == 1

factor11 = Z.euler_factor(11)
assert factor11["residue_degrees"] == [1, 1]
assert factor11["denominator"] == [1, -2, 1]
assert factor11["proof_status"] == "exact-from-certified-splitting-record"
[coefficients, factor11]
```

Finite Euler products are deliberately restricted to `Re(s) > 1`.  The
partial product has an explicit degree-only omitted-prime bound, but the
current returned complex midpoint is not outward-rounded, so it is still
labelled non-rigorous.

```sage test
partial = Z.euler_product(2 + I, prime_bound=29, prec=64)
continued = Z.value(2 + I, prec=64)
assert abs(float((partial - continued).real())) < 0.1
assert abs(float((partial - continued).imag())) < 0.1
partial
```

For nonquadratic fields the zeta object also exposes
`dirichlet_series(s, coefficient_bound)` and records its tail and proof-status
diagnostics in `last_diagnostics()`.  Neither the direct series nor the Euler
product accepts `Re(s) <= 1`; use analytic continuation there.

## General analytic continuation

For a nonquadratic absolute number field, `K.zeta_function()` combines exact
degree, discriminant, signature, and coefficient prefixes with a readable
inverse-Mellin/Meijer-G evaluator.  It supports values, small derivatives,
completion, `xi`, residues, batches, and tiled plots at moderate precision and
height.

```sage
C = NumberField(x^3 - x - 1, "b")
CZ = C.zeta_function(prec=50, max_imaginary_part=4)
w = CZ(CC(0.5, 1))
dw = CZ.derivative(CC(0.5, 1))
symmetry_error = CZ.xi(CC(0.5, 1)) - CZ.xi(CC(0.5, -1))
assert CZ.last_diagnostics()["rigorous"] is False
[w, dw, symmetry_error]
```

This route is a numerical approximation, not an enclosure: coefficient,
integration-range, and mesh refinements are stability evidence rather than a
theorem about the remainder.  An unstable refinement raises instead of
returning plausible digits.  Default preflight limits currently cap precision
at 512 bits, absolute imaginary part at 64, derivative order at 8, and one
batch at 64 points before plotting subdivides it.  This is not a high-zero
search or large-height engine.

In `Re(s) > 1`, use exact coefficients with `dirichlet_series()` or certified
splitting data with `euler_product()` when those routes are cheaper.  Quadratic
fields continue to use the faster exact `zeta*L` factorization by default.

## Signatures and ordered embeddings

`signature()` is computed from exact algebraic root isolation.  The public
archimedean data keeps every real embedding and one representative from each
complex-conjugate pair in a deterministic order.  Complex logarithmic
coordinates receive the standard weight two.

```sage test
assert K.signature() == (2, 0)
arch = K.archimedean_data()
assert arch.certificate.verify(K)
assert len(K.embeddings()) == 2
images = arch.numerical_images(K.gen(), prec=80)
logs = arch.logarithmic_image(K.gen(), prec=80)
assert len(images) == 2 and len(logs) == 2
[K.signature(), images, logs]
```

The signature and embedding ordering are exact.  The displayed numerical
images and logarithms are explicitly marked approximations because the current
public `QQbar.n` transport does not expose Arb radii.

## Certified units and class groups: the present complete slices

The result objects separate a found subgroup from a proved full group.  A
complete unit result has exact norm and integrality certificates plus an exact
saturation certificate; an incomplete result never supplies a regulator as if
its generators were fundamental.

Real quadratic fields are complete through bounded Pell enumeration:

```sage test
U5 = K.unit_group()
assert U5.complete and U5.unit_rank == 1
assert U5.verify_completion()
assert U5.certificates[0].verify(K)
R5 = K.regulator(prec=80)
assert 0.48 < R5.value < 0.49
[U5.generators, R5, K.roots_of_unity()]
```

There are also two deliberately small but fully certified cubic vertical
slices.  For `x^3-x-1` (signature `(1,1)`, unit rank one) and
`x^3-x^2-2*x+1` (signature `(3,0)`, unit rank two), Sage.js exhausts an exact
125-element fundamental-box certificate and proves class number one using the
exact Minkowski bound and certified prime decomposition.

```sage test
mixed = NumberField(x^3 - x - 1, "m")
totally_real = NumberField(x^3 - x^2 - 2*x + 1, "r")
for F, expected_signature, expected_rank in [
    (mixed, (1, 1), 1),
    (totally_real, (3, 0), 2),
]:
    units = F.unit_group()
    classes = F.class_group_result()
    assert F.signature() == expected_signature
    assert units.complete and units.unit_rank == expected_rank
    assert units.verify_completion()
    assert classes.complete and classes.order() == 1
    assert classes.certificate.verify(max_elements=1)
    assert classes.has_principal_element_witnesses

[(mixed.unit_group(), mixed.class_group_result()),
 (totally_real.unit_group(), totally_real.class_group_result())]
```

Outside the complete domains, the bounded searches say so:

```sage test
other = NumberField(x^3 - 2, "c")
bounded_units = other.unit_group(coefficient_bound=1)
bounded_classes = other.class_group_result()
assert not bounded_units.complete
assert bounded_units.proof_status == "incomplete"
assert not bounded_classes.complete
assert bounded_classes.proof_status == "incomplete"
[bounded_units, bounded_classes]
```

Complete class groups currently include imaginary quadratic fields, degree-one
fields, and the two cubics above.  Complete roots of unity cover fields with a
real embedding and imaginary quadratic fields.  Real quadratic unit groups are
complete.  Higher-degree general unit and class-group algorithms remain
bounded searches, not hidden conjectural answers.

## The analytic class-number formula

When both algebraic inputs are complete, Sage.js compares the numerical zeta
residue with

\[
  \operatorname*{Res}_{s=1}\zeta_K(s)
  =\frac{2^{r_1}(2\pi)^{r_2}h_KR_K}
  {w_K\sqrt{|D_K|}}.
\]

The comparison below uses exact algebraic data for `Q(i)` and a numerical
quadratic-zeta residue.

```sage test
Qi = NumberField(x^2 + 1, "i")
Ui = Qi.unit_group()
Ci = Qi.class_group_result()
assert Ui.complete and Ci.complete

report = Qi.analytic_class_number_formula(prec=80)
assert report.inputs_complete
assert report.class_number == 1
assert report.roots_of_unity == 4
assert report.compatible
assert report.status == "numerical-approximation"
report
```

`compatible` is a midpoint stability check, not a proof of the analytic
identity.  If either the unit or class-group search is incomplete, the report
keeps `inputs_complete=False` and does not invent the missing algebraic side.

## Choosing the right route

- Use `K.factor_rational_prime(p)` when you need exact prime ideals and a
  replayable decomposition certificate.
- Use `O.splitting_records(start, stop)` or `Z.coefficients(B)` when you need
  many local factors without materializing all prime-ideal objects.
- Use `Z.euler_product(s, prime_bound)` only for `Re(s) > 1`.
- Use the quadratic `Z(s)` and `Z.values(points)` freely across the complex
  plane, away from the pole.
- Use the general `Z(s)` for moderate-height numerical exploration, checking
  `last_diagnostics()` and treating the result as non-rigorous.
- Inspect `complete`, `proof_status`, and the certificate methods before using
  global arithmetic as a theorem.

No PARI, Magma, Hecke/Oscar, or standalone L-function program is loaded at
runtime.  Those systems are used only to build offline differential-oracle
corpora for Sage.js's own exact and numerical implementations.
