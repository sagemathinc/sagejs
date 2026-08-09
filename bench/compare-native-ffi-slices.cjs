#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "..");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(callable, calls, samples = 9) {
  for (let index = 0; index < 3; index += 1) callable();
  const values = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    for (let index = 0; index < calls; index += 1) callable();
    values.push((performance.now() - start) / calls);
  }
  return median(values);
}

async function main() {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-ffi-slices-"));
  try {
    const graphResult = await compileKernel({
      sourcePath: join(root, "bench", "native-ffi-igraph-canonical.py"),
      cacheRoot: join(cacheRoot, "graph"),
    });
    const polynomialResult = await compileKernel({
      sourcePath: join(root, "bench", "native-ffi-flint-polynomial.py"),
      cacheRoot: join(cacheRoot, "flint"),
    });
    const graph = require(graphResult.modulePath);
    const polynomial = require(polynomialResult.modulePath);

    const vertexCount = 80;
    const edgeValues = [];
    for (let index = 0; index < vertexCount; index += 1) {
      edgeValues.push(BigInt(index), BigInt((index + 1) % vertexCount));
    }
    const edges = graph.createUInt64Buffer(edgeValues);
    const labels = graph.createUInt64Buffer(vertexCount);
    const graphNative = () => graph.igraph_canonical_labels(
      labels, edges, BigInt(vertexCount), BigInt(edgeValues.length), false,
    );
    const graphDynamic = () => graph.igraph_canonical_labels.javascript(
      labels, edges, BigInt(vertexCount), BigInt(edgeValues.length), false,
    );

    const length = 128;
    const modulus = 65537n;
    const left = polynomial.createUInt64Buffer(Array.from(
      { length }, (_, index) => BigInt((index * 37 + 11) % 65537),
    ));
    const right = polynomial.createUInt64Buffer(Array.from(
      { length }, (_, index) => BigInt((index * 53 + 7) % 65537),
    ));
    const product = polynomial.createUInt64Buffer(2 * length - 1);
    const polynomialNative = () => polynomial.flint_nmod_polynomial_product(
      product, left, right, BigInt(product.length), BigInt(length),
      BigInt(length), modulus,
    );
    const polynomialDynamic = () =>
      polynomial.flint_nmod_polynomial_product.javascript(
        product, left, right, BigInt(product.length), BigInt(length),
        BigInt(length), modulus,
      );

    const report = {
      schema: "sagejs.benchmark/ffi-packed-slices-v1",
      host: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
      },
      policy: { statistic: "median", samples: 9, unit: "ms/call" },
      workloads: {
        igraph_canonical_cycle_80: {
          native_ms: measure(graphNative, 200),
          dynamic_ms: measure(graphDynamic, 20),
        },
        flint_nmod_poly_mul_128: {
          native_ms: measure(polynomialNative, 500),
          dynamic_ms: measure(polynomialDynamic, 2),
        },
      },
      checksums: {
        labels: Array.from(labels).reduce(
          (sum, value) => sum + value, 0n,
        ).toString(),
        product: Array.from(product).reduce(
          (sum, value) => sum + value, 0n,
        ).toString(),
      },
    };
    for (const workload of Object.values(report.workloads)) {
      workload.dynamic_over_native = workload.dynamic_ms / workload.native_ms;
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
