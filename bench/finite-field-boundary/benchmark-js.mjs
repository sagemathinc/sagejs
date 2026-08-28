import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));

function positiveOption(name, fallback) {
  const prefix = `--${name}=`;
  const argument = globalThis.process?.argv?.find((value) => value.startsWith(prefix));
  if (argument === undefined) return fallback;
  const value = Number(argument.slice(prefix.length));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${prefix}<integer> must be positive`);
  }
  return value;
}

const iterations = positiveOption("iterations", 5_000_000);
const warmupIterations = positiveOption("warmup", 250_000);
const samples = positiveOption("samples", 9);
const vectorLength = positiveOption("vector-length", 1_000_000);
const vectorSamples = positiveOption("vector-samples", 7);
const build = resolve(root, "build");
const native = require(resolve(build, "modular.node"));
const wasmModule = new WebAssembly.Module(readFileSync(resolve(build, "modular.wasm")));
const wasm = new WebAssembly.Instance(wasmModule).exports;

const modulus = 65_521;
const multiplier = 12_345;
const increment = 6_789;

function numberStep(value) {
  return (value * multiplier + increment) % modulus;
}

function bigintStep(value) {
  return (value * 12_345n + 6_789n) % 65_521n;
}

function runInline(count) {
  let value = 1;
  for (let index = 0; index < count; index += 1) {
    value = (value * multiplier + increment) % modulus;
  }
  return value;
}

function runNumberCalls(operation, count) {
  let value = 1;
  for (let index = 0; index < count; index += 1) value = operation(value);
  return value;
}

function runBigintCalls(count) {
  let value = 1n;
  for (let index = 0; index < count; index += 1) value = bigintStep(value);
  return Number(value);
}

function runChunks(operation, chunk, count) {
  let value = 1;
  let remaining = count;
  while (remaining !== 0) {
    const width = Math.min(chunk, remaining);
    value = operation(value, multiplier, increment, modulus, width);
    remaining -= width;
  }
  return value;
}

function makeResidue(prototype, parent, value, freeze) {
  const result = Object.create(prototype);
  result._parent = parent;
  result._value = value;
  if (freeze) Object.freeze(result);
  return result;
}

function makeObjectRunner({ kind, multiply, add, fused, freeze = false }) {
  const parent = Object.freeze({ _kind: "ZMOD", _modulus: kind === "bigint" ? 65_521n : modulus });
  const prototype = Object.freeze({});
  const initial = kind === "bigint" ? 1n : 1;
  const factor = kind === "bigint" ? 12_345n : multiplier;
  const offset = kind === "bigint" ? 6_789n : increment;
  return (count) => {
    let value = makeResidue(prototype, parent, initial, freeze);
    const multiplierElement = makeResidue(prototype, parent, factor, freeze);
    const incrementElement = makeResidue(prototype, parent, offset, freeze);
    for (let index = 0; index < count; index += 1) {
      if (fused !== undefined) {
        value = makeResidue(
          prototype,
          parent,
          fused(value._value, multiplierElement._value, incrementElement._value),
          freeze,
        );
      } else {
        const product = makeResidue(
          prototype,
          parent,
          multiply(value._value, multiplierElement._value),
          freeze,
        );
        value = makeResidue(
          prototype,
          parent,
          add(product._value, incrementElement._value),
          freeze,
        );
      }
    }
    return Number(value._value);
  };
}

const rawCases = [
  ["js-number-inline", runInline],
  ["js-number-call", (count) => runNumberCalls(numberStep, count)],
  ["js-bigint-call", runBigintCalls],
  ["wasm-scalar-fused", (count) => runNumberCalls(
    (value) => wasm.mul_add_mod_u32(value, multiplier, increment, modulus),
    count,
  )],
  ["napi-scalar-fused", (count) => runNumberCalls(
    (value) => native.mul_add_mod_u32(value, multiplier, increment, modulus),
    count,
  )],
];

const objectCases = [
  ["object-js-number-two-results-frozen", makeObjectRunner({
    kind: "number",
    freeze: true,
    multiply: (left, right) => left * right % modulus,
    add: (left, right) => (left + right) % modulus,
  })],
  ["object-js-bigint-two-results", makeObjectRunner({
    kind: "bigint",
    multiply: (left, right) => left * right % 65_521n,
    add: (left, right) => (left + right) % 65_521n,
  })],
  ["object-js-number-two-results", makeObjectRunner({
    kind: "number",
    multiply: (left, right) => left * right % modulus,
    add: (left, right) => (left + right) % modulus,
  })],
  ["object-wasm-two-results", makeObjectRunner({
    kind: "number",
    multiply: (left, right) => wasm.mul_mod_u32(left, right, modulus),
    add: (left, right) => wasm.add_mod_u32(left, right, modulus),
  })],
  ["object-napi-two-results", makeObjectRunner({
    kind: "number",
    multiply: (left, right) => native.mul_mod_u32(left, right, modulus),
    add: (left, right) => native.add_mod_u32(left, right, modulus),
  })],
  ["object-wasm-fused-one-result", makeObjectRunner({
    kind: "number",
    fused: (value, factor, offset) => wasm.mul_add_mod_u32(
      value, factor, offset, modulus,
    ),
  })],
  ["object-napi-fused-one-result", makeObjectRunner({
    kind: "number",
    fused: (value, factor, offset) => native.mul_add_mod_u32(
      value, factor, offset, modulus,
    ),
  })],
];

const chunkCases = [["js-number-inline", runInline]];
for (const chunk of [1, 8, 64, 1_024]) {
  chunkCases.push(
    [`wasm-chain-${chunk}`, (count) => runChunks(wasm.chain_mod_u32, chunk, count)],
    [`napi-chain-${chunk}`, (count) => runChunks(native.chain_mod_u32, chunk, count)],
  );
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measureCases(group, cases, count, warmup, sampleCount) {
  const expected = runInline(count);
  const observations = Object.fromEntries(cases.map(([name]) => [name, []]));
  for (const [name, operation] of cases) {
    const checksum = operation(warmup);
    if (checksum !== runInline(warmup)) {
      throw new Error(`${group}/${name} warmup checksum ${checksum} is incorrect`);
    }
  }
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const rotated = cases.map((_, index) => cases[(sample + index) % cases.length]);
    for (const [name, operation] of rotated) {
      const started = performance.now();
      const checksum = operation(count);
      const elapsed = performance.now() - started;
      if (checksum !== expected) {
        throw new Error(`${group}/${name} checksum ${checksum} is incorrect`);
      }
      observations[name].push(elapsed * 1_000_000 / count);
    }
  }
  return cases.map(([name]) => ({
    name,
    median_ns_per_field_step: median(observations[name]),
    samples_ns_per_field_step: observations[name],
  }));
}

function seededVector(length) {
  const result = new Uint32Array(length);
  let state = 0x1234_5678;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    result[index] = state % modulus;
  }
  return result;
}

function vectorKernel(values) {
  let checksum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = (values[index] * multiplier + increment) % modulus;
    values[index] = value;
    checksum ^= value;
  }
  return checksum >>> 0;
}

function measureVectors() {
  const seed = seededVector(vectorLength);
  const expectedValues = seed.slice();
  const expectedChecksum = vectorKernel(expectedValues);
  const heapBase = Number(wasm.__heap_base.value);
  const requiredBytes = heapBase + seed.byteLength;
  if (requiredBytes > wasm.memory.buffer.byteLength) {
    wasm.memory.grow(Math.ceil((requiredBytes - wasm.memory.buffer.byteLength) / 65_536));
  }
  const wasmValues = new Uint32Array(wasm.memory.buffer, heapBase, vectorLength);
  const wasmTransferValues = new Uint32Array(vectorLength);
  const jsValues = new Uint32Array(vectorLength);
  const napiValues = new Uint32Array(vectorLength);
  const cases = [
    ["js-typed-array-resident", jsValues, () => vectorKernel(jsValues)],
    ["wasm-linear-memory-resident", wasmValues, () => wasm.vector_mul_add_mod_u32(
      heapBase, vectorLength, multiplier, increment, modulus,
    )],
    ["napi-borrowed-typed-array", napiValues, () => native.vector_mul_add_mod_u32(
      napiValues, multiplier, increment, modulus,
    )],
    ["wasm-copy-in-and-out", wasmTransferValues, () => {
      wasmValues.set(wasmTransferValues);
      const checksum = wasm.vector_mul_add_mod_u32(
        heapBase, vectorLength, multiplier, increment, modulus,
      );
      wasmTransferValues.set(wasmValues);
      return checksum;
    }],
  ];
  const observations = Object.fromEntries(cases.map(([name]) => [name, []]));
  for (let sample = 0; sample < vectorSamples; sample += 1) {
    const rotated = cases.map((_, index) => cases[(sample + index) % cases.length]);
    for (const [name, values, operation] of rotated) {
      values.set(seed);
      const started = performance.now();
      const checksum = operation() >>> 0;
      const elapsed = performance.now() - started;
      if (checksum !== expectedChecksum ||
          values[0] !== expectedValues[0] ||
          values[values.length - 1] !== expectedValues[expectedValues.length - 1]) {
        throw new Error(`${name} produced an incorrect vector`);
      }
      observations[name].push(elapsed * 1_000_000 / vectorLength);
    }
  }
  return cases.map(([name]) => ({
    name,
    median_ns_per_element: median(observations[name]),
    samples_ns_per_element: observations[name],
  }));
}

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
  schema: "sagejs.finite-field-boundary-benchmark/v1",
  runtime,
  platform: {
    os: globalThis.process?.platform ?? Deno.build.os,
    arch: globalThis.process?.arch ?? Deno.build.arch,
  },
  field: { modulus, multiplier, increment },
  scalar: {
    iterations,
    warmup_iterations: warmupIterations,
    samples,
    raw: measureCases("raw", rawCases, iterations, warmupIterations, samples),
    object: measureCases(
      "object", objectCases, Math.min(iterations, 2_000_000),
      Math.min(warmupIterations, 100_000), samples,
    ),
    chunked: measureCases(
      "chunked", chunkCases, iterations, warmupIterations, samples,
    ),
  },
  vector: {
    length: vectorLength,
    samples: vectorSamples,
    results: measureVectors(),
  },
}, null, 2));
