#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

function usage() {
  return [
    "usage: node scripts/optimizer-profile.cjs [options] SOURCE",
    "",
    "Profile one Python/Sage source file with the authenticated Node sampler.",
    "Without --entry, the scope is a cold generated-JavaScript load plus execution.",
    "With --entry, root load, lazy imports, --prepare, and warmups happen before",
    "sampling; the authenticated module closure is then sealed and only repeated",
    "entry calls are sampled. Late lazy imports fail instead of losing attribution.",
    "",
    "options:",
    "  --language python|sage       source language (default: sage)",
    "  --sampling-interval MICROS  requested Inspector interval (default: 500)",
    "  --entry FUNCTION            sample one prepared zero-argument function",
    "  --prepare FUNCTION          call once after root load and before warmups",
    "  --warmups COUNT             entry warmups before sampling (default: 1)",
    "  --repetitions COUNT         entry calls inside sampling (default: 1)",
    "  --envelope FILE             attach sampling to a validated phase receipt",
    "  --output FILE               write JSON receipt to FILE instead of stdout",
    "  --help                      show this message",
  ].join("\n");
}

function parseArguments(argv) {
  let language = "sage";
  let samplingIntervalMicros = 500;
  let output;
  let entryPoint;
  let prepareEntryPoint;
  let warmupRuns;
  let repetitions;
  let envelope;
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
    if (argument === "--prepare") {
      prepareEntryPoint = argv[++index];
      if (!prepareEntryPoint || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(prepareEntryPoint)) {
        throw new Error("--prepare requires a Python identifier");
      }
      continue;
    }
    if (argument === "--warmups" || argument === "--repetitions") {
      const raw = argv[++index];
      const value = Number(raw);
      const minimum = argument === "--warmups" ? 0 : 1;
      if (!raw || !Number.isSafeInteger(value) || value < minimum) {
        throw new Error(`${argument} requires an integer at least ${minimum}`);
      }
      if (argument === "--warmups") warmupRuns = value;
      else repetitions = value;
      continue;
    }
    if (argument === "--envelope") {
      envelope = argv[++index];
      if (!envelope) throw new Error("--envelope requires a profile receipt path");
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
  if (!entryPoint &&
      (prepareEntryPoint !== undefined || warmupRuns !== undefined || repetitions !== undefined)) {
    throw new Error("--prepare, --warmups, and --repetitions require --entry");
  }
  return {
    help: false,
    language,
    samplingIntervalMicros,
    output,
    entryPoint,
    prepareEntryPoint,
    warmupRuns,
    repetitions,
    envelope,
    source,
  };
}

function profileProcessEvidence(
  options,
  phaseEnvironmentDigest,
  execArgv = process.execArgv,
  environment = process.env,
) {
  const nodeExecArgv = execArgv.map((argument) => String(argument));
  const capabilities = ["optimizer-source-sampling"];
  if (nodeExecArgv.includes("--no-turbo-inlining")) {
    capabilities.push("v8-turbo-inlining-disabled");
  }
  return {
    capabilities,
    environment: {
      phase: phaseEnvironmentDigest,
      language: options.language,
      entryPoint: options.entryPoint ?? null,
      prepareEntryPoint: options.prepareEntryPoint ?? null,
      warmupRuns: options.warmupRuns ?? (options.entryPoint ? 1 : 0),
      repetitions: options.repetitions ?? 1,
      samplingIntervalMicros: options.samplingIntervalMicros,
      nodeExecArgv,
      hyperellipticReceiptPolicy:
        environment.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY ?? null,
    },
  };
}

function assembleReceipt(envelopeFilename, result, options) {
  const phase = JSON.parse(readFileSync(resolve(envelopeFilename), "utf8"));
  const {
    assembleValidatedOptimizerProfileReceipt,
  } = require("../dist/tools/optimizer-profiler.js");
  const {
    sourceBundleFromRecords,
  } = require("../tools/optimizer-development/identity.cjs");
  const {
    canonicalJson,
    sha256,
  } = require("../tools/optimizer-development/common.cjs");
  if (phase.schema !== "sagejs.optimizer-profile-receipt/v1") {
    throw new Error("--envelope must name a validated optimizer profile receipt");
  }
  const files = new Map(phase.sourceBundle.files.map((file) => [file.path, file]));
  for (const map of result.sourceMaps) {
    const file = {
      path: map.source.identity.path,
      digest: map.source.identity.digest,
      bytes: map.source.bytes,
    };
    const previous = files.get(file.path);
    if (previous && (previous.digest !== file.digest || previous.bytes !== file.bytes)) {
      throw new Error(`profile source conflicts with envelope source: ${file.path}`);
    }
    files.set(file.path, file);
  }
  const {
    schema: _schema,
    id: _id,
    sampling: _sampling,
    runtime: _runtime,
    ...payload
  } = phase;
  payload.authority = "host-collector-with-private-evaluator-evidence";
  payload.sourceBundle = sourceBundleFromRecords([...files.values()]);
  payload.capability = {
    ...payload.capability,
    sourceSampling: "inspector-position-ticks",
  };
  const processEvidence = profileProcessEvidence(
    options,
    payload.configuration.environmentDigest,
  );
  payload.configuration = {
    ...payload.configuration,
    mode: options.language,
    capabilities: [...new Set([
      ...payload.configuration.capabilities,
      ...processEvidence.capabilities,
    ])].sort(),
    environmentDigest: sha256(canonicalJson(processEvidence.environment)),
  };
  return assembleValidatedOptimizerProfileReceipt(payload, result.observation);
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
      prepareEntryPoint: options.prepareEntryPoint,
      warmupRuns: options.warmupRuns,
      repetitions: options.repetitions,
      suppressResult: options.entryPoint === undefined,
    });
    const receipt = options.envelope
      ? assembleReceipt(options.envelope, result, options)
      : {
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

module.exports = { main, parseArguments, profileProcessEvidence, usage };
