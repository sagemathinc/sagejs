// sagejs-test-tier: integration
"use strict";

// Contract suite for `sagejs.optimization.line_search`: the shared inexact
// line search that BFGS, nonlinear CG and Newton-CG all run, plus the
// forward-difference gradient helper.
//
// The module is a transcription of what `scipy.optimize` actually executes:
//   * `scalar_search_wolfe1` / `line_search_wolfe1` -> MINPACK-2 `dcsrch` /
//     `dcstep`, via `scipy/optimize/_dcsrch.py`;
//   * `scalar_search_wolfe2` / `line_search_wolfe2` -> Nocedal & Wright,
//     "Numerical Optimization" 2nd ed., Algorithms 3.5 and 3.6, via
//     `scipy/optimize/_linesearch.py` (`_zoom`, `_cubicmin`, `_quadmin`);
//   * `line_search_wolfe12` -> `scipy.optimize._optimize._line_search_wolfe12`.
//
// Every alpha, task string and evaluation count asserted below was produced by
// running the corresponding SciPy routine (scipy 1.17.1, with `_cubicmin`
// patched to the current SciPy source's explicit-scalar form -- see the
// `_cubicmin` note on the fallback test) on the same input.
//
// TOLERANCE POLICY
// The Wolfe conditions are inequalities, so they are asserted *exactly* as
// inequalities on freshly computed values -- no epsilon fudge, because a step
// either satisfies them or the search is wrong. Steps themselves are compared
// to SciPy's with a stated tolerance, and evaluation counts, task strings and
// the `None`/not-`None` outcome are compared exactly: they are the contract.

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const PRELUDE = [
  "from sagejs.optimization.line_search import (",
  "    EPSILON,",
  "    LineSearchError,",
  "    approx_fprime,",
  "    line_search_wolfe1,",
  "    line_search_wolfe12,",
  "    line_search_wolfe2,",
  "    numerical_gradient,",
  "    scalar_search_wolfe1,",
  "    scalar_search_wolfe2,",
  ")",
  // A counting wrapper, so the evaluation tallies the module reports can be
  // cross-checked against the calls the objective actually received.
  "class Counter:",
  "    def __init__(self, phi, derphi):",
  "        self._phi = phi",
  "        self._derphi = derphi",
  "        self.fc = 0",
  "        self.gc = 0",
  "    def phi(self, a):",
  "        self.fc += 1",
  "        return self._phi(a)",
  "    def derphi(self, a):",
  "        self.gc += 1",
  "        return self._derphi(a)",
  // `float(...)` guards every constant: a bare Sage RealLiteral times an
  // integral float raises, and these objectives are written in the session.
  "def dot(u, v):",
  "    return sum(a * b for a, b in zip(u, v))",
  "def axpy(x, a, p):",
  "    return [xi + a * pi for xi, pi in zip(x, p)]",
].join("\n");

async function openSession() {
  const session = await createSage();
  await session.evaluate(PRELUDE);
  return session;
}

async function evalRepr(session, code) {
  return (await session.evaluate(code)).repr;
}

async function evalFloat(session, code) {
  return Number(await evalRepr(session, `float(${code})`));
}

async function evalInt(session, code) {
  return Number(await evalRepr(session, `int(${code})`));
}

async function evalList(session, code) {
  return JSON.parse(await evalRepr(session, code));
}

async function evalBool(session, code) {
  return (await evalRepr(session, `bool(${code})`)) === "True";
}

async function evalStr(session, code) {
  const repr = await evalRepr(session, code);
  return repr.slice(1, -1);
}

async function isNone(session, code) {
  return (await evalRepr(session, `${code} is None`)) === "True";
}

// ---------------------------------------------------------------------------
// A strongly convex quadratic, where the exact Wolfe step is closed form
// ---------------------------------------------------------------------------

// For f(x) = 0.5 x^T A x with A = diag(1, 10), the exact minimizer of
// phi(a) = f(x + a p) along any p is a* = -<Ax, p> / <Ap, p>, at which
// phi'(a*) = 0. A zero slope satisfies the curvature condition for every
// c2 > 0, and phi(a*) <= phi(0) + c1 a* phi'(0) holds for every c1 < 0.5
// because phi is a parabola. So a* is a strong Wolfe step for all admissible
// (c1, c2), and it is the step the searches must land on when the direction
// is steepest descent and the very first trial step is not already accepted.
const QUADRATIC = [
  "A = [float(1.0), float(10.0)]",
  "fq = lambda v: float(0.5) * (A[0] * v[0] ** 2 + A[1] * v[1] ** 2)",
  "gq = lambda v: [A[0] * v[0], A[1] * v[1]]",
].join("\n");

