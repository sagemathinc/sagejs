// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  contentAddressedExampleId,
  examplesForEntry,
  normalizedExampleText,
} = require("../scripts/reference-examples.cjs");
const { extractSageDoctests } = require("../tools/sage-doctest-fixture.cjs");

function extractedExample(source) {
  return extractSageDoctests(source, {
    repository: "https://example.invalid/sagejs",
    revision: "working-tree",
    path: "src/baselib/example.py",
  }).groups[0].examples[0];
}

function referenceId(example) {
  return contentAddressedExampleId(
    "src/baselib/example.py",
    example.source,
    example.want,
  );
}

test("reference example identities survive unrelated source-line insertion", () => {
  const before = extractedExample(`
def square(n):
    """
    sage: square(5)
    25
    """
    return n * n
`);
  const after = extractedExample(`
# An unrelated line changes all following source coordinates.
def square(n):
    """
    sage: square(5)
    25
    """
    return n * n
`);

  assert.notEqual(before.line, after.line);
  assert.equal(referenceId(before), referenceId(after));
  const passing = new Map([[referenceId(before), { status: "pass" }]]);
  assert.equal(passing.get(referenceId(after)).status, "pass");
});

test("reference example identities invalidate changed inputs and outputs", () => {
  const original = extractedExample(`
def square(n):
    """
    sage: square(5)
    25
    """
    return n * n
`);
  const changedInput = { ...original, source: "square(6)" };
  const changedOutput = { ...original, want: "26\n" };

  assert.notEqual(referenceId(original), referenceId(changedInput));
  assert.notEqual(referenceId(original), referenceId(changedOutput));
  const passing = new Map([[referenceId(original), { status: "pass" }]]);
  assert.equal(passing.has(referenceId(changedInput)), false);
  assert.equal(passing.has(referenceId(changedOutput)), false);
});

test("reference example normalization only removes platform line-ending noise", () => {
  assert.equal(normalizedExampleText("a\r\nb\r\n"), "a\nb");
  assert.equal(normalizedExampleText("a  \n"), "a  ");
  assert.notEqual(
    contentAddressedExampleId("a.py", "f()", "1\n"),
    contentAddressedExampleId("b.py", "f()", "1\n"),
  );
});

test("published examples retain coordinate provenance beside stable identity", () => {
  const source = `
def square(n):
    """
    sage: square(5)
    25
    """
    return n * n
`;
  const fixture = extractSageDoctests(source, {
    repository: "https://example.invalid/sagejs",
    revision: "working-tree",
    path: "src/baselib/example.py",
  });
  const sources = {
    definitions: [],
    groups: fixture.groups.map((group) => ({
      ...group,
      path: fixture.source.path,
      origin: "sagejs",
    })),
  };
  const [example] = examplesForEntry({
    name: "square",
    aliases: [],
  }, sources);

  assert.equal(example.line, fixture.groups[0].examples[0].line);
  assert.equal(example.provenance_id, fixture.groups[0].examples[0].id);
  assert.equal(example.id, referenceId(fixture.groups[0].examples[0]));
});
