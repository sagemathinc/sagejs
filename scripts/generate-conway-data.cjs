#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const directory = path.join(root, "src/lib/conway_polynomials");
const sourcePath = path.join(directory, "CPimport.txt");
const outputPath = path.join(directory, "conway_polynomials.json");

function generate(source) {
  const lines = source.split("\n");
  assert.equal(lines.shift(), "allConwayPolynomials := [");
  assert.equal(lines.at(-2), "0];");
  const table = {};
  for (const line of lines.slice(0, -2)) {
    const fields = line.replaceAll("[", "").slice(0, -3).split(",");
    const prime = Number(fields[0]);
    const degree = Number(fields[1]);
    const coefficients = fields.slice(2).map(Number);
    assert.ok(Number.isSafeInteger(prime));
    assert.ok(Number.isSafeInteger(degree));
    assert.equal(coefficients.length, degree + 1);
    assert.ok(coefficients.every(Number.isSafeInteger));
    (table[prime] ??= {})[degree] = coefficients;
  }
  return JSON.stringify(table);
}

const generated = generate(fs.readFileSync(sourcePath, "utf8"));
if (process.argv.includes("--check")) {
  assert.equal(fs.readFileSync(outputPath, "utf8"), generated);
  process.stdout.write("Conway compact table is current\n");
} else {
  fs.writeFileSync(outputPath, generated);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

module.exports = { generate };
