#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "bounded_getfu_reconstruction.py");
const DIMENSION = 5;
const RHS_COUNT = 4;

// Column-major synthetic embedding matrix and four exact integral-basis units.
// The matrix is deliberately nonsymmetric and forces a pivot exchange.
const matrix = [
  0n, 2n, 1n, -1n, 3n,
  1n, -1n, 2n, 0n, 1n,
  2n, 0n, -1n, 1n, 1n,
  -1n, 1n, 0n, 2n, -2n,
  3n, 1n, 1n, -1n, 0n,
];
const units = [
  1n, -2n, 3n, 0n, 1n,
  -4n, 1n, 0n, 2n, -1n,
  7n, 3n, -2n, 1n, 4n,
  0n, -5n, 2n, 6n, -3n,
];

function exact(values) {
  return values.flatMap(value => [value, -1n, 0n]);
}
function multiplyColumns(a, x, n, k) {
  const answer = Array(n * k).fill(0n);
  for (let column = 0; column < k; column++)
    for (let row = 0; row < n; row++)
      for (let index = 0; index < n; index++)
        answer[column * n + row] +=
          a[index * n + row] * x[column * n + index];
  return answer;
}
function values(value) {
  return Array.isArray(value)
    ? value
    : value.toArray
      ? value.toArray()
      : Array.from(value);
}

