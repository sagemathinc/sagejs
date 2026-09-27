// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const createCompiler = require("../dist/tools/compiler.js").default;
const { createPythonCompilerFrontend } = require(
  "../dist/tools/python/compiler-frontend.js"
);
const { createKernelEvaluator } = require("../dist/tools/kernel-evaluator.js");

async function countingEvaluator() {
  const compiler = createCompiler();
  const [python, sage] = await Promise.all([
    createPythonCompilerFrontend(compiler, "python"),
    createPythonCompilerFrontend(compiler, "sage"),
  ]);
  const counts = { sage: 0, python: 0 };
  for (const [language, frontend] of [["sage", sage], ["python", python]]) {
    const parse = frontend.parse;
    frontend.parse = (...args) => {
      counts[language] += 1;
      return parse(...args);
    };
  }
  const evaluator = createKernelEvaluator({
    mode: "sage",
    onOutput() {},
    compiler,
    compilerFrontends: new Map([["python", python], ["sage", sage]]),
  });
  return { evaluator, counts };
}

test("repeated Sage cells reuse code but execute fresh state and reports", async () => {
  const { evaluator, counts } = await countingEvaluator();
  try {
    evaluator.evaluate("x = 0\ny = 1");
    const source = "x = x + y\nx";
    const before = counts.sage;
    const values = [];
    const reports = [];
    for (let index = 0; index < 5; index += 1) {
      const answer = evaluator.evaluate(source);
      values.push(answer.repr);
      reports.push(answer.optimization);
    }
    assert.deepEqual(values, ["1", "2", "3", "4", "5"]);
    assert.equal(counts.sage - before, 2);
    assert.notEqual(reports[2], reports[3]);
    reports[2].filename = "forged";
    assert.equal(reports[3].filename, "<embedded>");

    evaluator.evaluate("y = 3");
    const afterOtherCell = counts.sage;
    assert.equal(evaluator.evaluate(source).repr, "8");
    assert.equal(counts.sage, afterOtherCell + 1);
  } finally {
    evaluator.close();
  }
});

test("Python mode, definitions, and numeric-pool cells are not cached", async () => {
  const { evaluator, counts } = await countingEvaluator();
  try {
    const pythonBefore = counts.python;
    for (let index = 0; index < 3; index += 1) {
      evaluator.evaluate("pass", { language: "python" });
    }
    assert.equal(counts.python - pythonBefore, 3);

    const sageBefore = counts.sage;
    evaluator.evaluate("class C:\n    pass");
    evaluator.evaluate("class C:\n    pass");
    assert.equal(counts.sage - sageBefore, 2);

    evaluator.evaluate("x = 0");
    const numericBefore = counts.sage;
    evaluator.evaluate("x = x + 1\nx");
    evaluator.evaluate("x = x + 1\nx");
    evaluator.evaluate("x = x + 1\nx");
    assert.equal(counts.sage - numericBefore, 3);
  } finally {
    evaluator.close();
  }
});
