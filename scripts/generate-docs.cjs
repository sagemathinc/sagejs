#!/usr/bin/env node
"use strict";

const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  renderDocumentationMarkdown,
} = require("../dist/tools/documentation.js");

const root = join(__dirname, "..");
const output = join(root, "docs", "reference", "api.md");
const check = process.argv.slice(2).includes("--check");

async function main() {
  const session = await createSage();
  let generated;
  try {
    generated = renderDocumentationMarkdown(await session.documentation());
  } finally {
    await session.close();
  }
  if (check) {
    let current = "";
    try {
      current = readFileSync(output, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current !== generated) {
      console.error(
        "generated API documentation is stale; run pnpm docs:generate",
      );
      process.exitCode = 1;
    }
    return;
  }
  mkdirSync(join(root, "docs", "reference"), { recursive: true });
  writeFileSync(output, generated);
  console.log("Wrote docs/reference/api.md");
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
