"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { join } = require("node:path");
const { isMainThread, parentPort, workerData, Worker } = require("node:worker_threads");

const addonPath = join(
  __dirname,
  "..",
  "packages",
  "flint",
  "build",
  "Release",
  "sagejs_flint.node",
);

function u64(values) {
  return new BigUint64Array(values.map((value) => BigInt(value)));
}

function multiplyFactorization(factors) {
  let value = 1n;
  for (const [prime, exponent] of factors) {
    for (let index = 0; index < exponent; index += 1) value *= prime;
  }
  return value;
}

function nativeSearch(addon, fixture, base, stride, count, options = {}) {
  return addon.genus3JacobianSearchProgression(
    BigInt(fixture.p),
    u64(fixture.f),
    u64(fixture.h),
    u64(fixture.divisor),
    BigInt(base),
    BigInt(stride),
    BigInt(count),
    BigInt(options.maxBabies ?? 64),
    BigInt(options.maxOperations ?? 1_000_000),
    options.cancel,
  );
}

const workerFixture = {
  p: 3,
  f: [1, 2, 0, 0, 0, 0, 0, 1],
  h: [0, 0, 0, 0],
  divisor: [1, 0, 1, 0, 0, 1, 0, 0],
};

if (!isMainThread) {
  const addon = require(addonPath);
  const results = [];
  for (let index = 0; index < workerData.iterations; index += 1) {
    const answer = nativeSearch(addon, workerFixture, 90, 1, 10);
    results.push([
      answer.statusName,
      answer.annihilatingMultiple.toString(),
      answer.elementOrder.toString(),
    ]);
  }
  parentPort.postMessage(results);
} else {
  const { createSage } = require("../dist/tools/kernel.js");
  const addon = require(addonPath);

  const mockCurve = String.raw`
from sagejs.hyperelliptic_curves.jacobian import HyperellipticJacobian

class DifferentialCurve:
    def __init__(self, f, h=0):
        self._f=f
        self._h=f.parent()(h)
    def genus(self):
        return 3
    def hyperelliptic_polynomials(self):
        return self._f,self._h
    def base_ring(self):
        return self._f.parent().base_ring()
`;

  async function ordinaryFixtures() {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        `${mockCurve}
model_data=[
    [3,[1,2,0,0,0,0,0,1],[0,0,0,0],94],
    [5,[1,1,0,0,0,0,0,1],[0,0,0,0],275],
    [11,[1,10,0,0,0,0,0,1],[0,0,1,0],1528],
    [11,[1,10,0,0,3,0,0,1],[0,0,0,0],1528],
]
output=[]
for model_index,data in enumerate(model_data):
    p,f_data,h_data,group_order=data
    K=GF(p)
    R=PolynomialRing(K,'x')
    f=R(f_data)
    h=R(h_data)
    J=HyperellipticJacobian(DifferentialCurve(f,h))
    affine=[]
    for a in K:
        for b in K:
            lhs=b*b if h.is_zero() else b*b+h(a)*b
            if lhs==f(a):
                affine.append((a,b))
    generators=[J.zero()]
    partial=J.zero()
    for point in affine:
        divisor=J.point_to_divisor(point,check=False)
        partial+=divisor
        for candidate in (divisor,partial):
            if candidate not in generators:
                generators.append(candidate)
                if len(generators)>=12:
                    break
        if len(generators)>=12:
            break
    nonzero=[D for D in generators if not D.is_zero()]
    A=nonzero[0]
    B=nonzero[1] if len(nonzero)>1 else 2*A
    values=[[0,J.zero()],[1,A],[2,-A],[3,2*A],[4,A+A],[5,A+B]]
    pairs=[(17,31),(5,9),(37,11),(19,23),(41,7),(13,29)]
    for sample_index,(left,right) in enumerate(pairs):
        values.append([10+sample_index,left*A+right*B])
    for kind,D in values:
        u,v=D.uv()
        packed=[u.degree()]
        packed += [int(u[i]) for i in range(4)]
        packed += [int(v[i]) for i in range(3)]
        order=int(D.order(multiple=group_order))
        output.append([model_index,p,group_order,f_data,h_data,packed,order,u.degree(),kind])
output`,
        { timeout: 120_000 },
      );
      return JSON.parse(result.repr);
    } finally {
      await session.close();
    }
  }

  test(
    "native progression certificates agree with ordinary Cantor arithmetic",
    { timeout: 120_000 },
    async () => {
      const capabilities = addon.genus3JacobianCapabilities();
      assert.equal(capabilities.available, true);
      assert.equal(capabilities.model, "odd-degree-generalized");
      const fixtures = (await ordinaryFixtures()).map(
        ([model, p, groupOrder, f, h, divisor, order, degree, kind]) => ({
          model,
          p,
          groupOrder,
          f,
          h,
          divisor,
          order,
          degree,
          kind,
        }),
      );
      assert.equal(new Set(fixtures.map((fixture) => fixture.model)).size, 4);
      assert.ok(fixtures.some((fixture) => fixture.model === 2 && fixture.degree === 3));
      assert.ok(fixtures.some((fixture) => fixture.model === 3 && fixture.degree === 3));
      assert.ok(fixtures.some((fixture) => fixture.kind === 2));
      assert.ok(fixtures.some((fixture) => fixture.kind === 3));
      assert.ok(fixtures.some((fixture) => fixture.kind === 4));
      assert.ok(fixtures.filter((fixture) => fixture.kind >= 10).length >= 10);

      for (const fixture of fixtures) {
        const exact = nativeSearch(
          addon,
          fixture,
          fixture.groupOrder,
          1,
          1,
        );
        assert.equal(exact.statusName, "ok");
        assert.equal(exact.annihilatingMultiple, BigInt(fixture.groupOrder));
        assert.equal(exact.elementOrder, BigInt(fixture.order));
        assert.equal(
          multiplyFactorization(exact.factorization),
          BigInt(fixture.order),
        );
        assert.ok(exact.diagnostics.groupOperations >= 0n);
        assert.ok(exact.diagnostics.scalarBits >= 0n);

        if (fixture.order > 1) {
          const miss = nativeSearch(
            addon,
            fixture,
            fixture.groupOrder - 1,
            1,
            1,
          );
          assert.equal(miss.statusName, "not_found");

          const lower = Math.max(0, fixture.groupOrder - 3);
          const progression = nativeSearch(addon, fixture, lower, 1, 7);
          assert.equal(progression.statusName, "ok");
          assert.ok(progression.annihilatingMultiple >= BigInt(lower));
          assert.ok(progression.annihilatingMultiple < BigInt(lower + 7));
          assert.equal(
            progression.annihilatingMultiple % BigInt(fixture.order),
            0n,
          );
          assert.equal(progression.elementOrder, BigInt(fixture.order));
        }
      }
    },
  );

  test("native progression statuses are bounded and explicit", () => {
    const statuses = addon.genus3JacobianCapabilities().statuses;
    const valid = workerFixture;
    const limited = nativeSearch(addon, valid, 94, 1, 1, {
      maxOperations: 1,
    });
    assert.equal(limited.status, statuses.RESOURCE_LIMIT);
    assert.equal(limited.statusName, "resource_limit");

    const cancel = new Uint32Array(new SharedArrayBuffer(4));
    Atomics.store(cancel, 0, 1);
    const cancelled = nativeSearch(addon, valid, 94, 1, 1, { cancel });
    assert.equal(cancelled.status, statuses.CANCELLED);
    assert.equal(cancelled.statusName, "cancelled");

    const miss = nativeSearch(addon, valid, 93, 1, 1);
    assert.equal(miss.status, statuses.NOT_FOUND);
    assert.equal(miss.statusName, "not_found");

    const invalidModel = nativeSearch(
      addon,
      { ...valid, f: Array(8).fill(0) },
      94,
      1,
      1,
    );
    assert.equal(invalidModel.status, statuses.INVALID_MODEL);

    const invalidDivisor = nativeSearch(
      addon,
      { ...valid, divisor: [1, 0, 1, 0, 0, 0, 0, 0] },
      94,
      1,
      1,
    );
    assert.equal(invalidDivisor.status, statuses.INVALID_DIVISOR);

    const overflow = nativeSearch(
      addon,
      valid,
      (1n << 128n) - 1n,
      1,
      2,
    );
    assert.equal(overflow.status, statuses.INVALID_ARGUMENT);
    assert.throws(
      () =>
        addon.genus3JacobianSearchProgression(
          3n,
          new BigUint64Array(7),
          u64(valid.h),
          u64(valid.divisor),
          94n,
          1n,
          1n,
          64n,
          1000n,
          undefined,
        ),
      /packed BigUint64Array length/,
    );
  });

  test("independent workers share no mutable Jacobian search state", async () => {
    const runs = await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          new Promise((resolve, reject) => {
            const worker = new Worker(__filename, {
              workerData: { iterations: 25 },
            });
            worker.once("message", resolve);
            worker.once("error", reject);
            worker.once("exit", (code) => {
              if (code !== 0) reject(new Error(`worker exited with ${code}`));
            });
          }),
      ),
    );
    const expected = ["ok", "94", "94"];
    for (const run of runs) {
      assert.equal(run.length, 25);
      for (const row of run) assert.deepEqual(row, expected);
    }
  });
}
