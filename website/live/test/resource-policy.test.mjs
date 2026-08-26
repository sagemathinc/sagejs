import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDisplayWithinLimit,
  boundedTimeout,
  formatExecutionError,
  OutputCollector,
  utf8Size,
} from "../resource-policy.mjs";
import { requestCredentials } from "../runtime-api.mjs";

test("credentialed project previews are explicit and production stays credentialless", () => {
  assert.equal(requestCredentials(""), "omit");
  assert.equal(requestCredentials("?unrelated=1"), "omit");
  assert.equal(requestCredentials("?cocalc-preview=1"), "same-origin");
});

test("UTF-8 limits count encoded bytes rather than UTF-16 units", () => {
  assert.equal(utf8Size("π🙂"), 6);
  const output = new OutputCollector(4);
  assert.equal(output.append("πππ"), "ππ\n\n[Output limit reached; the kernel was restarted.]\n");
  assert.equal(output.bytes, 4);
  assert.equal(output.exceeded, true);
  assert.equal(output.append("ignored"), "");
  const split = new OutputCollector(3);
  assert.match(split.append("🙂"), /^\n\n\[Output limit reached/);
  assert.doesNotMatch(split.text, /�/);
});

test("timeouts are positive and capped by policy", () => {
  assert.equal(boundedTimeout(100, { maximumTimeoutMs: 50 }), 50);
  assert.equal(boundedTimeout("15000"), 15_000);
  assert.throws(() => boundedTimeout(0), /positive/);
  assert.throws(() => boundedTimeout(Number.NaN), /positive/);
});

test("execution errors retain their headline when WebKit stacks omit it", () => {
  const error = new ReferenceError("name 'partitions' is not defined");
  error.stack = [
    "eval code@",
    "eval@[native code]",
    "evaluateNow@https://app.sagejs.org/evaluator.mjs:959:35",
  ].join("\n");
  assert.equal(
    formatExecutionError(error),
    [
      "ReferenceError: name 'partitions' is not defined",
      error.stack,
    ].join("\n"),
  );
});

test("execution errors do not duplicate a headline already in the stack", () => {
  const error = new TypeError("bad input");
  error.stack = "TypeError: bad input\n    at evaluateNow (evaluator.mjs:959:35)";
  assert.equal(formatExecutionError(error), error.stack);
});

test("structured plot payloads are bounded before rendering", () => {
  assert.equal(assertDisplayWithinLimit({ mime: "plot", data: [1] }, 100), 26);
  assert.throws(() => assertDisplayWithinLimit({ data: "x".repeat(200) }, 10), /plot payload uses/);
  const circular = {}; circular.self = circular;
  assert.throws(() => assertDisplayWithinLimit(circular), /not serializable/);
});
