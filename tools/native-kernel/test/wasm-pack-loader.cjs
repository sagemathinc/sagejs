"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const test = require("node:test");

const wasm = Buffer.from(
  "AGFzbQEAAAABEwRgAX8Bf2ABfwBgAAF/YAF/AX4DCQgAAQIDAAAAAgUDAQACBggBfwFBgIgECwd0CQZtZW1vcnkCAAhhbGxvY2F0ZQAACmRlYWxsb2NhdGUAAQZ0YXJnZXQAAgpyZXN1bHRfdTY0AAMNcmVzdWx0X2xlbmd0aAAEC3Jlc3VsdF9zaWduAAUMcmVzdWx0X2xpbWJzAAYMbGFzdF9tZXNzYWdlAAcKJwgEAEEICwIACwQAQQALBABCKgsEAEEACwQAQQALBABBAAsEAEEACwCXAQRuYW1lABcWc2FnZWpzLXJvdXRlLXRlc3Qud2FzbQFjCAAIYWxsb2NhdGUBCmRlYWxsb2NhdGUCBnRhcmdldAMKcmVzdWx0X3U2NAQNcmVzdWx0X2xlbmd0aAULcmVzdWx0X3NpZ24GDHJlc3VsdF9saW1icwcMbGFzdF9tZXNzYWdlBxIBAA9fX3N0YWNrX3BvaW50ZXIAOAlwcm9kdWNlcnMBDHByb2Nlc3NlZC1ieQEMVWJ1bnR1IGNsYW5nETIxLjEuOCAoNnVidW50dTEpAJQBD3RhcmdldF9mZWF0dXJlcwgrC2J1bGstbWVtb3J5Kw9idWxrLW1lbW9yeS1vcHQrFmNhbGwtaW5kaXJlY3Qtb3ZlcmxvbmcrCm11bHRpdmFsdWUrD211dGFibGUtZ2xvYmFscysTbm9udHJhcHBpbmctZnB0b2ludCsPcmVmZXJlbmNlLXR5cGVzKwhzaWduLWV4dA==",
  "base64",
);

const routes = [
  [
    "packed-graph-components-production",
    "sagejs/kernels/graph/components.py",
    "route_probe_graph",
  ],
  [
    "dense-integer-production",
    "sagejs/kernels/matrix/dense_integer.py",
    "route_probe_matrix",
  ],
  [
    "packed-integer-polynomial-production",
    "sagejs/kernels/polynomial/packed_integer.py",
    "route_probe_polynomial",
  ],
  [
    "p1-heilbronn-production",
    "sagejs/kernels/p1.py",
    "route_probe_p1",
  ],
  [
    "number-field-zeta-coefficients-production",
    "sagejs/number_fields/zeta_coefficient_kernel.py",
    "route_probe_number_field",
  ],
  [
    "packed-combinatorial-integer-rational-production",
    "sagejs/kernels/matrix/combinatorial.py",
    "route_probe_combinatorial_exact",
  ],
  [
    "packed-combinatorial-prime-production",
    "sagejs/kernels/matrix/combinatorial.py",
    "route_probe_combinatorial_prime",
  ],
];

function u32(value) {
  const result = [];
  let current = value >>> 0;
  do {
    let byte = current & 0x7f;
    current >>>= 7;
    if (current !== 0) byte |= 0x80;
    result.push(byte);
  } while (current !== 0);
  return result;
}

function vector(values) {
  return [...u32(values.length), ...values.flat()];
}

function wasmString(value) {
  const bytes = Buffer.from(value, "utf8");
  return [...u32(bytes.length), ...bytes];
}

function section(id, payload) {
  return [id, ...u32(payload.length), ...payload];
}

function functionType(parameters, results) {
  return [0x60, ...vector(parameters), ...vector(results)];
}

function f64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleLE(value);
  return [...bytes];
}

function functionBody(locals, instructions) {
  const body = [...vector(locals), ...instructions, 0x0b];
  return [...u32(body.length), ...body];
}

function float64Wasm() {
  const i32 = 0x7f;
  const i64 = 0x7e;
  const binary64 = 0x7c;
  const types = [
    functionType([i32], [i32]),
    functionType([i32], []),
    functionType([i32, i32, i32, i32, binary64, i64], [i32]),
    functionType([i32], [binary64]),
    functionType([], [i32]),
  ];
  const functions = [0, 1, 2, 3, 4];
  const exports = [
    ["memory", 0x02, 0],
    ["allocate", 0x00, 0],
    ["deallocate", 0x00, 1],
    ["target", 0x00, 2],
    ["result_f64", 0x00, 3],
    ["last_message", 0x00, 4],
  ].map(([name, kind, index]) => [
    ...wasmString(name), kind, ...u32(index),
  ]);
  const scaledStores = [0, 8, 16].flatMap((offset) => [
    0x20, 0x02, // local.get output
    0x20, 0x00, // local.get source
    0x2b, 0x03, ...u32(offset), // f64.load align=8, offset
    0x20, 0x04, // local.get scale
    0xa2, // f64.mul
    0x39, 0x03, ...u32(offset), // f64.store align=8, offset
  ]);
  const bodies = [
    functionBody([[0x01, i32]], [
      0x23, 0x00, // global.get bump
      0x21, 0x01, // local.set scratch
      0x23, 0x00,
      0x20, 0x00,
      0x6a, // i32.add
      0x24, 0x00, // global.set bump
      0x20, 0x01, // local.get scratch
    ]),
    functionBody([], []),
    functionBody([], [...scaledStores, 0x41, 0x00]),
    functionBody([], [0x44, ...f64(7.0)]),
    functionBody([], [0x41, 0x00]),
  ];
  return Buffer.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vector(types)),
    ...section(3, vector(functions.map(u32))),
    ...section(5, [0x01, 0x00, 0x01]),
    ...section(6, [0x01, i32, 0x01, 0x41, ...u32(1024), 0x0b]),
    ...section(7, vector(exports)),
    ...section(10, vector(bodies)),
  ]);
}