test("wolfe12 finds the closed-form exact step on a convex quadratic", async () => {
  const session = await openSession();
  try {
    await session.evaluate(QUADRATIC);
    // The three starting points and their exact steps, computed in closed
    // form: a* = <g, g> / <Ap, p> with p = -g.
    const cases = [
      { x: "[float(1.0), float(1.0)]", exact: 0.1008991008991009 },
      { x: "[float(3.0), float(-0.5)]", exact: 0.13127413127413126 },
      { x: "[float(-2.0), float(0.25)]", exact: 0.15413533834586465 },
    ];
    for (const { x, exact } of cases) {
      await session.evaluate(
        [
          `xk = ${x}`,
          "gfk = gq(xk)",
          "pk = [-gi for gi in gfk]",
          "res = line_search_wolfe12(fq, gq, xk, pk, gfk)",
          "num = dot(gfk, gfk)",
          "den = sum(A[i] * pk[i] * pk[i] for i in range(2))",
          "a_exact = num / den",
        ].join("\n"),
      );

      const alpha = await evalFloat(session, "res.alpha");
      const aExact = await evalFloat(session, "a_exact");

      // The closed-form value is reproduced bit for bit: dcsrch's second
      // trial step is the exact quadratic interpolant of the parabola, so
      // there is no iteration error to absorb here.
      assert.equal(aExact, exact);
      assert.equal(alpha, exact);

      // The MINPACK search converged; no fallback was needed.
      assert.equal(await evalStr(session, "res.task"), "CONVERGENCE");
      assert.equal(await evalBool(session, "res.used_fallback"), false);

      // Three function values (phi(0) is not supplied, then two trial
      // steps) and two gradients. These counts are SciPy's exactly.
      assert.equal(await evalInt(session, "res.function_calls"), 3);
      assert.equal(await evalInt(session, "res.gradient_calls"), 2);

      // The returned gradient really is the gradient at the new point, so
      // the caller can reuse it instead of recomputing.
      const returned = await evalList(session, "res.new_gradient");
      const recomputed = await evalList(session, "gq(axpy(xk, res.alpha, pk))");
      assert.deepEqual(returned, recomputed);

      // At the exact minimizer the slope is zero to rounding.
      const slope = await evalFloat(session, "res.new_slope");
      assert.ok(
        Math.abs(slope) < 1e-9,
        `slope ${slope} should vanish at the exact minimizer`,
      );
    }
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// A case where wolfe1 provably fails and wolfe2 must take over
// ---------------------------------------------------------------------------

// phi(a) = 1e-9 a^4 + 1e-5 a^2 - a is decreasing and very shallow: its
// stationary point sits near a = 630, far outside dcsrch's default
// amax = 50. dcsrch therefore walks out to the bound and stops with
// "WARNING: STP = STPMAX" -- a genuine algorithmic failure, not an input
// error -- while the Nocedal-Wright search, whose default amax is None,
// keeps doubling and accepts a = 512. This is precisely the structural
// reason SciPy runs two searches instead of one.
const SHALLOW_QUARTIC = [
  "cq = float(1e-9)",
  "bq = float(1e-5)",
  "phi_s = lambda a: cq * a ** 4 + bq * a ** 2 - a",
  "der_s = lambda a: float(4.0) * cq * a ** 3 + float(2.0) * bq * a - float(1.0)",
].join("\n");

test("wolfe1 fails at its step bound and wolfe2 takes over", async () => {
  const session = await openSession();
  try {
    await session.evaluate(SHALLOW_QUARTIC);
    await session.evaluate(
      [
        "c1 = Counter(phi_s, der_s)",
        "r1 = scalar_search_wolfe1(c1.phi, c1.derphi)",
        "c2 = Counter(phi_s, der_s)",
        "r2 = scalar_search_wolfe2(c2.phi, c2.derphi)",
      ].join("\n"),
    );

    // wolfe1: no step, and the reason is the step bound, not bad input.
    assert.ok(await isNone(session, "r1.alpha"));
    assert.equal(await evalStr(session, "r1.task"), "WARNING: STP = STPMAX");
    // SciPy's dcsrch spends 5 function and 5 gradient evaluations here.
    assert.equal(await evalInt(session, "r1.function_calls"), 5);
    assert.equal(await evalInt(session, "r1.gradient_calls"), 5);
    assert.equal(await evalInt(session, "c1.fc"), 5);
    assert.equal(await evalInt(session, "c1.gc"), 5);

    // wolfe2: a step, and it is exactly SciPy's.
    assert.equal(await evalFloat(session, "r2.alpha"), 512.0);
    assert.equal(await evalInt(session, "r2.function_calls"), 11);
    assert.equal(await evalInt(session, "r2.gradient_calls"), 11);
    assert.equal(await evalInt(session, "c2.fc"), 11);
    assert.equal(await evalInt(session, "c2.gc"), 11);

    // And that step really does satisfy both strong Wolfe conditions, with
    // SciPy's defaults c1 = 1e-4, c2 = 0.9.
    await session.evaluate(
      [
        "p0 = phi_s(float(0.0))",
        "d0 = der_s(float(0.0))",
        "armijo = phi_s(r2.alpha) <= p0 + float(1e-4) * r2.alpha * d0",
        "curvature = abs(der_s(r2.alpha)) <= float(0.9) * abs(d0)",
      ].join("\n"),
    );
    assert.equal(await evalBool(session, "armijo"), true);
    assert.equal(await evalBool(session, "curvature"), true);

    // The chained entry point stitches the two together: it reports the
    // fallback and the *total* evaluation count across both searches, which
    // is where it deliberately departs from SciPy's `_line_search_wolfe12`
    // (SciPy discards the first search's tally and understates nfev).
    await session.evaluate(
      [
        "fv = lambda v: cq * v[0] ** 4 + bq * v[0] ** 2 - v[0]",
        "gv = lambda v: [float(4.0) * cq * v[0] ** 3 + float(2.0) * bq * v[0]",
        "                - float(1.0)]",
        "chained = line_search_wolfe12(fv, gv, [float(0.0)], [float(1.0)])",
      ].join("\n"),
    );
    assert.equal(await evalBool(session, "chained.used_fallback"), true);
    assert.equal(await evalFloat(session, "chained.alpha"), 512.0);
    // 5 + 11 function evaluations; 1 (gfk, which was not supplied) + 5 for
    // the MINPACK attempt, then 10 more for the fallback, which reuses the
    // gradient it already holds at the accepted step.
    assert.equal(await evalInt(session, "chained.function_calls"), 16);
    assert.equal(await evalInt(session, "chained.gradient_calls"), 16);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// The both-fail path
// ---------------------------------------------------------------------------

test("an ascent direction defeats both searches and raises LineSearchError", async () => {
  const session = await openSession();
  try {
    await session.evaluate(QUADRATIC);
    await session.evaluate(
      [
        "xk = [float(1.0), float(1.0)]",
        "gfk = gq(xk)",
        // +grad, not -grad: an ascent direction, along which no step can
        // decrease f, so neither Wolfe condition is reachable.
        "pk = list(gfk)",
        "r1 = line_search_wolfe1(fq, gq, xk, pk, gfk)",
        "r2 = line_search_wolfe2(fq, gq, xk, pk, gfk)",
      ].join("\n"),
    );

    // dcsrch rejects the direction outright on its input check.
    assert.ok(await isNone(session, "r1.alpha"));
    assert.equal(
      await evalStr(session, "r1.task"),
      "ERROR: INITIAL G .GE. ZERO",
    );

    // The Nocedal-Wright search brackets immediately and its zoom stage
    // exhausts its 10 iterations without a conforming step.
    assert.ok(await isNone(session, "r2.alpha"));
    assert.equal(
      await evalStr(session, "r2.task"),
      "WARNING: the zoom stage did not converge",
    );
    assert.ok(await isNone(session, "r2.new_gradient"));
    assert.ok(await isNone(session, "r2.new_fval"));

    // Chained, that is the condition SciPy signals with `_LineSearchError`
    // and callers report as "Desired error not necessarily achieved due to
    // precision loss."
    const script = [
      "try:",
      "    line_search_wolfe12(fq, gq, xk, pk, gfk)",
      "    _outcome = 'NO EXCEPTION RAISED'",
      "except LineSearchError as _err:",
      "    _outcome = str(_err)",
      "_outcome",
    ].join("\n");
    const message = await evalStr(session, script);
    assert.notEqual(message, "NO EXCEPTION RAISED");
    assert.match(message, /strong.*Wolfe conditions/);

    // `LineSearchError` is a `RuntimeError`, as SciPy's `_LineSearchError`
    // is, so a caller may catch either.
    assert.equal(
      await evalBool(session, "issubclass(LineSearchError, RuntimeError)"),
      true,
    );
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// The Wolfe conditions themselves, over a spread of random directions
// ---------------------------------------------------------------------------

// Four objectives with analytic gradients, exercised from pseudo-random
// points along pseudo-random descent directions. The generator is a plain
// LCG written in the session so the sweep is bit-reproducible and needs no
// import.
const SWEEP = [
  "class Lcg:",
  "    def __init__(self, seed):",
  "        self.state = seed",
  "    def next(self):",
  "        self.state = (self.state * 6364136223846793005 + 1442695040888963407)",
  "        self.state %= 18446744073709551616",
  "        return (self.state >> 11) / float(9007199254740992.0)",
  "    def uniform(self, lo, hi):",
  "        return lo + (hi - lo) * self.next()",
  "",
  "def rosen(v):",
  "    return sum(",
  "        float(100.0) * (v[i + 1] - v[i] ** 2) ** 2 + (float(1.0) - v[i]) ** 2",
  "        for i in range(len(v) - 1)",
  "    )",
  "",
  "def rosen_g(v):",
  "    out = [float(0.0)] * len(v)",
  "    for i in range(len(v) - 1):",
  "        t = v[i + 1] - v[i] ** 2",
  "        out[i] += float(-400.0) * v[i] * t - float(2.0) * (float(1.0) - v[i])",
  "        out[i + 1] += float(200.0) * t",
  "    return out",
  "",
  "def beale(v):",
  "    x, y = v",
  "    return (",
  "        (float(1.5) - x + x * y) ** 2",
  "        + (float(2.25) - x + x * y * y) ** 2",
  "        + (float(2.625) - x + x * y ** 3) ** 2",
  "    )",
  "",
  "def beale_g(v):",
  "    x, y = v",
  "    a = float(1.5) - x + x * y",
  "    b = float(2.25) - x + x * y * y",
  "    c = float(2.625) - x + x * y ** 3",
  "    return [",
  "        2 * a * (y - 1) + 2 * b * (y * y - 1) + 2 * c * (y ** 3 - 1),",
  "        2 * a * x + 4 * b * x * y + 6 * c * x * y * y,",
  "    ]",
  "",
  "def illquad(v):",
  "    return sum(float(10.0) ** i * vi * vi for i, vi in enumerate(v))",
  "",
  "def illquad_g(v):",
  "    return [float(2.0) * float(10.0) ** i * vi for i, vi in enumerate(v)]",
  "",
  "SUITE = [",
  "    ('rosen2', rosen, rosen_g, 2),",
  "    ('rosen5', rosen, rosen_g, 5),",
  "    ('beale', beale, beale_g, 2),",
  "    ('illquad', illquad, illquad_g, 4),",
  "]",
  "",
  "def sweep(c2, trials):",
  "    rng = Lcg(20260822)",
  "    satisfied = 0",
  "    total = 0",
  "    failures = 0",
  "    fc = 0",
  "    gc = 0",
  "    gradient_exact = 0",
  "    for _name, f, g, n in SUITE:",
  "        for _ in range(trials):",
  "            xk = [rng.uniform(float(-1.5), float(1.5)) for _ in range(n)]",
  "            gfk = g(xk)",
  "            gnorm = dot(gfk, gfk) ** float(0.5)",
  "            if gnorm < float(1e-8):",
  "                continue",
  "            pk = [",
  "                -gi + rng.uniform(float(-0.5), float(0.5)) * gnorm",
  "                for gi in gfk",
  "            ]",
  "            slope = dot(gfk, pk)",
  "            if slope >= 0:",
  "                pk = [-gi for gi in gfk]",
  "                slope = -gnorm * gnorm",
  "            total += 1",
  "            try:",
  "                res = line_search_wolfe12(f, g, xk, pk, gfk, c1=float(1e-4),",
  "                                          c2=c2)",
  "            except LineSearchError:",
  "                failures += 1",
  "                continue",
  "            fc += res.function_calls",
  "            gc += res.gradient_calls",
  "            xa = axpy(xk, res.alpha, pk)",
  "            armijo = f(xa) <= f(xk) + float(1e-4) * res.alpha * slope",
  "            curvature = abs(res.new_slope) <= c2 * abs(slope)",
  "            if armijo and curvature:",
  "                satisfied += 1",
  "            if g(xa) == res.new_gradient:",
  "                gradient_exact += 1",
  "    return [total, satisfied, failures, fc, gc, gradient_exact]",
].join("\n");

for (const c2 of [0.9, 0.4]) {
  test(`every accepted step satisfies the strong Wolfe conditions (c2=${c2})`, async () => {
    const session = await openSession();
    try {
      await session.evaluate(SWEEP);
      const [total, satisfied, failures, fc, gc, gradientExact] =
        await evalList(session, `sweep(float(${c2}), 60)`);

      // 60 trials on each of 4 objectives.
      assert.equal(total, 240);
      // No search fails on a genuine descent direction for these functions.
      assert.equal(failures, 0);
      // The Armijo and curvature inequalities are checked exactly, on values
      // recomputed from the returned step -- not on anything the search
      // reported about itself.
      assert.equal(satisfied, total);
      // And the gradient handed back is bit-identical to a fresh evaluation
      // at the new point, so reusing it is not an approximation.
      assert.equal(gradientExact, total);

      // The evaluation counts are part of the contract: a Wolfe search that
      // silently doubled its budget would still pass every inequality above.
      // SciPy averages a shade over 4 function and 3 gradient evaluations per
      // call on this sweep; anything past 8 and 7 means the search is
      // thrashing.
      assert.ok(
        fc / total < 8,
        `mean function evaluations ${fc / total} is implausibly high`,
      );
      assert.ok(
        gc / total < 7,
        `mean gradient evaluations ${gc / total} is implausibly high`,
      );
      // Each gradient evaluation but the last accompanies a function
      // evaluation, so gradients can never outnumber function calls.
      assert.ok(gc <= fc, `${gc} gradient calls exceed ${fc} function calls`);
    } finally {
      await session.close();
    }
  });
}

// ---------------------------------------------------------------------------
// Defaults, validation, and the forward-difference gradient
// ---------------------------------------------------------------------------

test("the SciPy defaults are preserved exactly", async () => {
  const session = await openSession();
  try {
    // sqrt(machine epsilon), SciPy's `_epsilon`.
    assert.equal(await evalFloat(session, "EPSILON"), 1.4901161193847656e-8);

    await session.evaluate("import inspect");
    const wolfe1 = await evalList(
      session,
      [
        "[",
        "    float(inspect.signature(scalar_search_wolfe1).parameters[n].default)",
        "    for n in ('c1', 'c2', 'amax', 'amin', 'xtol')",
        "]",
      ].join("\n"),
    );
    // c1, c2, amax, amin, xtol -- `scipy.optimize._linesearch`'s
    // `scalar_search_wolfe1` signature.
    assert.deepEqual(wolfe1, [1e-4, 0.9, 50.0, 1e-8, 1e-14]);

    const wolfe2 = await evalList(
      session,
      [
        "[",
        "    float(inspect.signature(scalar_search_wolfe2).parameters[n].default)",
        "    for n in ('c1', 'c2')",
        "]",
      ].join("\n"),
    );
    assert.deepEqual(wolfe2, [1e-4, 0.9]);
    // `amax` defaults to None for wolfe2 -- that difference from wolfe1's 50
    // is what makes the fallback able to succeed where the first search
    // cannot.
    assert.equal(
      await evalBool(
        session,
        "inspect.signature(scalar_search_wolfe2).parameters['amax'].default is None",
      ),
      true,
    );
    assert.equal(
      await evalInt(
        session,
        "inspect.signature(scalar_search_wolfe2).parameters['maxiter'].default",
      ),
      10,
    );
  } finally {
    await session.close();
  }
});

test("c1 and c2 outside 0 < c1 < c2 < 1 are rejected", async () => {
  const session = await openSession();
  try {
    for (const entry of ["scalar_search_wolfe1", "scalar_search_wolfe2"]) {
      for (const args of ["c1=float(0.9), c2=float(0.1)", "c1=float(-1.0)"]) {
        const script = [
          "try:",
          `    ${entry}(lambda a: a, lambda a: float(1.0), ${args})`,
          "    _outcome = 'NO EXCEPTION RAISED'",
          "except ValueError as _err:",
          "    _outcome = str(_err)",
          "_outcome",
        ].join("\n");
        const message = await evalStr(session, script);
        assert.equal(
          message,
          "'c1' and 'c2' do not satisfy '0 < c1 < c2 < 1'.",
          `${entry} with ${args}`,
        );
      }
    }
  } finally {
    await session.close();
  }
});

test("approx_fprime is SciPy's forward difference", async () => {
  const session = await openSession();
  try {
    await session.evaluate(SWEEP);
    // The gradient of f(x) = c0 x0^2 + c1 x1^2 at (1, 1) is (2 c0, 2 c1); the
    // forward difference reproduces it to the expected sqrt(eps) accuracy.
    await session.evaluate(
      [
        "f2 = lambda v: v[0] ** 2 + float(200.0) * v[1] ** 2",
        "approx = approx_fprime([float(1.0), float(1.0)], f2)",
      ].join("\n"),
    );
    const approx = await evalList(session, "approx");
    assert.equal(approx.length, 2);
    // A forward difference has error O(sqrt(eps) * |f''|), which is about
    // 1e-8 for the first component and 200 times that for the second.
    assert.ok(Math.abs(approx[0] - 2.0) < 1e-6, `${approx[0]}`);
    assert.ok(Math.abs(approx[1] - 400.0) < 1e-4, `${approx[1]}`);

    // The cost is exactly n + 1 evaluations -- one baseline plus one per
    // coordinate. That is what makes a gradient-free BFGS run cost (n+1)
    // times as much per iteration.
    await session.evaluate(
      [
        "calls = [0]",
        "def counted(v):",
        "    calls[0] += 1",
        "    return rosen(v)",
        "_ = approx_fprime([float(0.3)] * 6, counted)",
      ].join("\n"),
    );
    assert.equal(await evalInt(session, "calls[0]"), 7);

    // Against the analytic gradient, on every objective in the sweep.
    await session.evaluate(
      [
        "def worst_relative_error():",
        "    rng = Lcg(31337)",
        "    worst = float(0.0)",
        "    for _name, f, g, n in SUITE:",
        "        for _ in range(20):",
        "            xk = [rng.uniform(float(-1.0), float(1.0))",
        "                  for _ in range(n)]",
        "            exact = g(xk)",
        "            approx = approx_fprime(xk, f)",
        "            for e, a in zip(exact, approx):",
        "                scale = max(float(1.0), abs(e))",
        "                worst = max(worst, abs(a - e) / scale)",
        "    return worst",
      ].join("\n"),
    );
    const worst = await evalFloat(session, "worst_relative_error()");
    // Forward differences lose half the mantissa: the error floor is
    // sqrt(eps) ~ 1.5e-8, and these objectives have second derivatives in the
    // hundreds, so 1e-5 is the honest bound. A bug in the step size (using
    // `h` rather than the realized `(x+h)-x`, say) shows up far above this.
    assert.ok(worst < 1e-5, `worst relative error ${worst}`);

    // `numerical_gradient` is the same thing behind the callable signature
    // the searches take, and it drives a real line search to a Wolfe step.
    await session.evaluate(
      [
        "gnum = numerical_gradient(rosen)",
        "xk = [float(-1.2), float(1.0)]",
        "gfk = gnum(xk)",
        "pk = [-gi for gi in gfk]",
        "res = line_search_wolfe12(rosen, gnum, xk, pk, gfk)",
        "slope0 = dot(gfk, pk)",
        "xa = axpy(xk, res.alpha, pk)",
        "armijo = rosen(xa) <= rosen(xk) + float(1e-4) * res.alpha * slope0",
        "curvature = abs(res.new_slope) <= float(0.9) * abs(slope0)",
      ].join("\n"),
    );
    assert.equal(await evalBool(session, "res.alpha > 0"), true);
    assert.equal(await evalBool(session, "armijo"), true);
    assert.equal(await evalBool(session, "curvature"), true);
  } finally {
    await session.close();
  }
});

test("the module imports nothing from the rest of the package", async () => {
  const session = await openSession();
  try {
    // Every algorithm module has to be free to import this one, so it must
    // not reach back into the package and create a cycle. The module objects
    // bound at module scope are the whole of what it pulled in.
    await session.evaluate(
      [
        "import sagejs.optimization.line_search as _ls",
        "import types",
        "imported = ','.join(",
        "    sorted(",
        "        name",
        "        for name, value in vars(_ls).items()",
        "        if isinstance(value, types.ModuleType)",
        "        and not name.startswith('_')",
        "    )",
        ")",
      ].join("\n"),
    );
    assert.equal(await evalStr(session, "imported"), "math");
  } finally {
    await session.close();
  }
});
