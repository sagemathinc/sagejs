"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, realpathSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.number-fields/class-unit-performance-evidence-v3";
const SCHEMA_VERSION = 3;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_OBJECT = /^[0-9a-f]{40}$/;
const NAME = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const DECIMAL_INTEGER = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_REAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const RATIONAL = /^(-?(?:0|[1-9][0-9]*))(?:\/([1-9][0-9]*))?$/;

const TIMING_BOUNDARIES = Object.freeze([
  "kernel-warm",
  "field-cold",
  "process-cold",
  "release-cold",
]);

const REQUESTED_PROOFS = Object.freeze(["conditional-grh", "unconditional"]);
const ACHIEVED_PROOF_SEMANTICS = Object.freeze([
  "exact-relations-conditional-grh",
  "exact-unconditional",
]);
const REQUESTED_OUTPUT = "class-invariants-unit-summary-regulator";
const SAMPLE_PHASES = Object.freeze([
  "initialization",
  "field_construction",
  "computation",
  "verification",
]);
const RSS_SCOPES = Object.freeze([
  "single-operation-process-peak",
  "case-process-peak",
]);

const BOUNDARY_CONTRACTS = Object.freeze({
  "kernel-warm": Object.freeze({
    process: "prepared",
    field: "prepared",
    timed_scope: "class/unit kernel through its mathematical answer",
  }),
  "field-cold": Object.freeze({
    process: "persistent",
    field: "fresh isomorphic field and maximal order",
    timed_scope: "fresh field construction through its mathematical answer",
  }),
  "process-cold": Object.freeze({
    process: "fresh with shipped precompiled artifacts",
    field: "fresh",
    timed_scope: "process launch through its mathematical answer",
  }),
  "release-cold": Object.freeze({
    process: "installed CLI, SEA, or browser/Wasm application from launch",
    field: "fresh",
    timed_scope: "release launch through its first mathematical answer",
  }),
});

const TERMINAL_STATUSES = Object.freeze([
  "ok",
  "unavailable",
  "unsupported",
  "timeout",
  "error",
]);
const PLAN_STATUSES = Object.freeze(["selected", "unavailable", "unsupported"]);

function evidenceError(filename, message) {
  throw new Error(`class-unit evidence ${filename}: ${message}`);
}

function object(filename, value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    evidenceError(filename, `${label} must be an object`);
  }
  return value;
}

function exactKeys(filename, value, keys, label) {
  object(filename, value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    evidenceError(
      filename,
      `${label} fields must be exactly ${expected.join(", ")}; got ${actual.join(", ")}`,
    );
  }
}

function nonemptyString(filename, value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    evidenceError(filename, `${label} must be a nonempty string`);
  }
  return value;
}

function identifier(filename, value, label) {
  nonemptyString(filename, value, label);
  if (!NAME.test(value)) evidenceError(filename, `${label} must be a stable identifier`);
  return value;
}

function safeInteger(filename, value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    evidenceError(filename, `${label} must be a safe integer at least ${minimum}`);
  }
  return value;
}

function positiveNumber(filename, value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    evidenceError(filename, `${label} must be a finite positive number`);
  }
  return value;
}

function nullableNonnegativeNumber(filename, value, label) {
  if (value !== null &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    evidenceError(filename, `${label} must be a finite nonnegative number or null`);
  }
  return value;
}

function nullablePositiveNumber(filename, value, label) {
  if (value !== null) positiveNumber(filename, value, label);
  return value;
}

function sha256(filename, value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    evidenceError(filename, `${label} must be lowercase SHA-256 hex`);
  }
  return value;
}

function uniqueStrings(filename, value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    evidenceError(filename, `${label} must be a nonempty list`);
  }
  value.forEach((entry, index) => identifier(filename, entry, `${label}[${index}]`));
  if (new Set(value).size !== value.length) evidenceError(filename, `${label} has duplicates`);
  return value;
}

function canonicalize(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON accepts only finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
  }
  if (ancestors.has(value)) throw new TypeError("canonical JSON cannot encode cycles");
  ancestors.add(value);
  let answer;
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      throw new TypeError("canonical JSON cannot encode sparse or decorated arrays");
    }
    answer = value.map((entry) => canonicalize(entry, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonical JSON accepts only plain objects");
    }
    answer = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) {
        throw new TypeError(`canonical JSON cannot encode undefined at ${key}`);
      }
      answer[key] = canonicalize(value[key], ancestors);
    }
  }
  ancestors.delete(value);
  return answer;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function fingerprint(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function sha256File(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

function collectGitSourceIdentity(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const commit = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  const commitTree = git(root, ["show", "-s", "--format=%T", "HEAD"]);
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!GIT_OBJECT.test(commit) || !GIT_OBJECT.test(tree) || commitTree !== tree) {
    throw new Error("performance evidence requires an exact Git commit and authenticated tree");
  }
  if (status !== "" && options.allowDirty !== true) {
    throw new Error(`performance evidence requires a clean Git tree; status:\n${status}`);
  }
  return deepFreeze({ commit, tree, clean: status === "" });
}

function portablePath(root, filename) {
  const relative = path.relative(root, filename).replaceAll("\\", "/");
  if (relative === "" || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`${filename} is not a file below ${root}`);
  }
  return relative;
}

