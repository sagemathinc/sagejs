// sagejs-test-tier: integration
"use strict";

// The Wolfram *local* optimization surface: `FindMinimum`, `FindMaximum`,
// and the four extremal-value and argument heads beside them. The global
// `N*` family is covered by test/optimization-global.cjs; this suite is
// about the half that starts from a point and walks downhill.
//
// Every case here goes through the Wolfram frontend rather than calling
// `wolfram.find_minimum` directly, because half of what this layer adds is
// the lowering: the heads have to be registered, and the variable
// specification has to be read the way `FindMinimum` reads it rather than
// the way `NMinimize` does. Calling the Python entry point would not
// exercise either.
//
// TOLERANCE POLICY
// These are deterministic local methods on smooth objectives with known
// exact answers, so the assertions can be tight. Coordinates are checked to
// 1e-6 and values to 1e-9 unless a comment says why a case is looser.

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

/** Lower one line of Wolfram source and evaluate it, returning the value. */
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

test("FindMinimum walks downhill to the exact minimum of a parabola", async () => {
  const { value, rules } = extremum(await wolfram("FindMinimum[(x-3)^2, {x, 0}]"));
  assert.ok(Math.abs(value) < 1e-9, `value ${value}`);
  assert.ok(Math.abs(rules.x - 3) < 1e-6, `x ${rules.x}`);
});

test("FindMinimum handles several variables from a list of starts", async () => {
  const { value, rules } = extremum(
    await wolfram("FindMinimum[(x-3)^2+(y+1)^2, {{x,0},{y,0}}]"),
  );
  assert.ok(Math.abs(value) < 1e-9, `value ${value}`);
  assert.ok(Math.abs(rules.x - 3) < 1e-6, `x ${rules.x}`);
  assert.ok(Math.abs(rules.y + 1) < 1e-6, `y ${rules.y}`);
});

test("a bare variable list starts every variable at zero", async () => {
  // `{x, y}` is two variables to `FindMinimum` exactly as it is to
  // `NMinimize`; only `{x, 1}` differs between them. This is the case that
  // would break if the head-aware disambiguation were wrong in the
  // direction of treating every two-element list as one specification.
  const { rules } = extremum(
    await wolfram("FindMinimum[(x-3)^2+(y+1)^2, {x, y}]"),
  );
  assert.ok(Math.abs(rules.x - 3) < 1e-6, `x ${rules.x}`);
  assert.ok(Math.abs(rules.y + 1) < 1e-6, `y ${rules.y}`);
});

test("FindMaximum reports a maximum of zero as zero, not negative zero", async () => {
  // The engine maximizes by minimizing `-objective`, which lands on `-0.0`
  // here. Wolfram prints `0.`; `findminimum` normalizes it.
  const repr = await wolfram("FindMaximum[-(x-2)^2, {x, 0}]");
  assert.doesNotMatch(repr, /-0\.0/, repr);
  const { value, rules } = extremum(repr);
  assert.ok(Math.abs(value) < 1e-9, `value ${value}`);
  assert.ok(Math.abs(rules.x - 2) < 1e-6, `x ${rules.x}`);
});

test("a starting point selects which local minimum is found", async () => {
  // This is the whole difference between the local and global families:
  // `x^4 - 8x^2` has minima near -2 and +2, and `FindMinimum` reports
  // whichever one it starts nearest. `NMinimize` would search the region.
  const left = extremum(await wolfram("FindMinimum[x^4-8*x^2, {x, -1}]"));
  const right = extremum(await wolfram("FindMinimum[x^4-8*x^2, {x, 1}]"));
  assert.ok(left.rules.x < 0, `left ${left.rules.x}`);
  assert.ok(right.rules.x > 0, `right ${right.rules.x}`);
  assert.ok(Math.abs(left.value - right.value) < 1e-9, "the two wells are equal");
});

test("bounds confine the search to the box", async () => {
  // Unconstrained the minimum is at 3; the box stops it at its own edge,
  // where the value is (1-3)^2 = 4 exactly.
  const { value, rules } = extremum(
    await wolfram("FindMinimum[(x-3)^2, {x, 0, -1, 1}]"),
  );
  assert.ok(Math.abs(rules.x - 1) < 1e-6, `x ${rules.x}`);
  assert.ok(Math.abs(value - 4) < 1e-9, `value ${value}`);
});

