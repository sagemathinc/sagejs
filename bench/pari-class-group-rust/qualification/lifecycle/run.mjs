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
      ? "failed-required-cooperative-cancellation-abi"
      : "failed-required-lifecycle-abi-and-input-validation",
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
      guestStaleHandleTest: "not-applicable-no-handle-abi",
      guestDoubleDropTest: "not-applicable-no-handle-abi",
      rawDoubleDeallocTest: "not-run-undefined-behavior-in-current-abi",
    },
    termination,
    transactionalPublication: {
      status: "pass-for-hard-worker-termination-only",
      observation: "no result message was published after a begun computation was terminated",
      durableState: "none",
    },
    cancellation: {
      status: "fail",
      cooperative: false,
      reason: "sagejs_class_group_run_json is one synchronous monolithic call with no context, step, cancel, or progress operation",
      hardWorkerTerminationAvailable: true,
      requiredAbi: [
        "create(request) -> generation-tagged context handle or structured error",
        "step(handle, bounded_work) -> running | complete | cancelled | structured error",
        "cancel(handle) -> accepted | already complete | stale handle",
        "result(handle) publishes output only after complete",
        "drop(handle) is idempotent and stale/double-use is rejected without dereference",
        "long relation, HNF, unit, and certification loops check cancellation at documented bounded intervals",
      ],
    },
    requiredInputChange: {
      status: malformedFailures.some((item) => item.status === "incorrectly-accepted") ? "required" : "not-required",
      rule: "parse and validate the closed request schema before reading the polynomial; reject unknown/oracle-bearing properties",
    },
    campaignCoverage: {
      repeatedSmallCalls: { required: 1_000, observed: options.repetitions, status: options.repetitions >= 1_000 ? "pass" : "test-only-short-run" },
      mixedMediumCalls: { required: 100, observed: 0, status: "fail-no-frozen-complete-medium-artifact" },
      precisionFailure: "fail-not-exposed-by-candidate",
      arithmeticCapacityFailure: "fail-not-exposed-by-candidate",
      concurrentIndependentJobs: concurrency,
      nativeLeakSanitizer: "fail-not-run",
      actualBrowserLifecycle: "fail-not-run-by-this-receipt",
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
