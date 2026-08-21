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
const capabilityManifestPath = path.join(root, "architecture/wasm-capabilities.json");
const capabilityReportPath = path.join(root, "architecture/wasm-capabilities-report.json");
const productionCapabilitiesPath = path.join(
  root,
  "packages/flint-wasm/release/production-capabilities.json",
);

function synchronizeKernelCapabilities(document, inventory) {
  const productionCapabilities = JSON.parse(
    fs.readFileSync(productionCapabilitiesPath, "utf8"),
  );
  for (const domain of ["flint", "gmp"]) {
    const module = productionCapabilities.modules[`kernel-${domain}`];
    const retained = (module.additionalCapabilities || []).filter(
      (id) => !id.startsWith("kernel:"),
    );
    module.additionalCapabilities = [
      ...retained,
      ...inventory.inventory
        .filter((kernel) => kernel.domain === domain)
        .map((kernel) => `kernel:${kernel.id}`),
    ].sort();
  }
  fs.writeFileSync(
    productionCapabilitiesPath,
    `${JSON.stringify(productionCapabilities, null, 2)}\n`,
  );
  const manifest = JSON.parse(fs.readFileSync(capabilityManifestPath, "utf8"));
  const coverageById = new Map(
    document.kernels.map((item) => [`kernel:${item.id}`, item]),
  );
  for (const capability of manifest.capabilities) {
    if (capability.kind !== "production-kernel") continue;
    const coverage = coverageById.get(capability.id);
    if (coverage === undefined) {
      throw new Error(`${capability.id} is missing generated kernel coverage`);
    }
    capability.status = coverage.status;
    capability.compiled_coverage = {
      compiled_functions: coverage.compiled_functions,
      fallback_functions: coverage.fallback_functions,
      total_functions: coverage.total_functions,
      production_pack: coverage.production,
      fallback_reasons: coverage.fallback_reasons,
    };
    if (coverage.status === "available") {
      capability.review_note =
        `The receipt-authenticated production pack compiles all ${coverage.total_functions} ` +
        "registered functions in this source-transparent kernel family.";
      capability.public_explanation =
        `All ${coverage.total_functions} registered functions in this family run as ` +
        "compiled WebAssembly in the production artifact.";
    } else {
      capability.review_note =
        `The production pack compiles ${coverage.compiled_functions} of ` +
        `${coverage.total_functions} functions. The remaining ` +
        `${coverage.fallback_functions} functions use their tested same-source dynamic ` +
        `fallback (${coverage.fallback_reasons.join(", ")}).`;
      capability.public_explanation =
        `This family uses compiled WebAssembly for ${coverage.compiled_functions} of ` +
        `${coverage.total_functions} functions and the same-source fallback for ` +
        `${coverage.fallback_functions} functions.`;
    }
  }
  fs.writeFileSync(capabilityManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const { publicReport } = require("./check-wasm-capabilities.cjs");
  fs.writeFileSync(
    capabilityReportPath,
    `${JSON.stringify(publicReport(manifest), null, 2)}\n`,
  );
}

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
  synchronizeKernelCapabilities(document, inventory);
})().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
