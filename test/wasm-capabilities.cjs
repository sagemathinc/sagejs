"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  productionClosure,
  publicReport,
  validateManifest,
  validateReport,
} = require("../scripts/check-wasm-capabilities.cjs");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, "architecture", "wasm-capabilities.json"),
  "utf8",
));
const report = JSON.parse(fs.readFileSync(
  path.join(root, "architecture", "wasm-capabilities-report.json"),
  "utf8",
));
const productionCapabilities = JSON.parse(fs.readFileSync(
  path.join(root, "packages", "flint-wasm", "release", "production-capabilities.json"),
  "utf8",
));

test("all current Wasm-relevant capability kinds are reviewed", () => {
  const result = validateManifest(manifest);
  const counts = Object.groupBy(result.capabilities, (item) => item.kind);
  assert.equal(counts["napi-export"].length, 311);
  assert.equal(counts["declared-ffi-function"].length, 412);
  assert.equal(counts["declared-ffi-resource"].length, 29);
  assert.equal(counts["production-kernel"].length, 31);
  assert.equal(counts["runtime-intrinsic"].length, 137);
  assert.equal(counts["specialist-capability"].length, 19);
  assert.equal(result.capabilities.length, 939);
  const expectedProductionClosure = Object.values(productionCapabilities.modules)
    .flatMap((module) => module.capabilities)
    .sort();
  assert.deepEqual([...productionClosure()].sort(), expectedProductionClosure);
  assert.deepEqual(
    result.workflowAliases["riemann-zeta-batch"],
    ["analytic:riemann-zeta-batch"],
  );
});

test("an unreviewed N-API operation fails closed", () => {
  const changed = structuredClone(manifest);
  changed.capabilities = changed.capabilities.filter((item) =>
    item.id !== "napi:@sagemath/sagejs-flint:nfFactorDegreesBatch"
  );
  assert.throws(
    () => validateManifest(changed),
    /unclassified WebAssembly capabilities.*nfFactorDegreesBatch/s,
  );
});

test("Wasm-ready declarations require an explicit production-closure decision", () => {
  const changed = structuredClone(manifest);
  const item = changed.capabilities.find((entry) =>
    entry.wasm_declared === true && entry.wasm_closure.status === "included"
  );
  assert.ok(item);
  item.wasm_closure.status = "planned";
  delete item.wasm_closure.explanation;
  assert.throws(
    () => validateManifest(changed),
    /omitted from the Wasm closure without explanation/,
  );
});

test("portable fallbacks require registered differential evidence", () => {
  const changed = structuredClone(manifest);
  const item = changed.capabilities.find((entry) =>
    entry.disposition === "portable-fallback"
  );
  item.tests = ["production-kernel-differential"];
  changed.policy.test_evidence["production-kernel-differential"].differential = false;
  assert.throws(
    () => validateManifest(changed),
    /portable fallback lacks differential test evidence/,
  );
});

test("shared mathematical cores cannot contain Node-API symbols", () => {
  const changed = structuredClone(manifest);
  const item = changed.capabilities.find((entry) =>
    entry.id === "napi:@sagemath/sagejs-flint:nfFactorDegreesBatch"
  );
  item.shared_core = "packages/flint/src/number_field_zeta.c";
  assert.throws(
    () => validateManifest(changed),
    /purported shared core contains Node-API symbols/,
  );
});

test("compiled and shared capabilities cannot claim unreceipted availability", () => {
  const changed = structuredClone(manifest);
  const kernel = changed.capabilities.find((entry) =>
    entry.kind === "production-kernel"
  );
  kernel.status = "available";
  assert.throws(
    () => validateManifest(changed),
    /production capability receipt and availability status disagree/,
  );
});

test("public workflow aliases contain only exact reviewed capability IDs", () => {
  const changed = structuredClone(manifest);
  changed.workflow_aliases["riemann-zeta-batch"] = [
    "analytic:not-a-reviewed-capability",
  ];
  assert.throws(
    () => validateManifest(changed),
    /workflow riemann-zeta-batch contains unknown capabilities/,
  );
});

test("public workflow aliases cannot drift from the browser parity corpus", () => {
  const changed = structuredClone(manifest);
  changed.workflow_aliases["riemann-zeta-batch"] = [
    "analytic:dirichlet-l-batch",
  ];
  assert.throws(
    () => validateManifest(changed),
    /requirements disagree with the browser parity corpus/,
  );
  delete changed.workflow_aliases["riemann-zeta-batch"];
  assert.throws(
    () => validateManifest(changed),
    /do not exactly cover the browser parity corpus/,
  );
});

test("the public machine report is deterministic and excludes review internals", () => {
  const expected = validateReport(report, manifest);
  assert.deepEqual(expected.counts, report.counts);
  assert.equal(report.schema, "sagejs.wasm-capability-report/v1");
  assert.equal(report.capabilities.length, manifest.capabilities.length);
  assert.deepEqual(report.workflow_aliases, manifest.workflow_aliases);
  assert.equal("review_note" in report.capabilities[0], false);
  assert.equal(typeof report.capabilities[0].explanation, "string");
  const stale = structuredClone(report);
  stale.capabilities[0].status = "stale";
  assert.throws(() => validateReport(stale, manifest), /report is stale/);
  assert.deepEqual(publicReport(manifest), report);
});

