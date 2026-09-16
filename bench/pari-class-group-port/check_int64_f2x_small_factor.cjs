"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

(async () => {
  const boundedBuild = await compileKernel({
    sourcePath: path.join(__dirname, "int64_f2x_small_factor.py"),
  });
  const exactBuild = await compileKernel({
    sourcePath: path.join(__dirname, "f2x_small_factor.py"),
  });
  const bounded = require(boundedBuild.modulePath).int64_pari_f2x_small_degfact;
  const exact = require(exactBuild.modulePath).pari_f2x_small_degfact;
  let cases = 0;
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (let polynomial = 4n; polynomial < 32n; polynomial += 1n) {
      const boundedDegrees = bounded.createInt64Buffer(4);
      const boundedExponents = bounded.createInt64Buffer(4);
      const exactDegrees = exact.createIntegerBuffer(4, 8);
      const exactExponents = exact.createIntegerBuffer(4, 8);
      const exactWorkspace = exact.createIntegerBuffer(29, 8);
      const boundedCount = Number(bounded[backend](
        polynomial, boundedDegrees, boundedExponents,
      ));
      const exactCount = Number(exact[backend](
        polynomial, exactDegrees, exactExponents, exactWorkspace, 9n,
      ));
      assert.equal(boundedCount, exactCount, `${backend}: count for ${polynomial}`);
      assert.deepEqual(
        Array.from(boundedDegrees).slice(0, boundedCount).map(String),
        exactDegrees.toArray().slice(0, exactCount).map(String),
        `${backend}: degrees for ${polynomial}`,
      );
      assert.deepEqual(
        Array.from(boundedExponents).slice(0, boundedCount).map(String),
        exactExponents.toArray().slice(0, exactCount).map(String),
        `${backend}: exponents for ${polynomial}`,
      );
      cases += 1;
    }
  }
  const core = fs.readFileSync(boundedBuild.coreSourcePath, "utf8");
  for (const name of [
    "uint64_f2x_degree_nonzero",
    "uint64_f2x_rem",
    "uint64_f2x_div_exact",
    "int64_pari_f2x_small_degfact",
  ]) {
    const emitted = core.match(new RegExp(
      `static int native_${name}\\([^;]*\\)\\n\\{[\\s\\S]*?\\n}\\n`,
    ));
    assert(emitted, `missing emitted ${name}`);
    assert.doesNotMatch(emitted[0], /\bmpz_/);
    assert.doesNotMatch(emitted[0], /\b(?:malloc|calloc|realloc|free)\(/);
  }
  console.log(JSON.stringify({
    schema: "sagejs.check/int64-f2x-small-factor-v1",
    cases,
    polynomials: 28,
    backends: ["javascript", "gmp", "tagged"],
    emittedMpzOperations: 0,
    emittedHeapCalls: 0,
    coreSourcePath: boundedBuild.coreSourcePath,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