function manifest() {
  const modules = routes.map(([id, logicalSource, name], index) => ({
    logicalSource,
    sourceHash: `source-${index}`,
    abiHash: `abi-${index}`,
    coreHash: `core-${index}`,
    oracleIdentity: `oracle-${index}`,
    identityHash: `identity-${index}`,
    functions: [name],
  }));
  return {
    schema: "sagejs.native-wasm-pack/v1",
    packs: [{
      domain: "gmp",
      status: "built",
      asset: "kernel-gmp.wasm",
      sha256: createHash("sha256").update(wasm).digest("hex"),
      modules: modules.map(({ identityHash }) => identityHash),
      identity: { modules },
    }],
    kernels: routes.map(([id, logicalSource, name], index) => ({
      id,
      logicalSource,
      domain: "gmp",
      sourceHash: `source-${index}`,
      abiHash: `abi-${index}`,
      coreHash: `core-${index}`,
      oracleIdentity: `oracle-${index}`,
      identityHash: `identity-${index}`,
      runtime: {
        allocate: "allocate",
        deallocate: "deallocate",
        resultU64: "result_u64",
        resultLength: "result_length",
        resultSign: "result_sign",
        resultLimbs: "result_limbs",
        lastMessage: "last_message",
      },
      functions: [{
        name,
        declarationHash: `declaration-${index}`,
        status: "compiled-source",
        bridge: { export: "target", parameters: [], results: ["uint64"] },
      }],
    })),
  };
}

async function runtime(source = manifest()) {
  const {
    instantiateWasmKernelPacks,
  } = await import("../wasm-pack-loader.mjs");
  const resolver = await instantiateWasmKernelPacks({
    manifest: source,
    load: async () => wasm,
    host: async () => ({}),
  });
  return { resolver, source };
}

test("authenticated pack routes observe every function across split source packs", async () => {
  const {
    instrumentAuthenticatedWasmKernelResolver,
  } = await import("../wasm-pack-loader.mjs");
  const { resolver, source } = await runtime();
  const records = [];

  // The public manifest remains inspectable and mutable, but it is not the
  // authority consulted by telemetry after the pack has been authenticated.
  source.kernels[0].id = "forged-production";
  source.kernels[0].logicalSource = "user/forged.py";
  const instrumented = instrumentAuthenticatedWasmKernelResolver(
    resolver,
    (capabilityId, arguments_, value) => {
      records.push({ capabilityId, arguments_, value });
    },
  );

  for (const [index, [id, logicalSource, name]] of routes.entries()) {
    const callable = index % 2 === 0
      ? instrumented.resolve(logicalSource, name, {
        capabilityId: "kernel:user-forged-production",
      })
      : instrumented.function(logicalSource, name);
    assert.equal(callable(), 42n);
    assert.equal(records.at(-1).capabilityId, `kernel:${id}`);
  }
  assert.deepEqual(
    records.map(({ capabilityId }) => capabilityId),
    routes.map(([id]) => `kernel:${id}`),
  );
  assert.ok(records.every(({ arguments_, value }) =>
    arguments_.length === 0 && value === 42n
  ));
  assert.equal(
    instrumented.resolve("user/forged.py", "route_probe_graph"),
    null,
  );
  assert.equal(records.length, routes.length);
});

test("manifest-shaped and copied resolvers cannot mint source-kernel telemetry", async () => {
  const {
    instrumentAuthenticatedWasmKernelResolver,
  } = await import("../wasm-pack-loader.mjs");
  const { resolver } = await runtime();
  const observe = () => assert.fail("forged resolver invoked the observer");
  assert.throws(
    () => instrumentAuthenticatedWasmKernelResolver({
      manifest: resolver.manifest,
      resolve: resolver.resolve,
      function: resolver.function,
    }, observe),
    /no authenticated pack identity/,
  );
  assert.throws(
    () => instrumentAuthenticatedWasmKernelResolver({ ...resolver }, observe),
    /no authenticated pack identity/,
  );
});

test("a pack digest mismatch cannot establish route authority", async () => {
  const source = manifest();
  source.packs[0].sha256 = "0".repeat(64);
  await assert.rejects(runtime(source), /Wasm pack digest mismatch for gmp/);
});

