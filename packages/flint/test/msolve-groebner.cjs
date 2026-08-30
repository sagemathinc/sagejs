"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isMainThread,
  parentPort,
  workerData,
  Worker,
} = require("node:worker_threads");

const flint = require(workerData?.flintPath ?? "..");

function sum(values, context) {
  return values.reduce(
    (left, right) => flint.mpolyAdd(left, right),
    flint.mpolyConstant(context, 0n, 1n),
  );
}

function product(values, context) {
  return values.reduce(
    (left, right) => flint.mpolyMul(left, right),
    flint.mpolyConstant(context, 1n, 1n),
  );
}

function simpleSystem(kind, modulus = 0n) {
  const context = flint.mpolyContext(kind, 2, "degrevlex", modulus);
  const x = flint.mpolyGen(context, 0);
  const y = flint.mpolyGen(context, 1);
  const one = flint.mpolyConstant(context, 1n, 1n);
  const seven = flint.mpolyConstant(context, 7n, 1n);
  return {
    context,
    variables: [x, y],
    generators: [
      flint.mpolySub(flint.mpolyMul(x, y), one),
      flint.mpolyAdd(
        flint.mpolyPow(x, 3),
        flint.mpolyMul(seven, flint.mpolyPow(y, 2)),
      ),
    ],
  };
}

function assertBasisContainsGenerators(system, basis) {
  assert.ok(basis.length > 0);
  for (const generator of system.generators) {
    assert.equal(
      flint.mpolyToString(
        flint.mpolyReduce(generator, basis),
        system.variables.map((_, index) => `x${index + 1}`),
      ),
      "0",
    );
  }
}

function runWorkerCorpus() {
  for (let repetition = 0; repetition < 4; repetition += 1) {
    const finite = simpleSystem("nmod", 65537n);
    const finiteBasis = flint.mpolyGroebnerMsolve(finite.generators);
    assertBasisContainsGenerators(finite, finiteBasis);

    const rational = simpleSystem("qq");
    const rationalBasis = flint.mpolyGroebnerMsolve(rational.generators);
    assertBasisContainsGenerators(rational, rationalBasis);
  }
}

