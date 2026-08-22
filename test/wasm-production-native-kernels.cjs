"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const {
  buildWasmProductionPacks,
  inventoryProductionKernels,
} = require("../tools/native-kernel/wasm-production-pack.cjs");
const {
  portableKernelIdentity,
} = require("../tools/native-kernel/portable-identity.cjs");

test("the Wasm source-kernel inventory accounts for all registered kernels", async () => {
  const manifestPath = join(root, "architecture", "native-kernels.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const inventory = await inventoryProductionKernels({ root, manifestPath });
  const coverage = JSON.parse(readFileSync(join(
    root,
    "packages/flint-wasm/release/production-kernel-coverage.json",
  ), "utf8"));
  assert.equal(manifest.kernels.length, 40);
  assert.equal(inventory.registered.length, manifest.kernels.length);
  assert.equal(inventory.production.length, 33);
  assert.equal(inventory.modules.length, inventory.production.length);
  assert.equal(inventory.nonProduction.length, 7);
  assert.equal(coverage.totals.registered_kernels, 40);
  assert.equal(coverage.totals.production_kernels, 33);
  assert.equal(coverage.totals.compiled_functions, 238);
  assert.equal(coverage.totals.unsupported_production_functions, 0);
  const coverageById = new Map(coverage.kernels.map((item) => [item.id, item]));
  for (const omitted of inventory.nonProduction) {
    assert.match(omitted.reason, /\S/);
    assert.equal(omitted.fallback, "same-source");
    assert.ok(omitted.oracles.length > 0);
    assert.ok(omitted.tests.length > 0);
  }
  const functions = inventory.inventory.flatMap((kernel) => kernel.functions);
  assert.ok(functions.filter((fn) => fn.status === "compiled-source").length > 150);
  for (const fn of functions.filter((item) => item.status === "unsupported")) {
    assert.match(fn.reason, /\S/);
    assert.match(fn.declarationHash, /^[a-f0-9]{64}$/);
  }
  for (const kernel of inventory.inventory) {
    assert.equal(kernel.fallback, "same-source");
    assert.ok(kernel.oracles.length > 0);
    assert.ok(kernel.tests.length > 0);
    const compiled = kernel.functions.filter((fn) => fn.status === "compiled-source").length;
    const fallback = kernel.functions.filter((fn) => fn.status === "unsupported").length;
    assert.deepEqual(coverageById.get(kernel.id), {
      id: kernel.id,
      production: true,
      status: fallback === 0 ? "available" : "fallback",
      compiled_functions: compiled,
      fallback_functions: fallback,
      total_functions: kernel.functions.length,
      fallback_reasons: [...new Set(kernel.functions
        .filter((fn) => fn.status === "unsupported")
        .map((fn) => fn.reason))].sort(),
    });
  }
  for (const kernel of inventory.nonProduction) {
    assert.equal(coverageById.get(kernel.id).status, "fallback");
    assert.equal(coverageById.get(kernel.id).compiled_functions, 0);
    assert.equal(coverageById.get(kernel.id).fallback_functions, kernel.functions.length);
  }
});

test("portable identities are deterministic and independent of Node cache keys", async () => {
  const manifestPath = join(root, "architecture", "native-kernels.json");
  const inventory = await inventoryProductionKernels({ root, manifestPath });
  const module = inventory.modules.find((item) =>
    item.id === "number-field-zeta-coefficients-production"
  );
  assert.ok(module);
  const repeated = portableKernelIdentity(module);
  for (const key of [
    "sourceHash",
    "abiHash",
    "coreHash",
    "oracleIdentity",
    "identityHash",
  ]) {
    assert.match(module.identity[key], /^[a-f0-9]{64}$/);
    assert.equal(repeated[key], module.identity[key]);
  }
  assert.equal(module.identity.moduleIdentity.length, 16);
  assert.doesNotMatch(module.identity.canonicalCore.source, /\bnapi_/);
});

test("generated runtime manifests expose bridges and exact unsupported reasons", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "sagejs-wasm-kernel-emit-"));
  try {
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath: join(root, "architecture", "native-kernels.json"),
      outputRoot,
      emitOnly: true,
    });
    assert.equal(manifest.completeInventory, true);
    assert.equal(manifest.registeredKernels, 40);
    assert.equal(manifest.productionKernels, 33);
    assert.equal(manifest.compiledKernelCores, 33);
    assert.equal(manifest.compiledFunctions, 238);
    assert.equal(manifest.unsupportedFunctions, 0);
    assert.equal(manifest.nonProductionKernels.length, 7);
    assert.deepEqual(manifest.packs.map((pack) => pack.domain), ["flint", "gmp"]);
    const zeta = manifest.kernels.find((kernel) =>
      kernel.id === "number-field-zeta-coefficients-production"
    );
    assert.ok(zeta.runtime);
    assert.equal(zeta.functions.length, 5);
    assert.ok(zeta.functions.every((fn) =>
      /^sagejs_wasm_call_m_[a-f0-9]{16}_/.test(fn.bridge.export)
    ));
    const extension = manifest.kernels.find((kernel) =>
      kernel.id === "extension-polynomial-flint-production"
    );
    assert.ok(extension.functions.every((fn) => fn.status === "compiled-source"));
    assert.deepEqual(manifest.unsupported, []);
    assert.ok(manifest.unsupported.every((fn) =>
      fn.fallback === "same-source" && fn.oracles.length > 0 &&
      fn.tests.length > 0
    ));
    const persisted = JSON.parse(readFileSync(join(outputRoot, "index.json")));
    assert.deepEqual(persisted, manifest);

    const densePrimeBridge = readFileSync(join(
      outputRoot,
      "sources",
      manifest.kernels.find((kernel) =>
        kernel.id === "dense-prime-production"
      ).moduleIdentity,
      "wasm_bridge.c",
    ), "utf8");
    assert.match(densePrimeBridge, /sagejs_source_u64_buffer/);
    assert.match(densePrimeBridge, /uint64_t sagejs_result_0/);

    const denseIntegerBridge = readFileSync(join(
      outputRoot,
      "sources",
      manifest.kernels.find((kernel) =>
        kernel.id === "dense-integer-flint-production"
      ).moduleIdentity,
      "wasm_bridge.c",
    ), "utf8");
    assert.match(denseIntegerBridge, /int sagejs_result_0/);
    assert.match(
      denseIntegerBridge,
      /sagejs_wasm_resource_borrow_fmpz_matrix\(uint64_t handle/,
    );
    assert.match(
      denseIntegerBridge,
      /invalid or closed same-instance Wasm resource handle/,
    );

    const sparse = manifest.kernels.find((kernel) =>
      kernel.id === "sparse-random-matrix-production"
    );
    const sparseBridge = readFileSync(join(
      outputRoot,
      "sources",
      sparse.moduleIdentity,
      "wasm_bridge.c",
    ), "utf8");
    assert.match(
      sparseBridge,
      /sagejs_wasm_resource_adopt_fmpq_matrix\(sagejs_result_0/,
    );
    assert.match(sparseBridge, /sagejs_fmpq_matrix_clear\(sagejs_result_0\)/);
    const flintPack = manifest.packs.find((pack) => pack.domain === "flint");
    assert.deepEqual(
      flintPack.requiredResourceAdapters.map((resource) => resource.id),
      [
        "byte_region",
        "fmpq_matrix",
        "fmpz_matrix",
        "fmpz_mod_polynomial",
        "fq_context",
        "fq_element",
        "fq_polynomial",
        "nmod_matrix",
      ],
    );
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("runtime bootstrap consults a preloaded Wasm resolver before Node lookup", () => {
  const source = readFileSync(join(root, "tools", "runtime-bootstrap.ts"), "utf8");
  const resolver = source.indexOf("__sagejs_wasm_native_resolver__");
  const nodeFallback = source.indexOf(
    'if (typeof internalRequire !== "function") return null;',
  );
  assert.ok(resolver >= 0, "runtime has no WebAssembly native resolver hook");
  assert.ok(
    nodeFallback > resolver,
    "browser resolver must run before the optional Node native path",
  );
  assert.match(source, /nativeLogicalSourceKey\(filename\)/);
  assert.match(source, /\[logicalSourceKey, name\]/);
});

const clang = process.env.SAGEJS_WASI_CLANG;
const sysroot = process.env.SAGEJS_WASI_SYSROOT;
const gmpPrefix = process.env.SAGEJS_WASM_GMP_PREFIX;
const flintPrefix = process.env.SAGEJS_WASM_FLINT_PREFIX;
const mpfrPrefix = process.env.SAGEJS_WASM_MPFR_PREFIX;
const mpcPrefix = process.env.SAGEJS_WASM_MPC_PREFIX;
const gmpToolchainAvailable = [clang, sysroot, gmpPrefix].every((value) =>
  typeof value === "string" && existsSync(value)
) && existsSync(join(gmpPrefix ?? "", "lib", "libgmp.a"));
const flintToolchainAvailable = gmpToolchainAvailable &&
  [flintPrefix, mpfrPrefix, mpcPrefix].every((value) =>
    typeof value === "string" && existsSync(value)
  ) && [
    [flintPrefix, "libflint.a"],
    [mpfrPrefix, "libmpfr.a"],
    [mpcPrefix, "libmpc.a"],
  ].every(([prefix, library]) => existsSync(join(prefix, "lib", library)));

let portableNumberFieldOracle;

function numberFieldOracle() {
  if (portableNumberFieldOracle !== undefined) return portableNumberFieldOracle;
  const oracle = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
      input: String.raw`
import json
from sagejs.native import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros, kernel_uint64_buffer
from sagejs.number_fields.composite_field_analysis import packed_integer_square_root
from sagejs.number_fields.om_maxmin import packed_maxmin_valuations_are_maximal
from sagejs.number_fields.round4_state_kernel import packed_round4_padic_characteristic
from sagejs.number_fields.zeta_coefficient_kernel import assemble_bf_dyadic_finite_term, assemble_bf_integer_transcendental_endpoints, assemble_zeta_coefficients_from_factors

def words(buffer):
    return [str(value) for value in integer_buffer_values(buffer)]

om_workspace = kernel_integer_zeros(packed_maxmin_valuations_are_maximal, 4, 8)
om_result = packed_maxmin_valuations_are_maximal(
    om_workspace,
    kernel_integer_buffer(packed_maxmin_valuations_are_maximal, [1, 1]),
    kernel_integer_buffer(
        packed_maxmin_valuations_are_maximal, [0, 0, 0, 2, 0, 0, 1, 0]
    ),
    kernel_integer_buffer(
        packed_maxmin_valuations_are_maximal, [1, 1, 0, 1, 1, 1, 1, 0]
    ),
    kernel_integer_buffer(packed_maxmin_valuations_are_maximal, [0, 2]),
    2,
    1,
    4,
)

round4_control = kernel_integer_buffer(
    packed_round4_padic_characteristic, [0, 0, 0, 7]
)
round4_output = kernel_integer_zeros(packed_round4_padic_characteristic, 3, 16)
round4_workspace = kernel_integer_zeros(packed_round4_padic_characteristic, 22, 32)
round4_result = packed_round4_padic_characteristic(
    round4_control,
    round4_output,
    kernel_integer_buffer(packed_round4_padic_characteristic, [1, 1, 1]),
    kernel_integer_buffer(packed_round4_padic_characteristic, [1, 3, -2]),
    kernel_integer_buffer(packed_round4_padic_characteristic, [3]),
    round4_workspace,
    9,
    2,
)

zeta_output = kernel_integer_zeros(assemble_zeta_coefficients_from_factors, 8, 8)
zeta_local = kernel_integer_zeros(assemble_zeta_coefficients_from_factors, 5, 8)
zeta_result = assemble_zeta_coefficients_from_factors(
    zeta_output,
    zeta_local,
    kernel_uint64_buffer(assemble_zeta_coefficients_from_factors, [2, 3, 5, 7]),
    kernel_uint64_buffer(assemble_zeta_coefficients_from_factors, [1, 1, 1, 1]),
    kernel_uint64_buffer(
        assemble_zeta_coefficients_from_factors, [2, 0, 1, 0, 2, 0, 1, 0]
    ),
    kernel_uint64_buffer(
        assemble_zeta_coefficients_from_factors, [1, 0, 2, 0, 1, 0, 2, 0]
    ),
    2,
)
bf_scale = 1 << 16
bf_output = kernel_integer_zeros(assemble_bf_dyadic_finite_term, 2, 8)
bf_result = assemble_bf_dyadic_finite_term(
    bf_output,
    kernel_integer_buffer(assemble_bf_dyadic_finite_term, [-1, 0, 2, 1]),
    kernel_integer_buffer(assemble_bf_dyadic_finite_term, [
        2 * bf_scale, 2 * bf_scale,
        bf_scale, bf_scale,
        3 * bf_scale, 3 * bf_scale,
        5 * bf_scale, 5 * bf_scale,
        bf_scale, bf_scale,
        bf_scale, 2 * bf_scale,
    ]),
    1,
    16,
)
bf_transcendental_output = kernel_integer_zeros(
    assemble_bf_integer_transcendental_endpoints, 12, 8
)
bf_transcendental_result = assemble_bf_integer_transcendental_endpoints(
    bf_transcendental_output,
    kernel_integer_buffer(
        assemble_bf_integer_transcendental_endpoints, [1, 2, 3]
    ),
    64,
)

print(json.dumps({
    "om": [om_result, words(om_workspace)],
    "round4": [round4_result, words(round4_control), words(round4_output)],
    "composite": str(packed_integer_square_root(2**190 + 123456789)),
    "zeta": [zeta_result, words(zeta_output)],
    "bf": [bf_result, words(bf_output)],
    "bf_transcendentals": [
        bf_transcendental_result, words(bf_transcendental_output)
    ],
}))
`,
    },
  );
  assert.equal(oracle.status, 0, oracle.stdout + oracle.stderr);
  portableNumberFieldOracle = JSON.parse(oracle.stdout.trim().split("\n").at(-1));
  return portableNumberFieldOracle;
}

