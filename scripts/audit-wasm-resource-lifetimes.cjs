#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = process.env.SAGEJS_RESOURCE_AUDIT_MANIFEST === undefined
  ? path.join(root, "architecture/wasm-resource-lifetimes.json")
  : path.resolve(process.env.SAGEJS_RESOURCE_AUDIT_MANIFEST);
const declarationRoot = process.env.SAGEJS_RESOURCE_AUDIT_DECLARATION_ROOT === undefined
  ? root
  : path.resolve(process.env.SAGEJS_RESOURCE_AUDIT_DECLARATION_ROOT);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const failures = [];

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function requireFile(file, description) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    failures.push(`${description} does not exist: ${file}`);
    return undefined;
  }
  return fs.readFileSync(absolute, "utf8");
}

if (manifest.schema_version !== 1) {
  failures.push("resource lifetime manifest must use schema_version 1");
}

const declared = new Set();
const declarationDirectory = path.join(declarationRoot, "ffi");
const declarationFiles = fs.readdirSync(declarationDirectory)
  .filter((file) => file.endsWith(".ffi.json"))
  .sort()
  .map((file) => `ffi/${file}`);
for (const file of declarationFiles) {
  const declarationPath = path.join(declarationRoot, file);
  if (!fs.existsSync(declarationPath)) {
    failures.push(`FFI declaration does not exist: ${declarationPath}`);
    continue;
  }
  const declaration = JSON.parse(fs.readFileSync(declarationPath, "utf8"));
  const library = declaration.library.id ?? declaration.library.name ?? declaration.library;
  for (const resource of declaration.resources ?? []) {
    if (resource.ownership === "owned") declared.add(`${library}:${resource.id}`);
  }
}

const reviewed = new Set();
const validPolicies = new Set([
  "bounded-exact-spill",
  "bounded-context-with-child-spill",
  "copy-and-close",
  "desktop-operation-scoped-close",
  "desktop-owner-scoped-close",
  "operation-scoped-close",
  "public-reactor-copy-or-explicit-scope",
]);
for (const record of manifest.owned_resource_families ?? []) {
  const key = `${record.library}:${record.id}`;
  if (reviewed.has(key)) failures.push(`duplicate owned resource review: ${key}`);
  reviewed.add(key);
  if (!validPolicies.has(record.policy)) failures.push(`unknown policy for ${key}: ${record.policy}`);
  requireFile(record.evidence, `evidence for ${key}`);
}
for (const key of declared) {
  if (!reviewed.has(key)) failures.push(`owned resource family is not reviewed: ${key}`);
}
for (const key of reviewed) {
  if (!declared.has(key)) failures.push(`stale owned resource family review: ${key}`);
}

const ignoredParts = new Set([".git", ".native", ".sagejs-native-kernels", "build", "dist", "node_modules", "test"]);
const extensions = new Set([".cjs", ".js", ".mjs", ".py"]);
const actualFinalizers = new Map();
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;
    const source = fs.readFileSync(absolute, "utf8");
    const count = source.match(/new\s+FinalizationRegistry\s*\(/g)?.length ?? 0;
    if (count !== 0) actualFinalizers.set(relative(absolute), count);
  }
}
for (const directory of ["packages", "scripts", "src", "tools"]) {
  walk(path.join(root, directory));
}

const reviewedFinalizers = new Map();
for (const record of manifest.direct_finalizer_sites ?? []) {
  if (reviewedFinalizers.has(record.path)) failures.push(`duplicate finalizer review: ${record.path}`);
  reviewedFinalizers.set(record.path, record.count);
  requireFile(record.path, "finalizer review source");
  if (typeof record.policy !== "string" || record.policy.length < 20) {
    failures.push(`finalizer review lacks a substantive policy: ${record.path}`);
  }
}
for (const [file, count] of actualFinalizers) {
  if (!reviewedFinalizers.has(file)) failures.push(`direct FinalizationRegistry site is not reviewed: ${file}`);
  else if (reviewedFinalizers.get(file) !== count) failures.push(`FinalizationRegistry count changed in ${file}: expected ${reviewedFinalizers.get(file)}, found ${count}`);
}
for (const file of reviewedFinalizers.keys()) {
  if (!actualFinalizers.has(file)) failures.push(`stale direct FinalizationRegistry review: ${file}`);
}

