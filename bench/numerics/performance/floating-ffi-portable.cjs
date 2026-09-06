"use strict";

// Collect focused source qualification, never overwrite an existing receipt.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../..");
const [output, commit] = process.argv.slice(2);
if (!output || !/^[a-f0-9]{40}$/.test(commit || "") || process.argv.length !== 4) {
  throw Error("usage: floating-ffi-portable.cjs RECEIPT.json SOURCE_COMMIT");
}
if (fs.existsSync(output)) throw Error("receipt already exists");
const hash = data => createHash("sha256").update(data).digest("hex");
function snapshot() {
  const files = [];
  function visit(relative) {
    if (["__pycache__", ".pnpm", ".bin"].includes(path.basename(relative)) || relative.endsWith(".pyc")) return;
    const full = path.join(root, relative);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(full).sort()) visit(relative + "/" + child);
    } else if (stat.isFile()) files.push([relative, hash(fs.readFileSync(full))]);
    else throw Error("unsupported source " + relative);
  }
  for (const name of ["src", "tools", "scripts", "architecture", "ffi", "dist", "bin", "index.cjs", "package.json", "pnpm-lock.yaml", "packages/flint/include", "packages/flint/node_modules", "packages/flint/package.json", "node_modules/web-tree-sitter", "test/helpers", "test/ffi-floating-slices.cjs", "test/dynamic-ffi-call-cache.cjs", "bench/numerics/performance/floating-ffi-portable.cjs"]) visit(name);
  files.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return { sha256: hash(JSON.stringify(files)), files: files.length };
}
const before = snapshot();
const tests = spawnSync(process.execPath, ["--test", "test/ffi-floating-slices.cjs", "test/dynamic-ffi-call-cache.cjs"], {
  cwd: root, encoding: "utf8", timeout: 240000, maxBuffer: 4 * 1024 * 1024,
});
const after = snapshot();
const passed = tests.status === 0 && before.sha256 === after.sha256 && /(?:ℹ|#) pass 5\b/.test(tests.stdout);
const receipt = {
  schema: "sagejs.floating-ffi-qualification/v1", passed,
  declared_source_commit: commit, before, after,
  host: { platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model },
  coverage: { standalone_c: true, generated_javascript: true, runtime: true, native_node_adapter: true },
  test_exit_code: tests.status, test_signal: tests.signal,
  stdout: tests.stdout, stderr: tests.stderr, error: String(tests.error || ""),
  limitations: ["focused-source-not-release", "not-full-suite", "not-performance-evidence", "no-Wasm-foreign-adapter"],
};
fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ passed, output, snapshot: before.sha256 }));
if (!passed) process.exitCode = 1;
