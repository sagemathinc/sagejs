"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { spawnSync, execFileSync } = require("node:child_process");
const root = process.cwd();
const { repositoryIdentity, digestPath, sha256, canonicalJson } = require(path.join(root, "scripts/numerical-computing/common.cjs"));
const expected = "3fc0831aab04f43ed48c0f5d6b81d998db9db341";
const output = path.resolve(process.argv[2]);
assert.ok(!fs.existsSync(output), "refusing to replace qualification evidence");
const source = repositoryIdentity(root);
assert.equal(source.commit, expected);
assert.equal(source.clean, true);
assert.equal(fs.lstatSync(path.join(root, "dist")).isSymbolicLink(), false,
  "rebuild only an owned dist directory");
const build = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
  cwd: root, encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024,
});
assert.equal(build.status, 0, build.stderr || build.stdout);
const tests = [
  "test/numerics/performance/prepared-statistics.cjs",
  "test/numerics/performance/packed-centered.cjs",
  "test/numerics/performance/packed-reductions.cjs",
  "test/numerics/statistics/test.cjs",
  "test/numerics/performance/result-bookkeeping.cjs",
  "tools/native-kernel/test/float64-conditional.cjs",
];
const tracked = execFileSync("git", ["ls-files", "-z"], {cwd:root, encoding:"utf8"}).split("\0").filter(Boolean);
function sourceDigest(file) {
  if (file.startsWith("dist/")) return digestPath(root, file, file);
  const selected = tracked.filter(name => name === file || name.startsWith(file + "/")).sort();
  assert.ok(selected.length > 0, "no tracked source for " + file);
  const inputs = selected.map(name => digestPath(root, name, name));
  return { path:file, sha256:sha256(canonicalJson(inputs)),
    files:inputs.length, bytes:inputs.reduce((sum, item) => sum + item.bytes,0),
    selection:"git-tracked-source-only", inputs };
}
const files = [
  "src/lib/sagejs/numerics", "src/lib/sagejs/native.py", "tools/native-kernel",
  "tools/runtime-bootstrap.ts", "test/numerics/performance", "test/numerics/statistics",
  "test/helpers/float64-wasm.cjs", "test/helpers/native-cache-cleanup.cjs",
  "test/helpers/assert-no-exact-numerical-load.cjs",
  "dist/compiler/compiler.js", "dist/tools/runtime-bootstrap.js", "dist/tools/kernel.js",
].map(sourceDigest);
const env = { ...process.env, SAGEJSPATH: path.join(root, "src/lib"),
  SAGEJS_FLINT_PREFIX: path.join(root, "intentionally-absent-prepared-prefix"),
  SAGEJS_NUMERICAL_BROWSER_TESTS: "0" };
const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...tests], {
  cwd: root, encoding: "utf8", timeout: 480000, maxBuffer: 12 * 1024 * 1024, env,
});
const transcript = (run.stdout || "") + (run.stderr || "");
assert.deepEqual(repositoryIdentity(root), source, "qualification changed source");
const count = name => Number(transcript.match(new RegExp("^# " + name + " ([0-9.]+)", "m"))?.[1] ?? NaN);
const report = {
  schema: "sagejs.numerics.n2-source-qualification/v1",
  scope: "explicit-public-prepared-source-and-rebuilt-host-tools-not-full-product-qualification",
  source, collector_sha256: sha256(fs.readFileSync(__filename)),
  observed_at: new Date().toISOString(),
  runtime_basis: { compiler_and_baselib_commit: "14fdd4117f4ffcad7e0ef6f865a832b37faecb34",
    host_typescript_commit: source.commit, host_build_command: "node node_modules/typescript/bin/tsc -p tsconfig.json",
    source_imports: "SAGEJSPATH=src/lib", exact_arithmetic_prefix: "intentionally absent" },
  host: { platform: process.platform, architecture: process.arch, node: process.version,
    os_release: os.release(), cpu: os.cpus()[0]?.model,
    python: execFileSync(process.platform === "win32" ? "python" : "python3", ["--version"], {encoding:"utf8"}).trim() },
  files, test_command: [process.execPath, "--test", "--test-reporter=tap", ...tests],
  limitations: ["not full application or npm/SEA qualification", "no public browser/Wasm route",
    "no end-to-end performance claim", "native opt-in remains experimental",
    "WASI-toolchain absence is an explicit test skip, not a qualified target"],
  result: { exit_code: run.status, signal: run.signal, error: run.error?.message ?? null,
    tests: count("tests"), pass: count("pass"), fail: count("fail"), skipped: count("skipped"),
    cancelled: count("cancelled"), duration_ms: count("duration_ms"), transcript },
};
fs.mkdirSync(path.dirname(output), {recursive:true});
fs.writeFileSync(output, JSON.stringify(report,null,2) + "\n", {flag:"wx"});
console.log(JSON.stringify({output, host:report.host, result:{...report.result,transcript:undefined}}));
assert.equal(run.status, 0, transcript);
assert.equal(report.result.tests, 21);
assert.equal(report.result.fail, 0);
assert.equal(report.result.cancelled, 0);
