#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import {
  instantiateLifecycleCandidate,
  lifecycleAbiPolicy,
} from "./runtime.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "../../../..");
const defaultArtifact = path.join(
  repositoryRoot,
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/target/wasm32-wasip1/release/sagejs_rust_wasm_class_group_candidate.wasm",
);
const defaultOutput = path.join(here, "receipt.json");
const sourceInputPaths = [
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/Cargo.lock",
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/Cargo.toml",
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/src/lib.rs",
  "bench/pari-class-group-rust/src/factor_base.rs",
  "bench/pari-class-group-rust/src/relation_cache.rs",
  "bench/pari-class-group-rust/src/smith.rs",
];
const request = Object.freeze({
  schema: "sagejs.class-group-request/v1",
  polynomial: ["-34", "-30", "-8", "1"],
  proof: "candidate",
});
const expected = Object.freeze({
  schema: "sagejs.class-group-result/v1",
  classNumber: "6",
  invariantFactors: ["6"],
  status: "candidate",
});

function argumentsFrom(argv) {
  const result = { artifact: defaultArtifact, output: defaultOutput, repetitions: 1_000 };
  for (let index = 0; index < argv.length; index += 2) {
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`missing value for ${argv[index]}`);
    if (argv[index] === "--artifact") result.artifact = path.resolve(value);
    else if (argv[index] === "--output") result.output = path.resolve(value);
    else if (argv[index] === "--repetitions") result.repetitions = Number(value);
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  if (!Number.isSafeInteger(result.repetitions) || result.repetitions < 16 ||
      result.repetitions > 1_000) {
    throw new Error("repetitions must be an integer in [16, 1000]");
  }
  return result;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sourceInputIdentity() {
  return sourceInputPaths.map((relativePath) => {
    const bytes = fs.readFileSync(path.join(repositoryRoot, relativePath));
    return { path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
}

function canonical(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

async function externalTermination(artifact) {
  const worker = new Worker(new URL("./termination-worker.mjs", import.meta.url), {
    workerData: { artifact },
  });
  const messages = [];
  let error = null;
  worker.on("message", (message) => messages.push(message));
  worker.on("error", (value) => { error = value; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("worker did not become ready")), 15_000);
    function inspect(message) {
      if (message.type === "ready") {
        worker.postMessage({ type: "start", request, repetitions: 1_000_000 });
      } else if (message.type === "begun") {
        clearTimeout(timeout);
        worker.off("message", inspect);
        resolve();
      }
    }
    worker.on("message", inspect);
  });
  const exitCode = await worker.terminate();
  // Give a queued result message an opportunity to surface before deciding that
  // termination prevented publication.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(error, null);
  assert.equal(messages.some((message) => message.type === "result"), false);
  return {
    status: "pass",
    mechanism: "node-worker-hard-termination",
    exitCode,
    begunObserved: messages.some((message) => message.type === "begun"),
    resultPublished: false,
    scope: "host termination only; not cooperative in-reactor cancellation",
  };
}

async function concurrentIndependentJobs(artifact, count = 4) {
  const workers = Array.from({ length: count }, () => new Worker(
    new URL("./termination-worker.mjs", import.meta.url),
    { workerData: { artifact } },
  ));
  try {
    const results = await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("concurrent worker timed out")), 15_000);
      worker.on("error", reject);
      worker.on("message", (message) => {
        if (message.type === "ready") {
          worker.postMessage({ type: "start", request, repetitions: 1 });
        } else if (message.type === "result") {
          clearTimeout(timeout);
          resolve(message.result);
        }
      });
    })));
    for (const result of results) assert.deepEqual(result, expected);
    assert.equal(new Set(results.map(canonical)).size, 1);
    return { status: "pass-small-artifact-only", jobs: count, identicalResults: true };
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

function immediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function exerciseResumableContexts(candidate) {
  const completion = candidate.createContext(request);
  assert.equal(completion.result().schema, "sagejs.class-group-error/v1");
  let completionStatus = 1;
  let completionSteps = 0;
  let maximumStepMilliseconds = 0;
  while (completionStatus === 1) {
    const started = performance.now();
    completionStatus = completion.step(1);
    maximumStepMilliseconds = Math.max(maximumStepMilliseconds, performance.now() - started);
    completionSteps += 1;
    await immediate();
  }
  assert.equal(completionStatus, 2);
  assert.ok(completionSteps > 100);
  assert.deepEqual(completion.result(), expected);
  const completedHandle = completion.handle;
  assert.equal(completion.close(), 1);
  assert.equal(completion.close(), 0);
  assert.equal(candidate.testing.rawContext.step(completedHandle, 1), 0);
  assert.equal(candidate.testing.rawContext.cancel(completedHandle), 0);
  assert.equal(candidate.testing.rawContext.result(completedHandle).error, "State");
  assert.equal(candidate.testing.rawContext.reset(completedHandle, request), 0n);
  assert.equal(candidate.testing.rawContext.close(completedHandle), 0);

  const cancellation = candidate.createContext(request);
  assert.equal(cancellation.step(8), 1);
  let cancelRequestedAt = null;
  let cancelCode = null;
  const cancelRequest = new Promise((resolve) => setTimeout(() => {
    cancelRequestedAt = performance.now();
    cancelCode = cancellation.cancel();
    resolve();
  }, 0));
  let cancelledStatus = 1;
  while (cancelledStatus === 1) {
    cancelledStatus = cancellation.step(1);
    await immediate();
  }
  await cancelRequest;
  const cancellationObservedAt = performance.now();
  assert.equal(cancelCode, 1);
  assert.equal(cancelledStatus, 3);
  assert.equal(cancellation.cancel(), 2);
  assert.equal(cancellation.result().schema, "sagejs.class-group-error/v1");
  assert.equal(cancellation.close(), 1);

  const reset = candidate.createContext(request);
  assert.equal(reset.step(8), 1);
  const beforeReset = reset.handle;
  assert.equal(candidate.testing.rawContext.reset(beforeReset, { ...request, expected }), 0n);
  assert.equal(candidate.testing.rawContext.step(beforeReset, 1), 1);
  const resetHandles = reset.reset(request);
  assert.equal(resetHandles.previous, beforeReset);
  assert.notEqual(resetHandles.next, beforeReset);
  assert.equal(candidate.testing.rawContext.step(beforeReset, 1), 0);
  assert.equal(candidate.testing.rawContext.cancel(beforeReset), 0);
  assert.equal(candidate.testing.rawContext.result(beforeReset).error, "State");
  assert.equal(candidate.testing.rawContext.reset(beforeReset, request), 0n);
  assert.equal(candidate.testing.rawContext.close(beforeReset), 0);
  assert.equal(reset.step(4_097), 5);
  let resetStatus = 1;
  while (resetStatus === 1) resetStatus = reset.step(4_096);
  assert.equal(resetStatus, 2);
  assert.deepEqual(reset.result(), expected);
  assert.equal(reset.close(), 1);

  assert.equal(candidate.testing.rawContext.step(0n, 1), 0);
  assert.equal(candidate.testing.rawContext.cancel(0xffff_ffff_ffff_ffffn), 0);
  assert.equal(candidate.testing.rawContext.close(0n), 0);
  assert.equal(candidate.testing.rawContext.create({ ...request, expected }), 0n);

  const capacityHandles = [];
  for (let index = 0; index < 64; index += 1) {
    const handle = candidate.testing.rawContext.create(request);
    assert.notEqual(handle, 0n);
    capacityHandles.push(handle);
  }
  assert.equal(candidate.testing.rawContext.create(request), 0n);
  for (const handle of capacityHandles) {
    assert.equal(candidate.testing.rawContext.close(handle), 1);
  }

  const mixedMemoryPages = [];
  for (let index = 0; index < 100; index += 1) {
    const context = candidate.createContext(request);
    if (index % 3 === 0) {
      assert.equal(context.step(8), 1);
      assert.equal(context.cancel(), 1);
      assert.equal(context.close(), 1);
    } else if (index % 3 === 1) {
      const { previous } = context.reset(request);
      assert.equal(candidate.testing.rawContext.step(previous, 1), 0);
      let status = 1;
      while (status === 1) status = context.step(4_096);
      assert.equal(status, 2);
      assert.deepEqual(context.result(), expected);
      assert.equal(context.close(), 1);
    } else {
      let status = 1;
      while (status === 1) status = context.step(4_096);
      assert.equal(status, 2);
      assert.deepEqual(context.result(), expected);
      assert.equal(context.close(), 1);
    }
    mixedMemoryPages.push(candidate.memoryPages());
  }
  assert.equal(new Set(mixedMemoryPages.slice(8)).size, 1);

  return {
    status: "pass-small-candidate",
    pointBudgetPerYield: 1,
    completionSteps,
    maximumStepMilliseconds,
    cancellation: {
      status: "pass",
      requestedCode: cancelCode,
      terminalStatus: cancelledStatus,
      latencyMilliseconds: cancellationObservedAt - cancelRequestedAt,
      resultBeforeComplete: "structured-error",
      resultAfterCancel: "structured-error",
      partialResultPublished: false,
    },
    staleAndMalformedHandles: "pass",
    retiredHandleOperations: {
      afterClose: ["step", "cancel", "result-state-error", "reset", "close"],
      afterReset: ["step", "cancel", "result-state-error", "reset", "close"],
    },
    doubleClose: "pass-rejected",
    reset: "pass-generation-invalidates-prior-handle",
    invalidResetTransactional: "pass-original-context-remains-live",
    contextCapacity: {
      maximumLive: 64,
      overflowCreateResult: "zero-handle",
      allAllocatedContextsClosed: true,
    },
    mixedSmallJobs: {
      count: 100,
      modes: ["cancel", "reset-complete", "complete"],
      stableMemoryPages: mixedMemoryPages.at(-1),
    },
  };
}

