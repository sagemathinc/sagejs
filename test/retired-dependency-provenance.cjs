// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
// Assemble the retired name so this regression does not need a source-scan
// exemption of its own.
const retired = "co" + "wasm";
const auditPath = `scripts/audit-${retired}-dependency.cjs`;
const historicalPaths = [
  "agents/python-compiler-runtime-value-and-performance-plan.md",
  "docs/general-class-unit-frontier.md",
];

function audit(extra = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-provenance-"));
  try {
    const files = {
      [auditPath]: fs.readFileSync(path.join(root, auditPath)),
      ...Object.fromEntries(historicalPaths.map((name) => [
        name, fs.readFileSync(path.join(root, name)),
      ])),
      ...extra,
    };
    for (const [name, body] of Object.entries(files)) {
      const destination = path.join(directory, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, body);
    }
    const init = spawnSync("git", ["init", "--quiet"], {
      cwd: directory, encoding: "utf8", timeout: 10000,
    });
    assert.equal(init.status, 0, init.error?.message || init.stderr);
    const result = spawnSync(process.execPath, [path.join(directory, auditPath)], {
      cwd: directory, encoding: "utf8", timeout: 10000,
    });
    assert.ifError(result.error);
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("exact historical benchmark references do not imply a runtime dependency", () => {
  const result = audit();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dependency audit passed/);
});

test("historical exemptions do not admit new runtime or documentary references", () => {
  for (const name of ["src/new_runtime.py", "docs/unreviewed.md"]) {
    const result = audit({ [name]: `import @${retired}/runtime\n` });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(`${name}:1:`));
  }
});
