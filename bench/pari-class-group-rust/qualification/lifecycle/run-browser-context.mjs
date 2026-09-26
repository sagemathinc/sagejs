#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
} from "../../../../packages/flint-wasm/test/browser-wasm-support.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "../../../..");
const artifactPath = path.join(
  repositoryRoot,
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/target/wasm32-wasip1/release/sagejs_rust_wasm_class_group_candidate.wasm",
);
const outputPath = path.join(here, "browser-context-receipt.json");
const lifecycleReceiptPath = path.join(here, "receipt.json");
const candidateReceiptPath = path.join(
  repositoryRoot,
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/receipt.json",
);
const sourceInputPaths = [
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/Cargo.lock",
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/Cargo.toml",
  "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/src/lib.rs",
  "bench/pari-class-group-rust/src/factor_base.rs",
  "bench/pari-class-group-rust/src/relation_cache.rs",
  "bench/pari-class-group-rust/src/smith.rs",
];
const hostInputPaths = [
  "bench/pari-class-group-rust/qualification/browser/browser-loader.mjs",
  "bench/pari-class-group-rust/qualification/browser/class-group-route.mjs",
  "bench/pari-class-group-rust/qualification/lifecycle/run-browser-context.mjs",
];
const browserTypes = { chromium, firefox, webkit };
const request = {
  schema: "sagejs.class-group-request/v1",
  polynomial: ["-34", "-30", "-8", "1"],
  proof: "candidate",
};
const expected = {
  schema: "sagejs.class-group-result/v1",
  classNumber: "6",
  invariantFactors: ["6"],
  status: "candidate",
};

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function identity(relativePath) {
  const bytes = fs.readFileSync(path.join(repositoryRoot, relativePath));
  return { path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

async function runEngine(engine, server) {
  const browserType = browserTypes[engine];
  const executablePath = executablePathFor(engine, browserType);
  if (!executablePath) throw new Error(`${engine} executable is unavailable`);
  const browser = await browserType.launch({
    executablePath,
    headless: true,
    args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error?.stack ?? error)));
    const artifactUrl = "/bench/pari-class-group-rust/qualification/wasm-class-group-candidate/target/wasm32-wasip1/release/sagejs_rust_wasm_class_group_candidate.wasm";
    const routeUrl = "/bench/pari-class-group-rust/qualification/browser/class-group-route.html";
    await page.goto(
      `${server.origin}${routeUrl}?artifact=${encodeURIComponent(artifactUrl)}`,
      { waitUntil: "load" },
    );
    await page.waitForFunction(() => window.__sagejsClassGroupReady !== undefined);
    await page.evaluate(() => window.__sagejsClassGroupReady);
    const observation = await page.evaluate(async ({ request, expected }) => {
      const api = window.__sagejsClassGroupQualification;
      const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
      const initial = await api.run(request);
      const initialPages = initial.memory_pages.before_call;
      const pages = [];
      for (let index = 0; index < 1_000; index += 1) {
        const sample = await api.run(request);
        if (!same(sample.result, expected)) throw new Error(`small call ${index} differed`);
        if (index < 8 || (index & (index - 1)) === 0 || index === 999) {
          pages.push({ call: index + 1, pages: sample.memory_pages.after_call });
        }
      }
      const completion = await api.runResumable(request, 16);
      if (!same(completion.result, expected)) throw new Error("resumable result differed");
      const cancellationLatencies = [];
      let cancelled = 0;
      let reset = 0;
      let completed = 0;
      const mixedMemoryPages = [];
      for (let index = 0; index < 100; index += 1) {
        let mode;
        let memoryPages;
        if (index % 3 === 0) {
          const value = await api.cancellationProbe(request);
          if (value.status !== 3 || value.cancel_code !== 1 ||
              value.result_before.schema !== "sagejs.class-group-error/v1" ||
              value.result_after.schema !== "sagejs.class-group-error/v1" ||
              value.first_close !== 1 || value.second_close !== 0) {
            throw new Error("cancellation probe violated its contract");
          }
          cancellationLatencies.push(value.latency_ms);
          cancelled += 1;
          mode = "cancel";
          memoryPages = value.memory_pages;
        } else if (index % 3 === 1) {
          const value = await api.resetProbe(request);
          if (value.status !== 2 || !value.generation_changed ||
              !same(value.result, expected) || value.close !== 1) {
            throw new Error("reset probe violated its contract");
          }
          reset += 1;
          mode = "reset-complete";
          memoryPages = value.memory_pages;
        } else {
          const value = await api.runResumable(request, 4_096);
          if (!same(value.result, expected)) throw new Error("mixed completion differed");
          completed += 1;
          mode = "complete";
          memoryPages = value.memory_pages;
        }
        mixedMemoryPages.push({ job: index + 1, mode, pages: memoryPages });
      }
      const retiredHandles = api.retiredHandleProbe(request);
      const liveClose = await api.closeWithLiveContextProbe(request);
      api.close();
      api.close();
      let staleRejected = false;
      try {
        await api.run(request);
      } catch {
        staleRejected = true;
      }
      return {
        finalization_registry_available: typeof FinalizationRegistry === "function",
        initial_memory_pages: initialPages,
        memory_page_observations: pages,
        resumable_completion: {
          status: completion.status,
          steps: completion.steps,
          maximum_step_ms: completion.maximum_step_ms,
          memory_pages: completion.memory_pages,
        },
        mixed_jobs: { count: 100, cancelled, reset, completed },
        mixed_memory_pages: mixedMemoryPages,
        memory_pages_after_mixed: mixedMemoryPages.at(-1).pages,
        cancellation_latency_ms: {
          maximum: Math.max(...cancellationLatencies),
          samples: cancellationLatencies,
        },
        retired_handle_abi: retiredHandles,
        live_context_candidate_close: liveClose,
        stale_after_host_close_rejected: staleRejected,
      };
    }, { request, expected });
    assert.deepEqual(errors, []);
    assert.equal(observation.stale_after_host_close_rejected, true);
    assert.equal(observation.resumable_completion.status, 2);
    assert.ok(observation.resumable_completion.steps > 100);
    assert.ok(observation.cancellation_latency_ms.maximum <= 100);
    const stablePages = observation.memory_page_observations.slice(8).map((item) => item.pages);
    assert.equal(new Set(stablePages).size, 1);
    assert.equal(observation.mixed_memory_pages.length, 100);
    assert.deepEqual(
      observation.mixed_memory_pages.map((item) => item.job),
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    assert.equal(new Set(observation.mixed_memory_pages.map((item) => item.pages)).size, 1);
    assert.equal(
      observation.memory_pages_after_mixed,
      observation.mixed_memory_pages.at(-1).pages,
    );
    assert.equal(observation.live_context_candidate_close.live_context_created, true);
    assert.equal(observation.live_context_candidate_close.api_close_called, true);
    assert.equal(
      observation.live_context_candidate_close.context_rejected_after_candidate_close,
      true,
    );
    for (const retired of [
      observation.retired_handle_abi.after_close,
      observation.retired_handle_abi.after_reset,
    ]) {
      assert.equal(retired.step, 0);
      assert.equal(retired.cancel, 0);
      assert.equal(retired.result_error, "State");
      assert.equal(retired.reset_zero, true);
      assert.equal(retired.close, 0);
    }
    assert.equal(observation.retired_handle_abi.first_close, 1);
    assert.equal(observation.retired_handle_abi.invalid_reset_zero, true);
    assert.equal(observation.retired_handle_abi.original_live_after_invalid_reset, true);
    assert.equal(observation.retired_handle_abi.generation_changed, true);
    assert.equal(observation.retired_handle_abi.replacement_close, 1);
    return {
      engine,
      browserVersion: browser.version(),
      status: "pass",
      ...observation,
    };
  } finally {
    await browser.close();
  }
}

const artifact = fs.readFileSync(artifactPath);
const loaderSource = fs.readFileSync(
  path.join(repositoryRoot, hostInputPaths[0]),
  "utf8",
);
const receipt = {
  schema: "sagejs.rust-class-group-context-browser/v1",
  status: "fail",
  observedAt: new Date().toISOString(),
  artifact: {
    path: path.relative(repositoryRoot, artifactPath),
    bytes: artifact.byteLength,
    sha256: sha256(artifact),
    sourceInputs: sourceInputPaths.map(identity),
  },
  hostInputs: hostInputPaths.map(identity),
  boundReceipts: [
    identity(path.relative(repositoryRoot, lifecycleReceiptPath)),
    identity(path.relative(repositoryRoot, candidateReceiptPath)),
  ],
  finalizerEvidence: {
    availabilityObservedAllEngines: false,
    registrationPresentInBoundLoaderSource:
      loaderSource.includes("contextFinalizer?.register(context, handle, context)"),
    executionObserved: false,
    authoritativeLifecycle: "explicit-close",
  },
  engines: [],
  limitations: [
    "small fixed-width presentation candidate only",
    "row-6 HNF, units, and certification are not resumable through this ABI",
    "cancellation is observed only between completed step calls; context creation, one point operation, and final Smith reduction are synchronous and noninterruptible",
    "FinalizationRegistry availability and loader registration are source-bound, but nondeterministic finalizer callback execution is not observed; explicit close is authoritative",
  ],
};
const server = await createBrowserWasmServer({
  root: repositoryRoot,
  crossOriginIsolation: false,
});
try {
  for (const engine of ["chromium", "firefox", "webkit"]) {
    receipt.engines.push(await runEngine(engine, server));
  }
  receipt.finalizerEvidence.availabilityObservedAllEngines = receipt.engines.every(
    (engine) => engine.finalization_registry_available,
  );
  assert.equal(receipt.finalizerEvidence.availabilityObservedAllEngines, true);
  assert.equal(receipt.finalizerEvidence.registrationPresentInBoundLoaderSource, true);
  receipt.status = "pass-small-candidate";
} finally {
  await server.close();
}
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: receipt.status, output: outputPath }));
