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
  // The mixed-buffer prerequisite must lower both the minimal probe and the
  // actual enumeration. This still does not qualify the full class-group path.
  for (const name of ["mixed_buffer_probe.py", "enumeration.py"]) {
    const source = path.join(base, name);
    const ir = await lowerSource(fs.readFileSync(source, "utf8"), source);
    assert.ok(ir.functions.length > 0);
  }
  const compiled = spawnSync(process.execPath, [path.join(base, "check_compiled.cjs")], {
    cwd: root, encoding: "utf8", timeout: 120000,
  });
  assert.equal(compiled.status, 0, compiled.stderr);
  process.stdout.write(compiled.stdout);
  // A distinct, still-unimplemented boundary: legacy MPFR/MPC lowering can
  // construct field constants, but cannot borrow prepared embedding entries.
  const realProbe = path.join(base, "prepared_real_probe.py");
  await assert.rejects(
    () => lowerSource(fs.readFileSync(realProbe, "utf8"), realProbe),
    /unsupported native argument type RealNumber/,
  );
})().catch(error => { console.error(error); process.exitCode = 1; });
