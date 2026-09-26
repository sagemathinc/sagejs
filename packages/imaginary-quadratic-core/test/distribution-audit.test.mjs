import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(packageRoot, "scripts/audit-distribution.mjs");
const artifact = path.join(
  packageRoot,
  "target/wasm32-wasip1/release/sagejs_imaginary_quadratic_core.wasm",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("the development build has a complete locked archive and ABI inventory", () => {
  const summary = JSON.parse(execFileSync("node", [script], { encoding: "utf8" }));
  assert.equal(summary.artifact.sha256, sha256(fs.readFileSync(artifact)));
  assert.equal(summary.packages.length, 13);
  assert.equal(summary.packages.filter(({ source }) => source !== "first-party").length, 12);
  for (const pkg of summary.packages.filter(({ source }) => source !== "first-party")) {
    assert.match(pkg.archiveSha256, /^[0-9a-f]{64}$/);
    assert.ok(pkg.notices.length > 0, `missing notice for ${pkg.package}`);
    for (const notice of pkg.notices) assert.match(notice.sha256, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(summary.wasm.memories, [{ flags: 1, initial: 256, maximum: 4096 }]);
  assert.deepEqual(summary.wasm.imports.map(({ name }) => name), [
    "environ_get", "environ_sizes_get", "fd_write", "proc_exit",
  ]);
});

test("the inventory refuses an unverified artifact", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-quadratic-audit-"));
  try {
    const bad = path.join(temp, "not-a-reactor.wasm");
    fs.writeFileSync(bad, "not a wasm module");
    const result = spawnSync("node", [script, bad], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});