test("the {f, cons} pair pushes FindMinimum off the unconstrained optimum", async () => {
  // Unconstrained, (x-3)^2 from x=0 walks all the way to x=3, value 0 (see
  // "FindMinimum walks downhill..." above). The constraint `x <= 1` is
  // active here -- it stops the walk at its own boundary, where the value
  // is (1-3)^2 = 4, not at the unconstrained answer.
  //
  // The constrained engine is COBYLA (see findminimum.py's module
  // docstring), a derivative-free method with a looser notion of
  // convergence than the gradient-based methods this file otherwise
  // checks to 1e-6/1e-9, so the tolerance here is looser too, matching
  // what test/optimization-constrained.cjs already uses for COBYLA.
  const { value, rules } = extremum(
    await wolfram("FindMinimum[{(x-3)^2, x <= 1}, {x, 0}]"),
  );
  assert.ok(Math.abs(rules.x - 1) < 1e-4, `x ${rules.x}`);
  assert.ok(Math.abs(value - 4) < 1e-3, `value ${value}`);
});

test("the {f, cons} pair pushes FindMaximum off the unconstrained optimum", async () => {
  // Unconstrained, -(x-2)^2 from x=0 walks to x=2, value 0 (see "FindMaximum
  // reports a maximum of zero..." above). The constraint `x <= 1` stops it
  // at x=1, where the value is -(1-2)^2 = -1.
  const { value, rules } = extremum(
    await wolfram("FindMaximum[{-(x-2)^2, x <= 1}, {x, 0}]"),
  );
  assert.ok(Math.abs(rules.x - 1) < 1e-4, `x ${rules.x}`);
  assert.ok(Math.abs(value + 1) < 1e-3, `value ${value}`);
});

test("a malformed {f, cons} pair is refused by name", async () => {
  // Only the two-element pair {f, cons} is documented; a third element has
  // nowhere to go and is rejected rather than silently read as more
  // constraints or dropped.
  await assert.rejects(
    () => wolfram("FindMinimum[{(x-1)^2, x >= 0, x <= 1}, {x, 0}]"),
    /FindMinimum takes either an objective or the pair \{f, cons\}/,
  );
});

test("the value and argument heads agree with FindMinimum", async () => {
  const full = extremum(await wolfram("FindMinimum[(x-3)^2+1, {x, 0}]"));
  const value = JSON.parse(await wolfram("FindMinValue[(x-3)^2+1, {x, 0}]"));
  const argument = JSON.parse(await wolfram("FindArgMin[(x-3)^2+1, {x, 0}]"));
  assert.equal(value, full.value);
  assert.deepEqual(argument, [full.rules.x]);
});

test("the maximizing value and argument heads agree with FindMaximum", async () => {
  const full = extremum(await wolfram("FindMaximum[3-(x-2)^2, {x, 0}]"));
  const value = JSON.parse(await wolfram("FindMaxValue[3-(x-2)^2, {x, 0}]"));
  const argument = JSON.parse(await wolfram("FindArgMax[3-(x-2)^2, {x, 0}]"));
  assert.equal(value, full.value);
  assert.deepEqual(argument, [full.rules.x]);
  assert.ok(Math.abs(full.value - 3) < 1e-9, `value ${full.value}`);
});

test("NMinimize still reads its second argument as a region", async () => {
  // The head-aware split must not have changed the global family: `{x,a,b}`
  // is still one variable searched over `[a, b]`, not three variables.
  const { rules } = extremum(await wolfram("NMinimize[(x-3)^2, {x, -5, 5}]"));
  assert.equal(Object.keys(rules).length, 1);
  assert.ok(Math.abs(rules.x - 3) < 1e-4, `x ${rules.x}`);
});

test("Wolfram's two-starting-value form is refused by name", async () => {
  // `{x, x0, x1}` is documented, and no solver reached from here takes two
  // starting points. It is rejected rather than silently dropping `x1`.
  await assert.rejects(
    () => wolfram("FindMinimum[(x-1)^2, {x, 0, 1}]"),
    /two-starting-value form/,
  );
});

test("every Find head is registered in the frontend", async () => {
  // A head missing from OPTIMIZATION_HEADS does not fail loudly: it lowers
  // to a plain Sage name and dies as an undefined symbol, so this checks
  // the registration directly.
  for (const head of [
    "FindMinimum",
    "FindMaximum",
    "FindMinValue",
    "FindMaxValue",
    "FindArgMin",
    "FindArgMax",
  ]) {
    const lowering = frontend.lower(`${head}[(x-1)^2, {x, 0}]`, {
      captureResult: true,
    });
    assert.match(lowering.source, new RegExp(`_wolfram\\.${head}\\(`), head);
  }
});

test("options are still refused, naming the head that refused them", async () => {
  // Rule lowering is deliberately not part of this layer. The refusal has
  // to name the head so the message is actionable.
  assert.throws(
    () => frontend.lower('FindMinimum[(x-1)^2, {x, 0}, Method -> "Newton"]', {
      captureResult: true,
    }),
    /FindMinimum options are not supported yet/,
  );
});
