#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-platform: linux
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { lowerSource } = require("../../tools/native-kernel/ir.cjs");
const {
  createNativeImportResolver,
} = require("../../tools/native-kernel/native-imports.cjs");
const { generateJavaScript } = require("../../tools/native-kernel/js-backend.cjs");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "live_retry_control.py");
const source = fs.readFileSync(sourcePath, "utf8");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

// Pin the source policy, not a known successful precision. These snippets are
// from PARI 2.17.4 buch2.c at the archive hash used by this experiment.
const archive = path.resolve(
  process.argv[2] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz",
);
const archiveSha256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
assert.equal(sha256(fs.readFileSync(archive)), archiveSha256);
const extracted = spawnSync("tar", [
  "-xOf", archive, "pari-2.17.4/src/basemath/buch2.c",
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
assert.equal(extracted.status, 0, extracted.stderr);
assert.equal(
  sha256(extracted.stdout),
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
);
assert.match(extracted.stdout, /prec < 1280\? precdbl\(prec\): \(long\)\(prec \* 1\.5\)/);
assert.match(extracted.stdout, /PREC = myprecdbl\(PREC, flag\? C: NULL\)/);
assert.match(extracted.stdout, /PREC \+= maxss\(add, 1\)/);
assert.match(extracted.stdout, /reallocate\(cache, 10\*n \+ 50\)/);

const retryCases = [
  // [reason, current, exponent, input precision, flagged, expected target]
  [3n, 192n, 0n, 0n, 0n, 384n],
  [3n, 1280n, 0n, 0n, 0n, 1920n],
  [3n, 192n, 5000n, 64n, 1n, 1152n],
  [4n, 192n, 10n, 64n, 1n, 256n],
  [4n, 256n, 10n, 128n, 1n, 320n],
  [4n, 512n, 600n, 192n, 1n, 1024n],
];
const capacityCases = [
  [3n, 1230n, 7n, 0n, [3690n, 3690n, 37020n]],
  [3n, 1230n, 7n, 7n, [3690n, 3697n, 37027n]],
  [4n, 100n, 9n, 0n, [400n, 400n, 4140n]],
];

function values(owner) {
  return Array.isArray(owner) ? owner : Array.from(owner);
}

function runBackend(module, backend) {
  const retry = module.pari_live_retry_transition;
  const capacity = module.pari_live_root_capacity_policy;
  const state = (length) => backend === "javascript"
    ? Array(length).fill(0n)
    : retry.createInt64Buffer(Array(length).fill(0n));
  const retryOutputs = [];
  for (const item of retryCases) {
    const output = state(6);
    assert.equal(retry[backend](...item.slice(0, 5), output), 0n);
    assert.equal(values(output)[3], item[5]);
    retryOutputs.push(values(output).map(String));
  }
  const capacityOutputs = [];
  for (const item of capacityCases) {
    const output = state(3);
    assert.equal(capacity[backend](...item.slice(0, 4), output), 0n);
    assert.deepEqual(values(output), item[4]);
    capacityOutputs.push(values(output).map(String));
  }
  const bad = state(5);
  assert.throws(() => retry[backend](4n, 192n, 10n, 64n, 1n, bad), /short/);
  assert.throws(() => retry[backend](0n, 192n, 10n, 64n, 1n, state(6)), /live PRECI/);
  return { retryOutputs, capacityOutputs };
}

(async () => {
  const py = String.raw`
import importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
m=importlib.import_module("bench.pari-class-group-port.live_retry_control")
R=${JSON.stringify(retryCases.map((row) => row.map(String)))}
C=${JSON.stringify(capacityCases.map((row) => row.slice(0, 4).map(String)))}
out=[]
for row in R:
 s=[0]*6;m.pari_live_retry_transition(*map(int,row[:5]),s);assert s[3]==int(row[5]);out.append(s)
caps=[]
for row in C:
 s=[0]*3;m.pari_live_root_capacity_policy(*map(int,row),s);caps.append(s)
print(json.dumps({"retryOutputs":out,"capacityOutputs":caps}))
`;
  const cp = spawnSync("python3", ["-c", py, root], {
    cwd: root, encoding: "utf8", timeout: 30000,
  });
  assert.equal(cp.status, 0, cp.stderr);
  const cpython = JSON.parse(cp.stdout);

  const resolveNativeImport = createNativeImportResolver({
    root, lowerSource, initialSourcePath: sourcePath,
  });
  const ir = await lowerSource(source, sourcePath, { resolveNativeImport });
  const jsPath = path.join("/tmp", `sagejs-live-retry-${process.pid}.cjs`);
  fs.writeFileSync(jsPath, generateJavaScript(ir, { sourcePath }));
  const javascript = runBackend(require(jsPath), "javascript");
  fs.rmSync(jsPath, { force: true });
  const built = await compileKernel({ sourcePath });
  const native = require(built.modulePath);
  const gmp = runBackend(native, "gmp");
  const tagged = runBackend(native, "tagged");
  for (const result of [javascript, gmp, tagged]) {
    assert.deepEqual(result.retryOutputs, cpython.retryOutputs.map((row) => row.map(String)));
    assert.deepEqual(result.capacityOutputs, cpython.capacityOutputs.map((row) => row.map(String)));
  }
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/live-generic-controls-v1",
    capacityAuthority: "degree*live_prime_count",
    authenticFactorBaseCapacity: "3690",
    observedFactorBaseSizeUsedAsControl: false,
    retryAuthority: "live failure plus pinned PARI 2.17.4 policy",
    firstCleanarchTransition: ["192", "256"],
    preselectedSuccessfulPrecision: false,
    terminalPrecisionClaimed: false,
    backends: ["cpython", "javascript", "gmp", "tagged"],
    sourceSha256: sha256(source),
    cacheKey: built.cacheKey,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
