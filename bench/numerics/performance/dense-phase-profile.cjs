"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../../..");
const output = process.argv[2];
if (!output || process.argv.length !== 3 || fs.existsSync(output)) {
  throw Error("usage: dense-phase-profile.cjs NEW_RECEIPT.json");
}
const inputs = ["bench/numerics/performance/dense-phase-profile.py", "bench/numerics/performance/dense-phase-profile.cjs",
  "dist/compiler/compiler.js", "dist/compiler/baselib-plain-pretty.js",
  ...["operations", "factorizations", "validation", "storage"].map(name => `src/lib/sagejs/numerics/linear_algebra/${name}.py`),
  "src/lib/sagejs/numerics/model.py", "src/lib/sagejs/numerics/trace.py"];
const snapshot = () => inputs.map(name => ({ path: name,
  sha256: createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex") }));
const before = snapshot();
const result = spawnSync(process.execPath, ["--require", path.join(root, "test/helpers/assert-no-exact-numerical-load.cjs"),
  path.join(root, "bin/sagejs"), "--python", path.join(__dirname, "dense-phase-profile.py")], {
  cwd: root, encoding: "utf8", timeout: 180000,
  env: { ...process.env, SAGEJSPATH: path.join(root, "src/lib"), SAGEJS_NATIVE_DISABLE: "1" },
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.deepEqual(snapshot(), before, "profile inputs changed");
const profile = JSON.parse(result.stdout);
const report = { ...profile, qualification: false, inputs: before,
  host: { platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model },
  policy: { warmups: 3, samples: 7, trace: "none", runtime: "ordinary Sage.js",
    limitations: ["instrumentation overhead", "local diagnostic only", "no startup, memory, browser or platform qualification"],
    other: "public-call time outside the three wrapped phases; excludes preconstructed matrix input" } };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(profile.records.map(row => ({ size: row.size,
  median_ms: Object.fromEntries(Object.keys(row.samples_ms[0]).map(key =>
    [key, row.samples_ms.map(sample => sample[key]).sort((a, b) => a - b)[3]])) })), null, 2));