const requiredMarkers = new Map([
  ["packages/flint-wasm/src/numeric.c", ["serialize_real", "parse_serialized_real", "precision == 0", "NUMERIC_MAX_LIVE_RESOURCES"]],
  ["packages/flint-wasm/numeric-backend.mjs", ["maximumCachedHandles = 256", "snapshotState", "hydrate"]],
  ["packages/flint-wasm/algebraic.mjs", ["maximumCachedValues = 256", "maximumCachedMatrices = 32", "snapshotMatrix"]],
  ["packages/flint-wasm/index.mjs", ["maximumCachedP1Handles = 16", "hydrateP1"]],
  ["src/baselib/finite_fields.py", ["_FQ_CONTEXT_RESOURCE_CACHE_LIMIT = 32", "_FQ_ELEMENT_RESOURCE_CACHE_LIMIT = 128", "class _FqContextResourceStorage", "class _FqElementResourceStorage"]],
  ["src/baselib/matrix.py", ["_MATRIX_RESOURCE_CACHE_LIMIT = 64", "_VECTOR_RESOURCE_CACHE_LIMIT = 64", "class _ExactVectorResourceStorage"]],
  ["src/baselib/polynomial.py", ["_POLYNOMIAL_RESOURCE_CACHE_LIMIT = 64", "class _FmpzPolynomialResourceStorage", "class _FqPolynomialResourceStorage"]],
]);
for (const [file, markers] of requiredMarkers) {
  const source = requireFile(file, "bounded lifetime implementation");
  if (source === undefined) continue;
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${file} is missing lifetime marker ${JSON.stringify(marker)}`);
  }
}

for (const record of manifest.non_ffi_persistent_families ?? []) {
  if (!["bounded-exact-spill", "bounded-reconstructible-cache"].includes(record.policy)) {
    failures.push(`non-FFI persistent family is not bounded: ${record.id}`);
  }
  requireFile(record.evidence, `evidence for ${record.id}`);
}

const statefulPattern = /\b(sagejs_[A-Za-z0-9_]+_(?:begin|init|initialize))\s*\(/g;
const statefulActual = new Set();
function scanStatefulReactors(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scanStatefulReactors(absolute);
      continue;
    }
    if (!entry.name.endsWith(".mjs")) continue;
    const relativePath = relative(absolute);
    const source = requireFile(relativePath, "stateful reactor source");
    for (const match of source.matchAll(statefulPattern)) {
      statefulActual.add(`${relativePath}:${match[1]}`);
    }
  }
}
scanStatefulReactors(path.join(root, "packages/flint-wasm"));
const statefulReviewed = new Set();
const statefulPolicies = new Set([
  "backend-lifetime-explicit-dispose",
  "nested-state-cleared-by-owner-finally",
  "operation-finally",
]);
for (const record of manifest.stateful_reactor_scopes ?? []) {
  const key = `${record.path}:${record.begin}`;
  if (statefulReviewed.has(key)) failures.push(`duplicate stateful reactor review: ${key}`);
  statefulReviewed.add(key);
  if (!statefulPolicies.has(record.policy)) {
    failures.push(`unknown stateful reactor policy for ${key}: ${record.policy}`);
  }
  const source = requireFile(record.path, `stateful reactor review ${key}`);
  if (source !== undefined && !source.includes(record.cleanup)) {
    failures.push(`${key} lacks reviewed cleanup export ${record.cleanup}`);
  }
  if (source !== undefined && record.policy.includes("finally") && !source.includes("finally")) {
    failures.push(`${key} lacks a finally cleanup scope`);
  }
}
for (const key of statefulActual) {
  if (!statefulReviewed.has(key)) failures.push(`stateful reactor scope is not reviewed: ${key}`);
}
for (const key of statefulReviewed) {
  if (!statefulActual.has(key)) failures.push(`stale stateful reactor review: ${key}`);
}

if (failures.length !== 0) {
  console.error("WebAssembly resource lifetime audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`WebAssembly resource lifetime audit passed: ${declared.size} owned FFI families, ${actualFinalizers.size} direct finalizer sites, ${(manifest.non_ffi_persistent_families ?? []).length} non-FFI persistent families, ${statefulActual.size} stateful reactor scopes.`);
