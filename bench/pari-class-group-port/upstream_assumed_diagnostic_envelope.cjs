"use strict";

// Minimal detached publication boundary for incomplete PARI-correspondence
// diagnostics.  This is intentionally not ClassUnitComputation and cannot
// represent a buchall_end-equivalent result.

const crypto = require("node:crypto");

const PAYLOAD_SCHEMA =
  "sagejs.pari-class-group/upstream-assumed-diagnostic-payload-v1";
const ENVELOPE_SCHEMA =
  "sagejs.pari-class-group/upstream-assumed-diagnostic-envelope-v1";
const PARI_ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const PARI_BUCH2_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_COMPONENTS = 64;
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;
const COMPONENT_STATUSES = new Set([
  "derived-diagnostic",
  "frozen-diagnostic",
  "live-authenticated",
]);
const MISSING_FOR_BUCHALL_END = Object.freeze([
  "accepted-relation-hnf-dependent-log-state-from-one-authenticated-run",
  "class-smith-hnf-transformations-and-raw-relation-provenance",
  "generator-ideals-and-exact-principal-order-witnesses",
  "M1-M2-Ga-Ge-GD-ga-clg2-archimedean-state",
  "fundamental-unit-factors-getfu-provenance-and-source-materialization-status",
  "torsion-regulator-precision-and-acceptance-evidence",
  "honesty-cleanarch-retry-and-terminal-source-state",
  "transactional-buchall-end-assembly-with-cross-component-cold-replay",
]);

class DiagnosticEnvelopeFailure extends Error {}
class DiagnosticEnvelopeConflict extends Error {}

function fail(message) {
  throw new DiagnosticEnvelopeFailure(message);
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

function exactKeys(value, expected, name) {
  record(value, name);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length ||
      actual.some((entry, index) => entry !== wanted[index])) {
    fail(`${name} has unexpected fields`);
  }
  return value;
}

function string(value, name) {
  if (typeof value !== "string" || value.length === 0 ||
      value.length > 65536 || !/^[\x20-\x7e]+$/.test(value)) {
    fail(`${name} must be a bounded printable string`);
  }
  return value;
}

