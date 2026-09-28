#!/usr/bin/env node
"use strict";

// Diagnostic public Sage.js timings, not a promoted Rust/PARI comparison.
const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "../../../../..");
const panel = require("./panel-v2.json");
const { createSage } = require(path.join(root, "dist/tools/kernel.js"));

function parseArguments(args) {
  const usage = "usage: run-public-sagejs.cjs [samples] [field-id] [--phases] [--repeated-phases] [--receipt filename.json]";
  let phases = false;
  let repeatedPhases = false;
  let receipt;
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--phases" && !phases) phases = true;
    else if (argument === "--repeated-phases" && !repeatedPhases) repeatedPhases = true;
    else if (argument === "--receipt" && receipt === undefined) {
      receipt = args[++index];
      if (typeof receipt !== "string" || !/^[a-z][a-z0-9-]*\.json$/.test(receipt)) {
        throw new Error(usage);
      }
    } else if (argument.startsWith("--")) throw new Error(usage);
    else positional.push(argument);
  }
  if (positional.length > 2) throw new Error(usage);
  const samples = positional[0] === undefined ? 5 : Number(positional[0]);
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 30) {
    throw new Error("samples must be an integer from 1 through 30");
  }
  const fields = positional[1]
    ? panel.fields.filter((field) => field.id === positional[1])
    : panel.fields;
  if (fields.length === 0) throw new Error(`unknown frozen field: ${positional[1]}`);
  return { samples, fields, phases, repeatedPhases, receipt };
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

async function timedBoundary(sage, code, expected) {
  const start = performance.now();
  const response = await sage.evaluate(code);
  const wallNanoseconds = Math.round((performance.now() - start) * 1_000_000);
  if (response.repr !== expected) {
    throw new Error(`wrong public answer: expected ${expected}, got ${response.repr}`);
  }
  const executionNanoseconds = Math.round(response.durationMs * 1_000_000);
  if (!Number.isSafeInteger(executionNanoseconds) || executionNanoseconds < 0) {
    throw new Error("the evaluator omitted its execution-only duration");
  }
  return { wallNanoseconds, executionNanoseconds };
}

async function timed(sage, code, expected) {
  return (await timedBoundary(sage, code, expected)).wallNanoseconds;
}

async function diagnoseEvaluationBoundary(sage, freshCall, groupExpected, scalarCall,
  scalarExpected, samples) {
  const measurements = { empty: [], freshGroup: [], scalar: [] };
  for (let index = 0; index < samples; index += 1) {
    measurements.empty.push(await timedBoundary(sage, "0", "0"));
    measurements.freshGroup.push(await timedBoundary(sage, freshCall, groupExpected));
    measurements.scalar.push(await timedBoundary(sage, scalarCall, scalarExpected));
  }
  return Object.fromEntries(Object.entries(measurements).map(([name, values]) => [name, {
    wallMedianNanoseconds: median(values.map((value) => value.wallNanoseconds)),
    executionMedianNanoseconds: median(values.map((value) => value.executionNanoseconds)),
  }]));
}

async function diagnoseRepeatedCellPhases(sage, field, samples) {
  const expected = expectedGroup(field);
  const group = (name) => `G = ${name}.class_group(algorithm='rust')\n` +
    "[G.order(), G.invariants(), G.proof_status, G.algorithm]";
  const cases = [
    ["empty", "0", "0"],
    ["polynomial", `P = ${field.pariPolynomial}`, ""],
    ["fieldFromPolynomial", "L = NumberField(P)", ""],
    ["preparedGroup", group("K"), expected],
    ["freshPolynomialGroup",
      `L.<b> = NumberField(${field.pariPolynomial})\n${group("L")}`, expected],
  ];
  const result = {};
  for (const [name, code, answer] of cases) {
    await timedBoundary(sage, code, answer);
    const values = [];
    for (let index = 0; index < samples; index += 1) {
      values.push(await timedBoundary(sage, code, answer));
    }
    result[name] = {
      wallMedianNanoseconds: median(values.map((value) => value.wallNanoseconds)),
      executionMedianNanoseconds: median(
        values.map((value) => value.executionNanoseconds),
      ),
    };
  }
  const discriminant = await sage.evaluate("L.discriminant()");
  if (discriminant.repr !== String(field.expected.discriminant)) {
    throw new Error("repeated-cell phase field has the wrong discriminant");
  }
  return result;
}

