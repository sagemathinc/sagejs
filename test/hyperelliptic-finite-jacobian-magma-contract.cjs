"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const harness = join(
  root,
  "bench",
  "hyperelliptic",
  "competitive",
  "finite-jacobian-magma-contract.cjs",
);

test("finite Jacobian result observation is outside the timed interval", () => {
  const result = spawnSync(process.execPath, [harness, "--print-sage-source"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const source = result.stdout;
  const timingEnd = source.indexOf(
    "samples.append(time.perf_counter_ns() - started)",
  );
  const observation = source.indexOf("result = divisor_data(value[0])");
  assert.notEqual(timingEnd, -1);
  assert.notEqual(observation, -1);
  assert.ok(
    timingEnd < observation,
    "the result must be observed only after the elapsed sample is recorded",
  );
  assert.doesNotMatch(source, /return value\[0\]/);
  assert.equal(source.match(/        return value\n/g)?.length, 9);
  assert.match(source, /materialize=True/);
});
