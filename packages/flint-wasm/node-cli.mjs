#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  writeFile,
} from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpuUsage, stdin, stdout, stderr } from "node:process";

import { createSage } from "./node-kernel.mjs";

const artifactSchema = "sagejs.wasm-production-artifact/v1";
const buildReceiptSchema = "sagejs.wasm-build-receipt/v1";
const diagnosticSchema = "sagejs.node-wasm-evaluation-receipt/v1";

function usage() {
  return `Sage.js production WebAssembly kernel for Node

Usage:
  sagejs --wasm [OPTIONS] [FILE]
  sagejs --wasm [OPTIONS] -c SOURCE
  echo 'factor(2026)' | sagejs --wasm [OPTIONS]
  sagejs-wasm [OPTIONS] [FILE]
  sagejs-wasm [OPTIONS] -c SOURCE

Options:
  -c SOURCE                 Evaluate SOURCE.
  --timeout MS              Replace the evaluator if a run exceeds MS.
  --diagnostics             Write one JSON route receipt per run to stderr.
  --diagnostics-file FILE   Write the final JSON route receipt to FILE.
  --verify-only             Authenticate the production artifact and exit.
  -h, --help                Show this help.

With no file or piped input, starts a line-oriented Sage REPL.  Enter :reset
to replace the evaluator, or :quit to exit.  This command runs the exact
receipt-authenticated WebAssembly artifact used by the browser.  It is a
mathematics test/debug harness, not a shell or a Unix compatibility layer.`;
}

function positiveTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("--timeout requires a positive number of milliseconds");
  }
  return timeout;
}

export function argumentsFrom(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "--verify-only") {
      options.verifyOnly = true;
    } else if (argument === "--diagnostics") {
      options.diagnostics = true;
    } else if (argument === "--diagnostics-file") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("--diagnostics-file requires a filename");
      }
      options.diagnosticsFile = argv[index];
    } else if (argument === "--timeout") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("--timeout requires a value");
      }
      options.timeout = positiveTimeout(argv[index]);
    } else if (argument.startsWith("--timeout=")) {
      options.timeout = positiveTimeout(argument.slice("--timeout=".length));
    } else if (argument === "-c") {
      index += 1;
      if (index >= argv.length) throw new Error("-c requires a source argument");
      if (options.source !== undefined) throw new Error("-c may only be used once");
      options.source = argv[index];
      options.filename = "<command>";
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  if (options.help) return { help: true };
  if (positional.length > 1) throw new Error("expected at most one Sage source file");
  if (options.source !== undefined && positional.length !== 0) {
    throw new Error("a source file and -c cannot be used together");
  }
  if (options.verifyOnly && (options.source !== undefined || positional.length !== 0)) {
    throw new Error("--verify-only does not accept Sage source");
  }
  if (positional.length === 1) options.file = positional[0];
  return options;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function replTimeDirective(source) {
  const percentPrefix = source.match(/^[ \t]*%time(?:[ \t]+|$)/);
  const plainPrefix = percentPrefix
    ? null
    : source.match(/^[ \t]*time(?:[ \t]+|$)/);
  const prefix = percentPrefix ?? plainPrefix;
  if (!prefix) return undefined;
  let rest = source.slice(prefix[0].length);
  if (plainPrefix && /^[ \t]*=/.test(rest)) return undefined;
  const separator = rest.match(/^--(?:[ \t]+|$)/);
  if (separator) rest = rest.slice(separator[0].length);
  else if (/^--[A-Za-z]/.test(rest)) {
    const name = rest.match(/^--[^ \t\r\n]*/)?.[0] ?? rest;
    throw new TypeError(`unsupported %time option ${name}`);
  }
  if (!rest.trim()) throw new TypeError("%time requires a statement");
  return { source: rest };
}

function formatMilliseconds(value) {
  return `${value.toFixed(3)}ms`;
}

function safeArtifactPath(root, name) {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    isAbsolute(name) ||
    name.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`unsafe production artifact path ${JSON.stringify(name)}`);
  }
  const filename = resolve(root, name);
  if (!filename.startsWith(`${resolve(root)}${sep}`)) {
    throw new Error(`production artifact path escapes distribution: ${name}`);
  }
  return filename;
}

async function exactRegularFile(filename, description) {
  let status;
  try {
    status = await lstat(filename);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${description} is missing`);
    throw error;
  }
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${description} must be a regular file`);
  }
  return { status, bytes: await readFile(filename) };
}

