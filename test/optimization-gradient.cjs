// sagejs-test-tier: integration
"use strict";

// Contract suite for the Sage-facing `sagejs.optimization.sage_api.minimize`
// dispatch onto the four gradient-related algorithms added in this phase --
// `powell`, `fmin_bfgs`, `fmin_cg` and `fmin_ncg` from
// `sagejs.optimization.gradient_methods`/`powell` -- and, above all, the
// automatic symbolic gradient/Hessian this module builds out of
// `Expression.derivative`, since Sage.js's `Expression` has no `gradient()`
// or `hessian()` method the way upstream Sage's does.
//
// TOLERANCE POLICY, following the sibling suites in this directory:
//   * Every "reaches the answer" check is |x_i - x_true_i| <= tol, with tol
//     drawn from the doctest that produced it wherever Sage's own doctest
//     states one (`# abs tol ...`), and otherwise a tolerance loose enough
//     to be robust while still failing on a genuinely wrong minimizer.
//   * Exact equality is used only for the gradient/Hessian unit checks
//     below, which compare a compiled symbolic derivative against a closed
//     form value at a point chosen so the arithmetic is exact in binary
//     floating point (small integers), and for status strings/iteration
//     counts, which are part of the contract being asserted.

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

// Imported once per session; every helper below assumes these names.
const PRELUDE = [
  "import math",
  "from sagejs.optimization import sage_api",
  "from sagejs.optimization.sage_api import minimize",
  "var('y z')",
  // Sage's own `minimize()` doctest objective: the 3-variable extended
  // Rosenbrock function, minimized at (1, 1, 1).
  "f_sym = 100*(y - x^2)^2 + (1 - x)^2 + 100*(z - y^2)^2 + (1 - y)^2",
  // The same function as a plain Python callable taking one point, and its
  // analytic gradient and Hessian -- scipy's own `rosen`/`rosen_der`/
  // `rosen_hess`, transliterated off NumPy's vectorized slicing (which this
  // package does not have -- there is no numpy) into a plain loop, and
  // specialized to n = 3 for the Hessian, whose off-diagonal shape does not
  // generalize as a one-liner.
  "def rosen(v):",
  "    total = 0.0",
  "    for i in range(len(v) - 1):",
  "        total += 100.0 * (v[i + 1] - v[i] ** 2) ** 2 + (1.0 - v[i]) ** 2",
  "    return total",
  "def rosen_der(v):",
  "    n = len(v)",
  "    der = [0.0] * n",
  "    for i in range(1, n - 1):",
  "        der[i] = (",
  "            200.0 * (v[i] - v[i - 1] ** 2)",
  "            - 400.0 * (v[i + 1] - v[i] ** 2) * v[i]",
  "            - 2.0 * (1.0 - v[i])",
  "        )",
  "    der[0] = -400.0 * v[0] * (v[1] - v[0] ** 2) - 2.0 * (1.0 - v[0])",
  "    der[-1] = 200.0 * (v[-1] - v[-2] ** 2)",
  "    return der",
  "def rosen_hess3(v):",
  "    x0, x1, x2 = v[0], v[1], v[2]",
  "    h00 = 1200.0 * x0 ** 2 - 400.0 * x1 + 2.0",
  "    h11 = 202.0 + 1200.0 * x1 ** 2 - 400.0 * x2",
  "    h22 = 200.0",
  "    h01 = -400.0 * x0",
  "    h12 = -400.0 * x1",
  "    return [[h00, h01, 0.0], [h01, h11, h12], [0.0, h12, h22]]",
].join("\n");

async function openSession() {
  const session = await createSage();
  await session.evaluate(PRELUDE);
  return session;
}

async function evalRepr(session, code) {
  return (await session.evaluate(code)).repr;
}

async function evalList(session, code) {
  return JSON.parse(await evalRepr(session, code));
}

async function evalFloat(session, code) {
  return Number(await evalRepr(session, `float(${code})`));
}

async function evalBool(session, code) {
  return (await evalRepr(session, `bool(${code})`)) === "True";
}

// Run `code` expecting `exceptionName`; returns the exception message. A
// *different* exception propagates out of `session.evaluate` and fails the
// test loudly, which is the desired outcome: the exception type is part of
// the contract being asserted.
async function messageFromRaise(session, code, exceptionName) {
  const body = code.split("\n").map((line) => `    ${line}`);
  const script = [
    "try:",
    ...body,
    "    _outcome = 'NO EXCEPTION RAISED'",
    `except ${exceptionName} as _err:`,
    "    _outcome = str(_err)",
    "_outcome",
  ].join("\n");
  const repr = await evalRepr(session, script);
  assert.notEqual(
    repr,
    "'NO EXCEPTION RAISED'",
    `expected ${exceptionName} from: ${code}`,
  );
  return repr.slice(1, -1);
}

