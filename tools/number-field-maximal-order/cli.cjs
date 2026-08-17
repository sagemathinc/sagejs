#!/usr/bin/env node
"use strict";

const { resolve } = require("node:path");
const { localCapabilities } = require("./adapters.cjs");
const { loadManifest, reportMarkdown, runManifest, writeReport } = require("./runner.cjs");

const DEFAULT_MANIFEST = resolve(__dirname, "../../bench/number-field-maximal-order-manifest.json");

function usage() {
  return `Usage:
  node tools/number-field-maximal-order/cli.cjs validate [--manifest PATH]
  node tools/number-field-maximal-order/cli.cjs capabilities
  node tools/number-field-maximal-order/cli.cjs run [options]

Run options:
  --manifest PATH          manifest (default: bench/number-field-maximal-order-manifest.json)
  --profile NAME           quick, baseline, or stress (default: baseline)
  --systems LIST           comma-separated adapter ids
  --cases LIST             comma-separated case ids
  --samples N              retained samples per warmed adapter
  --warmups N              discarded warmup samples
  --timeout-ms N           fallback per-request time limit
  --memory-mb N            per-persistent-process address-space limit
  --system-memory-mb MAP   comma-separated system=MiB overrides
  --local-primes LIST      comma-separated local-prime-only restriction
  --include-cold           record first-process cold application evidence
  --magma                  enable the proprietary, opt-in Magma adapter
  --output PATH            machine-readable JSON report
  --markdown PATH          checked human-readable summary
  --sage PATH              Sage/sagelite executable
  --pari PATH              GP/PARI executable
  --julia PATH             Julia executable
  --magma-path PATH        Magma executable
  --hecke-project PATH     pinned Hecke project
  --oscar-project PATH     pinned Oscar project

Every adapter is persistent and bounded. Missing executables, timeouts,
crashes, unsupported inputs, invalid bases, and oracle disagreements are
retained as explicit terminal states.`;
}

function parseArguments(argv) {
  const options = {};
  const positional = [];
  const booleans = new Set(["--include-cold", "--magma", "--help"]);
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

function positiveNumber(value, label) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be positive`);
  return number;
}

function systemMemoryMap(value) {
  if (!value) return undefined;
  return Object.fromEntries(value.split(",").map((entry) => {
    const [system, amount] = entry.split("=");
    if (!system || !amount) throw new Error(`invalid --system-memory-mb entry ${entry}`);
    return [system, positiveNumber(amount, `memory for ${system}`)];
  }));
}

async function main(argv) {
  const { positional, options } = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const command = positional[0] || "run";
  const manifestPath = resolve(options.manifest || DEFAULT_MANIFEST);
  if (command === "capabilities") {
    console.log(JSON.stringify(localCapabilities({
      sage: options.sage,
      pari: options.pari,
      julia: options.julia,
      magma: options["magma-path"],
      probeMagma: true,
    }), null, 2));
    return;
  }
  const manifest = loadManifest(manifestPath);
  if (command === "validate") {
    console.log(`validated ${manifest.cases.length} maximal-order cases in ${manifestPath}`);
    return;
  }
  if (command !== "run") throw new Error(`unknown command ${command}`);
  const config = {
    profile: options.profile || "baseline",
    systems: options.systems?.split(",").filter(Boolean),
    caseIds: options.cases?.split(",").filter(Boolean),
    samples: positiveNumber(options.samples, "--samples"),
    warmups: options.warmups === undefined ? undefined : Number(options.warmups),
    timeoutMs: positiveNumber(options["timeout-ms"], "--timeout-ms"),
    memoryMb: positiveNumber(options["memory-mb"], "--memory-mb"),
    systemMemoryMb: systemMemoryMap(options["system-memory-mb"]),
    localPrimes: options["local-primes"]?.split(",").filter(Boolean),
    includeCold: Boolean(options["include-cold"]),
    enableMagma: Boolean(options.magma),
    sage: options.sage,
    pari: options.pari,
    julia: options.julia,
    magma: options["magma-path"],
    heckeProject: options["hecke-project"],
    oscarProject: options["oscar-project"],
  };
  if (!Number.isInteger(config.warmups ?? 0) || (config.warmups ?? 0) < 0) {
    throw new Error("--warmups must be a nonnegative integer");
  }
  const report = await runManifest(manifest, config);
  writeReport(
    report,
    options.output ? resolve(options.output) : null,
    options.markdown ? resolve(options.markdown) : null,
  );
  console.log(reportMarkdown(report));
  if (report.summary.rejected_timing_records > 0) process.exitCode = 2;
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
