import { createRequire } from "node:module";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function parsePositiveInteger(name, fallback) {
  const marker = `--${name}=`;
  const argument = globalThis.process?.argv?.find((value) => value.startsWith(marker));
  if (argument === undefined) return fallback;
  const value = Number(argument.slice(marker.length));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${marker}<value> must be a positive safe integer`);
  }
  return value;
}

const iterations = parsePositiveInteger("iterations", 10_000_000);
const warmupIterations = parsePositiveInteger("warmup", 1_000_000);
const samples = parsePositiveInteger("samples", 9);
const addonArgument = globalThis.process?.argv?.find((value) => value.startsWith("--addon="));
const addonFilename = resolve(
  addonArgument === undefined
    ? resolve(dirname(fileURLToPath(import.meta.url)), "build/add.node")
    : addonArgument.slice("--addon=".length),
);

const native = require(addonFilename);

// (module (func (export "add") (param i32 i32) (result i32)
//   local.get 0 local.get 1 i32.add))
const wasmBytes = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);
const { add: wasmAdd } = new WebAssembly.Instance(
  new WebAssembly.Module(wasmBytes),
).exports;

function jsAdd(left, right) {
  return (left + right) | 0;
}

function runInline(count) {
  let accumulator = 17;
  for (let index = 0; index < count; index += 1) accumulator = (accumulator + 3) | 0;
  return accumulator;
}

function runCalls(operation, count) {
  let accumulator = 17;
  for (let index = 0; index < count; index += 1) {
    accumulator = operation(accumulator, 3);
  }
  return accumulator;
}

const cases = [
  ["inline-loop", runInline],
  ["javascript-call", (count) => runCalls(jsAdd, count)],
  ["wasm-call", (count) => runCalls(wasmAdd, count)],
  ["napi-call", (count) => runCalls(native.add_i32, count)],
];

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

const observations = Object.fromEntries(cases.map(([name]) => [name, []]));
const checksums = {};
for (const [name, operation] of cases) checksums[name] = operation(warmupIterations);

for (let sample = 0; sample < samples; sample += 1) {
  // Rotate case order so systematic temperature/frequency drift is not always
  // charged to the same boundary.
  const rotated = cases.map((_, index) => cases[(index + sample) % cases.length]);
  for (const [name, operation] of rotated) {
    const started = performance.now();
    const checksum = operation(iterations);
    const elapsedNanoseconds = (performance.now() - started) * 1_000_000;
    if (checksum !== checksums[name] + 3 * (iterations - warmupIterations)) {
      throw new Error(`${name} produced an unexpected checksum ${checksum}`);
    }
    observations[name].push(elapsedNanoseconds / iterations);
  }
}

const rawMedian = Object.fromEntries(
  cases.map(([name]) => [name, median(observations[name])]),
);
const baseline = rawMedian["inline-loop"];
const results = cases.map(([name]) => ({
  name,
  raw_ns_per_call: rawMedian[name],
  incremental_ns_per_call: Math.max(0, rawMedian[name] - baseline),
  calls_per_second: 1_000_000_000 / rawMedian[name],
  samples_ns_per_call: observations[name],
}));

const runtime = typeof Bun !== "undefined"
  ? { name: "bun", version: Bun.version, engine: "JavaScriptCore" }
  : typeof Deno !== "undefined"
    ? { name: "deno", version: Deno.version.deno, engine: `V8 ${Deno.version.v8}` }
    : {
        name: "node",
        version: process.versions.node,
        engine: `V8 ${process.versions.v8}`,
        napi: process.versions.napi,
      };

console.log(JSON.stringify({
  schema: "sagejs.call-boundary-benchmark/v1",
  runtime,
  platform: {
    os: globalThis.process?.platform ?? Deno.build.os,
    arch: globalThis.process?.arch ?? Deno.build.arch,
  },
  iterations,
  warmup_iterations: warmupIterations,
  samples,
  checksum: checksums["napi-call"] + 3 * (iterations - warmupIterations),
  results,
}, null, 2));
