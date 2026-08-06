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

    const bitwise = frontend.assertValid("value = 1 ^ 2 & 3\n");
    const bitwiseAssignment = bitwise.tree.rootNode.namedChild(0).namedChild(0);
    const xor = bitwiseAssignment.childForFieldName("right");
    assert.equal(xor.childForFieldName("operator").text, "^");
    assert.equal(xor.childForFieldName("right").childForFieldName("operator").text, "&");

    const awaiting = frontend.assertValid(
      "async def f():\n    return await g() ** 2\n",
    );
    const returned = awaiting.tree.rootNode
      .namedChild(0).childForFieldName("body").namedChild(0).namedChild(0);
    assert.equal(returned.type, "binary_operator");
    assert.equal(returned.childForFieldName("left").type, "await");

    assert.throws(
      () => frontend.assertValid("def broken(:\n    pass\n", "broken.py"),
      (error) => {
        assert(error instanceof PythonSyntaxError);
        assert.equal(error.line, 1);
        assert.match(error.message, /^broken\.py:1:/);
        return true;
      },
    );
    assert.throws(
      () => frontend.assertValid(
        "def f():\n  pass\n pass\n",
        "indent.py",
      ),
      (error) => {
        assert(error instanceof PythonSyntaxError);
        assert.match(error.message, /Inconsistent indentation/);
        return true;
      },
    );
    assert.throws(
      () => frontend.assertValid("for item in values:", "incomplete.py"),
      (error) => {
        assert(error instanceof PythonSyntaxError);
        assert.equal(error.is_eof, true);
        assert.equal(error.diagnostic.nodeType, "block");
        return true;
      },
    );
    // Multiple simple statements on one line are not an indentation error.
    frontend.assertValid("first = 1; second = 2\n", "semicolon.py");
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
    assert(sage.assertValid("%time value = 2^20\n").nodeTypes.has(
      "sage_time_statement",
    ));
    assert(python.parse(source).diagnostics.length > 0);
  } finally {
    python.close();
    sage.close();
  }
});
