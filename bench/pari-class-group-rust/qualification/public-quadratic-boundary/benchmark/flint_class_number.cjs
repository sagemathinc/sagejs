"use strict";

// Qualification-only timing control for the current Sage.js FLINT N-API route.
const { resolve } = require("node:path");

const [packagePath, discriminantText, repetitionsText] = process.argv.slice(2);
const repetitions = Number(repetitionsText);
if (!packagePath || !/^-\d+$/.test(discriminantText || "") ||
    !Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 1000000) {
  throw new Error("usage: flint_class_number.cjs PACKAGE_PATH NEGATIVE_D REPETITIONS");
}

const flintPackage = resolve(packagePath);
const status = require(resolve(flintPackage, "scripts/build-addon.cjs"))
  .installedAddonStatus();
if (status.status !== "current") {
  throw new Error(`source-matched FLINT addon required: ${status.status}: ${status.reason}`);
}
const flint = require(resolve(flintPackage, "build/Release/sagejs_flint.node"));
const discriminant = BigInt(discriminantText);
let answer;
const start = process.hrtime.bigint();
for (let index = 0; index < repetitions; index += 1) {
  const current = flint.qfbClassNumber(discriminant);
  if (answer !== undefined && current !== answer) {
    throw new Error("FLINT repeated class-number calls disagreed");
  }
  answer = current;
}
const elapsed = process.hrtime.bigint() - start;
process.stdout.write(JSON.stringify({
  schema: "sagejs.public-quadratic/flint-class-number-sample-v1",
  boundaryLabel: "sagejs-flint-qfbClassNumber-v1",
  discriminant: Number(discriminant),
  classNumber: Number(answer),
  kernelNanoseconds: Number(elapsed),
  computations: repetitions,
}) + "\n");
