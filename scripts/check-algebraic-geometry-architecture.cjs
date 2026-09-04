#!/usr/bin/env node
"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), "utf8"));
}

function requireKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  for (const key of keys) {
    if (!(key in value)) throw new Error(`${label} is missing ${key}`);
  }
}

function uniqueIds(values, label) {
  const ids = new Set();
  for (const [index, value] of values.entries()) {
    requireKeys(value, ["id"], `${label}[${index}]`);
    if (typeof value.id !== "string" || value.id.length === 0) {
      throw new Error(`${label}[${index}] has an invalid id`);
    }
    if (ids.has(value.id)) throw new Error(`${label} has duplicate id ${value.id}`);
    ids.add(value.id);
  }
  return ids;
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && expected.every((item) => actual.includes(item));
}

function checkCapabilities() {
  const data = readJson("architecture/algebraic-geometry-capabilities.json");
  if (data.schema !== "sagejs.algebraic-geometry-capabilities/v1") {
    throw new Error("unsupported algebraic-geometry capability schema");
  }
  const routing = [
    "operation",
    "base_field_descriptor",
    "monomial_order",
    "proof_mode",
    "platform",
    "resource_envelope",
  ];
  if (!sameMembers(data.routing_key, routing)) {
    throw new Error("algebraic-geometry routing key is incomplete");
  }
  if (!sameMembers(data.supported_base_fields.map((value) => value.id), ["QQ", "GF(p)"])) {
    throw new Error("this milestone must support exactly QQ and prime GF(p)");
  }
  const deferred = data.deferred_base_fields.map((value) => value.id);
  if (!deferred.includes("GF(p^d), d > 1") || !deferred.includes("absolute-number-field")) {
    throw new Error("extension fields and number fields must remain explicitly deferred");
  }
  for (const item of data.deferred_base_fields) {
    if (item.plan !== "agents/no-singular-extension-fields-plan.md") {
      throw new Error(`${item.id} does not point to the extension-field plan`);
    }
  }
  for (const dependency of ["Singular", "Macaulay2", "CoCoA", "Oscar", "Julia"]) {
    if (!data.forbidden_runtime_dependencies.includes(dependency)) {
      throw new Error(`missing forbidden runtime dependency ${dependency}`);
    }
  }

  const operationIds = uniqueIds(data.operations, "operations");
  const requiredOperations = [
    "polynomial.evaluate",
    "polynomial.substitute",
    "polynomial.differentiate",
    "polynomial.homogenize",
    "quotient.canonical-arithmetic",
    "quotient.linear-algebra",
    "ideal.intersection",
    "ideal.colon",
    "ideal.saturation",
    "ideal.hilbert-data",
    "affine.space-point",
    "affine.scheme-basics",
    "projective.space-point",
    "projective.scheme-basics",
    "projective.patch-closure",
    "morphism.evaluate-compose",
    "morphism.graph-fiber-preimage",
    "morphism.image-closure",
    "jacobian.tangent-space",
    "jacobian.singular-subscheme",
    "curve.plane",
    "curve.arithmetic-genus",
    "zero-dimensional.radical",
    "zero-dimensional.primary-decomposition",
  ];
  for (const id of requiredOperations) {
    if (!operationIds.has(id)) throw new Error(`capability matrix omits ${id}`);
  }
  for (const operation of data.operations) {
    requireKeys(
      operation,
      ["phase", "domains", "orders", "proof_modes", "platforms", "implementation", "fallback", "resource_envelope", "limitation"],
      operation.id,
    );
    if (!Number.isInteger(operation.phase) || operation.phase < 1 || operation.phase > 9) {
      throw new Error(`${operation.id} has an invalid implementation phase`);
    }
    for (const name of ["domains", "orders", "proof_modes", "platforms"]) {
      if (!Array.isArray(operation[name]) || operation[name].length === 0) {
        throw new Error(`${operation.id} has an empty ${name}`);
      }
    }
    if (operation.domains.some((domain) => !["QQ", "GF(p)"].includes(domain))) {
      throw new Error(`${operation.id} claims an unsupported coefficient domain`);
    }
    if (!sameMembers(operation.proof_modes, ["required", "relaxed"])) {
      throw new Error(`${operation.id} must advertise both proof modes`);
    }
    const routeText = `${operation.implementation} ${operation.fallback}`.toLowerCase();
    if (/singular|macaulay2|cocoa|oscar|julia/.test(routeText)) {
      throw new Error(`${operation.id} leaks an external CAS into its runtime route`);
    }
  }

  const rejectionIds = uniqueIds(data.explicit_rejections, "explicit_rejections");
  for (const id of [
    "coefficient.extension-field",
    "decomposition.positive-dimensional",
    "curve.geometric-genus",
    "morphism.rational-map-base-locus",
    "jacobian.mixed-dimensional-global",
  ]) {
    if (!rejectionIds.has(id)) throw new Error(`capability matrix omits rejection ${id}`);
  }
}

