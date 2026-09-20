// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BOUNDARY_KINDS = new Set(["algorithm-stage", "prepared-field", "public-call"]);
const PUBLIC_MODES = new Set([
  "fresh-process",
  "fresh-field",
  "warmed-code-fresh-field",
  "cached-result-lookup",
]);

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number in exact result");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`unsupported exact-result value: ${typeof value}`);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredString(value, where) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${where} must be a nonempty string`);
  }
}

function stringArray(value, where, { nonempty = false } = {}) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    throw new Error(`${where} must be ${nonempty ? "a nonempty" : "an"} array`);
  }
  for (const item of value) requiredString(item, `${where} entry`);
}

export function validateConfig(config) {
  if (config?.schema !== "sagejs.rust-class-group/benchmark-config-v1") {
    throw new Error("unsupported benchmark config schema");
  }
  requiredString(config.benchmarkId, "benchmarkId");
  if (!BOUNDARY_KINDS.has(config.boundary?.kind)) {
    throw new Error("boundary.kind must be algorithm-stage, prepared-field, or public-call");
  }
  requiredString(config.boundary.label, "boundary.label");
  stringArray(config.boundary.includedWork, "boundary.includedWork", { nonempty: true });
  stringArray(config.boundary.excludedWork, "boundary.excludedWork");
  requiredString(config.boundary.proofMode, "boundary.proofMode");
  requiredString(config.boundary.outputPolicy, "boundary.outputPolicy");
  if (config.boundary.kind === "algorithm-stage") {
    requiredString(config.boundary.stageName, "boundary.stageName");
  }
  if (config.boundary.kind === "public-call" && !PUBLIC_MODES.has(config.boundary.publicMode)) {
    throw new Error("public-call boundary.publicMode is missing or unsupported");
  }
  if (!Number.isInteger(config.samplesPerArm) || config.samplesPerArm < 15) {
    throw new Error("samplesPerArm must be an integer of at least 15");
  }
  if (!Number.isInteger(config.warmupsPerArm) || config.warmupsPerArm < 1) {
    throw new Error("warmupsPerArm must be a positive integer");
  }
  if (config.schedule !== "alternating-pairs-v1") {
    throw new Error("schedule must be alternating-pairs-v1");
  }
  if (!Array.isArray(config.arms) || config.arms.length !== 2) {
    throw new Error("exactly two benchmark arms are required");
  }
  const armIds = new Set();
  let projectionNames;
  for (const [index, arm] of config.arms.entries()) {
    requiredString(arm.id, `arms[${index}].id`);
    if (armIds.has(arm.id)) throw new Error(`duplicate arm id ${arm.id}`);
    armIds.add(arm.id);
    requiredString(arm.implementation, `arms[${index}].implementation`);
    if (arm.boundaryLabel !== config.boundary.label) {
      throw new Error(`arm ${arm.id} boundaryLabel does not exactly match boundary.label`);
    }
    stringArray(arm.command, `arms[${index}].command`, { nonempty: true });
    if (arm.durationPointer !== undefined) requiredString(arm.durationPointer, `${arm.id}.durationPointer`);
    if (arm.jsonLinePrefix !== undefined) requiredString(arm.jsonLinePrefix, `${arm.id}.jsonLinePrefix`);
    if (arm.timeoutMilliseconds !== undefined &&
        (!Number.isInteger(arm.timeoutMilliseconds) || arm.timeoutMilliseconds < 1)) {
      throw new Error(`${arm.id}.timeoutMilliseconds must be positive`);
    }
    if (arm.resultProjection === null || typeof arm.resultProjection !== "object" ||
        Array.isArray(arm.resultProjection) || Object.keys(arm.resultProjection).length === 0) {
      throw new Error(`${arm.id}.resultProjection must map shared names to JSON pointers`);
    }
    for (const [name, pointer] of Object.entries(arm.resultProjection)) {
      requiredString(name, `${arm.id}.resultProjection key`);
      requiredString(pointer, `${arm.id}.resultProjection.${name}`);
    }
    const names = Object.keys(arm.resultProjection).sort();
    if (projectionNames === undefined) projectionNames = names;
    else if (canonicalJson(names) !== canonicalJson(projectionNames)) {
      throw new Error("both arms must publish the same resultProjection names");
    }
  }
  if (!Array.isArray(config.fields) || config.fields.length === 0) {
    throw new Error("fields must be a nonempty array");
  }
  const fieldIds = new Set();
  for (const [index, field] of config.fields.entries()) {
    requiredString(field.id, `fields[${index}].id`);
    if (fieldIds.has(field.id)) throw new Error(`duplicate field id ${field.id}`);
    fieldIds.add(field.id);
    if (field.input !== undefined) requiredString(field.input, `${field.id}.input`);
  }
  if (config.identityCommands !== undefined && !Array.isArray(config.identityCommands)) {
    throw new Error("identityCommands must be an array");
  }
  for (const [index, spec] of (config.identityCommands ?? []).entries()) {
    requiredString(spec.id, `identityCommands[${index}].id`);
    stringArray(spec.command, `identityCommands[${index}].command`, { nonempty: true });
  }
  return config;
}

