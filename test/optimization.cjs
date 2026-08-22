"use strict";

// Edge-case suite for the numerical optimization package
// (`sagejs.optimization`): Brent root finding, bounded Brent minimization
// and the Nelder-Mead downhill simplex, plus the Sage-compatible
// `find_root` / `find_local_minimum` / `find_local_maximum` / `minimize`
// wrappers built on top of them.
//
// TOLERANCE POLICY
// Numerical noise is never asserted away by comparing floats exactly. Every
// numeric check below is one of:
//   * |x - x_true| <= tol, with the tol justified from the solver's own
//     stopping tolerance in a comment;
//   * |f(x) - f_min| <= tol, preferred wherever the argmin is
//     ill-conditioned (flat minima, Nelder-Mead's slow tail);
//   * a structural invariant (a bracket was retained, an iteration budget
//     was respected, two code paths agree, a repeated run is reproducible).
// The only exact comparisons are on integers (iteration and evaluation
// counts), booleans, status strings, and the determinism test, where
// bit-identical output is the property under test.

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

// Imported once per session; every helper below assumes these names.
const PRELUDE = [
  "from sagejs.optimization import bisect, brentq, fminbound, nelder_mead",
  "from sagejs.optimization.sage_api import find_root",
  "from sagejs.optimization.sage_api import find_local_minimum",
  "from sagejs.optimization.sage_api import find_local_maximum",
  "from sagejs.optimization.sage_api import minimize",
  // The Rosenbrock banana, the classic curved-valley slow-convergence test.
  "rosenbrock = lambda v: 100*(v[1] - v[0]**2)**2 + (1 - v[0])**2",
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

// `code` must evaluate to a Python list of floats/ints; Python's repr of
// such a list is valid JSON.
async function evalList(session, code) {
  return JSON.parse(await evalRepr(session, code));
}

async function evalBool(session, code) {
  return (await evalRepr(session, `bool(${code})`)) === "True";
}

// Run `code` expecting `exceptionName`; returns the exception message.
// A *different* exception propagates out of `session.evaluate` and fails the
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
  // `repr` of a Python string; strip the surrounding quote characters.
  return repr.slice(1, -1);
}

// ---------------------------------------------------------------------------
// Root finding
// ---------------------------------------------------------------------------

// The Dottie number, the unique real fixed point of cosine. This literal is
// the correctly rounded double: at this value `cos(r) - r` evaluates to
// exactly 0.0 in IEEE-754 double precision.
const DOTTIE = 0.7390851332151607;

// What the previous hand-rolled bisection in `Expression.find_root` returned
// for the same problem. Its error is 5.2e-14 -- eleven ulps out.
const OLD_BISECTION_ROOT = 0.7390851332152124;

test("find_root resolves the Dottie number to full double precision", async () => {
  const session = await openSession();
  try {
    const root = await evalFloat(session, "find_root(cos(x) - x, 0, 2)");

    // Brent's method terminates on |bracket|/2 < (xtol + rtol*|x|)/2 and
    // then polishes onto a point where f is exactly zero, so the answer is
    // expected to be the correctly rounded double, not merely xtol-close.
    // The old bisection missed by 5.2e-14; 1e-15 is well inside what the
    // old code could reach and well outside float noise at this magnitude
    // (one ulp near 0.739 is 1.1e-16).
    assert.ok(
      Math.abs(root - DOTTIE) <= 1e-15,
      `root ${root} is not within 1e-15 of the Dottie number ${DOTTIE}`,
    );
    assert.ok(
      Math.abs(root - DOTTIE) < Math.abs(OLD_BISECTION_ROOT - DOTTIE),
      "the new root finder must be strictly more accurate than the old bisection",
    );

    // The residual test, which is the property that actually matters. The
    // objective is evaluated through the same compiled float evaluator the
    // solver used, so this measures the root and not a re-coercion of it.
    await session.evaluate("_dottie = fast_callable(cos(x) - x, vars=[x])");
    const residual = await evalFloat(session, `abs(_dottie(float(${root})))`);
    assert.ok(residual <= 1e-16, `residual ${residual} is too large`);

    // Same problem, same answer, through a plain Python callable instead of
    // a symbolic expression: the two front doors must not disagree.
    const viaCallable = await evalFloat(
      session,
      "find_root(lambda t: float(cos(RDF(t)) - RDF(t)), float(0), float(2))",
    );
    assert.equal(viaCallable, root);
  } finally {
    await session.close();
  }
});

test("find_root locates sqrt(2) within its stated tolerance", async () => {
  const session = await openSession();
  try {
    const root = await evalFloat(session, "find_root(x^2 - 2, 0, 2)");
    const truth = Math.SQRT2; // 1.4142135623730951

    // Sage's `find_root` defaults to xtol = 10e-13, and Brent stops as soon
    // as the bracket half-width drops below (xtol + rtol*|x|)/2, so the
    // guaranteed accuracy is ~1e-12, not machine precision. Asserting the
    // full 17-digit literal here would be asserting noise.
    assert.ok(
      Math.abs(root - truth) <= 1e-12,
      `root ${root} is not within the 1e-12 implied by xtol=10e-13`,
    );

    // The residual is the sharper statement: |x^2 - 2| ~ 2*sqrt(2)*|dx|.
    const residual = await evalFloat(session, `abs(${root}*${root} - 2)`);
    assert.ok(residual <= 1e-11, `residual ${residual} is too large`);
  } finally {
    await session.close();
  }
});