function digest(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${name} must be a SHA-256 digest`);
  }
  return value;
}

function canonical(value) {
  const normalize = entry => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (isPlainObject(entry)) {
      return Object.fromEntries(
        Object.keys(entry).sort().map(key => [key, normalize(entry[key])]),
      );
    }
    if (entry === null || typeof entry === "string" ||
        typeof entry === "boolean") return entry;
    if (typeof entry === "number" && Number.isFinite(entry) &&
        !Object.is(entry, -0)) return entry;
    fail("diagnostic envelope contains a noncanonical JSON value");
  };
  let raw;
  try {
    raw = Buffer.from(JSON.stringify(normalize(value)), "ascii");
  } catch (error) {
    if (error instanceof DiagnosticEnvelopeFailure) throw error;
    throw new DiagnosticEnvelopeFailure("diagnostic envelope is not JSON", {
      cause: error,
    });
  }
  if (raw.length > MAX_BYTES) fail("diagnostic envelope exceeds its byte bound");
  return raw;
}

function sha256Bytes(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function sha256Canonical(value) {
  return sha256Bytes(canonical(value));
}

function strictParse(raw) {
  if (!Buffer.isBuffer(raw) || raw.length > MAX_BYTES) {
    fail("diagnostic envelope must be a bounded Buffer");
  }
  let value;
  try {
    value = JSON.parse(raw.toString("ascii"));
  } catch (error) {
    throw new DiagnosticEnvelopeFailure("diagnostic envelope is not JSON", {
      cause: error,
    });
  }
  if (!canonical(value).equals(raw)) {
    fail("diagnostic envelope is not canonical JSON");
  }
  return record(value, "diagnostic envelope");
}

function validateField(field) {
  exactKeys(field, ["degree", "definingPolynomialAscending", "id", "signature"],
    "field");
  string(field.id, "field.id");
  if (typeof field.degree !== "string" || !/^[1-9][0-9]*$/.test(field.degree)) {
    fail("field.degree must be a positive canonical decimal");
  }
  if (!Array.isArray(field.definingPolynomialAscending) ||
      BigInt(field.definingPolynomialAscending.length) !== BigInt(field.degree) + 1n ||
      field.definingPolynomialAscending.some(entry =>
        typeof entry !== "string" || !INTEGER.test(entry))) {
    fail("field polynomial has the wrong exact shape");
  }
  if (field.definingPolynomialAscending.at(-1) === "0") {
    fail("field polynomial lost its leading term");
  }
  if (!Array.isArray(field.signature) || field.signature.length !== 2 ||
      field.signature.some(entry =>
        typeof entry !== "string" || !/^(0|[1-9][0-9]*)$/.test(entry)) ||
      BigInt(field.signature[0]) + 2n * BigInt(field.signature[1]) !==
        BigInt(field.degree)) {
    fail("field signature is inconsistent with its degree");
  }
}

function validateSource(source) {
  exactKeys(source, ["archiveSha256", "assumptions", "buch2Sha256",
    "correspondence", "pariVersion"], "source");
  if (source.pariVersion !== "2.17.4" ||
      source.archiveSha256 !== PARI_ARCHIVE_SHA256 ||
      source.buch2Sha256 !== PARI_BUCH2_SHA256 ||
      source.correspondence !== "upstream-assumed-pari-correspondence") {
    fail("source identity or assumption mode changed");
  }
  if (!Array.isArray(source.assumptions) || source.assumptions.length === 0) {
    fail("source assumptions are required");
  }
  let previous = "";
  for (const [index, assumption] of source.assumptions.entries()) {
    exactKeys(assumption, ["disposition", "id", "statement"],
      `source.assumptions[${index}]`);
    string(assumption.id, `source.assumptions[${index}].id`);
    string(assumption.statement, `source.assumptions[${index}].statement`);
    if (assumption.disposition !== "assumed" || assumption.id <= previous) {
      fail("source assumptions must be uniquely sorted and explicitly assumed");
    }
    previous = assumption.id;
  }
}

function validateComponent(component, index) {
  const name = `components[${index}]`;
  exactKeys(component, ["name", "payload", "payloadSha256", "provenanceSha256",
    "schema", "status"], name);
  string(component.name, `${name}.name`);
  string(component.schema, `${name}.schema`);
  if (!COMPONENT_STATUSES.has(component.status)) {
    fail(`${name}.status is unsupported`);
  }
  digest(component.provenanceSha256, `${name}.provenanceSha256`);
  digest(component.payloadSha256, `${name}.payloadSha256`);
  canonical(component.payload);
  if (component.payloadSha256 !== sha256Canonical(component.payload)) {
    fail(`${name} payload digest changed`);
  }
}

function validateTerminal(terminal) {
  exactKeys(terminal, ["buchallEndEquivalent", "classUnitComputationComplete",
    "diagnosticOnly", "missingForBuchallEnd", "publicComplete", "status"],
  "terminal");
  if (terminal.status !== "upstream-assumed-diagnostic-only" ||
      terminal.diagnosticOnly !== true ||
      terminal.buchallEndEquivalent !== false ||
      terminal.classUnitComputationComplete !== false ||
      terminal.publicComplete !== false ||
      !Array.isArray(terminal.missingForBuchallEnd) ||
      terminal.missingForBuchallEnd.length !== MISSING_FOR_BUCHALL_END.length ||
      terminal.missingForBuchallEnd.some((entry, index) =>
        entry !== MISSING_FOR_BUCHALL_END[index])) {
    fail("diagnostic terminal status attempted a stronger claim");
  }
}

function validatePayload(payload) {
  exactKeys(payload, ["components", "field", "schema", "source", "terminal"],
    "payload");
  if (payload.schema !== PAYLOAD_SCHEMA) fail("payload schema changed");
  validateField(record(payload.field, "field"));
  validateSource(record(payload.source, "source"));
  if (!Array.isArray(payload.components) || payload.components.length === 0 ||
      payload.components.length > MAX_COMPONENTS) {
    fail("components must be a nonempty bounded list");
  }
  let previous = "";
  for (const [index, component] of payload.components.entries()) {
    validateComponent(record(component, `components[${index}]`), index);
    if (component.name <= previous) fail("components are not uniquely sorted");
    previous = component.name;
  }
  validateTerminal(record(payload.terminal, "terminal"));
  return payload;
}

function diagnosticComponent({name, schema, status, provenanceSha256, payload}) {
  const detached = JSON.parse(canonical(payload).toString("ascii"));
  const component = {
    name,
    payload: detached,
    payloadSha256: sha256Canonical(detached),
    provenanceSha256,
    schema,
    status,
  };
  validateComponent(component, 0);
  return component;
}

function diagnosticPayload({field, assumptions, components}) {
  const sortedAssumptions = [...assumptions].sort((left, right) =>
    left.id.localeCompare(right.id));
  const sortedComponents = [...components].sort((left, right) =>
    left.name.localeCompare(right.name));
  const payload = {
    components: sortedComponents,
    field,
    schema: PAYLOAD_SCHEMA,
    source: {
      archiveSha256: PARI_ARCHIVE_SHA256,
      assumptions: sortedAssumptions,
      buch2Sha256: PARI_BUCH2_SHA256,
      correspondence: "upstream-assumed-pari-correspondence",
      pariVersion: "2.17.4",
    },
    terminal: {
      buchallEndEquivalent: false,
      classUnitComputationComplete: false,
      diagnosticOnly: true,
      missingForBuchallEnd: [...MISSING_FOR_BUCHALL_END],
      publicComplete: false,
      status: "upstream-assumed-diagnostic-only",
    },
  };
  validatePayload(payload);
  return JSON.parse(canonical(payload).toString("ascii"));
}

function sealDiagnosticEnvelope(payload) {
  validatePayload(payload);
  const detached = JSON.parse(canonical(payload).toString("ascii"));
  return canonical({
    payload: detached,
    payloadSha256: sha256Canonical(detached),
    schema: ENVELOPE_SCHEMA,
  });
}

const AUTHORITIES = new WeakMap();

function createDiagnosticReplayAuthority({
  envelopeSha256,
  fieldId,
  componentReplayers,
}) {
  digest(envelopeSha256, "authority.envelopeSha256");
  string(fieldId, "authority.fieldId");
  record(componentReplayers, "authority.componentReplayers");
  const privateReplayers = new Map();
  for (const name of Object.keys(componentReplayers).sort()) {
    string(name, "component replay name");
    const specification = exactKeys(componentReplayers[name],
      ["replay", "replaySchema"], `component replay ${name}`);
    string(specification.replaySchema, `component replay ${name}.replaySchema`);
    if (typeof specification.replay !== "function") {
      fail(`component replay ${name}.replay must be a function`);
    }
    privateReplayers.set(name, {
      replay: specification.replay,
      replaySchema: specification.replaySchema,
    });
  }
  const authority = Object.freeze({
    componentNames: Object.freeze([...privateReplayers.keys()]),
    envelopeSha256,
    fieldId,
  });
  AUTHORITIES.set(authority, privateReplayers);
  return authority;
}

class ImmutableUpstreamAssumedDiagnosticResult {
  #canonicalJSON;

  constructor(raw) {
    this.#canonicalJSON = Buffer.from(raw);
    this.sha256 = sha256Bytes(this.#canonicalJSON);
    Object.freeze(this);
  }

  canonicalJSON() {
    return Buffer.from(this.#canonicalJSON);
  }

  detachedPayload() {
    return strictParse(this.#canonicalJSON).payload;
  }
}

function verifyDiagnosticEnvelope(raw, authority) {
  const replayers = AUTHORITIES.get(authority);
  if (!replayers) fail("diagnostic replay authority is not authentic");
  const envelope = exactKeys(strictParse(raw),
    ["payload", "payloadSha256", "schema"], "diagnostic envelope");
  if (envelope.schema !== ENVELOPE_SCHEMA ||
      envelope.payloadSha256 !== sha256Canonical(envelope.payload) ||
      sha256Bytes(raw) !== authority.envelopeSha256) {
    fail("diagnostic envelope authentication changed");
  }
  validatePayload(record(envelope.payload, "payload"));
  if (envelope.payload.field.id !== authority.fieldId) {
    fail("diagnostic field authority changed");
  }
  const components = envelope.payload.components;
  if (components.length !== replayers.size ||
      components.some(component => !replayers.has(component.name))) {
    fail("component replay authority is incomplete");
  }
  for (const component of components) {
    const specification = replayers.get(component.name);
    let receipt;
    try {
      receipt = specification.replay(
        JSON.parse(canonical(component.payload).toString("ascii")),
        Object.freeze({
          name: component.name,
          payloadSha256: component.payloadSha256,
          provenanceSha256: component.provenanceSha256,
          schema: component.schema,
          status: component.status,
        }),
      );
    } catch (error) {
      throw new DiagnosticEnvelopeFailure(
        `cold replay rejected component ${component.name}`, {cause: error});
    }
    exactKeys(receipt, ["accepted", "componentSha256", "evidenceSha256",
      "fieldId", "name", "replaySchema"], `replay receipt ${component.name}`);
    if (receipt.accepted !== true || receipt.fieldId !== authority.fieldId ||
        receipt.name !== component.name ||
        receipt.replaySchema !== specification.replaySchema ||
        receipt.componentSha256 !== component.payloadSha256) {
      fail(`cold replay receipt changed for component ${component.name}`);
    }
    digest(receipt.evidenceSha256,
      `replay receipt ${component.name}.evidenceSha256`);
  }
  return new ImmutableUpstreamAssumedDiagnosticResult(raw);
}

class DiagnosticResultPublisher {
  #published = null;

  publish(raw, authority) {
    const candidate = verifyDiagnosticEnvelope(raw, authority);
    if (this.#published === null) this.#published = candidate;
    else if (this.#published.sha256 !== candidate.sha256) {
      throw new DiagnosticEnvelopeConflict(
        "a different diagnostic result is already published");
    }
    return this.#published;
  }

  current() {
    return this.#published;
  }
}

module.exports = {
  DiagnosticEnvelopeConflict,
  DiagnosticEnvelopeFailure,
  DiagnosticResultPublisher,
  ENVELOPE_SCHEMA,
  ImmutableUpstreamAssumedDiagnosticResult,
  MISSING_FOR_BUCHALL_END,
  PARI_ARCHIVE_SHA256,
  PARI_BUCH2_SHA256,
  PAYLOAD_SCHEMA,
  canonical,
  createDiagnosticReplayAuthority,
  diagnosticComponent,
  diagnosticPayload,
  sealDiagnosticEnvelope,
  sha256Bytes,
  sha256Canonical,
  verifyDiagnosticEnvelope,
};