export async function collectLifecycleReceipt(options = argumentsFrom([])) {
  const artifactBytes = fs.readFileSync(options.artifact);
  const candidate = await instantiateLifecycleCandidate(options.artifact);
  const initialPages = candidate.memoryPages();
  const hashes = [];
  const pages = [];
  for (let index = 0; index < options.repetitions; index += 1) {
    const result = candidate.run(request);
    assert.deepEqual(result, expected);
    hashes.push(sha256(Buffer.from(canonical(result))));
    pages.push(candidate.memoryPages());
  }
  assert.equal(new Set(hashes).size, 1);
  const warmPages = pages.slice(8);
  assert.equal(new Set(warmPages).size, 1, "linear memory did not stabilize after warmup");
  const memoryPageObservations = pages.flatMap((value, zeroIndex) => {
    const call = zeroIndex + 1;
    return call <= 8 || (call & (call - 1)) === 0 || call === pages.length
      ? [{ call, pages: value }]
      : [];
  });

  const malformedCases = [
    ["invalid-utf8", Uint8Array.of(0xff, 0xfe)],
    ["truncated-json", new TextEncoder().encode("{")],
    ["empty-object", new TextEncoder().encode("{}")],
    ["wrong-schema", new TextEncoder().encode(JSON.stringify({ ...request, schema: "wrong" }))],
    ["oracle-bearing", new TextEncoder().encode(JSON.stringify({ ...request, expected }))],
    ["missing-schema", new TextEncoder().encode(JSON.stringify({ polynomial: request.polynomial, proof: request.proof }))],
    ["missing-proof", new TextEncoder().encode(JSON.stringify({ schema: request.schema, polynomial: request.polynomial }))],
    ["duplicate-schema", new TextEncoder().encode(`{"schema":"${request.schema}","schema":"${request.schema}","polynomial":["-34","-30","-8","1"],"proof":"candidate"}`)],
    ["numeric-coefficients", new TextEncoder().encode(JSON.stringify({ ...request, polynomial: [-34, -30, -8, 1] }))],
    ["wrong-proof", new TextEncoder().encode(JSON.stringify({ ...request, proof: "unconditional" }))],
    ["bad-polynomial", new TextEncoder().encode(JSON.stringify({ ...request, polynomial: ["1"] }))],
  ];
  const malformed = [];
  for (const [id, bytes] of malformedCases) {
    try {
      const result = JSON.parse(candidate.runBytes(bytes));
      if (result.schema === "sagejs.class-group-error/v1" && typeof result.error === "string") {
        malformed.push({ id, status: "structured-error", error: result.error });
      } else {
        malformed.push({ id, status: "incorrectly-accepted", returnedSchema: result.schema ?? null });
      }
    } catch (error) {
      malformed.push({ id, status: "host-exception", error: String(error?.stack ?? error) });
    }
  }
  const nullResult = candidate.runNullInput();
  assert.equal(nullResult.schema, "sagejs.class-group-error/v1");
  malformed.push({ id: "null-zero-range", status: "structured-error", error: nullResult.error });
  assert.equal(candidate.rejectsOversizedAllocation(), true);
  malformed.push({ id: "oversized-allocation", status: "rejected-before-allocation" });
  const malformedFailures = malformed.filter((item) =>
    item.status === "incorrectly-accepted" || item.status === "host-exception"
  );

  // A malformed call must not poison the next valid call.
  assert.deepEqual(candidate.run(request), expected);
  const pagesAfterRecovery = candidate.memoryPages();
  const resumableContext = await exerciseResumableContexts(candidate);
  candidate.close();
  candidate.close();
  assert.equal(candidate.testing.closeCount(), 2);
  assert.equal(candidate.testing.isClosed(), true);
  assert.throws(() => candidate.run(request), /closed/);
  assert.throws(() => candidate.memoryPages(), /closed/);

  const termination = await externalTermination(options.artifact);
  const concurrency = await concurrentIndependentJobs(options.artifact);
  const receipt = {
    schema: "sagejs.rust-class-group-lifecycle/v1",
    status: malformedFailures.length === 0
      ? "small-candidate-context-pass-medium-unqualified"
      : "failed-required-input-validation",
    claim: {
      productionQualified: false,
      artifactScope: "small fixed-width presentation candidate",
      mathematicalCompletionClaim: false,
    },
    artifact: {
      path: path.relative(repositoryRoot, options.artifact),
      bytes: artifactBytes.byteLength,
      sha256: sha256(artifactBytes),
      abiVersion: lifecycleAbiPolicy.version,
      sourceInputs: sourceInputIdentity(),
    },
    repeatedCalls: {
      status: "pass",
      count: options.repetitions,
      exactResultSha256: hashes[0],
      initialMemoryPages: initialPages,
      memoryPageObservations,
      stabilizedAfterCall: 8,
      stableMemoryPages: warmPages[0],
      stableMemoryMinimumPages: Math.min(...warmPages),
      stableMemoryMaximumPages: Math.max(...warmPages),
      pagesAfterMalformedRecovery: pagesAfterRecovery,
    },
    malformedInput: {
      status: malformedFailures.length === 0 ? "pass" : "fail",
      cases: malformed,
      incorrectlyAccepted: malformedFailures
        .filter((item) => item.status === "incorrectly-accepted")
        .map((item) => item.id),
      validCallAfterErrors: "pass",
      trapsObserved: 0,
    },
    lifecycle: {
      hostClose: "pass-idempotent",
      staleUseAfterClose: "pass-rejected",
      guestHandlesPresent: lifecycleAbiPolicy.guestHandleRegistry,
      guestStaleHandleTest: "pass-rejected",
      guestDoubleDropTest: "pass-rejected",
      rawDoubleDeallocTest: "not-run-undefined-behavior-in-current-abi",
    },
    termination,
    resumableContext,
    transactionalPublication: {
      status: "pass-small-context-and-hard-worker-termination",
      observation: "result_json returns a structured state error before completion and after cancellation; hard worker termination publishes no result message",
      durableState: "none",
    },
    cancellation: {
      status: "pass-small-candidate-only",
      cooperative: true,
      reason: "the candidate relation search is a bounded state machine; the host yields between step calls",
      hardWorkerTerminationAvailable: true,
      implementedAbi: [
        "create_json(request) -> generation-tagged context handle or zero",
        "step(handle, bounded_points) -> stale | running | complete | cancelled | failed | invalid budget",
        "cancel(handle) -> stale | accepted | already cancelled | already terminal",
        "result_json(handle) publishes output only after complete",
        "reset_json(handle, request) -> replacement generation or zero without mutating on failure",
        "close(handle) -> closed | stale",
      ],
      cancellationBoundary: "only between completed step calls after control returns to the host event loop",
      nonInterruptibleSections: [
        "context creation and input preparation",
        "one individual lattice-point norm/factorization/valuation operation",
        "final Smith reduction after relation collection completes",
      ],
      remainingLimitation: "row-6 HNF, unit, and certification phases do not yet use this context ABI",
    },
    requiredInputChange: {
      status: malformedFailures.some((item) => item.status === "incorrectly-accepted") ? "required" : "not-required",
      rule: "parse and validate the closed request schema before reading the polynomial; reject unknown/oracle-bearing properties",
    },
    campaignCoverage: {
      repeatedSmallCalls: { required: 1_000, observed: options.repetitions, status: options.repetitions >= 1_000 ? "pass" : "test-only-short-run" },
      mixedMediumCalls: { required: 100, observed: 0, status: "fail-no-frozen-complete-medium-artifact" },
      precisionFailure: "fail-not-exposed-by-candidate",
      arithmeticCapacityFailure: "partial-pass-context-capacity-only",
      concurrentIndependentJobs: concurrency,
      nativeLeakSanitizer: "fail-not-run",
      actualBrowserLifecycle: "pass-see-browser-context-receipt",
    },
  };
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = argumentsFrom(process.argv.slice(2));
  const receipt = await collectLifecycleReceipt(options);
  fs.writeFileSync(options.output, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({
    status: receipt.status,
    output: options.output,
    repeatedCalls: receipt.repeatedCalls.count,
    stableMemoryPages: receipt.repeatedCalls.stableMemoryPages,
    malformedCases: receipt.malformedInput.cases.length,
    incorrectlyAccepted: receipt.malformedInput.incorrectlyAccepted,
    cooperativeCancellation: receipt.cancellation.cooperative,
  }));
}
