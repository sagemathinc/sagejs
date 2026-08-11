"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  formatExecutionTiming,
  installTimingHooks,
  measureExecution,
  measureInitialization,
} = require("../dist/tools/timing.js");

test("execution timing reports high-resolution Node CPU and wall clocks", () => {
  const { value, timing } = measureExecution(() => {
    let total = 0;
    for (let index = 0; index < 100_000; index += 1) total += index;
    return total;
  });
  assert.equal(value, 4_999_950_000);
  assert.ok(timing.wallMs >= 0);
  assert.ok(timing.cpu);
  assert.ok(timing.cpu.userMs >= 0);
  assert.ok(timing.cpu.systemMs >= 0);
  assert.equal(
    timing.cpu.totalMs,
    timing.cpu.userMs + timing.cpu.systemMs,
  );
  assert.match(
    formatExecutionTiming(timing),
    /^CPU times: user [\d.]+ms, sys: [\d.]+ms, total: [\d.]+ms\nWall time: [\d.]+ms$/,
  );
});

test("lazy initialization spans retain their nested structure", () => {
  const { timing } = measureExecution(() =>
    measureInitialization("import example", () =>
      measureInitialization("require example-native", () => 42),
    ),
  );
  assert.equal(timing.initialization.length, 1);
  assert.equal(timing.initialization[0].label, "import example");
  assert.equal(timing.initialization[0].children.length, 1);
  assert.equal(
    timing.initialization[0].children[0].label,
    "require example-native",
  );
  assert.ok(timing.initialization[0].wallMs >= 0);
  assert.match(
    formatExecutionTiming(timing),
    /\nInitialization: [\d.]+ms\n  import example: [\d.]+ms\n    require example-native: [\d.]+ms$/,
  );
});

test("browser-shaped measurements format as wall-only timings", () => {
  assert.equal(
    formatExecutionTiming({
      wallMs: 1.25,
      initialization: [],
    }),
    "Wall time: 1.250ms",
  );
});

test("compiler timing hooks report through the selected host output", () => {
  const target = {};
  const output = [];
  const uninstall = installTimingHooks(target, (text) => output.push(text));
  const token = target.__sagejs_timing_start__();
  measureInitialization("initialize test", () => undefined);
  const result = target.__sagejs_timing_finish__(token);
  assert.ok(result.cpu);
  assert.match(output[0], /^CPU times:/);
  assert.match(output[0], /\nInitialization:/);
  uninstall();
  assert.equal(target.__sagejs_timing_start__, undefined);
  assert.equal(target.__sagejs_timing_finish__, undefined);
});
