"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function input(integer) {
  const int64 = (values) => values.map(BigInt);
  const rows = 288n;
  const places = 3n;
  const columns = 301n;
  const state = int64([2, 13, 286, 0, 13, 288, 0, 301, 0]);
  const h = integer([2, 0, 0, 2]);
  const b = integer(Array(572).fill(0));
  const logWords = 7 * Number(places) * Number(columns);
  const c = integer(Array(logWords).fill(0));
  const relation = integer([301, 8192, 0, 0, 301, 301]);
  const regulator = integer([7, 192, 33]);
  const driver = int64([3, 3, 4, 301, 0, 0, 18732, 301]);
  return {
    args: [
      0n,
      rows,
      places,
      columns,
      state,
      h,
      b,
      c,
      relation,
      regulator,
      driver,
      integer(Array(4).fill(77)),
      integer(Array(4).fill(77)),
      integer(Array(logWords).fill(77)),
      integer(Array(2).fill(77)),
      integer([77]),
      integer(Array(4).fill(77)),
      integer(Array(2).fill(77)),
      int64(Array(6).fill(77)),
      integer(Array(5).fill(77)),
      int64(Array(8).fill(77)),
    ],
    driver,
  };
}

(async () => {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "terminal_candidate_final_bridge.py"),
  });
  const kernel = require(built.modulePath).pari_publish_terminal_candidate_tail;
  assert(kernel.nativeAvailable);
  const summary = { backends: [], transactionalRejections: 0 };
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const make = (values) =>
      backend === "javascript"
        ? values.map(BigInt)
        : kernel.createIntegerBuffer(values.length, 512, values.map(BigInt));
    const { args, driver } = input(make);
    assert.equal(kernel[backend](...args), 0n);
    const values = (owner) =>
      Array.isArray(owner) ? owner : owner.toArray();
    assert.deepEqual(values(args[11]), [2n, 0n, 0n, 2n]);
    assert.deepEqual(values(args[12]), [2n, 0n, 0n, 2n]);
    assert.deepEqual(values(args[14]), [2n, 2n]);
    assert.deepEqual(values(args[15]), [4n]);
    assert.deepEqual(values(args[19]), [2n, 2n, 0n, 0n, 2n]);
    assert.deepEqual(values(args[20]), [0n, 288n, 301n, 2n, 286n, 2n, 6321n, 572n]);
    assert.deepEqual(values(driver).slice(0, 8), [4n, 0n, 4n, 301n, 1n, 2n, 18732n, 301n]);

    const rejected = input(make);
    rejected.args[0] = 5n;
    const beforeDriver = values(rejected.driver).slice();
    const beforePresentation = values(rejected.args[11]).slice();
    assert.equal(kernel[backend](...rejected.args), -1n);
    assert.deepEqual(values(rejected.driver), beforeDriver);
    assert.deepEqual(values(rejected.args[11]), beforePresentation);
    assert.equal(values(rejected.args[20])[0], -1n);
    summary.transactionalRejections += 1;
    summary.backends.push(backend);
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(
    JSON.stringify({
      ...summary,
      classNumber: "4",
      invariants: ["2", "2"],
      compactShape: [2, 2],
      originalShape: [288, 301],
      coreSha256: digest(built.coreSourcePath),
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
