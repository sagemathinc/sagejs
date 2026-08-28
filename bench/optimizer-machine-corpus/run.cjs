#!/usr/bin/env node
"use strict";

const { writeFileSync } = require("node:fs");
const path = require("node:path");

const {
  loadCubicProfiler,
  loadPariEvidence,
} = require("./adapters.cjs");
const { runHarness } = require("./harness.cjs");

function optionValue(argv, index, argument) {
  if (argument.includes("=")) return [argument.slice(argument.indexOf("=") + 1), index];
  if (index + 1 >= argv.length) throw new Error(`${argument} requires a value`);
  return [argv[index + 1], index + 1];
}

function parseArguments(argv) {
  const options = {
    check: false,
    samples: null,
    compileSamples: null,
    scale: null,
    domains: null,
    cubicProfile: null,
    pariEvidence: null,
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--check") options.check = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (/^--(?:samples|compile-samples|scale|domains|cubic-profile|pari-evidence|output)(?:=|$)/.test(argument)) {
      const name = argument.slice(2).split("=", 1)[0];
      const [value, consumed] = optionValue(argv, index, argument);
      index = consumed;
      const key = {
        "samples": "samples",
        "compile-samples": "compileSamples",
        "scale": "scale",
        "domains": "domains",
        "cubic-profile": "cubicProfile",
        "pari-evidence": "pariEvidence",
        "output": "output",
      }[name];
      options[key] = value;
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  if (options.samples !== null) options.samples = Number(options.samples);
  if (options.compileSamples !== null) {
    options.compileSamples = Number(options.compileSamples);
  }
  if (options.scale !== null) options.scale = Number(options.scale);
  if (options.domains !== null) {
    options.domains = options.domains.split(",").filter(Boolean);
    if (options.domains.length === 0) throw new Error("--domains must not be empty");
  }
  return options;
}

function usage() {
  return `Usage: node bench/optimizer-machine-corpus/run.cjs [options]

  --check                    use short deterministic evidence sizes
  --samples N                execution samples per domain and runtime
  --compile-samples N        O0/O2 frontend samples per domain
  --scale N                  multiply the reviewed workload sizes
  --domains A,B              run a subset of the five stable domain IDs
  --cubic-profile FILE       adapt RESULT output from origin/class-group's profiler
  --pari-evidence FILE       adapt its LMFDB Sage/PARI benchmark receipt
  --output FILE              also write the combined JSON receipt
`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return null;
  }
  const checkDefaults = options.check
    ? { samples: 3, compileSamples: 3, scale: 0.05 }
    : { samples: 5, compileSamples: 5, scale: 1 };
  const receipt = await runHarness({
    samples: options.samples ?? checkDefaults.samples,
    compileSamples: options.compileSamples ?? checkDefaults.compileSamples,
    scale: options.scale ?? checkDefaults.scale,
    domains: options.domains,
  });
  receipt.held_out = {
    cubic_profiler: options.cubicProfile
      ? loadCubicProfiler(path.resolve(options.cubicProfile))
      : null,
    sage_pari: options.pariEvidence
      ? loadPariEvidence(path.resolve(options.pariEvidence))
      : null,
  };
  const encoded = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.output) writeFileSync(path.resolve(options.output), encoded, "utf8");
  process.stdout.write(encoded);
  return receipt;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArguments, usage };
