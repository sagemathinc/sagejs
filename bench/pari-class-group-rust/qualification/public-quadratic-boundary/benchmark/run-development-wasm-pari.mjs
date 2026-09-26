#!/usr/bin/env node

// Development diagnostic only: the public Wasm package still declines this reactor.
import { readFileSync, writeFileSync } from "node:fs";
import { extname, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import benchmark from "./run-public-sagejs-pari.cjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../..");
const panel = JSON.parse(readFileSync(join(here, "panel-v2.json"), "utf8"));
const {
  parseArguments,
  median,
  expectedSage,
  sha256,
  verifyPariIdentity,
  ResidentGp,
  timePari,
} = benchmark;

function installFileFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.protocol !== "file:") return original(input, init);
    const method = String(init.method ?? input?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405 });
    try {
      const bytes = readFileSync(fileURLToPath(url));
      return new Response(method === "HEAD" ? null : bytes, {
        status: 200,
        headers: { "content-type": {
          ".wasm": "application/wasm",
          ".json": "application/json",
          ".js": "text/javascript",
          ".mjs": "text/javascript",
        }[extname(url.pathname)] ?? "application/octet-stream" },
      });
    } catch (error) {
      if (error?.code === "ENOENT") return new Response(null, { status: 404 });
      throw error;
    }
  };
  return () => { globalThis.fetch = original; };
}

async function createDevelopmentEvaluator(artifact, receipt) {
  const [kernel, evaluatorModule, workerHost] = await Promise.all([
    import(pathToFileURL(join(root, "packages/flint-wasm/kernel.mjs"))),
    import(pathToFileURL(join(root, "packages/flint-wasm/evaluator.mjs"))),
    import(pathToFileURL(join(root, "packages/flint-wasm/node-worker.mjs"))),
  ]);
  workerHost.installNodeWorkerHost();
  const session = new kernel.SageSession();
  let resources;
  try {
    await session.ready();
    resources = { ...session.resources };
  } finally {
    await session.close();
  }
  return evaluatorModule.instantiateSageEvaluator({
    ...resources,
    classGroup: { artifact: pathToFileURL(artifact), receipt },
  });
}

async function timeSage(evaluator, field, boundary) {
  const code = `${boundary === "polynomial"
    ? `K.<a> = NumberField(${field.pariPolynomial})\n` : ""}` +
    "G = K.class_group(algorithm='rust')\n" +
    "[K.discriminant(), G.order(), G.invariants(), G.proof_status, G.algorithm]";
  const start = performance.now();
  const response = await evaluator.evaluate(code);
  const elapsed = Math.round((performance.now() - start) * 1_000_000);
  if (response.repr !== expectedSage(field)) {
    throw new Error(`wrong development Wasm answer for ${field.id}: ${response.repr}`);
  }
  return elapsed;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const artifact = resolve(process.env.SAGEJS_QUADRATIC_WASM_ARTIFACT ||
    join(root, "packages/imaginary-quadratic-core/target/wasm32-wasip1/release/" +
      "sagejs_imaginary_quadratic_core.wasm"));
  const bytes = readFileSync(artifact);
  const receipt = { bytes: bytes.byteLength, sha256: sha256(artifact) };
  const pari = verifyPariIdentity();
  const gp = new ResidentGp(pari.executable);
  const restoreFetch = installFileFetch();
  const beforeLoad = os.loadavg();
  const results = [];
  let evaluator;
  try {
    evaluator = await createDevelopmentEvaluator(artifact, receipt);
    const version = JSON.parse(await gp.query("print(version())"));
    if (JSON.stringify(version) !== "[2,17,4]") throw new Error("unexpected PARI version");
    const policy = JSON.parse(await gp.query(
      "default(realbitprecision,192);default(nbthreads,1);" +
      "print([default(realbitprecision),default(nbthreads)])",
    ));
    if (JSON.stringify(policy) !== "[192,1]") throw new Error("unexpected PARI policy");
    await evaluator.evaluate("R.<x> = QQ[]");
    for (const [fieldIndex, field] of panel.fields.entries()) {
      if (options.fieldId !== undefined && options.fieldId !== field.id) continue;
      process.stderr.write(`measuring ${field.id} (${options.boundary}, development Wasm)\n`);
      if (options.boundary === "prepared") {
        await evaluator.evaluate(`K.<a> = NumberField(${field.pariPolynomial})`);
        const discriminant = Number(await gp.query(
          `nf=nfinit(${field.pariPolynomial});print(nf.disc)`,
        ));
        if (discriminant !== field.expected.discriminant) {
          throw new Error(`wrong prepared PARI discriminant for ${field.id}`);
        }
      }
      await timeSage(evaluator, field, options.boundary);
      await timePari(gp, field, fieldIndex, 0, options.boundary);
      const sageNanoseconds = [];
      const pariNanoseconds = [];
      for (let sample = 0; sample < options.samples; sample += 1) {
        for (const arm of sample % 2 === 0 ? ["sagejs", "pari"] : ["pari", "sagejs"]) {
          if (arm === "sagejs") {
            sageNanoseconds.push(await timeSage(evaluator, field, options.boundary));
          } else {
            pariNanoseconds.push(await timePari(gp, field, fieldIndex, sample + 1,
              options.boundary));
          }
        }
      }
      const sageMedianNanoseconds = median(sageNanoseconds);
      const pariMedianNanoseconds = median(pariNanoseconds);
      results.push({
        fieldId: field.id,
        expected: field.expected,
        sageNanoseconds,
        pariNanoseconds,
        sageMedianNanoseconds,
        pariMedianNanoseconds,
        sageOverPariMedianRatio: sageMedianNanoseconds / pariMedianNanoseconds,
      });
      process.stderr.write(`${JSON.stringify(results.at(-1))}\n`);
    }
  } finally {
    evaluator?.terminate();
    restoreFetch();
    await gp.close();
  }
  const output = {
    schema: "sagejs.public-quadratic/development-wasm-pari-diagnostic-v1",
    promotedPerformanceReceipt: false,
    developmentOnly: true,
    panelSchema: panel.schema,
    panelSha256: sha256(join(here, "panel-v2.json")),
    boundary: options.boundary === "polynomial"
      ? "warm-resident-polynomial-to-development-wasm-evaluator-class-group-v1"
      : "warm-resident-prepared-field-to-development-wasm-evaluator-class-group-v1",
    caveat: "The production Sage.js Wasm kernel still declines this unreviewed reactor. " +
      "This harness injects it into a development evaluator and excludes the public " +
      "kernel's outer worker IPC. Both arms include interpreter evaluation and result " +
      "projection; Sage.js authenticates a complete ideal-class map while PARI also " +
      "computes rank-zero unit data. This is not a promoted or symmetric kernel receipt.",
    samplesPerArmPerField: options.samples,
    runnerSha256: sha256(fileURLToPath(import.meta.url)),
    sageBuildReceiptSha256: sha256(join(root, "dist/build-receipt.json")),
    wasmBuildReceiptSha256: sha256(join(root, "packages/flint-wasm/dist/build-receipt.json")),
    reactorSha256: receipt.sha256,
    reactorBytes: receipt.bytes,
    pariGpSha256: pari.executableSha256,
    pariLibrarySha256: pari.librarySha256,
    pariPrecisionBits: 192,
    pariThreads: 1,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: os.cpus()[0]?.model,
    loadAverageBefore: beforeLoad,
    loadAverageAfter: os.loadavg(),
    results,
  };
  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (options.receipt !== undefined) writeFileSync(join(here, options.receipt), text);
  process.stdout.write(text);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
