import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const script = path.join(packageRoot, "scripts/audit-distribution.mjs");
const recordedInventory = path.join(
  packageRoot, "development-distribution-inventory-2026-09-27.json",
);
const artifact = path.join(
  packageRoot,
  "target/wasm32-wasip1/release/sagejs_imaginary_quadratic_core.wasm",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("the development build has a complete locked archive and ABI inventory", () => {
  const summary = JSON.parse(execFileSync("node", [script], { encoding: "utf8" }));
  assert.equal(summary.schema,
    "sagejs.imaginary-quadratic/development-distribution-inventory-v1");
  assert.match(summary.scope, /not an artifact-derived SBOM or distribution approval/);
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

test("the saved development inventory remains bound to its source inputs", () => {
  const recorded = JSON.parse(fs.readFileSync(recordedInventory, "utf8"));
  assert.equal(recorded.schema,
    "sagejs.imaginary-quadratic/development-distribution-inventory-v1");
  assert.equal(recorded.artifact.bytes, 346869);
  assert.equal(recorded.artifact.sha256,
    "5aad704d7d6f9af61301431f1f76807e54a614d5132b9b5066626e7aff51915e");
  assert.equal(recorded.inputs.length, 12);
  for (const input of recorded.inputs) {
    assert.equal(input.sha256, sha256(fs.readFileSync(
      path.join(repositoryRoot, input.file),
    )), `stale source input ${input.file}`);
  }
});

test("the review inventory can be saved without changing its verified contents", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-quadratic-inventory-"));
  try {
    const output = path.join(temp, "inventory.json");
    const printed = JSON.parse(execFileSync("node", [script], { encoding: "utf8" }));
    const stdout = execFileSync("node", [script, "--output", output], {
      encoding: "utf8",
    });
    assert.equal(stdout, "");
    assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), printed);
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});

test("the inventory refuses an unverified artifact", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-quadratic-audit-"));
  try {
    const bad = path.join(temp, "not-a-reactor.wasm");
    const output = path.join(temp, "unverified.json");
    fs.writeFileSync(bad, "not a wasm module");
    const result = spawnSync("node", [script, bad, "--output", output], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});

test("saving an inventory rejects an existing output symlink", {
  skip: process.platform === "win32" && "creating file symlinks may require elevation",
}, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-quadratic-output-"));
  try {
    const output = path.join(temp, "inventory.json");
    const before = sha256(fs.readFileSync(artifact));
    fs.symlinkSync(artifact, output, "file");
    const result = spawnSync("node", [script, "--output", output], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.equal(sha256(fs.readFileSync(artifact)), before);
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});
