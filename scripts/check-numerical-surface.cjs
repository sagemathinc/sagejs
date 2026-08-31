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
}
if (!ids.has("scalar_root")) throw new Error("scalar_root is missing from the surface");
if (new Set(diagnostics.codes).size !== diagnostics.codes.length) {
  throw new Error("duplicate numerical diagnostic code");
}
console.log(`Numerical surface is exhaustive (${ids.size} operations, ${diagnostics.codes.length} diagnostics).`);
