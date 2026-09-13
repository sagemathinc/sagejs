// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

(async () => {
  const root = path.resolve(__dirname, "..");
  const base = path.join(root, "bench/pari-class-group-port");
  const result = spawnSync("python3", [path.join(base, "check_enumeration.py")], {
    cwd: root, encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  process.stdout.write(result.stdout);
  // This is an explicit unresolved-obstruction receipt, NOT native validation.
  // Replace this expectation with a native/JS differential when the prerequisite
  // compiler lane is integrated, rather than calling rejection a port success.
  for (const name of ["mixed_buffer_probe.py", "enumeration.py"]) {
    const source = path.join(base, name);
    await assert.rejects(
      () => lowerSource(fs.readFileSync(source, "utf8"), source),
      /native indexing currently requires a local constant sequence/,
    );
  }
  console.log("Confirmed unresolved mixed-buffer compiler obstruction; native execution unavailable.");
})().catch(error => { console.error(error); process.exitCode = 1; });
