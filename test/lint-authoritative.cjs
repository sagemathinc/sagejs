// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const lint = require("../dist/tools/lint.js");

test("lint consumes the authoritative Tree-sitter AST", async () => {
  await lint.initialize();
  const options = {
    filename: "<lint-test>",
    report() {},
  };
  assert.deepEqual(lint.lint_code("def f(a):\n    return a\n", options), []);
  const undefinedMessages = lint.lint_code("missing_name\n", options);
  assert.equal(undefinedMessages.length, 1);
  assert.equal(undefinedMessages[0].ident, "undef");
  assert.equal(undefinedMessages[0].name, "missing_name");
  const syntaxMessages = lint.lint_code("def broken(:\n    pass\n", options);
  assert.equal(syntaxMessages.length, 1);
  assert.equal(syntaxMessages[0].ident, "syntax-err");
});
