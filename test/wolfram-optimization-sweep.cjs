// sagejs-test-tier: integration
"use strict";

// A differential sweep over the Wolfram optimization surface.
//
// The other suites in this family assert answers: given this call, expect
// that number. Those are only as good as the numbers someone thought to
// pin, and a wrong answer that nobody predicted looks exactly like a
// correct one. This suite asserts *equivalences* instead -- pairs of
// Wolfram sources that must produce identical results because they say the
// same thing -- which needs no oracle at all. Two spellings of one problem
// run the identical engine call with the identical default seed, so the
// answers must agree bit for bit; any divergence means the two spellings
// were not, in fact, lowered to the same problem.
//
// This is not a hypothetical technique. Every optimization bug found in
// this stack after the parity audit came out of exactly this comparison
// and none came from an assertion about a number:
//
//   * `{f, c1 && c2}` disagreed with `{f, {c1, c2}}` -- Python `and`
//     short-circuited and one constraint never reached the engine.
//   * `{f, c1 || c2}` disagreed with itself under reordering -- Python
//     `or` kept whichever branch came last.
//   * `{f, a <= x <= b}` crashed where `{f, {a <= x, x <= b}}` worked --
//     the chain lowered to a comparison against a boolean.
//   * `{x, a, b, Integers}` failed where `{{x, a, b, Integers}}` worked --
//     the un-nested quadruple was read as four separate variables.
//
// Each of those is now pinned by a named regression test elsewhere. What
// this file adds is the sweep itself, kept running: the same equivalences
// checked across every head, every constraint spelling and every variable
// spelling, so the *next* one of these is caught by CI rather than by
// someone happening to try the other spelling by hand.
//
// Tolerance policy: exact string equality on the result repr, deliberately.
// These are not two approximations of one answer that ought to be close --
// they are two spellings of one call, and this package's global search is
// bit-for-bit reproducible at a fixed seed (asserted directly in the
// determinism test at the end). Anything looser would have let the `&&`
// bug through, since a dropped constraint often lands "close enough".

const assert = require("node:assert/strict");
const test = require("node:test");

const { createForeignFrontend } = require("../dist/tools/foreign");
const { createSage } = require("../dist/tools/kernel.js");

const GLOBAL_HEADS = [
  "NMinimize",
  "NMaximize",
  "NMinValue",
  "NMaxValue",
  "NArgMin",
  "NArgMax",
];
const LOCAL_HEADS = [
  "FindMinimum",
  "FindMaximum",
  "FindMinValue",
  "FindMaxValue",
  "FindArgMin",
  "FindArgMax",
];
const ALL_HEADS = [...GLOBAL_HEADS, ...LOCAL_HEADS];

const isGlobal = (head) => GLOBAL_HEADS.includes(head);

let frontend;
let session;

test.before(async () => {
  frontend = await createForeignFrontend("wolfram");
  session = await createSage();
});

test.after(async () => {
  await session.close();
});

async function wolfram(source) {
  const lowering = frontend.lower(source, { captureResult: true });
  const result = await session.evaluate(lowering.source);
  return result.repr;
}

/**
 * Assert two Wolfram sources agree exactly, reporting both sources and
 * both results when they do not -- the whole point of a sweep is that the
 * failure tells you which pair diverged without further digging.
 */
async function agree(left, right, why) {
  const a = await wolfram(left);
  const b = await wolfram(right);
  assert.equal(
    a,
    b,
    `${why}\n  A: ${left}\n     ${a}\n  B: ${right}\n     ${b}`,
  );
}

// Three constrained problems, each with two constraints. The first has an
// active *second* constraint (the ordering that a left-biased
// short-circuit gets wrong), the second has both active, the third has an
// equality. `objective` is minimized far outside the feasible set in each,
// so a dropped constraint changes the answer visibly rather than landing
// somewhere harmlessly close.
const CONSTRAINED = [
  {
    objective: "(x-5)^2 + (y-5)^2",
    first: "x + y >= 3",
    second: "x <= 1",
    global: "{x, y}",
    local: "{{x,0},{y,0}}",
  },
  {
    objective: "x^2 + y^2",
    first: "x >= 1",
    second: "y >= 2",
    global: "{x, y}",
    local: "{{x,0},{y,0}}",
  },
  {
    objective: "(x-3)^2 + (y-4)^2",
    first: "x + y == 5",
    second: "x >= 0",
    global: "{x, y}",
    local: "{{x,1},{y,1}}",
  },
];

