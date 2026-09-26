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
  const phases = args.includes("--phases");
  const positional = args.filter((value) => value !== "--phases");
  if (positional.length > 2 || args.length !== positional.length + Number(phases)) {
    throw new Error("usage: run-public-sagejs.cjs [samples] [field-id] [--phases]");
  }
  const samples = positional[0] === undefined ? 5 : Number(positional[0]);
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 30) {
    throw new Error("samples must be an integer from 1 through 30");
  }
  const fields = positional[1]
    ? panel.fields.filter((field) => field.id === positional[1])
    : panel.fields;
  if (fields.length === 0) throw new Error(`unknown frozen field: ${positional[1]}`);
  return { samples, fields, phases };
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

async function diagnosePhases(sage, expectedClassNumber) {
  const response = await sage.evaluate([
    "import time",
    "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
    "from sagejs.kernels.matrix.imaginary_map import verify_packed_imaginary_map, _pack_exact_int64",
    "from sagejs.native import kernel_uint64_zeros",
    "started = time.perf_counter()",
    "result = rust_runtime.rust_imaginary_result(K, operation='imaginary-class-group', algorithm='rust')",
    "received = time.perf_counter()",
    "forms, coordinates, generators = rust_runtime.validate_imaginary_group_result(result, int(K.discriminant()))",
    "validated = time.perf_counter()",
    "compact_forms, compact_coordinates, compact_generators = rust_runtime.validate_imaginary_group_result(result, int(K.discriminant()), compact=True)",
    "compact_validated = time.perf_counter()",
    "assert len(compact_forms) == len(forms) and len(compact_coordinates) == len(coordinates) and compact_generators == generators",
    "core = 'completeClassMapCorePacked' in result",
    "rows = result['completeClassMapCorePacked'] if core else result['completeClassMapPacked']",
    "certificate = result['certificate']['reducedFormsPacked']",
    "invariants = result['invariantFactors']",
    "packing_started = time.perf_counter()",
    "packed_rows = _pack_exact_int64(verify_packed_imaginary_map, rows)",
    "packed_certificate = _pack_exact_int64(verify_packed_imaginary_map, certificate)",
    "packed_invariants = _pack_exact_int64(verify_packed_imaginary_map, invariants)",
    "seen = kernel_uint64_zeros(verify_packed_imaginary_map, result['completeClassMapLength'])",
    "packed = time.perf_counter()",
    "assert verify_packed_imaginary_map(packed_rows, packed_certificate, packed_invariants, seen, int(K.discriminant()), -1 if int(K.discriminant()) % 4 == 1 else 0) == 0",
    "verified = time.perf_counter()",
    "stride = (2 if core else 11) + len(invariants)",
    "rebuilt_forms = []",
    "rebuilt_coordinates = {}",
    "for index in range(result['completeClassMapLength']):",
    "    offset = index * stride",
    "    a, b = rows[offset], rows[offset + 1]",
    "    c = (b*b-int(K.discriminant())) // (4*a) if core else rows[offset + 2]",
    "    rebuilt_forms.append((a, b, c))",
    "    rebuilt_coordinates[str(a) + ',' + str(b) + ',' + str(c)] = tuple(rows[offset + (2 if core else 11):offset + stride])",
    "materialized = time.perf_counter()",
    "assert rebuilt_forms == forms and rebuilt_coordinates == coordinates",
    "[(received - started) * 1000, (validated - received) * 1000, (compact_validated - validated) * 1000, len(forms), len(coordinates), (packed - packing_started) * 1000, (verified - packed) * 1000, (materialized - verified) * 1000]",
  ].join("\n"));
  const [serviceAndConversionMs, independentValidationMs, compactValidationMs, forms, coordinates,
    validatedPackingMs, kernelMs, materializeMs] =
    JSON.parse(response.repr);
  if (forms !== expectedClassNumber || coordinates !== expectedClassNumber ||
      !Number.isFinite(serviceAndConversionMs) || !Number.isFinite(independentValidationMs) ||
      !Number.isFinite(compactValidationMs)) {
    throw new Error("phase diagnostic did not validate the complete class map");
  }
  return { serviceAndConversionMs, independentValidationMs, compactValidationMs,
    exactMapRecheck: { validatedPackingMs, kernelMs, materializeMs } };
}

async function main() {
  const { samples, fields, phases } = parseArguments(process.argv.slice(2));
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
      const phaseDiagnostic = phases
        ? await diagnosePhases(sage, field.expected.classNumber)
        : undefined;
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
        ...(phaseDiagnostic === undefined ? {} : { phaseDiagnostic }),
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
    phaseDiagnosticEnabled: phases,
    results,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { parseArguments, expectedGroup, median, diagnosePhases };