function checkProvenance() {
  const data = readJson("architecture/upstream-algebra-provenance.json");
  if (data.schema !== "sagejs.upstream-algebra-provenance/v1") {
    throw new Error("unsupported upstream algebra provenance schema");
  }
  const projects = uniqueIds(data.projects, "projects");
  for (const id of ["sagemath", "singular", "cocoa", "macaulay2", "oscar"]) {
    if (!projects.has(id)) throw new Error(`provenance omits project ${id}`);
  }
  for (const project of data.projects) {
    requireKeys(project, ["revision", "license", "copyright", "repository"], project.id);
    if (!/^[0-9a-f]{40}$/.test(project.revision)) {
      throw new Error(`${project.id} revision is not a full commit hash`);
    }
  }
  uniqueIds(data.records, "records");
  for (const record of data.records) {
    requireKeys(
      record,
      ["project", "relationship", "copied_code", "sources", "symbols_or_lines", "sagejs_files", "note"],
      record.id,
    );
    if (!projects.has(record.project)) throw new Error(`${record.id} has an unknown project`);
    if (!Array.isArray(record.sources) || record.sources.length === 0) {
      throw new Error(`${record.id} has no upstream source location`);
    }
    if (!Array.isArray(record.sagejs_files) || record.sagejs_files.length === 0) {
      throw new Error(`${record.id} has no Sage.js consumer`);
    }
    if (record.copied_code !== false) {
      throw new Error(`${record.id} claims copied code but provides no source-file notice review`);
    }
  }
}

function checkOracleCorpus() {
  const data = readJson("test/fixtures/algebraic-geometry-oracles-v1.json");
  if (data.schema !== "sagejs.algebraic-geometry-oracles/v1") {
    throw new Error("unsupported algebraic-geometry oracle schema");
  }
  const cases = uniqueIds(data.cases, "oracle cases");
  for (const id of [
    "affine-parabola",
    "intersection-colon-saturation",
    "hilbert-complete-intersection",
    "projective-cubic",
    "parabola-image",
    "cusp-jacobian",
    "nonreduced-zero-dimensional-decomposition",
    "finite-nonsplit-component",
  ]) {
    if (!cases.has(id)) throw new Error(`oracle corpus omits ${id}`);
  }
  const systems = new Set();
  for (const item of data.cases) {
    requireKeys(item, ["hypotheses", "expected", "oracles", "sagejs_test"], item.id);
    if (!Array.isArray(item.oracles) || item.oracles.length < 2) {
      throw new Error(`${item.id} needs at least two independent oracle commands`);
    }
    for (const oracle of item.oracles) {
      requireKeys(oracle, ["system", "command"], `${item.id} oracle`);
      systems.add(oracle.system);
    }
  }
  for (const system of ["sagemath", "singular", "cocoa", "macaulay2", "oscar"]) {
    if (!systems.has(system)) throw new Error(`oracle corpus does not cover ${system}`);
  }
}

function checkGeometrySources() {
  const files = ["src/baselib/schemes.py"];
  for (const name of readdirSync(join(root, "src/lib/sagejs/schemes"))) {
    if (name.endsWith(".py")) files.push(`src/lib/sagejs/schemes/${name}`);
  }
  for (const relative of files) {
    const source = readFileSync(join(root, relative), "utf8");
    const forbidden = [
      [/\._kind\s*(?:==|!=|\bin\b)/, "private field-tag dispatch"],
      [/flint_backend\s*\(/, "FLINT handle access"],
      [/\bmsolve\b/i, "msolve-specific routing"],
      [/\blibsingular\b/i, "libSingular dependency"],
      [/\bsubprocess\b/, "subprocess dependency"],
    ];
    for (const [pattern, label] of forbidden) {
      if (pattern.test(source)) throw new Error(`${relative} contains ${label}`);
    }
  }
  const schemes = readFileSync(join(root, "src/baselib/schemes.py"), "utf8");
  if (!schemes.includes('"base_field": base') || !schemes.includes('"base_field": ambient.base_ring()')) {
    throw new Error("scheme construction descriptors do not retain the exact base field");
  }
  if (/cache[^\n]*characteristic|characteristic[^\n]*cache/i.test(schemes)) {
    throw new Error("scheme caches must not key only on characteristic");
  }
}

checkCapabilities();
checkProvenance();
checkOracleCorpus();
checkGeometrySources();
console.log("Algebraic-geometry capability, provenance, oracle, and extension-boundary checks passed.");