/**
 * Authenticate every byte selected by the Node evaluator and prove that its
 * package-root runtime sources are the exact copies named by the production
 * receipt.  This second check matters because Node imports those sources
 * directly, whereas browsers serve their `dist/runtime` copies.
 */
export async function verifyProductionArtifact({
  packageRoot = dirname(fileURLToPath(import.meta.url)),
  distDirectory = resolve(packageRoot, "dist"),
  sourceRoot = packageRoot,
} = {}) {
  const manifestRecord = await exactRegularFile(
    resolve(distDirectory, "production-manifest.json"),
    "WebAssembly production manifest",
  );
  const receiptRecord = await exactRegularFile(
    resolve(distDirectory, "build-receipt.json"),
    "WebAssembly production build receipt",
  );
  let manifest;
  let receipt;
  try {
    manifest = JSON.parse(manifestRecord.bytes);
    receipt = JSON.parse(receiptRecord.bytes);
  } catch {
    throw new Error("WebAssembly production manifest or build receipt is invalid JSON");
  }
  if (manifest.schema !== artifactSchema) {
    throw new Error(`unsupported WebAssembly production manifest schema ${manifest.schema}`);
  }
  if (receipt.schema !== buildReceiptSchema) {
    throw new Error(`unsupported WebAssembly build receipt schema ${receipt.schema}`);
  }
  if (receipt.productionManifestSha256 !== sha256(manifestRecord.bytes)) {
    throw new Error("WebAssembly build receipt does not authenticate the production manifest");
  }
  if (!isDeepStrictEqual(receipt.artifact, manifest)) {
    throw new Error("WebAssembly production manifest and build receipt artifact differ");
  }
  const computedIdentity = `sha256:${sha256(canonicalJson({
    layout: manifest.layout,
    assets: manifest.assets,
    capabilities: manifest.capabilities,
    topology: manifest.topology,
  }))}`;
  if (manifest.identity !== computedIdentity) {
    throw new Error("WebAssembly production artifact identity differs");
  }
  for (const asset of manifest.assets ?? []) {
    const filename = safeArtifactPath(distDirectory, asset.path);
    const record = await exactRegularFile(filename, `WebAssembly asset ${asset.path}`);
    if (record.status.size !== asset.bytes || sha256(record.bytes) !== asset.sha256) {
      throw new Error(`WebAssembly asset digest differs: ${asset.path}`);
    }
    if (asset.path.startsWith("runtime/")) {
      const sourceFilename = safeArtifactPath(sourceRoot, asset.servePath);
      const source = await exactRegularFile(
        sourceFilename,
        `Node runtime source ${asset.servePath}`,
      );
      if (source.status.size !== asset.bytes || sha256(source.bytes) !== asset.sha256) {
        throw new Error(
          `Node runtime source does not match the production artifact: ${asset.servePath}. ` +
          "Rebuild it with `pnpm --dir packages/flint-wasm build` after `pnpm build`.",
        );
      }
    }
  }
  return Object.freeze({
    artifactIdentity: manifest.identity,
    manifestSha256: receipt.productionManifestSha256,
    sourceRevision:
      receipt.source?.gitCommit ?? receipt.source?.revision ?? null,
  });
}

