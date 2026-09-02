#!/usr/bin/env node
"use strict";

const path = require("node:path");

const { readJson } = require("../common.cjs");
const { validateCorpus } = require("../contracts.cjs");
const { capabilityDraft } = require("./prepare-node.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const corpusPath = path.join(root, "bench/numerical-computing/qualification/product.corpus.json");
const specPath = path.join(root, "bench/numerical-computing/qualification/capabilities/node-capability-spec.json");
const browserMemoryCorpusPath = path.join(
  root, "bench/numerical-computing/qualification/browser-memory.corpus.json",
);
const browserMemorySpecPath = path.join(
  root, "bench/numerical-computing/qualification/capabilities/browser-memory-capability-spec.json",
);
const matrixDirectory = path.join(root, "bench/numerical-computing/qualification/matrix");

function validateTemplate(template, expectedRows, requiredCapabilities = null) {
  if (template.schema !== "sagejs.numerical-qualification-matrix-template/v1") {
    throw new Error("unexpected matrix template schema");
  }
  if (template.rows.length !== expectedRows) throw new Error(`expected ${expectedRows} matrix rows`);
  const rowIds = new Set(template.rows.map((row) => row.id));
  if (rowIds.size !== template.rows.length) throw new Error("duplicate matrix template row");
  for (const row of template.rows) {
    const expectedScope = row.subject.kind === "node" ? "collector_process" : "process_tree";
    if (row.required_memory_scope !== expectedScope) {
      throw new Error(
        `matrix row ${row.id} must require ${expectedScope} memory, got ` +
        `${row.required_memory_scope}`,
      );
    }
    const requiresEngine = ["browser", "worker"].includes(row.subject.kind);
    if (requiresEngine !== (typeof row.subject.engine === "string" && row.subject.engine.length > 0)) {
      throw new Error(`matrix row ${row.id} has invalid subject engine identity`);
    }
    if (row.subject.kind === "worker" && row.subject.engine !== "chromium") {
      throw new Error(`matrix worker row ${row.id} must be pinned to Chromium`);
    }
  }
  for (const phase of ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]) {
    if (!template.required_program_phases.includes(phase)) throw new Error(`matrix omits ${phase}`);
  }
  if (requiredCapabilities !== null) {
    const actual = [...template.required_capabilities].sort();
    const expected = [...requiredCapabilities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("matrix required capabilities do not equal the available campaign surface");
    }
  }
}

function validateSupplementalTemplate(template) {
  if (template.schema !== "sagejs.numerical-qualification-supplemental-template/v1") {
    throw new Error("unexpected supplemental evidence template schema");
  }
  const required = new Set([
    "cminpack-native-sanitizers",
    "nlopt-native-sanitizers",
    "numerical-wasm-destructive-faults",
    "browser-process-tree-memory",
    "startup-package-payload-closure",
  ]);
  for (const item of template.requirements) {
    if (!required.delete(item.id)) throw new Error(`unexpected supplemental requirement ${item.id}`);
    if (item.status !== "pending") {
      throw new Error(`checked-in supplemental requirement ${item.id} must remain pending`);
    }
    if (!Array.isArray(item.required_evidence) || item.required_evidence.length === 0) {
      throw new Error(`supplemental requirement ${item.id} lacks evidence types`);
    }
    if (typeof item.acceptance !== "string" || item.acceptance.length < 32) {
      throw new Error(`supplemental requirement ${item.id} lacks an acceptance contract`);
    }
  }
  if (required.size !== 0) {
    throw new Error(`missing supplemental requirements: ${[...required].join(", ")}`);
  }
}

function main() {
  const corpus = validateCorpus(readJson(corpusPath));
  const spec = readJson(specPath);
  const draft = capabilityDraft(spec, corpus);
  const available = draft.capabilities.filter((item) => item.status === "available");
  const unavailable = new Map(
    draft.capabilities.filter((item) => item.status === "unavailable").map((item) => [item.id, item]),
  );
  const covered = new Set(available.flatMap((item) => item.case_ids));
  for (const item of corpus.cases) {
    if (!covered.has(item.id)) throw new Error(`case ${item.id} lacks an available capability`);
  }
  for (const id of [
    "numerics.optimization.polynomial_least_squares",
    "numerics.ode.stiff_sparse",
  ]) {
    const capability = unavailable.get(id);
    if (capability === undefined || capability.case_ids.length !== 0 || !capability.reason) {
      throw new Error(`future capability ${id} does not fail closed`);
    }
  }
  const phases = new Set(corpus.cases.map((item) => item.program_phase));
  const layers = new Set(corpus.cases.map((item) => item.layer));
  if (phases.size !== 9 || layers.size !== 7) throw new Error("campaign lacks complete phase/layer coverage");
  const requiredCapabilities = available.map((item) => item.id);
  validateTemplate(
    readJson(path.join(matrixDirectory, "node-four-platform.template.json")),
    4,
    requiredCapabilities,
  );
  validateSupplementalTemplate(
    readJson(path.join(matrixDirectory, "supplemental-evidence.template.json")),
  );
  validateTemplate(
    readJson(path.join(matrixDirectory, "full-runtime.template.json")),
    16,
    requiredCapabilities,
  );
  const browserMemoryCorpus = validateCorpus(readJson(browserMemoryCorpusPath));
  const browserMemoryDraft = capabilityDraft(
    readJson(browserMemorySpecPath), browserMemoryCorpus,
    { kind: "browser", name: "playwright-browser", version: "validation-only", engine: "chromium" },
  );
  if (browserMemoryCorpus.cases.length !== 3 ||
      browserMemoryDraft.capabilities.length !== 1 ||
      browserMemoryDraft.capabilities[0].id !==
        "numerics.lifecycle.browser_process_tree_memory") {
    throw new Error("focused browser memory campaign is incomplete");
  }
  process.stdout.write(
    `Numerical qualification campaign valid: ${corpus.cases.length} cases, ` +
    `${available.length} available capabilities, ${unavailable.size} future fail-closed capabilities.\n`,
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main, validateSupplementalTemplate, validateTemplate };
