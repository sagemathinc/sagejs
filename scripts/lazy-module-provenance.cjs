"use strict";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { relative, resolve, sep } = require("node:path");

const LAZY_MODULE_BUNDLE_SCHEMA = "sagejs.lazy-module-bundle/v2";
const LAZY_MODULE_VIRTUAL_ROOT = "/__sagejs_lazy_modules__";
const PRECOMPILED_MODULE_FILENAME =
  `${LAZY_MODULE_VIRTUAL_ROOT}/__SAGEJS_MODULE_FILENAME__`;
const PRECOMPILED_PACKAGE_PATH =
  `${LAZY_MODULE_VIRTUAL_ROOT}/__SAGEJS_PACKAGE_PATH__`;
const MODULE_NAME_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const RESERVED_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
const SHA1_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

function validLazyModuleName(name) {
  return typeof name === "string" && MODULE_NAME_PATTERN.test(name) &&
    name.split(".").every((segment) => !RESERVED_SEGMENTS.has(segment));
}

function assertLazyModuleName(name, description = "lazy module") {
  if (!validLazyModuleName(name)) {
    throw new TypeError(`invalid ${description} name ${JSON.stringify(name)}`);
  }
  return name;
}

function canonicalModuleFilename(name, isPackage) {
  assertLazyModuleName(name);
  const stem = name.replaceAll(".", "/");
  return isPackage
    ? `${LAZY_MODULE_VIRTUAL_ROOT}/${stem}/__init__.py`
    : `${LAZY_MODULE_VIRTUAL_ROOT}/${stem}.py`;
}

function canonicalPackagePath(name, isPackage) {
  return isPackage
    ? `${LAZY_MODULE_VIRTUAL_ROOT}/${assertLazyModuleName(name).replaceAll(".", "/")}`
    : null;
}

function normalizedPath(value) {
  return value.replaceAll("\\", "/");
}

function canonicalizeJavascriptTemplate({
  name,
  sourceFilename,
  javascript,
  repositoryRoot,
}) {
  assertLazyModuleName(name);
  if (typeof sourceFilename !== "string" || typeof javascript !== "string") {
    throw new TypeError(`invalid compiled lazy module ${name}`);
  }
  const filename = normalizedPath(sourceFilename);
  const isPackage = filename.endsWith("/__init__.py");
  const filenameLiteral = JSON.stringify(sourceFilename);
  if (!javascript.includes(filenameLiteral)) {
    throw new Error(`compiled module ${name} does not contain its filename`);
  }
  let template = javascript.replaceAll(
    filenameLiteral,
    JSON.stringify(PRECOMPILED_MODULE_FILENAME),
  );
  if (isPackage) {
    const packageDirectory = filename.slice(0, -"/__init__.py".length);
    const directoryLiteral = JSON.stringify(packageDirectory);
    if (!template.includes(directoryLiteral)) {
      throw new Error(`compiled package ${name} does not contain its __path__`);
    }
    template = template.replaceAll(
      directoryLiteral,
      JSON.stringify(PRECOMPILED_PACKAGE_PATH),
    );
  }
  if (template.includes(sourceFilename) || template.includes(filename)) {
    throw new Error(`compiled module ${name} retained its source path`);
  }
  if (repositoryRoot) {
    const checkout = normalizedPath(resolve(repositoryRoot));
    if (template.includes(checkout)) {
      throw new Error(`compiled module ${name} retained its checkout path`);
    }
  }
  return {
    javascriptTemplate: template,
    package: isPackage,
    filename: canonicalModuleFilename(name, isPackage),
    packagePath: canonicalPackagePath(name, isPackage),
  };
}

function safeRelativePath(repositoryRoot, filename, description) {
  const value = relative(resolve(repositoryRoot), resolve(filename))
    .split(sep)
    .join("/");
  if (!value || value === ".." || value.startsWith("../") ||
      value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`${description} escapes the repository`);
  }
  return value;
}

function validSourceForModule(name, source, isPackage) {
  const stem = name.replaceAll(".", "/");
  return source === (isPackage ? `${stem}/__init__.py` : `${stem}.py`);
}

function validateProvenanceFile(record, expectedPath, repositoryRoot) {
  if (!hasExactKeys(record, ["path", "sha256"]) ||
      record.path !== expectedPath || !SHA256_PATTERN.test(record.sha256)) {
    throw new Error(`invalid lazy-module provenance for ${expectedPath}`);
  }
  if (repositoryRoot) {
    const contents = readFileSync(resolve(repositoryRoot, record.path));
    if (sha256(contents) !== record.sha256) {
      throw new Error(`stale lazy-module provenance for ${expectedPath}`);
    }
  }
}