function collectFixtureIdentity(filename, options = {}) {
  const root = path.resolve(options.root || ROOT);
  const absolute = realpathSync(path.resolve(root, filename));
  const parsed = JSON.parse(readFileSync(absolute, "utf8"));
  const records = options.recordCount ?? parsed.records?.length ?? parsed.cases?.length;
  if (!Number.isSafeInteger(records) || records < 1) {
    throw new Error("fixture identity requires a positive record count");
  }
  const schema = options.schema ?? parsed.schema ??
    (Number.isSafeInteger(parsed.schema_version) ? `schema-version-${parsed.schema_version}` : null);
  if (typeof schema !== "string" || schema.trim() === "") {
    throw new Error("fixture identity requires a schema name");
  }
  const selectionQuerySha256 = options.selectionQuerySha256 ?? null;
  const selectedLabelsSha256 = options.selectedLabelsSha256 ?? null;
  for (const [label, value] of [
    ["selectionQuerySha256", selectionQuerySha256],
    ["selectedLabelsSha256", selectedLabelsSha256],
  ]) {
    if (value !== null && !SHA256.test(value)) throw new Error(`${label} must be SHA-256 hex or null`);
  }
  return deepFreeze({
    path: portablePath(root, absolute),
    sha256: sha256File(absolute),
    schema,
    selection_query_sha256: selectionQuerySha256,
    selected_labels_sha256: selectedLabelsSha256,
    record_count: records,
  });
}

function hostPayload(host) {
  return {
    hostname: host.hostname,
    platform: host.platform,
    architecture: host.architecture,
    operating_system: host.operating_system,
    cpu_model: host.cpu_model,
    logical_cpu_count: host.logical_cpu_count,
    total_memory_bytes: host.total_memory_bytes,
    node_version: host.node_version,
  };
}

function createHostFingerprint(host) {
  const payload = hostPayload(host);
  return deepFreeze({ ...payload, fingerprint: fingerprint({ kind: "host", ...payload }) });
}

function collectHostFingerprint() {
  const cpus = os.cpus();
  return createHostFingerprint({
    hostname: os.hostname(),
    platform: process.platform,
    architecture: process.arch,
    operating_system: `${os.type()} ${os.release()}`,
    cpu_model: cpus[0]?.model || "unknown",
    logical_cpu_count: cpus.length,
    total_memory_bytes: os.totalmem(),
    node_version: process.version,
  });
}

function toolPayload(name, tool) {
  return {
    name,
    status: tool.status,
    executable: tool.executable,
    argv_prefix: tool.argv_prefix,
    project: tool.project,
    version: tool.version,
    executable_sha256: tool.executable_sha256,
    execution_mode: tool.execution_mode,
    artifacts: tool.artifacts,
    libraries: tool.libraries,
    reason: tool.reason,
  };
}

function createToolFingerprint(name, tool) {
  const normalized = {
    ...tool,
    execution_mode: tool.execution_mode || null,
    artifacts: tool.artifacts || [],
    libraries: tool.libraries || {
      arb: null,
      compiler: null,
      flint: null,
      gmp: null,
      pari: null,
    },
  };
  const payload = toolPayload(name, normalized);
  return deepFreeze({
    status: payload.status,
    executable: payload.executable,
    argv_prefix: payload.argv_prefix,
    project: payload.project,
    version: payload.version,
    executable_sha256: payload.executable_sha256,
    execution_mode: payload.execution_mode,
    artifacts: payload.artifacts,
    libraries: payload.libraries,
    reason: payload.reason,
    fingerprint: fingerprint({ kind: "tool", ...payload }),
  });
}

function resolveExecutable(command, cwd) {
  const candidate = path.resolve(cwd, command);
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    if (!existsSync(candidate)) throw new Error(`executable does not exist: ${candidate}`);
    return realpathSync(candidate);
  }
  const resolver = process.platform === "win32" ? "where.exe" : "which";
  const output = execFileSync(resolver, [command], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  }).trim();
  const first = output.split(/\r?\n/).find((entry) => entry.trim() !== "");
  if (!first) throw new Error(`could not resolve executable ${command}`);
  return realpathSync(first.trim());
}

function collectToolFingerprint(options) {
  if (options === null || typeof options !== "object") {
    throw new TypeError("tool fingerprint options must be an object");
  }
  const name = options.name;
  const command = options.command;
  if (typeof name !== "string" || !NAME.test(name)) throw new Error("tool name is invalid");
  if (typeof command !== "string" || command.trim() === "") throw new Error("tool command is required");
  const cwd = path.resolve(options.cwd || ROOT);
  const argvPrefix = options.argvPrefix || [command];
  const project = options.project || null;
  const required = options.required !== false;
  try {
    const executable = resolveExecutable(command, cwd);
    const executableSha256 = sha256File(executable);
    const versionArgs = options.versionArgs || ["--version"];
    const version = options.version || execFileSync(executable, versionArgs, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs || 10_000,
    }).trim();
    if (version === "") throw new Error(`${name} returned an empty version`);
    return createToolFingerprint(name, {
      status: "ok",
      executable,
      argv_prefix: [...argvPrefix],
      project,
      version,
      executable_sha256: executableSha256,
      artifacts: [{ role: "executable", path: executable, sha256: executableSha256 }],
      reason: null,
    });
  } catch (error) {
    if (required) throw error;
    return createToolFingerprint(name, {
      status: "unavailable",
      executable: null,
      argv_prefix: [...argvPrefix],
      project,
      version: null,
      executable_sha256: null,
      reason: error.message,
    });
  }
}

function validateSource(filename, source, options) {
  exactKeys(filename, source, ["clean", "commit", "tree"], "source");
  if (!GIT_OBJECT.test(source.commit) || !GIT_OBJECT.test(source.tree) || source.clean !== true) {
    evidenceError(filename, "source must identify an exact clean Git commit and tree");
  }
  if (options.expectedCommit && source.commit !== options.expectedCommit) {
    evidenceError(filename, "source commit does not match expectedCommit");
  }
}

