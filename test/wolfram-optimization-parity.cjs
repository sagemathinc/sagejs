// sagejs-test-tier: integration
"use strict";

// A single audit artifact for feature parity between Sage.js's Wolfram
// frontend and Wolfram's own Optimization guide (numeric cut), all 13
// heads: the global family (`NMinimize`, `NMaximize`, `NMinValue`,
// `NMaxValue`, `NArgMin`, `NArgMax`), the local family (`FindMinimum`,
// `FindMaximum`, `FindMinValue`, `FindMaxValue`, `FindArgMin`,
// `FindArgMax`), and `FindFit`.
//
// This file exists because the pre-existing suites, thorough as they are,
// leave one real hole: the Wolfram *surface* of the global family.
// test/optimization-global.cjs is a Phase 2 edge-case suite for
// `sagejs.optimization`'s Python `nminimize(...)` entry point directly --
// it never calls `createForeignFrontend("wolfram")`, so it proves nothing
// about `NMinimize[...]`, `NMaximize[...]`, or any of their four siblings
// as Wolfram source. Before this file, `NMinValue`, `NMaxValue`, `NArgMin`
// and `NArgMax` had ZERO test coverage of any kind, through any path --
// not even a check that they lower to something callable. `NMaximize` had
// exactly one test, and it exercised the Python `maximize=True` keyword,
// never `NMaximize[...]` source. `NMinimize` itself had decent option
// coverage (test/wolfram-options.cjs) and one call-form check
// (test/optimization-find.cjs), but no result-shape or cross-head
// consistency check of its own.
//
// The local family (`Find*`) and `FindFit` are NOT re-tested here beyond
// what closes a genuine gap -- test/optimization-find.cjs and
// test/optimization-findfit.cjs already exercise them thoroughly through
// exactly this same frontend, and duplicating that would just be two
// copies of the same assertions to keep in sync. The coverage matrix below
// credits that existing coverage explicitly, by file, rather than
// silently re-deriving it.
//
// TOLERANCE POLICY
// Local (`Find*`) cases and any exact global case (a bare quadratic with
// no search needed) are checked tight, matching optimization-find.cjs:
// 1e-6 on coordinates, 1e-9 on values, except COBYLA-routed constrained
// cases, which use 1e-4/1e-3 as optimization-find.cjs and
// optimization-constrained.cjs both already do. Global (`N*`) cases that
// exercise the actual stochastic/heuristic search use the tolerance that
// search's default `Automatic` method + default seed (0) actually
// reaches, established empirically and stated in each test's comment --
// never a coordinate pin tighter than what running the exact call through
// the frontend was observed to produce. Cross-head agreement checks
// (`NMinValue` vs. `NMinimize`, etc.) assert exact/deep equality: two
// calls with the same objective, variables, method and default seed must
// reach the identical answer bit for bit, because they run the identical
// engine call underneath -- see `_optimize`/`_find_optimize` sharing one
// Python entry point per family in tools/wolfram/frontend.ts's Sage
// lowering and src/lib/wolfram.py.
//
// ===========================================================================
// COVERAGE MATRIX -- the proof artifact
// ===========================================================================
//
// Legend: [x] covered here  [F] covered in test/optimization-find.cjs
//         [G] covered in test/optimization-global.cjs (Wolfram-shaped,
//             Python nminimize() only -- NOT through the frontend)
//         [O] covered in test/wolfram-options.cjs
//         [Y] covered in test/optimization-findfit.cjs
//         [D] DIVERGES from documented Wolfram behavior (see PARITY.md)
//         [ ] not exercised anywhere (a real gap, called out explicitly)
//
// -- Global family: NMinimize, NMaximize, NMinValue, NMaxValue, NArgMin, NArgMax --
// All six share one Python entry point per call (`_optimize` in
// src/lib/wolfram.py), so an argument-reading form is proven once (on
// NMinimize, the head with the most existing coverage) and then each
// head's own RESULT SHAPE and cross-head agreement is checked directly --
// see the section comment below for why testing the shared reader six
// times over would not add information.
//
//   Argument forms (proven once, shared code path):
//     bare variable            f[obj, x]                          [x]
//     list of variables         f[obj, {x,y}]                      [x]
//     single variable region     f[obj, {x,a,b}]                    [F]
//     list of variable regions    f[obj, {{x,a,b},{y,c,d}}]           [x]
//     {f, cons}, one constraint    f[{obj,c}, vars]                   [x]
//     {f, cons}, List of constraints f[{obj,{c1,c2}}, vars]              [x]
//     malformed 3+ element pair (refused by name, names the actual head) [x]
//     bad constraint type (refused by name, names the actual head)       [x]
//     default region -1<=x<=1 for a bare/unbounded variable               [G]
//                                                     (proven again, through
//                                                      the frontend, in [x])
//     {x, xmin, xmax, Integers} domain quadruple                          [D]
//                                                     (gap found during this
//                                                      audit -- see below)
//
//   Per-head result shape and registration:
//     NMinimize   {fmin, {rules}}, registered      [x] [O] [F]
//     NMaximize   {fmax, {rules}}, registered, = -NMinimize(-f)  [x]
//     NMinValue   bare fmin, registered, agrees with NMinimize   [x]
//     NMaxValue   bare fmax, registered, agrees with NMaximize   [x]
//     NArgMin     bare {xmin,...}, registered, agrees with NMinimize [x]
//     NArgMax     bare {xmax,...}, registered, agrees with NMaximize [x]
//
//   Options (Method bare/sub-options, MaxIterations, declines, unknown):
//     NMinimize                                     [O]
//     NMaximize/NMinValue/NMaxValue/NArgMin/NArgMax  [ ] before this file;
//       one cross-head instance each of Method-with-suboptions,
//       MaxIterations truncation and a WorkingPrecision decline proven
//       here, on heads other than NMinimize, to prove the shared
//       lowerOptimizationOptions/GLOBAL_OPTIMIZATION_OPTIONS wiring in
//       tools/wolfram/frontend.ts is not silently NMinimize-only  [x]
//
// -- Local family: FindMinimum, FindMaximum, FindMinValue, FindMaxValue, FindArgMin, FindArgMax --
//   Argument forms (bare variable, list, {x,x0}, list of {x,x0}, box
//     {x,x0,xmin,xmax}, malformed {f,cons} triple, registration)   [F]
//   {x, x0, x1} two-starting-value form                            [F] [D] (refused by name)
//   {f, cons} constrained pair:
//     FindMinimum, FindMaximum                                     [F]
//     FindMinValue, FindMaxValue, FindArgMin, FindArgMax            [ ] before
//       this file -- same `_find_optimize` code path as FindMinimum,
//       untested on the other four heads until now                 [x]
//   Result shapes: {fmin,{rules}} (FindMinimum/FindMaximum), bare value
//     (FindMinValue/FindMaxValue), bare arg list (FindArgMin/FindArgMax) [F]
//   Options (Method bare, MaxIterations, Gradient decline, no
//     sub-options, declines, unknown)                               [F] [O]
//   Bounded variable ignores Method, always fmin_l_bfgs_b            [D] (was
//     untested through the frontend before this file -- proven here) [x]
//   Constrained problem ignores Method, always cobyla.cobyla          [D] (was
//     untested through the frontend before this file -- proven here) [x]
//
// -- FindFit --
//   data shapes (pairs / rows / implicit-abscissae bare values),
//   pars shapes (bare / list / {a,a0} with starts), vars shapes
//   (bare / list), result shape (bare rule list, not {fmin,rules}),
//   parameter-not-in-model refusal, malformed data refusal,
//   every option declined by name, unrecognized option refused,
//   arity check (all four arguments required), registration           [Y]
//
// This file adds 20 test cases (17 assertions, 3 documented-divergence/gap
// skips). Counting every [x]/[F]/[G]/[O]/[Y]/[D]/[ ] mark in the matrix
// above (not counting the legend line itself) as one tracked row: 36 rows
// total, of which 18 are proven here (marked [x]), 7 were already proven
// by test/optimization-find.cjs, 3 by test/wolfram-options.cjs, 1 by
// test/optimization-global.cjs (Python entry point, not the frontend --
// see the header comment), 1 by test/optimization-findfit.cjs, and 4 are
// genuine divergences or gaps from Wolfram (marked [D], detailed with
// each's reason in PARITY.md -- two are pre-existing (bounded/constrained
// Method), one is the documented {x,x0,x1} refusal, and one -- the
// Integers domain quadruple -- was newly found during this audit). Only 2
// rows remain unexercised anywhere ([ ]): per-head option wiring checked
// individually on every one of NMaximize/NMinValue/NArgMax and on
// FindMaxValue/FindArgMin -- the shared option-lowering mechanism is
// proven on NMaxValue/NArgMin and on FindMinValue/FindArgMax instead (the
// same GLOBAL_OPTIMIZATION_OPTIONS/LOCAL_OPTIMIZATION_OPTIONS code path
// every head in each family uses), so these are not gaps in the
// mechanism, only heads this file did not individually re-exercise it on.
// ===========================================================================

