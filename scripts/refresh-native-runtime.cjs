#!/usr/bin/env node
"use strict";

const { resolve } = require("node:path");

const {
  main: build,
  publishProductionNative,
  reconcileInstalledNative,
} = require("./build.cjs");
const {
  inspectSourceBuildReceipt,
  refreshBuildReceiptAfterNative,
} = require("./build-receipt.cjs");

const root = resolve(__dirname, "..");

async function main() {
  const source = inspectSourceBuildReceipt(root);
  if (!source.current) {
    process.stdout.write(
      `[native] A complete source build is required (${source.reason})\n`,
    );
    return build();
  }
  process.stdout.write("[native] Reconciling installed host adapters\n");
  process.stdout.write(`[native] ${await reconcileInstalledNative()}\n`);
  process.stdout.write("[native] Publishing the production mathematics pack\n");
  process.stdout.write(`[native] ${await publishProductionNative()}\n`);
  refreshBuildReceiptAfterNative(root);
  process.stdout.write(
    "[native] Refreshed the source-bound build receipt with exact native inputs\n",
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
