// sagejs-test-tier: integration
"use strict";

// Phase 2 edge-case suite for the global optimization half of
// `sagejs.optimization`: the deterministic `RandomStream`, the
// sequential/parallel `Schedule` policy, the three stochastic global
// methods (`differential_evolution`, `simulated_annealing`,
// `random_search`) and the Wolfram-shaped `nminimize` front door.
//
// TOLERANCE POLICY
// These are stochastic algorithms, so no assertion below ever pins a
// coordinate.  Every numeric check is one of:
//   * |f(x_found) - f*| <= tol against the PUBLISHED global minimum taken
//     from `/home/hsy/tmp/sagejs-numerics/test-problems.md`, with the
//     budget that earns that tol spelled out in a comment;
//   * f(x_found) <= threshold, where the threshold is a stated, weaker but
//     TRUE claim (for example "inside the global funnel, strictly below the
//     first ring of local minima") for a method that provably cannot do
//     better within a sane budget -- the comment says why;
//   * a structural invariant: a seed reproduces an answer bit for bit, two
//     dispatch paths agree bit for bit, a partition tiles a range, a bad
//     argument raises a named error.
// The only exact float comparisons are the determinism and equivalence
// tests, where bit-identical output is precisely the property under test.
//
// PUBLISHED OPTIMA USED HERE (test-problems.md, sections 1, 5, 6, 7, 9):
//   Rastrigin  d=2 on [-5.12, 5.12]^2        f* = 0 at the origin (exact);
//                                            first ring of local minima
//                                            sits at f ~= 0.9950
//   Ackley     d=2 on [-32.768, 32.768]^2    f* = 0 at the origin (exact)
//   Griewank   d=2 on [-600, 600]^2          f* = 0 at the origin (exact)
//   Rosenbrock d=2 on [-5, 10]^2             f* = 0 at (1, 1) (exact)
//   Six-hump camelback on [-3,3] x [-2,2]    f* = -1.0316284534898773504
//                                            (mpmath, 20 digits)

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

// The published six-hump camelback minimum, transcribed from
// test-problems.md section 9 (recomputed there with mpmath at 40 digits).
// Rounded to the nearest double this is -1.0316284534898774.
const CAMEL6_MIN = -1.0316284534898773504;

// test-problems.md section 5: "the ring of local minima nearest the origin
// has f ~= 0.9950".  Any Rastrigin answer at or above this number has not
// left the local-minimum lattice; any answer well below it is in the global
// funnel.  Used as the discriminator for methods that find the right basin
// but do not polish it.
const RASTRIGIN_FIRST_RING = 0.9950;

// Every objective below is written with its constants forced through
// `float()`.  A bare decimal literal in a Sage session is a `RealLiteral`,
// and `RealLiteral * <plain float>` raises "value has no mathematical
// parent" whenever the float happens to hold an integral value (for
// instance `10.0 * math.cos(0.0)`).  Building the constants with `float()`
// keeps every objective in plain IEEE double arithmetic, which is what the
// optimizers hand in and what the published optima were computed in.
const PRELUDE = [
  "import math",
  "from sagejs.optimization.random_stream import RandomStream, derive_stream",
  "from sagejs.optimization.schedule import make_schedule, slice_indices",
  "from sagejs.optimization.schedule import DEFAULT_POLICY, probe_worker_capability",
  "from sagejs.optimization.global_result import GlobalResult",
  "from sagejs.optimization.differential_evolution import differential_evolution",
  "from sagejs.optimization.simulated_annealing import simulated_annealing",
  "from sagejs.optimization.simulated_annealing import anneal_once",
  "",
  "_ZERO = float(0)",
  "_ONE = float(1)",
  "_TWO = float(2)",
  "_THREE = float(3)",
  "_FOUR = float(4)",
  "_TEN = float(10)",
  "_TWENTY = float(20)",
  "_HUNDRED = float(100)",
  "_PI = math.pi",
  "_E = math.e",
  "_ACKLEY_B = float(2) / float(10)",
  "_CAMEL_C = float(21) / float(10)",
  "_GRIEWANK_D = float(4000)",
  "_NAN = float('nan')",
  "",
  // test-problems.md section 5, SFU `Code/rastrm.html`:
  //   f(x) = 10 d + sum_i [ x_i^2 - 10 cos(2 pi x_i) ]
  "def rastrigin(v):",
  "    total = _TEN * float(len(v))",
  "    for value in v:",
  "        x = float(value)",
  "        total = total + x * x - _TEN * math.cos(_TWO * _PI * x)",
  "    return total",
  "",
  // test-problems.md section 6, SFU `Code/ackleym.html`, a = 20, b = 0.2,
  // c = 2 pi:
  //   f(x) = -a exp(-b sqrt(mean(x^2))) - exp(mean(cos(c x))) + a + e
  "def ackley(v):",
  "    d = float(len(v))",
  "    squares = _ZERO",
  "    cosines = _ZERO",
  "    for value in v:",
  "        x = float(value)",
  "        squares = squares + x * x",
  "        cosines = cosines + math.cos(_TWO * _PI * x)",
  "    radial = -_TWENTY * math.exp(-_ACKLEY_B * math.sqrt(squares / d))",
  "    return radial - math.exp(cosines / d) + _TWENTY + _E",
  "",
  // test-problems.md section 7, SFU `Code/griewankm.html` (1-based `sqrt(ii)`):
  //   f(x) = sum_i x_i^2/4000 - prod_i cos(x_i / sqrt(i)) + 1
  "def griewank(v):",
  "    total = _ZERO",
  "    product = _ONE",
  "    for index in range(len(v)):",
  "        x = float(v[index])",
  "        total = total + x * x / _GRIEWANK_D",
  "        product = product * math.cos(x / math.sqrt(float(index + 1)))",
  "    return total - product + _ONE",
  "",
  // test-problems.md section 1, SFU `Code/rosenm.html`:
  //   f(x) = sum_i [ 100 (x_{i+1} - x_i^2)^2 + (x_i - 1)^2 ]
  "def rosenbrock(v):",
  "    total = _ZERO",
  "    for index in range(len(v) - 1):",
  "        a = float(v[index])",
  "        b = float(v[index + 1])",
  "        gap = b - a * a",
  "        shift = a - _ONE",
  "        total = total + _HUNDRED * gap * gap + shift * shift",
  "    return total",
  "",
  // test-problems.md section 9, SFU `Code/camel6m.html`:
  //   f(x1,x2) = (4 - 2.1 x1^2 + x1^4/3) x1^2 + x1 x2 + (-4 + 4 x2^2) x2^2
  "def camel6(v):",
  "    x1 = float(v[0])",
  "    x2 = float(v[1])",
  "    q1 = x1 * x1",
  "    q2 = x2 * x2",
  "    bowl = (_FOUR - _CAMEL_C * q1 + q1 * q1 / _THREE) * q1",
  "    return bowl + x1 * x2 + (-_FOUR + _FOUR * q2) * q2",
  "",
  "def constant_objective(v):",
  "    return float(7)",
  "",
  "def always_nan(v):",
  "    return _NAN",
  "",
  // NaN on the whole left half plane, a well behaved bowl on the right.
  // A method that treats NaN as an improvement would settle in the NaN
  // region and report NaN; a method that treats one NaN as fatal would
  // never reach the bowl.
  "def half_nan(v):",
  "    if float(v[0]) < _ZERO:",
  "        return _NAN",
  "    return float(v[0]) * float(v[0]) + float(v[1]) * float(v[1])",
  "",
  "RASTRIGIN_BOX = [(float(-5.12), float(5.12))] * 2",
  "ACKLEY_BOX = [(float(-32.768), float(32.768))] * 2",
  "GRIEWANK_BOX = [(float(-600), float(600))] * 2",
  "ROSENBROCK_BOX = [(float(-5), float(10))] * 2",
  "CAMEL6_BOX = [(float(-3), float(3)), (float(-2), float(2))]",
  "SQUARE_BOX = [(float(-5), float(5))] * 2",
].join("\n");

// `random_search` and `nminimize` are loaded on demand rather than in the
// shared prelude so that a failure to import them cannot hide the results
// of the tests that do not need them.
const GLOBAL_SURFACE = [
  "from sagejs.optimization.random_search import random_search, solve_from_start",
  "from sagejs.optimization.nminimize import nminimize, inequality, equality",
].join("\n");

async function openSession() {
  const session = await createSage();
  await session.evaluate(PRELUDE);
  return session;
}

async function openSurfaceSession() {
  const session = await openSession();
  try {
    await session.evaluate(GLOBAL_SURFACE);
  } catch (error) {
    // Close before rethrowing: a leaked kernel session keeps the test
    // process alive long after the assertion has already failed.
    await session.close();
    throw error;
  }
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
  return repr.slice(1, -1);
}

// ---------------------------------------------------------------------------
// The objectives themselves, checked against the published optima
// ---------------------------------------------------------------------------

