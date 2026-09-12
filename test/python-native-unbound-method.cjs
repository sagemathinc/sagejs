// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

test("native container methods expose explicit-self class descriptors", (context) => {
  const source = [
    "values = [1]",
    "list.extend(values, [2])",
    "assert values == [1, 2]",
    "extend = list.extend",
    "extend(values, [3])",
    "assert values == [1, 2, 3]",
    "assert list.copy(values) == [1, 2, 3]",
    "assert list.pop(values) == 3",
    "assert list(list.__iter__(values)) == [1, 2]",
    "class Derived(list):",
    "    pass",
    "derived = Derived([4])",
    "Derived.extend(derived, [5])",
    "saved = Derived.extend",
    "saved(derived, [6])",
    "assert list(derived) == [4, 5, 6]",
    "derived.extend([7])",
    "bound = derived.extend",
    "bound([8])",
    "assert list(derived) == [4, 5, 6, 7, 8]",
    "# Constructor-owned explicit-self functions must not be adapted twice.",
    "list.append(values, 9)",
    "assert values == [1, 2, 9]",
    "list.__init__(values, [10])",
    "assert values == [10]",
    "assert str.replace('abc', 'b', 'x') == 'axc'",
    "print('native-unbound-ok')",
    "",
  ].join("\n");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-unbound-method-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "check.py");
  writeFileSync(filename, source);
  const result = spawnSync(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs-source.cjs"), "--python", filename],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "native-unbound-ok");
});
