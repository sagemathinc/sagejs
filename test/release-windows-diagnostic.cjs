// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { safeReport } = require("../scripts/release/windows-diagnostic.cjs");

test("diagnostic report uses a field allowlist, not secret-name redaction", () => {
  const result = safeReport({
    header: { nodejsVersion: "v26.5.1", commandLine: ["secret"], environment: "secret" },
    environmentVariables: { TOKEN: "secret" }, network: "secret", libuv: ["secret"],
    nativeStack: [{ pc: "0x123", symbol: "V8_Fatal", extra: "secret" }],
    javascriptHeap: { totalMemory: 123, nested: { secret: true }, unknown: "secret" },
  });
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.deepEqual(result.header, { nodejsVersion: "v26.5.1" });
  assert.deepEqual(result.nativeStack, [{ pc: "0x123", symbol: "V8_Fatal" }]);
  assert.deepEqual(result.javascriptHeap, { totalMemory: 123 });
});

test("empty reports remain explicit diagnostic-only data", () => {
  assert.deepEqual(safeReport({}), {
    schema: "sagejs.windows-runtime-diagnostic-report/v1", header: {},
    nativeStack: [], javascriptHeap: {},
  });
});