test("the test objectives reproduce their published optimal values", async () => {
  const session = await openSession();
  try {
    // Before any optimizer is trusted to FIND a minimum, the objective it is
    // handed has to BE the published function. Each formula is evaluated at
    // the published minimizer from test-problems.md and compared with the
    // published optimal value. A mistranscribed constant (Griewank's 1-based
    // sqrt(i), Ackley's a/b/c, the +1 that is so often dropped) shows up here
    // and nowhere else.
    const atOrigin = await evalList(
      session,
      [
        "[float(rastrigin([_ZERO, _ZERO])),",
        " float(ackley([_ZERO, _ZERO])),",
        " float(griewank([_ZERO, _ZERO])),",
        " float(rosenbrock([_ONE, _ONE]))]",
      ].join("\n"),
    );
    const [rast, ack, grie, rosen] = atOrigin;

    // Rastrigin, Griewank and Rosenbrock cancel exactly in IEEE arithmetic.
    assert.equal(rast, 0, `rastrigin(0,0) = ${rast}, published f* = 0`);
    assert.equal(grie, 0, `griewank(0,0) = ${grie}, published f* = 0`);
    assert.equal(rosen, 0, `rosenbrock(1,1) = ${rosen}, published f* = 0`);

    // Ackley's published f* = 0 is exact in real arithmetic (-20 - e + 20 + e)
    // but not in floating point: `exp(0)` and the additive constants leave a
    // residual of a couple of ulps at magnitude 20, i.e. ~4.4e-16.
    assert.ok(
      Math.abs(ack) <= 1e-14,
      `ackley(0,0) = ${ack} should vanish to floating-point noise`,
    );

    // Six-hump camelback at the published minimizer
    // (0.089842013100318062422, -0.7126564030207396334).
    const camel = await evalFloat(
      session,
      [
        "camel6([float(0.089842013100318062422),",
        "        float(-0.7126564030207396334)])",
      ].join("\n"),
    );
    assert.ok(
      Math.abs(camel - CAMEL6_MIN) <= 1e-15,
      `camel6 at the published minimizer is ${camel}, expected ${CAMEL6_MIN}`,
    );

    // The second, symmetric global minimizer must give the same value; the
    // function is odd under (x1, x2) -> (-x1, -x2).
    const mirrored = await evalFloat(
      session,
      [
        "camel6([float(-0.089842013100318062422),",
        "        float(0.7126564030207396334)])",
      ].join("\n"),
    );
    assert.equal(mirrored, camel);

    // The published local structure of Rastrigin, which several assertions
    // below lean on: |x_i| ~= 0.99501 is a local minimum near f = 0.9950.
    const ring = await evalFloat(
      session,
      "rastrigin([float(0.99501), _ZERO])",
    );
    assert.ok(
      Math.abs(ring - RASTRIGIN_FIRST_RING) <= 1e-3,
      `the first Rastrigin ring evaluates to ${ring}, expected ~0.9950`,
    );
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Global optima: the point of the exercise
// ---------------------------------------------------------------------------

test("differential_evolution finds the published global minima", async () => {
  const session = await openSession();
  try {
    // BUDGET. Population 40 (Storn/Price's rule of thumb is 10*d, and this
    // is 20*d for d = 2) run for up to 300 generations, i.e. at most 12040
    // objective evaluations per problem -- a small budget by DE standards
    // and one that a working DE/rand/1/bin clears comfortably: measured
    // directly, this configuration lands on f = 0.0 for Rastrigin,
    // Griewank and Rosenbrock, 4.4e-16 for Ackley and the exactly rounded
    // -1.0316284534898774 for camelback.
    //
    // `tolerance` is 1e-10 rather than the 0.001 default because the
    // published optima are exact: asking for a coarser tolerance would be
    // asking the solver to stop early and then grading it as if it had not.
    const budget = "search_points=40, max_iterations=300, tolerance=float(1e-10)";
    const found = await evalList(
      session,
      [
        `_a = differential_evolution(rastrigin, RASTRIGIN_BOX, ${budget})`,
        `_b = differential_evolution(ackley, ACKLEY_BOX, ${budget})`,
        `_c = differential_evolution(griewank, GRIEWANK_BOX, ${budget})`,
        `_d = differential_evolution(rosenbrock, ROSENBROCK_BOX, ${budget})`,
        `_e = differential_evolution(camel6, CAMEL6_BOX, ${budget})`,
        "[float(_a.fun), float(_b.fun), float(_c.fun),",
        " float(_d.fun), float(_e.fun)]",
      ].join("\n"),
    );
    const [rast, ack, grie, rosen, camel] = found;

    // Published f* = 0 for the first four. 1e-6 is far looser than the
    // measured 0.0/4.4e-16 and far tighter than any local minimum: the
    // nearest Rastrigin local minimum is at 0.9950 and Ackley's funnel wall
    // is steeper still, so this threshold cannot be met by anything but the
    // global optimum.
    assert.ok(rast <= 1e-6, `Rastrigin: DE returned ${rast}, published f* = 0`);
    assert.ok(ack <= 1e-6, `Ackley: DE returned ${ack}, published f* = 0`);
    assert.ok(grie <= 1e-6, `Griewank: DE returned ${grie}, published f* = 0`);
    assert.ok(
      rosen <= 1e-6,
      `Rosenbrock: DE returned ${rosen}, published f* = 0 at (1,1)`,
    );
    assert.ok(
      Math.abs(camel - CAMEL6_MIN) <= 1e-6,
      `camelback: DE returned ${camel}, published f* = ${CAMEL6_MIN}`,
    );
  } finally {
    await session.close();
  }
});

test("differential_evolution runs more than one generation", async () => {
  const session = await openSession();
  try {
    // The convergence rule compares the incumbent best point and value
    // between consecutive generations. In DE/rand/1/bin most generations
    // improve some ordinary population member without displacing the best
    // one, and in such a generation the value gap and the point distance are
    // both exactly 0.0 -- which satisfies "< tolerance" for every positive
    // tolerance. If that is the whole stopping rule then the search halts at
    // the first such generation, which is typically generation 1 or 2, and
    // `max_iterations` becomes decorative.
    //
    // This is the sharpest statement of the property: with a tolerance of
    // 1e-10 on a 2-D Rastrigin whose global minimum is 5 to 10 units below
    // a random population's best member, no correct differential evolution
    // can be finished after a couple of generations.
    const observed = await evalList(
      session,
      [
        "_r = differential_evolution(",
        "    rastrigin, RASTRIGIN_BOX,",
        "    search_points=40, max_iterations=200, tolerance=float(1e-10),",
        ")",
        "[int(_r.iterations), int(_r.function_calls), float(_r.fun)]",
      ].join("\n"),
    );
    const [iterations, calls, value] = observed;

    assert.ok(
      iterations > 2,
      "DE stopped after " +
        `${iterations} generation(s) (${calls} evaluations, f = ${value}) ` +
        "with tolerance 1e-10 and a budget of 200 generations: a generation " +
        "that merely fails to improve the incumbent best is being read as " +
        "convergence",
    );

    // ... and the run must have used a real part of the budget it was given.
    assert.ok(
      iterations >= 20,
      `DE used only ${iterations} of 200 generations, reaching f = ${value}`,
    );
  } finally {
    await session.close();
  }
});

test("simulated_annealing reaches the global basin of every test problem", async () => {
  const session = await openSession();
  try {
    // BUDGET. 100 independent chains (Wolfram's `"SearchPoints"` default is
    // only min(2d, 50); 100 is generous) of up to 200 iterations each, with
    // the documented default level_iterations = 50 and perturbation_scale =
    // 1.0. That is the same order of objective evaluations as the DE budget
    // above.
    //
    // WHY THE THRESHOLDS BELOW ARE WEAKER THAN "f* WITHIN 1e-6".
    // This annealer has no local-polish phase: a chain's neighbourhood
    // radius decays as 1/(1+i) and its final accepted point is wherever the
    // last downhill step left it, never a converged stationary point. So the
    // honest, TRUE claim is "the global basin was located", asserted as a
    // value strictly and unambiguously below every competing local minimum,
    // rather than "the global minimizer was resolved". Measured values for
    // this budget at the default seed are quoted next to each threshold.
    const budget =
      "search_points=100, max_iterations=200, tolerance=float(1e-10)";
    const found = await evalList(
      session,
      [
        `_a = simulated_annealing(rastrigin, RASTRIGIN_BOX, ${budget})`,
        `_b = simulated_annealing(ackley, ACKLEY_BOX, ${budget})`,
        `_c = simulated_annealing(griewank, GRIEWANK_BOX, ${budget})`,
        `_d = simulated_annealing(rosenbrock, ROSENBROCK_BOX, ${budget})`,
        `_e = simulated_annealing(camel6, CAMEL6_BOX, ${budget})`,
        "[float(_a.fun), float(_b.fun), float(_c.fun),",
        " float(_d.fun), float(_e.fun)]",
      ].join("\n"),
    );
    const [rast, ack, grie, rosen, camel] = found;

    // Rastrigin: measured 0.0266. The discriminator is the published first
    // ring of local minima at f ~= 0.9950 (test-problems.md section 5): a
    // result below 0.5 is unambiguously inside the central funnel and not
    // on the lattice. This is the assertion that a multistart annealer
    // which merely rolled into the nearest local minimum would fail.
    assert.ok(
      rast <= 0.5,
      `Rastrigin: SA returned ${rast}; the first ring of local minima is at ` +
        `${RASTRIGIN_FIRST_RING}, so anything at or above it is a local trap`,
    );
    assert.ok(
      rast < RASTRIGIN_FIRST_RING,
      `Rastrigin: SA returned ${rast}, which is not below the local ring`,
    );

    // Ackley: measured 0.0272. Ackley's outer region is a nearly flat plain
    // at f ~= 20 with a narrow funnel at the origin; 0.2 is deep inside the
    // funnel, corresponding to |x| of order 0.01.
    assert.ok(ack <= 0.2, `Ackley: SA returned ${ack}, published f* = 0`);

    // Griewank: measured 0.0221. On [-600, 600]^2 the outer landscape rises
    // to f ~= 180; 0.1 places the answer within |x| ~ 0.4 of the origin.
    assert.ok(grie <= 0.1, `Griewank: SA returned ${grie}, published f* = 0`);

    // Rosenbrock: measured 2.5e-4. Not multimodal, but the curved valley is
    // exactly where an undirected random walk stalls, so a value this small
    // says the valley floor was actually followed to near (1, 1).
    assert.ok(
      rosen <= 1e-2,
      `Rosenbrock: SA returned ${rosen}, published f* = 0 at (1,1)`,
    );

    // Camelback: measured -1.0316268, i.e. 1.7e-6 from the published value.
    // Here the global minimum genuinely is resolved, because the basin is
    // wide and quadratic; 1e-4 leaves margin for the unpolished tail while
    // still excluding the next local minimum, which sits near -0.2155.
    assert.ok(
      Math.abs(camel - CAMEL6_MIN) <= 1e-4,
      `camelback: SA returned ${camel}, published f* = ${CAMEL6_MIN}`,
    );
  } finally {
    await session.close();
  }
});

test("random_search finds the published global minima", async () => {
  const session = await openSurfaceSession();
  try {
    // BUDGET, per problem, chosen from the size of the search box relative
    // to the basin of attraction of the global minimum -- multistart
    // succeeds exactly when one start lands in that basin, so the number of
    // starts is the parameter that matters and the local iteration cap is
    // nearly free.
    //
    //   Rastrigin  150 starts: the global basin is one cell of a lattice
    //              with ~121 cells inside [-5.12, 5.12]^2, so ~100 starts is
    //              the natural scale. 100 starts lands on the 0.99496 ring;
    //              150 reaches exactly 0.0.
    //   Griewank   150 starts: same reasoning on a much larger box.
    //   Ackley     100 starts: the funnel is broad, and 100 starts already
    //              reaches 5.3e-11.
    //   Rosenbrock  40 starts: unimodal, so the starts only have to find the
    //              valley; the local method does the rest (5.6e-23).
    //   Camelback   40 starts: six local minima only.
    const found = await evalList(
      session,
      [
        "_tol = float(1e-10)",
        "_a = random_search(rastrigin, RASTRIGIN_BOX,",
        "                   search_points=150, max_iterations=200, tolerance=_tol)",
        "_b = random_search(ackley, ACKLEY_BOX,",
        "                   search_points=100, max_iterations=200, tolerance=_tol)",
        "_c = random_search(griewank, GRIEWANK_BOX,",
        "                   search_points=150, max_iterations=200, tolerance=_tol)",
        "_d = random_search(rosenbrock, ROSENBROCK_BOX,",
        "                   search_points=40, max_iterations=300, tolerance=_tol)",
        "_e = random_search(camel6, CAMEL6_BOX,",
        "                   search_points=40, max_iterations=300, tolerance=_tol)",
        "[float(_a.fun), float(_b.fun), float(_c.fun),",
        " float(_d.fun), float(_e.fun)]",
      ].join("\n"),
    );
    const [rast, ack, grie, rosen, camel] = found;

    // Measured: 0.0, 5.3e-11, 0.0, 5.6e-23 and the exactly rounded double
    // for camelback. The thresholds sit orders of magnitude above those and
    // orders of magnitude below the nearest competing local minimum.
    assert.ok(
      rast <= 1e-8,
      `Rastrigin: random_search returned ${rast}, published f* = 0`,
    );
    assert.ok(
      ack <= 1e-6,
      `Ackley: random_search returned ${ack}, published f* = 0`,
    );
    assert.ok(
      grie <= 1e-8,
      `Griewank: random_search returned ${grie}, published f* = 0`,
    );
    assert.ok(
      rosen <= 1e-10,
      `Rosenbrock: random_search returned ${rosen}, published f* = 0`,
    );
    assert.ok(
      Math.abs(camel - CAMEL6_MIN) <= 1e-9,
      `camelback: random_search returned ${camel}, published f* = ${CAMEL6_MIN}`,
    );

    // A converged multistart run must also report itself as converged and
    // must have spent one local solve per start.
    const bookkeeping = await evalList(
      session,
      "[int(_e.iterations), int(_e.seed), int(_e.function_calls > 40)]",
    );
    assert.equal(bookkeeping[0], 40, "one local solve per start point");
    assert.equal(bookkeeping[1], 0, "the default seed is echoed back");
    assert.equal(bookkeeping[2], 1, "function_calls sums across the starts");
    assert.equal(await evalRepr(session, "_e.flag"), "'converged'");
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("a fixed seed reproduces every global method bit for bit", async () => {
  const session = await openSurfaceSession();
  try {
    // Bit-identical repetition is the headline correctness property of the
    // whole package, so this is the one place exact float equality is the
    // right assertion rather than a tolerance.
    const identical = await evalList(
      session,
      [
        "_de1 = differential_evolution(camel6, CAMEL6_BOX, seed=11)",
        "_de2 = differential_evolution(camel6, CAMEL6_BOX, seed=11)",
        "_sa1 = simulated_annealing(camel6, CAMEL6_BOX, seed=11,",
        "                           search_points=6, max_iterations=30)",
        "_sa2 = simulated_annealing(camel6, CAMEL6_BOX, seed=11,",
        "                           search_points=6, max_iterations=30)",
        "_rs1 = random_search(camel6, CAMEL6_BOX, seed=11, search_points=8)",
        "_rs2 = random_search(camel6, CAMEL6_BOX, seed=11, search_points=8)",
        "",
        "def _same(a, b):",
        "    return int(",
        "        list(a.x) == list(b.x)",
        "        and a.fun == b.fun",
        "        and a.iterations == b.iterations",
        "        and a.function_calls == b.function_calls",
        "        and a.converged == b.converged",
        "        and a.flag == b.flag",
        "        and a.seed == b.seed",
        "    )",
        "",
        "[_same(_de1, _de2), _same(_sa1, _sa2), _same(_rs1, _rs2)]",
      ].join("\n"),
    );
    assert.deepEqual(
      identical,
      [1, 1, 1],
      "differential_evolution / simulated_annealing / random_search must " +
        "each return an identical GlobalResult for a repeated seed",
    );

    // The seed is echoed back unchanged on every result.
    const seeds = await evalList(
      session,
      "[int(_de1.seed), int(_sa1.seed), int(_rs1.seed)]",
    );
    assert.deepEqual(seeds, [11, 11, 11]);
  } finally {
    await session.close();
  }
});

test("different seeds produce different answers", async () => {
  const session = await openSurfaceSession();
  try {
    // The counterpart to the test above, and the one that can actually
    // catch a real bug: an implementation that ignored `seed` entirely, or
    // that derived every stream from a constant, would satisfy the
    // reproducibility test perfectly and fail here.
    //
    // Asserting on `x` rather than `fun` is deliberate. Two seeds may well
    // agree on the optimal VALUE (that is the algorithm working); what they
    // must not do is agree on the exact double coordinates of a point
    // reached by an entirely different random walk.
    const differs = await evalList(
      session,
      [
        "_de_a = differential_evolution(camel6, CAMEL6_BOX, seed=11)",
        "_de_b = differential_evolution(camel6, CAMEL6_BOX, seed=12)",
        "_sa_a = simulated_annealing(camel6, CAMEL6_BOX, seed=11,",
        "                            search_points=6, max_iterations=30)",
        "_sa_b = simulated_annealing(camel6, CAMEL6_BOX, seed=12,",
        "                            search_points=6, max_iterations=30)",
        "_rs_a = random_search(camel6, CAMEL6_BOX, seed=11, search_points=8)",
        "_rs_b = random_search(camel6, CAMEL6_BOX, seed=12, search_points=8)",
        "[int(list(_de_a.x) != list(_de_b.x)),",
        " int(list(_sa_a.x) != list(_sa_b.x)),",
        " int(list(_rs_a.x) != list(_rs_b.x))]",
      ].join("\n"),
    );
    assert.deepEqual(
      differs,
      [1, 1, 1],
      "seeds 11 and 12 produced identical points: the seed is being ignored",
    );

    // The starting populations themselves must differ, which is the direct
    // statement of the same property one level down.
    const startsDiffer = await evalBool(
      session,
      [
        "[derive_stream(11, i).uniform() for i in range(8)]",
        "!= [derive_stream(12, i).uniform() for i in range(8)]",
      ].join("\n"),
    );
    assert.ok(startsDiffer, "two seeds must not derive the same streams");
  } finally {
    await session.close();
  }
});

test("derive_stream reproduces one stream and separates different ones", async () => {
  const session = await openSession();
  try {
    // Reproducibility: derive_stream(s, i) is a pure function of (s, i), so
    // two independently constructed streams must emit the same words in the
    // same order, and the explicit constructor must agree with the helper.
    const reproduced = await evalList(
      session,
      [
        "_a = derive_stream(3, 5)",
        "_b = derive_stream(3, 5)",
        "_c = RandomStream(3, 5)",
        "_wa = [_a.next_uint64() for _ in range(32)]",
        "_wb = [_b.next_uint64() for _ in range(32)]",
        "_wc = [_c.next_uint64() for _ in range(32)]",
        "[int(_wa == _wb), int(_wa == _wc), int(len(set(_wa)) == 32)]",
      ].join("\n"),
    );
    assert.deepEqual(
      reproduced,
      [1, 1, 1],
      "derive_stream(3, 5) must replay exactly, and must not repeat a word " +
        "within its first 32 draws",
    );

    // Separation: the whole parallel-safety argument rests on neighbouring
    // stream indices being unrelated, so no two of the first sixteen
    // streams may share any of their first eight outputs.
    await session.evaluate(
      [
        "_blocks = []",
        "for i in range(16):",
        "    _s = derive_stream(3, i)",
        "    _blocks.append([_s.next_uint64() for _ in range(8)])",
        "_flat = []",
        "for _block in _blocks:",
        "    _flat.extend(_block)",
      ].join("\n"),
    );
    const overlap = await evalFloat(
      session,
      "len(_flat) - len(set(_flat))",
    );
    assert.equal(
      overlap,
      0,
      "sixteen consecutive streams shared a 64-bit output: the stream index " +
        "is not being mixed into the state",
    );

    // Uncorrelated in the weak, cheap sense that matters here: the sample
    // correlation of two neighbouring streams' uniforms over 500 draws must
    // be small. For independent uniforms the standard error is 1/sqrt(500)
    // = 0.045, so 0.15 is a bit over three sigma -- loose enough never to
    // flap on a good generator, tight enough to catch streams that are
    // shifts or copies of one another.
    await session.evaluate(
      [
        "_p = derive_stream(3, 40)",
        "_q = derive_stream(3, 41)",
        "_xs = [_p.uniform() for _ in range(500)]",
        "_ys = [_q.uniform() for _ in range(500)]",
        "_n = float(len(_xs))",
        "_mx = sum(_xs) / _n",
        "_my = sum(_ys) / _n",
        "_cov = sum((_xs[i] - _mx) * (_ys[i] - _my) for i in range(500)) / _n",
        "_vx = sum((_xs[i] - _mx) ** 2 for i in range(500)) / _n",
        "_vy = sum((_ys[i] - _my) ** 2 for i in range(500)) / _n",
      ].join("\n"),
    );
    const correlation = await evalFloat(
      session,
      "abs(_cov / math.sqrt(_vx * _vy))",
    );
    assert.ok(
      correlation < 0.15,
      `streams 40 and 41 correlate at ${correlation}`,
    );

    // A negative stream index is a legal, distinct stream: simulated
    // annealing places its start-point draws at -(i+1) precisely so that
    // they cannot replay the words its own perturbation stream at i will
    // spend.
    const negativeIsDistinct = await evalBool(
      session,
      [
        "[derive_stream(3, -1).next_uint64() for _ in range(4)]",
        "!= [derive_stream(3, 0).next_uint64() for _ in range(4)]",
      ].join("\n"),
    );
    assert.ok(negativeIsDistinct, "stream -1 must differ from stream 0");
  } finally {
    await session.close();
  }
});

test("RandomStream's derived distributions stay inside their contracts", async () => {
  const session = await openSession();
  try {
    // uniform() is a half-open unit draw; uniform_range respects both ends.
    const ranges = await evalList(
      session,
      [
        "_s = derive_stream(2, 2)",
        "_u = [_s.uniform() for _ in range(2000)]",
        "_r = [_s.uniform_range(float(-2), float(3)) for _ in range(2000)]",
        "[int(all(_ZERO <= v < _ONE for v in _u)),",
        " int(all(float(-2) <= v < float(3) for v in _r)),",
        " int(abs(sum(_u) / float(2000) - float(1) / float(2)) < float(0.05))]",
      ].join("\n"),
    );
    assert.deepEqual(
      ranges,
      [1, 1, 1],
      "uniform() must lie in [0,1), uniform_range in [low,high), and the " +
        "unit mean must be near 1/2",
    );

    // randint is inclusive-low, exclusive-high and unbiased by rejection.
    const ints = await evalList(
      session,
      [
        "_s = derive_stream(1, 1)",
        "_draws = [_s.randint(-3, 5) for _ in range(4000)]",
        "_counts = [_draws.count(v) for v in range(-3, 5)]",
        "[int(min(_draws) >= -3), int(max(_draws) <= 4),",
        " int(len(set(_draws)) == 8),",
        " int(min(_counts) > 350), int(max(_counts) < 650)]",
      ].join("\n"),
    );
    assert.deepEqual(
      ints,
      [1, 1, 1, 1, 1],
      "randint(-3, 5) must cover exactly -3..4 and stay near 500 per value " +
        "over 4000 draws",
    );

    // sample_distinct with count == upper is a full permutation, and the
    // `exclude` index is honoured even when the draw is nearly exhaustive
    // (the case that forces the partial Fisher-Yates strategy).
    const samples = await evalList(
      session,
      [
        "_s = derive_stream(1, 3)",
        "_perm = _s.sample_distinct(10, 10)",
        "_near = _s.sample_distinct(3, 4, exclude=1)",
        "[int(sorted(_perm) == list(range(10))),",
        " int(len(set(_near)) == 3), int(1 not in _near),",
        " int(all(0 <= v < 4 for v in _near))]",
      ].join("\n"),
    );
    assert.deepEqual(
      samples,
      [1, 1, 1, 1],
      "sample_distinct must permute, must not repeat, and must respect exclude",
    );

    // normal() is standard: mean 0, variance 1. With 4000 draws the
    // standard error of the mean is 1/sqrt(4000) = 0.016, so 0.08 is five
    // sigma; the variance check is correspondingly loose.
    const moments = await evalList(
      session,
      [
        "_s = derive_stream(9, 9)",
        "_g = [_s.normal() for _ in range(4000)]",
        "_m = sum(_g) / float(4000)",
        "_v = sum((v - _m) ** 2 for v in _g) / float(4000)",
        "[float(_m), float(_v)]",
      ].join("\n"),
    );
    assert.ok(Math.abs(moments[0]) < 0.08, `normal mean ${moments[0]}`);
    assert.ok(
      Math.abs(moments[1] - 1) < 0.12,
      `normal variance ${moments[1]}`,
    );

    // Degenerate and out-of-range requests are rejected by name.
    const emptyRange = await messageFromRaise(
      session,
      "derive_stream(1, 1).randint(5, 5)",
      "ValueError",
    );
    assert.ok(emptyRange.includes("greater than"), emptyRange);
    const tooMany = await messageFromRaise(
      session,
      "derive_stream(1, 1).sample_distinct(5, 4)",
      "ValueError",
    );
    assert.ok(tooMany.includes("distinct"), tooMany);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Parallel / serial equivalence
// ---------------------------------------------------------------------------

test("random_search is bit-identical under every worker bound", async () => {
  const session = await openSurfaceSession();
  try {
    // The property the owner cares about most: the answer must be a
    // function of (objective, bounds, search_points, seed) alone and must
    // not depend on how the independent local solves were distributed.
    // Both bounds are forced explicitly rather than left to the scheduler:
    // max_workers=1 can never take the parallel branch, max_workers=8 is
    // the policy ceiling.
    const agreement = await evalList(
      session,
      [
        "_args = dict(search_points=12, max_iterations=100, seed=7)",
        "_one = random_search(camel6, CAMEL6_BOX, max_workers=1, **_args)",
        "_eight = random_search(camel6, CAMEL6_BOX, max_workers=8, **_args)",
        "_free = random_search(camel6, CAMEL6_BOX, **_args)",
        "[int(list(_one.x) == list(_eight.x)),",
        " int(_one.fun == _eight.fun),",
        " int(_one.function_calls == _eight.function_calls),",
        " int(_one.iterations == _eight.iterations),",
        " int(list(_one.x) == list(_free.x) and _one.fun == _free.fun)]",
      ].join("\n"),
    );
    assert.deepEqual(
      agreement,
      [1, 1, 1, 1, 1],
      "forcing one worker and forcing eight must give the identical result, " +
        "down to the evaluation count",
    );
  } finally {
    await session.close();
  }
});

test("random_search's answer is the fold over its independent starts", async () => {
  const session = await openSurfaceSession();
  try {
    // Stronger than comparing two worker bounds: reconstruct the start
    // points from (seed, index) outside the algorithm, run each one through
    // the public per-start entry point `solve_from_start` in a plain
    // sequential loop, and reduce them by hand. If the aggregate matched
    // only by accident of scheduling -- for instance because a shared RNG
    // was consumed in completion order -- this is where it would show.
    const folded = await evalList(
      session,
      [
        "_tol = float(1) / float(1000)",
        "_count = 9",
        "_starts = []",
        "for _i in range(_count):",
        "    _stream = derive_stream(4, _i)",
        "    _starts.append(",
        "        [_stream.uniform_range(lo, hi) for lo, hi in CAMEL6_BOX]",
        "    )",
        "_manual = [",
        "    solve_from_start(camel6, CAMEL6_BOX, _start, _tol, 120)",
        "    for _start in _starts",
        "]",
        "_best = min(_manual, key=lambda item: (item[1], item[0]))",
        "_agg = random_search(camel6, CAMEL6_BOX, search_points=_count,",
        "                     seed=4, max_iterations=120, tolerance=_tol)",
        "[int(_best[1] == _agg.fun),",
        " int(list(_best[0]) == list(_agg.x)),",
        " int(sum(item[2] for item in _manual) == _agg.function_calls),",
        " int(len(_manual) == _agg.iterations)]",
      ].join("\n"),
    );
    assert.deepEqual(
      folded,
      [1, 1, 1, 1],
      "the aggregate must equal the hand-rolled sequential fold over the " +
        "same (seed, index) start points",
    );
  } finally {
    await session.close();
  }
});

test("a failing worker pool falls back to sequential, same answer", async () => {
  const session = await openSurfaceSession();
  try {
    // `sagejs.optimization.parallel_worker` is a real, allowlisted worker
    // module now, so forcing the schedule is no longer enough to make the
    // parallel branch fail -- an objective like `camel6` crosses the
    // boundary and comes back with the right answer. The failure exercised
    // here is therefore the one the boundary genuinely cannot carry: a
    // CLOSURE. `_scaled` reads `scale` from its enclosing function, which is
    // not a module global and so is not shipped with the serialized source;
    // the worker raises `scale is not defined` (see
    // `sagejs.optimization.parallel_worker` for the whole contract).
    //
    // The branch must be entered, must fail, must be caught, and must
    // produce the identical answer the sequential path produces -- with the
    // fallback recorded in the flag rather than hidden. `scale` is one, so
    // the closure is numerically `camel6` and every published expectation
    // about that objective still applies.
    const outcome = await evalList(
      session,
      [
        "import sagejs.optimization.random_search as _rs_module",
        "from sagejs.optimization.schedule import Schedule",
        "",
        "def _scaled_camel6(scale):",
        "    def _scaled(v):",
        "        return camel6(v) * scale",
        "    return _scaled",
        "",
        "_closure = _scaled_camel6(_ONE)",
        "_args = dict(search_points=12, max_iterations=100, seed=7)",
        "_sequential = random_search(_closure, CAMEL6_BOX, max_workers=1, **_args)",
        "",
        "_saved = _rs_module.make_schedule",
        "",
        "def _force_parallel(**kwargs):",
        "    return Schedule(",
        "        mode='parallel',",
        "        workers=4,",
        "        slice_count=kwargs['slice_count'],",
        "        reason='forced-by-test',",
        "    )",
        "",
        "_rs_module.make_schedule = _force_parallel",
        "try:",
        "    _forced = random_search(_closure, CAMEL6_BOX, **_args)",
        "finally:",
        "    _rs_module.make_schedule = _saved",
        "",
        "[int(list(_forced.x) == list(_sequential.x)),",
        " int(_forced.fun == _sequential.fun),",
        " int(_forced.function_calls == _sequential.function_calls),",
        " int(_forced.iterations == _sequential.iterations),",
        " int(bool(_forced.converged))]",
      ].join("\n"),
    );
    assert.deepEqual(
      outcome,
      [1, 1, 1, 1, 1],
      "a worker failure must be absorbed and must not change the answer",
    );

    // The fallback is reported, not swallowed.
    const flag = await evalRepr(session, "_forced.flag");
    assert.equal(flag, "'converged:parallel-fallback-sequential'");

    // And the untouched sequential run carries no such suffix.
    assert.equal(await evalRepr(session, "_sequential.flag"), "'converged'");
  } finally {
    await session.close();
  }
});

// An objective expensive enough for the scheduler to accept, and shaped for
// the worker boundary. Every objective in PRELUDE is far too cheap: one
// local solve of `camel6` costs milliseconds, DEFAULT_POLICY refuses to
// parallelise anything under 0.25 s per slice, and it is right to -- a pool
// costs 0.4-0.7 s to create. So this one does real work: a two-parameter
// exponential-decay least-squares fit over 3000 sample points, minimised
// (to zero) at (a, b) = (2, 3), which puts one local solve at a few tenths
// of a second.
//
// `math` is imported INSIDE the function body on purpose. A module always
// resolves that way in a worker; a module referenced from module scope is
// shipped only if the host can serialize the module object, which is not
// something an objective should have to reason about. See
// `sagejs.optimization.parallel_worker`.
const FIT_OBJECTIVE = [
  "_FIT_SAMPLES = 3000",
  "_FIT_A = float(2)",
  "_FIT_B = float(3)",
  "",
  "def fit_residual(v):",
  "    import math",
  "    a = float(v[0])",
  "    b = float(v[1])",
  "    total = _ZERO",
  "    for index in range(_FIT_SAMPLES):",
  "        t = float(index) / float(_FIT_SAMPLES)",
  "        gap = a * math.exp(-b * t) - _FIT_A * math.exp(-_FIT_B * t)",
  "        total = total + gap * gap",
  "    return total / float(_FIT_SAMPLES)",
  "",
  "FIT_BOX = [(_ZERO, float(5)), (_ZERO, float(5))]",
].join("\n");

test(
  "a large random_search dispatches across real workers, bit for bit",
  { timeout: 600_000 },
  async (t) => {
    const session = await openSurfaceSession();
    try {
      // Nothing is forced in this test. `sagejs.optimization.parallel_worker`
      // is listed in `taskRuntimeImports`
      // (scripts/precompiled-python-packages.json), so once the optional
      // precompiled worker graph exists the capability probe reports True and
      // `random_search` selects the parallel branch on its own. That graph is
      // built by `pnpm run python:precompile:run`, which `node
      // scripts/build.cjs` does NOT do, so a checkout without it skips --
      // the same guard test/number-field-maximal-order-parallel-worker.cjs
      // uses.
      if ((await evalRepr(session, "probe_worker_capability()")) !== "True") {
        t.skip("optional precompiled worker module graph is unavailable");
        return;
      }
      await session.evaluate(FIT_OBJECTIVE);

      // Three runs of the same search at three worker bounds, with the
      // schedule each one chose recorded as it is made. This is the
      // non-negotiable property: a seed must give a bit-identical answer at
      // one, two and four workers, because every start point is generated in
      // this process from (seed, index) alone and a worker only solves the
      // points it is handed.
      //
      // This is by far the slowest test in the file (about 25 s), and it has
      // to be: the scheduler only accepts work that is worth a pool, so a
      // test that proves the parallel path really runs must pay for real
      // work three times over. The two-worker run is the most expensive of
      // the three -- see the boundary cost noted in
      // `sagejs.optimization.parallel_worker`.
      const outcome = await evalList(
        session,
        [
          "import sagejs.optimization.random_search as _rs_live",
          "_seen = []",
          "_saved_live = _rs_live.make_schedule",
          "",
          "def _record(**kwargs):",
          "    _decision = _saved_live(**kwargs)",
          "    _seen.append(_decision)",
          "    return _decision",
          "",
          "_rs_live.make_schedule = _record",
          "_args = dict(search_points=8, max_iterations=120, seed=11)",
          "_runs = []",
          "try:",
          "    for _bound in (1, 2, 4):",
          "        _runs.append(",
          "            random_search(fit_residual, FIT_BOX,",
          "                          max_workers=_bound, **_args)",
          "        )",
          "finally:",
          "    _rs_live.make_schedule = _saved_live",
          "_first = _runs[0]",
          "[int(len(_seen) == 3),",
          " int(all(list(_r.x) == list(_first.x) for _r in _runs)),",
          " int(all(_r.fun == _first.fun for _r in _runs)),",
          " int(all(_r.function_calls == _first.function_calls for _r in _runs)),",
          " int(all(_r.iterations == _first.iterations for _r in _runs)),",
          " sum(1 for _s in _seen if _s.mode == 'parallel'),",
          " int(all(_r.flag == 'converged' for _r in _runs))]",
        ].join("\n"),
      );
      const [decisions, sameX, sameFun, sameCalls, sameIterations, parallelRuns, allConverged] =
        outcome;

      assert.equal(decisions, 1, "each of the three runs must ask the scheduler once");
      assert.deepEqual(
        [sameX, sameFun, sameCalls, sameIterations],
        [1, 1, 1, 1],
        "one, two and four workers must agree bit for bit, down to the " +
          "evaluation count",
      );

      // The gates are a function of how fast THIS machine solves one start,
      // so a fast enough host can legitimately refuse to parallelise this
      // workload. That is a correct outcome, not a failure -- but then this
      // test has not shown what it is here to show, so it says so.
      if (parallelRuns === 0) {
        const reasons = await evalRepr(session, "[str(_s.reason) for _s in _seen]");
        t.skip(`the scheduler declined to parallelise this workload: ${reasons}`);
        return;
      }

      // A parallel run that quietly fell back would still be bit-identical,
      // so identity alone proves nothing about dispatch. The flag is what
      // separates them: `_run_parallel` appends
      // ":parallel-fallback-sequential" whenever the pool raised. A bare
      // "converged" on a run whose schedule said "parallel" means the pool
      // was created, the objective crossed into the workers, and their
      // results came back.
      assert.equal(
        allConverged,
        1,
        "a parallel run that fell back would carry the fallback suffix",
      );

      // And the answer is the published one: the residual's minimum is zero
      // at (2, 3), and the fit is exact enough to be indistinguishable from
      // it at this budget.
      assert.ok(
        (await evalFloat(session, "_first.fun")) < 1e-6,
        "the fit residual's published minimum is 0 at (a, b) = (2, 3)",
      );
    } finally {
      await session.close();
    }
  },
);

test("simulated_annealing is the fold over its independent chains", async () => {
  const session = await openSession();
  try {
    // `anneal_once` is the worker-shippable unit: every argument is a plain
    // serializable value and its randomness comes only from
    // (seed, stream_index). Driving the chains by hand and folding them
    // must reproduce the multistart run exactly, which is the same
    // dispatch-independence property tested for random_search above.
    const folded = await evalList(
      session,
      [
        "_origin = [_ZERO, _ZERO]",
        "_chains = [",
        "    anneal_once(camel6, CAMEL6_BOX, _origin, i, 3, max_iterations=20)",
        "    for i in range(4)",
        "]",
        "_multi = simulated_annealing(",
        "    camel6, CAMEL6_BOX, seed=3, search_points=4, max_iterations=20,",
        "    initial_points=[_origin] * 4,",
        ")",
        "_best = min(_chains, key=lambda r: r.fun)",
        "[int(_best.fun == _multi.fun),",
        " int(list(_best.x) == list(_multi.x)),",
        " int(sum(c.function_calls for c in _chains) == _multi.function_calls),",
        " int(_best.iterations == _multi.iterations)]",
      ].join("\n"),
    );
    assert.deepEqual(
      folded,
      [1, 1, 1, 1],
      "the multistart result must equal the fold over anneal_once chains, " +
        "and its function_calls must be their sum",
    );
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Scheduler policy
// ---------------------------------------------------------------------------

test("a cheap objective with few slices stays sequential and says why", async () => {
  const session = await openSession();
  try {
    // Every decision is pinned by asserting the REASON STRING, not just the
    // mode: two different gates both produce "sequential", and a policy
    // regression that swapped them would be invisible otherwise.
    // `worker_capability=True` and an explicit `cpu_count` remove the two
    // environment-dependent inputs so the assertions are about the policy.
    const decisions = await evalList(
      session,
      [
        "_few = make_schedule(2, float(10000000),",
        "                     worker_capability=True, cpu_count=8)",
        "_cheap = make_schedule(8, float(1000),",
        "                       worker_capability=True, cpu_count=8)",
        "_thin = make_schedule(1000, float(100000),",
        "                      worker_capability=True, cpu_count=8)",
        "_margin = make_schedule(4, float(500000), max_workers=2,",
        "                        worker_capability=True, cpu_count=8)",
        "_alone = make_schedule(64, float(1000000), max_workers=1,",
        "                       worker_capability=True, cpu_count=8)",
        "[int(_few.workers), int(_cheap.workers), int(_thin.workers),",
        " int(_margin.workers), int(_alone.workers)]",
      ].join("\n"),
    );
    assert.deepEqual(
      decisions,
      [1, 1, 1, 1, 1],
      "every one of these five configurations must collapse to one worker",
    );

    const modes = await evalRepr(
      session,
      "[_few.mode, _cheap.mode, _thin.mode, _margin.mode, _alone.mode]",
    );
    assert.equal(
      modes,
      "['sequential', 'sequential', 'sequential', 'sequential', 'sequential']",
    );

    // Two slices, however expensive, are below the policy minimum of four.
    assert.equal(await evalRepr(session, "_few.reason"), "'too-few-slices'");

    // Eight slices of a millisecond each is 8 ms of work against a pool
    // that costs of order half a second to stand up.
    assert.equal(
      await evalRepr(session, "_cheap.reason"),
      "'predicted-work-below-threshold'",
    );

    // Plenty of total work, but each slice is 0.1 s -- below the 0.25 s
    // minimum that makes a slice worth shipping to a worker.
    assert.equal(
      await evalRepr(session, "_thin.reason"),
      "'insufficient-work-to-amortize-workers'",
    );

    // 4 slices x 0.5 s = 2 s serial; two workers give a 1 s critical path,
    // so the saving is exactly 1 s and does not EXCEED the 1 s setup
    // margin. This pins the comparison as strict.
    assert.equal(
      await evalRepr(session, "_margin.reason"),
      "'insufficient-work-to-amortize-workers'",
    );

    // One permitted worker can save nothing at all.
    assert.equal(
      await evalRepr(session, "_alone.reason"),
      "'insufficient-work-to-amortize-workers'",
    );

    // The published policy constants these gates are read from.
    const policy = await evalList(
      session,
      [
        "[int(DEFAULT_POLICY.min_slices),",
        " int(DEFAULT_POLICY.min_total_micros),",
        " int(DEFAULT_POLICY.min_slice_micros),",
        " int(DEFAULT_POLICY.max_workers),",
        " int(DEFAULT_POLICY.setup_margin_micros)]",
      ].join("\n"),
    );
    assert.deepEqual(policy, [4, 2000000, 250000, 8, 1000000]);
  } finally {
    await session.close();
  }
});

test("many expensive slices select a bounded parallel pool", async () => {
  const session = await openSession();
  try {
    // 64 slices of one second each: 64 s serial against a 8 s critical path
    // on eight workers, a saving of 56 s against a 1 s setup margin.
    const parallel = await evalList(
      session,
      [
        "_p = make_schedule(64, float(1000000),",
        "                   worker_capability=True, cpu_count=8)",
        "[int(_p.workers), int(_p.slice_count)]",
      ].join("\n"),
    );
    assert.deepEqual(parallel, [8, 64]);
    assert.equal(await evalRepr(session, "_p.mode"), "'parallel'");
    assert.equal(await evalRepr(session, "_p.reason"), "'parallel-threshold-met'");

    // The worker count is bounded by the smallest of the four ceilings:
    // the caller's request, the policy, the CPU count and the slice count.
    const bounds = await evalList(
      session,
      [
        "_byRequest = make_schedule(64, float(1000000), max_workers=3,",
        "                           worker_capability=True, cpu_count=8)",
        "_byCpu = make_schedule(64, float(1000000),",
        "                       worker_capability=True, cpu_count=2)",
        "_bySlices = make_schedule(5, float(4000000),",
        "                          worker_capability=True, cpu_count=8)",
        "_byPolicy = make_schedule(64, float(1000000),",
        "                          worker_capability=True, cpu_count=64)",
        "[int(_byRequest.workers), int(_byCpu.workers),",
        " int(_bySlices.workers), int(_byPolicy.workers)]",
      ].join("\n"),
    );
    assert.deepEqual(
      bounds,
      [3, 2, 5, 8],
      "workers = min(max_workers, policy ceiling, cpu_count, slice_count)",
    );

    // A prediction given as a float is floored to whole microseconds, so a
    // fractional prediction can never tip a gate the integer one would not.
    const floored = await evalRepr(
      session,
      [
        "make_schedule(4, float(500000.9), max_workers=2,",
        "              worker_capability=True, cpu_count=8).reason",
      ].join("\n"),
    );
    assert.equal(floored, "'insufficient-work-to-amortize-workers'");
  } finally {
    await session.close();
  }
});

test("an incapable runtime forces sequential execution", async () => {
  const session = await openSession();
  try {
    // The fail-closed case: whatever the work looks like, a runtime that
    // cannot run the worker module must run in-process and must say so.
    const incapable = await evalList(
      session,
      [
        "_n = make_schedule(64, float(1000000),",
        "                   worker_capability=False, cpu_count=8)",
        "[int(_n.workers), int(_n.slice_count)]",
      ].join("\n"),
    );
    assert.deepEqual(incapable, [1, 64]);
    assert.equal(await evalRepr(session, "_n.mode"), "'sequential'");
    assert.equal(
      await evalRepr(session, "_n.reason"),
      "'worker-capability-unavailable'",
    );

    // Capability outranks every other gate, including the single-CPU one.
    assert.equal(
      await evalRepr(
        session,
        [
          "make_schedule(64, float(1000000), worker_capability=False,",
          "              cpu_count=1).reason",
        ].join("\n"),
      ),
      "'worker-capability-unavailable'",
    );

    // A single CPU is its own, distinct reason.
    assert.equal(
      await evalRepr(
        session,
        [
          "make_schedule(64, float(1000000), worker_capability=True,",
          "              cpu_count=1).reason",
        ].join("\n"),
      ),
      "'single-cpu'",
    );

    // The probe itself must never raise; it answers True or False.
    assert.ok(
      ["True", "False"].includes(
        await evalRepr(session, "probe_worker_capability()"),
      ),
      "probe_worker_capability must return a bool rather than raising",
    );
  } finally {
    await session.close();
  }
});

test("make_schedule rejects malformed work descriptions", async () => {
  const session = await openSession();
  try {
    const cases = [
      ["make_schedule(-1, float(1000))", "slice count"],
      ["make_schedule(4, float('nan'))", "finite"],
      ["make_schedule(4, float('inf'))", "finite"],
      ["make_schedule(4, float(-1))", "negative"],
      ["make_schedule(4, float(1000), cpu_count=0)", "CPU count"],
      ["make_schedule(4, float(1000), max_workers=0)", "max_workers"],
    ];
    for (const [code, fragment] of cases) {
      const message = await messageFromRaise(session, code, "ValueError");
      assert.ok(
        message.includes(fragment),
        `${code} should name "${fragment}", said: ${message}`,
      );
    }

    // NaN is rejected rather than propagated: it compares false against
    // every threshold, so a silently accepted NaN prediction would sail
    // past the gates and select parallel execution for no work at all.
    const nanMessage = await messageFromRaise(
      session,
      "make_schedule(64, float('nan'), worker_capability=True, cpu_count=8)",
      "ValueError",
    );
    assert.ok(nanMessage.includes("finite"), nanMessage);
  } finally {
    await session.close();
  }
});

test("slice_indices tiles its range exactly at every size", async () => {
  const session = await openSession();
  try {
    // A property check rather than a table: for every total in 0..40 and
    // every slice count in 1..12, the blocks must
    //   * number exactly slice_count,
    //   * be ascending and contiguous, starting at 0 and ending at total,
    //   * concatenate to exactly range(total) with no gap and no overlap,
    //   * differ in length by at most one.
    // Any failure is reported with the (total, slice_count) that produced it.
    const failures = await evalRepr(
      session,
      [
        "_failures = []",
        "for _total in range(0, 41):",
        "    for _parts in range(1, 13):",
        "        _blocks = slice_indices(_total, _parts)",
        "        _why = None",
        "        if len(_blocks) != _parts:",
        "            _why = 'wrong block count'",
        "        else:",
        "            _covered = []",
        "            _cursor = 0",
        "            for _begin, _end in _blocks:",
        "                if _begin != _cursor or _end < _begin:",
        "                    _why = 'not contiguous'",
        "                    break",
        "                _covered.extend(range(_begin, _end))",
        "                _cursor = _end",
        "            if _why is None and _cursor != _total:",
        "                _why = 'does not reach total'",
        "            if _why is None and _covered != list(range(_total)):",
        "                _why = 'coverage mismatch'",
        "            if _why is None:",
        "                _lengths = [_e - _b for _b, _e in _blocks]",
        "                if max(_lengths) - min(_lengths) > 1:",
        "                    _why = 'unbalanced by more than one'",
        "        if _why is not None:",
        "            _failures.append((_total, _parts, _why))",
        "_failures[:5]",
      ].join("\n"),
    );
    assert.equal(
      failures,
      "[]",
      `slice_indices violated its partition contract: ${failures}`,
    );

    // The documented shapes, spelled out.
    assert.deepEqual(
      await evalList(session, "[list(p) for p in slice_indices(10, 3)]"),
      [[0, 4], [4, 7], [7, 10]],
      "the first total % slice_count blocks are the long ones",
    );
    assert.deepEqual(
      await evalList(session, "[list(p) for p in slice_indices(2, 5)]"),
      [[0, 1], [1, 2], [2, 2], [2, 2], [2, 2]],
      "surplus blocks are empty and equal to (total, total)",
    );
    assert.deepEqual(
      await evalList(session, "[list(p) for p in slice_indices(0, 2)]"),
      [[0, 0], [0, 0]],
    );

    // The partition depends only on its two arguments, which is what lets
    // two processes decide it independently and agree.
    assert.ok(
      await evalBool(session, "slice_indices(37, 7) == slice_indices(37, 7)"),
      "slice_indices must be a pure function of (total, slice_count)",
    );

    const message = await messageFromRaise(
      session,
      "slice_indices(5, 0)",
      "ValueError",
    );
    assert.ok(message.includes("slice count"), message);
    const negative = await messageFromRaise(
      session,
      "slice_indices(-1, 2)",
      "ValueError",
    );
    assert.ok(negative.includes("total"), negative);
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("inverted bounds are rejected by every entry point", async () => {
  const session = await openSurfaceSession();
  try {
    const inverted = "[(float(1), float(-1))]";

    const de = await messageFromRaise(
      session,
      `differential_evolution(constant_objective, ${inverted})`,
      "ValueError",
    );
    assert.ok(
      de.includes("low <= high") || de.includes("0"),
      `differential_evolution should name the offending index: ${de}`,
    );

    const sa = await messageFromRaise(
      session,
      `simulated_annealing(constant_objective, ${inverted})`,
      "ValueError",
    );
    assert.ok(sa.includes("upper") || sa.includes("exceed"), sa);

    const rs = await messageFromRaise(
      session,
      `random_search(constant_objective, ${inverted})`,
      "ValueError",
    );
    assert.ok(rs.includes("low <= high"), rs);

    const nm = await messageFromRaise(
      session,
      "nminimize(constant_objective, [('x', float(1), float(-1))])",
      "ValueError",
    );
    assert.ok(
      nm.includes("inverted") && nm.includes("x"),
      `nminimize should name the variable: ${nm}`,
    );

    // A second dimension being fine must not mask a bad first one, and the
    // reported index must be the bad one.
    const second = await messageFromRaise(
      session,
      [
        "differential_evolution(",
        "    constant_objective,",
        "    [(float(-1), float(1)), (float(3), float(2))],",
        ")",
      ].join("\n"),
      "ValueError",
    );
    assert.ok(second.includes("1"), `expected index 1 to be named: ${second}`);
  } finally {
    await session.close();
  }
});

test("a degenerate bound pins its coordinate", async () => {
  const session = await openSurfaceSession();
  try {
    // low == high is legal and fixes that variable for the whole run. The
    // objective is x^2 + y^2 with x pinned at 2, so the reachable minimum
    // is exactly 4 and the first coordinate must never move.
    const pinned = await evalList(
      session,
      [
        "_box = [(float(2), float(2)), (float(-5), float(5))]",
        "_de = differential_evolution(",
        "    lambda v: float(v[0]) * float(v[0]) + float(v[1]) * float(v[1]),",
        "    _box, max_iterations=60,",
        ")",
        "_sa = simulated_annealing(",
        "    lambda v: float(v[0]) * float(v[0]) + float(v[1]) * float(v[1]),",
        "    _box, max_iterations=60,",
        ")",
        "_rs = random_search(",
        "    lambda v: float(v[0]) * float(v[0]) + float(v[1]) * float(v[1]),",
        "    _box, search_points=8,",
        ")",
        "[float(_de.x[0]), float(_sa.x[0]), float(_rs.x[0]),",
        " float(_de.fun), float(_sa.fun), float(_rs.fun)]",
      ].join("\n"),
    );
    const [dex, sax, rsx, def, saf, rsf] = pinned;
    assert.equal(dex, 2, "differential_evolution moved a pinned coordinate");
    assert.equal(sax, 2, "simulated_annealing moved a pinned coordinate");
    assert.equal(rsx, 2, "random_search moved a pinned coordinate");

    // The reachable optimum is 4; no method may report anything below it.
    for (const [name, value] of [
      ["differential_evolution", def],
      ["simulated_annealing", saf],
      ["random_search", rsf],
    ]) {
      assert.ok(
        value >= 4 - 1e-9,
        `${name} reported ${value}, below the pinned optimum of 4`,
      );
    }

    // random_search runs a genuine local solve, so it must also get close.
    assert.ok(rsf <= 4 + 1e-6, `random_search reported ${rsf}, expected ~4`);

    // Every dimension pinned: nothing to search, and the answer is the
    // single feasible point.
    const frozen = await evalList(
      session,
      [
        "_all = differential_evolution(",
        "    lambda v: float(v[0]) + float(v[1]),",
        "    [(float(1), float(1)), (float(2), float(2))],",
        "    max_iterations=10,",
        ")",
        "[float(_all.x[0]), float(_all.x[1]), float(_all.fun)]",
      ].join("\n"),
    );
    assert.deepEqual(frozen, [1, 2, 3]);
  } finally {
    await session.close();
  }
});

test("one-dimensional problems work through every method", async () => {
  const session = await openSurfaceSession();
  try {
    // d = 1 through the multivariate path: the box has a single pair, the
    // returned point has a single coordinate, and (x - 1)^2 has its
    // minimum 0 at x = 1 inside [-5, 5].
    const oneD = await evalList(
      session,
      [
        "_box = [(float(-5), float(5))]",
        "_f = lambda v: (float(v[0]) - _ONE) * (float(v[0]) - _ONE)",
        "_de = differential_evolution(_f, _box, max_iterations=200,",
        "                             tolerance=float(1e-10))",
        "_sa = simulated_annealing(_f, _box, max_iterations=200,",
        "                          search_points=20)",
        "_rs = random_search(_f, _box, search_points=10,",
        "                    tolerance=float(1e-10))",
        "[int(len(_de.x)), int(len(_sa.x)), int(len(_rs.x)),",
        " float(_de.fun), float(_sa.fun), float(_rs.fun)]",
      ].join("\n"),
    );
    const [dn, sn, rn, def, saf, rsf] = oneD;
    assert.deepEqual([dn, sn, rn], [1, 1, 1], "d = 1 must give one coordinate");

    // random_search runs a real local solve from each start, so it should
    // land on the minimum to solver precision.
    assert.ok(rsf <= 1e-12, `random_search on d=1 returned ${rsf}`);
    // The two population methods only have to get into the right basin of a
    // convex parabola on [-5, 5].
    assert.ok(def <= 1e-2, `differential_evolution on d=1 returned ${def}`);
    assert.ok(saf <= 1e-2, `simulated_annealing on d=1 returned ${saf}`);
  } finally {
    await session.close();
  }
});

test("a constant objective terminates and reports the constant", async () => {
  const session = await openSurfaceSession();
  try {
    // Every point is optimal, so nothing can ever improve. The requirement
    // is termination inside the stated budget with the constant reported,
    // not any particular point.
    const started = Date.now();
    const constants = await evalList(
      session,
      [
        "_de = differential_evolution(constant_objective, SQUARE_BOX,",
        "                             max_iterations=50)",
        "_sa = simulated_annealing(constant_objective, SQUARE_BOX,",
        "                          max_iterations=50)",
        "_rs = random_search(constant_objective, SQUARE_BOX, search_points=6)",
        "[float(_de.fun), float(_sa.fun), float(_rs.fun),",
        " int(_de.iterations), int(_sa.iterations), int(_rs.iterations)]",
      ].join("\n"),
    );
    assert.ok(
      Date.now() - started < 60000,
      "a constant objective must terminate promptly, not spin",
    );
    assert.deepEqual(
      constants.slice(0, 3),
      [7, 7, 7],
      "each method must report the constant value it was handed",
    );

    // Budgets are respected: no method may exceed the iterations it was given.
    assert.ok(constants[3] >= 1 && constants[3] <= 50, `${constants[3]}`);
    assert.ok(constants[4] >= 1 && constants[4] <= 50, `${constants[4]}`);
    assert.equal(constants[5], 6, "random_search counts one solve per start");

    // Differential evolution's convergence test is exactly satisfied here --
    // nothing changes, so the gap really is zero -- and this is the one
    // objective for which stopping immediately is correct.
    assert.ok(await evalBool(session, "_de.converged"));
    assert.equal(await evalRepr(session, "_de.flag"), "'converged'");
  } finally {
    await session.close();
  }
});

test("a NaN objective is never accepted as an improvement", async () => {
  const session = await openSurfaceSession();
  try {
    // Half the plane is NaN, the other half is a bowl with its minimum at
    // the origin. A method that treated NaN as "better than everything"
    // would settle in the left half and report NaN; a method that treated
    // one NaN as fatal would never reach the bowl at all.
    const survived = await evalList(
      session,
      [
        "_de = differential_evolution(half_nan, SQUARE_BOX,",
        "                             max_iterations=60)",
        "_sa = simulated_annealing(half_nan, SQUARE_BOX, max_iterations=100)",
        "_rs = random_search(half_nan, SQUARE_BOX, search_points=20)",
        "[int(math.isnan(_de.fun)), int(math.isnan(_sa.fun)),",
        " int(math.isnan(_rs.fun)),",
        " int(float(_de.x[0]) >= _ZERO), int(float(_sa.x[0]) >= _ZERO),",
        " int(float(_rs.x[0]) >= _ZERO)]",
      ].join("\n"),
    );
    assert.deepEqual(
      survived,
      [0, 0, 0, 1, 1, 1],
      "no method may return a NaN value or a point taken from the NaN half " +
        "plane when a finite region was available",
    );

    // An objective that is NaN everywhere leaves nothing to accept. The
    // contract is that this reports non-convergence rather than raising,
    // and never claims a NaN as a converged minimum.
    const hopeless = await evalList(
      session,
      [
        "_dn = differential_evolution(always_nan, SQUARE_BOX,",
        "                             max_iterations=20)",
        "_sn = simulated_annealing(always_nan, SQUARE_BOX, max_iterations=20)",
        "_rn = random_search(always_nan, SQUARE_BOX, search_points=6)",
        "[int(bool(_dn.converged)), int(bool(_sn.converged)),",
        " int(bool(_rn.converged)),",
        " int(math.isnan(_dn.fun)), int(math.isnan(_sn.fun)),",
        " int(math.isnan(_rn.fun) or math.isinf(_rn.fun))]",
      ].join("\n"),
    );
    assert.deepEqual(
      hopeless,
      [0, 0, 0, 1, 1, 1],
      "an everywhere-NaN objective must report failure, not a converged " +
        "NaN minimum",
    );
    assert.equal(
      await evalRepr(session, "_rn.flag"),
      "'no-feasible-minimum'",
      "random_search names the no-feasible-minimum outcome",
    );
  } finally {
    await session.close();
  }
});

// ---------------------------------------------------------------------------
// The NMinimize surface
// ---------------------------------------------------------------------------

test("NMinimize without bounds searches the documented default region", async () => {
  const session = await openSurfaceSession();
  try {
    // Wolfram's documented default initial region for a bare variable is
    // -1 <= x <= 1. `DifferentialEvolution` clips every candidate back into
    // that region, so minimizing (x - 5)^2 with no bounds must stop at the
    // region's upper edge, x = 1, f = 16 -- and (x + 5)^2 must stop at the
    // lower edge. Anything else means the region is not -1..1.
    const edges = await evalList(
      session,
      [
        "_up = nminimize(lambda v: (float(v[0]) - float(5)) ** 2, ['x'],",
        "                method='DifferentialEvolution')",
        "_down = nminimize(lambda v: (float(v[0]) + float(5)) ** 2, ['x'],",
        "                  method='DifferentialEvolution')",
        "[float(_up.x[0]), float(_up.fun),",
        " float(_down.x[0]), float(_down.fun)]",
      ].join("\n"),
    );
    const [upX, upF, downX, downF] = edges;
    assert.ok(
      Math.abs(upX - 1) <= 1e-9,
      `the default region's upper edge should be 1, got ${upX}`,
    );
    assert.ok(
      Math.abs(upF - 16) <= 1e-7,
      `(1 - 5)^2 = 16, got ${upF}`,
    );
    assert.ok(
      Math.abs(downX + 1) <= 1e-9,
      `the default region's lower edge should be -1, got ${downX}`,
    );
    assert.ok(Math.abs(downF - 16) <= 1e-7, `(-1 + 5)^2 = 16, got ${downF}`);

    // A minimum that lies inside the default region is found normally.
    const inside = await evalFloat(
      session,
      [
        "float(nminimize(",
        "    lambda v: (float(v[0]) - float(1) / float(2)) ** 2, ['x'],",
        ").fun)",
      ].join("\n"),
    );
    assert.ok(inside <= 1e-8, `a minimum at x = 1/2 was missed: ${inside}`);

    // An explicit `bounds` argument replaces the region taken from the
    // variables, and a (variable, low, high) triple sets it directly.
    const overridden = await evalList(
      session,
      [
        "_b = nminimize(lambda v: (float(v[0]) - float(5)) ** 2, ['x'],",
        "               bounds=[(float(0), float(10))],",
        "               method='RandomSearch')",
        "_t = nminimize(lambda v: (float(v[0]) - float(5)) ** 2,",
        "               [('x', float(0), float(10))],",
        "               method='RandomSearch')",
        "[float(_b.fun), float(_t.fun)]",
      ].join("\n"),
    );
    assert.ok(
      overridden[0] <= 1e-8,
      `an explicit bounds override was ignored: ${overridden[0]}`,
    );
    assert.ok(
      overridden[1] <= 1e-8,
      `a (variable, low, high) region was ignored: ${overridden[1]}`,
    );
  } finally {
    await session.close();
  }
});

test("NMaximize is exactly the negation of NMinimize", async () => {
  const session = await openSurfaceSession();
  try {
    // maximize=True must minimize -f and then report f's own value, so
    // maximizing g and minimizing -g have to agree exactly: same seed, same
    // method, same random draws, one sign flip at each end.
    const agreement = await evalList(
      session,
      [
        "_g = lambda v: -(float(v[0]) - float(1) / float(3)) ** 2 + _TWO",
        "_mx = nminimize(_g, [('x', float(-2), float(2))],",
        "                method='RandomSearch', maximize=True, seed=5)",
        "_mn = nminimize(lambda v: -_g(v), [('x', float(-2), float(2))],",
        "                method='RandomSearch', seed=5)",
        "[int(_mx.fun == -_mn.fun), int(list(_mx.x) == list(_mn.x)),",
        " float(_mx.fun), float(_mn.fun)]",
      ].join("\n"),
    );
    assert.equal(
      agreement[0],
      1,
      `NMaximize gave ${agreement[2]} where -NMinimize gave ${-agreement[3]}`,
    );
    assert.equal(
      agreement[1],
      1,
      "the two runs must visit exactly the same points",
    );

    // The maximum of 2 - (x - 1/3)^2 on [-2, 2] is 2 at x = 1/3.
    assert.ok(
      Math.abs(agreement[2] - 2) <= 1e-6,
      `the maximum should be 2, got ${agreement[2]}`,
    );
  } finally {
    await session.close();
  }
});

test("a constraint pushes the optimum into the feasible region", async () => {
  const session = await openSurfaceSession();
  try {
    // The unconstrained minimum of x^2 is 0 at the origin; the constraint
    // x >= 2 moves it to the boundary, f = 4 at x = 2. This is the whole
    // point of the penalty transformation: the answer must MOVE, and it
    // must move to the constrained optimum rather than merely somewhere
    // feasible.
    const constrained = await evalList(
      session,
      [
        "_square = lambda v: float(v[0]) * float(v[0])",
        "_c = nminimize(_square, [('x', float(-5), float(5))],",
        "               constraints=[inequality(lambda v: float(v[0]) - _TWO)],",
        "               method='RandomSearch')",
        "[float(_c.fun), float(_c.x[0]), int(bool(_c.converged))]",
      ].join("\n"),
    );
    const [value, point, converged] = constrained;

    // Tolerance defaults to 0.001 and the penalty weight is
    // penalty_scale / tolerance^2, so the accepted violation is of order
    // the tolerance; 1e-2 on the value at f'(2) = 4 is the matching band.
    assert.ok(
      Math.abs(value - 4) <= 1e-2,
      `the constrained minimum of x^2 subject to x >= 2 is 4, got ${value}`,
    );
    assert.ok(
      point >= 2 - 1e-3,
      `the answer ${point} violates x >= 2 by more than the tolerance`,
    );
    assert.equal(converged, 1, "a feasible answer must report convergence");

    // An equality constraint: min x^2 + y^2 on x + y = 2 is 2 at (1, 1).
    const equality = await evalList(
      session,
      [
        "_bowl = lambda v: float(v[0]) ** 2 + float(v[1]) ** 2",
        "_line = lambda v: float(v[0]) + float(v[1]) - _TWO",
        "_e = nminimize(_bowl,",
        "               [('x', float(-5), float(5)), ('y', float(-5), float(5))],",
        "               constraints=[equality(_line)],",
        "               method='RandomSearch')",
        "[float(_e.fun), float(_e.x[0]) + float(_e.x[1])]",
      ].join("\n"),
    );
    assert.ok(
      Math.abs(equality[0] - 2) <= 1e-2,
      `min x^2+y^2 on x+y=2 is 2, got ${equality[0]}`,
    );
    assert.ok(
      Math.abs(equality[1] - 2) <= 1e-2,
      `the answer misses the constraint surface: x+y = ${equality[1]}`,
    );

    // A bare callable is read as the inequality g(x) >= 0, giving the same
    // answer as the explicit spelling.
    const bare = await evalFloat(
      session,
      [
        "float(nminimize(_square, [('x', float(-5), float(5))],",
        "                constraints=[lambda v: float(v[0]) - _TWO],",
        "                method='RandomSearch').fun)",
      ].join("\n"),
    );
    assert.equal(bare, value, "a bare callable must mean g(x) >= 0");

    // Mutually contradictory constraints cannot be satisfied. The contract
    // is to report the true objective value at the best point found, flag
    // the answer infeasible and refuse to call it converged -- not to raise
    // and not to pretend.
    const infeasible = await evalList(
      session,
      [
        "_bad = nminimize(",
        "    _square, [('x', float(-1), float(1))],",
        "    constraints=[",
        "        inequality(lambda v: float(v[0]) - _TEN),",
        "        inequality(lambda v: -float(v[0]) - _TEN),",
        "    ],",
        "    method='RandomSearch',",
        ")",
        "[int(bool(_bad.converged)), int(_bad.flag.endswith(':infeasible'))]",
      ].join("\n"),
    );
    assert.deepEqual(
      infeasible,
      [0, 1],
      "an infeasible problem must be flagged infeasible and not converged",
    );
  } finally {
    await session.close();
  }
});

test("the global entry points reject bad types, sizes and containers", async () => {
  const session = await openSurfaceSession();
  try {
    // Empty containers.
    for (const [code, name] of [
      ["differential_evolution(constant_objective, [])", "differential_evolution"],
      ["simulated_annealing(constant_objective, [])", "simulated_annealing"],
      ["random_search(constant_objective, [])", "random_search"],
    ]) {
      const message = await messageFromRaise(session, code, "ValueError");
      assert.ok(
        message.toLowerCase().includes("bounds"),
        `${name} should name the empty bounds: ${message}`,
      );
    }
    const noVariables = await messageFromRaise(
      session,
      "nminimize(constant_objective, [])",
      "ValueError",
    );
    assert.ok(noVariables.includes("variable"), noVariables);

    // Non-finite bounds cannot define a sampling box.
    const infinite = await messageFromRaise(
      session,
      [
        "differential_evolution(constant_objective,",
        "                       [(float('-inf'), float('inf'))])",
      ].join("\n"),
      "ValueError",
    );
    assert.ok(infinite.includes("finite"), infinite);

    // Population and start-count arguments are shape arguments: a bad one
    // is rejected by name rather than silently coerced.
    const tooSmall = await messageFromRaise(
      session,
      "differential_evolution(constant_objective, SQUARE_BOX, search_points=3)",
      "ValueError",
    );
    assert.ok(
      tooSmall.includes("3") && tooSmall.includes("4"),
      `DE/rand/1/bin needs four members; the message must say so: ${tooSmall}`,
    );
    const zeroStarts = await messageFromRaise(
      session,
      "random_search(constant_objective, SQUARE_BOX, search_points=0)",
      "ValueError",
    );
    assert.ok(zeroStarts.includes("at least 1"), zeroStarts);
    const fractional = await messageFromRaise(
      session,
      "random_search(constant_objective, SQUARE_BOX, search_points=float(2.5))",
      "ValueError",
    );
    assert.ok(fractional.includes("integer"), fractional);

    // A supplied initial point must match the dimension of the box.
    const wrongArity = await messageFromRaise(
      session,
      [
        "random_search(constant_objective, SQUARE_BOX,",
        "              initial_points=[[_ZERO]])",
      ].join("\n"),
      "ValueError",
    );
    assert.ok(wrongArity.includes("length"), wrongArity);

    // nminimize's own surface: bounds of the wrong length, an unknown
    // method, an unknown method sub-option, sub-options with no method, and
    // a constraint that is neither a Constraint nor a callable.
    const wrongBounds = await messageFromRaise(
      session,
      "nminimize(constant_objective, ['x', 'y'], bounds=[(float(0), float(1))])",
      "ValueError",
    );
    assert.ok(wrongBounds.includes("2"), wrongBounds);

    const unknownMethod = await messageFromRaise(
      session,
      "nminimize(constant_objective, ['x'], method='Telepathy')",
      "ValueError",
    );
    assert.ok(unknownMethod.includes("Telepathy"), unknownMethod);

    const unknownOption = await messageFromRaise(
      session,
      [
        "nminimize(constant_objective, ['x'],",
        "          method='DifferentialEvolution',",
        "          method_options={'Nope': 1})",
      ].join("\n"),
      "ValueError",
    );
    assert.ok(unknownOption.includes("Nope"), unknownOption);

    const optionsWithoutMethod = await messageFromRaise(
      session,
      [
        "nminimize(constant_objective, ['x'],",
        "          method_options={'ScalingFactor': float(1)})",
      ].join("\n"),
      "ValueError",
    );
    assert.ok(optionsWithoutMethod.includes("Automatic"), optionsWithoutMethod);

    const badConstraint = await messageFromRaise(
      session,
      "nminimize(constant_objective, ['x'], constraints=[42])",
      "TypeError",
    );
    assert.ok(
      badConstraint.includes("Constraint") || badConstraint.includes("callable"),
      badConstraint,
    );

    const badDomain = await messageFromRaise(
      session,
      "nminimize(constant_objective, [('x', float(0), float(1), 'Rationals')])",
      "ValueError",
    );
    assert.ok(badDomain.includes("Rationals"), badDomain);
  } finally {
    await session.close();
  }
});
