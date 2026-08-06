#!/usr/bin/env node
"use strict";

const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const prism = join(root, "node_modules", "prismjs");
const check = process.argv.slice(2).includes("--check");

const banner =
  "/*! PrismJS 1.30.0 | Copyright 2012 Lea Verou | MIT license | prismjs.com */\n";

const sageLanguages = String.raw`
Prism.languages.sage=Prism.languages.python;
Prism.languages.maple={comment:/#.*/,string:{pattern:/(\"|')(?:\\.|(?!\1)[^\\\r\n])*\1/,greedy:true},keyword:/\b(?:and|assuming|break|by|catch|description|do|done|elif|else|end|error|export|fi|finally|for|from|global|if|implies|in|intersect|local|minus|mod|module|next|not|od|option|options|or|proc|quit|read|remember|return|save|stop|subset|then|try|union|use|uses|while|xor)\b/,builtin:/\b(?:Array|DataFrame|Matrix|NULL|Pi|RootOf|Vector|add|coeff|collect|diff|eval|evalf|expand|factor|fsolve|int|limit|map|nops|op|plot|seq|series|simplify|solve|subs|sum)\b/,boolean:/\b(?:false|true|FAIL)\b/,number:/\b(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\b/i,operator:/<>|<=|>=|:=|\.\.|->|[+\-*\/%^=<>&|~]/,punctuation:/[()\[\]{},;:]/};
Prism.languages.macaulay2={comment:{pattern:/--.*|-\*[\s\S]*?\*-/,greedy:true},string:{pattern:/\"(?:\\.|[^\"\\\r\n])*\"/,greedy:true},keyword:/\b(?:and|break|catch|continue|do|else|export|for|from|global|if|import|in|local|new|not|or|return|then|time|to|try|when|while)\b/,builtin:/\b(?:CC|GF|QQ|RR|ZZ|Ideal|Matrix|Module|PolynomialRing|Ring|apply|basis|betti|codim|degree|gens|ideal|kernel|mingens|numgens|prune|res|ring|syz)\b/,boolean:/\b(?:false|true|null)\b/,number:/\b(?:\d+(?:\.\d*)?|\.\d+)\b/,operator:/=>|==|!=|<=|>=|\+\+|\.\.|[+\-*\/%^=<>#@|&]/,punctuation:/[()\[\]{},;:]/};
`.trim();

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
        read("components/prism-magma.min.js"),
        read("components/prism-matlab.min.js"),
        read("components/prism-wolfram.min.js"),
        sageLanguages,
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
