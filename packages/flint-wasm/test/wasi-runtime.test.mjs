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

  const fs = host.testing;
  const fullFile = new Uint8Array(limits.maxFileBytes);
  fs.writeFile("/tmp/full", fullFile);
  assertNoSpace(() => fs.appendFile("/tmp/full", new Uint8Array(1)));

  for (
    let index = 1;
    index < limits.maxTotalBytes / limits.maxFileBytes;
    index += 1
  ) {
    fs.writeFile(`/tmp/full-${index}`, fullFile);
  }
  assertNoSpace(() => fs.writeFile("/tmp/total-overflow", "x"));

  fs.unlink("/tmp/full");
  fs.writeFile("/tmp/reclaimed", fullFile);
  assert.equal(host.filesystemUsage().totalBytes, limits.maxTotalBytes);
});

test("the WASI memory filesystem bounds the number of files", () => {
  const host = createWasiHost();
  const { testing: fs, filesystemLimits: limits } = host;
  for (let index = 0; index < limits.maxFiles; index += 1) {
    fs.writeFile(`/tmp/file-${index}`, "");
  }
  assertNoSpace(() => fs.writeFile("/tmp/one-too-many", ""));
  fs.unlink("/tmp/file-0");
  fs.writeFile("/tmp/reused", "");
  assert.equal(host.filesystemUsage().fileCount, limits.maxFiles);
});

test("an unlinked open file retains quota until its last descriptor closes", () => {
  const host = createWasiHost();
  const { testing: fs } = host;
  fs.writeFile("/tmp/live", new Uint8Array(1024));
  const descriptor = fs.open("/tmp/live");
  fs.unlink("/tmp/live");
  assert.deepEqual(
    host.filesystemUsage(),
    Object.freeze({ fileCount: 1, totalBytes: 1024, openDescriptors: 5 }),
  );
  fs.close(descriptor);
  assert.deepEqual(
    host.filesystemUsage(),
    Object.freeze({ fileCount: 0, totalBytes: 0, openDescriptors: 4 }),
  );
});

test("WASI host disposal is deterministic and rejects subsequent use", () => {
  const host = createWasiHost();
  host.testing.writeFile("/tmp/value", "value");
  host.dispose();
  host.dispose();
  assert.throws(() => host.filesystemUsage(), /disposed/);
  assert.throws(() => host.testing.writeFile("/tmp/after", "x"), /disposed/);
});
