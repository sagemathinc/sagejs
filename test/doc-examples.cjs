// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectTestedSageExamples,
  extractTestedSageFences,
  runTestedSageExamples,
} = require("../scripts/run-doc-examples.cjs");

test("documentation example fences are explicitly opt in", () => {
  const source = [
    "```sage",
    "not_executed()",
    "```",
    "",
    "~~~~sage test",
    "assert 2 + 2 == 4",
    "~~~~",
    "",
    "````sage test slow",
    "assert 3 + 3 == 6",
    "````",
  ].join("\n");
  assert.deepEqual(extractTestedSageFences(source, "fixture.md"), [
    {
      path: "fixture.md",
      line: 6,
      source: "assert 2 + 2 == 4",
    },
    {
      path: "fixture.md",
      line: 10,
      source: "assert 3 + 3 == 6",
    },
  ]);
});

test("every opted-in Sage example in docs executes", async () => {
  const documents = collectTestedSageExamples();
  const showcase = documents.find(
    (document) => document.path === "docs/elliptic-curve-lseries.md",
  );
  assert.ok(showcase, "the elliptic L-series showcase has tested examples");
  assert.ok(showcase.examples.length >= 6);

  const bsdGuide = documents.find(
    (document) =>
      document.path === "docs/hyperelliptic-bsd-arithmetic.md",
  );
  assert.ok(bsdGuide, "the hyperelliptic BSD guide has tested examples");
  assert.ok(bsdGuide.examples.length >= 12);

  const result = await runTestedSageExamples();
  assert.equal(result.documents, documents.length);
  assert.equal(
    result.examples,
    documents.reduce((count, document) => count + document.examples.length, 0),
  );
});
