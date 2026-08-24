// sagejs-test-tier: integration
"use strict";

// The Wolfram curve-fitting head, `FindFit`, the last of the thirteen
// numeric heads in Wolfram's Optimization guide. Unlike the twelve heads
// covered by test/optimization-find.cjs and test/optimization-global.cjs,
// `FindFit` is `FindFit[data, expr, pars, vars]` -- four arguments, not an
// objective and a variable specification -- and its answer is a bare list
// of rules, not the `{fmin, {rules}}` pair every other head returns.
//
// Every case here goes through the Wolfram frontend rather than calling
// `wolfram.find_fit` directly, for the same reason test/optimization-find.cjs
// gives: the lowering itself -- `FindFit` getting its own `findFitCall`
// instead of `optimizationCall`'s two-argument shape -- is half of what this
// layer adds, and calling the Python entry point would not exercise it.
//
// TOLERANCE POLICY
// Every case below fits exact (noise-free) data generated from known true
// parameters with Levenberg-Marquardt, which for a well-posed linear or
// mildly nonlinear model on exact data converges to the true parameters far
// inside 1e-6; that is the tolerance used throughout.

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

/**
 * Parse `FindFit`'s bare `{a -> value, ...}` repr, `[["a", value], ...]`
 * once quotes are normalized, into a plain `{name: value}` map. Unlike
 * `NMinimize`/`FindMinimum`'s `{fmin, {rules}}`, there is no outer pair to
 * unwrap -- the whole repr is the rule list.
 */
function rules(repr) {
  const parsed = JSON.parse(repr.replace(/'/g, '"'));
  const result = {};
  for (const [name, value] of parsed) result[name] = value;
  return { parsed, result };
}

test("FindFit recovers a linear model from {{x,y},...} pairs", async () => {
  // Data shape 1: pairs, one independent variable. Exact data for y = 2x+1.
  const { result } = rules(
    await wolfram(
      "FindFit[{{0,1},{1,3},{2,5},{3,7}}, a*x+b, {a,b}, x]",
    ),
  );
  assert.ok(Math.abs(result.a - 2) < 1e-6, `a ${result.a}`);
  assert.ok(Math.abs(result.b - 1) < 1e-6, `b ${result.b}`);
});

test("FindFit recovers a two-variable model from {{x,y,f},...} rows", async () => {
  // Data shape 2: rows with several independent variables, dependent value
  // last. Also the multi-variable-model case: `vars` names two variables,
  // not one. Exact data for f = 2u + 3v + 1.
  const { result } = rules(
    await wolfram(
      "FindFit[{{0,0,1},{1,0,3},{0,1,4},{1,1,6}}, " +
        "a*u+b*v+c, {a,b,c}, {u,v}]",
    ),
  );
  assert.ok(Math.abs(result.a - 2) < 1e-6, `a ${result.a}`);
  assert.ok(Math.abs(result.b - 3) < 1e-6, `b ${result.b}`);
  assert.ok(Math.abs(result.c - 1) < 1e-6, `c ${result.c}`);
});

test("FindFit recovers a linear model from bare values with implicit abscissae", async () => {
  // Data shape 3: `{y1,y2,...}` with the abscissae implicit, 1, 2, 3, ....
  // This is the shape that is easy to get wrong -- `sage_api.find_fit`
  // itself has no notion of it, so `_fit_data_table` has to synthesize the
  // `{{1,y1},{2,y2},...}` table before the request ever reaches it. Exact
  // data for y = 2x+1 at x = 1, 2, 3, 4.
  const { result } = rules(
    await wolfram("FindFit[{3,5,7,9}, m*x+c, {m,c}, x]"),
  );
  assert.ok(Math.abs(result.m - 2) < 1e-6, `m ${result.m}`);
  assert.ok(Math.abs(result.c - 1) < 1e-6, `c ${result.c}`);
});

test("FindFit honors explicit starting values for the parameters", async () => {
  // `pars` as `{{a, a0}, {b, b0}}`, with starting values well away from the
  // true a = 2, b = 0.5 used to generate the data below, so this only
  // passes if the starting values were actually threaded through to the
  // solver rather than silently defaulting to Wolfram's `1`.
  const trueA = 2;
  const trueB = 0.5;
  const points = [0, 1, 2, 3, 4];
  const data = points
    .map((x) => `{${x},${trueA * Math.exp(trueB * x)}}`)
    .join(",");
  const { result } = rules(
    await wolfram(
      `FindFit[{${data}}, a*Exp[b*x], {{a,5},{b,0.1}}, x]`,
    ),
  );
  assert.ok(Math.abs(result.a - trueA) < 1e-5, `a ${result.a}`);
  assert.ok(Math.abs(result.b - trueB) < 1e-5, `b ${result.b}`);
});

test("FindFit returns a bare list of rules, not the {fmin, rules} pair", async () => {
  // The one head in this module whose answer shape differs from every
  // other numeric head: no residual, just the fitted parameters. A
  // `{fmin, {rules}}` answer would parse with `parsed[0]` a number and
  // `parsed[1]` the rule list; here the whole thing is the rule list, so
  // `parsed[0]` is itself a `["a", value]` pair.
  const { parsed } = rules(
    await wolfram("FindFit[{{0,1},{1,3},{2,5},{3,7}}, a*x+b, {a,b}, x]"),
  );
  assert.equal(parsed.length, 2, "one rule per parameter, no extra element");
  for (const rule of parsed) {
    assert.equal(rule.length, 2, "each rule is a two-element [name, value]");
    assert.equal(typeof rule[0], "string", "rule name");
    assert.equal(typeof rule[1], "number", "rule value");
  }
});

test("FindFit rejects malformed data by name", async () => {
  // Empty data cannot be a two dimensional table; the message is
  // `sage_api.find_fit`'s own, propagated rather than replaced.
  await assert.rejects(
    () => wolfram("FindFit[{}, a*x+b, {a,b}, x]"),
    /two dimensional/,
  );
});

test("FindFit rejects a parameter that does not occur in the model", async () => {
  // `c` is not in `a*x+b`; there is no way for the data to constrain it, so
  // this is refused by name rather than fit with a zero derivative.
  await assert.rejects(
    () => wolfram("FindFit[{{0,1},{1,3}}, a*x+b, {a,b,c}, x]"),
    /FindFit parameter 'c' does not occur in the model/,
  );
});

test("FindFit options are refused by name, with a reason", async () => {
  // `sage_api.find_fit` has one fixed engine and no method to select --
  // unlike every other optimization head, `FindFit` has no Python-side
  // escape hatch for `Method` at all, so it is declined rather than
  // silently accepted.
  assert.throws(
    () =>
      frontend.lower(
        'FindFit[{{0,1},{1,3}}, a*x+b, {a,b}, x, Method -> "LevenbergMarquardt"]',
        { captureResult: true },
      ),
    /FindFit's Method option is not supported: .*no method to select/,
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

test("FindFit requires all four arguments", async () => {
  assert.throws(
    () => frontend.lower("FindFit[{{0,1},{1,3}}, a*x+b, {a,b}]", {
      captureResult: true,
    }),
    /FindFit requires data, a model, the fit parameters/,
  );
});
