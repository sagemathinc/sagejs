#!/usr/bin/env node
"use strict";

// Diagnostic public Sage.js timings, not a promoted Rust/PARI comparison.
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "../../../../..");
const panel = require("./panel-v2.json");
const { createSage } = require(path.join(root, "dist/tools/kernel.js"));

function parseArguments(args) {
  if (args.length > 2) throw new Error("usage: run-public-sagejs.cjs [samples] [field-id]");
  const samples = args[0] === undefined ? 5 : Number(args[0]);
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 30) {
    throw new Error("samples must be an integer from 1 through 30");
  }
  const fields = args[1]
    ? panel.fields.filter((field) => field.id === args[1])
    : panel.fields;
  if (fields.length === 0) throw new Error(`unknown frozen field: ${args[1]}`);
  return { samples, fields };
}

function expectedGroup(field) {
  const factors = field.expected.invariantFactors;
  const tuple = factors.length === 0
    ? "()"
    : `(${factors.join(", ")}${factors.length === 1 ? "," : ""})`;
  return `[${field.expected.classNumber}, ${tuple}, 'exact-unconditional', 'rust']`;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

async function timed(sage, code, expected) {
  const start = performance.now();
  const response = await sage.evaluate(code);
  const nanoseconds = Math.round((performance.now() - start) * 1_000_000);
  if (response.repr !== expected) {
    throw new Error(`wrong public answer: expected ${expected}, got ${response.repr}`);
  }
  return nanoseconds;
}

async function main() {
  const { samples, fields } = parseArguments(process.argv.slice(2));
  const service = process.env.SAGEJS_CLASS_GROUP_SERVICE;
  if (!service || !path.isAbsolute(service) || !fs.existsSync(service)) {
    throw new Error("set SAGEJS_CLASS_GROUP_SERVICE to the built native service path");
  }
  const sage = await createSage();
  const results = [];
  try {
    for (const field of fields) {
      process.stderr.write(`measuring ${field.id}\n`);
      await sage.evaluate(`R.<x> = QQ[]\nK.<a> = NumberField(${field.pariPolynomial})`);
      const expected = expectedGroup(field);
      const defaultCall = "G = K.class_group()\n[G.order(), G.invariants(), G.proof_status, G.algorithm]";
      const freshCall = "G = K.class_group(algorithm='rust')\n[G.order(), G.invariants(), G.proof_status, G.algorithm]";
      const scalarCall = "K.class_number(algorithm='rust')";
      const firstDefaultNanoseconds = await timed(sage, defaultCall, expected);
      await timed(sage, freshCall, expected);
      await timed(sage, scalarCall, String(field.expected.classNumber));
      const cached = [], fresh = [], scalar = [];
      for (let index = 0; index < samples; index += 1) {
        cached.push(await timed(sage, defaultCall, expected));
        fresh.push(await timed(sage, freshCall, expected));
        scalar.push(await timed(sage, scalarCall, String(field.expected.classNumber)));
      }
      results.push({
        fieldId: field.id,
        discriminant: field.expected.discriminant,
        classNumber: field.expected.classNumber,
        invariantFactors: field.expected.invariantFactors,
        firstDefaultNanoseconds,
        cachedDefaultNanoseconds: cached,
        cachedDefaultMedianNanoseconds: median(cached),
        freshExplicitNanoseconds: fresh,
        freshExplicitMedianNanoseconds: median(fresh),
        scalarExplicitNanoseconds: scalar,
        scalarExplicitMedianNanoseconds: median(scalar),
        rssAfterFieldBytes: process.memoryUsage().rss,
      });
      process.stderr.write(`${JSON.stringify(results[results.length - 1])}\n`);
    }
  } finally {
    await sage.close();
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.public-quadratic/public-sagejs-latency-diagnostic-v1",
    panelSchema: panel.schema,
    promotedPerformanceReceipt: false,
    boundary: "warm-node-kernel-evaluate-public-sagejs-call-v1",
    caveat: "Includes public Python/Sage.js dispatch, exact host map validation, and kernel evaluation overhead; excludes kernel startup and field construction. Not directly comparable to the promoted Rust/PARI coefficient boundary.",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    samplesPerField: samples,
    results,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { parseArguments, expectedGroup, median };
