"use strict";

const crypto = require("node:crypto");

const CORPUS_SCHEMA = "sagejs.benchmark/complex-cubic-frontier-corpus-v1";
const CENSUS_SCHEMA = "sagejs.benchmark/complex-cubic-frontier-census-v1";
const TIMING_SCHEMA = "sagejs.benchmark/complex-cubic-frontier-timing-v1";
const ADAPTER_SCHEMA = "sagejs.benchmark/complex-cubic-frontier-adapter-v1";
const SEED = "sagejs-complex-cubic-frontier-2026-09-v1";
const PRIOR_EXPOSURE_LABELS_SHA256 =
  "3aaa2fd01a009d87d40f9f21a83db42b00f3f578827e2ae36d3e0025bdf610d8";
const SYSTEMS = Object.freeze(["sagejs", "pari", "magma", "hecke"]);
const BOUNDARIES = Object.freeze(["scalar-prepared", "fresh-complete"]);
const CENSUS_STATUSES = Object.freeze([
  "native-pass",
  "native-decline-fallback-pass",
  "native-certificate-failure",
  "fallback-proof-failure",
  "cross-system-disagreement",
  "timeout",
  "error",
  "comparator-unavailable",
]);
const TERMINAL_STATUSES = Object.freeze(["ok", "timeout", "error", "unavailable"]);

function canonicalize(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON rejects nonfinite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
  }
  if (ancestors.has(value)) throw new TypeError("canonical JSON cannot encode cycles");
  ancestors.add(value);
  let answer;
  if (Array.isArray(value)) {
    answer = value.map((entry) => canonicalize(entry, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonical JSON accepts only plain objects");
    }
    answer = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw new TypeError(`undefined at ${key}`);
      answer[key] = canonicalize(value[key], ancestors);
    }
  }
  ancestors.delete(value);
  return answer;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalDigest(value) {
  return sha256(canonicalJson(value));
}

function fail(label, message) {
  throw new Error(`complex cubic frontier ${label}: ${message}`);
}

function integerString(value, label, { positive = false, signed = false } = {}) {
  const pattern = signed ? /^-?(?:0|[1-9][0-9]*)$/ : /^(?:0|[1-9][0-9]*)$/;
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(label, "must be a canonical decimal integer string");
  }
  if (positive && BigInt(value) < 1n) fail(label, "must be positive");
  return value;
}

function safeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(label, `must be a safe integer at least ${minimum}`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    fail(label, "must be lowercase SHA-256 hex");
  }
  return value;
}

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(label, "must be nonempty");
  return value;
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(label, "must be an object");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label, `fields must be exactly ${expected.join(", ")}; got ${actual.join(", ")}`);
  }
}

function validateInvariants(values, classNumber, label) {
  if (!Array.isArray(values)) fail(label, "must be an array");
  let product = 1n;
  let previous = 1n;
  const normalized = values.map((value, index) => {
    integerString(value, `${label}[${index}]`, { positive: true });
    const current = BigInt(value);
    if (current < 2n || current % previous !== 0n) {
      fail(label, "must contain divisibility-ordered nontrivial invariant factors");
    }
    previous = current;
    product *= current;
    return value;
  });
  if (product !== BigInt(classNumber)) fail(label, "product does not equal the class number");
  return normalized;
}

function validateField(record, label) {
  exactKeys(record, [
    "label", "coefficients", "discriminant", "discriminant_absolute",
    "class_number", "class_group_invariants", "equation_order_index",
    "ramified_prime_count", "selection",
  ], label);
  nonempty(record.label, `${label}.label`);
  if (!/^3\.1\.[1-9][0-9]*\.[1-9][0-9]*$/.test(record.label)) {
    fail(`${label}.label`, "must be an LMFDB complex-cubic label");
  }
  if (!Array.isArray(record.coefficients) || record.coefficients.length !== 4) {
    fail(`${label}.coefficients`, "must have four coefficients");
  }
  record.coefficients.forEach((entry, index) =>
    integerString(entry, `${label}.coefficients[${index}]`, { signed: true }));
  if (record.coefficients[3] !== "1") fail(`${label}.coefficients`, "must be monic");
  integerString(record.discriminant, `${label}.discriminant`, { signed: true });
  integerString(record.discriminant_absolute, `${label}.discriminant_absolute`, { positive: true });
  if (BigInt(record.discriminant) !== -BigInt(record.discriminant_absolute)) {
    fail(label, "complex cubic discriminant must be negative absolute discriminant");
  }
  if (BigInt(record.discriminant_absolute) > 100_000_000n) {
    fail(`${label}.discriminant_absolute`, "must be at most 100000000");
  }
  integerString(record.class_number, `${label}.class_number`, { positive: true });
  validateInvariants(record.class_group_invariants, record.class_number,
    `${label}.class_group_invariants`);
  integerString(record.equation_order_index, `${label}.equation_order_index`, { positive: true });
  safeInteger(record.ramified_prime_count, `${label}.ramified_prime_count`);
  exactKeys(record.selection, ["global_rank", "stratum", "stratum_rank", "shard"],
    `${label}.selection`);
  safeInteger(record.selection.global_rank, `${label}.selection.global_rank`, 1);
  nonempty(record.selection.stratum, `${label}.selection.stratum`);
  safeInteger(record.selection.stratum_rank, `${label}.selection.stratum_rank`, 1);
  safeInteger(record.selection.shard, `${label}.selection.shard`);
  return record;
}