if (!isMainThread) {
  try {
    runWorkerCorpus();
    parentPort.postMessage({ ok: true });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      message: error?.stack ?? String(error),
    });
  }
} else {
  test("msolve computes exact finite-field and rational bases", () => {
    const finite = simpleSystem("nmod", 65537n);
    const finiteBasis = flint.mpolyGroebnerMsolve(finite.generators);
    assert.deepEqual(
      finiteBasis.map((value) =>
        flint.mpolyToString(value, ["x1", "x2"])),
      ["x1*x2+65536", "x2^3+18725*x1^2", "x1^3+7*x2^2"],
    );
    assertBasisContainsGenerators(finite, finiteBasis);

    const rational = simpleSystem("qq");
    const rationalBasis = flint.mpolyGroebnerMsolve(rational.generators);
    assert.deepEqual(
      rationalBasis.map((value) =>
        flint.mpolyToString(value, ["x1", "x2"])),
      ["x1*x2 - 1", "x2^3 + 1/7*x1^2", "x1^3 + 7*x2^2"],
    );
    assertBasisContainsGenerators(rational, rationalBasis);
  });

  test("modular QQ reconstruction handles coefficient swell", () => {
    const context = flint.mpolyContext("qq", 2, "degrevlex", 0n);
    const x = flint.mpolyGen(context, 0);
    const y = flint.mpolyGen(context, 1);
    const a = flint.mpolyConstant(
      context,
      (1n << 181n) + 0x123456789abcdefn,
      (1n << 127n) - 1n,
    );
    const b = flint.mpolyConstant(
      context,
      (1n << 173n) + 0xfedcba987654321n,
      (1n << 113n) - 9n,
    );
    const system = {
      context,
      variables: [x, y],
      generators: [
        flint.mpolySub(flint.mpolyMul(x, y), a),
        flint.mpolyAdd(
          flint.mpolyPow(x, 3),
          flint.mpolyMul(b, flint.mpolyPow(y, 2)),
        ),
      ],
    };
    const first = flint.mpolyGroebnerMsolve(system.generators);
    const second = flint.mpolyGroebnerMsolve(system.generators);
    assertBasisContainsGenerators(system, first);
    assertBasisContainsGenerators(system, second);
    assert.deepEqual(
      first.map((value) => flint.mpolyToString(value, ["x1", "x2"])),
      second.map((value) => flint.mpolyToString(value, ["x1", "x2"])),
    );
  });

  test("finite specializations may change the leading ideal", () => {
    function specialized(kind, modulus = 0n) {
      const context = flint.mpolyContext(kind, 2, "degrevlex", modulus);
      const x = flint.mpolyGen(context, 0);
      const y = flint.mpolyGen(context, 1);
      const two = flint.mpolyConstant(context, 2n, 1n);
      return {
        context,
        variables: [x, y],
        generators: [
          flint.mpolyAdd(flint.mpolyPow(x, 2), flint.mpolyMul(two, y)),
          flint.mpolyAdd(
            flint.mpolyMul(x, y),
            flint.mpolyConstant(context, 1n, 1n),
          ),
        ],
      };
    }
    const rational = specialized("qq");
    const characteristicTwo = specialized("nmod", 2n);
    const rationalBasis = flint.mpolyGroebnerMsolve(rational.generators);
    const finiteBasis = flint.mpolyGroebnerMsolve(
      characteristicTwo.generators,
    );
    assertBasisContainsGenerators(rational, rationalBasis);
    assertBasisContainsGenerators(characteristicTwo, finiteBasis);
    assert.notDeepEqual(
      rationalBasis.map((value) =>
        flint.mpolyToString(
          flint.mpolyLeadingMonomial(value), ["x1", "x2"])),
      finiteBasis.map((value) =>
        flint.mpolyToString(
          flint.mpolyLeadingMonomial(value), ["x1", "x2"])),
    );
  });

  test("the native resource envelope rejects before entering msolve", () => {
    const context = flint.mpolyContext(
      "nmod", 4097, "degrevlex", 65537n,
    );
    assert.throws(
      () => flint.mpolyGroebnerMsolve([flint.mpolyGen(context, 0)]),
      /variable count exceeds the reviewed resource envelope/,
    );
  });

  test("cyclic-5 exercises the complete modular QQ basis export", {
    timeout: 120_000,
  }, () => {
    const context = flint.mpolyContext("qq", 5, "degrevlex", 0n);
    const variables = Array.from(
      { length: 5 },
      (_, index) => flint.mpolyGen(context, index),
    );
    const generators = [];
    for (let degree = 1; degree < 5; degree += 1) {
      generators.push(sum(
        variables.map((_, start) => product(
          Array.from(
            { length: degree },
            (__, offset) => variables[(start + offset) % 5],
          ),
          context,
        )),
        context,
      ));
    }
    generators.push(flint.mpolySub(
      product(variables, context),
      flint.mpolyConstant(context, 1n, 1n),
    ));
    const system = { context, variables, generators };
    const basis = flint.mpolyGroebnerMsolve(generators);
    assert.equal(basis.length, 20);
    assertBasisContainsGenerators(system, basis);
  });

  test("native msolve entry is safe across Node workers", {
    timeout: 120_000,
  }, async () => {
    const flintPath = require.resolve("..");
    const workers = Array.from(
      { length: 4 },
      () => new Worker(__filename, { workerData: { flintPath } }),
    );
    const results = await Promise.all(workers.map((worker) =>
      new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", (code) => {
          if (code !== 0)
            reject(new Error(`msolve worker exited with code ${code}`));
        });
      })));
    for (const result of results)
      assert.deepEqual(result, { ok: true });
  });
}