test("find_root reproduces the high-multiplicity Sage doctest", async () => {
  const session = await openSession();
  try {
    // Upstream Sage doctest: find_root((x+17)*(x-3)*(x-1/8)^3, 0, 4) is
    // documented as 2.999999999999995. The triple root at 1/8 lies inside
    // the interval but carries no sign change, so the only bracketed root
    // on [0, 4] is the simple one at 3.
    const root = await evalFloat(
      session,
      "find_root((x + 17)*(x - 3)*(x - 1/8)^3, 0, 4)",
    );

    // f'(3) is large (~5.4e3), so the root is well conditioned and the
    // xtol=1e-12 stop leaves an error of order 1e-14. Compare against the
    // exact root 3 with a tolerance one decade above the doctest's own
    // 5e-15 miss rather than pinning the doctest's trailing noise digits.
    assert.ok(
      Math.abs(root - 3) <= 1e-13,
      `root ${root} is not within 1e-13 of the simple root at 3`,
    );
    assert.ok(
      root < 3,
      "the documented Sage answer approaches 3 from below; a sign flip here " +
        "would indicate the bracket was not retained",
    );
  } finally {
    await session.close();
  }
});

test("find_root rejects an interval whose endpoints share a sign", async () => {
  const session = await openSession();
  try {
    // x^2 + 1 is strictly positive, so the sign-refinement pre-pass finds a
    // positive minimum far above rtol and gives up with Sage's message.
    const message = await messageFromRaise(
      session,
      "find_root(x^2 + 1, -1, 1)",
      "RuntimeError",
    );
    assert.equal(message, "f appears to have no zero on the interval");

    // The raw Brent solver has no refinement pre-pass; it applies scipy's
    // bracket precondition directly.
    const brentMessage = await messageFromRaise(
      session,
      "brentq(lambda t: t*t + 1, float(-1), float(1))",
      "ValueError",
    );
    assert.equal(brentMessage, "f(a) and f(b) must have different signs");
  } finally {
    await session.close();
  }
});

test("a double root without a sign change follows Sage's refinement path", async () => {
  const session = await openSession();
  try {
    // x^2 on [-1, 1] has a root, but no sign change to bracket it. Upstream
    // Sage does NOT raise here: both endpoints are positive, so it refines
    // with find_local_minimum, and because the minimum value (~1e-33) is
    // below rtol = 2^-50 it returns the minimizer itself. Sage.js reproduces
    // that path, so this test asserts the real documented behaviour rather
    // than an error that upstream never raises.
    const root = await evalFloat(session, "find_root(x^2, -1, 1)");

    // fminbound's tol is 1.48e-8 and the minimum is quadratic, so the
    // argmin is only determined to ~1e-8; the *value* is what is tiny.
    assert.ok(
      Math.abs(root) <= 1e-8,
      `returned point ${root} is not near the double root at 0`,
    );
    const value = await evalFloat(session, `${root}*${root}`);
    assert.ok(
      value < Math.pow(2, -50),
      `f(root) = ${value} must be below rtol = 2^-50 for Sage to accept it`,
    );

    // Shifting the same parabola up so that it has no root at all is what
    // actually triggers the error, and it is covered by the test above.
  } finally {
    await session.close();
  }
});

test("a root sitting exactly on an endpoint costs no iterations", async () => {
  const session = await openSession();
  try {
    // Lower endpoint.
    const low = await evalList(
      session,
      [
        "_r = brentq(lambda t: t, float(0), float(2))",
        "[float(_r.root), _r.iterations, _r.function_calls]",
      ].join("\n"),
    );
    assert.deepEqual(low, [0, 0, 2]);
    assert.ok(await evalBool(session, "_r.converged"));
    assert.equal(await evalRepr(session, "_r.flag"), "'converged'");

    // Upper endpoint.
    const high = await evalList(
      session,
      [
        "_r = brentq(lambda t: t - 2, float(0), float(2))",
        "[float(_r.root), _r.iterations, _r.function_calls]",
      ].join("\n"),
    );
    assert.deepEqual(high, [2, 0, 2]);

    // Both endpoints zero: scipy returns the first one it tests, with the
    // bracket never entered.
    const both = await evalList(
      session,
      [
        "_r = brentq(lambda t: 0, float(-1), float(1))",
        "[float(_r.root), _r.iterations, _r.function_calls]",
      ].join("\n"),
    );
    assert.deepEqual(both, [-1, 0, 2]);

    // The Sage wrapper agrees on the endpoint cases.
    assert.equal(
      await evalFloat(session, "find_root(lambda t: t, float(0), float(2))"),
      0,
    );
    assert.equal(
      await evalFloat(session, "find_root(lambda t: t - 2, float(0), float(2))"),
      2,
    );
  } finally {
    await session.close();
  }
});

