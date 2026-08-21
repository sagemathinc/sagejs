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
];

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

test("authenticated pack routes observe graph, matrix, polynomial, P1, and number-field kernels", async () => {
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

test("route metadata must match the digest-authenticated pack identity", async () => {
  const source = manifest();
  source.kernels[0].logicalSource = "user/relabeled.py";
  await assert.rejects(
    runtime(source),
    /route metadata differs from authenticated gmp pack/,
  );
});
