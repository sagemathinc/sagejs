// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require(
  "../tools/native-kernel/c-backend.cjs"
);
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const {
  createNativeImportResolver,
} = require("../tools/native-kernel/native-imports.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(
  root,
  "src/lib/sagejs/number_fields/cubic_class_number_native.py",
);
const logicalSource = "sagejs/number_fields/cubic_class_number_native.py";
const rootFunction = "certified_complex_cubic_class_group_v1";
const publicArenaMemoryLimit = 1_048_576;
const publicArenaCheckpointLimit = 3_145_728;
const expectedNameDigest =
  "b3442051662cc70970c1f5c62c5da591cc02a4d51919144991df0acdccfef5c4";
const expectedHostFunctions = Object.freeze([
  "_cubic_arctan_reciprocal_bounds",
  "_cubic_atanh_log_bounds",
  "_cubic_bounded_bit_length",
  "_cubic_ceil_sqrt",
  "_cubic_complex_multiply_fixed",
  "_cubic_determinant_three",
  "_cubic_dyadic_ceiling_quotient",
  "_cubic_dyadic_divide_positive",
  "_cubic_dyadic_multiply",
  "_cubic_extended_gcd",
  "_cubic_fixed_polynomial_embedding",
  "_cubic_floor_cube_root",
  "_cubic_floor_fifth_root",
  "_cubic_floor_sqrt",
  "_cubic_inverse_mod",
  "_cubic_nearest_quotient",
  "_cubic_positive_mod",
  "_cubic_relation_rank_multiply",
  "_packed_miller_rabin_witness",
  "_packed_modular_power",
  "_packed_word_prime_is_proven",
  rootFunction,
].sort());

let closurePromise;

function lowerClosure(source = readFileSync(sourcePath, "utf8")) {
  return lowerSource(source, sourcePath, {
    functions: [rootFunction],
    resolveNativeImport: createNativeImportResolver({
      root,
      lowerSource,
      initialSourcePath: sourcePath,
    }),
  });
}

function closureFixture() {
  closurePromise ??= lowerClosure().then((ir) => {
    const generated = generateHostCore(ir);
    return { ir, core: generated.source, header: generated.header };
  });
  return closurePromise;
}

