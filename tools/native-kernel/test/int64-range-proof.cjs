"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { analyzeExactModule } = require("../exact-analysis.cjs");
const { lowerSource } = require("../ir.cjs");

const witnessPath = join(__dirname, "int64_range_proof_witness.py");
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

function emittedFunction(source, marker) {
  let start = source.indexOf(marker);
  while (
    start !== -1 &&
    source.slice(start, source.indexOf("\n", start)).endsWith(";")
  ) {
    start = source.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted function ${marker}`);
  const stop = source.indexOf("\n}\n", start);
  assert.notEqual(stop, -1, `unterminated emitted function ${marker}`);
  return source.slice(start, stop + 3);
}

function functionOperations(ir, name) {
  const fn = ir.functions.find((candidate) => candidate.name === name);
  assert.ok(fn, `missing IR function ${name}`);
  return operations(fn.body);
}

function rangeOperation(ir, name) {
  const ranges = functionOperations(ir, name).filter(
    (operation) => operation.kind === "loop.range_int64",
  );
  assert.equal(ranges.length, 1, `${name} must contain one int64 range`);
  return ranges[0];
}

test("constant int64 range proofs remove only proven-safe latch checks", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  analyzeExactModule(ir.functions);

  const safe = rangeOperation(ir, "safe_constant_range");
  assert.deepEqual(safe.incrementProof, {
    authority: "constant-int64-range-v1",
    start: "0",
    stop: "9",
    step: "1",
    iterations: "9",
    last: "8",
    next: "9",
  });

  const continued = rangeOperation(ir, "safe_constant_range_with_continue");
  assert.equal(
    continued.incrementProof?.authority,
    "constant-int64-range-v1",
  );
  const continueOperations = functionOperations(
    ir,
    "safe_constant_range_with_continue",
  ).filter((operation) => operation.kind === "loop.continue");
  assert.equal(continueOperations.length, 1);
  assert.equal(
    continueOperations[0].range.incrementProof?.authority,
    "constant-int64-range-v1",
  );
  assert.equal(rangeOperation(ir, "dynamic_range").incrementProof, undefined);
  assert.equal(
    rangeOperation(ir, "near_overflow_constant_range").incrementProof,
    undefined,
  );
  assert.equal(
    rangeOperation(ir, "stale_control_flow_range").incrementProof,
    undefined,
  );
  assert.equal(
    rangeOperation(ir, "stale_branch_range").incrementProof,
    undefined,
  );

  // Rerunning analysis over changed IR must revoke authority from the old
  // operation shape rather than retaining its previously attached proof.
  const rerunIr = await lowerSource(witnessSource, witnessPath);
  analyzeExactModule(rerunIr.functions);
  const rerunSafe = rangeOperation(rerunIr, "safe_constant_range");
  assert.equal(
    rerunSafe.incrementProof?.authority,
    "constant-int64-range-v1",
  );
  const rerunContinued = rangeOperation(
    rerunIr,
    "safe_constant_range_with_continue",
  );
  const rerunContinue = functionOperations(
    rerunIr,
    "safe_constant_range_with_continue",
  ).find((operation) => operation.kind === "loop.continue");
  assert.equal(
    rerunContinue.range.incrementProof?.authority,
    "constant-int64-range-v1",
  );
  rerunSafe.stop = "not_a_constant";
  rerunContinued.stop = "not_a_constant";
  analyzeExactModule(rerunIr.functions);
  assert.equal(rerunSafe.incrementProof, undefined);
  assert.equal(rerunContinued.incrementProof, undefined);
  assert.equal(rerunContinue.range.incrementProof, undefined);

  const core = generateHostCore(ir, {
    moduleIdentity: "0123456789abcdef",
  }).source;
  const safeBody = emittedFunction(
    core,
    "static int native_safe_constant_range(",
  );
  const continuedBody = emittedFunction(
    core,
    "static int native_safe_constant_range_with_continue(",
  );
  const dynamicBody = emittedFunction(core, "static int native_dynamic_range(");
  const overflowBody = emittedFunction(
    core,
    "static int native_near_overflow_constant_range(",
  );
  const staleBody = emittedFunction(
    core,
    "static int native_stale_control_flow_range(",
  );
  const staleBranchBody = emittedFunction(
    core,
    "static int native_stale_branch_range(",
  );

  assert.doesNotMatch(safeBody, /sagejs_word_add_int64/);
  assert.doesNotMatch(continuedBody, /sagejs_word_add_int64/);
  assert.match(dynamicBody, /sagejs_word_add_int64/);
  assert.match(overflowBody, /sagejs_word_add_int64/);
  assert.match(staleBody, /sagejs_word_add_int64/);
  assert.match(staleBranchBody, /sagejs_word_add_int64/);
});

test("proved and checked int64 range latches agree in every backend", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "sagejs-int64-range-proof-"));
  try {
    const built = await compileKernel({ sourcePath: witnessPath, cacheDirectory });
    const module = require(built.modulePath);
    for (const backend of ["javascript", "gmp", "tagged"]) {
      assert.equal(module.safe_constant_range[backend](), 8n);
      assert.equal(module.safe_constant_range_with_continue[backend](), 8n);
      assert.equal(module.dynamic_range[backend](-5n, 7n, 3n), 4n);
      assert.equal(module.dynamic_range[backend](7n, -5n, -3n), -2n);
      assert.equal(
        module.near_overflow_constant_range[backend](),
        9223372036854775806n,
      );
      assert.equal(
        module.stale_control_flow_range[backend](9223372036854775807n),
        9223372036854775806n,
      );
      assert.equal(
        module.stale_branch_range[backend](9223372036854775807n, true),
        9223372036854775806n,
      );
    }
  } finally {
    rmSync(cacheDirectory, { recursive: true, force: true });
  }
});
