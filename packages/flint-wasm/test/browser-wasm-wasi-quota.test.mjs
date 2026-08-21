import assert from "node:assert/strict";
import test from "node:test";
import {
  createWasiHost,
  WASI_MEMORY_FILESYSTEM_LIMITS,
} from "../src/wasi-runtime.mjs";

function assertEnospc(callback) {
  assert.throws(callback, (error) => error?.code === "ENOSPC");
}

test("the authenticated WASI host enforces byte, file, and per-file quotas", () => {
  const limits = WASI_MEMORY_FILESYSTEM_LIMITS;
  assert.equal(Object.isFrozen(limits), true);
  for (const name of ["maxFileBytes", "maxTotalBytes", "maxFiles"]) {
    assert.ok(Number.isSafeInteger(limits[name]) && limits[name] > 0, `${name} is not bounded`);
  }
  assert.ok(limits.maxFileBytes <= limits.maxTotalBytes);
  assert.ok(limits.maxTotalBytes <= limits.maxFileBytes * limits.maxFiles);
  assert.ok(limits.maxFileBytes <= 64 * 1024 * 1024, "per-file ceiling is too large for mobile browsers");
  assert.ok(limits.maxTotalBytes <= 128 * 1024 * 1024, "filesystem ceiling is too large for mobile browsers");
  assert.ok(limits.maxFiles <= 4096, "file-count ceiling is too large");

  const perFile = createWasiHost();
  assert.equal(perFile.filesystemLimits, limits);
  assertEnospc(() => perFile.filesystem.writeFileSync(
    "/tmp/too-large",
    Buffer.alloc(limits.maxFileBytes + 1),
  ));

  const count = createWasiHost();
  for (let index = 0; index < limits.maxFiles; index += 1) {
    count.filesystem.writeFileSync(`/tmp/f-${index}`, Buffer.alloc(0));
  }
  assertEnospc(() => count.filesystem.writeFileSync("/tmp/one-too-many", Buffer.alloc(0)));

  const total = createWasiHost();
  const chunk = limits.maxFileBytes;
  let written = 0;
  let index = 0;
  while (written + chunk <= limits.maxTotalBytes && index < limits.maxFiles) {
    total.filesystem.writeFileSync(`/tmp/b-${index}`, Buffer.alloc(chunk));
    written += chunk;
    index += 1;
  }
  const remainder = limits.maxTotalBytes - written;
  if (remainder > 0 && index < limits.maxFiles) {
    total.filesystem.writeFileSync(`/tmp/b-${index}`, Buffer.alloc(remainder));
    index += 1;
  }
  const usage = total.filesystemUsage();
  assert.equal(Object.isFrozen(usage), true);
  assert.equal(usage.totalBytes, limits.maxTotalBytes);
  assertEnospc(() => total.filesystem.writeFileSync(`/tmp/b-${index}`, Buffer.from([1])));
  assert.equal(total.filesystemUsage().totalBytes, limits.maxTotalBytes);
});
