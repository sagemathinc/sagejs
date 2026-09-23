#!/usr/bin/env node
"use strict";

// Private worker protocol for one Phase-6 calibration probe or retained arm.
// The coordinator, not a field adapter, owns process creation and timeouts.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("./qualification_execution_core.cjs");
const sealed = require("./run_class_unit_qualification.cjs");

const REQUEST_SCHEMA = "sagejs.pari-class-group/qualification-arm-request-v1";
const RESPONSE_SCHEMA = "sagejs.pari-class-group/qualification-arm-response-v1";
const ADAPTER_SCHEMA = "sagejs.pari-class-group/resident-prepared-adapter-v1";

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(),
    `${label} has unexpected fields`);
}

function validateDescriptor(descriptor) {
  exactKeys(descriptor, ["configuration", "exportName", "implementation", "modulePath",
    "projectionSchema", "schema"], "adapter descriptor");
  assert.equal(descriptor.schema, ADAPTER_SCHEMA);
  assert(["sagejs", "pari"].includes(descriptor.implementation));
  assert.equal(typeof descriptor.modulePath, "string");
  assert(path.isAbsolute(descriptor.modulePath), "worker adapter path must be absolute");
  assert.equal(typeof descriptor.exportName, "string");
  assert.match(descriptor.exportName, /^[A-Za-z][A-Za-z0-9_]*$/);
  assert.equal(typeof descriptor.projectionSchema, "string");
  assert(descriptor.projectionSchema.length > 0, "semantic projection schema is missing");
  assert(descriptor.configuration && typeof descriptor.configuration === "object" &&
    !Array.isArray(descriptor.configuration), "adapter configuration must be an object");
  return descriptor;
}

function validateRequest(request) {
  exactKeys(request, ["action", "descriptor", "measurement", "requestNonce", "schema"],
    "worker request");
  assert.equal(request.schema, REQUEST_SCHEMA);
  assert.equal(request.action, "measure-arm");
  assert.match(request.requestNonce, /^[0-9a-f]{32}$/);
  validateDescriptor(request.descriptor);
  exactKeys(request.measurement,
    ["boundary", "fieldId", "repetitions", "seed", "tier"], "measurement request");
  assert.equal(typeof request.measurement.fieldId, "string");
  assert(request.measurement.fieldId.length > 0);
  assert.match(request.measurement.seed, /^(0|[1-9][0-9]*)$/);
  assert(Number.isSafeInteger(request.measurement.repetitions) &&
    request.measurement.repetitions >= 1);
  assert(["diagnostic", "flag-zero", "compact-flag-one"].includes(
    request.measurement.tier));
  assert(["relation-retry", "sparse-hnf-snf-transform", "unit-regulator",
    "honesty-generators-final", "prepared-kernel", "nfinit-context"].includes(
    request.measurement.boundary));
  return request;
}

async function loadAdapter(descriptor) {
  assert(fs.statSync(descriptor.modulePath).isFile(), "adapter module is not a file");
  const module = require(descriptor.modulePath);
  const factory = module?.[descriptor.exportName];
  assert.equal(typeof factory, "function", `missing adapter factory ${descriptor.exportName}`);
  const adapter = await factory(structuredClone(descriptor.configuration));
  assert(adapter && typeof adapter === "object" && !Array.isArray(adapter),
    "adapter factory returned no adapter");
  assert.equal(adapter.implementation, descriptor.implementation,
    "adapter implementation identity changed");
  assert.equal(adapter.projectionSchema, descriptor.projectionSchema,
    "adapter semantic projection schema changed");
  assert.equal(typeof adapter.runFresh, "function", "adapter requires runFresh()");
  if (adapter.warmup !== undefined) assert.equal(typeof adapter.warmup, "function");
  return {
    ...adapter,
    async runFresh(request) {
      const sample = await adapter.runFresh(request);
      assert(sample && typeof sample === "object" && !Array.isArray(sample),
        "adapter returned no sample");
      assert(sample.output && typeof sample.output === "object" &&
        !Array.isArray(sample.output), "adapter output must be a semantic projection object");
      assert.equal(sample.output.schema, descriptor.projectionSchema,
        "adapter output has the wrong semantic projection schema");
      return sample;
    },
  };
}

async function executeRequest(untrusted) {
  const request = validateRequest(untrusted);
  const adapter = await loadAdapter(request.descriptor);
  const { repetitions, ...call } = request.measurement;
  if (adapter.warmup) await adapter.warmup(structuredClone(call));
  const batch = await core.executeFreshBatch(adapter, { ...call, repetitions });
  const usage = process.resourceUsage();
  return {
    schema: RESPONSE_SCHEMA,
    requestNonce: request.requestNonce,
    requestSha256: sealed.canonicalDigest(request),
    implementation: request.descriptor.implementation,
    projectionSchema: request.descriptor.projectionSchema,
    workerResources: {
      maxRssKiB: String(usage.maxRSS),
      userCpuMicroseconds: String(usage.userCPUTime),
      systemCpuMicroseconds: String(usage.systemCPUTime),
      voluntaryContextSwitches: String(usage.voluntaryContextSwitches),
      involuntaryContextSwitches: String(usage.involuntaryContextSwitches),
    },
    batch,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  assert(bytes.length > 0, "worker request is empty");
  assert(bytes.length <= 1024 * 1024, "worker request exceeds 1 MiB");
  return JSON.parse(bytes.toString("utf8"));
}

async function main() {
  const response = await executeRequest(await readStdin());
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

module.exports = {
  ADAPTER_SCHEMA,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  executeRequest,
  validateDescriptor,
  validateRequest,
};

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
