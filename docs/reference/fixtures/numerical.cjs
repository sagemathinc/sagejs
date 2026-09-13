"use strict";

// These compact public workflows are the executable source of the numerical
// reference examples.  Each checks the structured success/validation contract
// and an independently recognizable mathematical property.  They deliberately
// use the ordinary portable implementations: none imports an optional native
// package or asks for an external numerical backend.

function group(id, covers, source, want = "True") {
  return {
    id: `sagejs-numerical-reference:${id}`,
    owner: id,
    covers,
    line: 1,
    examples: [{
      id: `docs/reference/fixtures/numerical.cjs:${id}`,
      line: 1,
      source: source.trim(),
      want,
      tags: ["numerical", "portable", "reference"],
    }],
  };
}

module.exports = {
  schema: "sagejs.sage-doctests/v1",
  generatedBy: "docs/reference/fixtures/numerical.cjs",
  source: {
    repository: "https://github.com/sagemathinc/sagejs",
    revision: "working-tree",
    path: "docs/reference/fixtures/numerical.cjs",
    license: "GPL-3.0-only",
    description: (
      "Portable Sage.js numerical workflows with independent mathematical " +
      "checks; verified by the public reference doctest pipeline."
    ),
  },
  groups: [
    group(
      "find-root",
      ["find_root"],
      `
from sagejs.numerics import find_root

root = find_root(lambda x: x*x - 2.0, 1.0, 2.0, method="brent")
root.success and root.validation.passed and abs(root.value*root.value - 2.0) < 1.0e-10
      `,
    ),
    group(
      "minimize-scalar",
      ["minimize_scalar"],
      `
from sagejs.numerics.optimization import minimize_scalar

minimum = minimize_scalar(lambda x: (x - 2.0)**2, -1.0, 5.0)
minimum.success and minimum.validation.passed and abs(minimum.value - 2.0) < 1.0e-8
      `,
    ),
    group(
      "minimize",
      ["minimize"],
      `
from sagejs.numerics.optimization import minimize

minimum = minimize(
    lambda point: (point[0] - 3.0)**2 + (point[1] + 1.0)**2,
    [0.0, 0.0],
    gradient=lambda point: [2.0*(point[0] - 3.0), 2.0*(point[1] + 1.0)],
    method="bfgs",
)
minimum.success and minimum.validation.passed and abs(minimum.value[0] - 3.0) < 1.0e-7 and abs(minimum.value[1] + 1.0) < 1.0e-7
      `,
    ),
    group(
      "curve-fit",
      ["curve_fit"],
      `
from sagejs.numerics.optimization import curve_fit

fit = curve_fit(
    lambda x, parameters: parameters[0]*x + parameters[1],
    [0.0, 1.0, 2.0, 3.0],
    [1.0, 3.0, 5.0, 7.0],
    [0.0, 0.0],
    jacobian=lambda x, parameters: [x, 1.0],
)
fit.success and fit.validation.passed and abs(fit.value[0] - 2.0) < 1.0e-8 and abs(fit.value[1] - 1.0) < 1.0e-8
      `,
    ),
    group(
      "solve-ivp",
      ["solve_ivp"],
      `
import math
from sagejs.numerics.ode import solve_ivp

solution = solve_ivp(lambda t, y: [y[0]], (0.0, 1.0), [1.0])
solution.success and solution.validation.passed and abs(solution.value[0] - math.e) < 1.0e-5
      `,
    ),
    group(
      "integrate",
      ["integrate"],
      `
from sagejs.numerics.integration import integrate

integral = integrate(lambda x: x*x, 0.0, 1.0)
integral.success and integral.validation.passed and abs(integral.value - 1.0/3.0) < 1.0e-10
      `,
    ),
    group(
      "svd",
      ["svd"],
      `
from sagejs.numerics.spectral import svd

decomposition = svd([[3.0, 0.0], [0.0, 2.0]])
values = decomposition.value["singular_values"]
decomposition.success and decomposition.validation.passed and abs(values[0] - 3.0) < 1.0e-10 and abs(values[1] - 2.0) < 1.0e-10
      `,
    ),
    group(
      "fft",
      ["fft"],
      `
from sagejs.numerics.spectral import fft

spectrum = fft([1.0, 0.0, 0.0, 0.0])
spectrum.success and spectrum.validation.passed and all(abs(value - 1.0) < 1.0e-10 for value in spectrum.value)
      `,
    ),
  ],
};

module.exports.summary = {
  groups: module.exports.groups.length,
  examples: module.exports.groups.reduce(
    (total, item) => total + item.examples.length,
    0,
  ),
};
