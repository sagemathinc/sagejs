#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} = require("node:fs");
const { extname, join, relative, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const CODE_MANIFEST = join(ROOT, "architecture", "native-code.json");
const AUDIT_MANIFEST = join(ROOT, "architecture", "native-audit.json");
const KERNEL_MANIFEST = join(ROOT, "architecture", "native-kernels.json");
const ffiDeclarations = require("../tools/ffi/declarations.cjs");
const ffiBoundaryAudit = require("../tools/ffi/boundary-audit.cjs");

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
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

function nativeFiles(root = ROOT, extensions = [".c", ".cc", ".cpp", ".h"]) {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0").filter(Boolean);
  const allowed = new Set(extensions);
  return tracked.filter((filename) => allowed.has(extname(filename))).sort();
}

function sourceFiles(directory, suffix = ".cjs") {
  const result = [];
  if (!existsSync(directory)) return result;
  for (const name of readdirSync(directory)) {
    const filename = join(directory, name);
    if (statSync(filename).isDirectory()) result.push(...sourceFiles(filename, suffix));
    else if (filename.endsWith(suffix)) result.push(filename);
  }
  return result.sort();
}

function validateNativeCode(manifest, options = {}) {
  const root = options.root || ROOT;
  if (manifest.schema_version !== 1) {
    throw new Error("unsupported native-code manifest schema");
  }
  if (manifest.policy?.default !== "reject-unclassified") {
    throw new Error("native-code policy must reject unclassified files");
  }
  const categories = new Set(manifest.policy.categories || []);
  const statuses = new Set(manifest.policy.review_statuses || []);
  const lanes = new Set(
    readJson(join(root, ".agents", "lanes.json")).lanes.map((lane) => lane.id),
  );
  const byPath = new Map();
  for (const entry of manifest.files || []) {
    const path = repositoryPath(entry.path, "native-code path");
    if (byPath.has(path)) throw new Error(`duplicate native-code entry: ${path}`);
    if (!categories.has(entry.category)) {
      throw new Error(`${path} has unknown native category ${entry.category}`);
    }
    if (!statuses.has(entry.review_status)) {
      throw new Error(`${path} has unknown review status ${entry.review_status}`);
    }
    if (!lanes.has(entry.lane)) {
      throw new Error(`${path} has unknown owner lane ${entry.lane}`);
    }
    if (typeof entry.rationale !== "string" || entry.rationale.trim().length < 20) {
      throw new Error(`${path} needs a substantive native-code rationale`);
    }
    if (entry.category === "generated-upstream" && entry.review_status !== "generated") {
      throw new Error(`${path} generated code must use generated review status`);
    }
    if (entry.category !== "generated-upstream" && entry.review_status === "generated") {
      throw new Error(`${path} may not use generated review status`);
    }
    if (!existsSync(join(root, path))) throw new Error(`native-code file is missing: ${path}`);
    byPath.set(path, entry);
  }
  const tracked = options.trackedFiles || nativeFiles(
    root,
    manifest.policy.tracked_extensions,
  );
  const missing = tracked.filter((path) => !byPath.has(path));
  const stale = [...byPath.keys()].filter((path) => !tracked.includes(path));
  if (missing.length) {
    throw new Error(`unclassified native files:\n  ${missing.join("\n  ")}`);
  }
  if (stale.length) {
    throw new Error(`native-code entries are not tracked files:\n  ${stale.join("\n  ")}`);
  }
  return {
    entries: [...byPath.values()],
    auditRequired: [...byPath.values()].filter(
      (entry) => entry.review_status === "audit-required",
    ),
    audited: [...byPath.values()].filter(
      (entry) => entry.review_status === "audited",
    ),
  };
}

function validateNativeAudit(manifest, code, options = {}) {
  const root = options.root || ROOT;
  if (manifest.schema_version !== 1) {
    throw new Error("unsupported native-audit manifest schema");
  }
  const decisions = new Set(manifest.policy?.decision_values || []);
  const priorities = new Set(manifest.policy?.priority_values || []);
  const requiredOracles = new Set(manifest.policy?.required_oracles || []);
  const nativeByPath = new Map(code.entries.map((entry) => [entry.path, entry]));
  const byPath = new Map();
  for (const entry of manifest.files || []) {
    const path = repositoryPath(entry.path, "native-audit path");
    if (byPath.has(path)) throw new Error(`duplicate native-audit entry: ${path}`);
    const native = nativeByPath.get(path);
    if (native === undefined) {
      throw new Error(`${path} is audited but has no native-code classification`);
    }
    if (native.review_status !== "audited") {
      throw new Error(`${path} has an audit but review status is ${native.review_status}`);
    }
    if (!decisions.has(entry.decision)) {
      throw new Error(`${path} has unknown audit decision ${entry.decision}`);
    }
    if (!priorities.has(entry.priority)) {
      throw new Error(`${path} has unknown audit priority ${entry.priority}`);
    }
    if (!Array.isArray(entry.responsibilities) ||
        entry.responsibilities.length < 2 ||
        entry.responsibilities.some((value) =>
          typeof value !== "string" || value.trim().length < 10
        )) {
      throw new Error(`${path} needs at least two substantive responsibilities`);
    }
    for (const field of ["rationale", "fallback", "next"]) {
      if (typeof entry[field] !== "string" || entry[field].trim().length < 40) {
        throw new Error(`${path} needs a substantive audit ${field}`);
      }
    }
    const oracles = new Set(entry.oracles || []);
    for (const oracle of requiredOracles) {
      if (!oracles.has(oracle)) throw new Error(`${path} audit is missing ${oracle} oracle`);
    }
    const filename = join(root, path);
    const source = readFileSync(filename);
    const actualLines = source.toString("utf8").match(/\n/g)?.length || 0;
    if (entry.lines !== actualLines || entry.bytes !== source.length) {
      throw new Error(
        `${path} audit metrics are stale: expected ${actualLines} lines/` +
          `${source.length} bytes, got ${entry.lines}/${entry.bytes}`,
      );
    }
    if (entry.pilot !== undefined) {
      const pilot = repositoryPath(entry.pilot, `${path}.pilot`);
      if (!existsSync(join(root, pilot))) throw new Error(`${path} pilot is missing: ${pilot}`);
    }
    byPath.set(path, entry);
  }
  const missing = code.audited
    .map((entry) => entry.path)
    .filter((path) => !byPath.has(path));
  const unresolved = code.auditRequired.map((entry) => entry.path);
  if (missing.length) {
    throw new Error(`audited native files lack audit records:\n  ${missing.join("\n  ")}`);
  }
  if (unresolved.length) {
    throw new Error(`native architecture audit remains unresolved:\n  ${unresolved.join("\n  ")}`);
  }
  return { entries: [...byPath.values()] };
}

function validateKernelRegistry(manifest, options = {}) {
  const root = options.root || ROOT;
  if (manifest.schema_version !== 1) {
    throw new Error("unsupported native-kernel registry schema");
  }
  if (manifest.policy?.implementation !== "source-transparent-typed-python") {
    throw new Error("native kernels must use source-transparent typed Python");
  }
  if (manifest.policy?.fallback !== "same-source") {
    throw new Error("native-kernel policy must require a same-source fallback");
  }
  if (manifest.policy?.host_isolation !== "mandatory-after-marshalling") {
    throw new Error(
      "native-kernel policy must prohibit host callbacks after marshalling",
    );
  }
  const requiredIntrospection = new Set(
    manifest.policy.required_introspection || [],
  );
  for (const command of ["explain", "ir", "emit-c", "emit-core-c", "emit-header"]) {
    if (!requiredIntrospection.has(command)) {
      throw new Error(`native-kernel policy is missing ${command} introspection`);
    }
  }
  const isolationStatuses = new Set(
    manifest.policy.host_isolation_statuses || [],
  );
  if (
    isolationStatuses.size !== 1 ||
    !isolationStatuses.has("certified")
  ) {
    throw new Error(
      "every accepted native-kernel witness must be host-isolation certified",
    );
  }
  const packages = readJson(join(root, "package.json"));
  const requiredOracles = new Set(manifest.policy.required_oracles || []);
  const compilerSources = sourceFiles(join(root, "tools", "native-kernel"));
  const ids = new Set();
  for (const kernel of manifest.kernels || []) {
    if (!/^[a-z][a-z0-9-]*$/.test(kernel.id || "")) {
      throw new Error(`invalid native-kernel id ${JSON.stringify(kernel.id)}`);
    }
    if (ids.has(kernel.id)) throw new Error(`duplicate native-kernel id ${kernel.id}`);
    ids.add(kernel.id);
    const sourcePath = repositoryPath(kernel.source, `${kernel.id}.source`);
    const filename = join(root, sourcePath);
    if (!existsSync(filename)) throw new Error(`${kernel.id} source is missing: ${sourcePath}`);
    if (kernel.fallback !== "same-source") {
      throw new Error(`${kernel.id} must retain a same-source fallback`);
    }
    if (!isolationStatuses.has(kernel.host_isolation)) {
      throw new Error(
        `${kernel.id} has invalid host-isolation status ${kernel.host_isolation}`,
      );
    }
    if (kernel.host_isolation !== "certified") {
      throw new Error(`${kernel.id} is not host-isolation certified`);
    }
    if (!Array.isArray(kernel.functions) || kernel.functions.length === 0) {
      throw new Error(`${kernel.id} must list compiled functions`);
    }
    const oracles = new Set(kernel.oracles || []);
    for (const oracle of requiredOracles) {
      if (!oracles.has(oracle)) throw new Error(`${kernel.id} is missing ${oracle} oracle`);
    }
    if (typeof kernel.semantic_domain !== "string" || kernel.semantic_domain.length < 20) {
      throw new Error(`${kernel.id} needs a semantic-domain description`);
    }
    if (!packages.scripts?.[kernel.benchmark]) {
      throw new Error(`${kernel.id} references unknown benchmark ${kernel.benchmark}`);
    }
    const source = readFileSync(filename, "utf8");
    for (const name of kernel.functions) {
      const definition = new RegExp(
        `@native\\s*(?:\\r?\\n)+def\\s+${name}\\s*\\(`,
      );
      if (!definition.test(source)) {
        throw new Error(`${kernel.id} does not contain @native function ${name}`);
      }
      const token = new RegExp(`\\b${name}\\b`);
      for (const compilerSource of compilerSources) {
        if (token.test(readFileSync(compilerSource, "utf8"))) {
          throw new Error(
            `${kernel.id} function ${name} appears in compiler source ` +
            `${relative(root, compilerSource)}; name-based substitution is prohibited`,
          );
        }
      }
    }
    const platforms = new Set(kernel.platforms || []);
    for (const platform of [
      "linux-x64", "linux-arm64", "windows-x64", "macos-arm64",
    ]) {
      if (!platforms.has(platform)) {
        throw new Error(`${kernel.id} is missing platform ${platform}`);
      }
    }
  }
  if (ids.size < 3) throw new Error("native-kernel registry needs at least three witnesses");
  return { kernels: manifest.kernels };
}

function run() {
  const code = validateNativeCode(readJson(CODE_MANIFEST));
  const audit = validateNativeAudit(readJson(AUDIT_MANIFEST), code);
  const kernels = validateKernelRegistry(readJson(KERNEL_MANIFEST));
  const ffi = ffiDeclarations.loadRegistry({ root: ROOT });
  const boundaries = ffiBoundaryAudit.validateBoundarySnapshot(
    readJson(ffiBoundaryAudit.snapshotPath(ROOT)), { root: ROOT },
  );
  const generatedFfiModules = new Set();
  for (const declaration of ffi.libraries) {
    for (const generated of
      ffiDeclarations.generatedModulePaths(ROOT, declaration)) {
      generatedFfiModules.add(resolve(generated));
      if (!existsSync(generated) ||
          readFileSync(generated, "utf8") !==
            ffiDeclarations.generatePythonModule(declaration)) {
        throw new Error(
          `generated FFI module is missing or stale: ${relative(ROOT, generated)}`,
        );
      }
    }
  }
  for (const filename of sourceFiles(join(ROOT, "src"), ".py")) {
    if (
      readFileSync(filename, "utf8").includes("_runtime.ffi_call(") &&
      !generatedFfiModules.has(resolve(filename))
    ) {
      throw new Error(
        `raw dynamic FFI call outside a generated safe module: ` +
        `${relative(ROOT, filename)}`,
      );
    }
  }
  console.log(
    `Native architecture is classified: ${code.entries.length} native files, ` +
    `${audit.entries.length} with completed focused audits.`,
  );
  console.log(
    `Source-transparent compiler witness set is valid: ` +
    `${kernels.kernels.length} kernel families.`,
  );
  console.log(
    `Explicit FFI registry is valid: ${ffi.libraries.length} libraries, ` +
    `${ffi.libraries.reduce((sum, item) => sum + item.functions.length, 0)} functions.`,
  );
  console.log(
    `Native boundary ratchet is current: ${boundaries.boundaries.length} ` +
    `classified files and exported interfaces.`,
  );
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  nativeFiles,
  validateNativeAudit,
  validateKernelRegistry,
  validateNativeCode,
};