function sourceReceipt(source, filename) {
  const bytes = Buffer.from(source);
  return { filename, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function diagnosticReceipt({
  artifact,
  source,
  timeout,
  result,
  elapsed,
  error,
  sessionRecovered,
}) {
  return {
    schema: diagnosticSchema,
    artifact_identity: artifact.artifactIdentity,
    production_manifest_sha256: artifact.manifestSha256,
    source_revision: artifact.sourceRevision,
    source,
    timeout_ms: timeout ?? null,
    elapsed_ms: elapsed,
    outcome: error === undefined ? "ok" : error.name === "SageSessionTimeoutError"
      ? "timeout" : "error",
    error: error === undefined ? null : { name: error.name, message: error.message },
    session_recovered: sessionRecovered,
    instrumentation: result?.instrumentation ?? null,
  };
}

async function emitDiagnostic(receipt, options, errorOutput) {
  const encoded = `${JSON.stringify(receipt)}\n`;
  if (options.diagnostics) errorOutput.write(encoded);
  if (options.diagnosticsFile !== undefined) {
    await writeFile(options.diagnosticsFile, encoded, "utf8");
  }
}

async function evaluate(
  session,
  source,
  filename,
  options,
  artifact,
  output,
  errorOutput,
  timed = false,
) {
  const started = performance.now();
  const cpuStarted = timed ? cpuUsage() : undefined;
  let result;
  let failure;
  let sessionRecovered = null;
  try {
    result = await session.evaluate(source, {
      filename,
      timeout: options.timeout,
      onOutput: (text) => output.write(text),
      onError: (text) => errorOutput.write(text),
    });
    if (result.repr && result.repr !== "None") output.write(`${result.repr}\n`);
    return result;
  } catch (error) {
    failure = error;
    if (error?.name === "SageSessionTimeoutError" && typeof session.ready === "function") {
      // The timeout rejects the evaluation as soon as the old worker is
      // terminated. Wait for its replacement before closing or returning so
      // the replacement's ready promise cannot become an unhandled rejection.
      await session.ready();
      sessionRecovered = true;
    }
    throw error;
  } finally {
    const elapsed = performance.now() - started;
    if (timed && failure === undefined) {
      const cpu = cpuUsage(cpuStarted);
      const user = cpu.user / 1000;
      const system = cpu.system / 1000;
      output.write(
        `CPU times: user ${formatMilliseconds(user)}, ` +
        `sys: ${formatMilliseconds(system)}, ` +
        `total: ${formatMilliseconds(user + system)}\n` +
        `Wall time: ${formatMilliseconds(elapsed)}\n`,
      );
    }
    await emitDiagnostic(diagnosticReceipt({
      artifact,
      source: sourceReceipt(source, filename),
      timeout: options.timeout,
      result,
      elapsed: Math.round(elapsed * 1000) / 1000,
      error: failure,
      sessionRecovered,
    }), options, errorOutput);
  }
}

async function readStandardInput(input) {
  let source = "";
  input.setEncoding?.("utf8");
  for await (const chunk of input) source += chunk;
  return source;
}

export async function runCli({
  argv = process.argv.slice(2),
  input = stdin,
  output = stdout,
  errorOutput = stderr,
  createSession = createSage,
  verifyArtifact = verifyProductionArtifact,
} = {}) {
  const options = argumentsFrom(argv);
  if (options.help) {
    output.write(`${usage()}\n`);
    return { status: "help" };
  }
  const artifact = await verifyArtifact();
  if (options.verifyOnly) {
    output.write(`WebAssembly production artifact valid: ${artifact.artifactIdentity}\n`);
    return { status: "verified", artifact };
  }
  const session = await createSession();
  try {
    if (options.source !== undefined) {
      await evaluate(
        session,
        options.source,
        options.filename,
        options,
        artifact,
        output,
        errorOutput,
      );
      return { status: "evaluated", artifact };
    }
    if (options.file) {
      await evaluate(
        session,
        await readFile(options.file, "utf8"),
        options.file,
        options,
        artifact,
        output,
        errorOutput,
      );
      return { status: "evaluated", artifact };
    }
    if (!input.isTTY) {
      await evaluate(
        session,
        await readStandardInput(input),
        "<stdin>",
        options,
        artifact,
        output,
        errorOutput,
      );
      return { status: "evaluated", artifact };
    }
    output.write(
      "Sage.js production WebAssembly (receipt-authenticated browser artifact)\n",
    );
    const readline = createInterface({ input, output });
    try {
      while (true) {
        const source = await readline.question("wasm: ");
        const command = source.trim();
        if (["quit", "exit", ":quit", ":exit"].includes(command)) break;
        if (command === ":reset") {
          await session.reset();
          output.write("Session reset.\n");
          continue;
        }
        try {
          const directive = replTimeDirective(source);
          await evaluate(
            session,
            directive?.source ?? source,
            "<repl>",
            options,
            artifact,
            output,
            errorOutput,
            directive !== undefined,
          );
        } catch (error) {
          errorOutput.write(`${error.stack ?? error}\n`);
        }
      }
    } finally {
      readline.close();
    }
    return { status: "repl", artifact };
  } finally {
    await session.close();
  }
}

async function main() {
  try {
    await runCli();
  } catch (error) {
    stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = error?.name === "SageSessionTimeoutError" ? 124 : 1;
  }
}

const invoked = process.argv[1] === undefined
  ? false
  : pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) await main();
