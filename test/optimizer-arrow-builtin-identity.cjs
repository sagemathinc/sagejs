// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const source = readFileSync(join(__dirname,
  "fixtures/optimizer-development/arrow-builtin-identity.py"), "utf8");
const runner = join(__dirname, "fixtures/optimizer-development/profile-lazy/runner.cjs");
const call = 'render_cells([0.0], [0.0], [[1.0]], [[0.0]], 1.0, 1.0, "tail", 0.0, 0.0)';

function run(body) {
  const child = spawnSync(process.execPath, [runner], {
    input: JSON.stringify({ action: "profile", language: "python",
      source: source + "\n" + body,
      options: { language: "python", filename: "arrow-builtin-identity.py" } }),
    encoding: "utf8", timeout: 60_000, maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stdout.slice(-4000) + child.stderr.slice(-4000));
  const result = JSON.parse(child.stdout.trim().split("\n").at(-1));
  assert.equal(result.ok, true);
  const events = result.value.observation.privateEvents.aggregates;
  const terminals = events.filter(event => event.outcome !== "selected-static-entry");
  assert.equal(terminals.length, 1, JSON.stringify(events));
  assert.equal(terminals[0].count, 1);
  return { terminal: terminals[0], stdout: result.value.stdout };
}

test("arrow geometry retains the canonical Python builtin fast path", () => {
  const result = run(`print(${call})\n`);
  assert.equal(result.terminal.outcome, "guarded-fast", JSON.stringify(result.terminal));
  assert.equal(result.stdout.trim(), "([0.0, 1.0, None], [0.0, 0.0, None])");
});

for (const name of ["isinstance", "float", "enumerate"]) {
  for (const namespace of ["globals()", "vars(builtins)"]) {
    test(`arrow geometry observes replaced ${name} in ${namespace}`, () => {
      const result = run(`
import builtins
original = getattr(builtins, "${name}")
calls = []
def replacement(*args):
    calls.append("called")
    return original(*args)
namespace = ${namespace}
namespace["${name}"] = replacement
try:
    result = ${call}
finally:
    if namespace is not globals():
        namespace["${name}"] = original
print(result)
assert len(calls) > 0
`);
      assert.equal(result.terminal.outcome, "guarded-fallback");
      assert.equal(result.stdout.trim(), "([0.0, 1.0, None], [0.0, 0.0, None])");
    });
  }
}

test("arrow geometry preserves tuple classinfo and zero-trip missing builtin", () => {
  const changed = run(`
globals()["list"] = (list,)
print(${call})
`);
  assert.equal(changed.terminal.outcome, "guarded-fallback");
  assert.equal(changed.stdout.trim(), "([0.0, 1.0, None], [0.0, 0.0, None])");
  const empty = run(`
import builtins
original = builtins.isinstance
del builtins.isinstance
try:
    result = render_cells([], [], [], [], 1.0, 1.0, "tail", 0.0, 0.0)
finally:
    builtins.isinstance = original
print(result)
`);
  assert.equal(empty.terminal.outcome, "guarded-fallback");
  assert.equal(empty.stdout.trim(), "([], [])");
});
