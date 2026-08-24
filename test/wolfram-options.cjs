// sagejs-test-tier: integration
"use strict";

// Wolfram options for the thirteen optimization heads: `Method -> "Name"`,
// `Method -> {"Name", "Sub" -> value, ...}`, `MaxIterations -> n`, and the
// options that must be refused rather than silently accepted or dropped.
// Before this suite, trailing `Rule` arguments on these heads were a syntax
// error -- see the comment above `OPTIMIZATION_HEADS` in
// tools/wolfram/frontend.ts for why plot options alone used to be the only
// place `->` lowered at all.
//
// Every positive case below checks that an option actually changed the
// engine's behavior, not merely that it parsed -- an option that lowers but
// is ignored downstream is the failure mode this suite exists to catch.

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

/** Parse an `{fmin, {x -> xmin, ...}}` repr into `{fmin, rules: {name: value}}`. */
function extremum(repr) {
  const parsed = JSON.parse(repr.replace(/'/g, '"'));
  const [fmin, ruleList] = parsed;
  const rules = {};
  for (const [name, value] of ruleList) rules[name] = value;
  return { fmin, rules };
}

// ---------------------------------------------------------------------
// Method as a bare string
// ---------------------------------------------------------------------

test("Method -> \"Name\" reaches the engine: a declined name is refused by its own reason", async () => {
  // `nminimize.py`'s `_REJECTED_METHODS` names solvers this package does not
  // link. Getting exactly this Python-side message back proves the string
  // in `Method -> "Convex"` traveled all the way to that table -- an
  // ignored option could never produce it, since the run would just fall
  // back to `Automatic` instead of raising.
  await assert.rejects(
    () => wolfram('NMinimize[x^2, {x, -1, 1}, Method -> "Convex"]'),
    /NMinimize method 'Convex' is a third-party or convex-only solver/,
  );
});

test("Method -> \"Name\" reaches the engine: MaxIterations -> 1 visibly truncates NelderMead", async () => {
  // Same problem, same explicit method, only the iteration budget differs.
  // `nminimize`'s `NelderMead` path is deterministic (its initial simplex
  // comes from the region alone, not from `seed`), so this is not flaky.
  const truncated = extremum(
    await wolfram(
      'NMinimize[(x-0.5)^2+(y+0.3)^2, {x,y}, Method -> "NelderMead", MaxIterations -> 1]',
    ),
  );
  const converged = extremum(
    await wolfram(
      'NMinimize[(x-0.5)^2+(y+0.3)^2, {x,y}, Method -> "NelderMead"]',
    ),
  );
  const errorAt = (point) =>
    Math.hypot(point.rules.x - 0.5, point.rules.y + 0.3);
  assert.ok(
    errorAt(converged) < 1e-3,
    `full run should reach the minimum, error ${errorAt(converged)}`,
  );
  assert.ok(
    errorAt(truncated) > 10 * errorAt(converged),
    `one iteration should be far less precise: truncated ${
      errorAt(truncated)
    } vs converged ${errorAt(converged)}`,
  );
});

test("FindMinimum's Method -> \"Name\" reaches the engine: a declined name is refused by its own reason", async () => {
  // `findminimum.py`'s `_DECLINED_METHODS`, the same table
  // `findminimum._DECLINED_METHODS` documents for `FindMinimum` itself.
  await assert.rejects(
    () => wolfram('FindMinimum[x^2, {x, 1}, Method -> "Gradient"]'),
    /Method 'Gradient' is not supported: steepest descent is not implemented/,
  );
});

test("FindMinimum's MaxIterations -> 1 visibly truncates the search", async () => {
  // A quartic well off its minimum: one QuasiNewton step from `x = 0`
  // cannot reach the true minimum at `x = 3`, but the full run converges
  // tightly.
  const truncated = extremum(
    await wolfram('FindMinimum[(x-3)^4+(x-3)^2, {x, 0}, MaxIterations -> 1]'),
  );
  const converged = extremum(
    await wolfram('FindMinimum[(x-3)^4+(x-3)^2, {x, 0}]'),
  );
  assert.ok(
    Math.abs(converged.rules.x - 3) < 1e-4,
    `full run should reach x = 3, got ${converged.rules.x}`,
  );
  assert.ok(
    Math.abs(truncated.rules.x - 3) > 0.1,
    `one iteration should still be far from x = 3, got ${truncated.rules.x}`,
  );
});

// ---------------------------------------------------------------------
// Method with sub-options -- Wolfram's method-with-suboptions form
// ---------------------------------------------------------------------

test("Method -> {\"Name\", \"Sub\" -> value} reaches method_options, not just method", async () => {
  // `"PostProcess"` toggles `nminimize`'s local COBYLA polish, which
  // tightens the answer to `0.01 * tolerance` instead of leaving it at the
  // heuristic's own `tolerance`. Turning it off should visibly loosen the
  // precision of the very same deterministic `NelderMead` run.
  const polished = extremum(
    await wolfram(
      'NMinimize[(x-0.5)^2+(y+0.3)^2, {x,y}, ' +
        'Method -> {"NelderMead", "PostProcess" -> True}]',
    ),
  );
  const unpolished = extremum(
    await wolfram(
      'NMinimize[(x-0.5)^2+(y+0.3)^2, {x,y}, ' +
        'Method -> {"NelderMead", "PostProcess" -> False}]',
    ),
  );
  const errorAt = (point) =>
    Math.hypot(point.rules.x - 0.5, point.rules.y + 0.3);
  assert.ok(
    errorAt(polished) < 1e-4,
    `polished run should be tight, error ${errorAt(polished)}`,
  );
  assert.ok(
    errorAt(unpolished) > 10 * errorAt(polished),
    `unpolished run should be looser: unpolished ${
      errorAt(unpolished)
    } vs polished ${errorAt(polished)}`,
  );
});

test("Method sub-options are refused for the local Find* family", async () => {
  // `wolfram.find_minimum` takes no `method_options` keyword; the global
  // `N*` family's `method_options` dict has nowhere to go for `Find*`.
  assert.throws(
    () =>
      frontend.lower(
        'FindMinimum[x^2, {x, 1}, Method -> {"Newton", "StepControl" -> "LineSearch"}]',
        { captureResult: true },
      ),
    /FindMinimum does not support Method sub-options/,
  );
});

// ---------------------------------------------------------------------
// Unknown and declined options
// ---------------------------------------------------------------------

test("an unrecognized option is refused, naming the option and the head", async () => {
  assert.throws(
    () =>
      frontend.lower('NMinimize[x^2, {x, -1, 1}, Frobnicate -> True]', {
        captureResult: true,
      }),
    /NMinimize does not support the option Frobnicate/,
  );
});

test("WorkingPrecision is declined by name with its reason, on a global and a local head", async () => {
  // This package is IEEE double throughout; honoring a different working
  // precision would be a lie about what actually ran.
  assert.throws(
    () =>
      frontend.lower('NMinimize[x^2, {x, -1, 1}, WorkingPrecision -> 30]', {
        captureResult: true,
      }),
    /NMinimize's WorkingPrecision option is not supported: .*IEEE double/,
  );
  assert.throws(
    () =>
      frontend.lower('FindMinimum[x^2, {x, 1}, WorkingPrecision -> 30]', {
        captureResult: true,
      }),
    /FindMinimum's WorkingPrecision option is not supported: .*IEEE double/,
  );
});

test("AccuracyGoal and PrecisionGoal are declined rather than approximated", async () => {
  // Both would need a faithful mapping onto `tolerance=`; this package's
  // `tolerance` already conflates constraint-feasibility slack and solver
  // convergence, so an approximate digit-to-tolerance formula would be
  // worse than declining.
  assert.throws(
    () =>
      frontend.lower('NMinimize[x^2, {x, -1, 1}, AccuracyGoal -> 10]', {
        captureResult: true,
      }),
    /NMinimize's AccuracyGoal option is not supported: no faithful mapping/,
  );
  assert.throws(
    () =>
      frontend.lower('NMinimize[x^2, {x, -1, 1}, PrecisionGoal -> 10]', {
        captureResult: true,
      }),
    /NMinimize's PrecisionGoal option is not supported: no faithful mapping/,
  );
});

test("Compiled, StepMonitor and EvaluationMonitor are declined on every head", async () => {
  for (const option of ["Compiled -> True", "StepMonitor :> Print[x]", "EvaluationMonitor :> Print[x]"]) {
    const name = option.split(" ")[0];
    assert.throws(
      () =>
        frontend.lower(`NMinimize[x^2, {x, -1, 1}, ${option}]`, {
          captureResult: true,
        }),
      new RegExp(`NMinimize's ${name} option is not supported`),
      option,
    );
  }
});

test("Gradient is declined for the local Find* family", async () => {
  // `wolfram.find_minimum` computes the gradient itself from a symbolic
  // objective and takes no keyword for a caller-supplied one.
  assert.throws(
    () =>
      frontend.lower('FindMinimum[x^2, {x, 1}, Gradient -> {2*x}]', {
        captureResult: true,
      }),
    /FindMinimum's Gradient option is not supported/,
  );
});

// ---------------------------------------------------------------------
// FindFit -- every option declines, it has no keyword surface at all
// ---------------------------------------------------------------------

test("FindFit declines MaxIterations: sage_api.find_fit takes no such keyword", async () => {
  assert.throws(
    () =>
      frontend.lower(
        'FindFit[{{0,1},{1,3}}, a*x+b, {a,b}, x, MaxIterations -> 10]',
        { captureResult: true },
      ),
    /FindFit's MaxIterations option is not supported: sage_api\.find_fit takes no/,
  );
});

test("FindFit declines NormFunction and Weights: no such parameter exists", async () => {
  assert.throws(
    () =>
      frontend.lower(
        'FindFit[{{0,1},{1,3}}, a*x+b, {a,b}, x, NormFunction -> Norm]',
        { captureResult: true },
      ),
    /FindFit's NormFunction option is not supported/,
  );
  assert.throws(
    () =>
      frontend.lower(
        'FindFit[{{0,1},{1,3}}, a*x+b, {a,b}, x, Weights -> {1,1}]',
        { captureResult: true },
      ),
    /FindFit's Weights option is not supported/,
  );
});

test("an unrecognized FindFit option is refused, naming the option", async () => {
  assert.throws(
    () =>
      frontend.lower(
        'FindFit[{{0,1},{1,3}}, a*x+b, {a,b}, x, Frobnicate -> True]',
        { captureResult: true },
      ),
    /FindFit does not support the option Frobnicate/,
  );
});

// ---------------------------------------------------------------------
// Regression: plot options must keep lowering exactly as before
// ---------------------------------------------------------------------

test("plot and graphics options still lower through optionRecords, unaffected", async () => {
  const lowering = frontend.lower(
    'Plot[Sin[x], {x, 0, 1}, PlotStyle -> Red, PlotLegends :> {"sine"}]',
    { captureResult: true },
  );
  assert.match(lowering.source, /_wolfram\.PlotCall\(/);
  assert.match(lowering.source, /"name": "PlotStyle"/);
  assert.match(lowering.source, /"rule": "Rule"/);
  assert.match(lowering.source, /"rule": "RuleDelayed"/);
  assert.doesNotMatch(lowering.source, /method=/);

  assert.doesNotThrow(() =>
    frontend.lower('Graphics[{Circle[]}, Axes -> True, PlotRange -> All]', {
      captureResult: true,
    })
  );
});
