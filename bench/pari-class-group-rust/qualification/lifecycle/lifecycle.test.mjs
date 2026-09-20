import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { collectLifecycleReceipt } from "./run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifact = path.resolve(
  here,
  "../wasm-class-group-candidate/target/wasm32-wasip1/release/sagejs_rust_wasm_class_group_candidate.wasm",
);
const schema = JSON.parse(fs.readFileSync(path.join(here, "receipt.schema.json"), "utf8"));
const validate = new Ajv2020({ strict: true, validateFormats: false }).compile(schema);

test("the existing reactor passes bounded lifecycle checks and fails the cancellation gate honestly", async () => {
  const receipt = await collectLifecycleReceipt({ artifact, repetitions: 16 });
  assert.equal(validate(receipt), true, JSON.stringify(validate.errors));
  assert.equal(receipt.repeatedCalls.status, "pass");
  assert.equal(receipt.malformedInput.status, "pass");
  assert.deepEqual(receipt.malformedInput.incorrectlyAccepted, []);
  assert.equal(receipt.termination.status, "pass");
  assert.equal(receipt.termination.resultPublished, false);
  assert.equal(receipt.cancellation.status, "fail");
  assert.equal(receipt.cancellation.cooperative, false);
  assert.equal(receipt.status, "failed-required-cooperative-cancellation-abi");
});

test("the checked-in receipt is closed and records no production claim", () => {
  const receipt = JSON.parse(fs.readFileSync(path.join(here, "receipt.json"), "utf8"));
  assert.equal(validate(receipt), true, JSON.stringify(validate.errors));
  assert.equal(receipt.claim.productionQualified, false);
  assert.equal(receipt.claim.mathematicalCompletionClaim, false);
  assert.equal(receipt.cancellation.cooperative, false);
});
