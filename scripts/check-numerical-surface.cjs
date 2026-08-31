#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const surface = JSON.parse(
  readFileSync(join(root, "docs/numerical-computing/surface.json"), "utf8"),
);
const diagnostics = JSON.parse(
  readFileSync(join(root, "docs/numerical-computing/diagnostics.json"), "utf8"),
);
const inventory = readFileSync(
  join(root, "docs/numerical-computing/inventory.md"),
  "utf8",
);

if (surface.schema_version !== 1) throw new Error("unsupported numerical surface schema");
const classifications = new Set(surface.classifications);
const ids = new Set();
for (const operation of surface.operations) {
  if (!operation.id || ids.has(operation.id)) {
    throw new Error(`missing or duplicate numerical operation: ${operation.id}`);
  }
  ids.add(operation.id);
  if (!classifications.has(operation.classification)) {
    throw new Error(`unclassified numerical operation: ${operation.id}`);
  }
  if (!new Set(["implemented", "unsupported"]).has(operation.status)) {
    throw new Error(`ambiguous numerical operation status: ${operation.id}`);
  }
  if (
    operation.status === "implemented" &&
    !new Set(["development-pending-P8", "release-qualified"]).has(
      operation.qualification,
    )
  ) {
    throw new Error(
      `implemented numerical operation lacks an honest qualification state: ${operation.id}`,
    );
  }
  if (
    operation.status === "implemented" &&
    (!Array.isArray(operation.methods) || operation.methods.length === 0)
  ) {
    throw new Error(`implemented numerical operation has no methods: ${operation.id}`);
  }
}
for (const required of [
  "scalar_root",
  "dense_linear_system",
  "dense_factorization",
  "interpolation",
  "spline",
  "finite_difference",
  "polynomial_approximation",
  "adaptive_quadrature",
  "local_optimization",
  "nonlinear_system",
  "least_squares_fit",
  "initial_value_problem",
  "ode_parameter_sweep",
  "eigensystem",
  "singular_value_decomposition",
  "polynomial_roots",
  "fft",
  "convolution",
  "descriptive_statistics",
  "probability_and_inference",
  "random_sampling",
  "regression",
  "sparse_linear_system",
  "sparse_dominant_eigenpair",
]) {
  if (!ids.has(required)) {
    throw new Error(`${required} is missing from the numerical surface`);
  }
}
if (new Set(diagnostics.codes).size !== diagnostics.codes.length) {
  throw new Error("duplicate numerical diagnostic code");
}
for (const required of [
  "Existing Sage.js runtime",
  "Language frontends",
  "External reference systems",
  "Compatibility meaning",
]) {
  if (!inventory.includes(`## ${required}`)) {
    throw new Error(`numerical inventory is missing ${required}`);
  }
}
console.log(`Numerical surface is exhaustive (${ids.size} operations, ${diagnostics.codes.length} diagnostics).`);
