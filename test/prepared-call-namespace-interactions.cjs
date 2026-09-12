// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { createSage } = require("../dist/tools/kernel.js");

test("prepared calls compose with class namespaces and properties", async (context) => {
  const source = readFileSync(join(__dirname, "fixtures/prepared-call-namespace-interactions.py"), "utf8");
  const oracle = spawnSync(pythonExecutable(), ["-c", source], { encoding: "utf8" });
  assert.equal(oracle.status, 0, oracle.stderr || String(oracle.error));
  const session = await createSage({ mode: "python" });
  context.after(() => session.close());
  const result = await session.evaluate(source);
  assert.equal(result.stderr ?? "", "");
  assert.equal(result.stdout, oracle.stdout.replaceAll("\r\n", "\n"));
});
