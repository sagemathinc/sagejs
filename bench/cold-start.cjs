"use strict";

const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const samples = 20;

function measure(label, args, input) {
  const times = [];
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now();
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      input,
      stdio: ["pipe", "ignore", "ignore"],
    });
    times.push(performance.now() - start);
    if (result.status !== 0) {
      throw new Error(`${label} exited with status ${result.status}`);
    }
  }
  times.sort((left, right) => left - right);
  const median = times[Math.floor(times.length / 2)];
  const minimum = times[0];
  console.log(
    `${label.padEnd(28)} median ${median.toFixed(1).padStart(6)} ms  ` +
      `min ${minimum.toFixed(1).padStart(6)} ms`
  );
}

measure("bare Node", ["-e", ""]);
measure("load Sage.js compiler", ["-e", "require('.')"]);
measure("sagejs --version", ["bin/sagejs", "--version"]);
measure("sagejs evaluate 2^100", ["bin/sagejs"], "print(2^100)\n");
measure("sagejs import numpy", ["bin/sagejs"], "import numpy\n");
measure("load native FLINT", ["-e", "require('./packages/flint')"]);
measure("FLINT factorial(100000)", [
  "-e",
  "require('./packages/flint').factorial(100000)",
]);
