#!/usr/bin/env node
"use strict";

const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const prism = join(root, "node_modules", "prismjs");
const check = process.argv.slice(2).includes("--check");

const banner =
  "/*! PrismJS 1.30.0 | Copyright 2012 Lea Verou | MIT license | prismjs.com */\n";

function read(relative) {
  return readFileSync(join(prism, relative), "utf8").trim();
}

function expectedAssets() {
  return {
    "reference-prism.js":
      banner +
      [
        read("components/prism-core.min.js"),
        read("components/prism-python.min.js"),
        read("plugins/line-numbers/prism-line-numbers.min.js"),
      ].join(";\n") +
      "\n",
    "reference-prism.css":
      banner +
      read("themes/prism-tomorrow.min.css") +
      "\n" +
      read("plugins/line-numbers/prism-line-numbers.css") +
      "\n",
  };
}

function buildReferencePrism({ checkOnly = false } = {}) {
  for (const [filename, expected] of Object.entries(expectedAssets())) {
    const output = join(root, "website", filename);
    const current = existsSync(output) ? readFileSync(output, "utf8") : "";
    if (checkOnly) {
      if (current !== expected) {
        throw new Error(`${filename} is stale; run pnpm docs:generate`);
      }
    } else {
      writeFileSync(output, expected);
    }
  }
}

module.exports = { buildReferencePrism };

if (require.main === module) {
  try {
    buildReferencePrism({ checkOnly: check });
    if (!check) console.log("Wrote the self-contained Prism reference assets");
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  }
}
