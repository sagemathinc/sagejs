"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  isVerifiedFixedSpanAccess,
  verifyCheckedBoundsProofs,
} = require("../checked-bounds-proofs.cjs");
const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const witnessPath = join(__dirname, "checked_fixed_span_witness.py");
const witnessSource = readFileSync(witnessPath, "utf8");

function operations(body) {
  const result = [];
  function visit(items) {
    for (const operation of items || []) {
      result.push(operation);
      visit(operation.body);
      visit(operation.alternative);
      visit(operation.condition?.operations);
      visit(operation.right?.operations);
    }
  }
  visit(body);
  return result;
}

function functionOperations(ir, name) {
  const fn = ir.functions.find((candidate) => candidate.name === name);
  assert.ok(fn, `missing IR function ${name}`);
  return operations(fn.body);
}

function accesses(ir, name) {
  return functionOperations(ir, name).filter((operation) =>
    ["uint64.buffer.get", "uint64.buffer.set"].includes(operation.kind)
  );
}

function emittedFunction(source, name) {
  const marker = `static int native_${name}(`;
  let start = source.indexOf(marker);
  while (start !== -1 &&
      source.slice(start, source.indexOf("\n", start)).endsWith(";")) {
    start = source.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted function ${name}`);
  const stop = source.indexOf("\n}\n", start);
  assert.notEqual(stop, -1, `unterminated emitted function ${name}`);
  return source.slice(start, stop + 3);
}

test("fixed checked views receive stable independently verified bounds proofs", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  const fixed = accesses(ir, "fixed_span_sum");
  assert.equal(fixed.length, 1);
  assert.deepEqual(fixed[0].boundsProof, {
    authority: "checked-uint64-fixed-span-range-v1",
    accessOperation: fixed[0].id,
    viewOperation: "fixed_span_sum:3",
    rangeOperation: "fixed_span_sum:15",
    buffer: "view",
    index: "index",
    indexType: "int64",
    viewLength: "9",
    start: "0",
    stop: "9",
    step: "1",
    iterations: "9",
    minimum: "0",
    maximum: "8",
  });
  assert.equal(isVerifiedFixedSpanAccess(fixed[0]), true);
  const updated = accesses(ir, "fixed_span_update");
  assert.equal(updated.filter(isVerifiedFixedSpanAccess).length, 2);
  assert.equal(updated.filter((operation) =>
    !isVerifiedFixedSpanAccess(operation)).length, 1);
  for (const name of [
    "too_wide",
    "dynamic_stop",
    "dynamic_span",
    "negative_range",
    "affine_index",
    "rebound_view",
    "rebound_index",
    "loop_carried_view",
    "nested_index_write",
    "scoped_view_write",
  ]) {
    assert.ok(accesses(ir, name).every((operation) =>
      operation.boundsProof === undefined &&
      !isVerifiedFixedSpanAccess(operation)
    ), `${name} unexpectedly received a proof`);
  }

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" }).source;
  const fixedBody = emittedFunction(core, "fixed_span_sum");
  assert.doesNotMatch(fixedBody, /sagejs_signed_buffer_index/);
  assert.match(fixedBody, /\.data\[\(size_t\) /);
  assert.match(emittedFunction(core, "too_wide"), /sagejs_signed_buffer_index/);

  const serialized = JSON.stringify(ir);
  const repeated = await lowerSource(witnessSource, witnessPath);
  assert.equal(JSON.stringify(repeated), serialized);
  const parsedWithoutClaim = JSON.parse(serialized);
  const unclaimedAccess = accesses(parsedWithoutClaim, "fixed_span_sum")[0];
  delete unclaimedAccess.boundsProof;
  assert.equal(isVerifiedFixedSpanAccess(unclaimedAccess), false);
  const unverifiedCore = generateHostCore(parsedWithoutClaim, {
    moduleIdentity: "0123456789abcdef",
  }).source;
  assert.match(
    emittedFunction(unverifiedCore, "fixed_span_sum"),
    /sagejs_signed_buffer_index/,
  );
  assert.equal(isVerifiedFixedSpanAccess(unclaimedAccess), false);

  const parsed = JSON.parse(serialized);
  const parsedAccess = accesses(parsed, "fixed_span_sum")[0];
  assert.equal(isVerifiedFixedSpanAccess(parsedAccess), false);
  const reverifiedCore = generateHostCore(parsed, {
    moduleIdentity: "0123456789abcdef",
  }).source;
  assert.doesNotMatch(
    emittedFunction(reverifiedCore, "fixed_span_sum"),
    /sagejs_signed_buffer_index/,
  );
  assert.equal(isVerifiedFixedSpanAccess(parsedAccess), true);
  delete parsedAccess.boundsProof;
  verifyCheckedBoundsProofs(parsed.functions);
  assert.equal(isVerifiedFixedSpanAccess(parsedAccess), false);

  for (const field of [
    "authority",
    "accessOperation",
    "viewOperation",
    "rangeOperation",
    "viewLength",
    "maximum",
  ]) {
    const forged = JSON.parse(serialized);
    accesses(forged, "fixed_span_sum")[0].boundsProof[field] = "forged";
    assert.throws(
      () => verifyCheckedBoundsProofs(forged.functions),
      /invalid checked bounds proof/,
    );
  }

  const mutated = JSON.parse(serialized);
  accesses(mutated, "fixed_span_sum")[0].index = "start";
  assert.throws(
    () => generateHostCore(mutated, { moduleIdentity: "0123456789abcdef" }),
    /invalid checked bounds proof/,
  );
});

test("fixed-span optimization preserves checked public behavior", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "sagejs-fixed-span-"));
  try {
    const built = await compileKernel({ sourcePath: witnessPath, cacheDirectory });
    const module = require(built.modulePath);
    for (const backend of ["javascript", "gmp", "tagged"]) {
      const sum = module.fixed_span_sum;
      const values = sum.createUInt64Buffer([
        100n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 200n,
      ]);
      assert.equal(sum[backend](values, 1n), 45n);
      assert.deepEqual(Array.from(values), [
        100n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 200n,
      ]);

      const update = module.fixed_span_update;
      const mutable = update.createUInt64Buffer([
        100n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 200n,
      ]);
      assert.equal(update[backend](mutable, 1n), 10n);
      assert.deepEqual(Array.from(mutable), [
        100n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 200n,
      ]);

      const short = sum.createUInt64Buffer([1n, 2n, 3n]);
      assert.throws(
        () => sum[backend](short, 0n),
        /UInt64Buffer view is outside its buffer/,
      );
      assert.deepEqual(Array.from(short), [1n, 2n, 3n]);
    }
  } finally {
    rmSync(cacheDirectory, { recursive: true, force: true });
  }
});
