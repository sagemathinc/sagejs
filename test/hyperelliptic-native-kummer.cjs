// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compile } = require("@sagemath/sagejs/native");
const {
  buildWasmProductionPacks,
} = require("../tools/native-kernel/wasm-production-pack.cjs");
const { classifyWasmFunction } = require("../tools/native-kernel/wasm-bridge.cjs");
const { removeLoadedNativeCache } = require("./helpers/native-cache-cleanup.cjs");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kummer_native.py",
);
const logicalSource = "sagejs/hyperelliptic_curves/jacobian_kummer_native.py";
const kernelNames = [
  "genus2_kummer_project_batch",
  "genus2_kummer_double_batch",
  "genus2_kummer_degenerate_pseudo_add_batch",
];

function runSage(source, environment = {}, timeout = 120_000) {
  const result = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim().split("\n");
}

const exhaustiveWitness = String.raw`
from sagejs.hyperelliptic_curves.jacobian_kummer_native import Genus2PrimeKummerContext, genus2_kummer_double_batch
from sagejs.native import is_compiled

def coefficients(poly, length):
    return [int(poly[index].lift()) if index <= poly.degree() else 0 for index in range(length)]

def packed(divisor):
    u_value, v_value = divisor.uv()
    return [int(u_value.degree())] + coefficients(u_value, 4) + coefficients(v_value, 3)

summaries = []
for prime, f_values, h_values in ((3, (1,0,0,0,0,1), (0,)), (5, (1,1,0,0,0,1), (1,0,1))):
    ring = PolynomialRing(GF(prime), "x")
    curve = HyperellipticCurve(ring(list(f_values)), ring(list(h_values)))
    jacobian = curve.jacobian()
    divisors = jacobian.points()
    context = Genus2PrimeKummerContext(prime, f_values, h_values)
    projected, statuses = context.project_packed([packed(value) for value in divisors])
    assert statuses == [0] * len(divisors)
    negative, negative_statuses = context.project_packed([packed(-value) for value in divisors])
    assert negative_statuses == statuses
    assert negative == projected
    expected_double, expected_statuses = context.project_packed([packed(2 * value) for value in divisors])
    doubled, statuses = context.double_batch(projected)
    assert statuses == expected_statuses == [0] * len(divisors)
    assert doubled == expected_double
    expected_fourth, expected_statuses = context.project_packed([packed(4 * value) for value in divisors])
    fourth, statuses = context.power_of_two_batch(projected, 2)
    assert statuses == expected_statuses == [0] * len(divisors)
    assert fourth == expected_fourth
    identity = [0,0,0,1]
    identities = [identity for _value in divisors]
    sums, statuses = context.pseudo_add_batch(projected, identities, projected)
    assert statuses == [0] * len(divisors)
    assert sums == projected
    same, statuses = context.pseudo_add_batch(projected, projected, identities)
    assert statuses == [0] * len(divisors)
    assert same == doubled
    summaries.append((prime, len(divisors), sum(sum(row) for row in doubled) % 100000))
print(is_compiled(genus2_kummer_double_batch))
print(summaries)
`;

