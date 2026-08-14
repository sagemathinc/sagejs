"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const {
  extractSageDoctests,
  extractRstSageDoctests,
  filterSageDoctests,
  tripleQuotedStrings,
} = require("../tools/sage-doctest-fixture.cjs");
const {
  assertSilentWorkerSetup,
  directiveSkipReason,
  matchesExample,
  matchesExpected,
  matchesTolerance,
} = require("../scripts/run-sage-doctests.cjs");
const {
  matchesTutorialExpected,
} = require("../scripts/run-sage-tutorial.cjs");

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

assert.doesNotThrow(() => assertSilentWorkerSetup("\n"));
assert.throws(
  () => assertSilentWorkerSetup("ValueError: seed setup failed\n"),
  /random-seed setup produced unexpected output/,
);

const runner = resolve(__dirname, "../scripts/run-sage-doctests.cjs");
const embeddedDirectory = mkdtempSync(
  join(tmpdir(), "sagejs-embedded-doctest-exit-"),
);
try {
  const expectedExceptionFixture = extractSageDoctests([
    '"""',
    "sage: raise ValueError('captured')",
    "Traceback (most recent call last):",
    "...",
    "ValueError: captured",
    '"""',
    "",
  ].join("\n"), {
    repository: "https://example.invalid/sage.git",
    revision: "expected-exception",
    path: "src/sage/expected_exception.py",
    license: "GPL-2.0-or-later",
  });
  const expectedFixturePath = join(embeddedDirectory, "expected.json");
  writeFileSync(
    expectedFixturePath,
    `${JSON.stringify(expectedExceptionFixture)}\n`,
  );
  const expected = spawnSync(
    process.execPath,
    [runner, expectedFixturePath, "--random-seed", "embedded-exception"],
    { cwd: resolve(__dirname, ".."), encoding: "utf8" },
  );
  assert.equal(expected.status, 0, expected.stderr || expected.stdout);
  assert.match(expected.stdout, /Sage doctests: 1 passed/);

  const mismatchedFixture = structuredClone(expectedExceptionFixture);
  mismatchedFixture.groups[0].examples[0].want = [
    "Traceback (most recent call last):",
    "...",
    "ValueError: different",
    "",
  ].join("\n");
  const mismatchedFixturePath = join(embeddedDirectory, "mismatched.json");
  writeFileSync(
    mismatchedFixturePath,
    `${JSON.stringify(mismatchedFixture)}\n`,
  );
  const mismatched = spawnSync(
    process.execPath,
    [runner, mismatchedFixturePath, "--random-seed", "embedded-mismatch"],
    { cwd: resolve(__dirname, ".."), encoding: "utf8" },
  );
  assert.equal(mismatched.status, 1, mismatched.stderr || mismatched.stdout);
  assert.match(mismatched.stdout, /Sage doctests: 0 passed.*1 failed/);

  const internalFailure = spawnSync(
    process.execPath,
    [runner, "--worker"],
    { cwd: resolve(__dirname, ".."), encoding: "utf8", input: "not-json" },
  );
  assert.equal(internalFailure.status, 1);
  assert.match(internalFailure.stderr, /SyntaxError/);
} finally {
  rmSync(embeddedDirectory, { recursive: true, force: true });
}
assert.ok(!matchesExpected("6\n", "5\n"));
assert.ok(matchesTolerance("1.00001\n", "1.0\n", 0.00002, 0));
assert.ok(!matchesTolerance("1.01\n", "1.0\n", 0.00002, 0));
assert.ok(matchesExample("any nondeterministic output\n", {
  want: "another value\n",
  tags: [{ name: "random" }],
}));
assert.ok(!matchesExample("TypeError: bad\n    at generated.js:1:2\n", {
  want: "anything\n",
  tags: [{ name: "random" }],
}));
assert.equal(
  directiveSkipReason(
    { tags: [{ name: "long time" }] },
    { long: false, features: new Set() },
  ),
  "Sage directive: # long time (enable with --long)",
);
assert.equal(
  directiveSkipReason(
    { tags: [{ name: "needs", value: "sage.plot networkx" }] },
    { long: false, features: new Set(["sage.plot"]) },
  ),
  "optional features unavailable: networkx",
);
assert.ok(
  matchesTutorialExpected("sqrt(3)/2\n", "1/2*sqrt(3)\n", {
    accepted: ["sqrt(3)/2\n"],
  }),
);
assert.ok(
  matchesTutorialExpected(
    "[(1.000000000000001, 2.0), (3.0 + 4.0*I)]\n",
    "[(1.0, 2.0),\n(3.0 + 4.0*I)]\n",
    { approx: { relative: 2e-15 } },
  ),
);
assert.ok(
  !matchesTutorialExpected("[(1.01, 2.0)]\n", "[(1.0, 2.0)]\n", {
    approx: { relative: 1e-6 },
  }),
);
assert.ok(
  matchesTutorialExpected("Wall time: 12.345ms\n", "old timing\n", {
    regex: "^Wall time: [0-9.]+ms$",
  }),
);

const rst = [
  "First section",
  "=============",
  "",
  "::",
  "",
  "    sage: a = 2",
  "    sage: a + 3",
  "    5",
  "",
  ".. skip",
  "",
  "::",
  "",
  "    sage: tan?",
  "    Type: function",
  "        EXAMPLES:",
  "            sage: tan(0)",
  "            0",
  "",
  "Second section",
  "--------------",
  "",
  "A list has a more deeply indented literal block:",
  "",
  "   ::",
  "",
  "       sage: def square(x):",
  "       ....:     return x^2",
  "       sage: square(4)",
  "       16",
  "",
].join("\n");
const rstFixture = extractRstSageDoctests(rst, {
  repository: "https://example.invalid/sage.git",
  revision: "def456",
  path: "src/doc/en/tutorial/example.rst",
  license: "GPL-2.0-or-later",
});
assert.deepEqual(rstFixture.summary, { groups: 1, examples: 5 });
assert.equal(rstFixture.groups[0].examples[1].section, "First section");
assert.equal(
  rstFixture.groups[0].examples[2].want,
  "Type: function\n    EXAMPLES:\n        sage: tan(0)\n        0\n",
);
assert.deepEqual(rstFixture.groups[0].examples[2].tags, [
  { name: "skip", value: "rst-directive" },
]);
assert.equal(
  rstFixture.groups[0].examples[3].source,
  "def square(x):\n    return x^2",
);
assert.equal(rstFixture.groups[0].examples[4].section, "Second section");

console.log("Upstream Sage doctest extraction and matching passed.");