function assertNear(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: ${actual} is not within ${tol} of ${expected}`,
  );
}

// ---------------------------------------------------------------------------
// Every wired algorithm reaches Sage's documented Rosenbrock answer
// ---------------------------------------------------------------------------

test("minimize(algorithm=...) reaches (1, 1, 1) for every wired algorithm", async () => {
  const session = await openSession();
  try {
    // sage: minimize(f, [.1,.3,.4])  # abs tol 1e-6
    // Symbolic `func`, `algorithm='default'`: a gradient is always
    // available for a symbolic expression (it is now differentiated
    // automatically), so this routes to BFGS, exactly as upstream.
    const defaultResult = await evalList(
      session,
      "[float(c) for c in minimize(f_sym, [.1, .3, .4])]",
    );
    assertNear(defaultResult[0], 1.0, 1e-6, "default[0]");
    assertNear(defaultResult[1], 1.0, 1e-6, "default[1]");
    assertNear(defaultResult[2], 1.0, 1e-6, "default[2]");

    // Explicit 'bfgs' on the same symbolic func must agree with 'default'
    // bit for bit: both derive the same gradient and run the same solver.
    const bfgsSameAsDefault = await evalBool(
      session,
      "minimize(f_sym, [.1, .3, .4]) == minimize(f_sym, [.1, .3, .4], algorithm='bfgs')",
    );
    assert.ok(bfgsSameAsDefault, "'default' must route to 'bfgs' exactly");

    // sage: minimize(f, [.1, .3, .4], algorithm='ncg')  # abs tol 1e-6
    // Both the gradient and the Hessian are differentiated automatically.
    const ncgResult = await evalList(
      session,
      "[float(c) for c in minimize(f_sym, [.1, .3, .4], algorithm='ncg')]",
    );
    assertNear(ncgResult[0], 1.0, 1e-6, "ncg[0]");
    assertNear(ncgResult[1], 1.0, 1e-6, "ncg[1]");
    assertNear(ncgResult[2], 1.0, 1e-6, "ncg[2]");

    // sage: minimize(rosen, [.1,.3,.4])  # abs tol 3e-5
    // A plain Python function, no gradient given: 'default' has no
    // gradient to route on, so this is the downhill simplex method.
    const plainDefault = await evalList(
      session,
      "[float(c) for c in minimize(rosen, [.1, .3, .4])]",
    );
    assertNear(plainDefault[0], 1.0, 3e-5, "plain default[0]");
    assertNear(plainDefault[1], 1.0, 3e-5, "plain default[1]");
    assertNear(plainDefault[2], 1.0, 3e-5, "plain default[2]");

    // sage: minimize(rosen, [.1,.3,.4], gradient=rosen_der,
    // ....:          algorithm='bfgs')  # abs tol 1e-6
    const plainBfgs = await evalList(
      session,
      [
        "[float(c) for c in minimize(",
        "    rosen, [.1, .3, .4], gradient=rosen_der, algorithm='bfgs')]",
      ].join("\n"),
    );
    assertNear(plainBfgs[0], 1.0, 1e-6, "plain bfgs[0]");
    assertNear(plainBfgs[1], 1.0, 1e-6, "plain bfgs[1]");
    assertNear(plainBfgs[2], 1.0, 1e-6, "plain bfgs[2]");

    // Not one of Sage's own doctests, but the same objective exercises
    // 'powell' and 'cg' too, so every documented algorithm name is covered.
    const powellResult = await evalList(
      session,
      "[float(c) for c in minimize(f_sym, [.1, .3, .4], algorithm='powell')]",
    );
    assertNear(powellResult[0], 1.0, 1e-4, "powell[0]");
    assertNear(powellResult[1], 1.0, 1e-4, "powell[1]");
    assertNear(powellResult[2], 1.0, 1e-4, "powell[2]");

    const cgResult = await evalList(
      session,
      "[float(c) for c in minimize(f_sym, [.1, .3, .4], algorithm='cg')]",
    );
    assertNear(cgResult[0], 1.0, 1e-4, "cg[0]");
    assertNear(cgResult[1], 1.0, 1e-4, "cg[1]");
    assertNear(cgResult[2], 1.0, 1e-4, "cg[2]");
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Symbolic auto-derived gradient vs. an equivalent hand-written one
// ---------------------------------------------------------------------------

test("an automatically derived symbolic gradient matches a hand-written one", async () => {
  const session = await openSession();
  try {
    // Same function, same starting point, same algorithm: one path
    // differentiates f_sym automatically, the other uses rosen/rosen_der
    // directly. Both must land on the same minimizer.
    const symbolic = await evalList(
      session,
      "[float(c) for c in minimize(f_sym, [.1, .3, .4], algorithm='bfgs')]",
    );
    const explicit = await evalList(
      session,
      [
        "[float(c) for c in minimize(",
        "    rosen, [.1, .3, .4], gradient=rosen_der, algorithm='bfgs')]",
      ].join("\n"),
    );
    for (let i = 0; i < 3; i += 1) {
      assertNear(symbolic[i], 1.0, 1e-6, `symbolic[${i}]`);
      assertNear(explicit[i], 1.0, 1e-6, `explicit[${i}]`);
      assertNear(
        symbolic[i],
        explicit[i],
        1e-5,
        `symbolic vs. explicit component ${i}`,
      );
    }
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// The gradient/Hessian builders themselves: order and zero partials
// ---------------------------------------------------------------------------

test("_symbolic_gradient_callable respects variable order, including an absent one", async () => {
  const session = await openSession();
  try {
    // `g` mentions only x and z; y is in `order` but not in `g` at all, so
    // its partial must come out exactly zero, in the middle of the vector,
    // not merely omitted.
    await session.evaluate(
      [
        "g = (x - 2)^2 + 3*z",
        "order = [x, y, z]",
        "grad_fn = sage_api._symbolic_gradient_callable(g, order)",
        "grad_at = grad_fn([5.0, 7.0, 11.0])",
      ].join("\n"),
    );
    const gradient = await evalList(session, "[float(c) for c in grad_at]");
    // d/dx = 2*(x - 2) = 2*(5 - 2) = 6; d/dy = 0 (y absent); d/dz = 3.
    assert.deepEqual(gradient, [6.0, 0.0, 3.0]);
  } finally {
    await session.close();
  }
});

test("_symbolic_hessian_callable matches the closed-form second partials", async () => {
  const session = await openSession();
  try {
    await session.evaluate(
      [
        "h = x^2*y + z^3",
        "order = [x, y, z]",
        "hess_fn = sage_api._symbolic_hessian_callable(h, order)",
        "hess_at = hess_fn([2.0, 5.0, 3.0])",
      ].join("\n"),
    );
    const hessian = await evalList(
      session,
      "[[float(c) for c in row] for row in hess_at]",
    );
    // grad = (2xy, x^2, 3z^2); at (2, 5, 3):
    // row 0 = (d/dx 2xy, d/dy 2xy, d/dz 2xy) = (2y, 2x, 0) = (10, 4, 0)
    // row 1 = (d/dx x^2, d/dy x^2, d/dz x^2) = (2x, 0, 0) = (4, 0, 0)
    // row 2 = (d/dx 3z^2, d/dy 3z^2, d/dz 3z^2) = (0, 0, 6z) = (0, 0, 18)
    assert.deepEqual(hessian, [
      [10.0, 4.0, 0.0],
      [4.0, 0.0, 0.0],
      [0.0, 0.0, 18.0],
    ]);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Newton-CG with and without an explicit Hessian
// ---------------------------------------------------------------------------

test("minimize(algorithm='ncg') works with a symbolic, an explicit and no Hessian", async () => {
  const session = await openSession();
  try {
    // Symbolic func, no hessian given: both the gradient and the Hessian
    // are differentiated automatically.
    const symbolicHessian = await evalList(
      session,
      "[float(c) for c in minimize(f_sym, [.1, .3, .4], algorithm='ncg')]",
    );

    // Plain func, explicit gradient AND explicit Hessian.
    const explicitHessian = await evalList(
      session,
      [
        "[float(c) for c in minimize(",
        "    rosen, [.1, .3, .4], gradient=rosen_der, hessian=rosen_hess3,",
        "    algorithm='ncg')]",
      ].join("\n"),
    );

    // Plain func, explicit gradient, NO Hessian: fmin_ncg falls back to a
    // forward-difference Hessian-vector product built from the gradient.
    const noHessian = await evalList(
      session,
      [
        "[float(c) for c in minimize(",
        "    rosen, [.1, .3, .4], gradient=rosen_der, algorithm='ncg')]",
      ].join("\n"),
    );

    for (const [label, result] of [
      ["symbolic hessian", symbolicHessian],
      ["explicit hessian", explicitHessian],
      ["no hessian", noHessian],
    ]) {
      assertNear(result[0], 1.0, 1e-4, `${label}[0]`);
      assertNear(result[1], 1.0, 1e-4, `${label}[1]`);
      assertNear(result[2], 1.0, 1e-4, `${label}[2]`);
    }
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// verbose=True prints Sage's convergence message
// ---------------------------------------------------------------------------

test("minimize(verbose=True) prints the convergence message", async () => {
  const session = await openSession();
  try {
    // sage: minimize(f, [.1, .3, .4], algorithm='ncg', verbose=True)
    // Optimization terminated successfully.
    // ...
    // (0.9999999..., 0.999999..., 0.999999...)
    const result = await session.evaluate(
      "minimize(f_sym, [.1, .3, .4], algorithm='ncg', verbose=True)",
    );
    const lines = result.stdout.trimEnd().split("\n");
    assert.equal(lines[0], "Optimization terminated successfully.");
    assert.ok(
      lines.some((line) => line.includes("Current function value")),
      `stdout should report the function value: ${result.stdout}`,
    );
    assert.ok(
      lines.some((line) => line.includes("Iterations")),
      `stdout should report the iteration count: ${result.stdout}`,
    );
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("minimize edge cases: already at the minimum, maxiter=0, non-finite start", async () => {
  const session = await openSession();
  try {
    // A quadratic already at its minimizer: the gradient there is zero, so
    // BFGS must stop before a single iteration.
    await session.evaluate("quad = (x - 2)^2 + (y - 3)^2");
    const atMinimum = await session.evaluate(
      "minimize(quad, [2.0, 3.0], algorithm='bfgs', verbose=True)",
    );
    assert.ok(
      atMinimum.stdout.includes("Iterations: 0"),
      `already at the minimum should take zero iterations: ${atMinimum.stdout}`,
    );
    const atMinimumPoint = JSON.parse(
      await evalRepr(
        session,
        "[float(c) for c in minimize(quad, [2.0, 3.0], algorithm='bfgs')]",
      ),
    );
    assertNear(atMinimumPoint[0], 2.0, 1e-8, "already-at-minimum x");
    assertNear(atMinimumPoint[1], 3.0, 1e-8, "already-at-minimum y");

    // maxiter=0 must stop immediately too, and report the maxiter message.
    const zeroIterations = await session.evaluate(
      "minimize(f_sym, [.1, .3, .4], algorithm='bfgs', verbose=True, maxiter=0)",
    );
    assert.ok(
      zeroIterations.stdout.includes(
        "Maximum number of iterations has been exceeded.",
      ),
      `maxiter=0 should report the maxiter message: ${zeroIterations.stdout}`,
    );

    // A non-finite starting point: the run must not crash, and must report
    // a NaN result rather than a fabricated answer.
    const nonFinite = await session.evaluate(
      [
        "minimize(",
        "    f_sym, [float('nan'), .3, .4], algorithm='bfgs', verbose=True)",
      ].join("\n"),
    );
    assert.ok(
      nonFinite.stdout.includes("NaN result encountered."),
      `a non-finite start should report a NaN result: ${nonFinite.stdout}`,
    );
  } finally {
    await session.close();
  }
});

test("minimize edge cases: a gradient of the wrong length, an unknown algorithm", async () => {
  const session = await openSession();
  try {
    // A user-supplied gradient returning too few components must not be
    // silently accepted -- it fails as soon as it meets code that expects
    // one component per variable, rather than producing a wrong answer.
    await session.evaluate("short_gradient = lambda v: [2.0 * (v[0] - 1.0)]");
    const shortGradientMessage = await messageFromRaise(
      session,
      [
        "minimize(",
        "    rosen, [.1, .3, .4], gradient=short_gradient, algorithm='bfgs')",
      ].join("\n"),
      "ValueError",
    );
    assert.ok(
      shortGradientMessage.length > 0,
      "a length-mismatched gradient should raise a descriptive ValueError",
    );

    // An algorithm name Sage does not document at all.
    const unknownAlgorithm = await messageFromRaise(
      session,
      "minimize(rosen, [.1, .3, .4], algorithm='not-an-algorithm')",
      "NotImplementedError",
    );
    assert.ok(
      unknownAlgorithm.includes("not-an-algorithm"),
      `the message should name the algorithm: ${unknownAlgorithm}`,
    );

    // 'ncg' with no gradient available anywhere (plain func, none supplied)
    // is a TypeError, not a silent fallback -- fmin_ncg has no default.
    const missingGradient = await messageFromRaise(
      session,
      "minimize(rosen, [.1, .3, .4], algorithm='ncg')",
      "TypeError",
    );
    assert.ok(
      missingGradient.toLowerCase().includes("gradient"),
      `the message should mention the missing gradient: ${missingGradient}`,
    );
  } finally {
    await session.close();
  }
});
