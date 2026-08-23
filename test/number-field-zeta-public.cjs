// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "public Riemann and Dedekind zeta APIs compose with certified number-field arithmetic",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
RZ = RiemannZeta(100)
def complex_close(left, right, tolerance):
    difference = left - right
    return abs(float(difference.real())) < tolerance and abs(float(difference.imag())) < tolerance

assert RZ.precision() == 100
assert abs(RZ(2) - 1.6449340668482264365) < 1e-15
assert abs(RZ.derivative(2) + 0.9375482543158438) < 1e-14
assert abs(RZ.xi(2) - 1.0471975511965977462) < 1e-14
s = ComplexField(100)(0.5, 14)
assert complex_close(RZ.xi(s), RZ.xi(1 - s), 1e-25)
batch = RZ.values([2, s, 2], derivative=1)
assert len(batch) == 3 and batch[0] == batch[2]
assert abs(batch[0] + 0.9375482543158438) < 1e-14
assert complex_close(QQ.zeta_function(100)(s), RZ(s), 1e-25)
try:
    RZ(1)
    raise AssertionError("the Riemann-zeta pole was silently evaluated")
except ArithmeticError:
    pass
near_one = RealField(100)("1.000000000000000000000000000001")
assert abs(RZ(near_one)) > 1e29

chi5 = kronecker_character(5)
assert chi5.conductor() == 5 and chi5.is_primitive() and chi5.is_real()
assert [chi5(n) for n in [1, 2, 4, 5]] == [1, -1, 1, 0]
chi_minus4 = kronecker_character(-4)
assert chi_minus4.is_odd() and [chi_minus4(n) for n in [1, 2, 3]] == [1, 0, -1]

R = PolynomialRing(QQ, "x")
x = R.gen()
K5 = NumberField(x**2 - 5, "a")
Z5 = K5.zeta_function(prec=80)
assert Z5.algorithm() == "quadratic-product" and Z5.precision() == 80
assert abs(Z5(2) - 1.1616711956186385498) < 1e-14
assert abs(Z5.derivative(2) + 0.3287414514936118586) < 1e-13
assert abs(Z5.residue() - 0.4304089409640040389) < 1e-14
try:
    Z5(1)
    raise AssertionError("the Dedekind-zeta pole was silently evaluated")
except ArithmeticError:
    pass
assert abs(Z5(RealField(80)("1.00000000000000000001"))) > 1e19
z5_points = [ComplexField(80)(0.5, 2.25), ComplexField(80)(0.5, -2.25), 2]
z5_values = Z5.values(z5_points)
z5_diagnostics = Z5.last_diagnostics()
assert len(z5_values) == 3
assert abs(float(z5_values[0].real() - z5_values[1].real())) < 1e-20
assert abs(float(z5_values[0].imag() + z5_values[1].imag())) < 1e-20
assert complex_close(z5_values[2], Z5(2), 1e-20)
assert z5_diagnostics["batched_riemann"]
assert z5_diagnostics["batched_dirichlet"]
assert complex_close(Z5.completed_value(z5_points[0]), Z5.completed_value(1 - z5_points[0]), 1e-18)
assert complex_close(Z5.xi(z5_points[0]), Z5.xi(1 - z5_points[0]), 1e-18)
assert Z5.coefficients(16) == [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 1]

Ki = NumberField(x**2 + 1, "i")
Zi = Ki.zeta_function(prec=80)
assert abs(Zi(2) - 1.5067030099229850309) < 1e-14
assert abs(Zi.derivative(2) + 0.7245670117974872921) < 1e-13
assert abs(Zi.residue() - 0.7853981633974483096) < 1e-14
assert Zi.coefficients(16) == [1, 1, 0, 1, 2, 0, 0, 1, 1, 2, 0, 0, 2, 0, 0, 1]
zi_point = ComplexField(80)(0.5, 2.25)
assert complex_close(Zi.completed_value(zi_point), Zi.completed_value(1 - zi_point), 1e-18)

# Plotting may request more than one native batch.  The public plotting
# protocol must tile that request without exposing the 10,000-point native
# resource boundary.
plot_points = [[0.75, 1.5] for _ in range(10001)]
plot_batch = Z5._plot_complex_batch(plot_points, 24)
assert len(plot_batch["fine"]) == 10001
assert plot_batch["diagnostics"]["tile_count"] == 2
assert plot_batch["diagnostics"]["batched_riemann"]
assert plot_batch["diagnostics"]["batched_dirichlet"]

O5 = K5.maximal_order()
decomposition = K5.factor_rational_prime(11)
assert decomposition.verify()["certified"]
assert [(P.rational_prime(), e, P.residue_class_degree(), P.norm()) for P, e in decomposition] == [(11, 1, 1, 11), (11, 1, 1, 11)]
P = decomposition[0][0]
I = O5.ideal(11)
assert decomposition.value() == I
uniformizer = P.uniformizer()
assert P.residue_field().order() == 11 and P.reduce(uniformizer) == 0
assert P.valuation(uniformizer) == 1 and P.valuation(11) == 1
P_inverse = P.inverse()
assert P * P_inverse == O5.ideal(1)
assert I.valuation(P) == 1 and I.factor().value() == I
fractional = P_inverse
assert fractional.denominator() == 11
assert O5.ideal_from_dict(fractional.to_dict()) == fractional

Km = NumberField(x**3 - x - 1, "u")
units_m = Km.unit_group()
classes_m = Km.class_group_result()
assert units_m.complete and units_m.unit_rank == 1 and units_m.verify_completion()
assert classes_m.complete and classes_m.order() == 1
assert Km.class_number() == 1 and Km.class_group().order() == 1

Kr = NumberField(x**3 - x**2 - 2*x + 1, "v")
units_r = Kr.unit_group()
classes_r = Kr.class_group_result()
assert units_r.complete and units_r.unit_rank == 2 and units_r.verify_completion()
assert classes_r.complete and classes_r.order() == 1
assert Kr.class_number() == 1 and Kr.class_group().order() == 1

True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);
