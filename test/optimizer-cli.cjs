// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const executable = join(root, "bin", "sagejs");
const passId = "math.closed-ring-region.v1";
const source = [
  "for index in range(count):",
  "    value = value * multiplier + increment",
  "",
].join("\n");

function compile(arguments_, environment = {}) {
  return spawnSync(
    process.execPath,
    [executable, "compile", "--sage", "--omit-baselib", ...arguments_],
    {
      cwd: root,
      encoding: "utf8",
      input: source,
      env: { ...process.env, ...environment },
    },
  );
}

test("optimizer CLI explains, disables, and requires stable regions", () => {
  const optimized = compile([
    "--explain-optimizations",
    "--optimization-require",
    passId,
  ]);
  assert.equal(optimized.status, 0, optimized.stderr);
  assert.match(optimized.stderr, new RegExp(`selected ${passId}`));
  assert.match(optimized.stdout, /ρσ_fast_machine_residue_recurrence\(/);

  const disabled = compile([
    "--optimization-level",
    "O0",
    "--explain-optimizations",
  ]);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.match(disabled.stderr, new RegExp(`rejected ${passId}`));
  assert.match(disabled.stderr, /optimization-level-too-low/);
  assert.doesNotMatch(disabled.stdout, /ρσ_fast_machine_residue_recurrence\(/);

  const required = compile([
    "--optimization-level=O0",
    `--optimization-require=${passId}`,
  ]);
  assert.equal(required.status, 1);
  assert.match(required.stderr, /required optimization .* was not selected/);

  const environmentDisabled = compile([], { SAGEJS_OPT_LEVEL: "O0" });
  assert.equal(environmentDisabled.status, 0, environmentDisabled.stderr);
  assert.doesNotMatch(
    environmentDisabled.stdout,
    /ρσ_fast_machine_residue_recurrence\(/,
  );
});

test("optimizer CLI rejects invalid levels instead of silently changing policy", () => {
  const result = compile(["--optimization-level", "fastest"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown Sage\.js optimization level "fastest"/);
});
