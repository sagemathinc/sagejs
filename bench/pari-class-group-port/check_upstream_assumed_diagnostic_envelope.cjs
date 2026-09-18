#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const result = require("./upstream_assumed_diagnostic_envelope.cjs");

const FIELD_ID = "diagnostic:x^3-x^2-7*x+186";
const REPLAY_SCHEMA = "sagejs.pari-class-group/diagnostic-component-replay-v1";
const COMPONENTS = Object.freeze([
  "class-generator-witnesses",
  "compact-unit-lattice",
  "exact-unit-reconstruction",
  "factor-base",
  "hnf-snf",
  "honesty",
  "prepared-field",
  "regulator-acceptance",
  "relation-presentation",
  "terminal-candidate",
  "torsion",
]);

const trusted = Object.fromEntries(COMPONENTS.map((name, index) => [name, {
  counters: [String(index), String(index + 1)],
  fieldId: FIELD_ID,
  label: name,
}]));

function assumptions() {
  return [
    {disposition: "assumed", id: "grh-bounds",
      statement: "PARI's GRH-dependent factor-base bounds are assumed"},
    {disposition: "assumed", id: "pari-correspondence",
      statement: "PARI 2.17.4's undocumented and floating decisions are assumed"},
  ];
}

function makePayload(overrides = {}) {
  const components = COMPONENTS.map((name, index) => result.diagnosticComponent({
    name,
    payload: structuredClone(trusted[name]),
    provenanceSha256: result.sha256Canonical({name, source: "live-or-frozen-owner"}),
    schema: `sagejs.pari-class-group/${name}-diagnostic-v1`,
    status: index % 3 === 0 ? "live-authenticated" :
      index % 3 === 1 ? "frozen-diagnostic" : "derived-diagnostic",
  }));
  return result.diagnosticPayload({
    assumptions: assumptions(),
    components,
    field: {
      definingPolynomialAscending: ["186", "-7", "-1", "1"],
      degree: "3",
      id: FIELD_ID,
      signature: ["1", "1"],
    },
    ...overrides,
  });
}

function componentReplayers() {
  return Object.fromEntries(COMPONENTS.map((name, index) => [name, {
    replay(payload, descriptor) {
      assert.deepEqual(payload, trusted[name]);
      assert.equal(descriptor.name, name);
      assert.equal(descriptor.payloadSha256, result.sha256Canonical(trusted[name]));
      assert.equal(descriptor.provenanceSha256,
        result.sha256Canonical({name, source: "live-or-frozen-owner"}));
      assert.equal(descriptor.schema,
        `sagejs.pari-class-group/${name}-diagnostic-v1`);
      assert.equal(descriptor.status, index % 3 === 0 ? "live-authenticated" :
        index % 3 === 1 ? "frozen-diagnostic" : "derived-diagnostic");
      return {
        accepted: true,
        componentSha256: descriptor.payloadSha256,
        evidenceSha256: result.sha256Canonical({name, trusted: trusted[name]}),
        fieldId: FIELD_ID,
        name,
        replaySchema: REPLAY_SCHEMA,
      };
    },
    replaySchema: REPLAY_SCHEMA,
  }]));
}

function authority(raw) {
  return result.createDiagnosticReplayAuthority({
    componentReplayers: componentReplayers(),
    envelopeSha256: result.sha256Bytes(raw),
    fieldId: FIELD_ID,
  });
}

const payload = makePayload();
const raw = result.sealDiagnosticEnvelope(payload);
const verified = result.verifyDiagnosticEnvelope(raw, authority(raw));
assert(verified instanceof result.ImmutableUpstreamAssumedDiagnosticResult);
assert.equal(verified.sha256, result.sha256Bytes(raw));
assert.deepEqual(verified.detachedPayload().terminal, {
  buchallEndEquivalent: false,
  classUnitComputationComplete: false,
  diagnosticOnly: true,
  missingForBuchallEnd: [...result.MISSING_FOR_BUCHALL_END],
  publicComplete: false,
  status: "upstream-assumed-diagnostic-only",
});

// Sealing owns its bytes.  Neither original live/frozen payloads nor returned
// buffers can mutate the published result.
trusted[COMPONENTS[0]].counters[0] = "999";
assert.equal(verified.detachedPayload().components[0].payload.counters[0], "0");
trusted[COMPONENTS[0]].counters[0] = "0";
const exposed = verified.canonicalJSON();
exposed[0] ^= 1;
assert(verified.canonicalJSON().equals(raw));

let componentMutationsRejected = 0;
for (const [index, name] of COMPONENTS.entries()) {
  const changed = makePayload();
  const component = changed.components.find(entry => entry.name === name);
  component.payload.counters[0] = String(index + 1000);
  component.payloadSha256 = result.sha256Canonical(component.payload);
  const changedRaw = result.sealDiagnosticEnvelope(changed);
  assert.throws(
    () => result.verifyDiagnosticEnvelope(changedRaw, authority(changedRaw)),
    result.DiagnosticEnvelopeFailure,
  );
  componentMutationsRejected += 1;
}

// Descriptor changes are also material, even when payload bytes are retained.
for (const field of ["provenanceSha256", "schema", "status"]) {
  const changed = makePayload();
  const component = changed.components[0];
  if (field === "provenanceSha256") component[field] = "f".repeat(64);
  else if (field === "schema") component[field] += "-changed";
  else component[field] = "frozen-diagnostic";
  const changedRaw = result.sealDiagnosticEnvelope(changed);
  assert.throws(
    () => result.verifyDiagnosticEnvelope(changedRaw, authority(changedRaw)),
    result.DiagnosticEnvelopeFailure,
  );
}

const publicFraud = makePayload();
publicFraud.terminal.classUnitComputationComplete = true;
assert.throws(() => result.sealDiagnosticEnvelope(publicFraud),
  result.DiagnosticEnvelopeFailure);
const buchallFraud = makePayload();
buchallFraud.terminal.buchallEndEquivalent = true;
assert.throws(() => result.sealDiagnosticEnvelope(buchallFraud),
  result.DiagnosticEnvelopeFailure);
const missingFraud = makePayload();
missingFraud.terminal.missingForBuchallEnd.pop();
assert.throws(() => result.sealDiagnosticEnvelope(missingFraud),
  result.DiagnosticEnvelopeFailure);

const publisher = new result.DiagnosticResultPublisher();
assert.equal(publisher.publish(raw, authority(raw)), publisher.current());
assert.equal(publisher.publish(raw, authority(raw)), publisher.current());
const conflict = makePayload();
conflict.source.assumptions[0].statement += " (same field, different terminal result)";
const conflictRaw = result.sealDiagnosticEnvelope(conflict);
assert.throws(() => publisher.publish(conflictRaw, authority(conflictRaw)),
  result.DiagnosticEnvelopeConflict);
assert.equal(publisher.current().sha256, verified.sha256);

process.stdout.write(JSON.stringify({
  buchallEndEquivalent: false,
  classUnitComputationComplete: false,
  componentCount: COMPONENTS.length,
  componentMutationsRejected,
  envelopeSha256: verified.sha256,
  missingInputCount: result.MISSING_FOR_BUCHALL_END.length,
  publicComplete: false,
  schema: result.ENVELOPE_SCHEMA,
}, null, 2) + "\n");
