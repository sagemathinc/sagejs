"use strict";

// Field-neutral, data-only publication boundary for an internally complete
// class-and-unit correspondence.  Mathematical authority is deliberately an
// injected, out-of-band replay capability; an envelope cannot authorize itself.

const crypto = require("node:crypto");

const PAYLOAD_SCHEMA =
  "sagejs.pari-class-group/class-unit-correspondence-result-v1";
const ENVELOPE_SCHEMA =
  "sagejs.pari-class-group/class-unit-correspondence-envelope-v1";
const MAX_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;
const NONNEGATIVE = /^(0|[1-9][0-9]*)$/;
const POSITIVE = /^[1-9][0-9]*$/;
const MATERIALIZATION_TAGS = new Set(["exact_units", "not_given"]);
const NOT_GIVEN_REASONS = new Set(["PRECI", "LARGE"]);
const HONESTY_OUTCOMES = new Set([
  "not-required",
  "equal-bound-source-skip",
  "extended-complete",
]);

class ClassUnitResultFailure extends Error {}
class ClassUnitResultConflict extends Error {}

function fail(message) {
  throw new ClassUnitResultFailure(message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value, name) {
  if (!isPlainObject(value)) fail(`${name} must be a plain object`);
  return value;
}

function keys(value, expected, name) {
  record(value, name);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length ||
      actual.some((entry, index) => entry !== wanted[index])) {
    fail(`${name} has unexpected fields`);
  }
}

function string(value, name) {
  if (typeof value !== "string" || value.length === 0 ||
      !/^[\x20-\x7e]+$/.test(value)) {
    fail(`${name} must be a nonempty string`);
  }
  return value;
}

function oneOf(value, allowed, name) {
  string(value, name);
  if (!allowed.has(value)) fail(`${name} is unsupported`);
  return value;
}

function decimal(value, pattern, name) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${name} is not a canonical decimal integer`);
  }
  return value;
}

function digest(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${name} is not a SHA-256 digest`);
  }
  return value;
}

function list(value, name) {
  if (!Array.isArray(value)) fail(`${name} must be an array`);
  return value;
}

function bool(value, name) {
  if (typeof value !== "boolean") fail(`${name} must be boolean`);
  return value;
}

function canonical(value) {
  try {
    const normalize = entry => {
      if (Array.isArray(entry)) return entry.map(normalize);
      if (isPlainObject(entry)) {
        return Object.fromEntries(
          Object.keys(entry).sort().map(key => [key, normalize(entry[key])]),
        );
      }
      if (entry === null || typeof entry === "string" ||
          typeof entry === "boolean" || Number.isSafeInteger(entry)) return entry;
      fail("result contains a noncanonical JSON value");
    };
    const raw = Buffer.from(JSON.stringify(normalize(value)), "ascii");
    if (raw.length > MAX_BYTES) fail("result exceeds its byte bound");
    return raw;
  } catch (error) {
    if (error instanceof ClassUnitResultFailure) throw error;
    throw new ClassUnitResultFailure("result is not canonical JSON", { cause: error });
  }
}