function pythonReference(rhs) {
  const script = String.raw`
import importlib,json,sys
sys.path.extend([sys.argv[1],sys.argv[1]+'/src/lib'])
m=importlib.import_module('bench.pari-class-group-port.bounded_getfu_reconstruction')
z=json.load(sys.stdin); n=z['n']; k=z['k']; Z=lambda length:[0]*length
matrix=[v for x in z['matrix'] for v in (int(x),-1,0)]
rhs=[v for x in z['rhs'] for v in (int(x),-1,0)]
out=[991]*(n*k); state=Z(5)
status=m.pari_bounded_getfu_multiple_rhs_reconstruct(matrix,rhs,n,k,32,256,128,
 Z(3*n*n),Z(3*n*k),Z(3*n*k),Z(n*k),out,Z(n),state)
json.dump({'status':status,'state':state,'output':out},sys.stdout,separators=(',',':'))
`;
  const result = spawnSync("python3", ["-c", script, ROOT], {
    input: JSON.stringify({
      n: DIMENSION,
      k: RHS_COUNT,
      matrix: matrix.map(String),
      rhs: rhs.map(String),
    }),
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}

(async () => {
  const rhs = multiplyColumns(matrix, units, DIMENSION, RHS_COUNT);
  const dynamic = pythonReference(rhs);
  assert.equal(dynamic.status, 0);
  assert.deepEqual(dynamic.output.map(BigInt), units);
  assert.deepEqual(dynamic.state.map(BigInt), [0n, 5n, 4n, -(1n << 61n), 4n]);

  const built = await compileKernel({ sourcePath: SOURCE });
  const f = require(built.modulePath).pari_bounded_getfu_multiple_rhs_reconstruct;
  assert.equal(f.nativeAvailable, true);
  const backends = ["javascript", "gmp", "tagged"];
  for (const backend of backends) {
    const packed = source => backend === "javascript"
      ? source.slice()
      : f.createIntegerBuffer(source.length, 512, source);
    const integer = (length, fill = 0n) => backend === "javascript"
      ? Array(length).fill(fill)
      : f.createIntegerBuffer(length, 512, Array(length).fill(fill));
    const int64 = length => backend === "javascript"
      ? Array(length).fill(0n)
      : f.createInt64Buffer(length);
    const output = integer(DIMENSION * RHS_COUNT, 991n);
    const state = int64(5);
    const args = [
      packed(exact(matrix)), packed(exact(rhs)), BigInt(DIMENSION),
      BigInt(RHS_COUNT), 32n, 256n, 128n,
      integer(3 * DIMENSION * DIMENSION),
      integer(3 * DIMENSION * RHS_COUNT),
      integer(3 * DIMENSION * RHS_COUNT),
      integer(DIMENSION * RHS_COUNT), output, int64(DIMENSION), state,
    ];
    assert.equal(f[backend](...args), 0n, backend);
    assert.deepEqual(values(output), units, `${backend}: exact synthetic units`);
    assert.deepEqual(values(state), dynamic.state.map(BigInt), `${backend}: state`);

    // A singular system must fail without publishing even one coordinate.
    const singular = matrix.slice();
    for (let row = 0; row < DIMENSION; row++)
      singular[4 * DIMENSION + row] = singular[3 * DIMENSION + row];
    const guarded = integer(DIMENSION * RHS_COUNT, 777n);
    const failedState = int64(5);
    const failedArgs = args.slice();
    failedArgs[0] = packed(exact(singular));
    failedArgs[11] = guarded;
    failedArgs[13] = failedState;
    assert.equal(f[backend](...failedArgs), 1n, `${backend}: singular status`);
    assert.deepEqual(values(guarded), Array(20).fill(777n), `${backend}: transaction`);
    assert.equal(values(failedState)[0], 1n, `${backend}: singular state`);

    // Declared coordinate bounds are enforced after solving, before publish.
    const bounded = integer(DIMENSION * RHS_COUNT, 555n);
    const boundedState = int64(5);
    const boundedArgs = args.slice();
    boundedArgs[6] = 2n;
    boundedArgs[11] = bounded;
    boundedArgs[13] = boundedState;
    assert.equal(f[backend](...boundedArgs), 3n, `${backend}: coordinate bound`);
    assert.deepEqual(values(bounded), Array(20).fill(555n), `${backend}: bound transaction`);

    // 1.25 rounds to 1 but proves only two bits; a 32-bit request must retry.
    const imprecise = integer(1, 333n);
    const impreciseState = int64(5);
    const impreciseArgs = [
      packed(exact([1n])), packed([5n << 61n, 64n, 0n]), 1n, 1n,
      32n, 256n, 128n, integer(3), integer(3), integer(3), integer(1),
      imprecise, int64(1), impreciseState,
    ];
    assert.equal(f[backend](...impreciseArgs), 2n, `${backend}: accuracy status`);
    assert.deepEqual(values(imprecise), [333n], `${backend}: accuracy transaction`);
    assert.equal(values(impreciseState)[3], -2n, `${backend}: rounding error`);

    const oversizedMatrix = matrix.slice();
    oversizedMatrix[0] = 1n << 65n;
    const oversizedArgs = args.slice();
    oversizedArgs[0] = packed(exact(oversizedMatrix));
    oversizedArgs[5] = 64n;
    assert.throws(
      () => f[backend](...oversizedArgs),
      /exceeds declared bit bound/,
      `${backend}: scalar bit bound`,
    );
  }

  // Structural bounds throw instead of silently widening the native corridor.
  const host = name => f[name];
  assert.throws(() => host("javascript")(
    exact(matrix), exact(rhs), 9n, 4n, 32n, 256n, 128n,
    Array(243).fill(0n), Array(108).fill(0n), Array(108).fill(0n),
    Array(36).fill(0n), Array(36).fill(0n), Array(9).fill(0n), Array(5).fill(0n),
  ), /outside the bounded corridor/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/bounded-getfu-reconstruction-check-v1",
    shape: [DIMENSION, RHS_COUNT],
    syntheticUnits: units.map(String),
    dynamicNativeAgreement: backends,
    failClosed: [
      "dimension", "scalar-bits", "singular", "rounding-accuracy",
      "coordinate-bits", "transactional-output",
    ],
    frozenFinalUnitsReadAtRuntime: false,
    native: {
      cacheKey: built.cacheKey,
      coreBytes: fs.statSync(built.coreSourcePath).size,
    },
  })}\n`);
})().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