function validateFixture(filename, fixture, options) {
  exactKeys(filename, fixture, [
    "path",
    "record_count",
    "schema",
    "selected_labels_sha256",
    "selection_query_sha256",
    "sha256",
  ], "fixture");
  nonemptyString(filename, fixture.path, "fixture.path");
  if (path.isAbsolute(fixture.path) || fixture.path.split(/[\\/]/).includes("..")) {
    evidenceError(filename, "fixture.path must be repository-relative");
  }
  nonemptyString(filename, fixture.schema, "fixture.schema");
  sha256(filename, fixture.sha256, "fixture.sha256");
  safeInteger(filename, fixture.record_count, "fixture.record_count", 1);
  for (const key of ["selection_query_sha256", "selected_labels_sha256"]) {
    if (fixture[key] !== null) sha256(filename, fixture[key], `fixture.${key}`);
  }
  if (options.expectedFixtureSha256 && fixture.sha256 !== options.expectedFixtureSha256) {
    evidenceError(filename, "fixture SHA-256 does not match expectedFixtureSha256");
  }
}

function validateHost(filename, host) {
  exactKeys(filename, host, [
    "architecture",
    "cpu_model",
    "fingerprint",
    "hostname",
    "logical_cpu_count",
    "node_version",
    "operating_system",
    "platform",
    "total_memory_bytes",
  ], "host");
  for (const key of [
    "architecture", "cpu_model", "hostname", "node_version", "operating_system", "platform",
  ]) nonemptyString(filename, host[key], `host.${key}`);
  safeInteger(filename, host.logical_cpu_count, "host.logical_cpu_count", 1);
  safeInteger(filename, host.total_memory_bytes, "host.total_memory_bytes", 1);
  sha256(filename, host.fingerprint, "host.fingerprint");
  if (host.fingerprint !== fingerprint({ kind: "host", ...hostPayload(host) })) {
    evidenceError(filename, "host fingerprint is stale or invalid");
  }
}

function validateTools(filename, tools, systems) {
  object(filename, tools, "tools");
  const names = Object.keys(tools).sort();
  const missing = systems.filter((system) => !Object.hasOwn(tools, system));
  if (missing.length > 0) {
    evidenceError(filename, `tools is missing configured systems: ${missing.join(", ")}`);
  }
  for (const name of names) {
    identifier(filename, name, `tools key ${name}`);
    const tool = tools[name];
    exactKeys(filename, tool, [
      "artifacts",
      "argv_prefix",
      "executable",
      "executable_sha256",
      "execution_mode",
      "fingerprint",
      "libraries",
      "project",
      "reason",
      "status",
      "version",
    ], `tools.${name}`);
    if (!["ok", "unavailable"].includes(tool.status)) {
      evidenceError(filename, `tools.${name}.status must be ok or unavailable`);
    }
    if (!Array.isArray(tool.argv_prefix) || tool.argv_prefix.length === 0 ||
        tool.argv_prefix.some((entry) => typeof entry !== "string" || entry === "")) {
      evidenceError(filename, `tools.${name}.argv_prefix must be a nonempty string list`);
    }
    if (tool.project !== null) nonemptyString(filename, tool.project, `tools.${name}.project`);
    if (tool.execution_mode !== null) {
      identifier(filename, tool.execution_mode, `tools.${name}.execution_mode`);
    }
    object(filename, tool.libraries, `tools.${name}.libraries`);
    exactKeys(filename, tool.libraries, [
      "arb", "compiler", "flint", "gmp", "pari",
    ], `tools.${name}.libraries`);
    for (const [library, version] of Object.entries(tool.libraries)) {
      if (version !== null) {
        nonemptyString(filename, version, `tools.${name}.libraries.${library}`);
      }
    }
    if (!Array.isArray(tool.artifacts)) {
      evidenceError(filename, `tools.${name}.artifacts must be a list`);
    }
    const artifactRoles = new Set();
    for (const [artifactIndex, artifact] of tool.artifacts.entries()) {
      const artifactLabel = `tools.${name}.artifacts[${artifactIndex}]`;
      exactKeys(filename, artifact, ["path", "role", "sha256"], artifactLabel);
      identifier(filename, artifact.role, `${artifactLabel}.role`);
      nonemptyString(filename, artifact.path, `${artifactLabel}.path`);
      sha256(filename, artifact.sha256, `${artifactLabel}.sha256`);
      if (artifactRoles.has(artifact.role)) {
        evidenceError(filename, `tools.${name}.artifacts has duplicate role ${artifact.role}`);
      }
      artifactRoles.add(artifact.role);
    }
    if (tool.status === "ok") {
      nonemptyString(filename, tool.executable, `tools.${name}.executable`);
      nonemptyString(filename, tool.version, `tools.${name}.version`);
      sha256(filename, tool.executable_sha256, `tools.${name}.executable_sha256`);
      if (tool.reason !== null) evidenceError(filename, `tools.${name}.reason must be null when ok`);
      if (tool.artifacts.length === 0) {
        evidenceError(filename, `tools.${name}.artifacts must authenticate executed artifacts`);
      }
    } else {
      for (const key of ["executable", "version", "executable_sha256"]) {
        if (tool[key] !== null) evidenceError(filename, `tools.${name}.${key} must be null when unavailable`);
      }
      nonemptyString(filename, tool.reason, `tools.${name}.reason`);
    }
    sha256(filename, tool.fingerprint, `tools.${name}.fingerprint`);
    if (tool.fingerprint !== fingerprint({ kind: "tool", ...toolPayload(name, tool) })) {
      evidenceError(filename, `tools.${name}.fingerprint is stale or invalid`);
    }
  }
}

