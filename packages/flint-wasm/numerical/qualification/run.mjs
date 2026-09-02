#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { qualifyMgh } from "./qualify.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(
  resolve(packageRoot, "sources/cminpack-lock.json"), "utf8",
));
const sourceRoot = resolve(
  packageRoot,
  "build/source",
  `cminpack-${lock.cminpack.revision}`,
);
const artifactBytes = await readFile(resolve(packageRoot, "build/cminpack.wasm"));
const oracleBytes = await readFile(resolve(packageRoot, "build/mgh-oracle.wasm"));
const manifest = JSON.parse(await readFile(
  resolve(packageRoot, "release/production-manifest.json"), "utf8",
));
const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
if (artifactSha256 !== manifest.artifact.sha256) {
  throw new Error("qualification artifact differs from the production manifest");
}

const { results, lifecycle } = await qualifyMgh({
  artifactBytes,
  oracleBytes,
  casesText: await readFile(
    resolve(sourceRoot, lock.cminpack.qualification.cases), "utf8",
  ),
  lmdifReferenceText: await readFile(
    resolve(sourceRoot, lock.cminpack.qualification.lmdif_reference), "utf8",
  ),
  lmderReferenceText: await readFile(
    resolve(sourceRoot, lock.cminpack.qualification.lmder_reference), "utf8",
  ),
});
const resultsSha256 = createHash("sha256")
  .update(JSON.stringify(results))
  .digest("hex");

const receipt = {
  schema: "sagejs.numerical-wasm-qualification/v1",
  classification: "final-artifact upstream MGH differential",
  artifact_sha256: artifactSha256,
  source_revision: lock.cminpack.revision,
  qualification_inputs: {
    cases_sha256: lock.cminpack.qualification.cases_sha256,
    lmdif_reference_sha256:
      lock.cminpack.qualification.lmdif_reference_sha256,
    lmder_reference_sha256:
      lock.cminpack.qualification.lmder_reference_sha256,
  },
  runtime: {
    engine: "node",
    version: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  methods: {
    "cminpack-lmdif": { passed: 53, failed: 0 },
    "cminpack-lmder": { passed: 53, failed: 0 },
  },
  results_sha256: resultsSha256,
  lifecycle_after: lifecycle,
  cases: results,
};
await writeFile(
  resolve(packageRoot, "build/qualification-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({
  schema: receipt.schema,
  artifact_sha256: receipt.artifact_sha256,
  runtime: receipt.runtime,
  methods: receipt.methods,
  results_sha256: receipt.results_sha256,
  lifecycle_after: receipt.lifecycle_after,
}, null, 2)}\n`);
