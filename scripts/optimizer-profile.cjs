#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

function usage() {
  return [
    "usage: node scripts/optimizer-profile.cjs [options] SOURCE",
    "",
    "Profile one Python/Sage source file with the authenticated Node sampler.",
    "The scope is a cold generated-JavaScript load plus execution. Lazy modules",
    "are compiled from exact current Python source with authenticated sidecar maps;",
    "normal writable and production caches are bypassed without modification.",
    "",
    "options:",
    "  --language python|sage       source language (default: sage)",
    "  --sampling-interval MICROS  requested Inspector interval (default: 500)",
    "  --entry FUNCTION            call one zero-argument function after loading",
    "  --output FILE               write JSON receipt to FILE instead of stdout",
    "  --help                      show this message",
  ].join("\n");
}

function parseArguments(argv) {
  let language = "sage";
  let samplingIntervalMicros = 500;
  let output;
  let entryPoint;
  let source;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--language") {
      language = argv[++index];
      if (!language) throw new Error("--language requires python or sage");
      continue;
    }
    if (argument === "--sampling-interval") {
      const raw = argv[++index];
      samplingIntervalMicros = Number(raw);
      if (!raw || !Number.isSafeInteger(samplingIntervalMicros)) {
        throw new Error("--sampling-interval requires an integer number of microseconds");
      }
      continue;
    }
    if (argument === "--output") {
      output = argv[++index];
      if (!output) throw new Error("--output requires a path");
      continue;
    }
    if (argument === "--entry") {
      entryPoint = argv[++index];
      if (!entryPoint || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(entryPoint)) {
        throw new Error("--entry requires a Python identifier");
      }
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    if (source) throw new Error("only one source file may be profiled");
    source = argument;
  }
  if (language !== "python" && language !== "sage") {
    throw new Error(`unsupported language: ${language}`);
  }
  if (!source) throw new Error("a source file is required");
  return { help: false, language, samplingIntervalMicros, output, entryPoint, source };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const filename = resolve(options.source);
  const source = readFileSync(filename, "utf8");
  let createKernelEvaluatorAsync;
  try {
    ({ createKernelEvaluatorAsync } = require("../dist/tools/kernel-evaluator.js"));
  } catch (error) {
    throw new Error("optimizer profiler requires a current `pnpm build`", {
      cause: error,
    });
  }
  const evaluator = await createKernelEvaluatorAsync({
    mode: options.language,
    onOutput(text) {
      process.stderr.write(text);
    },
  });
  try {
    const result = await evaluator.profile(source, {
      filename,
      language: options.language,
      samplingIntervalMicros: options.samplingIntervalMicros,
      entryPoint: options.entryPoint,
      suppressResult: options.entryPoint === undefined,
    });
    const receipt = {
      schema: "sagejs.optimizer-profile-cli/v1",
      profileMap: result.sourceMap,
      profileMaps: result.sourceMaps,
      evaluation: result.evaluation,
      observation: result.observation,
    };
    const json = `${JSON.stringify(receipt, null, 2)}\n`;
    if (options.output) writeFileSync(resolve(options.output), json);
    else process.stdout.write(json);
  } finally {
    evaluator.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArguments, usage };