async function instantiateKernelRuntime(manifest, outputRoot) {
  const { WASI } = require("node:wasi");
  const { instantiateWasmKernelPacks } = await import(
    "../tools/native-kernel/wasm-pack-loader.mjs"
  );
  return instantiateWasmKernelPacks({
    manifest,
    load(pack) {
      return readFileSync(join(outputRoot, pack.asset));
    },
    host() {
      const wasi = new WASI({ version: "preview1", returnOnExit: true });
      return {
        imports: { wasi_snapshot_preview1: wasi.wasiImport },
        initialize(instance) {
          wasi.initialize(instance);
        },
      };
    },
  });
}

function words(values) {
  return Array.from(values, String);
}

test("number-field GMP Wasm cores execute the same exact sources as fallbacks", {
  skip: gmpToolchainAvailable
    ? false
    : "set SAGEJS_WASI_CLANG, SAGEJS_WASI_SYSROOT, and SAGEJS_WASM_GMP_PREFIX",
  timeout: 180_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-kernel-run-"));
  try {
    const registered = JSON.parse(readFileSync(
      join(root, "architecture", "native-kernels.json"),
      "utf8",
    ));
    const kernelIds = new Set([
      "prime-ideal-candidate-materializer-production",
      "number-field-element-valuations-production",
      "number-field-cubic-norm-obstruction-production",
      "number-field-om-proof-production",
      "number-field-composite-analysis-production",
      "number-field-zeta-coefficients-production",
    ]);
    const kernels = registered.kernels.filter((item) => kernelIds.has(item.id));
    assert.deepEqual(new Set(kernels.map((item) => item.id)), kernelIds);
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(manifestPath, `${JSON.stringify({ kernels }, null, 2)}\n`);
    const outputRoot = join(temporary, "output");
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["gmp"],
      emitOnly: false,
      toolchain: {
        clang,
        sysroot,
        gmpPrefix,
        flintPrefix: "unused",
        mpfrPrefix: "unused",
        mpcPrefix: "unused",
      },
    });
    const runtime = await instantiateKernelRuntime(manifest, outputRoot);
    const omSource = "sagejs/number_fields/om_maxmin.py";
    const maxmin = runtime.function(
      omSource,
      "packed_maxmin_valuations_are_maximal",
    );
    const omWorkspace = [0n, 0n, 0n, 0n];
    const omResult = maxmin(
      omWorkspace,
      [1n, 1n],
      [0n, 0n, 0n, 2n, 0n, 0n, 1n, 0n],
      [1n, 1n, 0n, 1n, 1n, 1n, 1n, 0n],
      [0n, 2n],
      2n,
      1n,
      4n,
    );

    const source = "sagejs/number_fields/composite_field_analysis.py";
    const squareRoot = runtime.function(source, "packed_integer_square_root");
    assert.equal(runtime.resolve(source, "packed_integer_square_root", {
      sourceHash: squareRoot.sourceHash,
      abiHash: squareRoot.abiHash,
      declarationHash: squareRoot.declarationHash,
      portableIdentity: squareRoot.portableIdentity,
    }), squareRoot);
    assert.equal(runtime.resolve(source, "packed_integer_square_root", {
      declarationHash: "0".repeat(64),
    }), null);
    const value = (1n << 190n) + 123456789n;
    const zeta = runtime.function(
      "sagejs/number_fields/zeta_coefficient_kernel.py",
      "assemble_zeta_coefficients_from_factors",
    );
    const bf = runtime.function(
      "sagejs/number_fields/zeta_coefficient_kernel.py",
      "assemble_bf_dyadic_finite_term",
    );
    const bfTranscendentals = runtime.function(
      "sagejs/number_fields/zeta_coefficient_kernel.py",
      "assemble_bf_integer_transcendental_endpoints",
    );
    const zetaOutput = Array(8).fill(0n);
    const zetaResult = zeta(
      zetaOutput,
      Array(5).fill(0n),
      new BigUint64Array([2n, 3n, 5n, 7n]),
      new BigUint64Array([1n, 1n, 1n, 1n]),
      new BigUint64Array([2n, 0n, 1n, 0n, 2n, 0n, 1n, 0n]),
      new BigUint64Array([1n, 0n, 2n, 0n, 1n, 0n, 2n, 0n]),
      2n,
    );
    const bfScale = 1n << 16n;
    const bfOutput = [0n, 0n];
    const bfResult = bf(
      bfOutput,
      [-1n, 0n, 2n, 1n],
      [
        2n * bfScale, 2n * bfScale,
        bfScale, bfScale,
        3n * bfScale, 3n * bfScale,
        5n * bfScale, 5n * bfScale,
        bfScale, bfScale,
        bfScale, 2n * bfScale,
      ],
      1n,
      16n,
    );
    const bfTranscendentalOutput = Array(12).fill(0n);
    const bfTranscendentalResult = bfTranscendentals(
      bfTranscendentalOutput,
      [1n, 2n, 3n],
      64n,
    );
    const candidate = runtime.function(
      "sagejs/number_fields/bl_composite_kernel.py",
      "packed_prime_ideal_candidate_hnf_in_place",
    );
    const candidateOutput = Array(12).fill(0n);
    const candidateResult = candidate(
      candidateOutput,
      Array(12).fill(0n),
      Array(6).fill(0n),
      [2n, 0n, 0n, 0n, 1n, 1n, 0n, 0n, 2n],
      [0n, 0n, 1n],
      2n,
      3n,
      1n,
    );
    assert.equal(candidateResult, true);
    assert.deepEqual(words(candidateOutput.slice(0, 9)), [
      "4", "0", "0", "0", "2", "0", "0", "0", "2",
    ]);
    const memberships = runtime.function(
      "sagejs/number_fields/bl_composite_kernel.py",
      "packed_lattice_memberships_in_place",
    );
    const membershipOutput = [0n, 0n];
    assert.equal(memberships(
      membershipOutput,
      [0n, 0n],
      [2n, 0n, 0n, 1n, 4n, 0n, 0n, 1n],
      [1n, 1n],
      [2n, 3n],
      1n,
      2n,
      2n,
    ), true);
    assert.deepEqual(words(membershipOutput), ["1", "0"]);
    const normObstruction = runtime.function(
      "sagejs/number_fields/bl_composite_kernel.py",
      "packed_cubic_norm_form_target_slice",
    );
    const normForm = [
      170n, 5745n, 18000n, 1585n, 2345n,
      5115n, 25215n, 11100n, 36900n, 15075n,
    ];
    assert.equal(normObstruction(normForm, 19n, 0n, 19n, 5n, 14n), 1n);
    assert.equal(normObstruction(normForm, 19n, 0n, 19n, 0n, 0n), 2n);
    const actual = {
      om: [omResult, words(omWorkspace)],
      composite: String(squareRoot(value)),
      zeta: [zetaResult, words(zetaOutput)],
      bf: [bfResult, words(bfOutput)],
      bf_transcendentals: [
        bfTranscendentalResult,
        words(bfTranscendentalOutput),
      ],
    };
    const oracle = numberFieldOracle();
    assert.deepEqual(actual, {
      om: oracle.om,
      composite: oracle.composite,
      zeta: oracle.zeta,
      bf: oracle.bf,
      bf_transcendentals: oracle.bf_transcendentals,
    });
    assert.deepEqual(actual, {
      om: [true, ["0", "2", "0", "0"]],
      composite: "39614081257132168796771975168",
      zeta: [true, ["1", "1", "0", "1", "1", "0", "0", "1"]],
      bf: oracle.bf,
      bf_transcendentals: [true, [
        "0", "0", "18446744073709551616", "18446744073709551616",
        "12786308645202655659", "12786308645202655660",
        "26087635650665564424", "26087635650665564426",
        "20265819725292939638", "20265819725292939640",
        "31950697969885030202", "31950697969885030204",
      ]],
    });
    for (const fn of [
      maxmin, squareRoot, zeta, bf, bfTranscendentals, candidate, memberships,
      normObstruction,
    ]) {
      assert.equal(fn.nativeAvailable, true);
      assert.equal(fn.executionTarget, "wasm");
      assert.equal(fn.sourceTransparent, true);
    }
    assert.equal(squareRoot(-1n), -1n);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("the Round-4 Wasm core executes the same exact source as its fallback", {
  skip: flintToolchainAvailable
    ? false
    : "set the complete SAGEJS WASI FLINT/GMP/MPFR/MPC toolchain",
  timeout: 180_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-round4-run-"));
  try {
    const registered = JSON.parse(readFileSync(
      join(root, "architecture", "native-kernels.json"),
      "utf8",
    ));
    const kernel = registered.kernels.find((item) =>
      item.id === "number-field-round4-state-production"
    );
    assert.ok(kernel);
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(manifestPath, `${JSON.stringify({ kernels: [kernel] }, null, 2)}\n`);
    const outputRoot = join(temporary, "output");
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["flint"],
      emitOnly: false,
      toolchain: {
        clang,
        sysroot,
        gmpPrefix,
        flintPrefix,
        mpfrPrefix,
        mpcPrefix,
      },
    });
    const runtime = await instantiateKernelRuntime(manifest, outputRoot);
    const round4 = runtime.function(
      "sagejs/number_fields/round4_state_kernel.py",
      "packed_round4_padic_characteristic",
    );
    const control = [0n, 0n, 0n, 7n];
    const output = [0n, 0n, 0n];
    const result = round4(
      control,
      output,
      [1n, 1n, 1n],
      [1n, 3n, -2n],
      [3n],
      Array(22).fill(0n),
      9n,
      2n,
    );
    const actual = [result, words(control), words(output)];
    assert.deepEqual(actual, numberFieldOracle().round4);
    assert.deepEqual(actual, [
      true,
      ["1", "0", "9", "7"],
      ["19", "-8", "1"],
    ]);
    assert.equal(round4.nativeAvailable, true);
    assert.equal(round4.executionTarget, "wasm");
    assert.equal(round4.sourceTransparent, true);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