async function diagnosePhases(sage, expectedClassNumber) {
  const presentationResponse = await sage.evaluate([
    "import time",
    "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
    "started = time.perf_counter()",
    "result = rust_runtime.rust_imaginary_result(K, operation='imaginary-class-group', algorithm='rust')",
    "received = time.perf_counter()",
    "if '_coordinateMap' in result:",
    "    backend, capability, resident = rust_runtime._imaginary_backend()",
    "    discriminant, polynomial = rust_runtime._imaginary_polynomial(K)",
    "    request = {'polynomialAscending': polynomial}",
    "    summary_started = time.perf_counter()",
    "    answer = rust_runtime._imaginary_call(backend, resident, 'imaginary-class-group-summary', request)",
    "    summary_finished = time.perf_counter()",
    "    generators = rust_runtime._validate_imaginary_presentation(answer['result'], discriminant, polynomial)",
    "    validated = time.perf_counter()",
    "    rust_runtime._verify_imaginary_presentation(answer['result'], polynomial, backend, resident, generators)",
    "    verified = time.perf_counter()",
    "    phase_result = [1, (received-started)*1000, (summary_finished-summary_started)*1000, (validated-summary_finished)*1000, (verified-validated)*1000, result['classNumber']]",
    "else:",
    "    phase_result = [0, result['classNumber']]",
    "phase_result",
  ].join("\n"));
  const presentation = JSON.parse(presentationResponse.repr);
  if ((presentation[0] === 0 && presentation[1] !== expectedClassNumber) ||
      (presentation[0] === 1 && presentation[5] !== expectedClassNumber)) {
    throw new Error("presentation phase diagnostic returned the wrong class number");
  }
  if (presentation[0] === 1) {
    const [, publicReceiptMs, summaryServiceMs, validationMs, detachedVerificationMs] = presentation;
    if (![publicReceiptMs, summaryServiceMs, validationMs, detachedVerificationMs]
      .every((value) => Number.isFinite(value) && value >= 0)) {
      throw new Error("presentation phase diagnostic omitted a timing");
    }
    return { publicReceiptMs, summaryServiceMs, validationMs, detachedVerificationMs,
      note: "Summary and detached verification timings come from a separate replay after the public receipt; they are not additive components of publicReceiptMs." };
  }
  const response = await sage.evaluate([
    "import time",
    "import sagejs.runtime as runtime",
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
    "certificate = result['certificate'].get('reducedFormsPacked', [])",
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
    "host = runtime.reflect.get(runtime.global_object, '__sagejs_host__')",
    "request = {'polynomialAscending': rust_runtime._imaginary_polynomial(K)[1]}",
    "encoded_request = runtime.json.parse(runtime.canonical_json_exact(request))",
    "host_started = time.perf_counter()",
    "envelope = runtime.reflect.apply(runtime.reflect.get(host, 'call'), host,",
    "    ['classGroupCompact', ['imaginary-class-group', encoded_request]])",
    "host_finished = time.perf_counter()",
    "assert runtime.reflect.get(envelope, 'ok')",
    "plain_response = runtime.reflect.get(envelope, 'value')",
    "converter = runtime.reflect.get(runtime.global_object, 'ρσ_plain_json_to_python')",
    "converted_response = runtime.reflect.apply(converter, runtime.undefined, [plain_response])",
    "conversion_finished = time.perf_counter()",
    "assert converted_response['result']['classNumber'] == len(forms)",
    "[(received - started) * 1000, (validated - received) * 1000, (compact_validated - validated) * 1000, len(forms), len(coordinates), (packed - packing_started) * 1000, (verified - packed) * 1000, (materialized - verified) * 1000, (host_finished - host_started) * 1000, (conversion_finished - host_finished) * 1000]",
  ].join("\n"));
  const [serviceAndConversionMs, independentValidationMs, compactValidationMs, forms, coordinates,
    validatedPackingMs, kernelMs, materializeMs, hostServiceMs, pythonConversionMs] =
    JSON.parse(response.repr);
  if (forms !== expectedClassNumber || coordinates !== expectedClassNumber ||
      !Number.isFinite(serviceAndConversionMs) || !Number.isFinite(independentValidationMs) ||
      !Number.isFinite(compactValidationMs) || !Number.isFinite(hostServiceMs) ||
      !Number.isFinite(pythonConversionMs)) {
    throw new Error("phase diagnostic did not validate the complete class map");
  }
  return { serviceAndConversionMs, hostServiceMs, pythonConversionMs,
    independentValidationMs, compactValidationMs,
    exactMapRecheck: { validatedPackingMs, kernelMs, materializeMs } };
}

