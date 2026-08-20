import assert from "node:assert/strict";
import test from "node:test";

import {
  WASI_MEMORY_FILESYSTEM_LIMITS,
  createWasiHost,
  wasiRuntimePolicy,
} from "../src/wasi-runtime.mjs";

function assertNoSpace(callback) {
  assert.throws(callback, (error) => error?.code === "ENOSPC");
}

test("the WASI memory filesystem enforces its public resource contract", () => {
  const host = createWasiHost();
  const limits = WASI_MEMORY_FILESYSTEM_LIMITS;
  assert.equal(wasiRuntimePolicy(), limits);
  assert.equal(host.filesystemLimits, limits);
  assert.ok(Object.isFrozen(limits));

  const { filesystem: fs } = host;
  const fullFile = new Uint8Array(limits.maxFileBytes);
  fs.writeFileSync("/tmp/full", fullFile);
  assertNoSpace(() => fs.appendFileSync("/tmp/full", new Uint8Array(1)));

  for (
    let index = 1;
    index < limits.maxTotalBytes / limits.maxFileBytes;
    index += 1
  ) {
    fs.writeFileSync(`/tmp/full-${index}`, fullFile);
  }
  assertNoSpace(() => fs.writeFileSync("/tmp/total-overflow", "x"));

  fs.unlinkSync("/tmp/full");
  fs.writeFileSync("/tmp/reclaimed", fullFile);
  assert.equal(host.filesystemUsage().totalBytes, limits.maxTotalBytes);
});

test("the WASI memory filesystem bounds the number of files", () => {
  const host = createWasiHost();
  const { filesystem: fs, filesystemLimits: limits } = host;
  for (let index = 0; index < limits.maxFiles; index += 1) {
    fs.writeFileSync(`/tmp/file-${index}`, "");
  }
  assertNoSpace(() => fs.writeFileSync("/tmp/one-too-many", ""));
  fs.unlinkSync("/tmp/file-0");
  fs.writeFileSync("/tmp/reused", "");
  assert.equal(host.filesystemUsage().fileCount, limits.maxFiles);
});