function emittedFmpzFunction(source, name) {
  const marker = `static int fmpz_native_${name}(`;
  let start = source.indexOf(marker);
  while (
    start !== -1 &&
    source.slice(start, source.indexOf("\n", start)).endsWith(";")
  ) {
    start = source.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted fmpz definition for ${name}`);
  const candidates = ["\nstatic ", "\nint sagejs_kernel_"]
    .map((next) => source.indexOf(next, start + marker.length))
    .filter((position) => position !== -1);
  const end = candidates.length === 0 ? source.length : Math.min(...candidates);
  return source.slice(start, end);
}

function reachableNames(callGraph, entry) {
  const reachable = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const name = pending.pop();
    if (reachable.has(name)) continue;
    assert.ok(Object.hasOwn(callGraph, name), `missing call-graph node ${name}`);
    reachable.add(name);
    pending.push(...callGraph[name]);
  }
  return reachable;
}

function escapedRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("the complete cubic closure is one direct fmpz program", {
  timeout: 120_000,
}, async () => {
  const { ir, core, header } = await closureFixture();
  const functions = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const names = Array.from(functions.keys()).sort();
  const edges = Object.entries(ir.callGraph).flatMap(([caller, callees]) =>
    callees.map((callee) => [caller, callee])
  );

  assert.equal(ir.version, 39);
  assert.equal(functions.size, 84);
  assert.equal(edges.length, 195);
  assert.equal(
    createHash("sha256").update(names.join("\n")).digest("hex"),
    expectedNameDigest,
  );
  assert.deepEqual(
    Array.from(reachableNames(ir.callGraph, rootFunction)).sort(),
    names,
  );
  assert.equal(
    functions.get("_cubic_online_relation_lattice_update").hostCallable,
    false,
  );
  assert.ok(
    ir.callGraph[rootFunction].includes("_cubic_plan_adjacent_ideal"),
  );
  assert.ok(
    ir.callGraph[rootFunction].includes(
      "_cubic_online_relation_lattice_update",
    ),
  );
  assert.ok(
    ir.callGraph._cubic_append_reduced_ideal_ellipsoid.includes(
      "_cubic_online_relation_lattice_update",
    ),
  );

  const hostFunctions = ir.functions
    .filter((fn) => fn.hostCallable !== false)
    .map((fn) => fn.name)
    .sort();
  const privateFunctions = ir.functions.filter(
    (fn) => fn.hostCallable === false,
  );
  assert.deepEqual(hostFunctions, expectedHostFunctions);
  assert.equal(hostFunctions.length, 22);
  assert.equal(privateFunctions.length, 62);
  assert.equal(functions.get(rootFunction).hostCallable, true);
  assert.equal((header.match(/\bint sagejs_kernel_/g) || []).length, 22);
  assert.equal((core.match(/\nint sagejs_kernel_/g) || []).length, 22);

  // Scalar helpers may retain an inspectable public bridge. Aggregate helpers
  // remain private, so the direct call graph never invents a public ABI for a
  // borrowed vector, matrix, or packed buffer.
  const aggregateTypes = new Set([
    "FmpzMatrix",
    "FmpzPolynomial",
    "IntegerBuffer",
    "NativeIntegerVector",
    "NumberFieldAnalysisResource",
    "UInt64Buffer",
  ]);
  for (const fn of privateFunctions) {
    assert.ok(
      fn.params.some((parameter) => aggregateTypes.has(parameter.type)),
      `${fn.name} is private without a borrowed aggregate parameter`,
    );
    assert.doesNotMatch(
      header,
      new RegExp(
        `\\bsagejs_kernel_${escapedRegularExpression(fn.name)}\\s*\\(`,
      ),
      `${fn.name} acquired a public aggregate ABI declaration`,
    );
    assert.doesNotMatch(
      core,
      new RegExp(
        `\\bsagejs_kernel_${escapedRegularExpression(fn.name)}\\s*\\(`,
      ),
      `${fn.name} acquired a public aggregate ABI definition`,
    );
  }
  for (const name of hostFunctions.filter((name) => name !== rootFunction)) {
    assert.ok(
      functions.get(name).params.every(
        (parameter) => !aggregateTypes.has(parameter.type),
      ),
      `${name} unexpectedly publishes a borrowed aggregate`,
    );
  }

  for (const fn of ir.functions) {
    assert.equal(fn.analysis.backend.kind, "fmpz", fn.name);
    const body = emittedFmpzFunction(core, fn.name);
    assert.doesNotMatch(body, /fmpz_(?:set|get)_mpz/, fn.name);
    assert.doesNotMatch(body, /\bmpz_/, fn.name);
  }
  for (const [caller, callee] of edges) {
    const body = emittedFmpzFunction(core, caller);
    assert.match(
      body,
      new RegExp(`\\bfmpz_native_${escapedRegularExpression(callee)}\\s*\\(`),
      `${caller} does not call ${callee} through the direct fmpz ABI`,
    );
  }

  const rootBody = emittedFmpzFunction(core, rootFunction);
  assert.match(rootBody, /sagejs_native_gmp_checkpoint_begin/);
  assert.match(rootBody, /checkpoint\.soft_limit_exhaustions != 0/);
  assert.match(rootBody, /checkpoint\.upstream_allocations != 0/);
  assert.match(rootBody, /sagejs_flint_exact_checkpoint_cleanup/);
  assert.match(rootBody, /sagejs_native_exact_arena_clear/);
});

test("one unsupported operation atomically removes fmpz from the closure", {
  timeout: 120_000,
}, async () => {
  const source = readFileSync(sourcePath, "utf8");
  const withImport = source.replace(
    "    fmpz_polynomial,\n",
    "    fmpz_polynomial,\n    fmpz_polynomial_length,\n",
  );
  assert.notEqual(withImport, source);
  const unsupported = withImport.replace(
    "        if not fmpz_polynomial_seal(polynomial):\n" +
      "            return False\n",
    "        if not fmpz_polynomial_seal(polynomial):\n" +
      "            return False\n" +
      "        if fmpz_polynomial_length(polynomial) != 4:\n" +
      "            return False\n",
  );
  assert.notEqual(unsupported, withImport);

  const ir = await lowerClosure(unsupported);
  assert.equal(ir.functions.length, 84);
  assert.deepEqual(
    ir.functions.filter((fn) => fn.analysis.backend.kind === "fmpz"),
    [],
  );
  assert.notEqual(
    ir.functions.find((fn) => fn.name === rootFunction).analysis.backend.kind,
    "fmpz",
  );
});

test("the authenticated production pack executes five cubic regimes in fmpz", {
  timeout: 120_000,
}, () => {
  const published = resolve(root, "dist/native-kernels");
  const index = JSON.parse(readFileSync(join(published, "index.json"), "utf8"));
  const record = index.logicalSources[logicalSource];
  assert.ok(record, `missing production artifact for ${logicalSource}`);
  const wrapper = require(join(published, record.cacheKey, "index.cjs"));
  const kernel = wrapper[rootFunction];
  const sourceHash = createHash("sha256")
    .update(readFileSync(sourcePath))
    .digest("hex");
  assert.equal(record.sourceHash, sourceHash);
  assert.equal(wrapper.sourceHash, sourceHash);
  assert.equal(wrapper.cacheKey, record.cacheKey);
  assert.equal(wrapper.nativeAvailable, true);
  assert.equal(kernel.nativeAvailable, true);
  assert.equal(kernel.backendPolicy.kind, "fmpz");
  assert.equal(typeof kernel.fmpz, "function");

  const zeros = (length, words = 64) =>
    kernel.createIntegerBuffer(length, words);
  const output = zeros(64, 256);
  const modularWorkspace = kernel.createUInt64Buffer(64 * 64 + 64 + 1);
  const buffers = [
    zeros(512),
    zeros(4),
    zeros(9),
    zeros(16),
    zeros(16),
    zeros(144),
    zeros(48),
    zeros(109),
    zeros(1),
    zeros(1),
    zeros(1),
  ];
  const efforts = [5, 1, 7, 8];
  const cases = [
    ["3.1.23.1", [1, 0, -1, 1], 1n, []],
    ["x^3+9*x-55", [-55, 9, 0, 1], 5n, [5n]],
    ["3.1.12763.1", [-22, 1, -1, 1], 8n, [2n, 4n]],
    ["3.1.93074700.2", [-5570, 0, 0, 1], 42n, [42n]],
    ["3.1.69305231.3", [48016, 134, -1, 1], 3n, [3n]],
  ];

  // Starting the fmpz checkpoint before child initialization makes every
  // GMP/FLINT limb allocation visible to the cap.  The 8615-bit-unit field
  // deterministically exceeds the former 2-MiB envelope at effort 1.  The
  // exception is fail closed, and the successful sweep below proves that
  // cleanup leaves the same kernel and buffers reusable at the public 3 MiB.
  const lowCapLargeRegulator = kernel.packIntegerBuffer(
    [48016, 134, -1, 1],
    64,
  );
  assert.throws(
    () => kernel.fmpz(
      output,
      lowCapLargeRegulator,
      modularWorkspace,
      ...buffers,
      0,
      1,
      publicArenaMemoryLimit,
      2_097_152,
    ),
    /NativeExactArena temporary capacity exhausted/,
  );

  function runCase([label, coefficients, order, invariants]) {
    const packed = kernel.packIntegerBuffer(coefficients, 64);
    let accepted = false;
    let acceptedEffort = 0;
    for (const effort of efforts) {
      accepted = kernel.fmpz(
        output,
        packed,
        modularWorkspace,
        ...buffers,
        0,
        effort,
        publicArenaMemoryLimit,
        publicArenaCheckpointLimit,
      );
      if (accepted) {
        acceptedEffort = effort;
        break;
      }
    }
    assert.equal(accepted, true, label);
    const values = output.toArray();
    assert.equal(values[0], 2n, label);
    assert.equal(values[1], order, label);
    assert.deepEqual(
      values.slice(3, 3 + Number(values[2])),
      invariants,
      label,
    );
    assert.equal(values[63], 0n, label);
    if (label === "3.1.93074700.2") {
      assert.equal(acceptedEffort, 7);
      assert.equal(values[36], 1494n);
      assert.equal(values[37], 156n);
      assert.equal(values[38], 126n);
    }
    if (label === "3.1.69305231.3") {
      assert.equal(acceptedEffort, 1);
      const bits = values.slice(25, 28).map((value) =>
        (value < 0n ? -value : value).toString(2).length
      );
      assert.equal(Math.max(...bits), 8615);
    }
  }

  // A successful sweep, a deterministic decline, and another successful
  // sweep exercise checkpoint rewind and foreign-resource cleanup in one
  // process with the exact buffers used by the production runtime.
  for (const item of cases) runCase(item);
  const declined = kernel.packIntegerBuffer([100000, 1, 0, 1], 64);
  for (const effort of efforts) {
    assert.equal(
      kernel.fmpz(
        output,
        declined,
        modularWorkspace,
        ...buffers,
        0,
        effort,
        publicArenaMemoryLimit,
        publicArenaCheckpointLimit,
      ),
      false,
    );
    // A declined result has no mathematical authority. Slot 63 is explicitly
    // the private phase diagnostic consumed by the ordinary fail-closed
    // dispatcher; every other output slot may retain scratch publication.
    assert.equal(output.toArray()[63], 2n);
  }
  for (const item of cases) runCase(item);

  assert.equal(relative(resolve(root, "src/lib"), sourcePath), logicalSource);
});