function decodePointerToken(value) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

export function jsonPointer(value, pointer) {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) throw new Error(`invalid JSON pointer ${pointer}`);
  let current = value;
  for (const raw of pointer.slice(1).split("/")) {
    const key = decodePointerToken(raw);
    if (current === null || typeof current !== "object" || !(key in current)) {
      throw new Error(`JSON pointer ${pointer} does not exist`);
    }
    current = current[key];
  }
  return current;
}

export function projectResult(value, projection) {
  return Object.fromEntries(
    Object.entries(projection).map(([name, pointer]) => [name, jsonPointer(value, pointer)]),
  );
}

export function alternatingSchedule(samplesPerArm) {
  const answer = [];
  for (let round = 0; round < samplesPerArm; round += 1) {
    const order = round % 2 === 0 ? [0, 1] : [1, 0];
    for (let position = 0; position < 2; position += 1) {
      answer.push({ round, position, armIndex: order[position] });
    }
  }
  return answer;
}

function substitute(value, variables) {
  return value.replaceAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, name) => {
    if (!(name in variables)) throw new Error(`unknown command placeholder {${name}}`);
    return variables[name];
  });
}

function parseJsonOutput(stdout, prefix = "") {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== "");
  const selected = prefix
    ? lines.findLast((line) => line.startsWith(prefix))?.slice(prefix.length)
    : lines.at(-1);
  if (selected === undefined) throw new Error("adapter produced no JSON result line");
  return JSON.parse(selected);
}

async function writeAtomic(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  await writeFile(temporary, value);
  await rename(temporary, filename);
}

