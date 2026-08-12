"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  formatExecutionTiming,
  formatTimeitResult,
  installTimingHooks,
  measureExecution,
  measureInitialization,
  parseTimeitDirective,
  runTimeit,
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
  let now = 0;
  const uninstall = installTimingHooks(
    target,
    (text) => output.push(text),
    { timeitPolicy: { now: () => now } },
  );
  const token = target.__sagejs_timing_start__();
  measureInitialization("initialize test", () => undefined);
  const result = target.__sagejs_timing_finish__(token);
  assert.ok(result.cpu);
  assert.match(output[0], /^CPU times:/);
  assert.match(output[0], /\nInitialization:/);

  const timeit = target.__sagejs_timeit_start__({ number: 2, repeat: 2 });
  const batches = [];
  let number;
  while ((number = target.__sagejs_timeit_begin__(timeit))) {
    batches.push(number);
    now += number * 0.5;
    target.__sagejs_timeit_end__(timeit);
  }
  assert.deepEqual(batches, [1, 2, 2]);
  assert.equal(target.__sagejs_timeit_finish__(timeit), undefined);
  assert.match(output[1], /^500 µs ± 0 µs per loop/);
  uninstall();
  assert.equal(target.__sagejs_timing_start__, undefined);
  assert.equal(target.__sagejs_timing_finish__, undefined);
  assert.equal(target.__sagejs_timeit_start__, undefined);
  assert.equal(target.__sagejs_timeit_begin__, undefined);
  assert.equal(target.__sagejs_timeit_end__, undefined);
  assert.equal(target.__sagejs_timeit_finish__, undefined);
  assert.equal(target.__sagejs_timeit_abort__, undefined);
});

test("timeit directives accept compact and split loop/repeat options", () => {
  assert.deepEqual(parseTimeitDirective("%timeit -n10 -r 3 value + 1"), {
    source: "value + 1",
    options: { number: 10, repeat: 3 },
  });
  assert.deepEqual(
    parseTimeitDirective("  %timeit --number=4 --repeat 2 -- -value"),
    {
      source: "-value",
      options: { number: 4, repeat: 2 },
    },
  );
  assert.equal(parseTimeitDirective("value + 1"), undefined);
  assert.throws(() => parseTimeitDirective("%timeit -n0 value"), /positive/);
  assert.throws(() => parseTimeitDirective("%timeit -q value"), /unsupported/);
  assert.throws(() => parseTimeitDirective("%timeit"), /requires a statement/);
});

test("timeit calibration and statistics are deterministic with a test clock", () => {
  let now = 0;
  const batches = [];
  const result = runTimeit(
    (number) => {
      batches.push(number);
      now += number * 0.025;
    },
    { repeat: 3 },
    {
      now: () => now,
      calibrationTargetMs: 2,
      maximumNumber: 10_000,
    },
  );
  assert.deepEqual(batches, [1, 1, 10, 100, 100, 100, 100]);
  assert.equal(result.number, 100);
  assert.equal(result.repeat, 3);
  for (const elapsed of result.runsMs) {
    assert.ok(Math.abs(elapsed - 2.5) < 1e-12);
  }
  assert.ok(Math.abs(result.meanMs - 0.025) < 1e-12);
  assert.ok(result.standardDeviationMs < 1e-12);
  assert.match(
    formatTimeitResult(result),
    /^25\.0 µs ± 0 µs per loop \(mean ± std\. dev\. of 3 runs, 100 loops each\)$/,
  );
});

test("timeit honors explicit loops and formats wall-only measurements", () => {
  let now = 0;
  const batches = [];
  const result = runTimeit(
    (number) => {
      batches.push(number);
      now += number * 2;
    },
    { number: 5, repeat: 2 },
    { now: () => now },
  );
  assert.deepEqual(batches, [1, 5, 5]);
  assert.deepEqual(result.runsMs, [10, 10]);
  assert.equal(
    formatTimeitResult(result),
    "2.00 ms ± 0 ms per loop " +
      "(mean ± std. dev. of 2 runs, 5 loops each)",
  );
});
