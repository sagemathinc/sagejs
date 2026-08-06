"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPythonSyntaxFrontend,
  PythonSyntaxError,
} = require("../dist/tools/python/frontend.js");

test("Python grammar accepts modern Python and reports locations", async () => {
  const frontend = await createPythonSyntaxFrontend("python");
  try {
    const parsed = frontend.assertValid(
      "match value:\n    case [first, *rest]:\n        print(first, rest)\n",
      "sample.py",
    );
    assert(parsed.nodeTypes.has("match_statement"));
    assert(parsed.nodeTypes.has("list_pattern"));

    assert.throws(
      () => frontend.assertValid("def broken(:\n    pass\n", "broken.py"),
      (error) => {
        assert(error instanceof PythonSyntaxError);
        assert.equal(error.line, 1);
        assert.match(error.message, /^broken\.py:1:/);
        return true;
      },
    );
  } finally {
    frontend.close();
  }
});

test("Sage grammar accepts extensions without weakening Python", async () => {
  const python = await createPythonSyntaxFrontend("python");
  const sage = await createPythonSyntaxFrontend("sage");
  const source = [
    "R.<x> = ZZ[]",
    "f(t) = t^2 + 1",
    "values = [1, 3, .., 11]",
    "xor = 7 ^^ 2",
    "raw = 10r",
  ].join("\n");
  try {
    assert(sage.assertValid(source).nodeTypes.has("sage_generator_assignment"));
    assert(python.parse(source).diagnostics.length > 0);
  } finally {
    python.close();
    sage.close();
  }
});
