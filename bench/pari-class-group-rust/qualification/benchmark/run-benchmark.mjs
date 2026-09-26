#!/usr/bin/env node
// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runBenchmark } from "./benchmark-lib.mjs";

function usage() {
  console.error("usage: node run-benchmark.mjs CONFIG.json [RECEIPT.json]");
  process.exitCode = 2;
}

const [, , configArgument, receiptArgument] = process.argv;
if (!configArgument || process.argv.length > 4) {
  usage();
} else {
  const configPath = path.resolve(configArgument);
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const result = await runBenchmark(config, {
      root: path.dirname(configPath),
      receiptPath: receiptArgument ? path.resolve(receiptArgument) : undefined,
    });
    console.log(
      JSON.stringify({
        schema: "sagejs.rust-class-group/benchmark-cli-result-v1",
        status: result.receipt.status,
        receiptPath: result.receiptPath,
        evidenceDirectory: result.evidenceRoot,
        failures: result.receipt.failures.length,
      }),
    );
    if (result.receipt.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}
