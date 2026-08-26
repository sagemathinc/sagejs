// sagejs-test-tier: integration
"use strict";

// Wolfram Language surface syntax that is not specific to any one builtin:
// comments, and chains of comparison operators. Both are ordinary Wolfram
// spelling that appears throughout Wolfram's own documentation, and both
// were mis-lowered in ways that no test covered -- one loudly, one
// silently.
//
// COMMENTS. `(* ... *)` is not an `extras` rule in tree-sitter-wolfram, so
// a comment node is a named child of whatever encloses it rather than
// being skipped by the parser. Every structural read in the AST builder
// counts named children -- `binary` requires exactly two, `prefix` and
// `group` take the first -- so a comment inside an expression changed its
// arity and the node stopped matching the shape it actually had. This
// failed loudly (`'comment' syntax is recognized but is not supported
// yet`, or the more confusing `'infix' syntax is recognized but is not
// supported yet` for a comment in the middle of a sum), which is the
// better failure mode of the two, but it makes pasting any real-world
// Wolfram source impossible: commented code is the norm, not the
// exception.
//
// COMPARISON CHAINS. `a <= x <= b` is one relation about three operands in
// Wolfram, exactly as in Python. Lowering it left-associatively produces
// `(a <= x) <= b`, which compares a *boolean* against `b`. That is not a
// crash and not a refusal -- it is a wrong answer: `3 <= 2 <= 1` lowered
// to `(3 <= 2) <= 1`, i.e. `False <= 1`, i.e. `0 <= 1`, i.e. `True`, the
// exact opposite of what Wolfram returns. Every case below where the
// chain is false was wrong before the fix; the true ones passed by luck,
// which is why "it seemed to work" for so long.

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

async function wolfram(source) {
  const lowering = frontend.lower(source, { captureResult: true });
  const result = await session.evaluate(lowering.source);
  return result.repr;
}

function lower(source) {
  return frontend.lower(source, { captureResult: true }).source;
}

// ---------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------

test("a comment is ignored wherever it appears", async () => {
  assert.equal(await wolfram("(* leading *)\n1 + 1"), "2");
  assert.equal(await wolfram("1 + 1 (* trailing *)"), "2");
  assert.equal(await wolfram("1 + (* between the operands *) 2"), "3");
  assert.equal(await wolfram("{1, (* inside a list *) 2}"), "[1, 2]");
  assert.equal(await wolfram("Prime[(* inside a call *) 4]"), "7");
});

test("a comment nests, as Wolfram's do", async () => {
  // Wolfram comments nest: `(* a (* b *) c *)` is one comment, not a
  // comment followed by the stray text `c *)`. tree-sitter-wolfram gets
  // this right; the point here is that the whole thing is still one node
  // to skip.
  assert.equal(await wolfram("(* a (* nested *) comment *)\n3"), "3");
});

test("a program that is nothing but a comment is not an error", async () => {
  // The degenerate case: filtering comments out of the program body
  // leaves an empty body, which must lower to an empty program rather
  // than tripping an arity check on the way out.
  assert.equal(await wolfram("(* nothing here *)"), "");
});

test("a comment does not disturb an optimization call", async () => {
  // The regression that motivated this: a comment anywhere inside a
  // multi-argument call used to be reported as unsupported `infix`
  // syntax, because the comment was counted as one of `binary`'s two
  // named children.
  const commented = await wolfram(
    "NMinimize[(* the objective *) (x-3)^2, (* the variable *) x]",
  );
  assert.equal(commented, await wolfram("NMinimize[(x-3)^2, x]"));
});

// ---------------------------------------------------------------------
// Comparison chains
// ---------------------------------------------------------------------

test("a chain of comparisons means what Wolfram means by it", async () => {
  // Each false case below returned `True` before the fix.
  assert.equal(await wolfram("1 <= 2 <= 3"), "True");
  assert.equal(await wolfram("3 <= 2 <= 1"), "False");
  assert.equal(await wolfram("1 <= 5 <= 3"), "False");
  assert.equal(await wolfram("5 < 4 < 10"), "False");
  assert.equal(await wolfram("1 < 2 < 3 < 4"), "True");
  assert.equal(await wolfram("1 < 2 < 3 < 2"), "False");
});

