"use strict";

const { performance } = require("node:perf_hooks");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { compile } = require("../../../tools/native-kernel.cjs");

const root = resolve(__dirname, "..", "..", "..");
const expected = {
  nbody: -0.16908926275527303,
  matrix_multiplication: 166742891853.24692,
};

function initialState() {
  const days = 365.24;
  const solarMass = 4 * Math.PI * Math.PI;
  const state = new Float64Array([
    0, 0, 0, 0, 0, 0, solarMass,
    4.84143144246472090, -1.16032004402742839,
    -1.03622044471123109e-1,
    1.66007664274403694e-3 * days,
    7.69901118419740425e-3 * days,
    -6.90460016972063023e-5 * days,
    9.54791938424326609e-4 * solarMass,
    8.34336671824457987, 4.12479856412430479,
    -4.03523417114321381e-1,
    -2.76742510726862411e-3 * days,
    4.99852801234917238e-3 * days,
    2.30417297573763929e-5 * days,
    2.85885980666130812e-4 * solarMass,
    1.28943695621391310e1, -1.51111514016986312e1,
    -2.23307578892655734e-1,
    2.96460137564761618e-3 * days,
    2.37847173959480950e-3 * days,
    -2.96589568540237556e-5 * days,
    4.36624404335156298e-5 * solarMass,
    1.53796971148509165e1, -2.59193146099879641e1,
    1.79258772950371181e-1,
    2.68067772490389322e-3 * days,
    1.62824170038242295e-3 * days,
    -9.51592254519715870e-5 * days,
    5.15138902046611451e-5 * solarMass,
  ]);
  let px = 0;
  let py = 0;
  let pz = 0;
  for (let body = 0; body < 5; body += 1) {
    const start = body * 7;
    const mass = state[start + 6];
    px -= state[start + 3] * mass;
    py -= state[start + 4] * mass;
    pz -= state[start + 5] * mass;
  }
  state[3] = px / solarMass;
  state[4] = py / solarMass;
  state[5] = pz / solarMass;
  return state;
}

function matrixInputs() {
  const size = 30;
  const left = Float64Array.from(
    { length: size * size },
    (_unused, index) => ((index * 17 + 3) % 97) / 97,
  );
  const right = Float64Array.from(
    { length: size * size },
    (_unused, index) => ((index * 19 + 5) % 89) / 890,
  );
  return [left, right, new Float64Array(size * size)];
}

function close(actual, wanted) {
  return Math.abs(actual - wanted) <= 1e-12 * Math.max(1, Math.abs(wanted));
}

async function main() {
  const cacheRoot = process.env.SAGEJS_BUFFER_NATIVE_CACHE ||
    join(tmpdir(), "sagejs-cowasm-buffer-native-cache");
  const compiled = await compile({
    sourcePath: join(root, "bench", "cowasm", "native", "numerical_buffers.py"),
    cacheRoot,
  });
  const module = require(compiled.modulePath);
  const backend = process.env.SAGEJS_BUFFER_BACKEND || "native";
  const nbody = backend === "javascript"
    ? module.nbody_advance_energy.javascript
    : module.nbody_advance_energy;
  const matrix = backend === "javascript"
    ? module.matrix_multiply_repeated.javascript
    : module.matrix_multiply_repeated;
  const prepare = {
    nbody() {
      return [nbody, [initialState(), 0.01, 20000, 5]];
    },
    matrix_multiplication() {
      const [left, right, scratch] = matrixInputs();
      return [matrix, [left, right, scratch, 30, 50]];
    },
  };
  const warmups = Number(process.env.SAGEJS_BUFFER_WARMUPS || 1);
  const samples = Number(process.env.SAGEJS_BUFFER_SAMPLES || 3);
  const selected = (process.env.SAGEJS_BUFFER_ONLY ||
    "nbody,matrix_multiplication").split(",");
  process.stdout.write("SAGEJS_COWASM_BUFFERS 1\n");
  for (const [kind, count] of [["WARMUP", warmups], ["RESULT", samples]]) {
    for (let sample = 0; sample < count; sample += 1) {
      for (const identifier of selected) {
        const [operation, args] = prepare[identifier]();
        const started = performance.now();
        const answer = operation(...args);
        const elapsed = Math.round((performance.now() - started) * 1e6);
        if (!close(answer, expected[identifier])) {
          throw new Error(
            identifier + " returned " + answer + "; expected " +
              expected[identifier],
          );
        }
        process.stdout.write(
          kind + "\t" + sample + "\t" + identifier + "\t" +
            elapsed + "\tok\n",
        );
      }
    }
  }
  process.stdout.write(
    "COMPLETE\t" + warmups + "\t" + samples + "\t" + selected.length + "\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
