"use strict";

// Phase 3 edge-case suite for the curve-fitting and constrained halves of
// `sagejs.optimization`: MINPACK `lmdif` nonlinear least squares
// (`leastsq`), Powell's COBYLA (`cobyla`), and the two Sage-compatible
// front doors built on them, `find_fit` and `minimize_constrained`.
//
// TOLERANCE POLICY
// No assertion below ever pins a fitted parameter with an exact float
// comparison. Every numeric check is one of:
//   * |p - p_true| <= tol against the parameters the synthetic data was
//     GENERATED from, with the tol justified in a comment from either the
//     solver's own stopping tolerance (`leastsq` stops at xtol = 1.49e-8;
//     `cobyla` at rhoend = 1e-4, and may return a point up to catol = 2e-4
//     outside the feasible set) or, for noisy data, from a worst-case
//     least-squares perturbation bound computed from the noise amplitude;
//   * a residual-sum-of-squares threshold, stated and justified -- for
//     exact data from the size of one ulp of the data values, for noisy
//     data from the least-squares optimality property that the fit cannot
//     explain the data worse than the true generating parameters do;
//   * |f(x) - f_min| against a minimum known in closed form, which is the
//     better test wherever the argmin is flat or sits on a constraint
//     boundary COBYLA is only required to reach to within catol;
//   * a structural invariant: an active constraint is tight, an evaluation
//     budget was respected exactly, the returned point is the best one the
//     objective ever saw under COBYLA's own feasibility-then-objective
//     ordering, two front doors agree, a bad argument raises a named error.
// The only exact comparisons are on integers (iteration and evaluation
// counts), booleans, status strings, symbolic parameter names, and the
// handful of "these two code paths must agree bit for bit" tests, where
// identity is precisely the property under test.
//
// GENERATING PARAMETERS USED HERE
//   linear      y = 1.2 x + 0.5                       on x = 0 .. 9
//   exponential y = 2.5 exp(0.3 x)                    on x = 0 .. 5.5
//   Gaussian    y = 2 exp(-(x-1)^2 / (2 * 0.8^2))     on x = -2 .. 4
//   sine        y = 1.2 sin(0.5 x - 0.2)              on x = 0 .. 4 pi
// The sine problem is upstream Sage's own `find_fit` doctest shape; its
// `0.1 * normalvariate(0, 1)` perturbation is replaced by the deterministic
// sequence `0.1 * sin(17 i + 1)`, which has the same magnitude and makes
// the run reproducible without a seeded RNG.

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

// Every numeric constant below is forced through `float()`. A bare decimal
// literal in a Sage session is a `RealLiteral`, and `RealLiteral * <plain
// float>` raises "value has no mathematical parent" whenever the float
// holds an integral value -- so `1.2 * float(i)` blows up at i = 0.
// Symbolic expressions keep plain integer literals, which coerce cleanly.
const PRELUDE = [
  "import math",
  "from sagejs.optimization.levenberg_marquardt import leastsq",
  "from sagejs.optimization.cobyla import cobyla",
  "from sagejs.optimization.sage_api import find_fit",
  "from sagejs.optimization.sage_api import minimize_constrained",
  "from sagejs.optimization.sage_api import minimize",
  "var('a, b, c, x, y')",
  "",
  "_ZERO = float(0)",
  "_ONE = float(1)",
  "_TWO = float(2)",
  "_NAN = float('nan')",
  // COBYLA's default feasibility window; used below wherever a test has to
  // reason about the same tolerance the solver reasons about.
  "CATOL = float(2) / float(10000)",
  "",
  // The generating parameters, built from integer ratios so that "exact
  // data" really is exact in IEEE double arithmetic.
  "LINEAR_A = float(12) / float(10)",
  "LINEAR_B = float(1) / float(2)",
  "EXP_A = float(5) / float(2)",
  "EXP_B = float(3) / float(10)",
  "GAUSS_A = float(2)",
  "GAUSS_MU = float(1)",
  "GAUSS_SIGMA = float(4) / float(5)",
  "SINE_A = float(12) / float(10)",
  "SINE_B = float(1) / float(2)",
  "SINE_C = float(2) / float(10)",
  "",
  // A deterministic stand-in for upstream's `normalvariate(0, 1)`: bounded
  // by 1 in absolute value, sign-changing, and with no discernible
  // correlation to the sample abscissae.
  "def noise(index):",
  "    return math.sin(float(17 * index + 1))",
  "",
  "linear_model(x) = a*x + b",
  "exp_model(x) = a*exp(b*x)",
  "gauss_model(x) = a*exp(-(x - b)^2/(2*c^2))",
  "sine_model(x) = a*sin(b*x - c)",
  "",
  "linear_data = [[float(i), LINEAR_A*float(i) + LINEAR_B] for i in range(10)]",
  "",
  "exp_x = [float(i) / _TWO for i in range(12)]",
  "exp_data = [[t, EXP_A*math.exp(EXP_B*t)] for t in exp_x]",
  "",
  "gauss_x = [float(i) / float(4) - _TWO for i in range(25)]",
  "def gauss_true(t):",
  "    return GAUSS_A*math.exp(-(t - GAUSS_MU)**2/(_TWO*GAUSS_SIGMA**2))",
  "",
  "gauss_data = [[t, gauss_true(t)] for t in gauss_x]",
  "",
  // Noisy linear: 20 points on x = 0, 0.5, ..., 9.5 with |noise| <= 0.05.
  "NOISY_AMPLITUDE = float(5) / float(100)",
  "noisy_x = [float(i) / _TWO for i in range(20)]",
  "noisy_data = [",
  "    [",
  "        noisy_x[i],",
  "        LINEAR_A*noisy_x[i] + LINEAR_B + NOISY_AMPLITUDE*noise(i),",
  "    ]",
  "    for i in range(20)",
  "]",
  "",
  // Upstream's find_fit doctest shape: 63 points across [0, 4 pi) with
  // |noise| <= 0.1 against a signal amplitude of 1.2.
  "SINE_AMPLITUDE = float(1) / float(10)",
  "sine_x = [float(i) / float(5) for i in range(63)]",
  "sine_data = [",
  "    [",
  "        sine_x[i],",
  "        SINE_A*math.sin(SINE_B*sine_x[i] - SINE_C) + SINE_AMPLITUDE*noise(i),",
  "    ]",
  "    for i in range(63)",
  "]",
  "",
  // The residual sum of squares of a parameter set, evaluated by this test
  // file rather than read back out of the solver, so the number asserted on
  // is a property of the returned parameters and not of the search.
  "def rss(rows, predict):",
  "    total = _ZERO",
  "    for row in rows:",
  "        residual = predict(row[0]) - row[-1]",
  "        total = total + residual*residual",
  "    return total",
  "",
  // A COBYLA run reduced to plain finite numbers, so one `evaluate` round
  // trip carries everything a test wants to assert about it. The result
  // object itself is kept in `last` for the string- and boolean-valued
  // fields, which cannot travel inside a JSON list of numbers.
  "last = []",
  "def probe(result):",
  "    last.append(result)",
  "    return (",
  "        [float(value) for value in result.x]",
  "        + [float(result.fun), float(result.maxcv)]",
  "        + [result.iterations, result.function_calls]",
  "    )",
].join("\n");

// A Sage session reached through the evaluator, exactly like the other
// mathematical integration tests in this directory.
async function openSession() {
  const session = await createSage();
  await session.evaluate(PRELUDE);
  return session;
}

async function evalRepr(session, code) {
  return (await session.evaluate(code)).repr;
}

// Sage's own real literals print at 15 significant digits, which would hide
// exactly the low-order digits this suite is about, so every numeric probe
// is forced through `float()` and read back from Python's `repr`.
async function evalFloat(session, code) {
  return Number(await evalRepr(session, `float(${code})`));
}

// `code` must evaluate to a Python list of FINITE floats/ints; the repr of
// such a list is valid JSON. Infinities and NaNs are deliberately not
// accommodated: every test that has to reason about one asks Python for
// `math.isnan(...)` / `math.isfinite(...)` instead, so that the assertion
// says what it means rather than depending on how a non-finite float is
// rendered.
async function evalList(session, code) {
  return JSON.parse(await evalRepr(session, code));
}

async function evalBool(session, code) {
  return (await evalRepr(session, `bool(${code})`)) === "True";
}

