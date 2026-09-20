import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { collectLifecycleReceipt } from "./run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "../../../..");
const artifact = path.resolve(
  here,
  "../wasm-class-group-candidate/target/wasm32-wasip1/release/sagejs_rust_wasm_class_group_candidate.wasm",
);
const schema = JSON.parse(fs.readFileSync(path.join(here, "receipt.schema.json"), "utf8"));
const validate = new Ajv2020({ strict: true, validateFormats: false }).compile(schema);
const browserSchema = JSON.parse(fs.readFileSync(
  path.join(here, "browser-context-receipt.schema.json"),
  "utf8",
));
const validateBrowser = new Ajv2020({ strict: true, validateFormats: false })
  .compile(browserSchema);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assertFileIdentity(identity) {
  const bytes = fs.readFileSync(path.join(repositoryRoot, identity.path));
  assert.equal(identity.bytes, bytes.byteLength, `${identity.path} byte count is stale`);
  assert.equal(identity.sha256, sha256(bytes), `${identity.path} hash is stale`);
}

test("the existing reactor passes bounded small-candidate context and lifecycle checks", async () => {
  const receipt = await collectLifecycleReceipt({ artifact, repetitions: 16 });
  assert.equal(validate(receipt), true, JSON.stringify(validate.errors));
  assert.equal(receipt.repeatedCalls.status, "pass");
  assert.equal(receipt.malformedInput.status, "pass");
  assert.deepEqual(receipt.malformedInput.incorrectlyAccepted, []);
  assert.equal(receipt.termination.status, "pass");
  assert.equal(receipt.termination.resultPublished, false);
  assert.equal(receipt.cancellation.status, "pass-small-candidate-only");
  assert.equal(receipt.cancellation.cooperative, true);
  assert.equal(receipt.resumableContext.cancellation.partialResultPublished, false);
  assert.equal(receipt.status, "small-candidate-context-pass-medium-unqualified");
});

test("the checked-in receipt is closed and records no production claim", () => {
  const receipt = JSON.parse(fs.readFileSync(path.join(here, "receipt.json"), "utf8"));
  assert.equal(validate(receipt), true, JSON.stringify(validate.errors));
  assert.equal(receipt.claim.productionQualified, false);
  assert.equal(receipt.claim.mathematicalCompletionClaim, false);
  assert.equal(receipt.cancellation.cooperative, true);
  assert.match(receipt.cancellation.cancellationBoundary, /between completed step calls/);
  assert.equal(receipt.cancellation.nonInterruptibleSections.length, 3);
  assert.deepEqual(receipt.resumableContext.retiredHandleOperations.afterClose, [
    "step", "cancel", "result-state-error", "reset", "close",
  ]);
});

test("the actual-browser context receipt is closed and covers every required engine", () => {
  const receipt = JSON.parse(fs.readFileSync(
    path.join(here, "browser-context-receipt.json"),
    "utf8",
  ));
  assert.equal(validateBrowser(receipt), true, JSON.stringify(validateBrowser.errors));
  assert.deepEqual(
    receipt.engines.map((item) => item.engine).sort(),
    ["chromium", "firefox", "webkit"],
  );
  assert.ok(receipt.engines.every((item) => item.memory_page_observations.at(-1).pages === 18));
  for (const engine of receipt.engines) {
    assert.equal(engine.mixed_memory_pages.length, 100);
    assert.deepEqual(
      engine.mixed_memory_pages.map((item) => item.job),
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    assert.equal(new Set(engine.mixed_memory_pages.map((item) => item.pages)).size, 1);
    assert.equal(engine.memory_pages_after_mixed, engine.mixed_memory_pages.at(-1).pages);
    assert.equal(engine.live_context_candidate_close.context_rejected_after_candidate_close, true);
    assert.equal(engine.retired_handle_abi.after_close.result_error, "State");
    assert.equal(engine.retired_handle_abi.after_reset.result_error, "State");
    assert.equal(engine.retired_handle_abi.original_live_after_invalid_reset, true);
  }
  assert.equal(receipt.finalizerEvidence.executionObserved, false);
  assert.equal(receipt.finalizerEvidence.authoritativeLifecycle, "explicit-close");
  assert.ok(receipt.limitations.some((item) => /only between completed step calls/.test(item)));
  assert.ok(receipt.limitations.some((item) => /finalizer callback execution is not observed/.test(item)));
  const lifecycle = JSON.parse(fs.readFileSync(path.join(here, "receipt.json"), "utf8"));
  const candidate = JSON.parse(fs.readFileSync(
    path.resolve(here, "../wasm-class-group-candidate/receipt.json"),
    "utf8",
  ));
  const artifactBytes = fs.readFileSync(artifact);
  const actualArtifact = {
    path: lifecycle.artifact.path,
    bytes: artifactBytes.byteLength,
    sha256: sha256(artifactBytes),
  };
  assert.equal(receipt.artifact.path, actualArtifact.path);
  assert.equal(receipt.artifact.bytes, actualArtifact.bytes);
  assert.equal(receipt.artifact.sha256, actualArtifact.sha256);
  assert.equal(lifecycle.artifact.bytes, actualArtifact.bytes);
  assert.equal(lifecycle.artifact.sha256, actualArtifact.sha256);
  assert.equal(candidate.artifact.bytes, actualArtifact.bytes);
  assert.equal(candidate.artifact.sha256, actualArtifact.sha256);
  for (const identity of lifecycle.artifact.sourceInputs) assertFileIdentity(identity);
  for (const identity of receipt.artifact.sourceInputs) assertFileIdentity(identity);
  for (const identity of receipt.hostInputs) assertFileIdentity(identity);
  for (const identity of receipt.boundReceipts) assertFileIdentity(identity);
});
