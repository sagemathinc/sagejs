// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const artifact = new URL(
  "../../src/lib/sagejs/numerics/optimization/backends/nlopt/build/nlopt-methods.wasm",
  import.meta.url,
);

async function rawBackend() {
  const bytes = await readFile(artifact);
  let instance;
  const imports = {
    sagejs_numerical_nlopt: {
      evaluate: (
        _handle,
        kind,
        count,
        n,
        xOffset,
        valueOffset,
        derivativeOffset,
        derivativeRows,
      ) => {
        const memory = instance.exports.memory;
        const x = new Float64Array(memory.buffer, xOffset, n);
        const output = new Float64Array(memory.buffer, valueOffset, count);
        if (kind === 1) output[0] = Array.from(x).reduce((sum, y) => sum + y * y, 0);
        else for (let row = 0; row < count; row += 1) output[row] = x[0] + row;
        if (derivativeOffset !== 0) {
          assert.equal(derivativeRows, count);
          const derivative = new Float64Array(
            memory.buffer,
            derivativeOffset,
            count * n,
          );
          for (let row = 0; row < count; row += 1) {
            for (let column = 0; column < n; column += 1) {
              derivative[row * n + column] = kind === 1
                ? 2 * x[column]
                : 10 * row + column;
            }
          }
        }
        return 0;
      },
    },
  };
  ({ instance } = await WebAssembly.instantiate(bytes, imports));
  instance.exports._initialize?.();
  return instance.exports;
}

test("packed objective/gradient and constraint/Jacobian batches preserve layout", async () => {
  const api = await rawBackend();
  const x = allocateVector(api, [2, -3]);
  for (const [kind, count] of [[1, 1], [2, 3], [3, 2]]) {
    const values = api.sagejs_nlopt_alloc(count * 8);
    const derivatives = api.sagejs_nlopt_alloc(count * 2 * 8);
    assert.notEqual(values, 0);
    assert.notEqual(derivatives, 0);
    assert.equal(
      api.sagejs_nlopt_probe_callback(
        17,
        kind,
        count,
        2,
        x,
        values,
        derivatives,
      ),
      0,
    );
    assert.deepEqual(
      Array.from(new Float64Array(api.memory.buffer, values, count)),
      kind === 1 ? [13] : Array.from({ length: count }, (_, index) => 2 + index),
    );
    assert.deepEqual(
      Array.from(new Float64Array(api.memory.buffer, derivatives, count * 2)),
      kind === 1
        ? [4, -6]
        : Array.from(
          { length: count * 2 },
          (_, index) => 10 * Math.floor(index / 2) + index % 2,
        ),
    );
    api.sagejs_nlopt_free(derivatives);
    api.sagejs_nlopt_free(values);
  }
  assert.equal(api.sagejs_nlopt_probe_callback(17, 2, 3, 2, x, x, x), -2003);
  api.sagejs_nlopt_free(x);
  assert.equal(api.sagejs_nlopt_live_allocations(), 0);
  assert.equal(Number(api.sagejs_nlopt_live_bytes()), 0);
});

function allocateVector(api, values) {
  const offset = api.sagejs_nlopt_alloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  assert.notEqual(offset, 0);
  new Float64Array(api.memory.buffer, offset, values.length).set(values);
  return offset;
}

function rawFixture(api, n = 2) {
  const offsets = [];
  const vector = (values) => {
    const offset = allocateVector(api, values);
    offsets.push(offset);
    return offset;
  };
  const x = vector(new Array(n).fill(0.5));
  const lower = vector(new Array(n).fill(-10));
  const upper = vector(new Array(n).fill(10));
  const step = vector(new Array(n).fill(0.25));
  const xtol = vector(new Array(n).fill(1e-10));
  const minimum = api.sagejs_nlopt_alloc(8);
  const stats = api.sagejs_nlopt_alloc(32);
  assert.notEqual(minimum, 0);
  assert.notEqual(stats, 0);
  offsets.push(minimum, stats);
  return {
    offsets,
    solve: (method, extra = {}) => api.sagejs_nlopt_solve(
      1,
      method,
      n,
      0,
      0,
      extra.x ?? x,
      extra.lower ?? lower,
      extra.upper ?? upper,
      extra.step ?? step,
      0,
      0,
      0,
      0,
      1e-10,
      extra.xtol ?? xtol,
      200,
      extra.minimum ?? minimum,
      extra.stats ?? stats,
    ),
  };
}

test("raw ABI rejects corrupt and overlapping regions without callbacks", async () => {
  const api = await rawBackend();
  assert.equal(api.sagejs_nlopt_alloc(0), 0);
  assert.equal(api.sagejs_nlopt_alloc(64 * 1024 * 1024 + 1), 0);
  assert.equal(api.sagejs_nlopt_free(0), 0);
  assert.equal(api.sagejs_nlopt_set_allocation_failure_after(-2), 0);
  const pointer = api.sagejs_nlopt_alloc(64);
  assert.notEqual(pointer, 0);
  assert.equal(api.sagejs_nlopt_free(pointer), 1);
  assert.equal(api.sagejs_nlopt_free(pointer), 0);
  assert.equal(api.sagejs_nlopt_live_allocations(), 0);

  const fixture = rawFixture(api);
  const baseline = api.sagejs_nlopt_live_allocations();
  for (let index = 0; index < 500; index += 1) {
    const corrupt = (0xf0000000 + index * 8) >>> 0;
    assert.equal(fixture.solve(1, { x: corrupt }), -2003);
  }
  assert.equal(fixture.solve(1, { lower: fixture.offsets[0] }), -2003);
  assert.equal(fixture.solve(1, { step: fixture.offsets[2] }), -2003);
  assert.equal(fixture.solve(1, { xtol: fixture.offsets[0] }), -2003);
  assert.equal(fixture.solve(1, { minimum: fixture.offsets[0] }), -2003);
  assert.equal(fixture.solve(1, { stats: fixture.offsets[1] }), -2003);
  assert.equal(api.sagejs_nlopt_live_allocations(), baseline);
  for (const offset of fixture.offsets.reverse()) api.sagejs_nlopt_free(offset);
  assert.equal(api.sagejs_nlopt_live_allocations(), 0);
  assert.equal(Number(api.sagejs_nlopt_live_bytes()), 0);
});

test("every early allocation failure position cleans Nelder-Mead", async () => {
  const api = await rawBackend();
  for (let failure = 0; failure < 20; failure += 1) {
    api.sagejs_nlopt_set_allocation_failure_after(-1);
    const fixture = rawFixture(api, 3);
    const baseline = api.sagejs_nlopt_live_allocations();
    api.sagejs_nlopt_set_allocation_failure_after(failure);
    const status = fixture.solve(1);
    assert.ok(
      status === -3 || status > 0,
      `allocation ${failure}, status ${status}`,
    );
    assert.equal(
      api.sagejs_nlopt_live_allocations(),
      baseline,
      `allocation ${failure}`,
    );
    api.sagejs_nlopt_set_allocation_failure_after(-1);
    for (const offset of fixture.offsets.reverse()) api.sagejs_nlopt_free(offset);
    assert.equal(api.sagejs_nlopt_live_allocations(), 0);
    assert.equal(Number(api.sagejs_nlopt_live_bytes()), 0);
  }
  const rejected = rawFixture(api, 3);
  assert.equal(rejected.solve(2), -2001);
  for (const offset of rejected.offsets.reverse()) api.sagejs_nlopt_free(offset);
  assert.equal(api.sagejs_nlopt_live_allocations(), 0);
});
