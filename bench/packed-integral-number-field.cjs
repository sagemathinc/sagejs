#!/usr/bin/env node
"use strict";

const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { compile } = require("@sagemath/sagejs/native");
const { removeLoadedNativeCache } = require("../test/helpers/native-cache-cleanup.cjs");

const root = join(__dirname, "..");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "polynomial",
  "packed_rational.py",
);

function elapsedNs(action) {
  const started = process.hrtime.bigint();
  action();
  return process.hrtime.bigint() - started;
}

async function main() {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-packed-nf-bench-"));
  try {
    const compiled = await compile({ sourcePath, cacheRoot: cache });
    const module = require(compiled.modulePath);
    const multiply = module.packed_integral_number_field_multiply_reduce;
    const powerBasis = module.packed_integral_number_field_power_basis;
    const degree = 32;
    const iterations = 80;
    let state = 0x9e3779b97f4a7c15n;
    const next = () => {
      state =
        (state * 6364136223846793005n + 1442695040888963407n) &
        ((1n << 320n) - 1n);
      return (state >> 19n) * (state & 1n ? -1n : 1n);
    };
    const left = [1n, ...Array.from({ length: degree }, next)];
    const right = [1n, ...Array.from({ length: degree }, next)];
    const defining = Array.from({ length: degree }, next);
    const packedLeft = multiply.packIntegerBuffer(left);
    const packedRight = multiply.packIntegerBuffer(right);
    const packedDefining = multiply.packIntegerBuffer(defining);
    const output = multiply.createIntegerBuffer(degree + 1, 256);
    const workspace = multiply.createIntegerBuffer(2 * degree - 1, 256);
    multiply(
      output,
      packedLeft,
      packedRight,
      packedDefining,
      workspace,
      BigInt(degree),
    );
    const nativeNs = elapsedNs(() => {
      for (let index = 0; index < iterations; index += 1) {
        multiply(
          output,
          packedLeft,
          packedRight,
          packedDefining,
          workspace,
          BigInt(degree),
        );
      }
    });
    const dynamicOutput = Array(degree + 1).fill(0n);
    const dynamicWorkspace = Array(2 * degree - 1).fill(0n);
    const dynamicNs = elapsedNs(() => {
      for (let index = 0; index < iterations; index += 1) {
        multiply.javascript(
          dynamicOutput,
          left,
          right,
          defining,
          dynamicWorkspace,
          BigInt(degree),
        );
      }
    });
    const orbitIterations = 8;
    const multiplicationMatrix = Array.from(
      { length: degree * degree },
      next,
    );
    const multiplicationDenominator = [1n << 127n];
    const packedMatrix = powerBasis.packIntegerBuffer(multiplicationMatrix);
    const packedMatrixDenominator = powerBasis.packIntegerBuffer(
      multiplicationDenominator,
    );
    const orbitNumerators = powerBasis.createIntegerBuffer(
      degree * degree,
      512,
    );
    const orbitDenominators = powerBasis.createIntegerBuffer(degree, 512);
    const orbitWorkspace = powerBasis.createIntegerBuffer(2 * degree, 512);
    powerBasis(
      orbitNumerators,
      orbitDenominators,
      packedMatrix,
      packedMatrixDenominator,
      orbitWorkspace,
      BigInt(degree),
    );
    const orbitNativeNs = elapsedNs(() => {
      for (let index = 0; index < orbitIterations; index += 1) {
        powerBasis(
          orbitNumerators,
          orbitDenominators,
          packedMatrix,
          packedMatrixDenominator,
          orbitWorkspace,
          BigInt(degree),
        );
      }
    });
    const dynamicOrbitNumerators = Array(degree * degree).fill(0n);
    const dynamicOrbitDenominators = Array(degree).fill(0n);
    const dynamicOrbitWorkspace = Array(2 * degree).fill(0n);
    const orbitDynamicNs = elapsedNs(() => {
      for (let index = 0; index < orbitIterations; index += 1) {
        powerBasis.javascript(
          dynamicOrbitNumerators,
          dynamicOrbitDenominators,
          multiplicationMatrix,
          multiplicationDenominator,
          dynamicOrbitWorkspace,
          BigInt(degree),
        );
      }
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: 1,
          workload:
            "degree-32 canonical QQ[x]/(integral monic f) multiply-reduce",
          iterations,
          coefficientBits: 301,
          nativeNsPerCall: Number(nativeNs / BigInt(iterations)),
          dynamicNsPerCall: Number(dynamicNs / BigInt(iterations)),
          speedup: Number(dynamicNs) / Number(nativeNs),
          orbit: {
            workload:
              "degree-32 exact regular-representation power-basis orbit",
            iterations: orbitIterations,
            nativeNsPerCall: Number(
              orbitNativeNs / BigInt(orbitIterations),
            ),
            dynamicNsPerCall: Number(
              orbitDynamicNs / BigInt(orbitIterations),
            ),
            speedup: Number(orbitDynamicNs) / Number(orbitNativeNs),
          },
          sourceHash: compiled.sourceHash,
          nativeAbi: compiled.nativeAbi,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    removeLoadedNativeCache(cache);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