function validateConfiguration(filename, configuration) {
  exactKeys(filename, configuration, [
    "boundaries", "regulator_contract", "requested_output", "requested_proofs", "samples",
    "systems", "tier", "timeout_seconds",
  ], "configuration");
  identifier(filename, configuration.tier, "configuration.tier");
  if (configuration.requested_output !== REQUESTED_OUTPUT) {
    evidenceError(
      filename,
      `configuration.requested_output must be ${REQUESTED_OUTPUT}`,
    );
  }
  const requestedProofs = uniqueStrings(
    filename,
    configuration.requested_proofs,
    "configuration.requested_proofs",
  );
  for (const proof of requestedProofs) {
    if (!REQUESTED_PROOFS.includes(proof)) {
      evidenceError(filename, `configuration.requested_proofs has unsupported mode ${proof}`);
    }
  }
  const systems = uniqueStrings(filename, configuration.systems, "configuration.systems");
  if (JSON.stringify(configuration.boundaries) !== JSON.stringify(TIMING_BOUNDARIES)) {
    evidenceError(
      filename,
      `configuration.boundaries must be exactly ${TIMING_BOUNDARIES.join(", ")}`,
    );
  }
  safeInteger(filename, configuration.samples, "configuration.samples", 1);
  positiveNumber(filename, configuration.timeout_seconds, "configuration.timeout_seconds");
  exactKeys(filename, configuration.regulator_contract, [
    "minimum_decimal_digits", "require_rigorous",
  ], "configuration.regulator_contract");
  safeInteger(
    filename,
    configuration.regulator_contract.minimum_decimal_digits,
    "configuration.regulator_contract.minimum_decimal_digits",
    1,
  );
  if (typeof configuration.regulator_contract.require_rigorous !== "boolean") {
    evidenceError(filename, "configuration.regulator_contract.require_rigorous must be boolean");
  }
  return { requestedProofs, systems };
}

function jobKey(job) {
  return `${job.system}\t${job.case_id}\t${job.requested_proof}\t${job.boundary}`;
}

function validatePlan(filename, plan, configuration, dimensions, tools) {
  exactKeys(filename, plan, ["case_count", "job_count", "jobs"], "plan");
  safeInteger(filename, plan.case_count, "plan.case_count", 1);
  safeInteger(filename, plan.job_count, "plan.job_count", 1);
  if (!Array.isArray(plan.jobs) || plan.jobs.length !== plan.job_count) {
    evidenceError(filename, "plan.jobs length must equal plan.job_count");
  }
  const expectedJobCount = plan.case_count * dimensions.systems.length *
    dimensions.requestedProofs.length * TIMING_BOUNDARIES.length;
  if (plan.job_count !== expectedJobCount) {
    evidenceError(filename, `plan.job_count must describe the complete matrix (${expectedJobCount})`);
  }
  const caseMetadata = new Map();
  const keys = new Set();
  for (const [index, job] of plan.jobs.entries()) {
    const label = `plan.jobs[${index}]`;
    exactKeys(filename, job, [
      "boundary", "case_id", "invocation", "label", "requested_proof", "role", "samples",
      "status", "system", "tool_id",
    ], label);
    identifier(filename, job.system, `${label}.system`);
    nonemptyString(filename, job.case_id, `${label}.case_id`);
    nonemptyString(filename, job.label, `${label}.label`);
    identifier(filename, job.role, `${label}.role`);
    identifier(filename, job.requested_proof, `${label}.requested_proof`);
    identifier(filename, job.tool_id, `${label}.tool_id`);
    if (!Object.hasOwn(tools, job.tool_id)) {
      evidenceError(filename, `${label}.tool_id does not identify an authenticated tool`);
    }
    if (!dimensions.systems.includes(job.system) ||
        !dimensions.requestedProofs.includes(job.requested_proof) ||
        !TIMING_BOUNDARIES.includes(job.boundary)) {
      evidenceError(filename, `${label} is outside the configured matrix`);
    }
    if (!PLAN_STATUSES.includes(job.status)) evidenceError(filename, `${label}.status is invalid`);
    if (!Array.isArray(job.invocation) ||
        job.invocation.some((entry) => typeof entry !== "string" || entry === "")) {
      evidenceError(filename, `${label}.invocation must be a string list`);
    }
    if (job.status === "selected" && job.invocation.length === 0) {
      evidenceError(filename, `${label}.invocation must not be empty for a selected job`);
    }
    if (job.samples !== configuration.samples) {
      evidenceError(filename, `${label}.samples must equal configuration.samples`);
    }
    const metadata = `${job.label}\t${job.role}`;
    if (caseMetadata.has(job.case_id) && caseMetadata.get(job.case_id) !== metadata) {
      evidenceError(filename, `${job.case_id} has inconsistent label or role metadata`);
    }
    caseMetadata.set(job.case_id, metadata);
    const key = jobKey(job);
    if (keys.has(key)) evidenceError(filename, `duplicate planned job ${key}`);
    keys.add(key);
  }
  if (caseMetadata.size !== plan.case_count) {
    evidenceError(filename, "plan.case_count does not match the unique planned cases");
  }
  return new Map(plan.jobs.map((job) => [jobKey(job), job]));
}

