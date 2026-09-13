// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const sourcePath = join(
  root,
  "bench/optimization-engine/integral-library-feasibility.py",
);
const runnerPath = join(
  root,
  "bench/optimization-engine/integral-library-feasibility.cjs",
);
const frozenEvidencePath = join(
  root,
  "test/fixtures/optimization-integral-library-evidence",
);

function currentPlatformId() {
  const operatingSystem = { win32: "windows", darwin: "macos" }[process.platform]
    ?? process.platform;
  return `${operatingSystem}-${process.arch}`;
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [runnerPath, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 360_000,
    ...options,
  });
}

test("feasibility source is ordinary Python with guards before effects", () => {
  const source = readFileSync(sourcePath, "utf8");
  const parse = spawnSync(pythonExecutable(), ["-c", [
    "import ast, pathlib, sys",
    "ast.parse(pathlib.Path(sys.argv[1]).read_text())",
  ].join("\n"), sourcePath], { encoding: "utf8" });
  if (parse.error) throw parse.error;
  assert.equal(parse.status, 0, parse.stderr);

  assert.match(source, /MAX_BLOCK_PRIME = 65_537/);
  assert.match(source, /MAX_SOURCE_LENGTH = 100_000/);
  assert.match(source, /MAX_PERIODS = 256/);
  assert.match(source, /source_length < MAX_PERIODS \* prime/);
  assert.match(source, /except KeyboardInterrupt:\n\s+raise/);
  assert.match(source, /candidate:before-publication/);
  assert.doesNotMatch(
    source.slice(0, source.indexOf("def _default_native_factory")),
    /sagejs\.kernels\.polynomial\.structural_flint/,
  );

  const dispatcher = source.slice(source.indexOf("def guarded_flint_block_integral"));
  const staticGuard = dispatcher.indexOf("if not _long_route_domain");
  const capability = dispatcher.indexOf('state["capabilityQueries"] += 1');
  const singular = dispatcher.indexOf("for singular in range");
  const firstCheckpoint = dispatcher.indexOf('checkpoint("candidate:before-allocation")');
  const aggregateAllocation = dispatcher.indexOf("output = allocate(source_length + 1)");
  const nativeCall = dispatcher.indexOf("valid = native_call");
  const publication = dispatcher.indexOf("result = publish(source, output)");
  assert.ok(staticGuard >= 0 && staticGuard < capability);
  assert.ok(capability < singular && singular < firstCheckpoint);
  assert.ok(firstCheckpoint < aggregateAllocation && aggregateAllocation < nativeCall);
  assert.ok(nativeCall < publication);
});

test("Windows output is a portable command contract, never an execution claim", () => {
  const result = run(["windows-contract"]);
  assert.equal(result.status, 0, result.stderr);
  const contract = JSON.parse(result.stdout);
  assert.equal(contract.status, "not-executed");
  assert.equal(contract.executedWindowsAuthority, false);
  assert.match(contract.claimBoundary, /not evidence that Windows executed/);
  assert.deepEqual(contract.command.slice(0, 3), [
    "node",
    "bench/optimization-engine/integral-library-feasibility.cjs",
    "node",
  ]);
  assert.ok(contract.command.includes("windows-x64"));
  assert.ok(contract.command.includes("--require-exact-current"));
  assert.ok(contract.command.includes("--require-frozen-evidence"));
  assert.equal(contract.expectedEvidence.length, 6);
});

test("exact Node execution exhausts guard, native, and interrupt schedules", () => {
  const result = run([
    "node",
    "--require-execution",
    "--require-frozen-evidence",
    "--frozen-evidence-dir",
    frozenEvidencePath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.executedPlatform, currentPlatformId());
  assert.equal(receipt.frozenEvidence.complete, true);
  assert.equal(receipt.authority.executionPassed, true);
  assert.equal(receipt.authority.promotionAuthority, false);
  assert.equal(receipt.execution.claims.candidateImplementedInProduction, false);
  assert.equal(receipt.execution.claims.directSynchronousHardLatencyBound, false);
  assert.equal(receipt.execution.claims.unexpectedNativeExceptionsPropagate, true);
  assert.equal(receipt.execution.claims.keyboardInterruptExplicitlyRethrown, true);

  for (const role of receipt.execution.roles) {
    const calls = Math.ceil(role.sourceLength / role.prime);
    assert.equal(role.successState.nativeCalls, calls);
    assert.equal(role.successState.publications, 1);
    assert.equal(role.nativeFalseSchedules.length, calls);
    assert.equal(role.nativeExceptionSchedules.length, calls);
    assert.equal(role.nativeKeyboardInterruptSchedules.length, calls);
    assert.equal(role.pollInterruptionSchedules.length, 3 * calls + 2);
    assert.equal(role.singularAdversary.candidatePolls, 0);
    assert.equal(role.singularAdversary.state.aggregateAllocations, 0);
    assert.equal(role.singularAdversary.state.kernelLoads, 0);
    assert.equal(role.singularAdversary.state.nativeCalls, 0);
    assert.equal(role.singularAdversary.state.publications, 0);
    assert.equal(role.successfulRetry.exact, true);
    assert.equal(role.successfulRetry.state.publications, 1);
    assert.equal(role.noPartialPublication, true);
    for (const record of role.nativeExceptionSchedules) {
      assert.equal(record.exception[0], "RuntimeError");
    }
    for (const record of role.nativeKeyboardInterruptSchedules) {
      assert.equal(record.exception[0], "KeyboardInterrupt");
    }
    for (const record of role.pollInterruptionSchedules) {
      assert.match(record.event, /^(candidate|block:)/);
    }
  }
});

test("browser mode fails closed when a current release or engine is unavailable", () => {
  const result = run(["browser", "--engine", "chromium"]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  if (receipt.status === "not-executed") {
    assert.equal(receipt.authority.executionPassed, false);
    assert.equal(receipt.authority.executedPlatform, null);
    assert.equal(receipt.authority.exactCurrentExecution, false);
  } else {
    assert.equal(receipt.status, "passed");
    assert.match(receipt.executedPlatform, /^browser-chromium-/);
    assert.equal(receipt.execution.executedRoute, "untouched-generic-fallback");
    assert.equal(
      receipt.authority.exactCurrentExecution,
      receipt.source.exactCurrent && receipt.browserRelease.exactCurrent,
    );
  }
});
