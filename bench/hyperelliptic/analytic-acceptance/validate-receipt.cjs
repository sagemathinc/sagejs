#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const {
  FAILURE_SCHEMA,
  ROOT,
  sourceIdentity,
  validateFailureReceipt,
  validateReceipt,
} = require("./contract.cjs");

function main() {
  const filename = process.argv[2];
  if (filename === undefined) {
    throw new Error("usage: validate-receipt.cjs RECEIPT.json [--historical]");
  }
  const historical = process.argv.includes("--historical");
  const receipt = JSON.parse(readFileSync(resolve(filename), "utf8"));
  const result = (receipt.schema === FAILURE_SCHEMA
    ? validateFailureReceipt
    : validateReceipt)(receipt, {
    currentSources: historical ? null : sourceIdentity(ROOT),
  });
  if (!result.passed) {
    for (const failure of result.failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${receipt.schema === FAILURE_SCHEMA ? "validated failure" : "validated"} ` +
      `${receipt.schema} from ${receipt.source.commit} ` +
      `${historical ? "as historical evidence" : "against current source"}\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
