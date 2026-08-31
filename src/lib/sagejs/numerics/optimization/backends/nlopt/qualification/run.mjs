#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createNloptBackend } from "../index.mjs";
import {
  optionsFromCase,
  validateCase,
} from "../../../../../../../../bench/numerical-p3-nlopt/problems.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../../../../../../..");
const artifactBytes = await readFile(resolve(packageRoot, "build/nlopt-methods.wasm"));
const buildReport = JSON.parse(await readFile(
  resolve(packageRoot, "build/build-report.json"),
  "utf8",
));
const corpusBytes = await readFile(
  resolve(repositoryRoot, "bench/numerical-p3-nlopt/corpus.json"),
);
const corpus = JSON.parse(corpusBytes);
const oracle = JSON.parse(await readFile(
  resolve(packageRoot, "qualification/oracle-summary.json"),
  "utf8",
));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
if (sha256(artifactBytes) !== buildReport.artifact.sha256) {
  throw new Error("qualification artifact differs from its build report");
}
if (sha256(corpusBytes) !== oracle.corpus_sha256) {
  throw new Error("shared corpus differs from the independently recorded oracle corpus");
}

const solver = await createNloptBackend(artifactBytes);
const results = [];
for (const record of corpus.cases) {
  const result = solver.solve(optionsFromCase(record));
  const validation = validateCase(record, result);
  if (!validation.accepted) {
    throw new Error(`${record.id} failed: ${JSON.stringify(validation)}`);
  }
  if (result.gradientCallbacks !== 0 || result.jacobianCallbacks !== 0) {
    throw new Error(`${record.id} unexpectedly requested derivatives`);
  }
  results.push({
    id: record.id,
    method: result.method,
    backend_status: result.backendStatus,
    backend_converged: result.backendConverged,
    value: result.value,
    objective: validation.objective,
    maximum_violation: validation.maximumViolation,
    evaluations: result.evaluations,
    callbacks: result.callbackCount,
    independently_accepted: !record.expect_infeasible,
    independently_rejected_as_infeasible: record.expect_infeasible === true,
  });
}
if (solver.inspect().liveAllocations !== 0 || solver.inspect().liveBytes !== 0) {
  throw new Error(`qualification leaked: ${JSON.stringify(solver.inspect())}`);
}
const resultBytes = Buffer.from(JSON.stringify(results));
const receipt = {
  schema: "sagejs.numerical-nlopt-qualification/v1",
  artifact_sha256: buildReport.artifact.sha256,
  source_revision: buildReport.source.revision,
  source_closure_sha256: buildReport.source_closure.sha256,
  corpus_sha256: sha256(corpusBytes),
  oracle_output_sha256: oracle.oracle_output_sha256,
  runtime: {
    engine: "node",
    version: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  methods: {
    "nlopt-nelder-mead": {
      cases: results.filter(({ method }) => method === "nlopt-nelder-mead").length,
      accepted: 5,
    },
    "nlopt-cobyla": {
      cases: results.filter(({ method }) => method === "nlopt-cobyla").length,
      accepted_feasible: 7,
      rejected_infeasible: 1,
    },
  },
  results_sha256: sha256(resultBytes),
  lifecycle_after: solver.inspect(),
  automatic_selection: false,
  results,
};
await writeFile(
  resolve(packageRoot, "build/qualification-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({
  schema: receipt.schema,
  artifact_sha256: receipt.artifact_sha256,
  source_closure_sha256: receipt.source_closure_sha256,
  corpus_sha256: receipt.corpus_sha256,
  results_sha256: receipt.results_sha256,
  runtime: receipt.runtime,
  methods: receipt.methods,
  lifecycle_after: receipt.lifecycle_after,
}, null, 2)}\n`);