function validateAnswer(filename, answer, label) {
  exactKeys(filename, answer, [
    "class_group_invariant_factors",
    "class_number",
    "regulator",
    "torsion_order",
    "unit_rank",
  ], label);
  if (typeof answer.class_number !== "string" || !DECIMAL_INTEGER.test(answer.class_number) ||
      BigInt(answer.class_number) < 1n) {
    evidenceError(filename, `${label}.class_number must be a positive canonical decimal integer`);
  }
  if (!Array.isArray(answer.class_group_invariant_factors)) {
    evidenceError(filename, `${label}.class_group_invariant_factors must be a list`);
  }
  let product = 1n;
  let previous = 1n;
  for (const [index, value] of answer.class_group_invariant_factors.entries()) {
    if (typeof value !== "string" || !DECIMAL_INTEGER.test(value) || BigInt(value) < 2n) {
      evidenceError(filename, `${label}.class_group_invariant_factors[${index}] is invalid`);
    }
    const invariant = BigInt(value);
    if (invariant % previous !== 0n) {
      evidenceError(filename, `${label}.class_group_invariant_factors is not a divisibility chain`);
    }
    previous = invariant;
    product *= invariant;
  }
  if (product !== BigInt(answer.class_number)) {
    evidenceError(filename, `${label} class-group invariants do not multiply to class_number`);
  }
  safeInteger(filename, answer.unit_rank, `${label}.unit_rank`, 0);
  if (typeof answer.torsion_order !== "string" || !DECIMAL_INTEGER.test(answer.torsion_order) ||
      BigInt(answer.torsion_order) < 1n) {
    evidenceError(filename, `${label}.torsion_order must be a positive canonical decimal integer`);
  }
  validateRegulator(filename, answer.regulator, `${label}.regulator`);
}

function rationalParts(filename, value, label) {
  if (typeof value !== "string") evidenceError(filename, `${label} must be a rational string`);
  const match = RATIONAL.exec(value);
  if (!match) evidenceError(filename, `${label} must be a canonical signed integer or fraction`);
  return [BigInt(match[1]), BigInt(match[2] || "1")];
}

function compareRationals(left, right) {
  return left[0] * right[1] < right[0] * left[1]
    ? -1
    : left[0] * right[1] > right[0] * left[1]
      ? 1
      : 0;
}

function powerOfTen(exponent) {
  return 10n ** BigInt(exponent);
}

function decimalMetadata(value) {
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(value);
  if (!match) throw new Error(`invalid decimal ${value}`);
  const negative = match[1] === "-";
  const integer = match[2];
  const fraction = match[3] || "";
  const exponent = Number(match[4] || "0");
  const digits = `${integer}${fraction}`;
  let numerator = BigInt(digits);
  if (negative) numerator = -numerator;
  const scale = fraction.length - exponent;
  const denominator = scale > 0 ? powerOfTen(scale) : 1n;
  if (scale < 0) numerator *= powerOfTen(-scale);
  const radius = scale >= 0
    ? [1n, 2n * denominator]
    : [powerOfTen(-scale), 2n];
  const precisionDigits = digits.replace(/^0+/, "").length || 1;
  return { value: [numerator, denominator], radius, precisionDigits };
}

function subtractRationals(left, right) {
  return [left[0] * right[1] - right[0] * left[1], left[1] * right[1]];
}

function regulatorSatisfiesContract(regulator, contract) {
  if (regulator.rigorous !== true && contract.require_rigorous === true) return false;
  if (regulator.kind === "decimal") {
    return regulator.precision_digits >= contract.minimum_decimal_digits;
  }
  const lower = rationalParts("<regulator contract>", regulator.lower, "lower");
  const upper = rationalParts("<regulator contract>", regulator.upper, "upper");
  const width = subtractRationals(upper, lower);
  const scale = compareRationals(upper, [1n, 1n]) > 0 ? upper : [1n, 1n];
  const maximumWidth = [scale[0], scale[1] * powerOfTen(contract.minimum_decimal_digits)];
  return compareRationals(width, maximumWidth) <= 0;
}

