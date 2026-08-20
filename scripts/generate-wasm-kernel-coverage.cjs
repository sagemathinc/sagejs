#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  inventoryProductionKernels,
} = require("../tools/native-kernel/wasm-production-pack.cjs");

const root = path.resolve(__dirname, "..");
const output = path.join(
  root,
  "packages/flint-wasm/release/production-kernel-coverage.json",
);

void (async () => {
  const inventory = await inventoryProductionKernels({
    root,
    manifestPath: path.join(root, "architecture/native-kernels.json"),
  });
  const records = [];
  for (const kernel of inventory.inventory) {
    const compiled = kernel.functions.filter((fn) => fn.status === "compiled-source");
    const fallback = kernel.functions.filter((fn) => fn.status === "unsupported");
    records.push({
      id: kernel.id,
      production: true,
      status: fallback.length === 0 ? "available" : "fallback",
      compiled_functions: compiled.length,
      fallback_functions: fallback.length,
      total_functions: kernel.functions.length,
      fallback_reasons: [...new Set(fallback.map((fn) => fn.reason))].sort(),
    });
  }
  for (const kernel of inventory.nonProduction) {
    records.push({
      id: kernel.id,
      production: false,
      status: "fallback",
      compiled_functions: 0,
      fallback_functions: kernel.functions.length,
      total_functions: kernel.functions.length,
      fallback_reasons: [kernel.reason],
    });
  }
  records.sort((left, right) => left.id.localeCompare(right.id));
  const document = {
    schema: "sagejs.wasm-production-kernel-coverage/v1",
    source_registry: "architecture/native-kernels.json",
    totals: {
      registered_kernels: records.length,
      production_kernels: records.filter((item) => item.production).length,
      compiled_functions: records.reduce((sum, item) => sum + item.compiled_functions, 0),
      unsupported_production_functions: records
        .filter((item) => item.production)
        .reduce((sum, item) => sum + item.fallback_functions, 0),
      non_production_functions: records
        .filter((item) => !item.production)
        .reduce((sum, item) => sum + item.fallback_functions, 0),
      same_source_fallback_functions: records
        .reduce((sum, item) => sum + item.fallback_functions, 0),
    },
    kernels: records,
  };
  fs.writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
})().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