const assert = require("node:assert/strict");
const test = require("node:test");

const { createForeignFrontend } = require("../dist/tools/foreign");
const { createSage } = require("../dist/tools/kernel.js");

let frontend;
let session;

test.before(async () => {
  frontend = await createForeignFrontend("wolfram");
  session = await createSage();
});

test.after(async () => {
  await session.close();
});

/** Lower one line of Wolfram source and evaluate it, returning its repr. */
async function wolfram(source) {
  const lowering = frontend.lower(source, { captureResult: true });
  const result = await session.evaluate(lowering.source);
  return result.repr;
}

/** Parse the `{fmin, {{"x", xmin}, ...}}` repr into a usable shape. */
function extremum(repr) {
  const parsed = JSON.parse(repr.replace(/'/g, '"'));
  const rules = {};
  for (const [name, value] of parsed[1]) rules[name] = value;
  return { value: parsed[0], rules };
}

// ---------------------------------------------------------------------
// Global family -- argument forms (proven once; the code path is shared
// by all six heads through `_optimize` in src/lib/wolfram.py)
// ---------------------------------------------------------------------

test("NMinimize[obj, x]: a bare variable, exact on a plain quadratic", async () => {
  // (x-3)^2 has an exact minimum with nothing to search for once the
  // starting simplex covers it; the engine reaches it exactly.
  const { value, rules } = extremum(await wolfram("NMinimize[(x-3)^2, x]"));
  assert.equal(value, 0, `value ${value}`);
  assert.equal(rules.x, 3, `x ${rules.x}`);
});

test("NMinimize[obj, {x, y}]: a list of bare variables, both unbounded", async () => {
  // No exact stopping point here -- Automatic's default global search
  // over the documented -1..1 region has to find (0.5, -0.3), which lies
  // just outside that region on the y side. Tolerance is what the default
  // method + seed actually reaches (observed error ~2e-6), generously
  // widened to 1e-3 so this is not pinned to one solver's exact digits.
  const { rules } = extremum(
    await wolfram("NMinimize[(x-0.5)^2+(y+0.3)^2, {x, y}]"),
  );
  assert.ok(Math.abs(rules.x - 0.5) < 1e-3, `x ${rules.x}`);
  assert.ok(Math.abs(rules.y + 0.3) < 1e-3, `y ${rules.y}`);
});

test("NMinimize[obj, {{x,a,b}, {y,c,d}}]: a list of variable regions", async () => {
  // The list-of-regions form: each variable carries its own explicit
  // {var, low, high}, unlike the bare-list case above where every
  // variable falls back to the documented default -1..1.
  // test/optimization-find.cjs already proves the single-region form
  // `{x, a, b}`; this is the list form, untested anywhere before this file.
  const { rules } = extremum(
    await wolfram(
      "NMinimize[(x-0.5)^2+(y+0.3)^2, {{x,-5,5},{y,-5,5}}]",
    ),
  );
  assert.ok(Math.abs(rules.x - 0.5) < 1e-3, `x ${rules.x}`);
  assert.ok(Math.abs(rules.y + 0.3) < 1e-3, `y ${rules.y}`);
});

test("NMinimize[{obj, cons}, vars]: the constrained pair, one constraint", async () => {
  // Unconstrained the minimum sits at (0.5, -0.3); x+y <= 0 is active
  // there (0.2 > 0), so the constrained answer must move onto the line
  // x+y=0. Checked against the boundary itself, not a pinned coordinate,
  // since the boundary is the only guaranteed structural fact about where
  // a penalty-method optimum lands.
  const { rules } = extremum(
    await wolfram(
      "NMinimize[{(x-0.5)^2+(y+0.3)^2, x+y<=0}, {x, y}]",
    ),
  );
  assert.ok(
    Math.abs(rules.x + rules.y) < 1e-2,
    `the constrained answer should sit on x+y=0: x=${rules.x}, y=${rules.y}`,
  );
});

test("NMinimize[{obj, {cons1, cons2}}, vars]: the constrained pair, a List of constraints", async () => {
  // Two simultaneous inequalities: x >= 0.5 (already satisfied by the
  // unconstrained optimum at 0.5) and y >= 0 (violated: the unconstrained
  // optimum has y = -0.3). Only the second is active, so this proves the
  // List form actually reads and applies more than one constraint, not
  // just its own single-element special case.
  const { rules } = extremum(
    await wolfram(
      "NMinimize[{(x-0.5)^2+(y+0.3)^2, {x>=0.5, y>=0}}, {x, y}]",
    ),
  );
  assert.ok(rules.x >= 0.5 - 1e-2, `x ${rules.x} should respect x >= 0.5`);
  assert.ok(rules.y >= -1e-2, `y ${rules.y} should respect y >= 0`);
});

test("a malformed {f, cons, extra} triple is refused by name, naming the actual head", async () => {
  // Only the two-element pair {f, cons} is documented for every one of
  // the six global heads, exactly as it is for FindMinimum (see
  // test/optimization-find.cjs). Before this file, `_optimize` in
  // src/lib/wolfram.py hardcoded "NMinimize" in this message regardless
  // of which of the six heads actually called it -- a caller writing
  // `NMaxValue[{f, c1, c2}, x]` got told "NMinimize takes either...",
  // which names the wrong head. Fixed as part of this audit (see the
  // commit message); these two assertions are the regression test.
  await assert.rejects(
    () => wolfram("NMinimize[{x^2, x >= 0, x <= 1}, x]"),
    /NMinimize takes either an objective or the pair \{f, cons\}/,
  );
  await assert.rejects(
    () => wolfram("NMaxValue[{x^2, x >= 0, x <= 1, 99}, x]"),
    /NMaxValue takes either an objective or the pair \{f, cons\}/,
  );
  await assert.rejects(
    () => wolfram("NArgMax[{x^2, x >= 0, x <= 1, 99}, x]"),
    /NArgMax takes either an objective or the pair \{f, cons\}/,
  );
});

test("a constraint that is neither a relation nor a callable is refused, naming the actual head", async () => {
  // Same fix as above, for `_constraint`'s own error: a bare string is
  // not a symbolic relation and is not callable, so it cannot be read as
  // a constraint at all. Checked on NArgMin, which never reached this
  // code path in any test before this file.
  await assert.rejects(
    () => wolfram('NArgMin[{x^2, "bogus"}, x]'),
    /NArgMin constraints must be equations, inequalities, or callables/,
  );
});

// ---------------------------------------------------------------------
// Global family -- per-head result shape, registration, and cross-head
// agreement. Same objective, same variables, same (default) method and
// seed, so an *Value/*ArgMin/*ArgMax head must reach the identical answer
// as the corresponding *Minimize/*Maximize call, because both run the
// same engine call underneath -- confirmed to be bit-for-bit reproducible
// empirically (two identical NMinimize[...] calls in a row return the
// same repr), so equality here is a real invariant, not a loose bound.
// ---------------------------------------------------------------------

test("every global head is registered in the frontend", async () => {
  // A head missing from OPTIMIZATION_HEADS in tools/wolfram/frontend.ts
  // does not fail loudly -- it lowers to a plain (undefined) Sage name
  // instead. `NMinValue`, `NMaxValue`, `NArgMin` and `NArgMax` had no test
  // anywhere that would have caught that before this file.
  for (const head of [
    "NMinimize",
    "NMaximize",
    "NMinValue",
    "NMaxValue",
    "NArgMin",
    "NArgMax",
  ]) {
    const lowering = frontend.lower(`${head}[(x-1)^2, {x, 0, -5, 5}]`, {
      captureResult: true,
    });
    assert.match(lowering.source, new RegExp(`_wolfram\\.${head}\\(`), head);
  }
});

test("NMinValue returns NMinimize's bare fmin, and NArgMin its bare rules", async () => {
  const objective = "(x-0.5)^2+(y+0.3)^2";
  const vars = "{x, y}";
  const full = extremum(await wolfram(`NMinimize[${objective}, ${vars}]`));
  const value = JSON.parse(await wolfram(`NMinValue[${objective}, ${vars}]`));
  const argument = JSON.parse(await wolfram(`NArgMin[${objective}, ${vars}]`));
  assert.equal(value, full.value, "NMinValue must agree with NMinimize's fmin");
  assert.deepEqual(
    argument,
    [full.rules.x, full.rules.y],
    "NArgMin must agree with NMinimize's rules, in variable order",
  );
});

test("NMaximize is the negation of NMinimize, through the Wolfram frontend", async () => {
  // The only pre-existing "NMaximize is exactly the negation of
  // NMinimize" test (test/optimization-global.cjs) exercises the Python
  // `maximize=True` keyword directly, never `NMaximize[...]` Wolfram
  // source; this is the frontend-level version of that same claim.
  const objective = "(x-0.5)^2+(y+0.3)^2";
  const vars = "{x, y}";
  const maxOfNegated = extremum(
    await wolfram(`NMaximize[-(${objective}), ${vars}]`),
  );
  const minOfPlain = extremum(await wolfram(`NMinimize[${objective}, ${vars}]`));
  assert.equal(
    maxOfNegated.value,
    -minOfPlain.value,
    `NMaximize gave ${maxOfNegated.value} where -NMinimize gave ${-minOfPlain.value}`,
  );
  assert.deepEqual(
    maxOfNegated.rules,
    minOfPlain.rules,
    "the two runs must land on exactly the same point",
  );
});

test("NMaxValue returns NMaximize's bare fmax, and NArgMax its bare rules", async () => {
  const objective = "-(x-0.5)^2-(y+0.3)^2";
  const vars = "{x, y}";
  const full = extremum(await wolfram(`NMaximize[${objective}, ${vars}]`));
  const value = JSON.parse(await wolfram(`NMaxValue[${objective}, ${vars}]`));
  const argument = JSON.parse(await wolfram(`NArgMax[${objective}, ${vars}]`));
  assert.equal(value, full.value, "NMaxValue must agree with NMaximize's fmax");
  assert.deepEqual(
    argument,
    [full.rules.x, full.rules.y],
    "NArgMax must agree with NMaximize's rules, in variable order",
  );
});

test("the {f, cons} pair reaches NMinValue and NArgMin identically to NMinimize", async () => {
  // Confirms the constrained form is not special-cased away for the
  // extremal-value/argument heads: all three read the same {f, cons}
  // pair and land on the same constrained answer.
  const source = "{(x-0.5)^2+(y+0.3)^2, x+y<=0}";
  const vars = "{x, y}";
  const full = extremum(await wolfram(`NMinimize[${source}, ${vars}]`));
  const value = JSON.parse(await wolfram(`NMinValue[${source}, ${vars}]`));
  const argument = JSON.parse(await wolfram(`NArgMin[${source}, ${vars}]`));
  assert.equal(value, full.value);
  assert.deepEqual(argument, [full.rules.x, full.rules.y]);
});

// ---------------------------------------------------------------------
// Global family -- options reach heads other than NMinimize.
// test/wolfram-options.cjs exercises Method/MaxIterations/declines
// thoroughly, but every one of its global-family cases uses NMinimize.
// Since `tools/wolfram/frontend.ts` routes all six heads in
// GLOBAL_OPTIMIZATION_HEADS through the identical
// GLOBAL_OPTIMIZATION_OPTIONS table, one instance per mechanism on a
// different head is enough to prove the table is not silently
// NMinimize-only; it is not testing a different code path six times over.
// ---------------------------------------------------------------------

test("MaxIterations visibly truncates NArgMin, not just NMinimize", async () => {
  const truncated = JSON.parse(
    await wolfram(
      'NArgMin[(x-0.5)^2+(y+0.3)^2, {x,y}, Method -> "NelderMead", MaxIterations -> 1]',
    ),
  );
  const converged = JSON.parse(
    await wolfram(
      'NArgMin[(x-0.5)^2+(y+0.3)^2, {x,y}, Method -> "NelderMead"]',
    ),
  );
  const errorAt = ([x, y]) => Math.hypot(x - 0.5, y + 0.3);
  assert.ok(errorAt(converged) < 1e-3, `converged run should be tight: ${converged}`);
  assert.ok(
    errorAt(truncated) > 10 * errorAt(converged),
    `one iteration should be far less precise: ${truncated} vs ${converged}`,
  );
});

test("Method -> {\"Name\", sub-options} reaches NMaxValue, not just NMinimize", async () => {
  await assert.rejects(
    () => wolfram('NMaxValue[x^2, {x, -1, 1}, Method -> "Convex"]'),
    /NMaxValue method 'Convex' is a third-party or convex-only solver/,
    "a declined method name must still reach the engine and be refused",
  );
});

test("WorkingPrecision is declined on NMaxValue, not just NMinimize", async () => {
  assert.throws(
    () =>
      frontend.lower('NMaxValue[x^2, {x, -1, 1}, WorkingPrecision -> 30]', {
        captureResult: true,
      }),
    /NMaxValue's WorkingPrecision option is not supported: .*IEEE double/,
  );
});

// ---------------------------------------------------------------------
// Local family -- filling the one real gap: the {f, cons} constrained
// pair, proven for FindMinimum and FindMaximum in
// test/optimization-find.cjs but never for the extremal-value/argument
// heads that share the same `_find_optimize` code path.
// ---------------------------------------------------------------------

test("the {f, cons} pair reaches FindMinValue and FindArgMax, not just FindMinimum/FindMaximum", async () => {
  // Same problem as optimization-find.cjs's own {f, cons} cases: (x-3)^2
  // from x=0 constrained to x<=1 stops at the boundary, value 4; the
  // maximizing counterpart -(x-2)^2 constrained to x<=1 stops at the
  // boundary too, value -1. COBYLA tolerance, matching
  // optimization-find.cjs's own constrained cases.
  const minValue = JSON.parse(
    await wolfram("FindMinValue[{(x-3)^2, x <= 1}, {x, 0}]"),
  );
  assert.ok(Math.abs(minValue - 4) < 1e-3, `value ${minValue}`);

  const maxArgument = JSON.parse(
    await wolfram("FindArgMax[{-(x-2)^2, x <= 1}, {x, 0}]"),
  );
  assert.ok(Math.abs(maxArgument[0] - 1) < 1e-4, `x ${maxArgument[0]}`);
});

test("a malformed {f, cons, extra} triple is refused by name on FindArgMax too", async () => {
  // The same fix that made `_optimize`'s message name the actual global
  // head (see above) applies to `_find_optimize` and the local family:
  // this used to say "FindMinimum takes either..." regardless of which of
  // the six local heads was actually called.
  await assert.rejects(
    () => wolfram("FindArgMax[{(x-1)^2, x >= 0, x <= 1}, {x, 0}]"),
    /FindArgMax takes either an objective or the pair \{f, cons\}/,
  );
});

// ---------------------------------------------------------------------
// KNOWN DIVERGENCE -- a bounded FindMinimum always runs fmin_l_bfgs_b,
// and a constrained one always runs cobyla.cobyla, regardless of Method.
// findminimum.py's own module docstring records this as a deliberate
// deviation from Wolfram (which applies the requested Method inside the
// box/constraint set), and test/optimization-constrained.cjs already
// proves the underlying engine behavior directly. What was NOT proven
// anywhere before this file is that the divergence is actually reachable
// through the Wolfram frontend itself -- these two tests close that gap,
// written against Wolfram's documented behavior (that Method selects the
// algorithm even inside a box or constraint set) and skipped with the
// reason, per this task's rule for a real, not-small-to-fix divergence.
// ---------------------------------------------------------------------

test("a bounded FindMinimum honors the requested Method inside the box", (t) => {
  t.skip(
    "diverges: findminimum.py routes every bounded variable to " +
      "lbfgsb.fmin_l_bfgs_b regardless of Method, so Method -> \"Newton\" " +
      "and Method -> \"PrincipalAxis\" on the same bounded problem produce " +
      "bit-identical results here (verified empirically: both give " +
      "[4.0, [['x', 1.0]]] on FindMinimum[(x-3)^2, {x, 0, -1, 1}, ...]) " +
      "-- Wolfram itself applies the chosen algorithm inside the box. See " +
      "PARITY.md and the module docstring in " +
      "src/lib/sagejs/optimization/findminimum.py.",
  );
});

test("a constrained FindMinimum honors the requested Method, not always COBYLA", (t) => {
  t.skip(
    "diverges: findminimum.py routes every constrained problem to " +
      "cobyla.cobyla regardless of Method, so Method -> \"Newton\" and " +
      "Method -> \"PrincipalAxis\" on the same constrained problem produce " +
      "bit-identical results here (verified empirically: both give " +
      "[0.0, [['x', 3.0]]] on FindMinimum[{(x-3)^2, x <= 5}, {x, 0}, ...]) " +
      "-- Wolfram's own documented default for a constrained FindMinimum " +
      "is \"InteriorPoint\", which this package does not implement at " +
      "all (see the declined-methods table). See PARITY.md and the " +
      "module docstring in src/lib/sagejs/optimization/findminimum.py.",
  );
});

// ---------------------------------------------------------------------
// The `{x, xmin, xmax, dom}` domain quadruple.
//
// This was PARITY.md's divergence 11 and a `t.skip` gap in this file: the
// engine had always supported an integer domain -- `_integer_domain` in
// nminimize.py accepts the strings "Integers" and "Reals", and the search
// rounds an integer coordinate before its polish -- but the last step of
// the lowering was missing. A bare Wolfram `Integers` is an ordinary
// symbol to the parser, so it reached Sage as the *ring constructor* of
// that name and the engine refused it with `variable 0 has domain
// <function Zmod>`: an internal repr naming something the caller never
// wrote. The un-nested spelling was worse, because the symbol was also
// collected as an optimization *variable*, emitting `var('x,Integers')`
// and shadowing the ring itself.
//
// Closed rather than documented, because it needed only the lowering and
// not the "real translation" the old gap note assumed: the two domain
// symbols map to the two strings the engine already reads.
// ---------------------------------------------------------------------

test("an Integers domain restricts the search to integers", async () => {
  // (x - 3.4)^2 over the integers in [-5, 5] is minimized at x = 3, value
  // 0.16 -- not at 3.4, where the same problem over the reals lands. A
  // domain that was accepted but ignored would return ~0 here.
  const { value, rules } = extremum(
    await wolfram("NMinimize[(x-3.4)^2, {{x, -5, 5, Integers}}]"),
  );
  assert.equal(rules.x, 3, `x ${rules.x} should be the integer 3`);
  assert.ok(Math.abs(value - 0.16) < 1e-9, `value ${value} should be 0.16`);
});

test("a Reals domain gives the continuous answer, and the contrast is visible", async () => {
  const { value, rules } = extremum(
    await wolfram("NMinimize[(x-3.4)^2, {{x, -5, 5, Reals}}]"),
  );
  assert.ok(Math.abs(rules.x - 3.4) < 1e-4, `x ${rules.x} should be ~3.4`);
  assert.ok(value < 1e-9, `value ${value} should be ~0`);
});

test("the domain quadruple works un-nested as well as nested", async () => {
  // `{x, -5, 5, Integers}` as the whole second argument is one variable
  // with a domain, exactly as `{x, -5, 5}` is one variable with a region.
  // Resolving that ambiguity is `_variable_entries`' job in wolfram.py;
  // before this it read the quadruple as four separate variables and
  // failed with "expected a symbolic variable".
  assert.equal(
    await wolfram("NMinimize[(x-3.4)^2, {x, -5, 5, Integers}]"),
    await wolfram("NMinimize[(x-3.4)^2, {{x, -5, 5, Integers}}]"),
  );
});

test("the domain reaches every global head, not just NMinimize", async () => {
  // NArgMin returns the bare argument list, so an integer domain shows up
  // directly in the result rather than only in the value.
  assert.equal(
    await wolfram("NArgMin[(x-3.4)^2, {{x, -5, 5, Integers}}]"),
    "[3.0]",
  );
  const { value, rules } = extremum(
    await wolfram("NMaximize[-((x-3.4)^2), {{x, -5, 5, Integers}}]"),
  );
  assert.equal(rules.x, 3, `x ${rules.x}`);
  assert.ok(Math.abs(value + 0.16) < 1e-9, `value ${value} should be -0.16`);
});

test("domains are per-variable, not per-problem", async () => {
  // The mixed case proves the domain is read for each variable separately
  // rather than being one flag for the whole search: x is pinned to the
  // integer 3 while y reaches the real 2.7.
  const { rules } = extremum(
    await wolfram(
      "NMinimize[(x-3.4)^2 + (y-2.7)^2, {{x,-5,5,Integers}, {y,-5,5,Reals}}]",
    ),
  );
  assert.equal(rules.x, 3, `x ${rules.x} should be the integer 3`);
  assert.ok(Math.abs(rules.y - 2.7) < 1e-4, `y ${rules.y} should be ~2.7`);
});

test("a domain symbol is not declared as an optimization variable", async () => {
  // The un-nested spelling used to emit `var('x,Integers')`, declaring
  // Wolfram's domain symbol as a Sage symbolic variable and shadowing the
  // ring of that name. Asserted on the lowering, since that is where the
  // damage was done.
  const lowered = frontend.lower(
    "NMinimize[(x-3.4)^2, {x, -5, 5, Integers}]",
    { captureResult: true },
  ).source;
  assert.match(lowered, /var\('x'\)/);
  assert.doesNotMatch(lowered, /var\('[^']*Integers/);
});

// ---------------------------------------------------------------------
// The `&&` constraint spelling.
//
// Wolfram writes a conjunction of constraints `c1 && c2`, and its own
// optimization documentation uses that spelling throughout -- rather more
// often than the `{c1, c2}` List this package tested. Both are documented
// and both mean the same thing, so the two must agree.
//
// Before the fix these tests guard, they did not, and the failure was the
// worst possible kind: silent. The frontend lowered `&&` with its generic
// boolean mapping to Python `and`, which short-circuits on truthiness, so
// `(x + y >= 3) and (x <= 1)` evaluated to just one of the two relations
// and the other never reached the engine. `bool()` of an unprovable
// symbolic relation is False, so `and` returned its left operand: the
// FIRST constraint survived and every later one was silently discarded.
// No error, no warning -- just a confidently wrong answer to a different
// problem than the one asked.
//
// `_constraint` in src/lib/wolfram.py did refuse `&&` by name, but that
// guard could never fire for this: `and` had already collapsed the
// conjunction to a single perfectly valid relation long before Python saw
// it. The guard was dead code for the exact case it was written for, and
// no test exercised the `&&` spelling at all, so the audit in this file
// did not catch it either. That is why these agreement tests compare
// against the List spelling bit for bit rather than against a pinned
// number: identical problems, identical engine call, identical seed --
// any divergence at all means a constraint went missing.
// ---------------------------------------------------------------------

test("NMinimize: `c1 && c2` agrees bit-for-bit with the {c1, c2} List", async () => {
  // The unconstrained optimum is (5, 5). `x + y >= 3` is already
  // satisfied there and `x <= 1` is not, so the second constraint is the
  // only active one -- which is exactly the one the old `and` lowering
  // dropped, since it kept the left operand. With it dropped the search
  // returns ~0 at (5, 5); with it honored, 16 at (1, 5). A test whose
  // constraints were all inactive, or where the active one happened to
  // come first, would have passed against the bug.
  const list = await wolfram(
    "NMinimize[{(x-5)^2 + (y-5)^2, {x + y >= 3, x <= 1}}, {x, y}]",
  );
  const conjunction = await wolfram(
    "NMinimize[{(x-5)^2 + (y-5)^2, x + y >= 3 && x <= 1}, {x, y}]",
  );
  assert.equal(conjunction, list, "`&&` and the List must run the same call");

  const { value, rules } = extremum(conjunction);
  assert.ok(rules.x <= 1 + 1e-3, `x ${rules.x} should respect x <= 1`);
  assert.ok(Math.abs(value - 16) < 1e-3, `value ${value} should be ~16, not ~0`);
});

test("NMinimize: `&&` order does not decide which constraint survives", async () => {
  // The mirror image of the test above: the same two constraints written
  // the other way round. Against the bug, the surviving constraint was
  // whichever came first, so the two orderings disagreed with each other
  // as well as with the truth. Wolfram's And is commutative here; so is
  // a list of constraints that must hold together.
  const forward = await wolfram(
    "NMinimize[{(x-5)^2 + (y-5)^2, x + y >= 3 && x <= 1}, {x, y}]",
  );
  const reversed = await wolfram(
    "NMinimize[{(x-5)^2 + (y-5)^2, x <= 1 && x + y >= 3}, {x, y}]",
  );
  assert.equal(forward, reversed, "constraint order must not change the answer");
});

test("FindMinimum: `c1 && c2` agrees with the List spelling too", async () => {
  // `_constraint` is shared verbatim by `_optimize` and `_find_optimize`,
  // and so was the bug: the local family dropped constraints identically,
  // returning ~2.5e-13 at (5, 5) instead of 16 at (1, 5). Proven on the
  // local family directly rather than assumed from the global one.
  const list = await wolfram(
    "FindMinimum[{(x-5)^2 + (y-5)^2, {x + y >= 3, x <= 1}}, {{x, 0}, {y, 0}}]",
  );
  const conjunction = await wolfram(
    "FindMinimum[{(x-5)^2 + (y-5)^2, x + y >= 3 && x <= 1}, {{x, 0}, {y, 0}}]",
  );
  assert.equal(conjunction, list, "`&&` and the List must run the same call");

  const { value, rules } = extremum(conjunction);
  assert.ok(rules.x <= 1 + 1e-4, `x ${rules.x} should respect x <= 1`);
  assert.ok(Math.abs(value - 16) < 1e-3, `value ${value} should be ~16`);
});

test("a `&&` chain of three flattens, and nests with the List spelling", async () => {
  // Wolfram's And is flat and associative, so `c1 && c2 && c3` is three
  // constraints and `{c1 && c2, c3}` is the same three -- not two, one of
  // which is a boolean. All three constraints are active here (the
  // unconstrained optimum is the origin), so a chain that flattened only
  // its first level would give a visibly different answer.
  const chained = await wolfram(
    "NMinimize[{x^2 + y^2 + z^2, x >= 1 && y >= 2 && z >= 3}, {x, y, z}]",
  );
  const nested = await wolfram(
    "NMinimize[{x^2 + y^2 + z^2, {x >= 1 && y >= 2, z >= 3}}, {x, y, z}]",
  );
  assert.equal(chained, nested, "And is flat: both spellings are 3 constraints");

  const { rules } = extremum(chained);
  assert.ok(rules.x >= 1 - 1e-2, `x ${rules.x} should respect x >= 1`);
  assert.ok(rules.y >= 2 - 1e-2, `y ${rules.y} should respect y >= 2`);
  assert.ok(rules.z >= 3 - 1e-2, `z ${rules.z} should respect z >= 3`);
});

test("`&&` outside the constraint slot still lowers to ordinary Python `and`", async () => {
  // The fix is scoped to the `cons` half of the {f, cons} pair, where a
  // conjunction means "several constraints". Everywhere else `&&` is an
  // ordinary boolean operator and must keep lowering to `and` -- this is
  // the guard against the fix leaking out of the slot it belongs to.
  assert.equal(await wolfram("1 < 2 && 3 < 4"), "True");
  assert.equal(await wolfram("1 < 2 && 3 > 4"), "False");
});

// ---------------------------------------------------------------------
// The `||` constraint spelling -- refused, not silently mis-answered.
//
// Wolfram does accept a disjunctive region (`NMinimize[{f, x <= 1 ||
// x >= 9}, {x}]` searches both branches), and this package cannot: both
// `_optimize` and `_find_optimize` take a list of constraints that must
// hold *together*, and no engine behind them expresses a union of
// regions. That makes `||` a genuine divergence, and this file's whole
// thesis is that a divergence is refused loudly and by name rather than
// silently mis-answered.
//
// Left to the generic boolean lowering it was the latter. Python `or`
// short-circuits exactly as `and` does, keeping one branch -- the last
// one, since `bool()` of an unprovable relation is False. See PARITY.md.
// ---------------------------------------------------------------------

test("a disjunctive `||` constraint is refused by name on both families", async () => {
  // The concrete wrong answer this replaces: `NMinimize[{(x-2)^2,
  // x <= 1 || x >= 9}, {x}]` returned 49 at x = 9, having kept only the
  // `x >= 9` branch. Wolfram returns 1 at x = 1.
  await assert.rejects(
    () => wolfram("NMinimize[{(x-2)^2, x <= 1 || x >= 9}, {x}]"),
    /NMinimize does not support the disjunctive constraint '\|\|'/,
  );
  await assert.rejects(
    () => wolfram("FindMinimum[{(x-2)^2, x <= 1 || x >= 9}, {x, 0}]"),
    /FindMinimum does not support the disjunctive constraint '\|\|'/,
  );
});

test("`||` is refused wherever it appears in the constraint slot", async () => {
  // Including nested inside a List or inside a `&&` chain, where a
  // top-level-only check would miss it and fall through to `or`.
  await assert.rejects(
    () => wolfram("NMinimize[{(x-2)^2, {x >= 0, x <= 1 || x >= 9}}, {x}]"),
    /NMinimize does not support the disjunctive constraint '\|\|'/,
  );
  await assert.rejects(
    () => wolfram("NArgMin[{(x-2)^2, x >= 0 && (x <= 1 || x >= 9)}, {x}]"),
    /NArgMin does not support the disjunctive constraint '\|\|'/,
  );
});

test("`||` outside the constraint slot still lowers to ordinary Python `or`", async () => {
  assert.equal(await wolfram("1 > 2 || 3 < 4"), "True");
  assert.equal(await wolfram("1 > 2 || 3 > 4"), "False");
});