async function publicApiModule() {
  return import("../architecture/wasm-capability-api.mjs");
}

function publicApiRecord(id, family, status) {
  return {
    id,
    family,
    disposition: status === "fallback" ? "portable-fallback" : "shared-core",
    status,
    fallback: "reviewed-exact-fallback",
    wasm_module: "test-module",
    public_consumers: ["Test.consumer"],
    explanation: "A substantive public explanation for this test capability.",
  };
}

function publicApiReport() {
  return {
    schema: "sagejs.wasm-capability-report/v1",
    source: "architecture/wasm-capabilities.json",
    source_sha256: "a".repeat(64),
    counts: {
      total: 3,
      by_kind: { "specialist-capability": 3 },
      by_disposition: { "portable-fallback": 1, "shared-core": 2 },
      by_status: { available: 1, fallback: 1, planned: 1 },
    },
    workflow_aliases: {
      "exact-demo": ["cap:available", "cap:fallback"],
      "planned-demo": ["cap:available", "cap:planned"],
    },
    capabilities: [
      publicApiRecord("cap:available", "demo", "available"),
      publicApiRecord("cap:fallback", "demo", "fallback"),
      publicApiRecord("cap:planned", "future", "planned"),
    ],
  };
}

test("the checked host API filters families and resolves exact workflows", async () => {
  const { createSagejsCapabilityAPI } = await publicApiModule();
  const input = publicApiReport();
  const api = createSagejsCapabilityAPI(input);
  assert.deepEqual(api.families(), ["demo", "future"]);
  assert.deepEqual(
    api.sagejs_capabilities("demo").map((item) => item.id),
    ["cap:available", "cap:fallback"],
  );
  assert.equal(api.workflow("exact-demo").available, true);
  assert.deepEqual(
    api.workflow("planned-demo").unavailable_capabilities,
    ["cap:planned"],
  );
  assert.equal(api.hasCapability("cap:available"), true);
  assert.equal(api.hasCapability("cap:unknown"), false);
  assert.throws(() => api.capability("cap:unknown"), /unknown Sage.js capability/);
  assert.throws(() => api.workflow("unknown-demo"), /unknown Sage.js workflow/);
  assert.throws(() => api.sagejs_capabilities("typo"), /unknown Sage.js capability family/);

  input.capabilities[0].status = "planned";
  assert.equal(api.capability("cap:available").status, "available");
  assert.throws(() => {
    api.report.capabilities[0].status = "planned";
  }, TypeError);
});

test("a receipt-authenticated closure overrides descriptive report status", async () => {
  const { createSagejsCapabilityAPI } = await publicApiModule();
  const api = createSagejsCapabilityAPI(publicApiReport(), {
    availableCapabilityIds: ["cap:available", "cap:planned"],
  });
  assert.equal(api.isAvailable("cap:planned"), true);
  assert.equal(api.workflow("planned-demo").available, true);
  assert.equal(api.isAvailable("cap:fallback"), false);
  assert.throws(
    () => createSagejsCapabilityAPI(publicApiReport(), {
      availableCapabilityIds: ["cap:not-reviewed"],
    }),
    /production closure contains unknown capability ID/,
  );
});

test("unknown workflow IDs and malformed reports fail closed", async () => {
  const { validateSagejsCapabilityReport } = await publicApiModule();
  const unknown = publicApiReport();
  unknown.workflow_aliases["exact-demo"].push("cap:not-reviewed");
  assert.throws(
    () => validateSagejsCapabilityReport(unknown),
    /contains unknown capability IDs/,
  );

  const duplicate = publicApiReport();
  duplicate.capabilities.push(duplicate.capabilities[0]);
  duplicate.counts.total += 1;
  assert.throws(() => validateSagejsCapabilityReport(duplicate), /duplicate capability ID/);

  const badCount = publicApiReport();
  badCount.counts.total = 99;
  assert.throws(() => validateSagejsCapabilityReport(badCount), /counts.total/);
});

test("the checked-in generated report is accepted by the public API", async () => {
  const { createSagejsCapabilityAPI } = await publicApiModule();
  const api = createSagejsCapabilityAPI(report);
  assert.ok(api.sagejs_capabilities().length >= 900);
  assert.ok(api.sagejs_capabilities("number-fields").length > 0);
  assert.deepEqual(
    api.workflow("number-field-maximal-order-prime-zeta").required_capabilities,
    [
      "kernel:number-field-om-proof-production",
      "kernel:number-field-round4-state-production",
      "kernel:number-field-composite-analysis-production",
      "kernel:number-field-zeta-coefficients-production",
      "napi:@sagemath/sagejs-flint:nfFactorDegreesBatch",
    ],
  );
});