function validateRegulator(filename, regulator, label) {
  object(filename, regulator, label);
  if (regulator.kind === "decimal") {
    exactKeys(filename, regulator, [
      "absolute_error_bound", "kind", "precision_digits", "rigorous", "value",
    ], label);
    if (typeof regulator.value !== "string" || !DECIMAL_REAL.test(regulator.value) ||
        !Number.isFinite(Number(regulator.value)) || Number(regulator.value) <= 0) {
      evidenceError(filename, `${label}.value must be a finite positive canonical decimal real`);
    }
    safeInteger(filename, regulator.precision_digits, `${label}.precision_digits`, 1);
    const errorBound = rationalParts(
      filename,
      regulator.absolute_error_bound,
      `${label}.absolute_error_bound`,
    );
    if (compareRationals(errorBound, [0n, 1n]) <= 0) {
      evidenceError(filename, `${label}.absolute_error_bound must be positive`);
    }
    const metadata = decimalMetadata(regulator.value);
    if (regulator.precision_digits !== metadata.precisionDigits) {
      evidenceError(filename, `${label}.precision_digits does not match the printed decimal`);
    }
    if (compareRationals(errorBound, metadata.radius) !== 0) {
      evidenceError(filename, `${label}.absolute_error_bound is not its decimal rounding radius`);
    }
    if (typeof regulator.rigorous !== "boolean") {
      evidenceError(filename, `${label}.rigorous must be boolean`);
    }
    return;
  }
  if (regulator.kind !== "interval") {
    evidenceError(filename, `${label}.kind must be decimal or interval`);
  }
  exactKeys(filename, regulator, [
    "kind", "lower", "precision_bits", "rigorous", "upper",
  ], label);
  const lower = rationalParts(filename, regulator.lower, `${label}.lower`);
  const upper = rationalParts(filename, regulator.upper, `${label}.upper`);
  if (compareRationals(lower, [0n, 1n]) <= 0 || compareRationals(lower, upper) > 0) {
    evidenceError(filename, `${label} must be a positive nonempty interval`);
  }
  safeInteger(filename, regulator.precision_bits, `${label}.precision_bits`, 1);
  if (typeof regulator.rigorous !== "boolean") {
    evidenceError(filename, `${label}.rigorous must be boolean`);
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function closeEnough(left, right) {
  return Math.abs(left - right) <= Math.max(1e-12, Math.abs(right) * 1e-12);
}

function validateCorrectness(filename, correctness, answer, label) {
  exactKeys(filename, correctness, ["digests", "matched", "oracle"], label);
  nonemptyString(filename, correctness.oracle, `${label}.oracle`);
  if (correctness.matched !== true) evidenceError(filename, `${label}.matched must be true`);
  object(filename, correctness.digests, `${label}.digests`);
  const keys = Object.keys(correctness.digests);
  if (keys.length === 0 || !keys.includes("answer_sha256")) {
    evidenceError(filename, `${label}.digests must include answer_sha256`);
  }
  for (const key of keys) {
    if (!/^[a-z][a-z0-9_]*_sha256$/.test(key)) {
      evidenceError(filename, `${label}.digests has invalid key ${key}`);
    }
    sha256(filename, correctness.digests[key], `${label}.digests.${key}`);
  }
  if (correctness.digests.answer_sha256 !== fingerprint(answer)) {
    evidenceError(filename, `${label}.digests.answer_sha256 does not authenticate answer`);
  }
}

function proofRequestSatisfied(requested, achieved) {
  return achieved === "exact-unconditional" ||
    (requested === "conditional-grh" && achieved === "exact-relations-conditional-grh");
}

function regulatorSemantics(regulatorContract) {
  return {
    minimum_decimal_digits: regulatorContract.minimum_decimal_digits,
    require_rigorous: regulatorContract.require_rigorous,
  };
}

function semanticComparisonKey({
  achievedProofSemantics,
  requestedOutput,
  regulatorContract,
}) {
  return fingerprint({
    schema: "sagejs.number-fields/class-unit-semantic-comparison-v2",
    achieved_proof_semantics: achievedProofSemantics,
    requested_output: requestedOutput,
    regulator_contract: regulatorSemantics(regulatorContract),
  });
}

function validateSemanticParity(
  filename,
  parity,
  requested,
  achieved,
  answer,
  configuration,
  label,
) {
  exactKeys(filename, parity, ["comparison_key", "request_satisfied"], label);
  if (parity.request_satisfied !== true || !proofRequestSatisfied(requested, achieved)) {
    evidenceError(filename, `${label} does not satisfy the requested proof semantics`);
  }
  sha256(filename, parity.comparison_key, `${label}.comparison_key`);
  if (parity.comparison_key !== semanticComparisonKey({
    achievedProofSemantics: achieved,
    requestedOutput: configuration.requested_output,
    regulatorContract: configuration.regulator_contract,
  })) {
    evidenceError(
      filename,
      `${label}.comparison_key does not bind proof, requested output, and regulator semantics`,
    );
  }
}

function validateResults(filename, results, planned, configuration) {
  if (!Array.isArray(results) || results.length !== planned.size) {
    evidenceError(filename, "results must contain exactly one terminal result for every planned job");
  }
  const observed = new Set();
  for (const [index, result] of results.entries()) {
    const label = `results[${index}]`;
    exactKeys(filename, result, [
      "achieved_proof_semantics",
      "answer",
      "boundary",
      "case_id",
      "correctness",
      "label",
      "process_total_seconds",
      "requested_proof",
      "reason",
      "role",
      "samples",
      "semantic_parity",
      "status",
      "summary",
      "system",
      "tool_id",
    ], label);
    const key = jobKey(result);
    const job = planned.get(key);
    if (!job) evidenceError(filename, `${label} has no matching planned job`);
    if (observed.has(key)) evidenceError(filename, `duplicate terminal result ${key}`);
    observed.add(key);
    for (const metadata of ["label", "role", "tool_id"]) {
      if (result[metadata] !== job[metadata]) {
        evidenceError(filename, `${label}.${metadata} differs from its planned job`);
      }
    }
    if (!TERMINAL_STATUSES.includes(result.status)) {
      evidenceError(filename, `${label}.status is not terminal`);
    }
    if (job.status !== "selected" && result.status !== job.status) {
      evidenceError(filename, `${label}.status must preserve planned ${job.status} state`);
    }
    if (result.status === "ok") {
      if (result.reason !== null) evidenceError(filename, `${label}.reason must be null when ok`);
      positiveNumber(filename, result.process_total_seconds, `${label}.process_total_seconds`);
      if (!Array.isArray(result.samples) || result.samples.length !== configuration.samples) {
        evidenceError(filename, `${label}.samples length must equal configuration.samples`);
      }
      const elapsed = result.samples.map((sample, sampleIndex) => {
        const sampleLabel = `${label}.samples[${sampleIndex}]`;
        exactKeys(
          filename,
          sample,
          [
            "achieved_proof_semantics", "answer_sha256", "batch_elapsed_seconds",
            "elapsed_seconds", "iteration_count", "phases_seconds", "process_peak_rss_bytes",
            "rss_scope", "sample_index",
          ],
          sampleLabel,
        );
        safeInteger(filename, sample.sample_index, `${sampleLabel}.sample_index`, 0);
        if (sample.sample_index !== sampleIndex) {
          evidenceError(filename, `${sampleLabel}.sample_index must equal its retained position`);
        }
        safeInteger(filename, sample.iteration_count, `${sampleLabel}.iteration_count`, 1);
        sha256(filename, sample.answer_sha256, `${sampleLabel}.answer_sha256`);
        if (sample.achieved_proof_semantics !== result.achieved_proof_semantics) {
          evidenceError(
            filename,
            `${sampleLabel}.achieved_proof_semantics differs from its aggregate result`,
          );
        }
        if (sample.answer_sha256 !== fingerprint(result.answer)) {
          evidenceError(filename, `${sampleLabel}.answer_sha256 differs from its aggregate answer`);
        }
        positiveNumber(
          filename,
          sample.batch_elapsed_seconds,
          `${sampleLabel}.batch_elapsed_seconds`,
        );
        positiveNumber(filename, sample.elapsed_seconds, `${sampleLabel}.elapsed_seconds`);
        if (sample.process_peak_rss_bytes !== null) {
          safeInteger(
            filename,
            sample.process_peak_rss_bytes,
            `${sampleLabel}.process_peak_rss_bytes`,
            1,
          );
        }
        if (!RSS_SCOPES.includes(sample.rss_scope)) {
          evidenceError(
            filename,
            `${sampleLabel}.rss_scope must be ${RSS_SCOPES.join(" or ")}`,
          );
        }
        if (sample.rss_scope === "single-operation-process-peak" &&
            sample.iteration_count !== 1) {
          evidenceError(
            filename,
            `${sampleLabel}.rss_scope single-operation-process-peak requires iteration_count 1`,
          );
        }
        exactKeys(filename, sample.phases_seconds, SAMPLE_PHASES, `${sampleLabel}.phases_seconds`);
        for (const phase of SAMPLE_PHASES) {
          nullableNonnegativeNumber(
            filename,
            sample.phases_seconds[phase],
            `${sampleLabel}.phases_seconds.${phase}`,
          );
        }
        if (["kernel-warm", "field-cold"].includes(result.boundary)) {
          const perIteration = sample.batch_elapsed_seconds / sample.iteration_count;
          if (!closeEnough(sample.elapsed_seconds, perIteration)) {
            evidenceError(filename, `${sampleLabel}.elapsed_seconds must be its batch mean`);
          }
        } else if (sample.iteration_count !== 1 ||
                   sample.batch_elapsed_seconds > sample.elapsed_seconds * (1 + 1e-9)) {
          evidenceError(
            filename,
            `${sampleLabel} cold-process timing must contain one inner operation`,
          );
        }
        return sample.elapsed_seconds;
      });
      exactKeys(filename, result.summary, [
        "maximum_seconds", "median_seconds", "minimum_seconds",
      ], `${label}.summary`);
      for (const keyName of ["minimum_seconds", "median_seconds", "maximum_seconds"]) {
        positiveNumber(filename, result.summary[keyName], `${label}.summary.${keyName}`);
      }
      const expected = {
        minimum_seconds: Math.min(...elapsed),
        median_seconds: median(elapsed),
        maximum_seconds: Math.max(...elapsed),
      };
      for (const [keyName, value] of Object.entries(expected)) {
        if (!closeEnough(result.summary[keyName], value)) {
          evidenceError(filename, `${label}.summary.${keyName} does not match raw samples`);
        }
      }
      validateAnswer(filename, result.answer, `${label}.answer`);
      if (!regulatorSatisfiesContract(
        result.answer.regulator,
        configuration.regulator_contract,
      )) {
        evidenceError(filename, `${label}.answer.regulator does not satisfy the requested contract`);
      }
      validateCorrectness(filename, result.correctness, result.answer, `${label}.correctness`);
      if (!ACHIEVED_PROOF_SEMANTICS.includes(result.achieved_proof_semantics)) {
        evidenceError(filename, `${label}.achieved_proof_semantics is unsupported`);
      }
      validateSemanticParity(
        filename,
        result.semantic_parity,
        result.requested_proof,
        result.achieved_proof_semantics,
        result.answer,
        configuration,
        `${label}.semantic_parity`,
      );
    } else {
      nonemptyString(filename, result.reason, `${label}.reason`);
      nullablePositiveNumber(filename, result.process_total_seconds, `${label}.process_total_seconds`);
      if (!Array.isArray(result.samples) || result.samples.length !== 0) {
        evidenceError(filename, `${label}.samples must be empty when status is not ok`);
      }
      for (const keyName of [
        "summary", "answer", "correctness", "achieved_proof_semantics", "semantic_parity",
      ]) {
        if (result[keyName] !== null) {
          evidenceError(filename, `${label}.${keyName} must be null when status is not ok`);
        }
      }
    }
  }
  if (observed.size !== planned.size) {
    evidenceError(filename, "terminal accounting is incomplete");
  }
}

function evidenceFingerprint(report) {
  object("<fingerprint>", report, "report");
  const payload = { ...report };
  delete payload.canonical_fingerprint;
  return fingerprint(payload);
}

function performanceEvidenceAccepted(report, options = {}) {
  const minimumSamples = options.minimumSamples ?? 5;
  if (!Number.isSafeInteger(minimumSamples) || minimumSamples < 1) {
    throw new Error("minimumSamples must be a positive safe integer");
  }
  return report.plan.jobs.every((job) => report.tools[job.tool_id].status === "ok") &&
    report.configuration.samples >= minimumSamples &&
    report.results.length === report.plan.job_count &&
    report.results.every((result) =>
      result.status === "ok" &&
      result.samples.length >= minimumSamples &&
      result.correctness?.matched === true &&
      result.semantic_parity?.request_satisfied === true &&
      result.semantic_parity?.comparison_key === semanticComparisonKey({
        achievedProofSemantics: result.achieved_proof_semantics,
        requestedOutput: report.configuration.requested_output,
        regulatorContract: report.configuration.regulator_contract,
      }) &&
      result.samples.every((sample) =>
        Number.isSafeInteger(sample.process_peak_rss_bytes) &&
        sample.process_peak_rss_bytes > 0 &&
        sample.phases_seconds.computation !== null &&
        (result.boundary === "kernel-warm" ||
          sample.phases_seconds.field_construction !== null) &&
        (!["process-cold", "release-cold"].includes(result.boundary) ||
          sample.phases_seconds.initialization !== null) &&
        (result.system !== "direct-gp" || result.requested_proof !== "unconditional" ||
          sample.phases_seconds.verification !== null) &&
        (!(["kernel-warm", "field-cold"].includes(result.boundary) &&
            sample.elapsed_seconds < 0.01) ||
          (sample.iteration_count > 1 && sample.batch_elapsed_seconds >= 1))
      ) &&
      (report.configuration.regulator_contract.require_rigorous !== true ||
        result.answer.regulator.rigorous === true) &&
      (result.answer.regulator.kind !== "decimal" ||
        result.answer.regulator.precision_digits >=
          report.configuration.regulator_contract.minimum_decimal_digits)
    );
}

function memoryEvidenceAccepted(report, options = {}) {
  return performanceEvidenceAccepted(report, options) &&
    report.results.every((result) =>
      result.status === "ok" &&
      result.samples.every((sample) =>
        Number.isSafeInteger(sample.process_peak_rss_bytes) &&
        sample.process_peak_rss_bytes > 0 &&
        sample.rss_scope === "single-operation-process-peak"
      )
    );
}

function validateClassUnitEvidence(report, options = {}) {
  const filename = options.filename || "<class-unit performance evidence>";
  exactKeys(filename, report, [
    "canonical_fingerprint",
    "captured_at",
    "configuration",
    "fixture",
    "host",
    "plan",
    "results",
    "schema",
    "schema_version",
    "source",
    "tools",
  ], "report");
  if (report.schema !== SCHEMA || report.schema_version !== SCHEMA_VERSION) {
    evidenceError(filename, "unsupported schema or schema version");
  }
  nonemptyString(filename, report.captured_at, "captured_at");
  const capturedAt = new Date(report.captured_at);
  if (Number.isNaN(capturedAt.valueOf()) || capturedAt.toISOString() !== report.captured_at) {
    evidenceError(filename, "captured_at must be a canonical UTC ISO-8601 timestamp");
  }
  validateSource(filename, report.source, options);
  validateFixture(filename, report.fixture, options);
  validateHost(filename, report.host);
  const dimensions = validateConfiguration(filename, report.configuration);
  validateTools(filename, report.tools, dimensions.systems);
  const planned = validatePlan(
    filename,
    report.plan,
    report.configuration,
    dimensions,
    report.tools,
  );
  validateResults(filename, report.results, planned, report.configuration);
  sha256(filename, report.canonical_fingerprint, "canonical_fingerprint");
  const expectedFingerprint = evidenceFingerprint(report);
  if (report.canonical_fingerprint !== expectedFingerprint) {
    evidenceError(filename, "canonical_fingerprint is stale or invalid");
  }
  const normalized = deepFreeze(canonicalize(report));
  return deepFreeze({
    report: normalized,
    fingerprint: expectedFingerprint,
    performance_accepted: performanceEvidenceAccepted(normalized, options),
    memory_accepted: memoryEvidenceAccepted(normalized, options),
  });
}

function finalizeClassUnitEvidence(rawReport, options = {}) {
  object(options.filename || "<class-unit performance evidence>", rawReport, "report");
  if (Object.hasOwn(rawReport, "canonical_fingerprint")) {
    evidenceError(
      options.filename || "<class-unit performance evidence>",
      "raw report must not provide canonical_fingerprint",
    );
  }
  const report = canonicalize({ ...rawReport, canonical_fingerprint: "0".repeat(64) });
  report.canonical_fingerprint = evidenceFingerprint(report);
  return validateClassUnitEvidence(report, options);
}

function assertPerformanceEvidence(report, options = {}) {
  const validated = validateClassUnitEvidence(report, options);
  if (!validated.performance_accepted) {
    evidenceError(
      options.filename || "<class-unit performance evidence>",
      `performance evidence requires at least ${options.minimumSamples ?? 5} matched samples ` +
        "for every planned job and every configured tool",
    );
  }
  return validated;
}

module.exports = {
  ACHIEVED_PROOF_SEMANTICS,
  BOUNDARY_CONTRACTS,
  PLAN_STATUSES,
  REQUESTED_PROOFS,
  REQUESTED_OUTPUT,
  ROOT,
  RSS_SCOPES,
  SCHEMA,
  SCHEMA_VERSION,
  SAMPLE_PHASES,
  TERMINAL_STATUSES,
  TIMING_BOUNDARIES,
  assertPerformanceEvidence,
  canonicalJson,
  collectFixtureIdentity,
  collectGitSourceIdentity,
  collectHostFingerprint,
  collectToolFingerprint,
  createHostFingerprint,
  createToolFingerprint,
  decimalMetadata,
  evidenceFingerprint,
  finalizeClassUnitEvidence,
  fingerprint,
  jobKey,
  memoryEvidenceAccepted,
  performanceEvidenceAccepted,
  proofRequestSatisfied,
  regulatorSatisfiesContract,
  regulatorSemantics,
  semanticComparisonKey,
  sha256File,
  validateClassUnitEvidence,
};
