#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const packagePath = join(root, "packages", "flint");
const flint = require(packagePath);
const manifest = require(join(
  packagePath, "build", "generated-ffi", "manifest.json",
));
const generated = require(join(
  packagePath, "build", "generated-ffi", manifest.addon,
));
const accounted = generated.__sagejsFfiResourceExternalMemory;
const MiB = 1024 * 1024;

assert.equal(typeof accounted, "function");
assert.deepEqual(manifest.resource_lifecycle, {
  model: "node-api-basic-post-finalizer-v1",
  self_finalizing: true,
});
assert.deepEqual(
  flint.__sagejs_ffi_manifest__.resource_lifecycle,
  manifest.resource_lifecycle,
);

function runChild(source, flags = []) {
  const result = spawnSync(process.execPath, [...flags, "-e", source], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(
    result.status,
    0,
    `resource-memory child failed:\n${result.stdout}\n${result.stderr}`,
  );
  return JSON.parse(result.stdout.trim());
}

function closeTwice(resource, close) {
  close(resource);
  assert.equal(accounted(resource), 0n);
  close(resource);
  assert.equal(accounted(resource), 0n);
}

{
  const empty = flint.ffiFmpqMatrixCreate(0n, 0n);
  const one = flint.ffiFmpqMatrixCreate(1n, 1n);
  const large = flint.ffiFmpqMatrixCreate(500n, 500n);
  const structural = accounted(empty);
  const entryBytes = accounted(one) - structural;
  assert.equal(entryBytes, 16n);
  assert.equal(
    accounted(large),
    structural + 500n * 500n * entryBytes,
  );

  const beforeMutation = accounted(one);
  assert.equal(
    flint.ffiFmpqMatrixSetEntry(one, 0n, 0n, 1n << 5000n, 3n),
    true,
  );
  assert.ok(accounted(one) >= beforeMutation + 600n);
  const beforeRank = accounted(one);
  assert.equal(flint.ffiFmpqMatrixRank(one), 1n);
  assert.equal(accounted(one), beforeRank);

  const negated = flint.ffiFmpqMatrixNeg(one);
  const scaled = flint.ffiFmpqMatrixScalarMul(one, 1n << 5000n, 1n);
  const determinant = flint.ffiFmpqMatrixDet(one);
  const trace = flint.ffiFmpqMatrixTrace(one);
  const formatted = flint.ffiFmpqMatrixFormat(one);
  const serialized = flint.ffiFmpqMatrixSerialize(one);
  assert.equal(accounted(negated), accounted(one));
  assert.ok(accounted(scaled) > accounted(one));
  assert.ok(accounted(determinant) > 16n);
  assert.ok(accounted(trace) > 16n);
  assert.ok(
    accounted(formatted) >= flint.ffiFlintByteRegionLength(formatted),
  );
  assert.ok(
    accounted(serialized) >= flint.ffiFlintByteRegionLength(serialized),
  );

  closeTwice(serialized, flint.ffiFlintByteRegionClose);
  closeTwice(formatted, flint.ffiFlintByteRegionClose);
  closeTwice(trace, flint.ffiFmpqValueClose);
  closeTwice(determinant, flint.ffiFmpqValueClose);
  closeTwice(scaled, flint.ffiFmpqMatrixClose);
  closeTwice(negated, flint.ffiFmpqMatrixClose);
  closeTwice(large, flint.ffiFmpqMatrixClose);
  closeTwice(one, flint.ffiFmpqMatrixClose);
  closeTwice(empty, flint.ffiFmpqMatrixClose);
}

{
  function fill(columns) {
    const matrix = flint.ffiFmpqMatrixCreate(1n, BigInt(columns));
    const started = process.hrtime.bigint();
    for (let column = 0; column < columns; column += 1) {
      assert.equal(flint.ffiFmpqMatrixSetEntry(
        matrix, 0n, BigInt(column), BigInt(column + 1), 3n,
      ), true);
    }
    const elapsed = Number(process.hrtime.bigint() - started);
    flint.ffiFmpqMatrixClose(matrix);
    return elapsed;
  }
  const median = (values) => [...values].sort((left, right) => left - right)[1];
  fill(40_000);
  const small = median([fill(20_000), fill(20_000), fill(20_000)]);
  const large = median([fill(40_000), fill(40_000), fill(40_000)]);
  assert.ok(
    large / small < 3.2,
    `per-entry retained-size updates regressed: 2x input took ${large / small}x`,
  );
}

{
  const result = runChild(`
    const flint = require(${JSON.stringify(packagePath)});
    const reclaimBelow = 192 * 1024 * 1024;
    for (let index = 0; index < 80; index += 1) {
      flint.ffiFmpqMatrixCreate(500n, 500n);
    }
    const peakRss = process.memoryUsage.rss();
    let turns = 0;
    const poll = () => setImmediate(() => {
      turns += 1;
      const yieldedRss = process.memoryUsage.rss();
      if (yieldedRss < reclaimBelow || turns === 20) {
        process.stdout.write(JSON.stringify({peakRss, yieldedRss, turns}));
      } else {
        poll();
      }
    });
    poll();
  `);
  if (process.platform !== "win32") {
    assert.ok(
      result.yieldedRss < 192 * MiB,
      `unreachable resources retained ${result.yieldedRss / MiB} MiB after yield`,
    );
  }
}

{
  const result = runChild(`
    const flint = require(${JSON.stringify(packagePath)});
    for (let index = 0; index < 80; index += 1) {
      const matrix = flint.ffiFmpqMatrixCreate(500n, 500n);
      flint.ffiFmpqMatrixClose(matrix);
      flint.ffiFmpqMatrixClose(matrix);
    }
    process.stdout.write(JSON.stringify({rss: process.memoryUsage.rss()}));
  `);
  if (process.platform !== "win32") {
    assert.ok(
      result.rss < 192 * MiB,
      `explicit-close loop retained ${result.rss / MiB} MiB`,
    );
  }
}

{
  const direct = runChild(`
    const flint = require(${JSON.stringify(packagePath)});
    for (let index = 0; index < 24; index += 1) {
      flint.ffiFmpqMatrixCreate(300n, 300n);
    }
    global.gc();
    setImmediate(() => process.stdout.write(JSON.stringify({
      rss: process.memoryUsage.rss(),
    })));
  `, ["--expose-gc"]);
  if (process.platform !== "win32") assert.ok(direct.rss < 160 * MiB);

  const tokenRegistry = runChild(`
    const flint = require(${JSON.stringify(packagePath)});
    let finalized = 0;
    const count = 16;
    const registry = new FinalizationRegistry((handle) => {
      flint.ffiFmpqMatrixClose(handle);
      finalized += 1;
    });
    (() => {
      for (let index = 0; index < count; index += 1) {
        const token = {};
        registry.register(
          token, flint.ffiFmpqMatrixCreate(200n, 200n), token,
        );
      }
    })();
    let turns = 0;
    const poll = () => {
      global.gc();
      setImmediate(() => {
        turns += 1;
        if (finalized === count || turns === 20) {
          process.stdout.write(JSON.stringify({finalized, turns}));
        } else {
          poll();
        }
      });
    };
    poll();
  `, ["--expose-gc"]);
  assert.equal(tokenRegistry.finalized, 16);
}

process.stdout.write(JSON.stringify({
  schema: "sagejs.ffi/resource-memory-accounting-v1",
  status: "ok",
}) + "\n");