async function main() {
  const { samples, fields, phases, repeatedPhases, receipt } =
    parseArguments(process.argv.slice(2));
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
      const evaluationBoundary = phases
        ? await diagnoseEvaluationBoundary(
          sage, freshCall, expected, scalarCall,
          String(field.expected.classNumber), samples,
        )
        : undefined;
      const phaseDiagnostic = phases
        ? await diagnosePhases(sage, field.expected.classNumber)
        : undefined;
      const repeatedCellPhases = repeatedPhases
        ? await diagnoseRepeatedCellPhases(sage, field, samples)
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
        ...(evaluationBoundary === undefined ? {} : { evaluationBoundary }),
        ...(repeatedCellPhases === undefined ? {} : { repeatedCellPhases }),
      });
      process.stderr.write(`${JSON.stringify(results[results.length - 1])}\n`);
    }
  } finally {
    await sage.close();
  }
  const output = `${JSON.stringify({
    schema: "sagejs.public-quadratic/public-sagejs-latency-diagnostic-v1",
    panelSchema: panel.schema,
    promotedPerformanceReceipt: false,
    boundary: "warm-node-kernel-evaluate-public-sagejs-call-v1",
    caveat: "Includes public Python/Sage.js dispatch, exact presentation or map validation, and kernel evaluation overhead; excludes kernel startup and field construction. The optional evaluation-boundary probe separates parent-observed wall time from the evaluator's execution-only duration; their difference is not attributed to any one phase. Not directly comparable to the promoted Rust/PARI coefficient boundary.",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    samplesPerField: samples,
    phaseDiagnosticEnabled: phases,
    repeatedCellPhaseEnabled: repeatedPhases,
    ...(repeatedPhases ? {
      repeatedCellPhaseCaveat: "Each exact source is evaluated consecutively after one warmup. These separate medians are not additive, cannot isolate a causal speedup, and must not be substituted for the matched public Sage.js/PARI panel.",
      runnerSha256: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"),
      panelSha256: crypto.createHash("sha256").update(
        fs.readFileSync(path.join(__dirname, "panel-v2.json")),
      ).digest("hex"),
      sageBuildReceiptSha256: crypto.createHash("sha256").update(
        fs.readFileSync(path.join(root, "dist/build-receipt.json")),
      ).digest("hex"),
      serviceSha256: crypto.createHash("sha256").update(fs.readFileSync(service)).digest("hex"),
      cpuModel: os.cpus()[0]?.model,
      loadAverage1m5m15m: os.loadavg(),
    } : {}),
    results,
  }, null, 2)}\n`;
  if (receipt !== undefined) fs.writeFileSync(path.join(__dirname, receipt), output);
  process.stdout.write(output);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { parseArguments, expectedGroup, median, timedBoundary,
  diagnosePhases, diagnoseEvaluationBoundary, diagnoseRepeatedCellPhases };
