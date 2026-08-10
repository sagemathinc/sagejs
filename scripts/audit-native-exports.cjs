#!/usr/bin/env node
"use strict";

const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const {
  createNativeExportInventory,
  inventoryPath,
  validateNativeExportInventory,
} = require("../tools/ffi/native-export-audit.cjs");

const action = process.argv[2] || "--check";
if (!["--check", "--write"].includes(action) || process.argv.length > 3) {
  throw new Error("usage: node scripts/audit-native-exports.cjs [--check|--write]");
}
const filename = inventoryPath();
if (action === "--write") {
  const inventory = createNativeExportInventory();
  writeFileSync(filename, `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(`Wrote ${inventory.exports.length} classified N-API exports to ${filename}`);
} else {
  if (!existsSync(filename)) throw new Error(`native export inventory is missing: ${filename}`);
  const inventory = validateNativeExportInventory(
    JSON.parse(readFileSync(filename, "utf8")),
  );
  console.log(
    `Native export inventory is current: ${inventory.exports.length} exports; ` +
    Object.entries(inventory.counts).map(([key, value]) => `${key}=${value}`).join(", "),
  );
}
