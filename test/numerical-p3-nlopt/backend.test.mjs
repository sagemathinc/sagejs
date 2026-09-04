// sagejs-test-tier: specialized
// sagejs-test-portable: true

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  createNloptBackend,
  NloptCapabilityError,
} from "../../src/lib/sagejs/numerics/optimization/backends/nlopt/index.mjs";
import {
  optionsFromCase,
  validateCase,
} from "../../bench/numerical-p3-nlopt/problems.mjs";

const artifact = new URL(
  "../../src/lib/sagejs/numerics/optimization/backends/nlopt/build/nlopt-methods.wasm",
  import.meta.url,
);
const corpusUrl = new URL(
  "../../bench/numerical-p3-nlopt/corpus.json",
  import.meta.url,
);

async function backend() {
  return createNloptBackend(await readFile(artifact));
}

test("JavaScript host preserves packed objective/gradient and constraint/Jacobian batches", async () => {
  const solver = await backend();
  assert.deepEqual(solver.qualification.probeCallbackBatch({
    kind: "objective",
    x: [2, -3],
    objective: ([x, y]) => x * x + y * y,
    objectiveGradient: ([x, y]) => [2 * x, 2 * y],
  }), { values: [13], derivatives: [4, -6] });
  for (const kind of ["inequality", "equality"]) {
    assert.deepEqual(solver.qualification.probeCallbackBatch({
      kind,
      valueCount: 3,
      x: [2, -3],
      callback: ([x]) => [x, x + 1, x + 2],
      jacobian: () => [[0, 1], [10, 11], [20, 21]],
    }), {
      values: [2, 3, 4],
      derivatives: [0, 1, 10, 11, 20, 21],
    });
  }
  assert.equal(solver.inspect().liveAllocations, 0);
  assert.equal(solver.inspect().liveBytes, 0);
});

test("Nelder-Mead final points pass independent normal, bounded, nonsmooth, and scale gates", async () => {
  const solver = await backend();
  const corpus = JSON.parse(await readFile(corpusUrl, "utf8"));
  for (const record of corpus.cases.filter(
    ({ method }) => method === "nlopt-nelder-mead",
  )) {
    const result = solver.solve(optionsFromCase(record));
    const validation = validateCase(record, result);
    assert.equal(validation.accepted, true, `${record.id}: ${JSON.stringify(validation)}`);
    assert.equal(result.method, "nlopt-nelder-mead");
    assert.equal(result.gradientCallbacks, 0);
    assert.equal(result.jacobianCallbacks, 0);
    assert.equal(result.independentValidationRequired, true);
  }
  assert.deepEqual(solver.inspect().liveAllocations, 0);
  assert.deepEqual(solver.inspect().liveBytes, 0);
});

test("exact method identities fail closed without automatic substitution", async () => {
  const solver = await backend();
  assert.throws(
    () => solver.solve({
      method: "nlopt-cobyla",
      initial: [0],
      objective: ([x]) => x * x,
    }),
    (error) => error instanceof NloptCapabilityError &&
      error.details.supportedMethods.length === 1,
  );
  assert.throws(
    () => solver.solve({ method: "auto", initial: [0], objective: ([x]) => x * x }),
    (error) => error instanceof NloptCapabilityError &&
      error.details.automaticSelection === false,
  );
  assert.throws(
    () => solver.solve({
      method: "nlopt-nelder-mead",
      initial: [0],
      objective: ([x]) => x * x,
      inequalityCount: 1,
      inequality: ([x]) => [x],
    }),
    NloptCapabilityError,
  );
  assert.deepEqual(solver.capability.methods, ["nlopt-nelder-mead"]);
  assert.equal(solver.capability.maximumConstraints, 0);
  assert.equal(solver.capability.automaticSelection, false);
});