test("`&&` and the List spelling agree, on every head", async () => {
  for (const problem of CONSTRAINED) {
    for (const head of ALL_HEADS) {
      const vars = isGlobal(head) ? problem.global : problem.local;
      const { objective: f, first: c1, second: c2 } = problem;
      await agree(
        `${head}[{${f}, {${c1}, ${c2}}}, ${vars}]`,
        `${head}[{${f}, ${c1} && ${c2}}, ${vars}]`,
        "a conjunction must be the same problem as the List of its parts",
      );
    }
  }
});

test("constraint order does not change the answer, on every head", async () => {
  for (const problem of CONSTRAINED) {
    for (const head of ALL_HEADS) {
      const vars = isGlobal(head) ? problem.global : problem.local;
      const { objective: f, first: c1, second: c2 } = problem;
      await agree(
        `${head}[{${f}, {${c1}, ${c2}}}, ${vars}]`,
        `${head}[{${f}, {${c2}, ${c1}}}, ${vars}]`,
        "constraints hold together; their order is not information",
      );
      await agree(
        `${head}[{${f}, ${c1} && ${c2}}, ${vars}]`,
        `${head}[{${f}, ${c2} && ${c1}}, ${vars}]`,
        "And is commutative in Wolfram and must be here",
      );
    }
  }
});

test("nested and flattened constraint spellings agree, on every head", async () => {
  // Wolfram's And is flat and associative, so a conjunction inside a List
  // is not a boolean element of that List -- it is more constraints.
  for (const problem of CONSTRAINED) {
    for (const head of ALL_HEADS) {
      const vars = isGlobal(head) ? problem.global : problem.local;
      const { objective: f, first: c1, second: c2 } = problem;
      await agree(
        `${head}[{${f}, {${c1}, ${c2}}}, ${vars}]`,
        `${head}[{${f}, {${c1} && ${c2}}}, ${vars}]`,
        "a conjunction nested in a List is still its individual parts",
      );
    }
  }
});

test("a single constraint agrees with the one-element List, on every head", async () => {
  for (const head of ALL_HEADS) {
    const vars = isGlobal(head) ? "{x, y}" : "{{x,0},{y,0}}";
    await agree(
      `${head}[{x^2+y^2, x + y >= 3}, ${vars}]`,
      `${head}[{x^2+y^2, {x + y >= 3}}, ${vars}]`,
      "one constraint is one constraint either way",
    );
  }
});

test("a comparison chain agrees with its individual relations, on every head", async () => {
  // `a <= x <= b` is the spelling Wolfram's Constrained Optimization
  // tutorial uses to bound a variable. (x-9)^2 is minimized well outside
  // the bound, so a dropped half is visible in the answer.
  for (const head of ALL_HEADS) {
    const vars = isGlobal(head) ? "{x}" : "{x, 0}";
    await agree(
      `${head}[{(x-9)^2, -5 <= x <= 5}, ${vars}]`,
      `${head}[{(x-9)^2, {-5 <= x, x <= 5}}, ${vars}]`,
      "a bounding chain is two constraints",
    );
    await agree(
      `${head}[{(x-9)^2, 5 >= x >= -5}, ${vars}]`,
      `${head}[{(x-9)^2, {5 >= x, x >= -5}}, ${vars}]`,
      "the same bound written the other way round",
    );
  }
});

test("equivalent variable spellings agree, on every global head", async () => {
  for (const head of GLOBAL_HEADS) {
    await agree(
      `${head}[(x-0.4)^2, x]`,
      `${head}[(x-0.4)^2, {x}]`,
      "a bare variable and a one-element list of it",
    );
    await agree(
      `${head}[(x-0.4)^2, {x, -1, 1}]`,
      `${head}[(x-0.4)^2, {{x, -1, 1}}]`,
      "one region, nested or not",
    );
    // Documented: an unbounded variable gets the default initial region
    // -1 <= x <= 1, so naming that region explicitly must change nothing.
    await agree(
      `${head}[(x-0.4)^2, x]`,
      `${head}[(x-0.4)^2, {{x, -1, 1}}]`,
      "the documented default initial region is -1 <= x <= 1",
    );
    await agree(
      `${head}[(x-3.4)^2, {x, -5, 5, Integers}]`,
      `${head}[(x-3.4)^2, {{x, -5, 5, Integers}}]`,
      "one domain quadruple, nested or not",
    );
  }
});