test("a chain lowers to Python's chained comparison, not a nested one", async () => {
  // The lowering is the actual fix; asserting on it pins the mechanism
  // rather than just the arithmetic, so a future refactor that
  // reintroduces the parentheses fails here with an obvious diff.
  assert.match(lower("1 <= 2 <= 3"), /\(1 <= 2 <= 3\)/);
  assert.doesNotMatch(lower("1 <= 2 <= 3"), /\(\(1 <= 2\) <= 3\)/);
});

test("a single comparison is unaffected", async () => {
  assert.equal(await wolfram("1 < 2"), "True");
  assert.equal(await wolfram("2 < 1"), "False");
  assert.equal(await wolfram("2 == 2"), "True");
  assert.equal(await wolfram("2 != 2"), "False");
});

// ---------------------------------------------------------------------
// Comparison chains as constraints
//
// In the `{f, cons}` slot a chain cannot lower to Python's chained
// comparison even though that is the faithful general lowering: chaining
// is *defined* as `a <= x and x <= b`, and that `and` short-circuits away
// a relation exactly as a written-out `&&` does (see
// test/wolfram-optimization-parity.cjs). The chain has to be split into
// its individual relations instead.
// ---------------------------------------------------------------------

test("`a <= x <= b` as a constraint means both relations", async () => {
  // Wolfram's Constrained Optimization tutorial gives this spelling as
  // *the* way to bound a variable, and `nminimize.py`'s module docstring
  // quotes that sentence verbatim -- so this is the documented idiom, not
  // an exotic one. Before the fix it crashed with `TypeError: cannot
  // convert ρσ_list_constructor to a symbolic expression`, thrown from
  // inside Nelder-Mead: an internal error naming nothing the caller wrote.
  //
  // (x-9)^2 is minimized at x = 9, well outside the bound, so the upper
  // relation is active and a dropped one would be visible: the answer is
  // 16 at x = 5, not 0 at x = 9.
  const chained = await wolfram("NMinimize[{(x-9)^2, -5 <= x <= 5}, {x}]");
  const listed = await wolfram("NMinimize[{(x-9)^2, {-5 <= x, x <= 5}}, {x}]");
  assert.equal(chained, listed, "the chain must be the two relations");

  const parsed = JSON.parse(chained.replace(/'/g, '"'));
  assert.ok(Math.abs(parsed[0] - 16) < 1e-6, `value ${parsed[0]} should be 16`);
});

test("a `>=` chain bounds the same way round", async () => {
  assert.equal(
    await wolfram("NMinimize[{(x-9)^2, 5 >= x >= -5}, {x}]"),
    await wolfram("NMinimize[{(x-9)^2, {5 >= x, x >= -5}}, {x}]"),
  );
});

test("a constraint chain reaches the local family too", async () => {
  assert.equal(
    await wolfram("FindMinimum[{(x-9)^2, -5 <= x <= 5}, {x, 0}]"),
    await wolfram("FindMinimum[{(x-9)^2, {-5 <= x, x <= 5}}, {x, 0}]"),
  );
});

test("a chain composes with the other constraint spellings", async () => {
  // A chain inside a List, and a chain joined to another constraint by
  // `&&`: both flatten into the same flat set of relations.
  const a = await wolfram(
    "NMinimize[{(x-9)^2 + (y-9)^2, {-5 <= x <= 5, y <= 2}}, {x, y}]",
  );
  const b = await wolfram(
    "NMinimize[{(x-9)^2 + (y-9)^2, -5 <= x <= 5 && y <= 2}, {x, y}]",
  );
  const c = await wolfram(
    "NMinimize[{(x-9)^2 + (y-9)^2, {-5 <= x, x <= 5, y <= 2}}, {x, y}]",
  );
  assert.equal(a, b, "chain inside a List == chain joined by &&");
  assert.equal(a, c, "chain == its relations written out");
});
