import assert from "node:assert/strict";
import test from "node:test";
import { executionSource } from "../execution-source.mjs";

test("run all preserves source exactly", () => {
  assert.equal(executionSource("a = 1\na", { mode: "all" }), "a = 1\na");
});

test("run selection uses selected source or the cursor line", () => {
  const source = "first = 1\nsecond = 2\nthird = 3";
  assert.equal(executionSource(source, { mode: "selection", selectionStart: 10, selectionEnd: 20 }), "second = 2");
  assert.equal(executionSource(source, { mode: "selection", selectionStart: 24, selectionEnd: 24 }), "third = 3");
});

test("run cell honors explicit Sage cell markers", () => {
  const source = "# %% setup\na = 1\n\n# %% result\nb = a + 2\nb\n# %% next\n3";
  const cursor = source.indexOf("b =");
  assert.equal(executionSource(source, { mode: "cell", selectionStart: cursor }), "b = a + 2\nb");
});

test("run cell uses blank-line paragraphs when markers are absent", () => {
  const source = "a = 1\na\n\nb = 2\nb\n\nc = 3";
  assert.equal(executionSource(source, { mode: "cell", selectionStart: source.indexOf("b =") }), "b = 2\nb");
});

test("invalid modes and types fail explicitly", () => {
  assert.throws(() => executionSource(null), /source must be a string/);
  assert.throws(() => executionSource("1", { mode: "mystery" }), /unknown execution mode/);
});
