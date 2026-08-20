import assert from "node:assert/strict";
import test from "node:test";
import { capabilityFamilies, filterCapabilities, validateCapabilityReport } from "../capability-report.mjs";

const report = validateCapabilityReport({
  schema: "sagejs.wasm-capability-report/v1",
  source: "architecture/wasm-capabilities.json",
  source_sha256: "abc",
  counts: { total: 2 },
  capabilities: [
    { id: "napi:nf", family: "number-fields", disposition: "shared-core", status: "available", fallback: "strict-python", wasm_module: "flint", public_consumers: ["NumberField"], explanation: "Packed exact implementation.", resource_limits: { degree: 64 } },
    { id: "napi:desktop", family: "analytic", disposition: "desktop-only", status: "desktop-only", fallback: "portable", wasm_module: "none", public_consumers: [], explanation: "Dependency is unavailable in browsers." },
  ],
});

test("public capability records retain explanations, fallbacks and limits", () => {
  assert.deepEqual(capabilityFamilies(report), ["analytic", "number-fields"]);
  assert.equal(filterCapabilities(report, { family: "number-fields" })[0].resource_limits.degree, 64);
  assert.equal(filterCapabilities(report, { query: "unavailable" })[0].status, "desktop-only");
  assert.equal(filterCapabilities(report, { query: "NumberField" })[0].id, "napi:nf");
});

test("malformed or unexplained public records fail closed", () => {
  assert.throws(() => validateCapabilityReport({ schema: "wrong", capabilities: [] }), /unsupported/);
  assert.throws(() => validateCapabilityReport({ schema: "sagejs.wasm-capability-report/v1", capabilities: [{ id: "x" }] }), /invalid family/);
});