test("a pole is not a root: Brent converges to it, find_root refuses it", async () => {
  const session = await openSession();
  try {
    // 1/x changes sign across [-1, 1] with no root anywhere: the sign change
    // comes from the pole at 0. Brent's precondition (opposite signs at the
    // endpoints) is satisfied, so it happily bisects onto the singularity.
    // scipy's brentq and Sage's find_root behave the same way; this is a
    // documented property of bracketed root finders, not a defect.
    const polar = await evalList(
      session,
      [
        "_r = brentq(lambda t: 1/t, float(-1), float(1))",
        "[float(_r.root), _r.iterations]",
      ].join("\n"),
    );
    const [root, iterations] = polar;
    assert.ok(await evalBool(session, "_r.converged"));

    // It converged onto the pole, not onto anything resembling a zero: the
    // stopping tolerance is xtol = 2e-12, so |root| must be that small.
    assert.ok(
      Math.abs(root) <= 1e-11,
      `Brent should converge toward the pole at 0, got ${root}`,
    );
    assert.ok(iterations > 0 && iterations <= 100);

    // ... and the "root" is a point where |f| is astronomically large.
    const magnitude = await evalFloat(session, `abs(1/(${root}))`);
    assert.ok(
      magnitude > 1e9,
      `|f(root)| = ${magnitude} should be huge at a pole`,
    );

    // Sage's find_root wraps Brent in a residual check (issue #4942) which
    // catches exactly this, so the user-facing function reports failure.
    const message = await messageFromRaise(
      session,
      "find_root(lambda t: 1/t, float(-1), float(1))",
      "NotImplementedError",
    );
    assert.equal(
      message,
      "Brent's method failed to find a zero for f on the interval",
    );
  } finally {
    await session.close();
  }
});

test("find_root accepts a reversed interval and rejects a degenerate one", async () => {
  const session = await openSession();
  try {
    // Sage swaps a > b silently, so [2, 0] must give the same answer as
    // [0, 2] -- bit for bit, since it is literally the same computation.
    const forward = await evalFloat(
      session,
      "find_root(lambda t: t*t - 2, float(0), float(2))",
    );
    const reversed = await evalFloat(
      session,
      "find_root(lambda t: t*t - 2, float(2), float(0))",
    );
    assert.equal(reversed, forward);
    assert.ok(Math.abs(forward - Math.SQRT2) <= 1e-12);

    // A degenerate interval carries no sign change; the refinement pre-pass
    // reports the standard Sage failure instead of looping or dividing by
    // an empty bracket width.
    const message = await messageFromRaise(
      session,
      "find_root(lambda t: t*t - 2, float(1), float(1))",
      "RuntimeError",
    );
    assert.equal(message, "f appears to have no zero on the interval");
  } finally {
    await session.close();
  }
});

test("degenerate tolerance and iteration budgets terminate instead of spinning", async () => {
  const session = await openSession();
  try {
    // xtol = 0 must not spin at machine precision. scipy's zeros solvers
    // reject a non-positive xtol up front, and Sage.js reproduces that
    // check, so the call terminates immediately with a diagnosis rather
    // than iterating forever on an unreachable stopping criterion.
    const started = Date.now();
    const message = await messageFromRaise(
      session,
      "find_root(lambda t: t*t - 2, float(0), float(2), xtol=float(0))",
      "ValueError",
    );
    assert.ok(message.startsWith("xtol too small"), message);
    assert.ok(
      Date.now() - started < 10000,
      "a rejected tolerance must fail fast, not spin",
    );

    // rtol below 4*eps is rejected the same way.
    const rtolMessage = await messageFromRaise(
      session,
      "find_root(lambda t: t*t - 2, float(0), float(2), rtol=float(1e-18))",
      "ValueError",
    );
    assert.ok(rtolMessage.startsWith("rtol too small"), rtolMessage);

    // maxiter = 1 must not crash. The raw solver returns its best estimate
    // flagged as unconverged; the Sage wrapper turns that into an error.
    const truncated = await evalList(
      session,
      [
        "_r = brentq(lambda t: t*t - 2, float(0), float(2), maxiter=1)",
        "[float(_r.root), _r.iterations, _r.function_calls]",
      ].join("\n"),
    );
    assert.equal(truncated[1], 1, "exactly one iteration must have run");
    assert.equal(await evalBool(session, "_r.converged"), false);
    assert.equal(await evalRepr(session, "_r.flag"), "'convergence error'");
    // The estimate is still inside the original bracket -- the invariant
    // that matters when convergence is cut short.
    assert.ok(truncated[0] >= 0 && truncated[0] <= 2, `${truncated[0]}`);

    const wrapped = await messageFromRaise(
      session,
      "find_root(lambda t: t*t - 2, float(0), float(2), maxiter=1)",
      "RuntimeError",
    );
    assert.equal(wrapped, "Failed to converge after 1 iterations.");
  } finally {
    await session.close();
  }
});

