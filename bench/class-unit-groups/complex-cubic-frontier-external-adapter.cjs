"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REQUEST_SCHEMA =
  "sagejs.benchmark/complex-cubic-frontier-adapter-request-v1";
const RESPONSE_SCHEMA = "sagejs.benchmark/complex-cubic-frontier-adapter-v1";
const IDENTITY_SCHEMA =
  "sagejs.benchmark/complex-cubic-frontier-runtime-identity-v1";
const READY_MARKER = "SAGEJS_COMPLEX_CUBIC_FRONTIER_READY";
const RESPONSE_MARKER = "SAGEJS_COMPLEX_CUBIC_FRONTIER_RESPONSE|";
const BOUNDARIES = Object.freeze(["scalar-prepared", "fresh-complete"]);
const MINIMUM_ROOT_NS = 1_200_000_000n;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalDigest(value) {
  return sha256(`${JSON.stringify(canonicalize(value))}\n`);
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fields must be exactly ${wanted.join(", ")}`);
  }
}

function validateRecord(record, label) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof record.label !== "string" ||
      !/^3\.1\.[1-9][0-9]*\.[1-9][0-9]*$/.test(record.label)) {
    throw new Error(`${label}.label is not a complex-cubic LMFDB label`);
  }
  if (!Array.isArray(record.coefficients) || record.coefficients.length !== 4 ||
      record.coefficients.some((value) =>
        typeof value !== "string" || !/^-?(?:0|[1-9][0-9]*)$/.test(value)) ||
      record.coefficients[3] !== "1") {
    throw new Error(`${label}.coefficients must be a monic integral cubic`);
  }
  return { label: record.label, coefficients: [...record.coefficients] };
}

function validateRequest(request, system) {
  exactKeys(request, [
    "schema", "mode", "system", "proof", "proof_setting", "boundaries",
    "round", "minimum_retained_root_nanoseconds", "warmups", "shards",
  ], "adapter request");
  if (request.schema !== REQUEST_SCHEMA || request.system !== system ||
      !["census", "timing"].includes(request.mode) ||
      request.proof !== "conditional-grh") {
    throw new Error("adapter request schema, mode, system, or proof is unsupported");
  }
  const expectedSetting = system === "magma"
    ? 'Proof := "GRH"'
    : "class_group(...; GRH=true)";
  if (request.proof_setting !== expectedSetting) {
    throw new Error(`${system} conditional proof setting was not pinned exactly`);
  }
  if (typeof request.minimum_retained_root_nanoseconds !== "string" ||
      !/^[1-9][0-9]*$/.test(request.minimum_retained_root_nanoseconds) ||
      BigInt(request.minimum_retained_root_nanoseconds) < MINIMUM_ROOT_NS) {
    throw new Error("retained root duration must be at least 1.2 seconds");
  }
  if (!Array.isArray(request.boundaries) ||
      new Set(request.boundaries).size !== request.boundaries.length ||
      request.boundaries.some((value) => !BOUNDARIES.includes(value))) {
    throw new Error("adapter boundaries are malformed");
  }
  if (!Array.isArray(request.shards) || request.shards.length !== 20 ||
      request.shards.some((shard) => !Array.isArray(shard) || shard.length !== 50)) {
    throw new Error("adapter request must contain 20 shards of 50 fields");
  }
  if (!Array.isArray(request.warmups)) throw new Error("adapter warmups must be an array");
  if (request.mode === "census") {
    if (request.round !== null || request.boundaries.length !== 0) {
      throw new Error("census adapter request has timing state");
    }
  } else if (!Number.isSafeInteger(request.round) || request.round < 0 ||
      request.boundaries.length === 0) {
    throw new Error("timing adapter request needs a round and boundaries");
  }
  return {
    ...request,
    warmups: request.warmups.map((record, index) =>
      validateRecord(record, `warmups[${index}]`)),
    shards: request.shards.map((shard, shardIndex) => shard.map((record, index) =>
      validateRecord(record, `shards[${shardIndex}][${index}]`))),
  };
}

function resolveExecutable(requested) {
  const candidates = requested.includes("/") || requested.includes("\\")
    ? [path.resolve(requested)]
    : (process.env.PATH || "").split(path.delimiter).map((directory) =>
        path.join(directory, requested));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      // Continue along PATH.
    }
  }
  throw new Error(`executable not found: ${requested}`);
}

function fileArtifact(role, filename) {
  const resolved = fs.realpathSync(filename);
  const stats = fs.statSync(resolved);
  if (!stats.isFile()) throw new Error(`${role} is not a regular file: ${resolved}`);
  return {
    role,
    path: resolved,
    bytes: stats.size,
    sha256: sha256(fs.readFileSync(resolved)),
  };
}

function treeArtifact(role, directory) {
  const root = fs.realpathSync(directory);
  const records = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) {
        const stats = fs.statSync(filename);
        records.push({
          path: path.relative(root, filename).replaceAll("\\", "/"),
          bytes: stats.size,
          sha256: sha256(fs.readFileSync(filename)),
        });
      } else throw new Error(`${role} contains a non-file entry: ${filename}`);
    }
  }
  visit(root);
  if (records.length === 0) throw new Error(`${role} is empty: ${root}`);
  return {
    role,
    path: root,
    file_count: records.length,
    bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    sha256: canonicalDigest(records),
  };
}

function run(executable, args, options = {}) {
  const result = childProcess.spawnSync(executable, args, {
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, ...(options.env || {}) },
    cwd: options.cwd,
    maxBuffer: 256 * 1024 * 1024,
    timeout: options.timeout,
    killSignal: "SIGKILL",
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || String(result.stderr || result.stdout || "").trim() ||
      `exit ${result.status}, signal ${result.signal}`;
    throw new Error(detail);
  }
  return { stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
}

function gitValue(root, args) {
  return run("git", ["-C", root, ...args], { timeout: 20_000 }).stdout.trim();
}

function attachIdentity(identity, program, adapterFile, helperFile) {
  const payload = {
    schema: IDENTITY_SCHEMA,
    ...identity,
    adapter: fileArtifact("protocol-adapter", adapterFile),
    helper: fileArtifact("protocol-helper", helperFile),
    generated_program_sha256: sha256(program),
  };
  return { ...payload, identity_sha256: canonicalDigest(payload) };
}

function parseInvariantText(text, label) {
  if (!/^\[(?:[1-9][0-9]*(?:,[1-9][0-9]*)*)?\]$/.test(text)) {
    throw new Error(`${label} invariants are malformed`);
  }
  const values = text === "[]" ? [] : text.slice(1, -1).split(",");
  if (values.some((value) => BigInt(value) < 2n)) {
    throw new Error(`${label} invariants are malformed`);
  }
  return values;
}

function validateAnswer(classNumber, invariants, label) {
  if (!/^[1-9][0-9]*$/.test(classNumber)) throw new Error(`${label} class number is malformed`);
  let product = 1n;
  let previous = 1n;
  for (const value of invariants) {
    const current = BigInt(value);
    if (current % previous !== 0n) throw new Error(`${label} invariants are not divisibility ordered`);
    product *= current;
    previous = current;
  }
  if (product !== BigInt(classNumber)) throw new Error(`${label} invariant product is wrong`);
  return { class_number: classNumber, class_group_invariants: invariants };
}

function parseCensus(stdout, prefix, request) {
  const okPrefix = `${prefix}CENSUS|`;
  const errorPrefix = `${prefix}ERROR|`;
  const records = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith(okPrefix)) {
      const fields = line.slice(okPrefix.length).split("|");
      if (fields.length !== 4) throw new Error("malformed census marker");
      const [label, discriminant, classNumber, invariantsText] = fields;
      if (records.has(label) || !/^-?[1-9][0-9]*$/.test(discriminant)) {
        throw new Error("duplicate label or malformed discriminant in census marker");
      }
      const answer = validateAnswer(classNumber,
        parseInvariantText(invariantsText, label), label);
      records.set(label, {
        label,
        status: "ok",
        discriminant,
        ...answer,
        proof_status: "exact-relations-conditional-grh",
      });
    } else if (line.startsWith(errorPrefix)) {
      const separator = line.indexOf("|", errorPrefix.length);
      if (separator < 0) throw new Error("malformed census error marker");
      const label = line.slice(errorPrefix.length, separator);
      if (records.has(label)) throw new Error("duplicate census label");
      records.set(label, { label, status: "error", reason: line.slice(separator + 1) });
    }
  }
  const expected = request.shards.flat();
  const expectedLabels = new Set(expected.map((record) => record.label));
  if (records.size !== expected.length ||
      [...records.keys()].some((label) => !expectedLabels.has(label))) {
    throw new Error(`CAS emitted ${records.size} of ${expected.length} census records`);
  }
  return expected.map((record) => records.get(record.label));
}

function parseTiming(stdout, prefix, request) {
  const marker = `${prefix}TIMING|`;
  const events = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(marker)) continue;
    const fields = line.slice(marker.length).split("|");
    if (fields.length !== 7) throw new Error("malformed timing marker");
    const [boundary, shardText, iterationsText, rootNs, answersText, perText, countText] = fields;
    const shard = Number(shardText);
    const iterations = Number(iterationsText);
    const recordCount = Number(countText);
    if (!request.boundaries.includes(boundary) || !Number.isSafeInteger(shard) ||
        shard < 0 || shard >= request.shards.length || !Number.isSafeInteger(iterations) ||
        iterations < 1 || recordCount !== request.shards[shard].length ||
        !/^[1-9][0-9]*$/.test(rootNs) ||
        BigInt(rootNs) < BigInt(request.minimum_retained_root_nanoseconds)) {
      throw new Error("timing marker metadata is malformed");
    }
    const answerItems = answersText === "" ? [] : answersText.split(";");
    const answers = answerItems.map((item, index) => {
      const separator = item.indexOf("#");
      if (separator < 0) throw new Error("timing answer marker is malformed");
      const classNumber = item.slice(0, separator);
      return validateAnswer(classNumber,
        parseInvariantText(item.slice(separator + 1), `timing answer ${index}`),
        `timing answer ${index}`);
    });
    const perField = perText === "" ? [] : perText.split(",");
    if (answers.length !== recordCount || perField.length !== recordCount ||
        perField.some((value) => !/^(?:0|[1-9][0-9]*)$/.test(value))) {
      throw new Error("timing marker has the wrong answer or diagnostic count");
    }
    events.push({
      boundary,
      shard,
      iterations,
      record_count: recordCount,
      root_nanoseconds: rootNs,
      answers,
      per_field_nanoseconds: perField,
    });
  }
  if (events.length !== request.boundaries.length * request.shards.length) {
    throw new Error("CAS emitted the wrong number of retained timing events");
  }
  const keys = new Set(events.map((event) => `${event.boundary}:${event.shard}`));
  if (keys.size !== events.length) throw new Error("CAS emitted duplicate timing events");
  return events;
}

function emitResponse(system, request, status, payload) {
  process.stdout.write(`${RESPONSE_MARKER}${JSON.stringify({
    schema: RESPONSE_SCHEMA,
    mode: request.mode,
    system,
    status,
    proof: "conditional-grh",
    payload,
  })}\n`);
}

function readRequest() {
  return fs.readFileSync(0, "utf8").trim();
}

function adapterMain(system, implementation) {
  let request;
  let runtime;
  let program;
  let identity;
  try {
    request = validateRequest(JSON.parse(readRequest()), system);
    runtime = implementation.runtimeIdentity();
    program = implementation.source(request);
    identity = attachIdentity(
      runtime,
      program,
      implementation.adapterFile,
      __filename,
    );
  } catch (error) {
    process.stderr.write(
      `${system} frontier adapter rejected startup: ${error.stack || error}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${READY_MARKER}\n`);
  try {
    const result = implementation.execute(runtime, program);
    const payload = request.mode === "census"
      ? { records: parseCensus(result.stdout, implementation.markerPrefix, request), runtime_identity: identity }
      : { round: request.round, events: parseTiming(result.stdout, implementation.markerPrefix, request), runtime_identity: identity };
    emitResponse(system, request, "ok", payload);
  } catch (error) {
    process.stderr.write(`${system} frontier adapter failed closed: ${error.stack || error}\n`);
    emitResponse(system, request, "error", null);
  }
}

module.exports = {
  IDENTITY_SCHEMA,
  MINIMUM_ROOT_NS,
  adapterMain,
  attachIdentity,
  canonicalDigest,
  fileArtifact,
  gitValue,
  parseCensus,
  parseTiming,
  resolveExecutable,
  run,
  sha256,
  treeArtifact,
  validateRequest,
};
