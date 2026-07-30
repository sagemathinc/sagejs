"use strict";

const assert = require("node:assert/strict");
const {
  extractSageDoctests,
  filterSageDoctests,
  tripleQuotedStrings,
} = require("../tools/sage-doctest-fixture.cjs");
const {
  matchesExpected,
} = require("../scripts/run-sage-doctests.cjs");

const source = [
  'r"""',
  "Module documentation.",
  "",
  "    sage: 2 + 3",
  "    5",
  '"""',
  "",
  "cdef class Example:",
  '    """',
  "    EXAMPLES::",
  "",
  "        sage: value = (",
  "        ....:     7",
  "        ....: )",
  "        sage: value                         # needs sage.example",
  "        7",
  "",
  "        sage: raise ValueError('bad')",
  "        Traceback (most recent call last):",
  "        ...",
  "        ValueError: bad",
  '    """',
  "",
].join("\n");

assert.equal(tripleQuotedStrings(source).length, 2);
const fixture = extractSageDoctests(source, {
  repository: "https://example.invalid/sage.git",
  revision: "abc123",
  path: "src/sage/example.pyx",
  license: "GPL-2.0-or-later",
});
assert.deepEqual(fixture.summary, { groups: 2, examples: 4 });
assert.equal(fixture.source.license, "GPL-2.0-or-later");
assert.equal(fixture.groups[0].owner, "<module>");
assert.equal(fixture.groups[1].owner, "Example");
assert.equal(fixture.groups[1].examples[0].source, "value = (\n    7\n)");
assert.deepEqual(fixture.groups[1].examples[1].tags, [
  { name: "needs", value: "sage.example" },
]);
assert.equal(fixture.groups[1].examples[2].want, [
  "Traceback (most recent call last):",
  "...",
  "ValueError: bad",
  "",
].join("\n"));
const filtered = filterSageDoctests(fixture, {
  ownerPattern: /^Example$/,
});
assert.deepEqual(filtered.summary, { groups: 1, examples: 3 });
assert.equal(filtered.groups[0].owner, "Example");

assert.ok(matchesExpected("5\n", "5\n"));
assert.ok(matchesExpected("prefix middle suffix\n", "prefix ... suffix\n"));
assert.ok(!matchesExpected("extra prefix middle suffix\n", "prefix ... suffix\n"));
assert.ok(matchesExpected("first\n\nthird\n", "first\n<BLANKLINE>\nthird\n"));
assert.ok(
  matchesExpected(
    "ValueError: bad\n    at generated.js:1:2\n",
    "Traceback (most recent call last):\n...\nValueError: bad\n",
  ),
);
assert.ok(!matchesExpected("6\n", "5\n"));

console.log("Upstream Sage doctest extraction and matching passed.");
