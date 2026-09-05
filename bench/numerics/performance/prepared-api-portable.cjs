"use strict";

// Run in the isolated qualification bundle. Never overwrite an existing receipt.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../..");
const hash = data => createHash("sha256").update(data).digest("hex");
function snapshot() {
  const files = [];
  function visit(relative) {
    const name = path.basename(relative);
    if (["__pycache__", ".pnpm", ".bin"].includes(name) || name.endsWith(".pyc")) return;
    const absolute = path.join(root, relative);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(absolute).sort()) visit(relative + "/" + child);
    } else if (stat.isFile()) files.push([relative, hash(fs.readFileSync(absolute))]);
    else throw new Error("unsupported qualification file " + relative);
  }
  for (const relative of ["src", "tools", "scripts", "architecture", "ffi", "dist", "bin", "index.cjs", "package.json", "packages/flint/include", "packages/flint/node_modules", "packages/flint/package.json", "packages/flint/pnpm-lock.yaml", "node_modules/web-tree-sitter", "test/helpers", "test/numerics/performance", "bench/numerics/performance", ...(lu ? ["packages/wasm-toolchain", "packages/flint/scripts", "packages/flint/patches"] : [])]) visit(relative);
  if (validation) visit("test/numerics/linear_algebra");
  files.sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return { sha256: hash(JSON.stringify(files)), files: files.length };
}
const output = process.argv[2];
const lu = process.argv[3] === "--lu";
const validation = process.argv[3] === "--validation";
if (!output || ((lu || validation) ? process.argv.length !== 4 : process.argv.length !== 3)) throw new Error("usage: prepared-api-portable.cjs RECEIPT.json [--lu|--validation]");
if (fs.existsSync(output)) throw new Error("receipt already exists");
const before = snapshot();
const tests = validation ? ["test/numerics/linear_algebra/validation-overflow.cjs"] : lu ? ["test/numerics/performance/packed-lu.cjs"] : ["test/numerics/performance/prepared-functions.cjs", "test/numerics/performance/prepared-root-api.cjs"];
const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: root, encoding: "utf8", timeout: 240000, maxBuffer: 4*1024*1024,
  env: lu ? {...process.env, SAGEJS_WASM_TOOLCHAIN_ROOT:path.join(root,"absent-qualification-wasm"), SAGEJS_NUMERICAL_BROWSER_TESTS:"0"} : process.env,
});
const after = snapshot();
const same = before.sha256 === after.sha256;
const passed = result.status === 0 && same && new RegExp("(?:ℹ|#) pass " + ((lu || validation) ? "1" : "3") + "\\b").test(result.stdout);
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const version = spawnSync(python,["--version"],{encoding:"utf8",timeout:10000});
const receipt = {
  schema: validation ? "sagejs.validation-overflow-qualification/v1" : lu ? "sagejs.packed-lu-qualification/v1" : "sagejs.prepared-api-qualification/v1", passed,
  scope: validation ? "isolated-validation-regression-not-product-release" : lu ? "isolated-kernel-not-public-api" : "isolated-source-api-not-product-release",
  declared_source_commit: validation ? "0f3f7472a" : lu ? "3311fd402" : "9c5066f72",
  host: { platform: process.platform, arch: process.arch, node: process.version, python: (version.stdout || version.stderr || "").trim(), cpu: os.cpus()[0]?.model },
  before, after, unchanged: same,
  collector_sha256: hash(fs.readFileSync(__filename)),
  test_exit_code: result.status, test_signal: result.signal,
  tests: result.stdout.split(/\r?\n/).filter(line => /^(?:✔|✖|ℹ|# (?:tests|pass|fail|cancelled|skipped))/.test(line)),
  diagnostics: passed ? [] : [result.stderr, result.stdout, String(result.error || "")],
  limitations: ["not-browser-product", "not-npm-or-SEA", "not-performance-qualification", "not-full-suite", ...(lu ? ["native-and-javascript-only; Wasm qualified separately"] : [])],
};
fs.writeFileSync(output, JSON.stringify(receipt,null,2)+"\n", {flag:"wx"});
console.log(JSON.stringify({passed, receipt:output, snapshot:before.sha256}));
if (!passed) process.exitCode=1;
