"use strict";

// Hand-written JavaScript translations of a few corpus hot paths. These are
// diagnostic ceilings, not compatibility tests: they show what V8 can do
// after Python dispatch and representation costs have been removed.

function gcd(left, right) {
  while (right) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

function gcdBenchmark() {
  let total = 0;
  for (let index = 0; index < 100000; index += 1) {
    total += gcd(92250, 922350 + index);
  }
  if (total !== 2414484) throw new Error(`gcd result: ${total}`);
}

function xgcd(left, right) {
  let previousX = 1;
  let x = 0;
  let previousY = 0;
  let y = 1;
  while (right) {
    const quotient = Math.floor(left / right);
    const remainder = left - quotient * right;
    [x, previousX] = [previousX - quotient * x, x];
    [y, previousY] = [previousY - quotient * y, y];
    [left, right] = [right, remainder];
  }
  return [left, previousX, previousY];
}

function xgcdBenchmark() {
  let total = 0;
  for (let index = 0; index < 100000; index += 1) {
    total += xgcd(92250, 922350 + index)[0];
  }
  if (total !== 2414484) throw new Error(`xgcd result: ${total}`);
}

function ordBenchmark() {
  const values = [];
  for (let index = 0; index < 1000; index += 1) {
    values.push(
      `Foobar-${index}`,
      `${index}-ab-asdfsdf-asdf`,
      "yeah",
    );
  }
  let total = 0;
  for (let outer = 0; outer < 50; outer += 1) {
    for (const value of values) {
      for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (97 <= code && code <= 122) total += 1;
        if (65 <= code && code <= 90) total += 2;
        if (value[index] === "a".charCodeAt(0)) total += 3;
      }
    }
  }
  if (total !== 1200000) throw new Error(`ord result: ${total}`);
}

const benchmarks = new Map([
  ["gcd", gcdBenchmark],
  ["xgcd", xgcdBenchmark],
  ["ord_builtin", ordBenchmark],
]);

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

for (const [name, benchmark] of benchmarks) {
  for (let warmup = 0; warmup < 3; warmup += 1) benchmark();
  const samples = [];
  for (let sample = 0; sample < 7; sample += 1) {
    const started = process.hrtime.bigint();
    benchmark();
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  console.log(`${name.padEnd(16)} ${median(samples).toFixed(3)} ms`);
}