test("bounds, dimensions, options, and callback outputs fail before corruption", async () => {
  const solver = await backend();
  const base = {
    method: "nlopt-nelder-mead",
    initial: [0],
    objective: ([x]) => x * x,
  };
  assert.throws(() => solver.solve({ ...base, lower: [1], upper: [0] }), RangeError);
  assert.throws(() => solver.solve({ ...base, initialStep: [0] }), RangeError);
  assert.throws(
    () => solver.solve({ ...base, maximumEvaluations: 0x80000000 }),
    /2147483647/,
  );
  assert.throws(
    () => solver.solve({ ...base, maximumElapsedMs: "1" }),
    /maximumElapsedMs/,
  );
  assert.throws(
    () => solver.solve({ ...base, cancelled: true }),
    /cancelled must be a function/,
  );
  assert.throws(
    () => solver.solve({ ...base, cancellationBuffer: new Int32Array(1) }),
    /SharedArrayBuffer/,
  );
  assert.throws(() => solver.solve({ ...base, initial: new Array(129).fill(0) }), NloptCapabilityError);
  assert.throws(
    () => solver.solve({ ...base, objective: () => NaN }),
    /objective output\[0\] is not finite/,
  );
  assert.equal(solver.inspect().liveAllocations, 0);
});

test("exceptions, force-stop cancellation, callback and elapsed budgets cleanly recover", async () => {
  const solver = await backend();
  assert.throws(
    () => solver.solve({
      method: "nlopt-nelder-mead",
      initial: [1],
      objective: () => { throw new Error("objective exploded"); },
    }),
    /objective exploded/,
  );
  let calls = 0;
  const cancelled = solver.solve({
    method: "nlopt-nelder-mead",
    initial: [2, -3],
    objective: ([x, y]) => { calls += 1; return x * x + y * y; },
    cancelled: () => calls >= 4,
  });
  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.callbackCount >= 4);
  const budget = solver.solve({
    method: "nlopt-nelder-mead",
    initial: [2, -3],
    objective: ([x, y]) => x * x + y * y,
    maximumCallbacks: 3,
  });
  assert.equal(budget.status, "maximum_callbacks");
  const elapsed = solver.solve({
    method: "nlopt-nelder-mead",
    initial: [2, -3],
    objective: ([x, y]) => x * x + y * y,
    maximumElapsedMs: Number.MIN_VALUE,
  });
  assert.equal(elapsed.status, "maximum_elapsed_time");
  const controller = new AbortController();
  controller.abort();
  const aborted = solver.solve({ ...optionsFromCase({
    method: "nlopt-nelder-mead",
    problem: "absolute",
    initial: [2, -3],
    initial_step: [1, 1],
  }), signal: controller.signal });
  assert.equal(aborted.status, "cancelled");
  assert.equal(solver.inspect().liveAllocations, 0);
  const recovered = solver.solve({
    method: "nlopt-nelder-mead",
    initial: [2],
    objective: ([x]) => x * x,
  });
  assert.ok(Math.abs(recovered.value[0]) < 1e-6);
});

test("reentrant callback entry is rejected and the reactor is reusable", async () => {
  const solver = await backend();
  assert.throws(
    () => solver.solve({
      method: "nlopt-nelder-mead",
      initial: [1],
      objective: ([x]) => {
        solver.solve({
          method: "nlopt-nelder-mead",
          initial: [x],
          objective: ([y]) => y * y,
        });
        return x * x;
      },
    }),
    /not reentrant/,
  );
  assert.equal(solver.inspect().liveAllocations, 0);
  assert.ok(Math.abs(solver.solve({
    method: "nlopt-nelder-mead",
    initial: [1],
    objective: ([x]) => x * x,
  }).value[0]) < 1e-6);
});

test("repeated Nelder-Mead reuse leaves no live allocations", async () => {
  const solver = await backend();
  for (let index = 0; index < 200; index += 1) {
    const result = solver.solve({
      method: "nlopt-nelder-mead",
      initial: [1 + index / 100],
      objective: ([x]) => (x - 0.25) ** 2,
      lower: [-2],
      upper: [4],
      initialStep: [0.25],
      maximumEvaluations: 300,
    });
    assert.ok(Math.abs(result.value[0] - 0.25) < 1e-6);
    assert.equal(solver.inspect().liveAllocations, 0);
    assert.equal(solver.inspect().liveBytes, 0);
  }
});