function validateCorpus(corpus, options = {}) {
  exactKeys(corpus, [
    "schema", "schema_version", "created_at", "source", "selection_policy",
    "prior_exposure", "warmups", "records", "digests",
  ], "corpus");
  if (corpus.schema !== CORPUS_SCHEMA || corpus.schema_version !== 1) {
    fail("corpus.schema", "is unsupported");
  }
  exactKeys(corpus.source, ["kind", "snapshot", "selection_query", "selection_query_sha256",
    "input_records_sha256"], "corpus.source");
  if (corpus.source.kind !== "lmfdb-number-fields") fail("corpus.source.kind", "is unsupported");
  nonempty(corpus.source.snapshot, "corpus.source.snapshot");
  nonempty(corpus.source.selection_query, "corpus.source.selection_query");
  digest(corpus.source.selection_query_sha256, "corpus.source.selection_query_sha256");
  if (sha256(corpus.source.selection_query) !== corpus.source.selection_query_sha256) {
    fail("corpus.source.selection_query_sha256", "does not authenticate selection_query");
  }
  digest(corpus.source.input_records_sha256, "corpus.source.input_records_sha256");
  exactKeys(corpus.selection_policy, [
    "seed", "field_count", "warmup_count", "shard_count", "fields_per_shard",
    "discriminant_bands", "class_group_bands", "equation_order_index_bands",
    "ramified_prime_count_bands", "within_stratum_order", "global_selection",
  ], "corpus.selection_policy");
  if (corpus.selection_policy.seed !== SEED) fail("corpus.selection_policy.seed", "is not pinned");
  const expectedCount = options.expectedCount ?? 1000;
  if (corpus.selection_policy.field_count !== expectedCount) {
    fail("corpus.selection_policy.field_count", `must be ${expectedCount}`);
  }
  if (corpus.selection_policy.warmup_count !== 3 || corpus.selection_policy.shard_count !== 20 ||
      corpus.selection_policy.fields_per_shard !== 50) {
    fail("corpus.selection_policy", "must declare 3 warmups and 20 shards of 50");
  }
  exactKeys(corpus.prior_exposure, ["record_count", "labels_sha256", "sources"],
    "corpus.prior_exposure");
  safeInteger(corpus.prior_exposure.record_count, "corpus.prior_exposure.record_count");
  digest(corpus.prior_exposure.labels_sha256, "corpus.prior_exposure.labels_sha256");
  if (!Array.isArray(corpus.prior_exposure.sources)) fail("corpus.prior_exposure.sources", "must be an array");
  if (!Array.isArray(corpus.records) || corpus.records.length !== expectedCount) {
    fail("corpus.records", `must contain exactly ${expectedCount} fields`);
  }
  if (!Array.isArray(corpus.warmups) || corpus.warmups.length !== 3) {
    fail("corpus.warmups", "must contain exactly three excluded fields");
  }
  const labels = new Set();
  for (const [index, record] of corpus.records.entries()) {
    validateField(record, `corpus.records[${index}]`);
    if (record.selection.global_rank !== index + 1) fail(`corpus.records[${index}]`, "wrong global rank");
    if (record.selection.shard !== index % 20) fail(`corpus.records[${index}]`, "wrong shard");
    if (labels.has(record.label)) fail("corpus.records", "contains duplicate labels");
    labels.add(record.label);
  }
  for (const [index, record] of corpus.warmups.entries()) {
    validateField(record, `corpus.warmups[${index}]`);
    if (labels.has(record.label)) fail("corpus.warmups", "must be excluded from retained records");
    labels.add(record.label);
  }
  if (expectedCount === 1000) {
    const counts = Array(20).fill(0);
    corpus.records.forEach((record) => { counts[record.selection.shard] += 1; });
    if (counts.some((count) => count !== 50)) fail("corpus.records", "must define 20 shards of 50");
  }
  exactKeys(corpus.digests, ["labels_sha256", "records_sha256", "warmup_labels_sha256"],
    "corpus.digests");
  const labelBytes = `${corpus.records.map((record) => record.label).join("\n")}\n`;
  const warmupBytes = `${corpus.warmups.map((record) => record.label).join("\n")}\n`;
  if (sha256(labelBytes) !== corpus.digests.labels_sha256 ||
      sha256(warmupBytes) !== corpus.digests.warmup_labels_sha256 ||
      canonicalDigest(corpus.records) !== corpus.digests.records_sha256) {
    fail("corpus.digests", "is stale");
  }
  return corpus;
}

