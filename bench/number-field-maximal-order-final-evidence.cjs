#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const { evaluateGates, gatesMarkdown } = require("./number-field-maximal-order-final-evidence/gates.cjs");
const {
  evidenceMarkdown,
  planEvidenceRun,
  runColdEvidence,
  runDiagnosticEvidence,
  runPrimaryEvidence,
  runRandomizedGeneratorEvidence,
  writeEvidence,
} = require("./number-field-maximal-order-final-evidence/runner.cjs");

function usage() {
  return `Usage:
  node bench/number-field-maximal-order-final-evidence.cjs validate
  node bench/number-field-maximal-order-final-evidence.cjs plan [options]
  node bench/number-field-maximal-order-final-evidence.cjs run [options]
  node bench/number-field-maximal-order-final-evidence.cjs randomized [options]
  node bench/number-field-maximal-order-final-evidence.cjs cold [options]
  node bench/number-field-maximal-order-final-evidence.cjs diagnose --primary REPORT [options]
  node bench/number-field-maximal-order-final-evidence.cjs gates --reports A.json,B.json [options]

Runner options:
  --selection NAME        standard, stress, round4, hecke, equivalent, quick, all
  --systems LIST          comma-separated systems (default: sagejs)
  --sagejs-boundaries L   comma-separated Sage.js evidence boundaries
  --cases LIST            exact comma-separated corpus case ids
  --samples N             retained samples (default: 1)
  --warmups N             discarded warmups (default: 0)
  --timeout-ms N          uniform per-record timeout
  --memory-mb N           process memory policy
  --system-memory-mb MAP  comma-separated system=MiB overrides
  --include-magma         opt in to the Magma adapter
  --output PATH           JSON artifact
  --markdown PATH         human-readable summary
  --sage PATH             Sage/sagelite executable
  --pari PATH             GP/PARI executable
  --julia PATH            Julia executable
  --magma PATH            Magma executable
  --hecke-project PATH    pinned Hecke project
  --oscar-project PATH    pinned Oscar project
  --platform-validation P attach an authenticated same-commit platform receipt

Randomized options:
  --randomized-seed N     deterministic generator schedule seed
  --randomized-count N    translated generator cases (default: 8)

Diagnostic options:
  --primary PATH          immutable uniform-primary evidence report
  --diagnostic-states L   states to rerun (default: timeout)

Gate options:
  --reports LIST          comma-separated final evidence reports
  --reference-host KEY    exact platform-arch@hostname (required with multiple hosts)

The run and stress commands may be very expensive. Use plan first. A diagnostic
artifact is always labeled non-substituting and cannot satisfy uniform corpus gates.`;
}

function parseArguments(argv) {
  const positional = [];
  const options = {};
  const booleans = new Set(["--help", "--include-magma"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    if (booleans.has(argument)) {
      options[argument.slice(2)] = true;
      continue;
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    options[argument.slice(2)] = value;
  }
  return { positional, options };
}

function numberOption(value, label, { zero = false } = {}) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (zero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`${label} must be ${zero ? "nonnegative" : "positive"}`);
  }
  return parsed;
}

function list(value) {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function memoryMap(value) {
  if (!value) return undefined;
  return Object.fromEntries(list(value).map((entry) => {
    const [system, amount] = entry.split("=");
    if (!system || !amount) throw new Error(`invalid memory entry ${entry}`);
    return [system, numberOption(amount, `memory for ${system}`)];
  }));
}

function runnerOptions(options) {
  const warmups = numberOption(options.warmups, "--warmups", { zero: true });
  const samples = numberOption(options.samples, "--samples");
  if (warmups !== undefined && !Number.isInteger(warmups)) {
    throw new Error("--warmups must be an integer");
  }
  if (samples !== undefined && !Number.isInteger(samples)) {
    throw new Error("--samples must be an integer");
  }
  return {
    selection: options.selection,
    systems: list(options.systems),
    sagejsBoundaries: list(options["sagejs-boundaries"]),
    caseIds: list(options.cases),
    samples,
    warmups,
    timeoutMs: numberOption(options["timeout-ms"], "--timeout-ms"),
    memoryMb: numberOption(options["memory-mb"], "--memory-mb"),
    systemMemoryMb: memoryMap(options["system-memory-mb"]),
    enableMagma: Boolean(options["include-magma"]),
    sage: options.sage,
    pari: options.pari,
    julia: options.julia,
    magma: options.magma,
    heckeProject: options["hecke-project"],
    oscarProject: options["oscar-project"],
    platformValidationPath: options["platform-validation"],
    randomizedSeed: numberOption(options["randomized-seed"], "--randomized-seed", { zero: true }),
    randomizedCount: numberOption(options["randomized-count"], "--randomized-count"),
  };
}

async function main(argv) {
  const { positional, options } = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const command = positional[0] || "plan";
  if (command === "validate") {
    const selections = ["standard", "stress", "round4", "hecke", "equivalent", "quick", "all"];
    const plans = Object.fromEntries(selections.map((selection) => [
      selection,
      planEvidenceRun({ selection }),
    ]));
    console.log(
      `validated final evidence selections: ${selections.map((selection) => `${selection}=${plans[selection].case_count}`).join(", ")}`,
    );
    return;
  }
  if (command === "plan") {
    console.log(JSON.stringify(planEvidenceRun(runnerOptions(options)), null, 2));
    return;
  }
  if (command === "gates") {
    const reportPaths = list(options.reports);
    if (!reportPaths?.length) throw new Error("gates requires --reports");
    const reports = reportPaths.map((path) => JSON.parse(readFileSync(resolve(path), "utf8")));
    const receipt = evaluateGates(reports, { referenceHost: options["reference-host"] });
    if (options.output) writeFileSync(resolve(options.output), `${JSON.stringify(receipt, null, 2)}\n`);
    const markdown = gatesMarkdown(receipt);
    if (options.markdown) writeFileSync(resolve(options.markdown), markdown);
    console.log(markdown);
    if (receipt.summary.fail > 0) process.exitCode = 2;
    return;
  }

  let report;
  if (command === "run") {
    report = await runPrimaryEvidence(runnerOptions(options));
  } else if (command === "randomized") {
    report = await runRandomizedGeneratorEvidence(runnerOptions(options));
  } else if (command === "cold") {
    report = await runColdEvidence(runnerOptions(options));
  } else if (command === "diagnose") {
    if (!options.primary) throw new Error("diagnose requires --primary");
    report = await runDiagnosticEvidence(resolve(options.primary), {
      ...runnerOptions(options),
      diagnosticStates: list(options["diagnostic-states"]) || ["timeout"],
    });
  } else {
    throw new Error(`unknown command ${command}\n\n${usage()}`);
  }
  writeEvidence(
    report,
    options.output ? resolve(options.output) : null,
    options.markdown ? resolve(options.markdown) : null,
  );
  console.log(evidenceMarkdown(report));
  if (!report.raw_terminal_accounting.complete || report.summary.rejected_exactness_count > 0) {
    process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
