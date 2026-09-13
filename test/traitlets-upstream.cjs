// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");

function runFixture(name) {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs-source.cjs"),
      join(root, "test", "fixtures", name),
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, "");
}

function runPython(path) {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs-source.cjs"), path],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("Python metaclass machinery supports the traitlets requirements", () => {
  runFixture("metaclass-runtime.py");
});

test("class-syntax NamedTuple accepts positional and keyword fields", () => {
  runFixture("namedtuple-runtime.py");
});

test("unittest.mock provides the portable upstream-test core", () => {
  runFixture("unittest-mock-runtime.py");
});

test("logging.config supports traitlets-style dictionary configuration", () => {
  runFixture("logging-config-runtime.py");
});

test("pinned upstream traitlets imports through the production loader", () => {
  runFixture("traitlets-upstream-smoke.py");
});

test("traitlets notifications and failures match the pinned CPython transcript", () => {
  const script = join(root, "scripts", "generate-traitlets-semantics-corpus.py");
  const expected = readFileSync(
    join(root, "upstream-tests", "ipywidgets", "traitlets-semantics-corpus.json"),
    "utf8",
  ).trim();
  assert.equal(runPython(script), expected);
});