function validateAdapterResponse(response, request) {
  exactKeys(response, ["schema", "mode", "system", "status", "proof", "payload"],
    "adapter response");
  if (response.schema !== ADAPTER_SCHEMA || response.mode !== request.mode ||
      response.system !== request.system || response.proof !== "conditional-grh") {
    fail("adapter response", "does not match its request");
  }
  if (!TERMINAL_STATUSES.includes(response.status)) fail("adapter response.status", "is invalid");
  if (response.status === "ok" && response.payload === null) fail("adapter response.payload", "is missing");
  return response;
}

function validateTimingEvent(event, label = "timing event") {
  exactKeys(event, [
    "round", "order_position", "system", "boundary", "shard", "proof",
    "status", "iterations", "record_count", "root_nanoseconds", "root_source",
    "phase_sum_used", "digest_inside_root", "answer_digest", "per_field_nanoseconds",
  ], label);
  safeInteger(event.round, `${label}.round`);
  safeInteger(event.order_position, `${label}.order_position`);
  if (!SYSTEMS.includes(event.system)) fail(`${label}.system`, "is unsupported");
  if (!BOUNDARIES.includes(event.boundary)) fail(`${label}.boundary`, "is unsupported");
  safeInteger(event.shard, `${label}.shard`);
  if (event.proof !== "conditional-grh") fail(`${label}.proof`, "must be conditional-grh");
  if (!TERMINAL_STATUSES.includes(event.status)) fail(`${label}.status`, "is invalid");
  safeInteger(event.iterations, `${label}.iterations`, event.status === "ok" ? 1 : 0);
  safeInteger(event.record_count, `${label}.record_count`);
  if (event.status === "ok") {
    integerString(event.root_nanoseconds, `${label}.root_nanoseconds`, { positive: true });
    if (BigInt(event.root_nanoseconds) < 1_200_000_000n) {
      fail(`${label}.root_nanoseconds`, "must retain at least 1.2 seconds");
    }
    digest(event.answer_digest, `${label}.answer_digest`);
    if (!Array.isArray(event.per_field_nanoseconds) ||
        event.per_field_nanoseconds.length !== event.record_count) {
      fail(`${label}.per_field_nanoseconds`, "must have one diagnostic value per field");
    }
    event.per_field_nanoseconds.forEach((value, index) =>
      integerString(value, `${label}.per_field_nanoseconds[${index}]`));
  } else if (event.root_nanoseconds !== null || event.answer_digest !== null) {
    fail(label, "failed timings cannot invent a timeout-duration observation");
  }
  if (event.root_source !== "one-contiguous-monotonic-timer" ||
      event.phase_sum_used !== false || event.digest_inside_root !== false) {
    fail(label, "violates the authoritative root timing contract");
  }
  return event;
}

module.exports = {
  ADAPTER_SCHEMA,
  BOUNDARIES,
  CENSUS_SCHEMA,
  CENSUS_STATUSES,
  CORPUS_SCHEMA,
  PRIOR_EXPOSURE_LABELS_SHA256,
  SEED,
  SYSTEMS,
  TERMINAL_STATUSES,
  TIMING_SCHEMA,
  canonicalDigest,
  canonicalJson,
  sha256,
  validateAdapterResponse,
  validateCorpus,
  validateField,
  validateInvariants,
  validateTimingEvent,
};