test("bisect is a differential oracle for brentq on a smooth problem", async () => {
  const session = await openSession();
  try {
    // Plain bisection has no interpolation to get wrong, so agreement
    // between the two solvers is evidence about brentq's step selection,
    // not just about the tolerance both happen to stop at.
    const values = await evalList(
      session,
      [
        "_f = lambda t: t*t - 2",
        "_bq = brentq(_f, float(0), float(2))",
        "_bs = bisect(_f, float(0), float(2), maxiter=200)",
        "[float(_bq.root), float(_bs.root), _bq.iterations, _bs.iterations]",
      ].join("\n"),
    );
    const [brentRoot, bisectRoot, brentIterations, bisectIterations] = values;

    // Both stop on the same xtol = 2e-12 criterion, so they must agree to
    // roughly that much; they are not expected to agree bit for bit.
    assert.ok(
      Math.abs(brentRoot - bisectRoot) <= 1e-11,
      `brentq ${brentRoot} and bisect ${bisectRoot} disagree beyond xtol`,
    );
    assert.ok(Math.abs(brentRoot - Math.SQRT2) <= 1e-12);
    assert.ok(Math.abs(bisectRoot - Math.SQRT2) <= 1e-11);

    // Superlinear versus linear convergence: Brent must be much cheaper.
    assert.ok(
      brentIterations < bisectIterations,
      `brentq took ${brentIterations} iterations, bisect ${bisectIterations}`,
    );

    // bisect enforces the same bracket precondition as brentq.
    const message = await messageFromRaise(
      session,
      "bisect(lambda t: t*t + 1, float(0), float(2))",
      "ValueError",
    );
    assert.equal(message, "f(a) and f(b) must have different signs");
  } finally {
    await session.close();
  }
});

test("find_root survives a discontinuity and an enormous bracket", async () => {
  const session = await openSession();
  try {
    // A step function has a sign change but no root. Brent converges to the
    // jump, the same way it converges to a pole; the point is that it
    // terminates within the iteration budget instead of thrashing.
    const step = await evalList(
      session,
      [
        "_r = brentq(lambda t: -1 if t < 0.3 else 1, float(-1), float(1))",
        "[float(_r.root), _r.iterations]",
      ].join("\n"),
    );
    assert.ok(await evalBool(session, "_r.converged"));
    assert.ok(
      Math.abs(step[0] - 0.3) <= 1e-11,
      `should converge to the jump at 0.3, got ${step[0]}`,
    );
    assert.ok(step[1] <= 100);

    // A bracket spanning the entire double-precision range must not
    // overflow while forming midpoints. (xblk - xcur)/2 is computed as a
    // halved difference precisely so that 1e300 - (-1e300) never squares.
    const huge = await evalList(
      session,
      [
        "_r = brentq(lambda t: t - 1, float(-1e300), float(1e300))",
        "[float(_r.root), _r.iterations]",
      ].join("\n"),
    );
    assert.ok(await evalBool(session, "_r.converged"));
    assert.equal(huge[0], 1, "a linear function's root is found exactly");
    assert.ok(huge[1] <= 100);
  } finally {
    await session.close();
  }
});

