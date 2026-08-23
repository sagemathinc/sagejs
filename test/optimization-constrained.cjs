// sagejs-test-tier: integration
"use strict";

// Contract suite for wiring `sagejs.optimization.lbfgsb.fmin_l_bfgs_b` and
// `sagejs.optimization.tnc.fmin_tnc` into the Sage-facing
// `sagejs.optimization.sage_api.minimize_constrained` front door, alongside
// the pre-existing COBYLA path (`sagejs.optimization.cobyla.cobyla`).
//
// ROUTING TABLE (matching upstream `sage.numerical.optimize.minimize_constrained`
// exactly -- see that function's `if isinstance(cons, list): ...` block):
//   * `cons` a list of `(min, max)` bound intervals (or `None` entries), or
//     an empty list:
//       - algorithm == "l-bfgs-b"          -> fmin_l_bfgs_b
//       - algorithm in ("default", "tnc")  -> fmin_tnc
//       - algorithm == "cobyla"            -> TypeError. Upstream tests
//         `algorithm` exactly once on this branch ("l-bfgs-b" or else), so
//         "cobyla" silently runs TNC there. Sage.js rejects it instead --
//         see sagemath/sage#42711.
//   * `cons` one or more `g(x) >= 0` constraint functions:
//       - algorithm in ("default", "cobyla") -> cobyla, regardless of which
//         of the two was asked for, matching upstream's own
//         `optimize.fmin_cobyla(f, x0, cons, **args)` call, which never
//         consults `algorithm` at all
//       - algorithm in ("l-bfgs-b", "tnc")    -> TypeError. These are
//         box-only solvers and cannot represent a general inequality.
//         Upstream silently runs COBYLA and discards the requested
//         algorithm; Sage.js rejects it -- see sagemath/sage#42711.
//   * any other `algorithm` string -> NotImplementedError
//
// TOLERANCE POLICY, following the sibling suites in this directory:
//   * A doctest-reproduction assertion uses the tolerance the doctest
//     itself states ("abs tol 1e-04", or the number of significant digits
//     printed), except where the objective is genuinely multimodal
//     (`sin(x*y)`), where only the value and the declared bound are
//     asserted -- a different but equally valid local minimum is not a bug.
//   * An "active set" assertion is an exact-or-near-exact equality against
//     the box boundary itself (1e-6), because both L-BFGS-B and TNC either
//     land a pinned coordinate exactly on its bound or drive the
//     projected-gradient/first-order test to machine precision there.
//   * Everything else follows the general shape of the other optimization
//     suites: a stated tolerance tied to the solver's own stopping rule.

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const PRELUDE = [
  "import math",
  "from sagejs.optimization import (",
  "    LBFGSBResult,",
  "    TNCResult,",
  "    RCSTRINGS,",
  "    fmin_l_bfgs_b,",
  "    fmin_tnc,",
  ")",
  "from sagejs.optimization.sage_api import minimize_constrained",
  "",
  "_ZERO = float(0)",
  "_ONE = float(1)",
  "_TWO = float(2)",
  "",
  // scipy's own `rosen`/`rosen_der`, transliterated off NumPy's vectorized
  // slicing (which this package does not have) into a plain loop -- the
  // same transliteration `test/optimization-gradient.cjs` uses, reused here
  // for Sage's L-BFGS-B doctest, which exercises it under bound constraints.
  "def rosen(v):",
  "    total = _ZERO",
  "    for i in range(len(v) - 1):",
  "        total += float(100) * (v[i + 1] - v[i] ** 2) ** 2 + (_ONE - v[i]) ** 2",
  "    return total",
  "def rosen_der(v):",
  "    n = len(v)",
  "    der = [_ZERO] * n",
  "    for i in range(1, n - 1):",
  "        der[i] = (",
  "            float(200) * (v[i] - v[i - 1] ** 2)",
  "            - float(400) * (v[i + 1] - v[i] ** 2) * v[i]",
  "            - _TWO * (_ONE - v[i])",
  "        )",
  "    der[0] = float(-400) * v[0] * (v[1] - v[0] ** 2) - _TWO * (_ONE - v[0])",
  "    der[-1] = float(200) * (v[-1] - v[-2] ** 2)",
  "    return der",
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

async function evalList(session, code) {
  return JSON.parse(await evalRepr(session, code));
}

async function evalBool(session, code) {
  return (await evalRepr(session, `bool(${code})`)) === "True";
}

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

// ---------------------------------------------------------------------------
// Sage's own doctest examples (sage.numerical.optimize.minimize_constrained)
// ---------------------------------------------------------------------------

test("the sin(x*y)/[4,10] doctest: default (TNC) and l-bfgs-b both land on a valid minimum", async () => {
  const session = await openSession();
  try {
    // Upstream:
    //   sage: minimize_constrained(f, [(None,None),(4,10)],[5,5])
    //   (4.8..., 4.8...)
    //   sage: minimize_constrained(f, [(None,None),(4,10)],[5,5],
    //   ....:                      algorithm='l-bfgs-b')
    //   (4.7..., 4.9...)
    // sin(x*y) has infinitely many equally-valid local minima (every point
    // with x*y = -pi/2 + 2*k*pi and y inside the bound), so a different
    // implementation legitimately lands on a different one; the doctest's
    // own numbers are not asserted, only the two things that must be true
    // of ANY correct answer: the value reaches the global minimum -1, and
    // the bound on y is respected.
    const viaDefault = await evalList(
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
      Math.abs(viaDefault[2] + 1) <= 1e-6,
      `sin(x*y) = ${viaDefault[2]}, not the global minimum -1`,
    );
    assert.ok(
      viaDefault[1] >= 4 - 1e-6 && viaDefault[1] <= 10 + 1e-6,
      `y = ${viaDefault[1]} is outside its declared bound [4, 10]`,
    );
    // "default" resolves to TNC for bound-interval constraints, so it must
    // agree with an explicit `algorithm='tnc'` bit for bit.
    await session.evaluate("s3(x, y) = sin(x*y)");
    const matchesExplicitTnc = await evalBool(
      session,
      [
        "(minimize_constrained(s3, [(None, None), (float(4), float(10))],",
        "                      [float(5), float(5)])",
        " == minimize_constrained(s3, [(None, None), (float(4), float(10))],",
        "                         [float(5), float(5)], algorithm='tnc'))",
      ].join("\n"),
    );
    assert.ok(matchesExplicitTnc, "'default' must resolve to 'tnc' exactly");

    const viaLbfgsb = await evalList(
      session,
      [
        "s2(x, y) = sin(x*y)",
        "_m2 = minimize_constrained(s2, [(None, None), (float(4), float(10))],",
        "                           [float(5), float(5)], algorithm='l-bfgs-b')",
        "[float(_m2[0]), float(_m2[1]),",
        " float(math.sin(float(_m2[0])*float(_m2[1])))]",
      ].join("\n"),
    );
    assert.ok(
      Math.abs(viaLbfgsb[2] + 1) <= 1e-6,
      `sin(x*y) = ${viaLbfgsb[2]}, not the global minimum -1`,
    );
    assert.ok(
      viaLbfgsb[1] >= 4 - 1e-6 && viaLbfgsb[1] <= 10 + 1e-6,
      `y = ${viaLbfgsb[1]} is outside its declared bound [4, 10]`,
    );
  } finally {
    await session.close();
  }
});

test("the Rosenbrock doctest: l-bfgs-b reaches the documented corner exactly, with and without a gradient", async () => {
  const session = await openSession();
  try {
    // Upstream:
    //   sage: minimize_constrained(rosen, [(-50,-10),(5,10)],[1,1],
    //   ....:                      gradient=rosen_der, algorithm='l-bfgs-b')
    //   (-10.0, 10.0)
    //   sage: minimize_constrained(rosen, [(-50,-10),(5,10)],[1,1],
    //   ....:                      algorithm='l-bfgs-b')
    //   (-10.0, 10.0)
    // The unconstrained Rosenbrock minimum (1, 1) is infeasible; x0 = [1, 1]
    // projects into the box at [-10, 5], and the true constrained answer is
    // the opposite corner (-10, 10), where BOTH bounds are active -- upper
    // for x (its interval is (-50, -10)) and upper for y (its interval is
    // (5, 10)). The doctest prints exact floats, so an exact comparison is
    // the doctest's own stated precision, not an artificially tight one.
    const withGradient = await evalList(
      session,
      [
        "[float(v) for v in minimize_constrained(",
        "    rosen, [(float(-50), float(-10)), (float(5), float(10))],",
        "    [_ONE, _ONE], gradient=rosen_der, algorithm='l-bfgs-b')]",
      ].join("\n"),
    );
    assert.equal(withGradient[0], -10, `x = ${withGradient[0]}, doctest says -10.0`);
    assert.equal(withGradient[1], 10, `y = ${withGradient[1]}, doctest says 10.0`);

    const withoutGradient = await evalList(
      session,
      [
        "[float(v) for v in minimize_constrained(",
        "    rosen, [(float(-50), float(-10)), (float(5), float(10))],",
        "    [_ONE, _ONE], algorithm='l-bfgs-b')]",
      ].join("\n"),
    );
    assert.ok(
      Math.abs(withoutGradient[0] + 10) <= 1e-4,
      `x = ${withoutGradient[0]}, doctest says -10.0`,
    );
    assert.ok(
      Math.abs(withoutGradient[1] - 10) <= 1e-4,
      `y = ${withoutGradient[1]}, doctest says 10.0`,
    );

    // The same problem through TNC (upstream's *default* for bound
    // constraints) must reach the same corner, since it is the only
    // feasible descent direction from the projected starting point.
    const viaTnc = await evalList(
      session,
      [
        "[float(v) for v in minimize_constrained(",
        "    rosen, [(float(-50), float(-10)), (float(5), float(10))],",
        "    [_ONE, _ONE], gradient=rosen_der, algorithm='tnc')]",
      ].join("\n"),
    );
    assert.equal(viaTnc[0], -10, `x = ${viaTnc[0]} via tnc`);
    assert.equal(viaTnc[1], 10, `y = ${viaTnc[1]} via tnc`);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Both `cons` shapes, through every algorithm that accepts them
// ---------------------------------------------------------------------------

test("bound-interval cons: default, l-bfgs-b and tnc agree; cobyla is rejected", async () => {
  const session = await openSession();
  try {
    // An interior unconstrained optimum (3 is inside [0, 5]), so every
    // solver that accepts this shape should reach the same point.
    await session.evaluate("_f = lambda p: (p[0] - float(3))**2");
    for (const algorithm of ["default", "l-bfgs-b", "tnc"]) {
      const x = await evalFloat(
        session,
        `minimize_constrained(_f, [(_ZERO, float(5))], [_ZERO], algorithm='${algorithm}')[0]`,
      );
      assert.ok(Math.abs(x - 3) <= 1e-4, `algorithm=${algorithm}: x = ${x}`);
    }

    // Upstream's bound branch is a single two-way test on `algorithm`, so
    // "cobyla" silently runs TNC there. Sage.js names the mismatch instead.
    const cobylaRejected = await messageFromRaise(
      session,
      "minimize_constrained(_f, [(_ZERO, float(5))], [_ZERO], algorithm='cobyla')",
      "TypeError",
    );
    assert.ok(
      cobylaRejected.includes("cobyla") && cobylaRejected.includes("bound"),
      `unexpected message: ${cobylaRejected}`,
    );

    // An empty `cons` list means "no constraints at all" and is accepted by
    // every algorithm, including the two box-only solvers -- it must not be
    // mistaken for "constraint functions" and rejected as a shape mismatch.
    for (const algorithm of ["l-bfgs-b", "tnc"]) {
      const x = await evalFloat(
        session,
        `minimize_constrained(_f, [], [_ZERO], algorithm='${algorithm}')[0]`,
      );
      assert.ok(Math.abs(x - 3) <= 1e-4, `algorithm=${algorithm}, cons=[]: x = ${x}`);
    }
  } finally {
    await session.close();
  }
});

test("constraint-function cons: default and cobyla agree; l-bfgs-b and tnc are rejected", async () => {
  const session = await openSession();
  try {
    // min x^2 subject to x >= 1: the constraint is active, x = 1.
    await session.evaluate([
      "_g = lambda p: p[0]**2",
      "_gc = lambda p: p[0] - _ONE",
    ].join("\n"));
    const viaDefault = await evalFloat(
      session,
      "minimize_constrained(_g, [_gc], [_ZERO])[0]",
    );
    const viaCobyla = await evalFloat(
      session,
      "minimize_constrained(_g, [_gc], [_ZERO], algorithm='cobyla')[0]",
    );
    assert.ok(Math.abs(viaDefault - 1) <= 1e-3, `default: x = ${viaDefault}`);
    assert.ok(Math.abs(viaCobyla - 1) <= 1e-3, `cobyla: x = ${viaCobyla}`);
    const bitForBit = await evalBool(
      session,
      "(minimize_constrained(_g, [_gc], [_ZERO])" +
        " == minimize_constrained(_g, [_gc], [_ZERO], algorithm='cobyla'))",
    );
    assert.ok(bitForBit, "'default' and 'cobyla' must agree bit for bit");

    // Upstream's constraint-function branch calls `fmin_cobyla` without
    // ever consulting `algorithm`, so naming a box-only solver there runs
    // COBYLA anyway and discards the request without a word. Sage.js names
    // the mismatch instead -- sagemath/sage#42711.
    for (const algorithm of ["l-bfgs-b", "tnc"]) {
      const message = await messageFromRaise(
        session,
        `minimize_constrained(_g, [_gc], [_ZERO], algorithm='${algorithm}')`,
        "TypeError",
      );
      assert.ok(
        message.includes(algorithm) &&
          (message.includes("g(x)") || message.includes("box")),
        `unexpected message for algorithm=${algorithm}: ${message}`,
      );
    }

    // The same rejection applies to a bare (non-list) constraint function.
    const bareRejected = await messageFromRaise(
      session,
      "minimize_constrained(_g, _gc, [_ZERO], algorithm='tnc')",
      "TypeError",
    );
    assert.ok(bareRejected.includes("tnc"), `unexpected message: ${bareRejected}`);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// A bounded problem whose free optimum is infeasible: several pinned
// variables, one of them a one-sided bound, starting from outside the box.
// ---------------------------------------------------------------------------

test("several variables pin to their bounds; the active set is exact", async () => {
  const session = await openSession();
  try {
    // min sum((x_i - target_i)^2) with:
    //   x0 in [0, 5],    target 20  -> pinned at the UPPER bound, 5
    //   x1 in [-5, 0],   target -20 -> pinned at the LOWER bound, -5
    //   x2 in [-10, 10], target 2   -> interior, free: 2
    //   x3 in [10, +inf) (one-sided), target 3 -> pinned at the LOWER bound, 10
    // The starting point [100, 100, 100, 100] is outside every one of these
    // intervals, so this also covers "start outside the box".
    await session.evaluate([
      "def f4(p):",
      "    return ((p[0] - float(20))**2 + (p[1] + float(20))**2",
      "            + (p[2] - _TWO)**2 + (p[3] - float(3))**2)",
      "def g4(p):",
      "    return [",
      "        _TWO*(p[0] - float(20)), _TWO*(p[1] + float(20)),",
      "        _TWO*(p[2] - _TWO), _TWO*(p[3] - float(3)),",
      "    ]",
      "bounds4 = [",
      "    (_ZERO, float(5)), (float(-5), _ZERO),",
      "    (float(-10), float(10)), (float(10), None),",
      "]",
      "start4 = [float(100)] * 4",
    ].join("\n"));

    for (const [algorithm, withGradient] of [
      ["l-bfgs-b", true],
      ["l-bfgs-b", false],
      ["tnc", true],
      ["tnc", false],
    ]) {
      const gradArg = withGradient ? ", gradient=g4" : "";
      const point = await evalList(
        session,
        `[float(v) for v in minimize_constrained(f4, bounds4, start4${gradArg}, algorithm='${algorithm}')]`,
      );
      const label = `algorithm=${algorithm}, gradient=${withGradient}`;
      assert.ok(Math.abs(point[0] - 5) <= 1e-4, `${label}: x0 = ${point[0]}, expected pinned at 5`);
      assert.ok(Math.abs(point[1] + 5) <= 1e-4, `${label}: x1 = ${point[1]}, expected pinned at -5`);
      assert.ok(Math.abs(point[2] - 2) <= 1e-3, `${label}: x2 = ${point[2]}, expected free at 2`);
      assert.ok(Math.abs(point[3] - 10) <= 1e-4, `${label}: x3 = ${point[3]}, expected pinned at 10`);
    }
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("a degenerate box (low == high) pins that coordinate at its fixed value", async () => {
  const session = await openSession();
  try {
    await session.evaluate(
      "_f5 = lambda p: (p[0] - float(3))**2 + (p[1] + _TWO)**2",
    );
    for (const algorithm of ["l-bfgs-b", "tnc"]) {
      const point = await evalList(
        session,
        `[float(v) for v in minimize_constrained(` +
          `_f5, [(_TWO, _TWO), (None, None)], [_ZERO, _ZERO], algorithm='${algorithm}')]`,
      );
      assert.equal(point[0], 2, `algorithm=${algorithm}: x0 must stay fixed at 2`);
      assert.ok(
        Math.abs(point[1] + 2) <= 1e-4,
        `algorithm=${algorithm}: x1 = ${point[1]}, expected -2`,
      );
    }
  } finally {
    await session.close();
  }
});

test("an unknown algorithm name is rejected before anything is solved", async () => {
  const session = await openSession();
  try {
    const message = await messageFromRaise(
      session,
      "minimize_constrained(lambda p: p[0]**2, [(_ZERO, _ONE)], [_ZERO]," +
        " algorithm='trust-constr')",
      "NotImplementedError",
    );
    assert.ok(message.includes("trust-constr"), `unexpected message: ${message}`);
  } finally {
    await session.close();
  }
});

test("maxfun exhaustion is reported through the raw fmin_l_bfgs_b/fmin_tnc results", async () => {
  const session = await openSession();
  try {
    // `minimize_constrained` returns only the point, matching upstream, so
    // the exhaustion itself is asserted through the underlying exported
    // functions (also exercising that `optimization/__init__.py` exports
    // them) with a budget too small to ever converge.
    await session.evaluate(
      [
        "_r = fmin_l_bfgs_b(lambda p: (p[0] - float(3))**2, [_ZERO],",
        "                   bounds=[(_ZERO, float(5))], maxfun=1)",
      ].join("\n"),
    );
    assert.equal(
      await evalBool(session, "_r.converged"),
      false,
      "fmin_l_bfgs_b must not report convergence",
    );
    assert.equal(
      await evalFloat(session, "_r.status"),
      1,
      "fmin_l_bfgs_b status 1 is the limit-reached code",
    );
    assert.equal(
      await evalRepr(session, "_r.flag"),
      "'MAXFUN'",
      "fmin_l_bfgs_b should report the MAXFUN flag with a budget of 1",
    );

    await session.evaluate(
      [
        "_r2 = fmin_tnc(lambda p: (p[0] - float(3))**2, [_ZERO],",
        "               bounds=[(_ZERO, float(5))], maxfun=1)",
      ].join("\n"),
    );
    assert.equal(
      await evalBool(session, "_r2.converged"),
      false,
      "fmin_tnc must not report convergence",
    );
    assert.equal(
      await evalRepr(session, "RCSTRINGS[_r2.status]"),
      await evalRepr(session, "RCSTRINGS[3]"),
      "fmin_tnc's status should be the MAXFUN code (3)",
    );
    assert.equal(
      await evalFloat(session, "_r2.status"),
      3,
      "fmin_tnc status 3 is MAXFUN",
    );
  } finally {
    await session.close();
  }
});

test("a bound interval list with the wrong length is a caller mistake, not a solver failure", async () => {
  const session = await openSession();
  try {
    for (const algorithm of ["l-bfgs-b", "tnc"]) {
      const message = await messageFromRaise(
        session,
        "minimize_constrained(lambda p: p[0]**2, [(None, _ONE), (None, _ONE)]," +
          ` [_ZERO], algorithm='${algorithm}')`,
        "ValueError",
      );
      assert.ok(
        message.includes("2") && message.includes("1"),
        `algorithm=${algorithm}: the message should name both counts: ${message}`,
      );
    }
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Upstream defects this package deliberately does not reproduce.
//
// `sage.numerical.optimize.minimize_constrained` dispatches on `cons[0]`'s
// type rather than on `cons`'s shape, which leaves two inputs raising from
// library internals instead of being handled. Both are reported upstream as
// sagemath/sage#42711 and both are pinned here, so that if Sage.js ever
// regresses into upstream's behaviour a test says so.

test("an empty cons means no constraints, where upstream raises IndexError", async () => {
  const session = await openSession();
  try {
    // Upstream reaches `cons[0]` before testing whether `cons` is empty, so
    // `cons=[]` -- the natural spelling of "no constraints", and what code
    // that builds `cons` programmatically produces in the unconstrained
    // case -- dies with `IndexError: list index out of range`.
    await session.evaluate("_h = lambda p: (p[0] - float(3))**2");
    for (const algorithm of ["default", "l-bfgs-b", "tnc"]) {
      const x = await evalFloat(
        session,
        `minimize_constrained(_h, [], [_ZERO], algorithm='${algorithm}')[0]`,
      );
      assert.ok(
        Math.abs(x - 3) <= 1e-4,
        `algorithm=${algorithm}: cons=[] should minimize freely, got ${x}`,
      );
    }
  } finally {
    await session.close();
  }
});

test("any callable is a constraint, where upstream accepts only plain functions", async () => {
  const session = await openSession();
  try {
    // Upstream's test is `isinstance(cons[0], (function_type, Expression))`
    // with `function_type = type(lambda x, y: x+y)`, i.e. exactly
    // `types.FunctionType`. A callable object, a bound method or a
    // `functools.partial` matches neither branch, so `min` is never assigned
    // and the function ends in `UnboundLocalError` -- an error that names
    // nothing the caller wrote. `_constraint_callables` tests `callable(...)`.
    //
    // min x^2 subject to x >= 1, with the constraint spelled four ways.
    await session.evaluate([
      "import functools",
      "_obj = lambda p: p[0]**2",
      "def _plain(p): return p[0] - _ONE",
      "class _Ge:",
      "    def __init__(self, bound): self.bound = bound",
      "    def __call__(self, p): return p[0] - self.bound",
      "_callable_object = _Ge(_ONE)",
      "_bound_method = _Ge(_ONE).__call__",
      "def _shifted(p, shift): return p[0] - shift",
      "_partial = functools.partial(_shifted, shift=_ONE)",
    ].join("\n"));

    for (const spelling of [
      "_plain",
      "_callable_object",
      "_bound_method",
      "_partial",
    ]) {
      const x = await evalFloat(
        session,
        `minimize_constrained(_obj, [${spelling}], [_ZERO])[0]`,
      );
      assert.ok(
        Math.abs(x - 1) <= 1e-3,
        `constraint spelled as ${spelling}: x = ${x}`,
      );
    }

    // Something genuinely unusable still gets a TypeError naming the index,
    // not an UnboundLocalError about a local variable in the implementation.
    const message = await messageFromRaise(
      session,
      "minimize_constrained(_obj, ['not a constraint'], [_ZERO])",
      "TypeError",
    );
    assert.ok(
      message.includes("cons"),
      `the message should describe the cons shapes: ${message}`,
    );
  } finally {
    await session.close();
  }
});