// `code` must evaluate to a Python list of strings; Python's repr uses
// single quotes, which JSON does not accept, so it is normalised first.
// Every string produced this way below is a symbolic name, a status flag or
// a stringified boolean, none of which can contain a quote character.
async function evalStrings(session, code) {
  const repr = await evalRepr(session, code);
  return JSON.parse(repr.replace(/'/g, '"'));
}

// Run `code` expecting `exceptionName`; returns the exception message.
// A *different* exception propagates out of `session.evaluate` and fails
// the test loudly, which is the desired outcome: the exception type is part
// of the contract being asserted.
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
  // `repr` of a Python string; strip the surrounding quote characters.
  return repr.slice(1, -1);
}

// ---------------------------------------------------------------------------
// Curve fitting: recovering known parameters
// ---------------------------------------------------------------------------

test("find_fit recovers a linear model from exact data", async () => {
  const session = await openSession();
  try {
    const fit = await evalList(
      session,
      [
        "_fit = find_fit(linear_data, linear_model, solution_dict=True)",
        "[float(_fit[a]), float(_fit[b])]",
      ].join("\n"),
    );

    // The data lies on y = 1.2 x + 0.5 up to the rounding of the products,
    // so the least-squares problem has an exactly attainable optimum and
    // LM -- which solves a model linear in its parameters in a single
    // Gauss-Newton step -- reaches it well inside its own xtol = 1.49e-8
    // stopping tolerance. 1e-9 is a decade tighter than that stop and still
    // far above the 2e-16 relative noise of the data construction itself.
    assert.ok(
      Math.abs(fit[0] - 1.2) <= 1e-9,
      `slope ${fit[0]} is not within 1e-9 of the generating 1.2`,
    );
    assert.ok(
      Math.abs(fit[1] - 0.5) <= 1e-9,
      `intercept ${fit[1]} is not within 1e-9 of the generating 0.5`,
    );

    // The sharper statement, independent of the parametrisation: the
    // residual sum of squares. The data values run up to 11.3, where one
    // ulp is 1.8e-15; ten residuals of a few ulps each square up to at
    // most ~1e-28.
    const residual = await evalFloat(
      session,
      "rss(linear_data, lambda t: _fit[a]*t + _fit[b])",
    );
    assert.ok(residual <= 1e-28, `residual sum of squares ${residual}`);
  } finally {
    await session.close();
  }
});

test("find_fit recovers a*exp(b*x) from exact data", async () => {
  const session = await openSession();
  try {
    // The default initial guess is 1 for every parameter, so this starts at
    // a = b = 1 and has to travel to (2.5, 0.3) through a genuinely
    // nonlinear model -- the exponential is the classic case where a wrong
    // scale in the rate swamps the amplitude.
    const fit = await evalList(
      session,
      [
        "_fit = find_fit(exp_data, exp_model, solution_dict=True)",
        "[float(_fit[a]), float(_fit[b])]",
      ].join("\n"),
    );

    // As above the optimum is exactly attainable, so accuracy is set by
    // xtol = 1.49e-8. The tolerance is one decade looser than the linear
    // case because the model is nonlinear: the residual is only
    // quadratically flat around the optimum, which costs roughly half the
    // available significant digits in the argmin.
    assert.ok(
      Math.abs(fit[0] - 2.5) <= 1e-8,
      `amplitude ${fit[0]} is not within 1e-8 of the generating 2.5`,
    );
    assert.ok(
      Math.abs(fit[1] - 0.3) <= 1e-8,
      `rate ${fit[1]} is not within 1e-8 of the generating 0.3`,
    );

    // The data values reach 2.5 e^1.65 = 13.0, one ulp of which is 1.8e-15;
    // twelve residuals of a few ulps each square up well below 1e-26.
    const residual = await evalFloat(
      session,
      "rss(exp_data, lambda t: _fit[a]*math.exp(_fit[b]*t))",
    );
    assert.ok(residual <= 1e-26, `residual sum of squares ${residual}`);
  } finally {
    await session.close();
  }
});

test("find_fit recovers a Gaussian from exact data", async () => {
  const session = await openSession();
  try {
    // Three coupled parameters, one of them inside a squared exponential:
    // amplitude, centre and width trade off against each other, which is
    // what makes the Gaussian the interesting member of the trio.
    const fit = await evalList(
      session,
      [
        "_fit = find_fit(gauss_data, gauss_model, solution_dict=True)",
        "[float(_fit[a]), float(_fit[b]), float(_fit[c])]",
      ].join("\n"),
    );

    assert.ok(
      Math.abs(fit[0] - 2) <= 1e-8,
      `amplitude ${fit[0]} is not within 1e-8 of the generating 2`,
    );
    assert.ok(
      Math.abs(fit[1] - 1) <= 1e-8,
      `centre ${fit[1]} is not within 1e-8 of the generating 1`,
    );
    // The width enters only as c^2, so the model is invariant under
    // c -> -c and the solver may legitimately land on either branch.
    // Comparing |c| is the statement that is actually true of the model.
    assert.ok(
      Math.abs(Math.abs(fit[2]) - 0.8) <= 1e-8,
      `width ${fit[2]} is not within 1e-8 of the generating +-0.8`,
    );

    const residual = await evalFloat(
      session,
      [
        "rss(gauss_data,",
        "    lambda t: _fit[a]*math.exp(-(t - _fit[b])**2/(_TWO*_fit[c]**2)))",
      ].join("\n"),
    );
    assert.ok(residual <= 1e-26, `residual sum of squares ${residual}`);

    // An explicit starting estimate must reach the same optimum as the
    // default all-ones guess. The comparison is on the fitted values, not
    // on iteration counts: the two runs take different paths to get there.
    const fromGuess = await evalList(
      session,
      [
        "_g = find_fit(gauss_data, gauss_model,",
        "              initial_guess=[float(1), _ZERO, float(1)],",
        "              solution_dict=True)",
        "[float(_g[a]), float(_g[b]), abs(float(_g[c]))]",
      ].join("\n"),
    );
    assert.ok(Math.abs(fromGuess[0] - fit[0]) <= 1e-8, `${fromGuess[0]}`);
    assert.ok(Math.abs(fromGuess[1] - fit[1]) <= 1e-8, `${fromGuess[1]}`);
    assert.ok(
      Math.abs(fromGuess[2] - Math.abs(fit[2])) <= 1e-8,
      `${fromGuess[2]}`,
    );
  } finally {
    await session.close();
  }
});

test("an exact fit terminates on a residual that is identically zero", async () => {
  const session = await openSession();
  try {
    // Started AT the solution of a consistent linear system, so the very
    // first residual vector is the zero vector. Exact equality is the
    // correct assertion here: 0.0 is not a rounded quantity but the literal
    // content of that vector, and the point of the test is that MINPACK
    // certifies a perfect fit without needing to take a step at all.
    const exact = await evalList(
      session,
      [
        "_r = leastsq(",
        "    lambda p: [p[0]*t + p[1] - (_TWO*t + float(3))",
        "               for t in (_ZERO, _ONE, _TWO)],",
        "    [_TWO, float(3)],",
        ")",
        "[float(_r.x[0]), float(_r.x[1]), float(_r.cost),",
        " _r.iterations, _r.function_calls, _r.info]",
      ].join("\n"),
    );
    assert.equal(exact[2], 0, "the cost of an identically zero residual");
    assert.equal(exact[0], 2, "no step may be taken away from the solution");
    assert.equal(exact[1], 3);
    // MINPACK's info = 4 is the gtol stop: with a zero residual vector the
    // scaled gradient norm is zero, which is <= gtol for any gtol >= 0.
    assert.equal(exact[5], 4, "the perfect fit is certified through gtol");
    assert.equal(exact[3], 1, "one outer iteration");
    // One call for the residual at x0 plus one per column of the
    // finite-difference Jacobian; n = 2.
    assert.equal(exact[4], 3);
    assert.ok(await evalBool(session, "_r.converged"));

    // The same claim through `find_fit`, where the solver must travel to
    // the exact optimum instead of starting on it. The data reach 11.3 and
    // one ulp there is 1.8e-15, so ten residuals of a couple of ulps each
    // cannot sum past 1e-28: anything below that is a residual that is zero
    // to the precision the data was constructed in.
    await session.evaluate(
      "_fit = find_fit(linear_data, linear_model, solution_dict=True)",
    );
    const attained = await evalFloat(
      session,
      "rss(linear_data, lambda t: _fit[a]*t + _fit[b])",
    );
    assert.ok(attained <= 1e-28, `residual sum of squares ${attained}`);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Curve fitting: degenerate and malformed problems
// ---------------------------------------------------------------------------

test("fewer data points than parameters is rejected", async () => {
  const session = await openSession();
  try {
    // Three parameters, two rows: the linearised system is underdetermined
    // and MINPACK's `lmdif` requires m >= n. This must be reported rather
    // than silently returning one of the infinitely many exact fits.
    const message = await messageFromRaise(
      session,
      [
        "quadratic(x) = a*x^2 + b*x + c",
        "find_fit([[_ZERO, _ONE], [_ONE, _TWO]], quadratic)",
      ].join("\n"),
      "ValueError",
    );
    assert.ok(
      message.includes("m=2") && message.includes("n=3"),
      `the message should name both counts: ${message}`,
    );

    // The boundary case m == n is legitimate and must NOT raise: two points
    // determine a line exactly.
    const square = await evalList(
      session,
      [
        "_fit = find_fit([[_ZERO, _ONE], [_ONE, float(3)]],",
        "                linear_model, solution_dict=True)",
        "[float(_fit[a]), float(_fit[b])]",
      ].join("\n"),
    );
    // The interpolating line through (0, 1) and (1, 3) is y = 2x + 1; the
    // fit is exact, so xtol = 1.49e-8 governs and 1e-9 is a decade inside.
    assert.ok(Math.abs(square[0] - 2) <= 1e-9, `slope ${square[0]}`);
    assert.ok(Math.abs(square[1] - 1) <= 1e-9, `intercept ${square[1]}`);
  } finally {
    await session.close();
  }
});

test("a collinear design is carried by the damping instead of crashing", async () => {
  const session = await openSession();
  try {
    // `a*x + b*x` has a rank-1 Jacobian in two parameters: the normal
    // equations are singular and only the SUM a + b is identifiable. An
    // undamped Gauss-Newton step would divide by zero here; Levenberg-
    // Marquardt's damping and `lmpar`'s own rank-deficient fallback are
    // what must carry it. Nothing is asserted about the individual
    // parameters, because nothing true can be.
    const fit = await evalList(
      session,
      [
        "collinear(x) = a*x + b*x",
        "_data = [[float(i), float(3)*float(i)] for i in range(5)]",
        "_fit = find_fit(_data, collinear, solution_dict=True)",
        "[float(_fit[a]), float(_fit[b])]",
      ].join("\n"),
    );
    assert.ok(
      Number.isFinite(fit[0]) && Number.isFinite(fit[1]),
      `a rank-deficient design produced non-finite parameters ${fit}`,
    );

    // What IS identifiable is the sum, and the data was generated from
    // a + b = 3. The residual is exactly flat along the whole line
    // a + b = 3, so each coordinate separately is ill-conditioned while
    // their sum is pinned; 1e-7 leaves a decade above the solver's
    // xtol = 1.49e-8 for that flat direction.
    assert.ok(
      Math.abs(fit[0] + fit[1] - 3) <= 1e-7,
      `the identifiable combination a + b is ${fit[0] + fit[1]}, not 3`,
    );

    // And the residual really is zero: the data lies on the model.
    const residual = await evalFloat(
      session,
      "rss(_data, lambda t: (_fit[a] + _fit[b])*t)",
    );
    assert.ok(residual <= 1e-26, `residual sum of squares ${residual}`);

    // The same degeneracy straight through `leastsq`, to show that the
    // ValueError of the previous test belongs to the m < n check and not
    // to singularity: this is m = 5 > n = 2 with a singular Jacobian, and
    // it must return normally with a finite cost.
    const flags = await evalStrings(
      session,
      [
        "_ls = leastsq(lambda p: [(p[0] + p[1])*float(i) - float(3)*float(i)",
        "                         for i in range(5)], [_ZERO, _ZERO])",
        "[str(_ls.converged), str(math.isfinite(_ls.cost))]",
      ].join("\n"),
    );
    assert.deepEqual(flags, ["True", "True"]);
  } finally {
    await session.close();
  }
});

test("data containing NaN neither raises nor invents a fit", async () => {
  const session = await openSession();
  try {
    // One NaN observation poisons the residual vector, hence its norm,
    // hence every comparison MINPACK makes. The contract is that this
    // propagates instead of raising or looping: `enorm` returns NaN for a
    // NaN input, the scaled gradient norm never rises above zero, and
    // `lmdif` stops on its gtol test having taken no step. That is byte for
    // byte what `scipy.optimize.leastsq` does with the same input (checked
    // against SciPy 1.18: x unchanged, ier = 4), so it is inherited MINPACK
    // behaviour rather than a local decision.
    const withNaN = await evalList(
      session,
      [
        "_data = [[float(i), LINEAR_A*float(i) + LINEAR_B] for i in range(6)]",
        "_data[2][1] = _NAN",
        "_fit = find_fit(_data, linear_model,",
        "                initial_guess=[float(7), float(-3)],",
        "                solution_dict=True)",
        "[float(_fit[a]), float(_fit[b])]",
      ].join("\n"),
    );
    // Exact equality with the initial guess is the property under test: the
    // search must not have moved, because no step could be shown to be an
    // improvement. This is a structural claim about the search, not a
    // tolerance on a fitted number.
    assert.deepEqual(
      withNaN,
      [7, -3],
      "a NaN observation must leave the initial guess untouched",
    );

    // And it is reported honestly rather than dressed up: the cost of the
    // returned parameters is NaN, so no caller can mistake it for a fit.
    const contaminated = await evalStrings(
      session,
      [
        "_ls = leastsq(lambda p: [p[0]*float(i) + p[1] - _data[i][1]",
        "                        for i in range(6)], [float(7), float(-3)])",
        "[str(math.isnan(_ls.cost)), str(list(_ls.x) == [float(7), float(-3)])]",
      ].join("\n"),
    );
    assert.deepEqual(contaminated, ["True", "True"]);

    // A NaN in an INDEPENDENT column is the same story and equally must not
    // raise; here the default all-ones guess is what survives.
    const badAbscissa = await evalList(
      session,
      [
        "_bad = [[float(i), LINEAR_A*float(i) + LINEAR_B] for i in range(6)]",
        "_bad[3][0] = _NAN",
        "_f2 = find_fit(_bad, linear_model, solution_dict=True)",
        "[float(_f2[a]), float(_f2[b])]",
      ].join("\n"),
    );
    assert.deepEqual(badAbscissa, [1, 1]);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Curve fitting: the two front doors
// ---------------------------------------------------------------------------

test("solution_dict returns a mapping and the default returns equations", async () => {
  const session = await openSession();
  try {
    // The default shape: a list of symbolic equations, one per parameter,
    // in the order the parameters were deduced.
    const texts = await evalStrings(
      session,
      [
        "_eqs = find_fit(linear_data, linear_model)",
        "[str(eq) for eq in _eqs]",
      ].join("\n"),
    );
    assert.equal(texts.length, 2, "one equation per parameter");
    assert.ok(
      texts[0].startsWith("a == ") && texts[1].startsWith("b == "),
      `expected 'parameter == value' equations, got ${JSON.stringify(texts)}`,
    );
    // Each entry is a relation, not a bare expression: its only free
    // symbol is the parameter on its left.
    const symbols = await evalStrings(
      session,
      "[str(v) for eq in _eqs for v in eq.variables()]",
    );
    assert.deepEqual(symbols, ["a", "b"]);

    // The dict shape: the same correspondence keyed by the parameter.
    const keys = await evalStrings(
      session,
      [
        "_dict = find_fit(linear_data, linear_model, solution_dict=True)",
        "sorted(str(key) for key in _dict)",
      ].join("\n"),
    );
    assert.deepEqual(keys, ["a", "b"]);
    assert.ok(
      await evalBool(session, "isinstance(_dict, dict)"),
      "solution_dict=True must return a mapping",
    );

    // ... and it must carry the same numbers. The two shapes are two
    // presentations of one solve, not two solves, so the values are
    // compared through the equation text (rendered at 15 significant
    // digits, which is why this is a 1e-12 relative check and not a
    // bit-for-bit one).
    const dictValues = await evalList(
      session,
      "[float(_dict[key]) for key in _dict]",
    );
    const textValues = texts.map((line) => Number(line.split(" == ")[1]));
    assert.equal(dictValues.length, textValues.length);
    for (let index = 0; index < dictValues.length; index += 1) {
      const scale = Math.max(1, Math.abs(dictValues[index]));
      assert.ok(
        Math.abs(dictValues[index] - textValues[index]) <= 1e-12 * scale,
        `equation ${index} says ${textValues[index]}, the dict says ${dictValues[index]}`,
      );
    }
  } finally {
    await session.close();
  }
});

test("a symbolic model and a Python model give the same fit", async () => {
  const session = await openSession();
  try {
    // Same model written twice: once as a callable symbolic function, whose
    // variables and parameters `find_fit` deduces, and once as a plain
    // Python function of (variables..., parameters...) positionally, for
    // which both lists must be supplied.
    const both = await evalList(
      session,
      [
        "def python_model(t, amplitude, rate):",
        "    return amplitude*math.exp(rate*t)",
        "",
        "_sym = find_fit(exp_data, exp_model, solution_dict=True)",
        "_py = find_fit(exp_data, python_model, parameters=[a, b],",
        "               variables=[x], solution_dict=True)",
        "[float(_sym[a]), float(_sym[b]), float(_py[a]), float(_py[b])]",
      ].join("\n"),
    );

    // Bit for bit: the residual arithmetic is the same in both paths, so
    // any difference would mean the symbolic compilation changed the
    // objective, which is exactly what this test exists to rule out.
    assert.equal(both[2], both[0], "the amplitude must agree bit for bit");
    assert.equal(both[3], both[1], "the rate must agree bit for bit");
    assert.ok(Math.abs(both[0] - 2.5) <= 1e-8, `amplitude ${both[0]}`);
    assert.ok(Math.abs(both[1] - 0.3) <= 1e-8, `rate ${both[1]}`);

    // The Python path cannot deduce anything, so it must say so rather than
    // failing inside `len(None)` the way upstream Sage does.
    const noVariables = await messageFromRaise(
      session,
      "find_fit(exp_data, python_model, parameters=[a, b])",
      "ValueError",
    );
    assert.ok(
      noVariables.includes("variables"),
      `the message should name the missing list: ${noVariables}`,
    );
    const noParameters = await messageFromRaise(
      session,
      "find_fit(exp_data, python_model, variables=[x])",
      "ValueError",
    );
    assert.ok(
      noParameters.includes("parameters"),
      `the message should name the missing list: ${noParameters}`,
    );
  } finally {
    await session.close();
  }
});

test("noisy data still recovers the generating parameters", async () => {
  const session = await openSession();
  try {
    const fit = await evalList(
      session,
      [
        "_fit = find_fit(noisy_data, linear_model, solution_dict=True)",
        "[float(_fit[a]), float(_fit[b])]",
      ].join("\n"),
    );

    // A WORST-CASE bound, not a fitted one. For simple least squares,
    //   a_hat - a = sum_i (x_i - xbar) e_i / sum_i (x_i - xbar)^2,
    // so with |e_i| <= 0.05 on x_i = 0, 0.5, ..., 9.5 (xbar = 4.75,
    // sum |x - xbar| = 50, sum (x - xbar)^2 = 166.25):
    //   |a_hat - a| <= 0.05 * 50 / 166.25          = 0.0151,
    //   |b_hat - b| <= 0.05 + |a_hat - a| * 4.75   = 0.1215.
    // These hold for ANY noise sequence of that amplitude, so they cannot
    // have been tuned to the particular one used here -- which in fact
    // lands an order of magnitude inside both.
    assert.ok(
      Math.abs(fit[0] - 1.2) <= 0.0151,
      `slope ${fit[0]} is outside the worst-case least-squares bound`,
    );
    assert.ok(
      Math.abs(fit[1] - 0.5) <= 0.1215,
      `intercept ${fit[1]} is outside the worst-case least-squares bound`,
    );

    // The invariant that needs no tolerance at all: a least-squares fit
    // cannot explain the data worse than the parameters it was generated
    // from, because those are one particular candidate the solver was free
    // to return. If the optimizer stopped early, this is what catches it.
    const optimal = await evalBool(
      session,
      [
        "rss(noisy_data, lambda t: _fit[a]*t + _fit[b])",
        "<= rss(noisy_data, lambda t: LINEAR_A*t + LINEAR_B)",
      ].join("\n"),
    );
    assert.ok(
      optimal,
      "the fitted parameters must explain the data at least as well as " +
        "the parameters it was generated from",
    );

    // The same two claims on upstream Sage's own `find_fit` doctest shape:
    // a sin(b x - c) fitted from the all-ones default guess, with the
    // doctest's 0.1 perturbation. Upstream documents its answer as
    // [a == 1.21..., b == 0.49..., c == 0.19...] for its own random noise.
    const sine = await evalList(
      session,
      [
        "_s = find_fit(sine_data, sine_model, solution_dict=True)",
        "[float(_s[a]), float(_s[b]), float(_s[c])]",
      ].join("\n"),
    );
    // Three coupled parameters and a noise amplitude of 0.1 against a
    // signal amplitude of 1.2, i.e. 8% relative noise over 63 samples.
    // 0.05 absolute is a generous but honest statement of what that noise
    // level can buy, and is the same precision upstream's own "1.21..." /
    // "0.49..." / "0.19..." ellipses commit to.
    assert.ok(Math.abs(sine[0] - 1.2) <= 0.05, `amplitude ${sine[0]}`);
    assert.ok(Math.abs(sine[1] - 0.5) <= 0.05, `frequency ${sine[1]}`);
    assert.ok(Math.abs(sine[2] - 0.2) <= 0.05, `phase ${sine[2]}`);

    const sineOptimal = await evalBool(
      session,
      [
        "rss(sine_data, lambda t: _s[a]*math.sin(_s[b]*t - _s[c]))",
        "<= rss(sine_data, lambda t: SINE_A*math.sin(SINE_B*t - SINE_C))",
      ].join("\n"),
    );
    assert.ok(
      sineOptimal,
      "the nonlinear fit must beat the generating parameters on the data",
    );
  } finally {
    await session.close();
  }
});

test("find_fit rejects malformed data, guesses and declarations", async () => {
  const session = await openSession();
  try {
    // Empty container.
    const empty = await messageFromRaise(
      session,
      "find_fit([], linear_model)",
      "ValueError",
    );
    assert.ok(
      empty.includes("two dimensional"),
      `unexpected message for empty data: ${empty}`,
    );

    // Wrong arity per row: one variable means two columns.
    const wide = await messageFromRaise(
      session,
      "find_fit([[_ONE, _TWO, float(3)]], linear_model)",
      "ValueError",
    );
    assert.ok(
      wide.includes("2 entries") && wide.includes("3 entries"),
      `the message should name both widths: ${wide}`,
    );

    // Ragged rows are not a table at all.
    await messageFromRaise(
      session,
      "find_fit([[_ZERO, _ONE], [_ONE]], linear_model)",
      "TypeError",
    );

    // Non-numeric entries.
    const nonNumeric = await messageFromRaise(
      session,
      "find_fit([[_ZERO, 'q'], [_ONE, _TWO]], linear_model)",
      "ValueError",
    );
    assert.ok(
      nonNumeric.includes("float"),
      `unexpected message for a non-numeric entry: ${nonNumeric}`,
    );

    // An initial guess of the wrong length.
    const shortGuess = await messageFromRaise(
      session,
      "find_fit(linear_data, linear_model, initial_guess=[_ONE])",
      "ValueError",
    );
    assert.ok(
      shortGuess.includes("initial_guess"),
      `the message should name initial_guess: ${shortGuess}`,
    );

    // A guess that is not a sequence of numbers.
    const badGuess = await messageFromRaise(
      session,
      "find_fit(linear_data, linear_model, initial_guess=['q', 'r'])",
      "TypeError",
    );
    assert.ok(
      badGuess.includes("initial_guess"),
      `the message should name initial_guess: ${badGuess}`,
    );

    // A plain (non-callable) symbolic expression carries no argument tuple,
    // so every symbol in it reads as a variable and no parameters are left
    // over. Upstream dies later inside NumPy; here it is named up front.
    const noSplit = await messageFromRaise(
      session,
      "find_fit(linear_data, a*x + b)",
      "ValueError",
    );
    assert.ok(
      noSplit.includes("parameters"),
      `the message should name the missing list: ${noSplit}`,
    );

    // A declared argument that does not occur in the body: upstream raises
    // "list.remove(x): x not in list" out of its parameter deduction. Here
    // the subtraction is by name, so the fit simply proceeds over the one
    // parameter that remains, and the data is a three-column table because
    // the model declares two variables.
    const unused = await evalStrings(
      session,
      [
        "unused(x, y) = a*x",
        "_u = find_fit([[float(i), _ZERO, _TWO*float(i)]",
        "               for i in range(4)], unused)",
        "[str(eq) for eq in _u]",
      ].join("\n"),
    );
    assert.equal(unused.length, 1, `expected one equation, got ${unused}`);
    assert.ok(
      unused[0].startsWith("a == "),
      `expected an equation for a, got ${unused[0]}`,
    );
    // y == 2x over the first variable alone: the fitted slope is 2.
    const unusedValue = Number(unused[0].split(" == ")[1]);
    assert.ok(
      Math.abs(unusedValue - 2) <= 1e-9,
      `slope ${unusedValue} is not within 1e-9 of the generating 2`,
    );
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Constrained minimization
// ---------------------------------------------------------------------------

test("minimize_constrained solves the canonical quadratic", async () => {
  const session = await openSession();
  try {
    // min x0^2 + x1^2 subject to x0 + x1 >= 1. The optimum is the foot of
    // the perpendicular from the origin: (0.5, 0.5), f = 0.5.
    const point = await evalList(
      session,
      [
        "_f = lambda p: p[0]**2 + p[1]**2",
        "_c = lambda p: p[0] + p[1] - _ONE",
        "[float(v) for v in minimize_constrained(_f, [_c], [_ZERO, _ZERO])]",
      ].join("\n"),
    );

    // COBYLA stops when its trust radius reaches rhoend = 1e-4, and the
    // point it returns may sit up to catol = 2e-4 outside the feasible set;
    // both bound the distance to the true argmin at the same order. 1e-3 is
    // one decade above rhoend and is the accuracy this configuration
    // actually promises -- asserting more would be asserting noise.
    assert.ok(Math.abs(point[0] - 0.5) <= 1e-3, `x0 = ${point[0]}`);
    assert.ok(Math.abs(point[1] - 0.5) <= 1e-3, `x1 = ${point[1]}`);

    // The constraint is active at the optimum, so it must be tight to
    // within the feasibility tolerance the solver advertises.
    const slack = point[0] + point[1] - 1;
    assert.ok(
      Math.abs(slack) <= 2e-4,
      `the active constraint has slack ${slack}, outside catol = 2e-4`,
    );

    // The objective value, with its tolerance derived from that slack.
    // Writing the answer as (0.5 + d0, 0.5 + d1),
    //   f - 0.5 = (d0 + d1) + (d0^2 + d1^2) = slack + O(|d|^2).
    // f is stationary along the constraint but NOT across it, so the first
    // term is the one that matters: it is exactly the slack bounded above
    // by catol = 2e-4, and the quadratic remainder adds at most 2e-6 given
    // the 1e-3 argmin bound already asserted. Hence 3e-4. (Note that f
    // comes out slightly BELOW 0.5, because COBYLA is permitted to stop
    // just outside the feasible set -- an "impossibly good" value is the
    // expected shape of the error here, not a sign of a wrong answer.)
    const value = point[0] * point[0] + point[1] * point[1];
    assert.ok(
      Math.abs(value - 0.5) <= 3e-4,
      `f at the returned point is ${value}, not 0.5`,
    );
  } finally {
    await session.close();
  }
});

test("the solution sits on the boundary when the free minimum is outside", async () => {
  const session = await openSession();
  try {
    // min (x0 - 5)^2 + (x1 - 5)^2 over the box [-1, 1]^2. The unconstrained
    // minimum (5, 5) is far outside, so the answer is the nearest feasible
    // point: the corner (1, 1), where f = 32 and BOTH upper bounds are
    // active. A solver that merely stopped somewhere feasible would land in
    // the interior and be caught by the tightness assertions below.
    const run = await evalList(
      session,
      [
        "_f = lambda p: (p[0] - float(5))**2 + (p[1] - float(5))**2",
        "_box = [lambda p: p[0] + _ONE, lambda p: _ONE - p[0],",
        "        lambda p: p[1] + _ONE, lambda p: _ONE - p[1]]",
        "probe(cobyla(_f, [_ZERO, _ZERO], _box))",
      ].join("\n"),
    );
    const [x0, x1, fun, maxcv, , calls] = run;

    // Same rhoend = 1e-4 / catol = 2e-4 reasoning as the canonical case.
    assert.ok(Math.abs(x0 - 1) <= 1e-3, `x0 = ${x0}`);
    assert.ok(Math.abs(x1 - 1) <= 1e-3, `x1 = ${x1}`);
    // Unlike the canonical case f is NOT stationary here -- its gradient
    // points straight out of the corner with magnitude 8 sqrt(2) -- so an
    // error of 1e-3 in x costs up to 1.2e-2 in f.
    assert.ok(Math.abs(fun - 32) <= 2e-2, `f = ${fun}, not 32`);

    // The invariant that says "on the boundary": both upper bounds are
    // tight, i.e. their slack is zero to within the feasibility window.
    assert.ok(
      Math.abs(1 - x0) <= 2e-4,
      `the constraint x0 <= 1 has slack ${1 - x0}`,
    );
    assert.ok(
      Math.abs(1 - x1) <= 2e-4,
      `the constraint x1 <= 1 has slack ${1 - x1}`,
    );
    // ... and no constraint is violated by more than catol.
    assert.ok(maxcv <= 2e-4, `maximum constraint violation ${maxcv}`);
    assert.ok(await evalBool(session, "last[-1].converged"));
    assert.equal(await evalRepr(session, "last[-1].flag"), "'converged'");
    assert.ok(calls < 1000, `used ${calls} evaluations`);

    // Expressed as bound intervals instead of as constraint functions, the
    // same box must give the same answer to the same accuracy. This is the
    // bound-pair path of `minimize_constrained`, which turns each
    // (min, max) into the COBYLA pair x[i] - min >= 0, max - x[i] >= 0.
    const viaBounds = await evalList(
      session,
      [
        "[float(v) for v in minimize_constrained(",
        "    _f, [(-_ONE, _ONE), (-_ONE, _ONE)], [_ZERO, _ZERO])]",
      ].join("\n"),
    );
    assert.ok(Math.abs(viaBounds[0] - 1) <= 1e-3, `x0 = ${viaBounds[0]}`);
    assert.ok(Math.abs(viaBounds[1] - 1) <= 1e-3, `x1 = ${viaBounds[1]}`);

    // A one-sided interval, the shape upstream documents as "(None, None)
    // if there is no constraint for that variable".
    const oneSided = await evalFloat(
      session,
      [
        "minimize_constrained(lambda p: (p[0] - float(5))**2,",
        "                     [(None, _TWO)], [_ZERO])[0]",
      ].join("\n"),
    );
    // min (x - 5)^2 for x <= 2 is attained at the bound, x = 2.
    assert.ok(Math.abs(oneSided - 2) <= 1e-3, `x = ${oneSided}`);

    // A bound interval given the wrong way round is a caller mistake, not
    // an empty feasible region to be searched.
    const inverted = await messageFromRaise(
      session,
      "minimize_constrained(lambda p: p[0]**2, [(_ONE, -_ONE)], [_ZERO])",
      "ValueError",
    );
    assert.ok(
      inverted.includes("minimum") && inverted.includes("maximum"),
      `unexpected message: ${inverted}`,
    );

    // A list mixing intervals with constraint functions is ambiguous;
    // upstream reads the whole list as intervals off `cons[0]` alone and
    // fails later inside SciPy.
    const mixed = await messageFromRaise(
      session,
      [
        "minimize_constrained(lambda p: p[0]**2 + p[1]**2,",
        "                     [(-_ONE, _ONE), lambda p: p[1]], [_ZERO, _ZERO])",
      ].join("\n"),
      "TypeError",
    );
    assert.ok(mixed.includes("cons[1]"), `unexpected message: ${mixed}`);
  } finally {
    await session.close();
  }
});

test("an infeasible starting point still converges", async () => {
  const session = await openSession();
  try {
    // The origin violates x0 + x1 >= 5 by a full 5 units, so COBYLA has to
    // work towards feasibility and optimality together from outside the
    // feasible set -- the situation it was designed for and the one where
    // Powell's F77 code is documented to be able to return an infeasible
    // point. The answer is the perpendicular foot (2.5, 2.5), f = 12.5.
    const run = await evalList(
      session,
      [
        "_f = lambda p: p[0]**2 + p[1]**2",
        "_c = lambda p: p[0] + p[1] - float(5)",
        "probe(cobyla(_f, [_ZERO, _ZERO], [_c]))",
      ].join("\n"),
    );
    const [x0, x1, fun, maxcv, , calls] = run;

    // The starting point really is infeasible, by construction.
    assert.ok(
      await evalBool(session, "_c([_ZERO, _ZERO]) < _ZERO"),
      "the premise of this test is that x0 is infeasible",
    );

    // Same rhoend = 1e-4 / catol = 2e-4 reasoning as above. The argmin here
    // sits on the constraint and f is stationary along it, so the value is
    // again the sharper statement.
    assert.ok(Math.abs(x0 - 2.5) <= 1e-2, `x0 = ${x0}`);
    assert.ok(Math.abs(x1 - 2.5) <= 1e-2, `x1 = ${x1}`);
    assert.ok(Math.abs(fun - 12.5) <= 1e-2, `f = ${fun}, not 12.5`);
    assert.ok(
      maxcv <= 2e-4,
      `the run started infeasible and ended with violation ${maxcv}`,
    );
    assert.ok(await evalBool(session, "last[-1].converged"));
    assert.ok(calls < 1000, `used ${calls} evaluations`);

    // The constraint is active at the optimum: reaching feasibility is not
    // enough, the answer has to sit on the boundary.
    assert.ok(
      Math.abs(x0 + x1 - 5) <= 2e-4,
      `the active constraint has slack ${x0 + x1 - 5}`,
    );
  } finally {
    await session.close();
  }
});

test("unsatisfiable constraints terminate and report the violation", async () => {
  const session = await openSession();
  try {
    // x >= 1 and x <= -1 cannot both hold. The requirement is that the run
    // ENDS, says how badly it failed, and refuses to call that success.
    const run = await evalList(
      session,
      [
        "_c1 = lambda p: p[0] - _ONE",
        "_c2 = lambda p: -_ONE - p[0]",
        "probe(cobyla(lambda p: p[0]**2, [_ZERO], [_c1, _c2]))",
      ].join("\n"),
    );
    const [point, , maxcv, , calls] = run;

    assert.ok(Number.isFinite(point), `the returned point is ${point}`);
    // The two constraints are 2 apart, so the smallest maximum violation
    // any point can achieve is exactly 1, attained everywhere on [-1, 1].
    // Reporting less than that would be reporting a violation that does not
    // exist; reporting much more would mean the search never even got into
    // the middle.
    assert.ok(
      maxcv >= 1 - 1e-9,
      `the smallest possible maximum violation is 1, got ${maxcv}`,
    );
    assert.ok(
      maxcv <= 1 + 1e-3,
      `the best reachable violation is 1, got ${maxcv}`,
    );
    assert.equal(
      await evalRepr(session, "last[-1].flag"),
      "'converged:infeasible'",
    );
    assert.equal(
      await evalBool(session, "last[-1].converged"),
      false,
      "an infeasible answer may never be reported as converged",
    );
    // It terminated on its own, well inside the default budget of 1000: no
    // test in this file relies on a wall-clock timeout to pass.
    assert.ok(calls < 1000, `used ${calls} evaluations of 1000`);
  } finally {
    await session.close();
  }
});

test("no constraints reduces to unconstrained minimization", async () => {
  const session = await openSession();
  try {
    // An empty constraint list means "no constraints", not "cons[0] is
    // missing" -- upstream raises IndexError here.
    const constrained = await evalList(
      session,
      [
        "_f = lambda p: (p[0] - float(3))**2 + (p[1] + _ONE)**2",
        "_cobyla_point = minimize_constrained(_f, [], [_ZERO, _ZERO])",
        "[float(v) for v in _cobyla_point]",
      ].join("\n"),
    );
    // The unconstrained minimum is (3, -1). COBYLA's rhoend = 1e-4 pins the
    // argmin to about that; 1e-3 is a decade above it.
    assert.ok(Math.abs(constrained[0] - 3) <= 1e-3, `x0 = ${constrained[0]}`);
    assert.ok(Math.abs(constrained[1] + 1) <= 1e-3, `x1 = ${constrained[1]}`);

    // `minimize` on the very same objective runs Nelder-Mead, a completely
    // different method with a completely different stopping rule, so the
    // two may not be compared coordinate for coordinate beyond the weaker
    // of their two argmin tolerances (Nelder-Mead's xatol is also 1e-4).
    const simplex = await evalList(
      session,
      [
        "_simplex_point = minimize(_f, [_ZERO, _ZERO])",
        "[float(v) for v in _simplex_point]",
      ].join("\n"),
    );
    assert.ok(
      Math.abs(simplex[0] - constrained[0]) <= 1e-3,
      `COBYLA gave x0 = ${constrained[0]}, Nelder-Mead ${simplex[0]}`,
    );
    assert.ok(
      Math.abs(simplex[1] - constrained[1]) <= 1e-3,
      `COBYLA gave x1 = ${constrained[1]}, Nelder-Mead ${simplex[1]}`,
    );

    // What must really agree is the minimum VALUE, which is what both
    // methods were asked for. f is quadratic with unit curvature, so a
    // 1e-3 disagreement in x is worth only ~1e-6 in f.
    const gap = await evalFloat(
      session,
      [
        "abs(_f([float(v) for v in _cobyla_point])",
        "    - _f([float(v) for v in _simplex_point]))",
      ].join("\n"),
    );
    assert.ok(
      gap <= 1e-6,
      `the two methods disagree on the minimum value by ${gap}`,
    );
  } finally {
    await session.close();
  }
});

test("one-dimensional constrained problems work through both doors", async () => {
  const session = await openSession();
  try {
    // n = 1 through the multivariate machinery: the simplex is a segment,
    // the linear models are one-dimensional and the trust region is an
    // interval. The free minimum first. For n = 1, `probe` returns
    // [x, f, maxcv, iterations, function_calls].
    const free = await evalList(
      session,
      "probe(cobyla(lambda p: (p[0] - float(5) / _TWO)**2, [_ZERO], []))",
    );
    assert.ok(Math.abs(free[0] - 2.5) <= 1e-3, `x = ${free[0]}`);
    assert.ok(free[1] <= 1e-6, `f = ${free[1]}`);
    assert.equal(free[2], 0, "an unconstrained run cannot violate anything");

    // The same problem with the minimum cut off by a constraint: the answer
    // moves to the boundary x = 1, where f = 2.25.
    const bounded = await evalList(
      session,
      [
        "probe(cobyla(lambda p: (p[0] - float(5) / _TWO)**2, [_ZERO],",
        "             [lambda p: _ONE - p[0]]))",
      ].join("\n"),
    );
    assert.ok(Math.abs(bounded[0] - 1) <= 1e-3, `x = ${bounded[0]}`);
    // |f'(1)| = 3, so a 1e-3 error in x is worth 3e-3 in f.
    assert.ok(Math.abs(bounded[1] - 2.25) <= 5e-3, `f = ${bounded[1]}`);
    assert.ok(
      Math.abs(1 - bounded[0]) <= 2e-4,
      `the active constraint has slack ${1 - bounded[0]}`,
    );
    assert.ok(bounded[2] <= 2e-4, `violation ${bounded[2]}`);
    assert.ok(await evalBool(session, "last[-1].converged"));

    // A bare constraint function and a one-element list holding it are the
    // same request, and upstream accepts both; they must agree bit for bit.
    // The check lives on this cheap one-dimensional problem rather than on
    // the canonical two-dimensional one because it costs two extra solves.
    await session.evaluate(
      [
        "_g = lambda p: (p[0] - float(5) / _TWO)**2",
        "_gc = lambda p: _ONE - p[0]",
      ].join("\n"),
    );
    const bare = await evalBool(
      session,
      [
        "minimize_constrained(_g, _gc, [_ZERO])",
        "== minimize_constrained(_g, [_gc], [_ZERO])",
      ].join("\n"),
    );
    assert.ok(bare, "cons=f and cons=[f] must select the same computation");

    // And through the Sage front door, as a bound interval.
    const viaSage = await evalFloat(
      session,
      [
        "minimize_constrained(lambda p: (p[0] - float(5) / _TWO)**2,",
        "                     [(None, _ONE)], [_ZERO])[0]",
      ].join("\n"),
    );
    assert.ok(Math.abs(viaSage - 1) <= 1e-3, `x = ${viaSage}`);

    // A bound list whose length disagrees with x0 is a caller mistake.
    const mismatched = await messageFromRaise(
      session,
      [
        "minimize_constrained(lambda p: p[0]**2, [(None, _ONE), (None, _ONE)],",
        "                     [_ZERO])",
      ].join("\n"),
      "ValueError",
    );
    assert.ok(
      mismatched.includes("2") && mismatched.includes("1"),
      `the message should name both counts: ${mismatched}`,
    );
  } finally {
    await session.close();
  }
});

test("an unimplemented algorithm reports itself by name", async () => {
  const session = await openSession();
  try {
    // Upstream reaches L-BFGS-B and TNC through SciPy; neither exists here
    // yet, and neither may be silently replaced by COBYLA.
    for (const name of ["l-bfgs-b", "tnc"]) {
      const message = await messageFromRaise(
        session,
        [
          "minimize_constrained(lambda p: p[0]**2, [(-_ONE, _ONE)], [_ZERO],",
          `                     algorithm='${name}')`,
        ].join("\n"),
        "NotImplementedError",
      );
      assert.ok(
        message.includes(name),
        `the message should name the algorithm: ${message}`,
      );
    }

    // An algorithm nobody has ever implemented: upstream falls through to
    // an UnboundLocalError about its own local `min`; here it is named.
    const nonsense = await messageFromRaise(
      session,
      [
        "minimize_constrained(lambda p: p[0]**2, [(-_ONE, _ONE)], [_ZERO],",
        "                     algorithm='newton-conjugate-gradient')",
      ].join("\n"),
      "NotImplementedError",
    );
    assert.ok(
      nonsense.includes("newton-conjugate-gradient"),
      `the message should name the algorithm: ${nonsense}`,
    );

    // "default" and "cobyla" must select the same computation, exactly.
    await session.evaluate("_f = lambda p: (p[0] - float(5))**2");
    const sameAlgorithm = await evalBool(
      session,
      [
        "(minimize_constrained(_f, [(-_ONE, _ONE)], [_ZERO], algorithm='default')",
        " == minimize_constrained(_f, [(-_ONE, _ONE)], [_ZERO], algorithm='cobyla'))",
      ].join("\n"),
    );
    assert.ok(sameAlgorithm, "'default' and 'cobyla' must agree bit for bit");

    // An unknown keyword is a caller mistake, not something to forward.
    const badOption = await messageFromRaise(
      session,
      [
        "minimize_constrained(lambda p: p[0]**2, [(-_ONE, _ONE)], [_ZERO],",
        "                     tolerance=1e-6)",
      ].join("\n"),
      "TypeError",
    );
    assert.ok(
      badOption.includes("tolerance"),
      `the message should name the keyword: ${badOption}`,
    );

    // Neither is a constraint list of the wrong shape.
    const badCons = await messageFromRaise(
      session,
      "minimize_constrained(lambda p: p[0]**2, [42], [_ZERO])",
      "TypeError",
    );
    assert.ok(badCons.includes("cons"), `unexpected message: ${badCons}`);
  } finally {
    await session.close();
  }
});

test("NaN from the objective and from a constraint is never an improvement", async () => {
  const session = await openSession();
  try {
    // The boxed problem from the boundary test, with a region where the
    // objective is NaN. NaN must be treated as +infinity -- as bad as a
    // point can be -- so it can never win a comparison, and the answer must
    // be the same corner (1, 1) with f = 32 as without it.
    await session.evaluate(
      [
        "_f = lambda p: (p[0] - float(5))**2 + (p[1] - float(5))**2",
        "_box = [lambda p: p[0] + _ONE, lambda p: _ONE - p[0],",
        "        lambda p: p[1] + _ONE, lambda p: _ONE - p[1]]",
      ].join("\n"),
    );
    const poisoned = await evalList(
      session,
      [
        "_nan_f = lambda p: _NAN if p[0] > float(100) else _f(p)",
        "probe(cobyla(_nan_f, [_ZERO, _ZERO], _box))",
      ].join("\n"),
    );
    assert.ok(Math.abs(poisoned[0] - 1) <= 1e-3, `x0 = ${poisoned[0]}`);
    assert.ok(Math.abs(poisoned[1] - 1) <= 1e-3, `x1 = ${poisoned[1]}`);
    assert.ok(Math.abs(poisoned[2] - 32) <= 2e-2, `f = ${poisoned[2]}`);
    assert.ok(!Number.isNaN(poisoned[2]), "a NaN was reported as the minimum");

    // A CONSTRAINT that is NaN far away must equally not stop the search
    // from solving the problem in the region where it is defined.
    const localised = await evalList(
      session,
      [
        "_nan_c = lambda p: _NAN if p[0] > float(100) else _ONE - p[1]",
        "probe(cobyla(_f, [_ZERO, _ZERO], _box[:3] + [_nan_c]))",
      ].join("\n"),
    );
    assert.ok(Math.abs(localised[0] - 1) <= 1e-3, `x0 = ${localised[0]}`);
    assert.ok(Math.abs(localised[1] - 1) <= 1e-3, `x1 = ${localised[1]}`);
    assert.ok(localised[3] <= 2e-4, `violation ${localised[3]}`);

    // An objective that is NaN everywhere: there is no minimum to find, so
    // the requirements are that the run ends inside its budget, does not
    // crash, and does not claim to have found a finite value.
    const hopeless = await evalList(
      session,
      [
        "_r = cobyla(lambda p: _NAN, [_ZERO, _ZERO], [], maxfun=40)",
        "[_r.iterations, _r.function_calls]",
      ].join("\n"),
    );
    assert.ok(hopeless[1] <= 40, `used ${hopeless[1]} of 40 evaluations`);
    assert.ok(
      await evalBool(session, "not math.isfinite(_r.fun)"),
      "a NaN objective must not report a finite minimum",
    );
    assert.ok(
      await evalBool(session, "all(math.isfinite(v) for v in _r.x)"),
      "the returned point must still be a real point",
    );

    // A constraint that is NaN everywhere is read as maximally violated,
    // the only safe reading: an unknown constraint value may never be taken
    // for feasibility. So the run must end infeasible and say so.
    const blind = await evalList(
      session,
      [
        "_r2 = cobyla(lambda p: p[0]**2 + p[1]**2, [_ZERO, _ZERO],",
        "             [lambda p: _NAN], maxfun=40)",
        "[_r2.iterations, _r2.function_calls]",
      ].join("\n"),
    );
    assert.ok(blind[1] <= 40, `used ${blind[1]} of 40 evaluations`);
    assert.equal(
      await evalBool(session, "_r2.converged"),
      false,
      "a constraint that never evaluates may not be called satisfied",
    );
    assert.equal(await evalRepr(session, "_r2.flag"), "'converged:infeasible'");
  } finally {
    await session.close();
  }
});

test("COBYLA respects its budget and returns the best point it saw", async () => {
  const session = await openSession();
  try {
    // PRIMA's bug list for Powell's F77 COBYLA names two failure modes a
    // fresh implementation must not have: returning the LAST evaluated
    // point rather than the best one, and overrunning the evaluation
    // budget. Both are asserted here as postconditions, by recording every
    // point the objective is ever handed and re-deriving the answer under
    // COBYLA's own feasibility-then-objective ordering.
    await session.evaluate(
      [
        "seen = []",
        "",
        "def watch_constraint(p):",
        "    return _ONE - p[0] - p[1]",
        "",
        "def watched(p):",
        "    value = (p[0] - float(3))**2 + (p[1] - float(4))**2",
        "    violation = max(_ZERO, -watch_constraint(p))",
        "    seen.append([float(value), float(violation)])",
        "    return value",
        "",
        // `_is_better` from cobyla.py, restated: a point within catol of
        // feasible always beats one that is not; between two feasible
        // points lower f wins, between two infeasible ones lower violation.
        "def better(one, other):",
        "    one_ok = one[1] <= CATOL",
        "    other_ok = other[1] <= CATOL",
        "    if one_ok != other_ok:",
        "        return one_ok",
        "    return one[0] < other[0] if one_ok else one[1] < other[1]",
        "",
        "def best_seen():",
        "    best = seen[0]",
        "    for row in seen[1:]:",
        "        if better(row, best):",
        "            best = row",
        "    return best",
      ].join("\n"),
    );

    for (const budget of [1, 2, 3, 5, 12]) {
      const run = await evalList(
        session,
        [
          "seen.clear()",
          `_r = cobyla(watched, [_ZERO, _ZERO], [watch_constraint], maxfun=${budget})`,
          "_b = best_seen()",
          "[len(seen), _r.function_calls, float(_r.fun), float(_b[0]),",
          " float(_r.maxcv), float(_b[1])]",
        ].join("\n"),
      );
      const [recorded, calls, fun, bestFun, maxcv, bestViolation] = run;

      // Exact integers: the budget is a hard cap on every exit path, and
      // the reported count is the true count.
      assert.equal(
        calls,
        recorded,
        `reported ${calls} calls but the objective saw ${recorded}`,
      );
      assert.ok(
        calls <= budget,
        `maxfun=${budget} was overrun with ${calls} evaluations`,
      );
      // Exact equality: the returned value must be one the objective
      // actually produced -- specifically the best one under the ordering
      // above -- not a number the solver computed for itself.
      assert.equal(
        fun,
        bestFun,
        `maxfun=${budget}: returned f = ${fun} but the best seen was ${bestFun}`,
      );
      assert.equal(
        maxcv,
        bestViolation,
        `maxfun=${budget}: returned violation ${maxcv}, best seen ${bestViolation}`,
      );
    }

    // A far more hostile objective: a step function, which has no useful
    // linear model anywhere and on which trust-region methods historically
    // spin. The budget must still hold exactly.
    const discontinuous = await evalList(
      session,
      [
        "seen.clear()",
        "def step(p):",
        "    seen.append([_ZERO, _ZERO])",
        "    return _ZERO if p[0] < _ZERO else _ONE",
        "",
        "_s = cobyla(step, [_ONE, _ONE], [], maxfun=50)",
        "[len(seen), _s.function_calls]",
      ].join("\n"),
    );
    assert.equal(discontinuous[0], discontinuous[1]);
    assert.ok(
      discontinuous[1] <= 50,
      `a step objective used ${discontinuous[1]} of 50 evaluations`,
    );

    // Postcondition 2 from PRIMA's list, stated directly: start FEASIBLE
    // and the answer must still be feasible and no worse than the start.
    // x0 = (0, 0) satisfies 1 - x0 - x1 >= 0 with slack 1.
    const full = await evalList(
      session,
      [
        "seen.clear()",
        "_r = cobyla(watched, [_ZERO, _ZERO], [watch_constraint])",
        "_b = best_seen()",
        "[float(_r.fun), float(_r.maxcv), float(seen[0][0]),",
        " float(_b[0]), float(_b[1]), _r.function_calls,",
        " float(_r.x[0]), float(_r.x[1])]",
      ].join("\n"),
    );
    const [
      finalValue,
      finalViolation,
      startValue,
      bestValue,
      bestViolation,
      calls,
      point0,
      point1,
    ] = full;
    assert.ok(
      finalViolation <= 2e-4,
      `a feasible start ended with violation ${finalViolation}`,
    );
    assert.ok(
      finalValue <= startValue,
      `the objective got worse: started at ${startValue}, ended at ${finalValue}`,
    );
    assert.equal(finalValue, bestValue, "the best point seen must be returned");
    assert.equal(finalViolation, bestViolation);
    assert.ok(calls <= 1000, `used ${calls} evaluations of the default 1000`);
    assert.ok(
      await evalBool(session, "_r.converged or _r.maxcv > CATOL"),
      "converged may only be True at a point inside the feasibility window",
    );

    // The exact answer, for the record: the free minimum (3, 4) violates
    // x0 + x1 <= 1, so the optimum is the perpendicular foot (0, 1), where
    // f = 3^2 + 3^2 = 18.
    assert.ok(Math.abs(point0) <= 1e-3, `x0 = ${point0}`);
    assert.ok(Math.abs(point1 - 1) <= 1e-3, `x1 = ${point1}`);
    // |grad f| = 6 sqrt(2) at that corner, so 1e-3 in x is 9e-3 in f.
    assert.ok(Math.abs(finalValue - 18) <= 1e-2, `f = ${finalValue}`);
  } finally {
    await session.close();
  }
});

test("minimize_constrained reproduces its upstream Sage doctests", async () => {
  const session = await openSession();
  try {
    // Upstream doctest: maximize x + y - 50 subject to 50x + 24y <= 2400,
    // 30x + 33y <= 2100, x >= 45 and y >= 5, written as a minimization of
    // -x - y + 50. Documented answer: (45.0, 6.25...).
    const linearProgram = await evalList(
      session,
      [
        "_f = lambda p: -p[0] - p[1] + float(50)",
        "_c1 = lambda p: p[0] - float(45)",
        "_c2 = lambda p: p[1] - float(5)",
        "_c3 = lambda p: -float(50)*p[0] - float(24)*p[1] + float(2400)",
        "_c4 = lambda p: -float(30)*p[0] - float(33)*p[1] + float(2100)",
        "[float(v) for v in minimize_constrained(",
        "    _f, [_c1, _c2, _c3, _c4], [_TWO, float(3)])]",
      ].join("\n"),
    );
    // The vertex where x >= 45 and 50x + 24y <= 2400 meet is exactly
    // (45, 6.25). The doctest prints "45.0" and "6.25..." -- one exact and
    // one truncated -- so 1e-4 on each is what the doctest itself asserts.
    assert.ok(
      Math.abs(linearProgram[0] - 45) <= 1e-4,
      `x = ${linearProgram[0]}, doctest says 45.0`,
    );
    assert.ok(
      Math.abs(linearProgram[1] - 6.25) <= 1e-4,
      `y = ${linearProgram[1]}, doctest says 6.25...`,
    );

    // Upstream issue #32511: a symbolic `func` must be minimized over its
    // ARGUMENTS in declaration order, not over its variables in
    // alphabetical order. f(y, x) = x - y with x >= 0 and y <= 1 has its
    // minimum at y = 1, x = 0, printed as (1.0, 0.0) with "abs tol 1e-04";
    // read alphabetically the answer would come back the other way round.
    const issue32511 = await evalList(
      session,
      [
        "g(y, x) = x - y",
        "d1(y, x) = x",
        "d2(y, x) = 1 - y",
        "[float(v) for v in minimize_constrained(g, [d1, d2], (_ZERO, _ZERO))]",
      ].join("\n"),
    );
    // The doctest's own stated tolerance.
    assert.ok(
      Math.abs(issue32511[0] - 1) <= 1e-4,
      `first coordinate ${issue32511[0]}, doctest says 1.0`,
    );
    assert.ok(
      Math.abs(issue32511[1]) <= 1e-4,
      `second coordinate ${issue32511[1]}, doctest says 0.0`,
    );

    // Upstream issue #6592: a symbolic constraint given bare, and the same
    // one given in a list, must both be accepted. The objective there is
    // unbounded below on the feasible set, which is why upstream marks the
    // expected output "# random"; the assertable content is that both forms
    // are accepted and that what comes back is feasible -- which is a real
    // claim, because the starting point (100, 300) violates x + y >= 479 by
    // 79. The budget is capped at 12 because an unbounded objective
    // otherwise just spends the whole default 1000 running off to infinity.
    const feasible = await evalList(
      session,
      [
        "p(x, y) = (100 - x) + (1000 - y)",
        "q(x, y) = x + y - 479",
        "_bare = minimize_constrained(p, q, [float(100), float(300)], maxfun=12)",
        "_listed = minimize_constrained(p, [q], [float(100), float(300)],",
        "                               maxfun=12)",
        "[float(_bare[0]) + float(_bare[1]) - float(479),",
        " float(_listed[0]) + float(_listed[1]) - float(479)]",
      ].join("\n"),
    );
    assert.ok(
      feasible[0] >= -2e-4,
      `the bare-constraint form violates x + y >= 479 by ${-feasible[0]}`,
    );
    assert.ok(
      feasible[1] >= -2e-4,
      `the list form violates x + y >= 479 by ${-feasible[1]}`,
    );

    // Upstream doctest: minimize sin(x*y) with y confined to [4, 10]. The
    // documented answer (4.8..., 4.8...) comes out of SciPy's TNC, a
    // different algorithm landing on a different one of this function's
    // infinitely many local minima. What every one of them has in common is
    // the VALUE, sin = -1, and respect for the bound; those are asserted,
    // and the coordinates deliberately are not.
    const sine = await evalList(
      session,
      [
        "s(x, y) = sin(x*y)",
        "_m = minimize_constrained(s, [(None, None), (float(4), float(10))],",
        "                          [float(5), float(5)])",
        "[float(_m[0]), float(_m[1]),",
        " float(math.sin(float(_m[0])*float(_m[1])))]",
      ].join("\n"),
    );
    assert.ok(
      Math.abs(sine[2] + 1) <= 1e-6,
      `sin(x*y) = ${sine[2]} at the returned point, not the global -1`,
    );
    assert.ok(
      sine[1] >= 4 - 2e-4 && sine[1] <= 10 + 2e-4,
      `y = ${sine[1]} is outside its declared bound [4, 10]`,
    );
  } finally {
    await session.close();
  }
});