test("genus-2 packed Kummer kernels are source transparent and exact", {
  timeout: 180_000,
}, async () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-genus2-kummer-native-"));
  try {
    const compiled = await compile({ sourcePath, cacheRoot: cache });
    assert.equal(compiled.ir.functions.length, 3);
    for (const name of kernelNames) {
      const declaration = compiled.ir.functions.find(
        (candidate) => candidate.name === name,
      );
      assert.equal(declaration.kernelKind, "prime-field-source");
      assert.deepEqual(declaration.dependencies, []);
      assert.equal(classifyWasmFunction(declaration, compiled.ir).supported, true);
    }
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
    assert.match(core, /genus2_kummer_double_batch/);

    const native = runSage(exhaustiveWitness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
    });
    const dynamic = runSage(exhaustiveWitness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_DISABLE: "1",
    });
    assert.equal(native[0], "True");
    assert.equal(dynamic[0], "False");
    assert.equal(native[1], "[(3, 10, 10), (5, 32, 160)]");
    assert.deepEqual(native.slice(1), dynamic.slice(1));

    const requiredWitness = String.raw`
from sagejs.hyperelliptic_curves.jacobian_kummer_native import Genus2PrimeKummerContext, genus2_kummer_double_batch
from sagejs.native import is_compiled
context = Genus2PrimeKummerContext(101, [1,2,3,4,5,1], [2,0,3])
points = [[0,0,0,1], [1,2,3,4], [0,1,7,49]]
assert is_compiled(genus2_kummer_double_batch)
print(context.double_batch(points))
print(context.power_of_two_batch(points, 3))
`;
    const required = runSage(requiredWitness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: "1",
    });
    assert.deepEqual(required, [
      "([[0, 0, 0, 1], [1, 78, 61, 58], [1, 14, 49, 16]], [0, 0, 0])",
      "([[0, 0, 0, 1], [1, 1, 94, 9], [1, 52, 85, 12]], [0, 0, 0])",
    ]);
  } finally {
    removeLoadedNativeCache(cache);
  }
});