test("equivalent variable spellings agree, on every local head", async () => {
  for (const head of LOCAL_HEADS) {
    await agree(
      `${head}[(x-0.4)^2, x]`,
      `${head}[(x-0.4)^2, {x}]`,
      "a bare variable and a one-element list of it",
    );
    await agree(
      `${head}[(x-0.4)^2, {x, 0}]`,
      `${head}[(x-0.4)^2, {{x, 0}}]`,
      "one starting point, nested or not",
    );
  }
});

test("the *Value and *Arg heads agree with their parent head", async () => {
  // Same objective, same variables, same default method and seed, so these
  // run the identical engine call and must return the identical numbers --
  // this is what makes the whole family one implementation rather than six.
  const objectives = [
    "(x-3)^2",
    "(x-0.4)^2 + 1",
    "Cos[x] + x^2/10",
    "x^4 - 3x^2 + x",
  ];
  const value = (repr) => {
    const parsed = JSON.parse(repr.replace(/'/g, '"'));
    return Array.isArray(parsed) ? parsed[0] : parsed;
  };
  const args = (repr) =>
    JSON.parse(repr.replace(/'/g, '"'))[1].map((rule) => rule[1]);

  for (const f of objectives) {
    const nmin = await wolfram(`NMinimize[${f}, {x,-5,5}]`);
    assert.equal(
      Number(await wolfram(`NMinValue[${f}, {x,-5,5}]`)),
      value(nmin),
      `NMinValue must be NMinimize's value for ${f}`,
    );
    assert.deepEqual(
      JSON.parse((await wolfram(`NArgMin[${f}, {x,-5,5}]`)).replace(/'/g, '"')),
      args(nmin),
      `NArgMin must be NMinimize's arguments for ${f}`,
    );

    const nmax = await wolfram(`NMaximize[${f}, {x,-5,5}]`);
    assert.equal(
      Number(await wolfram(`NMaxValue[${f}, {x,-5,5}]`)),
      value(nmax),
      `NMaxValue must be NMaximize's value for ${f}`,
    );

    const fmin = await wolfram(`FindMinimum[${f}, {x,1}]`);
    assert.equal(
      Number(await wolfram(`FindMinValue[${f}, {x,1}]`)),
      value(fmin),
      `FindMinValue must be FindMinimum's value for ${f}`,
    );
    assert.deepEqual(
      JSON.parse((await wolfram(`FindArgMin[${f}, {x,1}]`)).replace(/'/g, '"')),
      args(fmin),
      `FindArgMin must be FindMinimum's arguments for ${f}`,
    );
  }
});

test("equivalent FindFit spellings agree", async () => {
  const data = "{{1,2.1},{2,3.9},{3,6.2}}";
  await agree(
    `FindFit[${data}, a*t, a, t]`,
    `FindFit[${data}, a*t, {a}, t]`,
    "a bare parameter and a one-element list of it",
  );
  await agree(
    `FindFit[${data}, a*t, {a}, t]`,
    `FindFit[${data}, a*t, {a}, {t}]`,
    "a bare variable and a one-element list of it",
  );
  // Bare values carry implicit abscissae 1, 2, 3, ... -- which is exactly
  // the data above written out.
  await agree(
    `FindFit[{2.1,3.9,6.2}, a*t, {a}, t]`,
    `FindFit[${data}, a*t, {a}, t]`,
    "implicit abscissae are 1, 2, 3, ...",
  );
});

test("every head is deterministic at its default seed", async () => {
  // The premise of every exact comparison above. If this ever fails, the
  // rest of this file starts reporting false positives, so it is asserted
  // rather than assumed.
  for (const head of ALL_HEADS) {
    const vars = isGlobal(head) ? "{x,-5,5}" : "{x,1}";
    await agree(
      `${head}[Cos[x]+x^2/10, ${vars}]`,
      `${head}[Cos[x]+x^2/10, ${vars}]`,
      "the same call twice must give the same answer",
    );
  }
});
