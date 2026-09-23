// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../compiler.cjs");

function sources() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-resident-compile-"));
  const packageDirectory = join(directory, "example");
  mkdirSync(packageDirectory);
  writeFileSync(join(packageDirectory, "__init__.py"), "");
  const helper = join(packageDirectory, "helper.py");
  const entry = join(packageDirectory, "entry.py");
  writeFileSync(helper, `from sagejs.native import native
@native
def shifted(x: int) -> int:
    return x + 1
`);
  writeFileSync(entry, `from sagejs.native import native
from .helper import shifted
@native
def entry(x: int) -> int:
    return shifted(x) * 2
`);
  return { directory, entry, helper };
}

test("resident compile hits preserve provenance and invalidate dependencies", async (t) => {
  const { directory, entry, helper } = sources();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cacheRoot = join(directory, "cache");
  const first = await compileKernel({ sourcePath: entry, cacheRoot });
  assert.equal(first.residentCached, false);
  assert.equal(require(first.modulePath).entry.tagged(8n), 18n);

  const warmed = await compileKernel({ sourcePath: entry, cacheRoot });
  assert.equal(warmed.residentCached, true);
  assert.equal(warmed.cached, true);
  assert.equal(warmed.cacheKey, first.cacheKey);
  assert.deepEqual(warmed.ir, first.ir);
  assert.equal(warmed.coreSourcePath, first.coreSourcePath);

  writeFileSync(
    helper,
    readFileSync(helper, "utf8").replace("x + 1", "x + 3"),
  );
  const changed = await compileKernel({ sourcePath: entry, cacheRoot });
  assert.equal(changed.residentCached, false);
  assert.notEqual(changed.cacheKey, first.cacheKey);
  assert.equal(require(changed.modulePath).entry.tagged(8n), 22n);

  rmSync(changed.addonPath);
  const rebuilt = await compileKernel({ sourcePath: entry, cacheRoot });
  assert.equal(rebuilt.residentCached, false);
  assert.equal(rebuilt.cacheKey, changed.cacheKey);
  assert.equal(require(rebuilt.modulePath).entry.tagged(8n), 22n);

  rmSync(rebuilt.manifestPath);
  const remanifested = await compileKernel({ sourcePath: entry, cacheRoot });
  assert.equal(remanifested.residentCached, false);
  assert.equal(remanifested.cacheKey, rebuilt.cacheKey);
  assert.equal(require(remanifested.modulePath).entry.tagged(8n), 22n);

  writeFileSync(
    entry,
    readFileSync(entry, "utf8").replace("shifted(x) * 2", "shifted(x) * 3"),
  );
  const changedEntry = await compileKernel({ sourcePath: entry, cacheRoot });
  assert.equal(changedEntry.residentCached, false);
  assert.notEqual(changedEntry.cacheKey, remanifested.cacheKey);
  assert.equal(require(changedEntry.modulePath).entry.tagged(8n), 33n);
});

test("concurrent requests share one resident compilation", async (t) => {
  const { directory, entry } = sources();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cacheRoot = join(directory, "cache");
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    compileKernel({ sourcePath: entry, cacheRoot })));
  assert.equal(new Set(results.map((result) => result.cacheKey)).size, 1);
  assert.equal(results.filter((result) => !result.residentCached).length, 1);
  assert.equal(results.filter((result) => result.residentCached).length, 3);
});

test("resident lookup does not bypass option validation", async (t) => {
  const { directory, entry } = sources();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cacheRoot = join(directory, "cache");
  await compileKernel({ sourcePath: entry, cacheRoot });
  await assert.rejects(
    () => compileKernel({ sourcePath: entry, cacheRoot, profileSymbols: "yes" }),
    /profileSymbols must be a boolean/,
  );
});

test("resident requests with different function selections stay distinct", async (t) => {
  const { directory, entry } = sources();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cacheRoot = join(directory, "cache");
  await compileKernel({ sourcePath: entry, cacheRoot });
  const selected = await compileKernel({
    sourcePath: entry,
    cacheRoot,
    functions: ["entry"],
  });
  assert.equal(selected.residentCached, false);
  const selectedAgain = await compileKernel({
    sourcePath: entry,
    cacheRoot,
    functions: ["entry"],
  });
  assert.equal(selectedAgain.residentCached, true);
});

test("failed resident builds are evicted", async (t) => {
  const { directory, entry } = sources();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cacheRoot = join(directory, "cache");
  writeFileSync(entry, "this is not valid python source\n");
  await assert.rejects(() => compileKernel({ sourcePath: entry, cacheRoot }));
  writeFileSync(entry, `from sagejs.native import native
@native
def entry(x: int) -> int:
    return x + 9
`);
  const recovered = await compileKernel({ sourcePath: entry, cacheRoot });
  assert.equal(recovered.residentCached, false);
  assert.equal(require(recovered.modulePath).entry.tagged(8n), 17n);
});

test("resident compilations have a bounded least-recently-used lifetime", async (t) => {
  const requests = [];
  for (let index = 0; index < 5; index += 1) {
    const { directory, entry } = sources();
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    requests.push({ entry, cacheRoot: join(directory, "cache") });
  }
  for (const request of requests) {
    const result = await compileKernel({
      sourcePath: request.entry,
      cacheRoot: request.cacheRoot,
    });
    assert.equal(result.residentCached, false);
  }
  const revisited = await compileKernel({
    sourcePath: requests[0].entry,
    cacheRoot: requests[0].cacheRoot,
  });
  assert.equal(revisited.residentCached, false);
  assert.equal(revisited.cached, true);
});
