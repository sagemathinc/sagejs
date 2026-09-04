import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function option(name) {
  const positions = process.argv.flatMap((item, index) => item === name ? [index] : []);
  if (positions.length !== 1 || process.argv[positions[0] + 1] === undefined) {
    throw new Error(`${name} is required exactly once`);
  }
  return process.argv[positions[0] + 1];
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function authenticate(bytes, expected, label) {
  const actual = digest(bytes);
  if (actual !== expected) throw new Error(`${label} artifact digest mismatch`);
  return bytes;
}

function clean(inspect) {
  assert.equal(inspect.activeContexts, 0);
  assert.equal(inspect.activeHandle, 0);
  assert.equal(inspect.liveAllocations, 0);
  assert.equal(inspect.liveBytes, 0);
}

function mutate(bytes) {
  const result = Uint8Array.from(bytes);
  result[0] ^= 0xff;
  return result;
}

async function cminpackChecks(bytes, modulePath) {
  const { createCminpackBackend } = await import(pathToFileURL(modulePath));
  let callbackCount = 0;
  const { instance } = await WebAssembly.instantiate(bytes, {
    sagejs_p3: { evaluate: () => { callbackCount += 1; return -1001; } },
  });
  instance.exports._initialize?.();
  const api = instance.exports;
  const x = api.p3_alloc(8);
  const diag = api.p3_alloc(8);
  const stats = api.p3_alloc(16);
  assert.notEqual(x, 0);
  assert.notEqual(diag, 0);
  assert.notEqual(stats, 0);
  new Float64Array(api.memory.buffer, x, 1)[0] = 1;
  new Float64Array(api.memory.buffer, diag, 1)[0] = 1;
  for (const method of [1, 2]) {
    for (let index = 0; index < 128; index += 1) {
      const corrupt = (0xf0000000 + index * 8) >>> 0;
      for (const offsets of [
        { x: corrupt, diag, stats },
        { x, diag: corrupt, stats },
        { x, diag, stats: corrupt },
      ]) {
        assert.equal(api.p3_lm_solve(
          1, method, 1, 1, offsets.x, 1e-12, 1e-12, 1e-8, 10, 0,
          offsets.diag, offsets.stats,
        ), -2003);
      }
    }
    for (const offsets of [
      { x, diag: x, stats },
      { x, diag, stats: x },
      { x, diag: stats, stats },
    ]) {
      assert.equal(api.p3_lm_solve(
        1, method, 1, 1, offsets.x, 1e-12, 1e-12, 1e-8, 10, 0,
        offsets.diag, offsets.stats,
      ), -2003);
    }
  }
  assert.equal(callbackCount, 0);
  assert.equal(api.p3_free(stats), 1);
  assert.equal(api.p3_free(diag), 1);
  assert.equal(api.p3_free(x), 1);
  assert.equal(api.p3_live_allocations(), 0);
  assert.equal(api.p3_live_bytes(), 0);

  const solver = await createCminpackBackend(bytes);
  const allocationFailures = {};
  for (const method of ["cminpack-lmdif", "cminpack-lmder"]) {
    let triggered = 0;
    for (let failure = 0; failure < 9; failure += 1) {
      const result = solver.leastSquares({
        method,
        initial: [4],
        residualCount: 1,
        residual: ([value]) => [value - 2],
        jacobian: method === "cminpack-lmder" ? () => [[1]] : undefined,
        testingAllocationFailureAfter: failure,
      });
      assert.equal(result.status, "allocation_failed");
      triggered += 1;
      clean(solver.inspect());
    }
    allocationFailures[method] = triggered;
  }
  const marker = new Error("private destructive callback marker");
  assert.throws(() => solver.leastSquares({
    initial: [0], residualCount: 1, residual: () => { throw marker; },
  }), (error) => error === marker);
  clean(solver.inspect());
  assert.equal(solver.leastSquares({
    initial: [4], residualCount: 1, residual: ([x]) => [x - 2], cancelled: () => true,
  }).status, "cancelled");
  clean(solver.inspect());
  for (const method of ["cminpack-lmdif", "cminpack-lmder"]) {
    const recovered = solver.leastSquares({
      method,
      initial: [4], residualCount: 1, residual: ([value]) => [value - 2],
      jacobian: method === "cminpack-lmder" ? () => [[1]] : undefined,
    });
    assert.equal(recovered.backendConverged, true);
    assert.ok(Math.abs(recovered.value[0] - 2) <= 1e-10);
    clean(solver.inspect());
  }
  return {
    corrupt_region_cases: 2 * (128 * 3 + 3),
    corrupt_region_methods: ["cminpack-lmdif", "cminpack-lmder"],
    allocation_failure_positions: allocationFailures,
    callback_failure_cleanup: true,
    cancellation_cleanup: true,
    post_failure_recovery: true,
    lifecycle_after: solver.inspect(),
  };
}

function allocateVector(api, offsets, values) {
  const offset = api.sagejs_nlopt_alloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  assert.notEqual(offset, 0);
  offsets.push(offset);
  new Float64Array(api.memory.buffer, offset, values.length).set(values);
  return offset;
}

function nloptFixture(api, method) {
  const offsets = [];
  const x = allocateVector(api, offsets, [0.5, 0.5]);
  const lower = allocateVector(api, offsets, [-10, -10]);
  const upper = allocateVector(api, offsets, [10, 10]);
  const step = allocateVector(api, offsets, [0.25, 0.25]);
  const xtol = allocateVector(api, offsets, [1e-10, 1e-10]);
  const minimum = api.sagejs_nlopt_alloc(8);
  const stats = api.sagejs_nlopt_alloc(32);
  assert.notEqual(minimum, 0);
  assert.notEqual(stats, 0);
  offsets.push(minimum, stats);
  return {
    offsets,
    solve: (overrides = {}) => api.sagejs_nlopt_solve(
      1, method, 2, 0, 0,
      overrides.x ?? x,
      overrides.lower ?? lower,
      overrides.upper ?? upper,
      overrides.step ?? step,
      0, 0, 0, 0, 1e-10,
      overrides.xtol ?? xtol,
      200,
      overrides.minimum ?? minimum,
      overrides.stats ?? stats,
    ),
  };
}

async function rawNlopt(bytes) {
  let instance;
  const imports = { sagejs_numerical_nlopt: { evaluate: (
    _handle, kind, count, n, xOffset, valueOffset,
  ) => {
    const x = new Float64Array(instance.exports.memory.buffer, xOffset, n);
    const output = new Float64Array(instance.exports.memory.buffer, valueOffset, count);
    if (kind === 1) output[0] = Array.from(x).reduce((sum, value) => sum + value * value, 0);
    else output.fill(1);
    return 0;
  } } };
  ({ instance } = await WebAssembly.instantiate(bytes, imports));
  instance.exports._initialize?.();
  return instance.exports;
}

async function nloptChecks(bytes, modulePath, methods) {
  const { createNloptBackend } = await import(pathToFileURL(modulePath));
  const api = await rawNlopt(bytes);
  let corruptCases = 0;
  const allocationFailures = {};
  for (const method of methods) {
    const fixture = nloptFixture(api, method);
    const baseline = api.sagejs_nlopt_live_allocations();
    for (let index = 0; index < 128; index += 1) {
      const corrupt = (0xf0000000 + index * 8) >>> 0;
      for (const field of ["x", "lower", "upper", "step", "xtol", "minimum", "stats"]) {
        assert.equal(fixture.solve({ [field]: corrupt }), -2003);
        corruptCases += 1;
      }
    }
    for (const overlap of [
      { lower: fixture.offsets[0] },
      { step: fixture.offsets[2] },
      { xtol: fixture.offsets[0] },
      { minimum: fixture.offsets[0] },
      { stats: fixture.offsets[1] },
    ]) {
      assert.equal(fixture.solve(overlap), -2003);
      corruptCases += 1;
    }
    assert.equal(api.sagejs_nlopt_live_allocations(), baseline);
    for (const offset of fixture.offsets.reverse()) api.sagejs_nlopt_free(offset);
    assert.equal(api.sagejs_nlopt_live_allocations(), 0);

    let triggered = 0;
    let firstNormal = null;
    for (let failure = 0; failure < 64; failure += 1) {
      api.sagejs_nlopt_set_allocation_failure_after(-1);
      const next = nloptFixture(api, method);
      const allocated = api.sagejs_nlopt_live_allocations();
      api.sagejs_nlopt_set_allocation_failure_after(failure);
      const status = next.solve();
      assert.equal(api.sagejs_nlopt_live_allocations(), allocated);
      api.sagejs_nlopt_set_allocation_failure_after(-1);
      for (const offset of next.offsets.reverse()) api.sagejs_nlopt_free(offset);
      assert.equal(api.sagejs_nlopt_live_allocations(), 0);
      if (status === -3) {
        assert.equal(firstNormal, null, "allocation failures must form one contiguous prefix");
        triggered += 1;
      } else {
        assert.ok(status > 0, `method ${method}, allocation ${failure}, status ${status}`);
        firstNormal = failure;
        break;
      }
    }
    // The retained method currently has four fallible internal allocations.
    // Do not impose an arbitrary minimum inherited from a different backend:
    // the first normal result proves that every earlier allocation ordinal was
    // injected and that there are no later allocation sites for this solve.
    assert.ok(triggered >= 1 && firstNormal === triggered,
      `method ${method} lacks a contiguous injected-failure envelope`);
    allocationFailures[method] = { triggered, first_normal_success: firstNormal };
  }

  const solver = await createNloptBackend(bytes);
  const base = {
    method: "nlopt-nelder-mead",
    initial: [2],
    objective: ([x]) => x * x,
  };
  const marker = new Error("private destructive callback marker");
  assert.throws(() => solver.solve({ ...base, objective: () => { throw marker; } }),
    (error) => error === marker);
  clean(solver.inspect());
  assert.equal(solver.solve({ ...base, cancelled: () => true }).status, "cancelled");
  clean(solver.inspect());
  const recovered = solver.solve(base);
  assert.ok(Math.abs(recovered.value[0]) <= 1e-6);
  clean(solver.inspect());
  return {
    corrupt_region_cases: corruptCases,
    corrupt_region_methods: methods,
    allocation_failure_positions: allocationFailures,
    callback_failure_cleanup: true,
    cancellation_cleanup: true,
    post_failure_recovery: true,
    lifecycle_after: solver.inspect(),
  };
}

const cminpackPath = option("--cminpack");
const cminpackExpected = option("--cminpack-sha256");
const cminpackModule = option("--cminpack-module");
const nloptPath = option("--nlopt");
const nloptExpected = option("--nlopt-sha256");
const nloptModule = option("--nlopt-module");
const nloptMethods = option("--nlopt-methods").split(",").map((item) => Number(item));
const evaluatorModule = option("--evaluator-module");
const cminpackBytes = authenticate(await readFile(cminpackPath), cminpackExpected, "cminpack");
const nloptBytes = authenticate(await readFile(nloptPath), nloptExpected, "NLopt");
assert.throws(() => authenticate(mutate(cminpackBytes), cminpackExpected, "cminpack"), /digest mismatch/);
assert.throws(() => authenticate(mutate(nloptBytes), nloptExpected, "NLopt"), /digest mismatch/);

const { createBrowserRuntimeModules } = await import(pathToFileURL(evaluatorModule));
const { createCminpackBackend } = await import(pathToFileURL(cminpackModule));
const { createNloptBackend } = await import(pathToFileURL(nloptModule));
const corruptCminpack = mutate(cminpackBytes);
const corruptNlopt = mutate(nloptBytes);
const runtimeModules = createBrowserRuntimeModules({
  numerical: "qualification:cminpack-corrupt",
  numericalNlopt: "qualification:nlopt-corrupt",
  async fetchNumerical(url) {
    return { ok: true, async arrayBuffer() {
      return url.includes("cminpack") ? corruptCminpack : corruptNlopt;
    } };
  },
  async importNumerical(url) {
    return String(url).includes("cminpack") ? { createCminpackBackend } : { createNloptBackend };
  },
});
await runtimeModules.prepare(["sagejs.numerics.optimization"]);
assert.equal(runtimeModules.get("@sagemath/sagejs-numerical").capability.backend,
  "cminpack-unavailable");
assert.equal(runtimeModules.get("@sagemath/sagejs-numerical-nlopt").capability.backend,
  "nlopt-unavailable");
assert.throws(() => runtimeModules.get("@sagemath/sagejs-numerical").leastSquares({}));
assert.throws(() => runtimeModules.get("@sagemath/sagejs-numerical-nlopt").solve({}));

const output = {
  schema: "sagejs.numerical-wasm-destructive-output/v1",
  harness_input_artifact_mismatch: { cminpack: "rejected", nlopt: "rejected" },
  product_malformed_artifact: { cminpack: "fail-closed", nlopt: "fail-closed" },
  cminpack: await cminpackChecks(cminpackBytes, cminpackModule),
  nlopt: await nloptChecks(nloptBytes, nloptModule, nloptMethods),
};
process.stdout.write(`${JSON.stringify(output)}\n`);
