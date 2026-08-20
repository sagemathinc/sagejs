#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { createBoundarySnapshot } = require("../tools/ffi/boundary-audit.cjs");
const { loadRegistry } = require("../tools/ffi/declarations.cjs");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "architecture", "wasm-capabilities.json");
const REPORT_PATH = path.join(
  ROOT,
  "architecture",
  "wasm-capabilities-report.json",
);

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function repositoryPath(value, label) {
  if (
    typeof value !== "string" || value.length === 0 ||
    value.startsWith("/") || value.includes("\\") ||
    value.split("/").includes("..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return value;
}

function productionClosure(root = ROOT) {
  const trackedManifest = path.join(
    root,
    "packages",
    "flint-wasm",
    "release",
    "production-capabilities.json",
  );
  if (fs.existsSync(trackedManifest)) {
    const document = readJson(trackedManifest);
    if (document.schema !== "sagejs.wasm-production-capabilities/v1") {
      throw new Error("tracked Wasm production closure has an unsupported schema");
    }
    const ids = (document.capabilities || []).map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error("tracked Wasm production closure contains duplicate capabilities");
    }
    return new Set(ids);
  }
  const filename = path.join(root, "packages", "flint-wasm", "scripts", "build.cjs");
  const source = fs.readFileSync(filename, "utf8");
  const adapters = [...source.matchAll(
    /const\s+(\w+Adapter)\s*=\s*generatedWasmResourceAdapter\(\s*(\w+Declaration),\s*\{([\s\S]*?)\n\}\);/g,
  )];
  const libraryByVariable = new Map([
    ["flintDeclaration", "flint"],
    ["m4riDeclaration", "m4ri"],
  ]);
  const result = new Set();
  for (const match of adapters) {
    const library = libraryByVariable.get(match[2]);
    if (library === undefined) continue;
    for (const [kind, prefix] of [["resourceIds", "ffi-resource"], ["functionIds", "ffi"]]) {
      const array = match[3].match(new RegExp(`${kind}:\\s*\\[([\\s\\S]*?)\\]`));
      if (array === null) continue;
      for (const item of array[1].matchAll(/"([a-z0-9_]+)"/g)) {
        result.add(`${prefix}:${library}:${item[1]}`);
      }
    }
  }
  return result;
}

function productionManifestClosure(policy, root = ROOT) {
  const result = new Set();
  for (const entry of policy.production_manifests || []) {
    const relative = repositoryPath(entry.path, "production manifest path");
    const document = readJson(path.join(root, relative));
    if (document.schema !== "sagejs.wasm-production-capabilities/v1") {
      throw new Error(`${relative} has an unsupported production capability schema`);
    }
    for (const capability of document.capabilities || []) {
      if (typeof capability.id !== "string" || capability.id.length === 0) {
        throw new Error(`${relative} contains an invalid production capability id`);
      }
      if (result.has(capability.id)) {
        throw new Error(`duplicate production capability receipt ${capability.id}`);
      }
      result.add(capability.id);
    }
  }
  return result;
}

function discoverCapabilities(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const boundary = createBoundarySnapshot({ root });
  const registry = loadRegistry({ root });
  const kernels = readJson(path.join(root, "architecture", "native-kernels.json"));
  const nativeExports = readJson(path.join(root, "architecture", "native-exports.json"));
  const exportById = new Map(nativeExports.exports.map((item) => [item.id, item]));
  const registryFunctions = new Map();
  const registryResources = new Map();
  for (const library of registry.libraries) {
    for (const fn of library.functions) registryFunctions.set(`ffi:${library.library.id}:${fn.id}`, fn);
    for (const resource of library.resources) {
      registryResources.set(`ffi-resource:${library.library.id}:${resource.id}`, resource);
    }
  }
  const discovered = [];
  for (const item of boundary.boundaries) {
    if (item.kind === "napi-export") {
      const audit = exportById.get(item.id);
      if (audit === undefined) throw new Error(`N-API export lacks native audit: ${item.id}`);
      discovered.push({
        id: item.id,
        kind: "napi-export",
        family: audit.family,
        source: audit.implementation.path,
        package: item.package,
        export: item.export,
      });
    } else if (item.kind === "declared-ffi") {
      const declaration = registryFunctions.get(item.id);
      if (declaration === undefined) throw new Error(`missing FFI declaration ${item.id}`);
      discovered.push({
        id: item.id,
        kind: "declared-ffi-function",
        family: item.library,
        source: item.path,
        wasm_declared: declaration.targets.wasm,
      });
    } else if (item.kind === "declared-ffi-resource") {
      const declaration = registryResources.get(item.id);
      if (declaration === undefined) throw new Error(`missing FFI resource ${item.id}`);
      discovered.push({
        id: item.id,
        kind: "declared-ffi-resource",
        family: item.library,
        source: item.path,
        wasm_declared: declaration.targets.wasm,
      });
    } else if (item.kind === "runtime-intrinsic") {
      discovered.push({
        id: item.id,
        kind: "runtime-intrinsic",
        family: "runtime",
        source: item.path,
        symbol: item.symbol,
      });
    }
  }
  for (const kernel of kernels.kernels) {
    discovered.push({
      id: `kernel:${kernel.id}`,
      kind: "production-kernel",
      family: kernel.id.replace(/-(production|optional|witness)$/, ""),
      source: kernel.source,
    });
  }
  return discovered.sort((left, right) => left.id.localeCompare(right.id));
}

function validateManifest(manifest, options = {}) {
  const root = path.resolve(options.root || ROOT);
  if (manifest.schema !== "sagejs.wasm-capabilities/v1") {
    throw new Error("unsupported WebAssembly capability manifest schema");
  }
  if (manifest.policy?.default !== "reject-unclassified") {
    throw new Error("WebAssembly capabilities must reject unclassified boundaries");
  }
  const allowedKinds = new Set(manifest.policy.kinds || []);
  const allowedDispositions = new Set(manifest.policy.dispositions || []);
  const allowedStatuses = new Set(manifest.policy.statuses || []);
  const evidence = manifest.policy.test_evidence || {};
  for (const [id, record] of Object.entries(evidence)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`invalid test evidence id ${id}`);
    if (typeof record.differential !== "boolean") {
      throw new Error(`${id} test evidence must state whether it is differential`);
    }
    for (const item of record.paths || []) {
      const relative = repositoryPath(item, `${id}.paths`);
      if (!fs.existsSync(path.join(root, relative))) {
        throw new Error(`${id} test evidence is missing: ${relative}`);
      }
    }
  }
  const discovered = discoverCapabilities({ root });
  const specialists = manifest.policy.specialist_capabilities || [];
  const expected = [
    ...discovered,
    ...specialists.map((item) => ({
      id: item.id,
      kind: "specialist-capability",
      family: item.family,
      source: item.source,
    })),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const expectedById = new Map(expected.map((item) => [item.id, item]));
  const actualById = new Map();
  for (const capability of manifest.capabilities || []) {
    if (actualById.has(capability.id)) {
      throw new Error(`duplicate WebAssembly capability ${capability.id}`);
    }
    actualById.set(capability.id, capability);
  }
  const missing = expected.filter((item) => !actualById.has(item.id));
  const stale = [...actualById.keys()].filter((id) => !expectedById.has(id));
  if (missing.length) {
    throw new Error(`unclassified WebAssembly capabilities:\n  ${missing.map((item) => item.id).join("\n  ")}`);
  }
  if (stale.length) {
    throw new Error(`stale WebAssembly capabilities:\n  ${stale.join("\n  ")}`);
  }
  const closure = productionClosure(root);
  const manifestClosure = productionManifestClosure(manifest.policy, root);
  const unknownClosure = [...closure].filter((id) => {
    const capability = actualById.get(id);
    return capability === undefined ||
      !["declared-ffi-function", "declared-ffi-resource"].includes(capability.kind);
  });
  if (unknownClosure.length) {
    throw new Error(`generated Wasm closure has unknown capabilities: ${unknownClosure.join(", ")}`);
  }
  const unknownReceipts = [...manifestClosure].filter((id) => !actualById.has(id));
  if (unknownReceipts.length) {
    throw new Error(`production manifests have unknown capabilities: ${unknownReceipts.join(", ")}`);
  }
  for (const [id, capability] of actualById) {
    const fact = expectedById.get(id);
    if (!allowedKinds.has(capability.kind) || capability.kind !== fact.kind) {
      throw new Error(`${id} has invalid capability kind ${capability.kind}`);
    }
    if (capability.family !== fact.family || capability.source !== fact.source) {
      throw new Error(`${id} discovery metadata has drifted`);
    }
    const sourcePath = repositoryPath(capability.source, `${id}.source`);
    if (!fs.existsSync(path.join(root, sourcePath))) {
      throw new Error(`${id} source is missing: ${sourcePath}`);
    }
    if (!allowedDispositions.has(capability.disposition)) {
      throw new Error(`${id} has invalid WebAssembly disposition ${capability.disposition}`);
    }
    if (!allowedStatuses.has(capability.status)) {
      throw new Error(`${id} has invalid WebAssembly status ${capability.status}`);
    }
    if (typeof capability.fallback !== "string" || capability.fallback.length < 8) {
      throw new Error(`${id} needs an explicit fallback or capability-error policy`);
    }
    if (typeof capability.wasm_module !== "string" || capability.wasm_module.length < 2) {
      throw new Error(`${id} needs a WebAssembly ownership module`);
    }
    for (const field of ["public_consumers", "tests"]) {
      if (!Array.isArray(capability[field]) || capability[field].length === 0) {
        throw new Error(`${id} must list ${field}`);
      }
      if (capability[field].some((value) =>
        typeof value !== "string" || value.length === 0
      )) {
        throw new Error(`${id} has invalid ${field}`);
      }
    }
    for (const test of capability.tests) {
      if (evidence[test] === undefined) throw new Error(`${id} cites unknown test evidence ${test}`);
    }
    if (typeof capability.review_note !== "string" || capability.review_note.length < 24) {
      throw new Error(`${id} needs a substantive human review note`);
    }
    if (typeof capability.public_explanation !== "string" ||
        capability.public_explanation.length < 24) {
      throw new Error(`${id} needs a substantive public capability explanation`);
    }
    if (capability.reviewed !== true) throw new Error(`${id} is not reviewed`);
    if (capability.disposition === "portable-fallback" &&
        !capability.tests.some((test) => evidence[test].differential)) {
      throw new Error(`${id} portable fallback lacks differential test evidence`);
    }
    if (capability.disposition === "desktop-only" &&
        capability.fallback === "unavailable" &&
        typeof capability.capability_error !== "string") {
      throw new Error(`${id} desktop-only capability lacks fallback or explicit error`);
    }
    if (capability.disposition === "shared-core") {
      const core = repositoryPath(capability.shared_core || "", `${id}.shared_core`);
      const text = fs.readFileSync(path.join(root, core), "utf8");
      if (/\bnapi_(?:env|value|status|callback_info)\b|#\s*include\s*<node_api\.h>/.test(text)) {
        throw new Error(`${id} purported shared core contains Node-API symbols`);
      }
    }
    if (["compiled-source", "shared-core"].includes(capability.disposition)) {
      if ((capability.status === "available") !== manifestClosure.has(id)) {
        throw new Error(`${id} production capability receipt and availability status disagree`);
      }
    } else if (manifestClosure.has(id) && capability.status !== "available") {
      throw new Error(`${id} is in a production manifest but is not marked available`);
    }
    if (capability.kind === "specialist-capability" && capability.status === "available") {
      const evidencePath = repositoryPath(
        capability.availability_evidence?.path || "",
        `${id}.availability_evidence.path`,
      );
      if (!fs.existsSync(path.join(root, evidencePath))) {
        throw new Error(`${id} availability evidence is missing: ${evidencePath}`);
      }
    }
    if (fact.wasm_declared !== undefined) {
      if (capability.wasm_declared !== fact.wasm_declared) {
        throw new Error(`${id} declared Wasm target has drifted`);
      }
      const closureStatus = capability.wasm_closure?.status;
      if (fact.wasm_declared && !["included", "planned", "excluded"].includes(closureStatus)) {
        throw new Error(`${id} is Wasm-capable but lacks a production-closure decision`);
      }
      if (fact.wasm_declared && closureStatus !== "included" &&
          (capability.wasm_closure?.explanation || "").length < 24) {
        throw new Error(`${id} is omitted from the Wasm closure without explanation`);
      }
      if ((closureStatus === "included") !== closure.has(id)) {
        throw new Error(`${id} production Wasm closure status has drifted`);
      }
    }
  }
  for (const modulePath of manifest.policy.browser_entry_modules || []) {
    const relative = repositoryPath(modulePath, "browser entry module");
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    if (/(?:from\s*|require\s*\()\s*["']@sagemath\/sagejs-(?:flint|fflas|graph|m4ri)["']/.test(source)) {
      throw new Error(`${relative} imports a native host package at module initialization`);
    }
  }
  return {
    capabilities: [...actualById.values()],
    discovered,
    closure,
    manifestClosure,
  };
}

function countBy(items, field) {
  return Object.fromEntries([...new Set(items.map((item) => item[field]))]
    .sort().map((value) => [value, items.filter((item) => item[field] === value).length]));
}

function publicReport(manifest) {
  const capabilities = [...manifest.capabilities].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  return {
    schema: "sagejs.wasm-capability-report/v1",
    source: "architecture/wasm-capabilities.json",
    source_sha256: crypto.createHash("sha256").update(manifestText).digest("hex"),
    counts: {
      total: capabilities.length,
      by_kind: countBy(capabilities, "kind"),
      by_disposition: countBy(capabilities, "disposition"),
      by_status: countBy(capabilities, "status"),
    },
    capabilities: capabilities.map((item) => ({
      id: item.id,
      family: item.family,
      disposition: item.disposition,
      status: item.status,
      fallback: item.fallback,
      wasm_module: item.wasm_module,
      public_consumers: item.public_consumers,
      explanation: item.public_explanation,
      ...(item.resource_limits === undefined ? {} : { resource_limits: item.resource_limits }),
    })),
  };
}

function validateReport(report, manifest) {
  const expected = publicReport(manifest);
  if (`${JSON.stringify(report, null, 2)}\n` !== `${JSON.stringify(expected, null, 2)}\n`) {
    throw new Error("public WebAssembly capability report is stale; run checker with --write-report");
  }
  return expected;
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  const result = validateManifest(manifest);
  const report = publicReport(manifest);
  if (process.argv.includes("--write-report")) {
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  } else {
    validateReport(readJson(REPORT_PATH), manifest);
  }
  console.log(
    `WebAssembly capability audit passed (${result.capabilities.length} reviewed capabilities; ` +
      `${result.closure.size} generated production-closure entries).`,
  );
}

if (require.main === module) main();

module.exports = {
  discoverCapabilities,
  productionClosure,
  productionManifestClosure,
  publicReport,
  repositoryPath,
  validateManifest,
  validateReport,
};
