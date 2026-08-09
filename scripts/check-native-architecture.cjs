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
const KERNEL_MANIFEST = join(ROOT, "architecture", "native-kernels.json");

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
  };
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
  const kernels = validateKernelRegistry(readJson(KERNEL_MANIFEST));
  console.log(
    `Native architecture is classified: ${code.entries.length} native files, ` +
    `${code.auditRequired.length} requiring focused audit.`,
  );
  console.log(
    `Source-transparent compiler witness set is valid: ` +
    `${kernels.kernels.length} kernel families.`,
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
  validateKernelRegistry,
  validateNativeCode,
};
