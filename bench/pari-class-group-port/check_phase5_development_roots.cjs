#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const registry = require("./phase5_development_roots.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const manifest = require("./class-unit-qualification-manifest.json");
const panel = require("./panel.json");

function owner(name, role, entries) {
  return { capacity: String(entries.length), encoding: "canonical-decimal-integer",
    entries, logicalLength: String(entries.length), name, role };
}

function payloadFor(entry, overrides = {}) {
  const payload = {
    classGroup: { classNumber: "1", generatorCount: "0", invariantFactors: [],
      presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: [...entry.coefficients], degree: String(entry.degree),
      id: entry.internalFieldId },
    honesty: { evidenceOwner: null, outcome: "not-required", sourcePolicy: "focused-registry-test" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [{ disposition: "assumed", id: "test-authority",
      statement: "focused registry fixture only" }],
    correspondence: "upstream-assumed-pari-correspondence",
    pariSourceSha256: "a".repeat(64), pariVersion: "2.17.4",
    replaySchema: "sagejs.pari-class-group/phase5-development-root-test-replay-v1" },
    storage: [
      owner("class-presentation", "class-presentation", ["1"]),
      owner("exact-unit-coordinates", "exact-unit-coordinates",
        Array(entry.degree * (entry.degree - 1)).fill("0")),
      owner("exact-unit-norms", "exact-unit-norms", Array(entry.degree - 1).fill("1")),
      owner("regulator-enclosure", "regulator-enclosure", ["1", "192"]),
      owner("torsion-generator", "torsion-generator", ["-1", ...Array(entry.degree - 1).fill("0")]),
    ],
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { coordinatesOwner: "exact-unit-coordinates",
      normsOwner: "exact-unit-norms", tag: "exact_units" }, rank: String(entry.degree - 1),
    regulatorOwner: "regulator-enclosure", torsionGeneratorOwner: "torsion-generator",
    torsionOrder: "2" },
  };
  if (overrides.field) Object.assign(payload.field, overrides.field);
  return payload;
}

function sealed(entry, overrides = {}) {
  const payload = payloadFor(entry, overrides);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const payloadSha256 = neutral.sha256Canonical(payload);
  const mathematicalAuthoritySha256 = "b".repeat(64);
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
    replaySchema: payload.source.replaySchema,
    replay(candidate) {
      return { correspondence_complete: true, fieldId: candidate.field.id,
        mathematicalAuthoritySha256, payloadSha256, public_complete: false,
        schema: payload.source.replaySchema };
    },
  });
  return { authority, raw };
}

const roots = registry.buildDevelopmentRootRegistry();
assert.equal(roots.length, 16);
assert.equal(roots.filter(value => value.completionStatus === registry.COMPLETE).length, 15);
assert.equal(roots.filter(value => value.completionStatus === registry.BLOCKED).length, 1);
assert.equal(roots.filter(value => value.publicationStatus === registry.NEUTRAL_READY).length, 13);
assert.equal(roots.every(value => value.freshPreparedExecution === false), true);
assert.equal(roots.every(value => value.qualifiedTiming === false), true);
assert.deepEqual(roots.filter(value => value.completionStatus === registry.BLOCKED)
  .map(value => value.panelIndex), [23]);
assert.deepEqual(roots.filter(value => value.publicationStatus === registry.ADAPTER_REQUIRED)
  .map(value => value.panelIndex), [19, 21]);
const row19 = registry.developmentRoot(19);
assert.equal(row19.module, "row19_final_result_coordinator.cjs");
assert.equal(row19.composeExport, "compose");
assert.equal(row19.publishExport, "publish");
assert.equal(row19.sourceSchema,
  "sagejs.pari-class-group/row19-buchall-end-result-v1");

const entry = registry.developmentRoot(1);
const fixture = sealed(entry);
const normalized = registry.verifyDevelopmentRoot({ panelIndex: 1, ...fixture,
  sourceMetadata: { fieldId: entry.manifestFieldId, correspondenceComplete: true,
    publicComplete: false, qualifiedTiming: false,
    status: "ready-for-out-of-band-publication-authority" } });
assert.equal(normalized.schema, registry.ROOT_SCHEMA);
assert.equal(normalized.fieldId, entry.manifestFieldId);
assert.equal(normalized.resultSha256, neutral.sha256Bytes(fixture.raw));
assert.deepEqual(normalized.signature, [3, 0]);
assert.equal(normalized.freshPreparedExecution, false);

const wrongIdentity = sealed(entry, { field: {
  definingPolynomialAscending: ["20019", "-20010", "0", "1"],
} });
assert.throws(() => registry.verifyDevelopmentRoot({ panelIndex: 1, ...wrongIdentity }),
  /polynomial changed/);

assert.throws(() => registry.verifyDevelopmentRoot({ panelIndex: 1, ...fixture,
  sourceMetadata: { status: "qualified-final-timing" } }), /unsupported Phase-5 source status/);
assert.throws(() => registry.verifyDevelopmentRoot({ panelIndex: 1, raw: fixture.raw,
  authority: {} }), neutral.ClassUnitResultFailure);
assert.throws(() => registry.normalizeVerifiedDevelopmentRoot({ panelIndex: 1, result: {} }),
  /verified neutral result brand/);
assert.throws(() => registry.developmentRoot(2), registry.Phase5ReserveFieldRejected);
assert.throws(() => registry.verifyDevelopmentRoot({ panelIndex: 19, ...fixture }),
  registry.Phase5DevelopmentRootUnavailable);
assert.throws(() => registry.verifyDevelopmentRoot({ panelIndex: 23, ...fixture }),
  registry.Phase5DevelopmentRootUnavailable);
assert.throws(() => registry.verifyDevelopmentRoot({ panelIndex: 21, ...fixture }),
  registry.Phase5DevelopmentRootUnavailable);

const changedPanel = structuredClone(panel);
changedPanel.rows[1].signature = [1, 1];
assert.throws(() => registry.buildDevelopmentRootRegistry({ manifest, panel: changedPanel }),
  /signature changed/);
const changedPolynomial = structuredClone(panel);
changedPolynomial.rows[1].coefficients[0] = "20019";
assert.throws(() => registry.buildDevelopmentRootRegistry({ manifest, panel: changedPolynomial }),
  /polynomial digest is invalid/);

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/phase5-development-root-check-v1",
  registeredDevelopmentFields: roots.length,
  committedInternallyComplete: 15,
  neutralEnvelopeReady: 13,
  adapterRequired: [19, 21],
  blocked: [23],
  reservesOpened: 0,
  freshPreparedExecutions: 0,
  qualifiedTimings: 0,
  negativeCases: 10,
})}\n`);