test("find_root handles endpoints where f is undefined (Sage issue #4942)", async () => {
  const session = await openSession();
  try {
    // x^2*log(x, 2) - 1 is NaN at x = 0. Sage shrinks the interval to the
    // span between the interior extrema and then brackets normally. The
    // upstream doctest documents 1.41421356237 at abs tol 1e-6.
    const root = await evalFloat(session, "find_root(x^2*log(x, 2) - 1, 0, 2)");
    assert.ok(
      Math.abs(root - 1.41421356237) <= 1e-6,
      `root ${root} does not match the upstream doctest value`,
    );

    // Upstream doctest: find_root(1/(x-1)+1, 0, 2) is 0.0, because the
    // NaN-endpoint shrink collapses the interval onto the exact root.
    assert.equal(await evalFloat(session, "find_root(1/(x - 1) + 1, 0, 2)"), 0);

    // Upstream doctest: moving the left endpoint off the root makes Brent
    // land on the asymptote at x = 1, which the residual check rejects.
    const asymptote = await messageFromRaise(
      session,
      "find_root(1/(x - 1) + 1, 0.00001, 2)",
      "NotImplementedError",
    );
    assert.equal(
      asymptote,
      "Brent's method failed to find a zero for f on the interval",
    );

    // Upstream doctest: an f that is NaN on the whole interval.
    const allNaN = await messageFromRaise(
      session,
      "find_root(lambda t: float('nan'), float(-1), float(0))",
      "RuntimeError",
    );
    assert.equal(allNaN, "f appears to have no zero on the interval");
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Local minimization
// ---------------------------------------------------------------------------

test("find_local_minimum returns (fval, xmin) in that order", async () => {
  const session = await openSession();
  try {
    // This ordering is reversed relative to scipy's fminbound and is the
    // single most likely thing to get backwards, so it is asserted on a
    // problem where the two components cannot be confused: the minimum
    // value is -5 and the minimizer is 2.
    const pair = await evalList(
      session,
      [
        "_v, _x = find_local_minimum(lambda t: (t - 2)*(t - 2) - 5, float(0), float(5))",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    const [minimumValue, minimizer] = pair;

    // fminbound's tol is 1.48e-8 on x, and the objective is quadratic, so
    // the value is accurate to ~tol^2 while x is accurate to ~tol.
    assert.ok(
      Math.abs(minimumValue - -5) <= 1e-12,
      `first component ${minimumValue} should be the minimum VALUE -5`,
    );
    assert.ok(
      Math.abs(minimizer - 2) <= 1e-6,
      `second component ${minimizer} should be the MINIMIZER 2`,
    );

    // Upstream Sage doctest: find_local_minimum(x*cos(x), 1, 5) is
    // (-3.288371395590..., 3.4256184695...).
    const doctest = await evalList(
      session,
      [
        "_v, _x = find_local_minimum(x*cos(x), 1, 5)",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    // The doctest is pinned to 12 significant digits upstream precisely
    // because the trailing digits are noise; 1e-9 is a decade tighter than
    // fminbound's own 1.48e-8 tolerance on x.
    assert.ok(Math.abs(doctest[0] - -3.28837139559) <= 1e-9, `${doctest[0]}`);
    assert.ok(Math.abs(doctest[1] - 3.4256184695) <= 1e-9, `${doctest[1]}`);
  } finally {
    await session.close();
  }
});

test("find_local_maximum negates find_local_minimum consistently", async () => {
  const session = await openSession();
  try {
    // -(t-2)^2 + 5 is the reflection of the minimization problem above.
    const pair = await evalList(
      session,
      [
        "_v, _x = find_local_maximum(lambda t: -((t - 2)*(t - 2)) + 5, float(0), float(5))",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    assert.ok(Math.abs(pair[0] - 5) <= 1e-12, `max value ${pair[0]}`);
    assert.ok(Math.abs(pair[1] - 2) <= 1e-6, `maximizer ${pair[1]}`);

    // The stronger statement: maximizing f and minimizing -f must produce
    // the identical iterate, since one is implemented as the other.
    const agree = await evalBool(
      session,
      [
        "(lambda p, q: p[0] == -q[0] and p[1] == q[1])(",
        "    find_local_maximum(x*cos(x), 0, 5),",
        "    find_local_minimum(-x*cos(x), 0, 5),",
        ")",
      ].join("\n"),
    );
    assert.ok(agree, "find_local_maximum(f) must equal -find_local_minimum(-f)");

    // Upstream Sage doctests for find_local_maximum.
    const defaults = await evalList(
      session,
      [
        "_v, _x = find_local_maximum(x*cos(x), 0, 5)",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    assert.ok(Math.abs(defaults[0] - 0.561096338191) <= 1e-9, `${defaults[0]}`);
    assert.ok(Math.abs(defaults[1] - 0.8603335890) <= 1e-9, `${defaults[1]}`);

    // The loosened-tolerance doctest also exercises a Sage real literal
    // reaching the float-only solver core.
    const loose = await evalList(
      session,
      [
        "_v, _x = find_local_maximum(x*cos(x), 0, 5, tol=0.1, maxfun=10)",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    assert.ok(Math.abs(loose[0] - 0.561090323458) <= 1e-9, `${loose[0]}`);
    assert.ok(Math.abs(loose[1] - 0.857926501456) <= 1e-9, `${loose[1]}`);

    // A third upstream doctest, on a symbolic expression built from e^-x.
    const damped = await evalList(
      session,
      [
        "_v, _x = find_local_maximum(8*e^(-x)*sin(x) - 1, 0, 7)",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    assert.ok(Math.abs(damped[0] - 1.579175535558) <= 1e-9, `${damped[0]}`);
    // The maximizer is pi/4 for this family.
    assert.ok(Math.abs(damped[1] - Math.PI / 4) <= 1e-7, `${damped[1]}`);
  } finally {
    await session.close();
  }
});

test("bounded minimization copes with flat, monotone and kinked objectives", async () => {
  const session = await openSession();
  try {
    // A constant objective: every point is optimal and the parabolic fit is
    // degenerate everywhere. The requirement is termination, and that the
    // reported value is the constant.
    const constant = await evalList(
      session,
      [
        "_v, _x = find_local_minimum(lambda t: 1, float(0), float(5))",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    assert.equal(constant[0], 1, "the minimum of a constant is the constant");
    assert.ok(
      constant[1] >= 0 && constant[1] <= 5,
      `the reported point ${constant[1]} must stay inside the interval`,
    );

    // A monotone objective puts the minimum on the lower endpoint. Brent's
    // bounded search approaches an endpoint but never evaluates outside the
    // interval, so it stops one tolerance short of it -- asserting the
    // exact endpoint would be asserting something the algorithm does not
    // promise. tol = 1.48e-8, so 1e-7 is the honest bound.
    const monotone = await evalList(
      session,
      [
        "_v, _x = find_local_minimum(lambda t: t, float(0), float(5))",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    assert.ok(
      monotone[1] >= 0 && monotone[1] <= 1e-7,
      `monotone minimum should sit at the lower endpoint, got ${monotone[1]}`,
    );
    assert.equal(monotone[0], monotone[1], "f(t) = t, so value equals point");

    // A non-differentiable minimum: |t| has no parabola to fit at the kink,
    // so this exercises the golden-section fallback. Assert on the value,
    // which is what a kinked minimum determines sharply.
    const kinked = await evalList(
      session,
      [
        "_v, _x = find_local_minimum(lambda t: abs(t), float(-1), float(1))",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    assert.ok(
      kinked[0] >= 0 && kinked[0] <= 1e-8,
      `|t| has minimum value 0, got ${kinked[0]}`,
    );
    assert.ok(Math.abs(kinked[1]) <= 1e-8, `minimizer ${kinked[1]}`);

    // A degenerate interval is answered directly, without iterating.
    const degenerate = await evalList(
      session,
      [
        "_m = fminbound(lambda t: t*t, float(1), float(1))",
        "[float(_m.x), float(_m.fun), _m.iterations, _m.function_calls]",
      ].join("\n"),
    );
    assert.deepEqual(degenerate, [1, 1, 0, 1]);
    assert.ok(await evalBool(session, "_m.converged"));
  } finally {
    await session.close();
  }
});

test("bounded minimization rejects a > b and reports an exhausted budget", async () => {
  const session = await openSession();
  try {
    // Unlike find_root, which swaps a reversed interval, the minimizers
    // treat it as a caller error -- matching scipy's fminbound.
    const wrapperMessage = await messageFromRaise(
      session,
      "find_local_minimum(lambda t: t*t, float(5), float(0))",
      "ValueError",
    );
    assert.equal(wrapperMessage, "The lower bound exceeds the upper bound.");
    const coreMessage = await messageFromRaise(
      session,
      "fminbound(lambda t: t*t, float(5), float(0))",
      "ValueError",
    );
    assert.equal(coreMessage, "The lower bound exceeds the upper bound.");

    // An exhausted evaluation budget must be *reported*, not raised: the
    // caller still gets the best point found so far.
    const truncated = await evalList(
      session,
      [
        "_m = fminbound(lambda t: (t - 2)*(t - 2), float(0), float(5), maxfun=3)",
        "[float(_m.x), float(_m.fun), _m.function_calls]",
      ].join("\n"),
    );
    assert.equal(await evalBool(session, "_m.converged"), false);
    assert.equal(
      await evalRepr(session, "_m.flag"),
      "'maximum function evaluations reached'",
    );
    assert.equal(truncated[2], 3, "the budget must be honoured exactly");
    // Three evaluations of golden-section search cannot resolve the minimum
    // at 2 to any real accuracy; all that can be asserted is that the point
    // stayed in the interval and beat the interval midpoint's value.
    assert.ok(truncated[0] >= 0 && truncated[0] <= 5, `${truncated[0]}`);
    assert.ok(
      truncated[1] < 6.25,
      `a truncated run should still improve on f(mid) = 6.25, got ${truncated[1]}`,
    );

    // The same budget carried through the Sage wrapper still returns a pair
    // rather than raising.
    const viaWrapper = await evalList(
      session,
      [
        "_v, _x = find_local_minimum(",
        "    lambda t: (t - 2)*(t - 2), float(0), float(5), maxfun=3",
        ")",
        "[float(_v), float(_x)]",
      ].join("\n"),
    );
    assert.equal(viaWrapper.length, 2);
    assert.ok(viaWrapper[1] >= 0 && viaWrapper[1] <= 5);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Nelder-Mead
// ---------------------------------------------------------------------------

test("Nelder-Mead descends the Rosenbrock valley from (-1.2, 1)", async () => {
  const session = await openSession();
  try {
    const result = await evalList(
      session,
      [
        "_nm = nelder_mead(rosenbrock, [float(-1.2), float(1)])",
        "[float(_nm.x[0]), float(_nm.x[1]), float(_nm.fun),",
        " _nm.iterations, _nm.function_calls]",
      ].join("\n"),
    );
    const [x0, x1, fun, iterations, calls] = result;
    assert.ok(await evalBool(session, "_nm.converged"));

    // The assertion is on f, not on x. Nelder-Mead's default xatol/fatol
    // are both 1e-4, and inside Rosenbrock's curved valley the simplex
    // collapses along the valley floor long before it pins the argmin: the
    // minimizer is only good to ~5e-5 while f is already ~1e-9. Asserting
    // x to 1e-9 would be asserting noise, so f carries the accuracy claim
    // and x gets the tolerance the algorithm actually promises.
    assert.ok(fun <= 1e-8, `f at the reported minimum is ${fun}, expected <=1e-8`);
    assert.ok(fun >= 0, "Rosenbrock is a sum of squares and cannot go negative");
    assert.ok(
      Math.abs(x0 - 1) <= 1e-3 && Math.abs(x1 - 1) <= 1e-3,
      `minimizer (${x0}, ${x1}) is not within 1e-3 of (1, 1)`,
    );

    // The budget defaults to n*200 = 400 for n = 2; a healthy run finishes
    // in a small fraction of that. This catches a solver that "converges"
    // only by exhausting its budget.
    assert.ok(calls < 400, `used ${calls} evaluations of a 400 budget`);
    assert.ok(iterations > 10, `${iterations} iterations is implausibly few`);

    // A monotone-descent invariant: the best vertex of the final simplex is
    // the reported point, and every vertex is at least as good as the value
    // at the starting point (f(-1.2, 1) = 24.2).
    const sorted = await evalBool(
      session,
      "all(rosenbrock(v) <= 24.2 for v in _nm.simplex)",
    );
    assert.ok(sorted, "no final vertex may be worse than the starting point");
    const bestIsFirst = await evalBool(
      session,
      "list(_nm.simplex[0]) == list(_nm.x)",
    );
    assert.ok(bestIsFirst, "simplex[0] must be the reported best vertex");
  } finally {
    await session.close();
  }
});

test("Nelder-Mead handles n = 1 through the multivariate path", async () => {
  const session = await openSession();
  try {
    // A one-dimensional problem still builds a 2-vertex simplex and runs
    // the full reflect/expand/contract/shrink machinery -- the degenerate
    // dimension count is where off-by-one indexing bugs live.
    const result = await evalList(
      session,
      [
        "_nm = nelder_mead(lambda v: (v[0] - 3)**2, [float(0)])",
        "[float(_nm.x[0]), float(_nm.fun), _nm.iterations, len(_nm.simplex)]",
      ].join("\n"),
    );
    const [minimizer, fun, iterations, vertices] = result;
    assert.ok(await evalBool(session, "_nm.converged"));
    assert.equal(vertices, 2, "an n = 1 simplex has n + 1 = 2 vertices");
    assert.equal(
      await evalRepr(session, "len(_nm.x)"),
      "1",
      "the result point keeps the dimension of x0",
    );

    // xatol defaults to 1e-4, so the minimizer is guaranteed only to that;
    // the value converges quadratically faster and is the sharper check.
    assert.ok(fun <= 1e-12, `f at the minimum is ${fun}`);
    assert.ok(
      Math.abs(minimizer - 3) <= 1e-4,
      `minimizer ${minimizer} is outside the 1e-4 xatol promise`,
    );
    assert.ok(iterations > 0 && iterations < 200);
  } finally {
    await session.close();
  }
});

test("Nelder-Mead barely moves when x0 is already optimal", async () => {
  const session = await openSession();
  try {
    // Started exactly at the Rosenbrock minimum, the algorithm can only
    // shrink; it must never wander off the optimum it was handed.
    const result = await evalList(
      session,
      [
        "_nm = nelder_mead(rosenbrock, [float(1), float(1)])",
        "[float(_nm.x[0]), float(_nm.x[1]), float(_nm.fun), _nm.function_calls]",
      ].join("\n"),
    );
    const [x0, x1, fun, calls] = result;
    assert.ok(await evalBool(session, "_nm.converged"));

    // The optimal value is exactly 0 and the starting vertex attains it, so
    // no accepted move can ever beat it: this one may be asserted exactly.
    assert.equal(fun, 0, "the optimal value 0 must be retained exactly");
    assert.equal(x0, 1);
    assert.equal(x1, 1);

    // "Near-zero steps" means the run is dominated by shrinking a simplex
    // whose best vertex never changes, so it must be far cheaper than the
    // descent from (-1.2, 1) measured in the Rosenbrock test above.
    assert.ok(calls < 120, `an already-optimal start used ${calls} evaluations`);
  } finally {
    await session.close();
  }
});

test("Nelder-Mead terminates on a constant objective and a collapsed simplex", async () => {
  const session = await openSession();
  try {
    // A constant objective ties every vertex: reflection never improves and
    // the algorithm can only shrink. It must stop on the xatol test rather
    // than loop, and it must not report a value it never saw.
    const flat = await evalList(
      session,
      [
        "_nm = nelder_mead(lambda v: 1, [float(0), float(0)])",
        "[float(_nm.x[0]), float(_nm.x[1]), float(_nm.fun),",
        " _nm.iterations, _nm.function_calls]",
      ].join("\n"),
    );
    assert.ok(await evalBool(session, "_nm.converged"));
    assert.equal(await evalRepr(session, "_nm.flag"), "'converged'");
    assert.equal(flat[2], 1, "the reported value is the constant");
    assert.ok(flat[4] < 400, `constant objective used ${flat[4]} evaluations`);

    // An initial simplex whose vertices all coincide has zero volume: every
    // spread is 0, so the convergence test fires on the first pass. The
    // point is that this returns instead of dividing by a zero centroid
    // offset or looping forever.
    const collapsed = await evalList(
      session,
      [
        "_flat = [[float(1), float(1)], [float(1), float(1)], [float(1), float(1)]]",
        "_nm = nelder_mead(rosenbrock, [float(1), float(1)], initial_simplex=_flat)",
        "[float(_nm.x[0]), float(_nm.x[1]), float(_nm.fun),",
        " _nm.iterations, _nm.function_calls]",
      ].join("\n"),
    );
    assert.ok(await evalBool(session, "_nm.converged"));
    assert.equal(collapsed[0], 1);
    assert.equal(collapsed[1], 1);
    assert.equal(collapsed[2], 0);
    assert.ok(
      collapsed[3] <= 2,
      `a zero-volume simplex should stop immediately, took ${collapsed[3]} iterations`,
    );
    assert.equal(collapsed[4], 3, "one evaluation per coincident vertex");

    // A NaN at one vertex must never be accepted as an improvement, and
    // must not derail the search on the rest of the domain.
    const withNaN = await evalList(
      session,
      [
        "_nan = float('nan')",
        "_obj = lambda v: _nan if v[0] > 100 else (v[0] - 3)**2 + (v[1] - 4)**2",
        "_nm = nelder_mead(_obj, [float(0), float(0)])",
        "[float(_nm.x[0]), float(_nm.x[1]), float(_nm.fun)]",
      ].join("\n"),
    );
    assert.ok(await evalBool(session, "_nm.converged"));
    assert.ok(withNaN[2] <= 1e-8, `f at the minimum is ${withNaN[2]}`);
    assert.ok(Math.abs(withNaN[0] - 3) <= 1e-3, `${withNaN[0]}`);
    assert.ok(Math.abs(withNaN[1] - 4) <= 1e-3, `${withNaN[1]}`);
  } finally {
    await session.close();
  }
});

test("Nelder-Mead is deterministic across repeated runs", async () => {
  const session = await openSession();
  try {
    // Bit-identical output is the property under test here, so exact
    // equality is the correct assertion rather than a tolerance. Ties
    // between simplex vertices are broken lexicographically on the vertex
    // coordinates, giving a total order and therefore a reproducible run.
    const identical = await evalBool(
      session,
      [
        "(lambda a, b: (",
        "    list(a.x) == list(b.x)",
        "    and a.fun == b.fun",
        "    and a.iterations == b.iterations",
        "    and a.function_calls == b.function_calls",
        "    and a.flag == b.flag",
        "    and [list(v) for v in a.simplex] == [list(v) for v in b.simplex]",
        "))(",
        "    nelder_mead(rosenbrock, [float(-1.2), float(1)]),",
        "    nelder_mead(rosenbrock, [float(-1.2), float(1)]),",
        ")",
      ].join("\n"),
    );
    assert.ok(identical, "two identical calls must return identical results");

    // The harder case: an objective on which many vertices tie, so the
    // outcome depends entirely on the tie-breaking rule being total.
    await session.evaluate(
      [
        "def tied(v):",
        "    return 0 if abs(v[0]) < 1 and abs(v[1]) < 1 else 1",
        "",
        "tied_first = nelder_mead(tied, [float(0), float(0)])",
        "tied_second = nelder_mead(tied, [float(0), float(0)])",
      ].join("\n"),
    );
    const tiedRuns = await evalBool(
      session,
      [
        "[list(u) for u in tied_first.simplex]",
        "== [list(u) for u in tied_second.simplex]",
      ].join("\n"),
    );
    assert.ok(tiedRuns, "a tie-heavy objective must still be reproducible");
  } finally {
    await session.close();
  }
});

test("minimize wraps the simplex method with Sage's calling convention", async () => {
  const session = await openSession();
  try {
    // A plain Python callable taking one point.
    const numeric = await evalList(
      session,
      "[float(c) for c in minimize(rosenbrock, [float(-1.2), float(1)])]",
    );
    assert.equal(numeric.length, 2);
    const residual = await evalFloat(
      session,
      `rosenbrock([float(${numeric[0]}), float(${numeric[1]})])`,
    );
    assert.ok(residual <= 1e-8, `f at the returned point is ${residual}`);

    // A symbolic expression of several variables, compiled internally.
    const symbolic = await evalList(
      session,
      [
        "var('y')",
        "[float(c) for c in minimize(x^2 + y^2 - 3, [float(1), float(1)])]",
      ].join("\n"),
    );
    // The minimum of x^2 + y^2 - 3 is at the origin. xatol defaults to
    // 1e-4, so that is the accuracy the simplex promises on the argmin.
    assert.ok(Math.abs(symbolic[0]) <= 1e-4, `${symbolic[0]}`);
    assert.ok(Math.abs(symbolic[1]) <= 1e-4, `${symbolic[1]}`);

    // "default" and "simplex" must select the same algorithm, exactly.
    const sameAlgorithm = await evalBool(
      session,
      [
        "minimize(rosenbrock, [float(-1.2), float(1)], algorithm='default')",
        "== minimize(rosenbrock, [float(-1.2), float(1)], algorithm='simplex')",
      ].join("\n"),
    );
    assert.ok(sameAlgorithm, "'default' and 'simplex' must agree bit for bit");

    // Sage's SciPy-facing option spellings are forwarded, and a tightened
    // tolerance must not make the answer worse.
    await session.evaluate(
      "tight = minimize(rosenbrock, [float(-1.2), float(1)], xtol=1e-10, ftol=1e-14)",
    );
    const tightened = await evalFloat(
      session,
      "rosenbrock([float(tight[0]), float(tight[1])])",
    );
    assert.ok(
      tightened <= residual,
      `tightening the tolerance made f worse: ${tightened} > ${residual}`,
    );

    // An unimplemented algorithm reports itself by name instead of failing
    // with the UnboundLocalError upstream Sage produces.
    const unimplemented = await messageFromRaise(
      session,
      "minimize(rosenbrock, [float(0), float(0)], algorithm='bfgs')",
      "NotImplementedError",
    );
    assert.ok(
      unimplemented.includes("bfgs"),
      `the message should name the algorithm: ${unimplemented}`,
    );
  } finally {
    await session.close();
  }
});