test("precompiled modules remain callable but cannot claim digest authentication", async () => {
  const {
    instantiateWasmKernelPacks,
    instrumentAuthenticatedWasmKernelResolver,
  } = await import("../wasm-pack-loader.mjs");
  const source = manifest();
  const module = await WebAssembly.compile(wasm);
  const resolver = await instantiateWasmKernelPacks({
    manifest: source,
    load: async () => module,
    host: async () => ({}),
  });
  assert.equal(resolver.function(routes[0][1], routes[0][2])(), 42n);
  assert.throws(
    () => instrumentAuthenticatedWasmKernelResolver(resolver, () => {}),
    /no authenticated pack identity/,
  );
});

test("route metadata must match the digest-authenticated pack identity", async () => {
  const source = manifest();
  source.kernels[0].logicalSource = "user/relabeled.py";
  await assert.rejects(
    runtime(source),
    /route metadata differs from authenticated gmp pack/,
  );
});

test("browser-safe loader marshals bounded Float64 buffers and results", async () => {
  const bytes = float64Wasm();
  const moduleIdentity = {
    logicalSource: "sagejs/native/float64_loader_witness.py",
    sourceHash: "float64-source",
    abiHash: "float64-abi",
    coreHash: "float64-core",
    oracleIdentity: "float64-oracle",
    identityHash: "float64-identity",
    functions: ["scaled_buffer_batch"],
  };
  const source = {
    schema: "sagejs.native-wasm-pack/v1",
    packs: [{
      domain: "gmp",
      status: "built",
      asset: "float64.wasm",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      modules: [moduleIdentity.identityHash],
      identity: { modules: [moduleIdentity] },
    }],
    kernels: [{
      id: "float64-loader-witness-production",
      logicalSource: moduleIdentity.logicalSource,
      domain: "gmp",
      ...moduleIdentity,
      runtime: {
        allocate: "allocate",
        deallocate: "deallocate",
        resultFloat64: "result_f64",
        lastMessage: "last_message",
      },
      functions: [{
        name: "scaled_buffer_batch",
        declarationHash: "float64-declaration",
        status: "compiled-source",
        bridge: {
          export: "target",
          parameters: [
            { name: "source", type: "Float64Buffer", mutable: false },
            { name: "output", type: "Float64Buffer", mutable: true },
            { name: "scale", type: "Float64" },
            { name: "count", type: "uint64" },
          ],
          results: ["Float64"],
        },
      }],
    }],
  };
  const {
    instantiateWasmKernelPacks,
  } = await import("../wasm-pack-loader.mjs");
  const resolver = await instantiateWasmKernelPacks({
    manifest: source,
    load: async () => bytes,
    host: async () => ({}),
  });
  const batch = resolver.function(
    moduleIdentity.logicalSource,
    "scaled_buffer_batch",
  );
  const input = Object.freeze([1.5, -2.0, 4.0]);
  const output = new Float64Array(3);
  assert.equal(batch(input, output, 2.0, 3n), 7.0);
  assert.deepEqual(Array.from(output), [3.0, -4.0, 8.0]);
  const boxedPythonFloat = Object.freeze(Object(2.0));
  assert.equal(batch(input, output, boxedPythonFloat, 3n), 7.0);
  assert.deepEqual(Array.from(output), [3.0, -4.0, 8.0]);
  const sageReal = Object.freeze({ __float__: () => Object(2.0) });
  assert.equal(batch(input, output, sageReal, 3n), 7.0);
  assert.deepEqual(Array.from(output), [3.0, -4.0, 8.0]);
  assert.throws(
    () => batch({ length: 0x2000_0000 }, output, 2.0, 3n),
    /bounded wasm32 allocation ABI/,
  );
  assert.throws(
    () => batch(input, output, 2n, 3n),
    /Float64 arguments require a JavaScript number or Python numeric value/,
  );
  assert.throws(
    () => batch(input, output, "2.0", 3n),
    /Float64 arguments require a JavaScript number or Python numeric value/,
  );
  assert.throws(
    () => batch(input, output, { valueOf: () => 2.0 }, 3n),
    /Float64 arguments require a JavaScript number or Python numeric value/,
  );
  assert.throws(
    () => batch(input, output, { __float__: () => "2.0" }, 3n),
    /Float64 arguments require a JavaScript number or Python numeric value/,
  );
});

test("automatic selection receipts are part of the authenticated pack identity", async () => {
  const source = manifest();
  const receipt = {
    schema: "sagejs.native-selection-receipt/v1",
    receiptId: "loader-selection-witness",
    domain: "loader selection authentication witness",
    operation: routes[0][2],
    evidence: ["tools/native-kernel/test/wasm-pack-loader.cjs"],
    workload: { arguments: {} },
  };
  source.kernels[0].automaticSelections = {
    [routes[0][2]]: structuredClone(receipt),
  };
  source.packs[0].identity.modules[0].automaticSelections = {
    [routes[0][2]]: structuredClone(receipt),
  };
  source.kernels[0].automaticSelections[routes[0][2]].domain = "forged domain";
  await assert.rejects(
    runtime(source),
    /route metadata differs from authenticated gmp pack/,
  );
});