function validateLazyModuleBundle(bundle, { repositoryRoot } = {}) {
  if (!hasExactKeys(bundle, [
    "schema", "generator", "config", "roots", "modules",
  ]) || bundle.schema !== LAZY_MODULE_BUNDLE_SCHEMA) {
    throw new Error("invalid lazy-module bundle schema");
  }
  validateProvenanceFile(
    bundle.generator,
    "scripts/build-lazy-module-cache.cjs",
    repositoryRoot,
  );
  validateProvenanceFile(
    bundle.config,
    "scripts/precompiled-python-packages.json",
    repositoryRoot,
  );
  if (!hasExactKeys(bundle.roots, ["package", "taskRuntime"]) ||
      !Array.isArray(bundle.roots.package) ||
      !Array.isArray(bundle.roots.taskRuntime) ||
      !isPlainRecord(bundle.modules)) {
    throw new Error("invalid lazy-module bundle roots or modules");
  }
  const names = Object.keys(bundle.modules);
  if (JSON.stringify(names) !== JSON.stringify([...names].sort())) {
    throw new Error("lazy-module bundle records are not canonically ordered");
  }
  const roots = [...bundle.roots.package, ...bundle.roots.taskRuntime];
  for (const list of [bundle.roots.package, bundle.roots.taskRuntime]) {
    if (JSON.stringify(list) !== JSON.stringify([...new Set(list)].sort()) ||
        list.some((name) => !validLazyModuleName(name))) {
      throw new Error("invalid lazy-module bundle root list");
    }
  }
  for (const root of roots) {
    if (!Object.hasOwn(bundle.modules, root)) {
      throw new Error(`lazy-module root has no record: ${root}`);
    }
  }
  for (const [name, record] of Object.entries(bundle.modules)) {
    assertLazyModuleName(name);
    if (!hasExactKeys(record, [
      "resource", "resourceSha256", "source", "sourceSha256", "signature",
      "version", "mode", "package", "filename", "packagePath",
      "dependencies", "javascriptTemplate",
    ]) || record.resource !== `${name.replaceAll(".", "-")}.json` ||
        !SHA256_PATTERN.test(record.resourceSha256) ||
        !SHA256_PATTERN.test(record.sourceSha256) ||
        !SHA1_PATTERN.test(record.signature) ||
        typeof record.version !== "string" || record.mode !== "python" ||
        typeof record.package !== "boolean" ||
        !Array.isArray(record.dependencies) ||
        record.dependencies.some((dependency) => !validLazyModuleName(dependency)) ||
        new Set(record.dependencies).size !== record.dependencies.length ||
        typeof record.javascriptTemplate !== "string" ||
        !validSourceForModule(name, record.source, record.package) ||
        record.filename !== canonicalModuleFilename(name, record.package) ||
        record.packagePath !== canonicalPackagePath(name, record.package) ||
        !record.javascriptTemplate.includes(
          JSON.stringify(PRECOMPILED_MODULE_FILENAME),
        ) || (record.package
          ? !record.javascriptTemplate.includes(
            JSON.stringify(PRECOMPILED_PACKAGE_PATH),
          )
          : record.javascriptTemplate.includes(
            JSON.stringify(PRECOMPILED_PACKAGE_PATH),
          ))) {
      throw new Error(`invalid lazy-module bundle record ${name}`);
    }
    if (repositoryRoot) {
      const source = readFileSync(resolve(repositoryRoot, "src/lib", record.source));
      if (sha256(source) !== record.sourceSha256) {
        throw new Error(`stale lazy-module source ${name}`);
      }
    }
  }
  return bundle;
}

function provenanceRecord(repositoryRoot, filename) {
  const path = safeRelativePath(
    repositoryRoot,
    filename,
    "lazy-module provenance input",
  );
  return { path, sha256: sha256(readFileSync(filename)) };
}

function lazyModuleReceiptInputs(repositoryRoot, bundle) {
  validateLazyModuleBundle(bundle, { repositoryRoot });
  const paths = [
    bundle.generator.path,
    bundle.config.path,
    ...Object.values(bundle.modules).map(({ source }) => `src/lib/${source}`),
  ];
  return [...new Set(paths)].sort().map((name) => resolve(repositoryRoot, name));
}

module.exports = {
  LAZY_MODULE_BUNDLE_SCHEMA,
  LAZY_MODULE_VIRTUAL_ROOT,
  PRECOMPILED_MODULE_FILENAME,
  PRECOMPILED_PACKAGE_PATH,
  assertLazyModuleName,
  canonicalModuleFilename,
  canonicalPackagePath,
  canonicalizeJavascriptTemplate,
  lazyModuleReceiptInputs,
  provenanceRecord,
  sha256,
  validLazyModuleName,
  validateLazyModuleBundle,
};