test("specialized quartic plans match the immutable Flynn oracle in CPython", () => {
  const program = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.hyperelliptic_curves.jacobian_kummer_native import Genus2PrimeKummerContext
from sagejs.hyperelliptic_curves.genus2_kummer import (
    _CLASSICAL_DELTA_1, _CLASSICAL_DELTA_2,
    _CLASSICAL_DELTA_3, _CLASSICAL_DELTA_4,
    _evaluate_sparse_quartic_mod,
)

tables = (_CLASSICAL_DELTA_1, _CLASSICAL_DELTA_2, _CLASSICAL_DELTA_3, _CLASSICAL_DELTA_4)
state = 1729
for prime in (3, 5, 7, 17, 101):
    for trial in range(12):
        f_values = []
        for index in range(5):
            state = (1664525 * state + 1013904223) & 0xffffffff
            f_values.append(state % prime)
        state = (1664525 * state + 1013904223) & 0xffffffff
        f_values.append(1 + state % (prime - 1))
        context = Genus2PrimeKummerContext(prime, f_values)
        points = []
        for row in range(8):
            point = []
            for index in range(4):
                state = (1664525 * state + 1013904223) & 0xffffffff
                point.append(state % prime)
            points.append(point)
        actual, statuses = context.double_batch(points, normalize=False)
        for point, result in zip(points, actual):
            expected = [
                _evaluate_sparse_quartic_mod(
                    tuple(point), tuple(f_values), table, prime
                )
                for table in tables
            ]
            assert result == expected
print("cpython-flynn-differential-ok")
`;
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, ["-I", "-c", program], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "cpython-flynn-differential-ok");
});

test("Kummer contexts reject unsupported models and bound memory", () => {
  const witness = String.raw`
from sagejs.hyperelliptic_curves.jacobian_kummer_native import (
    Genus2PrimeKummerContext,
    KUMMER_UNSUPPORTED_DIFFERENTIAL,
)
for prime in (2, 15, 2**32 + 15):
    try:
        Genus2PrimeKummerContext(prime, [1,0,0,0,0,1])
        assert False
    except ValueError:
        pass
try:
    Genus2PrimeKummerContext(5, [1,0,0,0,0,1], max_batch_bytes=64).double_batch(
        [[0,0,0,1]]
    )
    assert False
except MemoryError as error:
    assert "max_batch_bytes=64" in str(error)
context = Genus2PrimeKummerContext(101, [1,2,3,4,5,1])
result, statuses = context.pseudo_add_batch(
    [[1,2,3,4]], [[1,5,6,7]], [[1,9,10,11]]
)
assert result == [[0,0,0,0]]
assert statuses == [KUMMER_UNSUPPORTED_DIFFERENTIAL]
print(context.capability()["general_pseudo_addition"])
`;
  assert.deepEqual(runSage(witness), ["False"]);
});

const cowasm = process.env.SAGEJS_COWASM_ROOT ?? join(dirname(root), "cowasm");
const wasmPrefix = (name) => process.env[
  `SAGEJS_WASM_${name.toUpperCase()}_PREFIX`
] ?? join(cowasm, "sagemath", name, "dist", "wasi-sdk");
const toolchain = {
  clang: process.env.SAGEJS_WASI_CLANG ?? join(
    cowasm,
    "core",
    "build",
    "build",
    "wasi-sdk",
    "dist",
    "wasi-sdk-next",
    "native",
    "bin",
    "clang",
  ),
  sysroot: process.env.SAGEJS_WASI_SYSROOT ?? join(
    cowasm,
    "core",
    "build",
    "build",
    "wasi-sdk",
    "dist",
    "wasi-sdk-next",
    "native",
    "share",
    "wasi-sysroot",
  ),
  gmpPrefix: wasmPrefix("gmp"),
  flintPrefix: wasmPrefix("flint"),
  mpfrPrefix: wasmPrefix("mpfr"),
  mpcPrefix: wasmPrefix("mpc"),
};
const wasmToolchainAvailable =
  existsSync(toolchain.clang) &&
  existsSync(toolchain.sysroot) &&
  existsSync(join(toolchain.flintPrefix, "lib", "libflint.a")) &&
  existsSync(join(toolchain.mpfrPrefix, "lib", "libmpfr.a")) &&
  existsSync(join(toolchain.gmpPrefix, "lib", "libgmp.a"));

test("the exact Kummer source executes through a production Wasm pack", {
  skip: wasmToolchainAvailable
    ? false
    : "a complete Sage.js WASI FLINT toolchain is not available",
  timeout: 180_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-genus2-kummer-wasm-"));
  const manifestPath = join(temporary, "native-kernels.json");
  writeFileSync(manifestPath, `${JSON.stringify({
    kernels: [{
      id: "hyperelliptic-kummer-production",
      source: "src/lib/sagejs/hyperelliptic_curves/jacobian_kummer_native.py",
      functions: kernelNames,
      semantic_domain: "packed genus-2 prime-field Kummer arithmetic",
      fallback: "same-source",
      host_isolation: "certified",
      oracles: ["cpython", "javascript", "sage"],
      tests: ["test/hyperelliptic-native-kummer.cjs"],
      platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
    }],
  }, null, 2)}\n`);
  const outputRoot = join(temporary, "output");
  const manifest = await buildWasmProductionPacks({
    root,
    manifestPath,
    outputRoot,
    domains: ["flint"],
    emitOnly: false,
    toolchain,
  });
  assert.equal(manifest.compiledFunctions, 3);
  assert.equal(manifest.unsupportedFunctions, 0);

  const oracle = JSON.parse(runSage(String.raw`
import json
from sagejs.hyperelliptic_curves.jacobian_kummer_native import Genus2PrimeKummerContext
context = Genus2PrimeKummerContext(101, [1,2,3,4,5,1], [2,0,3])
points = [[0,0,0,1], [1,2,3,4], [0,1,7,49]]
result, statuses = context.double_batch(points)
print(json.dumps({
    "plan": list(context._plan),
    "transform": context._h_transform,
    "points": [value for row in points for value in row],
    "result": [value for row in result for value in row],
    "statuses": statuses,
}))
`).at(-1));

  const { WASI } = require("node:wasi");
  const { instantiateWasmKernelPacks } = await import(
    "../tools/native-kernel/wasm-pack-loader.mjs"
  );
  const runtime = await instantiateWasmKernelPacks({
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
  const duplicate = runtime.function(logicalSource, "genus2_kummer_double_batch");
  const output = Array(oracle.result.length).fill(0n);
  const statuses = Array(oracle.statuses.length).fill(0n);
  const workspace = Array(35).fill(0n);
  assert.equal(duplicate(
    output,
    statuses,
    oracle.points.map(BigInt),
    oracle.plan.map(BigInt),
    workspace,
    BigInt(oracle.transform),
    BigInt(oracle.statuses.length),
    1n,
    1n,
    101n,
  ), true);
  assert.deepEqual(output.map(Number), oracle.result);
  assert.deepEqual(statuses.map(Number), oracle.statuses);
});