async function runProcess(command, options) {
  return await new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMilliseconds);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        status: null,
        signal: null,
        timedOut,
        spawnError: error.message,
        wallNanoseconds: Math.round((performance.now() - started) * 1e6).toString(),
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({
        status,
        signal,
        timedOut,
        spawnError: null,
        wallNanoseconds: Math.round((performance.now() - started) * 1e6).toString(),
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function commandIdentity(spec, root) {
  const command = spec.command;
  try {
    const { stdout, stderr } = await execFileAsync(command[0], command.slice(1), {
      cwd: spec.cwd ? path.resolve(root, spec.cwd) : root,
      timeout: spec.timeoutMilliseconds ?? 10_000,
      maxBuffer: 1024 * 1024,
    });
    return { id: spec.id, command, status: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      id: spec.id,
      command,
      status: error.code ?? null,
      signal: error.signal ?? null,
      stdout: error.stdout?.trim() ?? "",
      stderr: error.stderr?.trim() ?? error.message,
    };
  }
}

async function fileIdentity(filename) {
  try {
    const bytes = await readFile(filename);
    const info = await stat(filename);
    return { path: filename, bytes: info.size.toString(), sha256: sha256(bytes) };
  } catch (error) {
    return { path: filename, error: error.message };
  }
}

export async function environmentIdentity(config, root) {
  const git = async (...args) => {
    try {
      const { stdout } = await execFileAsync("git", args, { cwd: root, timeout: 10_000 });
      return stdout.trim();
    } catch (error) {
      return `ERROR: ${error.message}`;
    }
  };
  const envNames = [
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "RAYON_NUM_THREADS",
    ...(config.environmentIdentityVariables ?? []),
  ];
  const commandResults = [];
  for (const spec of config.identityCommands ?? []) commandResults.push(await commandIdentity(spec, root));
  const artifacts = [];
  for (const arm of config.arms) {
    const candidate = substitute(arm.command[0], {
      input: config.fields[0].input ? path.resolve(root, config.fields[0].input) : "",
      fieldId: config.fields[0].id,
      seed: "identity",
      sampleIndex: "0",
      round: "0",
    });
    artifacts.push(await fileIdentity(path.resolve(arm.cwd ? path.resolve(root, arm.cwd) : root, candidate)));
  }
  return {
    capturedAt: new Date().toISOString(),
    node: { version: process.version, versions: process.versions },
    host: {
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      osType: os.type(),
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model ?? null,
      totalMemoryBytes: os.totalmem().toString(),
    },
    environment: Object.fromEntries(envNames.map((name) => [name, process.env[name] ?? null])),
    git: {
      commit: await git("rev-parse", "HEAD"),
      statusSha256: sha256(await git("status", "--porcelain=v1", "--untracked-files=all")),
    },
    commands: commandResults,
    armExecutableArtifacts: artifacts,
  };
}

function medianDecimalStrings(values) {
  const sorted = values.map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2n).toString();
}

function summarize(samples, arms, fields) {
  const answer = {};
  for (const field of fields) {
    answer[field.id] = {};
    for (const arm of arms) {
      const selected = samples.filter(
        (sample) => sample.fieldId === field.id && sample.armId === arm.id && sample.status === "ok",
      );
      answer[field.id][arm.id] = {
        retainedSamples: selected.length,
        failedSamples: samples.filter(
          (sample) => sample.fieldId === field.id && sample.armId === arm.id && sample.status !== "ok",
        ).length,
        medianAdapterNanoseconds: selected.length
          ? medianDecimalStrings(selected.map((sample) => sample.adapterNanoseconds))
          : null,
        medianWallNanoseconds: selected.length
          ? medianDecimalStrings(selected.map((sample) => sample.wallNanoseconds))
          : null,
        exactResultFingerprints: [...new Set(selected.map((sample) => sample.resultSha256))].sort(),
      };
    }
  }
  return answer;
}

export async function runBenchmark(config, options = {}) {
  validateConfig(config);
  const root = path.resolve(options.root ?? process.cwd());
  const receiptPath = path.resolve(root, options.receiptPath ?? config.receiptPath ?? `${config.benchmarkId}.json`);
  const evidenceRoot = path.resolve(
    root,
    options.evidenceDirectory ?? config.evidenceDirectory ?? `${config.benchmarkId}-evidence`,
  );
  await mkdir(evidenceRoot, { recursive: true });
  await writeAtomic(path.join(evidenceRoot, "config.json"), `${canonicalJson(config)}\n`);
  const receipt = {
    schema: "sagejs.rust-class-group/benchmark-receipt-v1",
    benchmarkId: config.benchmarkId,
    configSha256: sha256(canonicalJson(config)),
    status: "running",
    boundary: config.boundary,
    schedule: { kind: config.schedule, warmupsPerArm: config.warmupsPerArm, samplesPerArm: config.samplesPerArm },
    environment: await environmentIdentity(config, root),
    samples: [],
    failures: [],
  };
  await writeAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

  let executionIndex = 0;
  const execute = async (field, arm, scheduleItem, warmup) => {
    const variables = {
      input: field.input ? path.resolve(root, field.input) : "",
      fieldId: field.id,
      seed: `${config.seedPrefix ?? "sagejs-r0"}-${field.id}-${scheduleItem.round}`,
      sampleIndex: String(executionIndex),
      round: String(scheduleItem.round),
    };
    const command = arm.command.map((item) => substitute(item, variables));
    const cwd = arm.cwd ? path.resolve(root, substitute(arm.cwd, variables)) : root;
    const processResult = await runProcess(command, {
      cwd,
      env: { ...process.env, ...(arm.environment ?? {}) },
      timeoutMilliseconds: arm.timeoutMilliseconds ?? config.timeoutMilliseconds ?? 120_000,
    });
    const basename = `${String(executionIndex).padStart(5, "0")}-${field.id}-${arm.id}${warmup ? "-warmup" : ""}`;
    const stdoutFile = path.join(evidenceRoot, "samples", `${basename}.stdout`);
    const stderrFile = path.join(evidenceRoot, "samples", `${basename}.stderr`);
    await mkdir(path.dirname(stdoutFile), { recursive: true });
    await Promise.all([
      writeFile(stdoutFile, processResult.stdout),
      writeFile(stderrFile, processResult.stderr),
    ]);
    const sample = {
      executionIndex,
      fieldId: field.id,
      armId: arm.id,
      warmup,
      round: scheduleItem.round,
      positionInRound: scheduleItem.position,
      command,
      cwd,
      seed: variables.seed,
      wallNanoseconds: processResult.wallNanoseconds,
      process: {
        exitStatus: processResult.status,
        signal: processResult.signal,
        timedOut: processResult.timedOut,
        spawnError: processResult.spawnError,
      },
      stdout: { path: path.relative(root, stdoutFile), sha256: sha256(processResult.stdout), bytes: Buffer.byteLength(processResult.stdout) },
      stderr: { path: path.relative(root, stderrFile), sha256: sha256(processResult.stderr), bytes: Buffer.byteLength(processResult.stderr) },
      status: "failed",
    };
    executionIndex += 1;
    try {
      if (processResult.timedOut) throw new Error("adapter timed out");
      if (processResult.spawnError) throw new Error(processResult.spawnError);
      if (processResult.status !== 0) throw new Error(`adapter exited with status ${processResult.status}`);
      const output = parseJsonOutput(processResult.stdout, arm.jsonLinePrefix ?? "");
      const projection = projectResult(output, arm.resultProjection);
      const adapterNanoseconds = arm.durationPointer
        ? String(jsonPointer(output, arm.durationPointer))
        : processResult.wallNanoseconds;
      if (!/^(0|[1-9][0-9]*)$/.test(adapterNanoseconds)) {
        throw new Error("adapter duration is not a nonnegative integer nanosecond string");
      }
      Object.assign(sample, {
        status: "ok",
        adapterNanoseconds,
        result: projection,
        resultCanonicalJson: canonicalJson(projection),
        resultSha256: sha256(canonicalJson(projection)),
        outputSchema: output.schema ?? null,
      });
    } catch (error) {
      sample.error = error.message;
    }
    if (!warmup) receipt.samples.push(sample);
    if (sample.status !== "ok") receipt.failures.push(sample);
    await writeAtomic(path.join(evidenceRoot, "samples", `${basename}.json`), `${JSON.stringify(sample, null, 2)}\n`);
    await writeAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  };

  for (const field of config.fields) {
    for (let warmup = 0; warmup < config.warmupsPerArm; warmup += 1) {
      const order = warmup % 2 === 0 ? [0, 1] : [1, 0];
      for (let position = 0; position < 2; position += 1) {
        await execute(field, config.arms[order[position]], { round: warmup, position }, true);
      }
    }
    for (const item of alternatingSchedule(config.samplesPerArm)) {
      await execute(field, config.arms[item.armIndex], item, false);
    }
  }

  receipt.summary = summarize(receipt.samples, config.arms, config.fields);
  for (const field of config.fields) {
    const successful = receipt.samples.filter((sample) => sample.fieldId === field.id && sample.status === "ok");
    const hashes = new Set(successful.map((sample) => sample.resultSha256));
    if (hashes.size !== 1) {
      receipt.failures.push({
        kind: "exact-result-fingerprint-mismatch",
        fieldId: field.id,
        fingerprints: [...hashes].sort(),
      });
    }
  }
  receipt.status = receipt.failures.length === 0 ? "passed" : "failed";
  receipt.completedAt = new Date().toISOString();
  await writeAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, receiptPath, evidenceRoot };
}
