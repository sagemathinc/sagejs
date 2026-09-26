// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");

const root = resolve(__dirname, "..");
const sourcePath = join(root, "bench/native_resident_exact_scratch_frame.py");

test("recursive and live-arena graphs retain their existing fallback", async () => {
  const recursive = await lowerSource(
    readFileSync(sourcePath, "utf8"), sourcePath,
  );
  const recursiveFunction = recursive.functions.find(
    fn => fn.name === "resident_exact_scratch_recursive",
  );
  assert.equal(recursiveFunction.analysis.residentExactScratch, undefined);

  const arenaPath = join(root, "bench/native_live_exact_arena.py");
  const arena = await lowerSource(readFileSync(arenaPath, "utf8"), arenaPath);
  const arenaFunction = arena.functions.find(
    fn => fn.name === "live_arena_relation_step",
  );
  assert(arenaFunction.analysis.liveExactWorkspace);
  assert.equal(arenaFunction.analysis.residentExactScratch, undefined);
});

test("an authenticated exact graph receives one disjoint resident frame", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const functions = new Map(ir.functions.map(fn => [fn.name, fn]));
  const rootFn = functions.get("resident_exact_scratch_root");
  const middle = functions.get("_resident_exact_scratch_middle");
  const leaf = functions.get("resident_exact_scratch_leaf");
  for (const fn of [rootFn, middle, leaf]) {
    assert.equal(fn.analysis.residentExactScratch.authority,
      "closed-acyclic-exact-scratch-frame-v1");
    assert(fn.analysis.residentExactScratch.frameSlots >=
      fn.analysis.residentExactScratch.localSlots);
  }
  assert.equal(rootFn.analysis.residentExactScratch.frameSlots,
    rootFn.analysis.residentExactScratch.localSlots +
    middle.analysis.residentExactScratch.frameSlots);
  assert.equal(middle.analysis.residentExactScratch.frameSlots,
    middle.analysis.residentExactScratch.localSlots +
    leaf.analysis.residentExactScratch.frameSlots);

  const core = generateHostCore(ir).source;
  const rootBody = core.match(
    /static int native_resident_exact_scratch_root\([^;]+?\n\{[\s\S]*?\n\}/,
  )[0];
  const middleBody = core.match(
    /static int native__resident_exact_scratch_middle\([^;]+?\n\{[\s\S]*?\n\}/,
  )[0];
  const leafBody = core.match(
    /static int native_resident_exact_scratch_leaf\([^;]+?\n\{[\s\S]*?\n\}/,
  )[0];
  assert.match(rootBody, /mpz_ptr sagejs_owned_exact_scratch = NULL/);
  assert.doesNotMatch(rootBody, /mpz_t sagejs_owned_exact_scratch\[/);
  assert.match(rootBody, /if \(sagejs_exact_scratch_frame == NULL\)/);
  assert.match(rootBody, /mpz_set_ui\(sagejs_scratch_0, 0\)/);
  assert.match(rootBody, /resident exact scratch frame capacity mismatch/);
  assert.match(middleBody,
    /native_resident_exact_scratch_leaf\(status, sagejs_exact_scratch_frame,/);
  assert.doesNotMatch(
    `${rootBody}\n${middleBody}\n${leafBody}`,
    /mpz_init\(sagejs_scratch_[0-9]+\)/,
  );
  assert.match(core, /mpz_init\(sagejs_scratch_[0-9]+\)/);

  const rejects = (mutate, pattern = /invalid resident exact scratch/) => {
    const corrupted = structuredClone(ir);
    const corruptedRoot = corrupted.functions.find(
      fn => fn.name === "resident_exact_scratch_root");
    const corruptedFunctions = new Map(
      corrupted.functions.map(fn => [fn.name, fn]),
    );
    mutate(
      corruptedRoot.analysis.residentExactScratch,
      corruptedRoot,
      corruptedFunctions,
    );
    assert.throws(() => generateHostCore(corrupted), pattern);
  };
  rejects(scratch => { scratch.frameSlots = Number.MAX_SAFE_INTEGER; });
  rejects(scratch => { scratch.frameSlots += 1; });
  rejects(scratch => { scratch.localSlots += 1; });
  rejects(scratch => { scratch.childBaseOffset += 1; });
  rejects(scratch => { scratch.maximumFrameSlots += 1; });
  rejects(scratch => { scratch.qualifiedChildren = []; });
  rejects(scratch => { scratch.ownership = "untrusted"; });
  rejects(scratch => { scratch.cleanup = "untrusted"; });
  rejects(scratch => { scratch.frameSlots = scratch.localSlots; });
  rejects((_scratch, _root, corruptedFunctions) => {
    corruptedFunctions.get("_resident_exact_scratch_middle")
      .analysis.residentExactScratch.frameSlots += 1;
  });
});

test("resident frames preserve dynamic, JavaScript and GMP results and errors", async t => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-resident-exact-scratch-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const compiled = await compileKernel({ sourcePath,
    cacheRoot: join(temporary, "cache") });
  const run = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const root = module.resident_exact_scratch_root;
const leaf = module.resident_exact_scratch_leaf;
for (const value of [7n, -13n, (1n << 90n) + 5n]) {
  for (const calls of [1n, 4n]) {
    const expected = root.javascript(value, calls, 5n, -1n);
    assert.equal(root(value, calls, 5n, -1n), expected);
    assert.equal(root.gmp(value, calls, 5n, -1n), expected);
  }
  const expectedLeaf = leaf.javascript(value, 6n, false);
  assert.equal(leaf.gmp(value, 6n, false), expectedLeaf);
  assert.throws(() => root.gmp(value, 4n, 5n, 2n),
    /resident scratch forced failure/);
  assert.equal(root.gmp(value, 4n, 5n, -1n),
    root.javascript(value, 4n, 5n, -1n));
}
`, compiled.modulePath], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
});
