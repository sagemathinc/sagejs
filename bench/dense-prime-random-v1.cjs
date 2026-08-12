#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function positiveSetting(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!(value > 0)) throw new Error(`invalid ${name}=${raw}`);
  return value;
}

async function main() {
  const samples = Math.max(
    3,
    Math.floor(positiveSetting("SAGEJS_DENSE_PRIME_RANDOM_SAMPLES", 7)),
  );
  const scale = positiveSetting("SAGEJS_DENSE_PRIME_RANDOM_BUDGET_SCALE", 1);
  const sage = await createSage();
  try {
    await sage.evaluate(String.raw`
import sagejs.runtime as runtime


def _random_time(function):
    started = runtime.wall_time()
    result = function()
    elapsed = 1000 * (runtime.wall_time() - started)
    assert result.dimensions() == (500, 500)
    return elapsed


def _random_matrix_gf2():
    return random_matrix(GF(2), 500)


def _random_element_gf2():
    return MatrixSpace(GF(2), 500).random_element()


def _random_matrix_gf97():
    return random_matrix(GF(97), 500)


def _random_element_gf97():
    return MatrixSpace(GF(97), 500).random_element()


set_random_seed(20260812)
_first_binary = random_matrix(GF(2), 128)
set_random_seed(20260812)
assert random_matrix(GF(2), 128) == _first_binary
assert _first_binary.rank() >= 120
assert 0.45 < _first_binary.density() < 0.55

set_random_seed(314159)
_space_binary = MatrixSpace(GF(2), 128).random_element()
set_random_seed(314159)
assert MatrixSpace(GF(2), 128).random_element() == _space_binary
assert _space_binary.rank() >= 120
assert 0.45 < _space_binary.density() < 0.55
`);

    const cases = [
      ["random_matrix GF(2) 500²", "_random_matrix_gf2", 50],
      ["MatrixSpace.random GF(2) 500²", "_random_element_gf2", 50],
      ["random_matrix GF(97) 500²", "_random_matrix_gf97", 50],
      ["MatrixSpace.random GF(97) 500²", "_random_element_gf97", 50],
    ];
    const failures = [];
    console.log(`Dense prime random construction (${samples} warm samples)`);
    for (const [label, functionName, budget] of cases) {
      await sage.evaluate(`_random_time(${functionName})`);
      const timings = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const result = await sage.evaluate(`_random_time(${functionName})`);
        timings.push(Number(result.repr));
      }
      const elapsed = median(timings);
      const limit = budget * scale;
      console.log(
        `  ${label.padEnd(34)} ${elapsed.toFixed(2)} ms / ${limit.toFixed(2)} ms`,
      );
      if (!(elapsed >= 0 && elapsed <= limit)) failures.push(label);
    }
    if (failures.length !== 0) {
      throw new Error(`dense prime random budget exceeded: ${failures.join(", ")}`);
    }
  } finally {
    sage.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