function sha256Bytes(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function sha256Canonical(value) {
  return sha256Bytes(canonical(value));
}

function strictParse(raw) {
  if (!Buffer.isBuffer(raw) || raw.length > MAX_BYTES) {
    fail("result must be a bounded Buffer");
  }
  let value;
  try {
    value = JSON.parse(raw.toString("ascii"));
  } catch (error) {
    throw new ClassUnitResultFailure("result is not JSON", { cause: error });
  }
  // Exact canonical equality rejects whitespace, duplicate keys, non-ASCII
  // spellings, alternate number spellings, and reordered object members.
  if (!canonical(value).equals(raw)) fail("result is not canonical JSON");
  return record(value, "result envelope");
}

function validateOwner(owner, index) {
  const name = `storage[${index}]`;
  keys(owner, ["capacity", "encoding", "entries", "logicalLength", "name", "role"], name);
  string(owner.name, `${name}.name`);
  string(owner.role, `${name}.role`);
  if (owner.encoding !== "canonical-decimal-integer") {
    fail(`${name}.encoding is unsupported`);
  }
  decimal(owner.logicalLength, NONNEGATIVE, `${name}.logicalLength`);
  decimal(owner.capacity, NONNEGATIVE, `${name}.capacity`);
  const logicalLength = BigInt(owner.logicalLength);
  const capacity = BigInt(owner.capacity);
  if (logicalLength > capacity) fail(`${name} logical length exceeds capacity`);
  const entries = list(owner.entries, `${name}.entries`);
  if (capacity !== BigInt(entries.length)) fail(`${name} capacity is unauthenticated`);
  entries.forEach((entry, entryIndex) =>
    decimal(entry, INTEGER, `${name}.entries[${entryIndex}]`));
}

function validateField(field) {
  keys(field, ["definingPolynomialAscending", "degree", "id"], "field");
  string(field.id, "field.id");
  decimal(field.degree, POSITIVE, "field.degree");
  const coefficients = list(
    field.definingPolynomialAscending,
    "field.definingPolynomialAscending",
  );
  if (BigInt(coefficients.length) !== BigInt(field.degree) + 1n) {
    fail("defining polynomial degree changed");
  }
  coefficients.forEach((entry, index) =>
    decimal(entry, INTEGER, `field.definingPolynomialAscending[${index}]`));
  if (coefficients.at(-1) === "0") fail("defining polynomial lost its leading term");
}

function validateSource(source) {
  keys(
    source,
    ["assumptions", "correspondence", "pariSourceSha256", "pariVersion", "replaySchema"],
    "source",
  );
  if (source.pariVersion !== "2.17.4") fail("source.pariVersion changed");
  digest(source.pariSourceSha256, "source.pariSourceSha256");
  if (source.correspondence !== "upstream-assumed-pari-correspondence") {
    fail("source correspondence must remain explicitly assumed");
  }
  string(source.replaySchema, "source.replaySchema");
  const assumptions = list(source.assumptions, "source.assumptions");
  let previous = "";
  for (const [index, assumption] of assumptions.entries()) {
    keys(assumption, ["disposition", "id", "statement"], `source.assumptions[${index}]`);
    string(assumption.id, `source.assumptions[${index}].id`);
    if (assumption.id <= previous) fail("source assumptions are not uniquely sorted");
    previous = assumption.id;
    if (assumption.disposition !== "assumed") {
      fail("upstream source assumption was mislabeled as proved");
    }
    string(assumption.statement, `source.assumptions[${index}].statement`);
  }
}

function ownerMap(storage) {
  const owners = new Map();
  let previous = "";
  for (const [index, owner] of storage.entries()) {
    validateOwner(owner, index);
    if (owner.name <= previous) fail("storage owners are not uniquely sorted");
    previous = owner.name;
    owners.set(owner.name, owner);
  }
  return owners;
}

function referencedOwner(owners, name, role, expectedLogicalLength = undefined) {
  string(name, `${role} owner reference`);
  const owner = owners.get(name);
  if (!owner) fail(`${role} owner is absent`);
  if (owner.role !== role) fail(`${role} owner has the wrong authenticated role`);
  if (expectedLogicalLength !== undefined &&
      BigInt(owner.logicalLength) !== expectedLogicalLength) {
    fail(`${role} owner has the wrong logical length`);
  }
  return owner;
}

function validateClassGroup(classGroup, owners) {
  keys(
    classGroup,
    ["classNumber", "generatorCount", "invariantFactors", "presentationOwner"],
    "classGroup",
  );
  decimal(classGroup.classNumber, POSITIVE, "classGroup.classNumber");
  decimal(classGroup.generatorCount, NONNEGATIVE, "classGroup.generatorCount");
  const factors = list(classGroup.invariantFactors, "classGroup.invariantFactors");
  if (BigInt(factors.length) !== BigInt(classGroup.generatorCount)) {
    fail("class-group generator count changed");
  }
  let product = 1n;
  let previous = 1n;
  for (const [index, factor] of factors.entries()) {
    decimal(factor, POSITIVE, `classGroup.invariantFactors[${index}]`);
    const current = BigInt(factor);
    if (current < 2n || current % previous !== 0n) {
      fail("class-group invariant factors are not normalized");
    }
    previous = current;
    product *= current;
  }
  if (product !== BigInt(classGroup.classNumber)) {
    fail("class number does not equal the invariant-factor product");
  }
  referencedOwner(owners, classGroup.presentationOwner, "class-presentation");
}

function validateUnitGroup(unitGroup, field, owners) {
  keys(
    unitGroup,
    ["materialization", "rank", "regulatorOwner", "torsionGeneratorOwner", "torsionOrder"],
    "unitGroup",
  );
  decimal(unitGroup.rank, NONNEGATIVE, "unitGroup.rank");
  decimal(unitGroup.torsionOrder, POSITIVE, "unitGroup.torsionOrder");
  const rank = BigInt(unitGroup.rank);
  const degree = BigInt(field.degree);
  referencedOwner(owners, unitGroup.regulatorOwner, "regulator-enclosure");
  referencedOwner(
    owners,
    unitGroup.torsionGeneratorOwner,
    "torsion-generator",
    degree,
  );
  const materialization = record(unitGroup.materialization, "unitGroup.materialization");
  oneOf(materialization.tag, MATERIALIZATION_TAGS, "unitGroup.materialization.tag");
  if (materialization.tag === "exact_units") {
    keys(materialization, ["coordinatesOwner", "normsOwner", "tag"], "unitGroup.materialization");
    referencedOwner(
      owners,
      materialization.coordinatesOwner,
      "exact-unit-coordinates",
      rank * degree,
    );
    referencedOwner(owners, materialization.normsOwner, "exact-unit-norms", rank);
  } else {
    keys(materialization, ["precisionBits", "reason", "tag"], "unitGroup.materialization");
    oneOf(materialization.reason, NOT_GIVEN_REASONS, "unitGroup.materialization.reason");
    decimal(materialization.precisionBits, POSITIVE, "unitGroup.materialization.precisionBits");
  }
}

function validateHonesty(honesty, owners) {
  keys(honesty, ["evidenceOwner", "outcome", "sourcePolicy"], "honesty");
  oneOf(honesty.outcome, HONESTY_OUTCOMES, "honesty.outcome");
  string(honesty.sourcePolicy, "honesty.sourcePolicy");
  if (honesty.evidenceOwner !== null) {
    referencedOwner(owners, honesty.evidenceOwner, "honesty-evidence");
  }
  if (honesty.outcome === "extended-complete" && honesty.evidenceOwner === null) {
    fail("completed honesty extension lacks evidence");
  }
}

function validateTerminal(terminal) {
  keys(terminal, ["correspondence_complete", "public_complete", "status"], "terminal");
  bool(terminal.correspondence_complete, "terminal.correspondence_complete");
  bool(terminal.public_complete, "terminal.public_complete");
  if (!terminal.correspondence_complete) fail("terminal correspondence is incomplete");
  if (terminal.public_complete) fail("internal correspondence cannot claim public completion");
  if (terminal.status !== "pari-correspondence-complete-internal") {
    fail("terminal status changed");
  }
}

function validatePayload(payload) {
  keys(
    payload,
    ["classGroup", "field", "honesty", "schema", "source", "storage", "terminal", "unitGroup"],
    "payload",
  );
  if (payload.schema !== PAYLOAD_SCHEMA) fail("payload schema changed");
  validateField(record(payload.field, "field"));
  validateSource(record(payload.source, "source"));
  const owners = ownerMap(list(payload.storage, "storage"));
  validateClassGroup(record(payload.classGroup, "classGroup"), owners);
  validateUnitGroup(record(payload.unitGroup, "unitGroup"), payload.field, owners);
  validateHonesty(record(payload.honesty, "honesty"), owners);
  validateTerminal(record(payload.terminal, "terminal"));
  return payload;
}

function sealClassUnitCorrespondenceResult(payload) {
  validatePayload(payload);
  const payloadCopy = JSON.parse(canonical(payload).toString("ascii"));
  const envelope = {
    payload: payloadCopy,
    payloadSha256: sha256Canonical(payloadCopy),
    schema: ENVELOPE_SCHEMA,
  };
  return canonical(envelope);
}

const AUTHORITY_BRAND = new WeakSet();

function createDetachedClassUnitAuthority({
  envelopeSha256,
  mathematicalAuthoritySha256,
  replaySchema,
  replay,
}) {
  digest(envelopeSha256, "authority.envelopeSha256");
  digest(mathematicalAuthoritySha256, "authority.mathematicalAuthoritySha256");
  string(replaySchema, "authority.replaySchema");
  if (typeof replay !== "function") fail("authority.replay must be a function");
  const authority = Object.freeze({
    envelopeSha256,
    mathematicalAuthoritySha256,
    replaySchema,
    replay,
  });
  AUTHORITY_BRAND.add(authority);
  return authority;
}

const RESULT_DATA = new WeakMap();

class ImmutableClassUnitCorrespondenceResult {
  constructor(token, raw, payload, sha256) {
    if (token !== RESULT_DATA) fail("verified results cannot be directly constructed");
    RESULT_DATA.set(this, { raw: Buffer.from(raw), payload, sha256 });
    Object.freeze(this);
  }

  get sha256() {
    return RESULT_DATA.get(this).sha256;
  }

  canonicalJSON() {
    return Buffer.from(RESULT_DATA.get(this).raw);
  }

  detachedPayload() {
    return structuredClone(RESULT_DATA.get(this).payload);
  }
}

function verifyClassUnitCorrespondenceResult(raw, authority) {
  if (!AUTHORITY_BRAND.has(authority)) fail("authority is not out-of-band");
  const actualEnvelopeSha256 = sha256Bytes(raw);
  if (actualEnvelopeSha256 !== authority.envelopeSha256) {
    fail("envelope lacks out-of-band authority");
  }
  const envelope = strictParse(raw);
  keys(envelope, ["payload", "payloadSha256", "schema"], "result envelope");
  if (envelope.schema !== ENVELOPE_SCHEMA) fail("envelope schema changed");
  digest(envelope.payloadSha256, "envelope.payloadSha256");
  const payload = validatePayload(record(envelope.payload, "payload"));
  const payloadSha256 = sha256Canonical(payload);
  if (envelope.payloadSha256 !== payloadSha256) fail("payload digest changed");
  if (payload.source.replaySchema !== authority.replaySchema) {
    fail("replay schema disagrees with the source record");
  }
  let replay;
  try {
    replay = authority.replay(structuredClone(payload));
  } catch (error) {
    throw new ClassUnitResultFailure("independent mathematical replay rejected", {
      cause: error,
    });
  }
  if (replay && typeof replay.then === "function") {
    fail("detached mathematical replay must be synchronous");
  }
  keys(
    replay,
    ["correspondence_complete", "fieldId", "mathematicalAuthoritySha256", "payloadSha256", "public_complete", "schema"],
    "replay receipt",
  );
  if (replay.schema !== authority.replaySchema) fail("replay receipt schema changed");
  if (replay.payloadSha256 !== payloadSha256) fail("replay did not authenticate this payload");
  if (replay.fieldId !== payload.field.id) fail("replay field identity changed");
  if (replay.mathematicalAuthoritySha256 !== authority.mathematicalAuthoritySha256) {
    fail("mathematical authority digest changed");
  }
  if (replay.correspondence_complete !== true || replay.public_complete !== false) {
    fail("replay terminal tier changed");
  }
  const payloadCopy = JSON.parse(canonical(payload).toString("ascii"));
  return new ImmutableClassUnitCorrespondenceResult(
    RESULT_DATA,
    raw,
    payloadCopy,
    actualEnvelopeSha256,
  );
}

class ClassUnitCorrespondencePublisher {
  #current;

  publish(raw, authority) {
    // Verify into a detached candidate before changing publisher state.
    const candidate = verifyClassUnitCorrespondenceResult(raw, authority);
    if (this.#current === undefined) {
      this.#current = candidate;
    } else if (this.#current.sha256 !== candidate.sha256) {
      throw new ClassUnitResultConflict("a different result is already published");
    }
    return this.#current;
  }

  current() {
    return this.#current;
  }
}

module.exports = {
  ClassUnitCorrespondencePublisher,
  ClassUnitResultConflict,
  ClassUnitResultFailure,
  ENVELOPE_SCHEMA,
  HONESTY_OUTCOMES,
  ImmutableClassUnitCorrespondenceResult,
  MATERIALIZATION_TAGS,
  NOT_GIVEN_REASONS,
  PAYLOAD_SCHEMA,
  canonical,
  createDetachedClassUnitAuthority,
  sealClassUnitCorrespondenceResult,
  sha256Bytes,
  sha256Canonical,
  validatePayload,
  verifyClassUnitCorrespondenceResult,
};
