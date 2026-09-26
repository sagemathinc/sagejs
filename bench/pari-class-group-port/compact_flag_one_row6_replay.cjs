#!/usr/bin/env node
"use strict";

// Executable, untimed compact-tier replay for development-panel row 6.
// This deliberately stops at PARI's factored-unit representation: it never
// expands either unit into a number-field element.

const crypto = require("node:crypto");
const fs = require("node:fs");
const neutral = require("./class_unit_correspondence_result.cjs");
const compactManifest = require("./compact_flag_one_row20_adapter.cjs");

const RECEIPT_SCHEMA =
  "sagejs.pari-class-group/compact-flag-one-row6-replay-v1";
const FIELD_ID =
  "generated-sha256-55ba15494f03f38bf8f687ff4d2813e81184d71c84dbed9e1adc6af7ba62f0eb";
const ENVELOPE_SHA256 =
  "b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73";
const PAYLOAD_SHA256 =
  "84d8b6b4c67ca4a32703e9e5aac7c3ffa9c01645493c0605f232121a6c7c093f";
const ROWS = 1130;
const RELATIONS = 1137;
const KERNEL_COLUMNS = 7;
const UNIT_RANK = 2;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

class CompactFlagOneRow6Failure extends Error {}
function fail(message) { throw new CompactFlagOneRow6Failure(message); }
function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join("\0") !== [...expected].sort().join("\0")) {
    fail(`${label} has unexpected fields`);
  }
}
function integers(owner, name, length) {
  if (!owner || owner.encoding !== "canonical-decimal-integer" ||
      owner.logicalLength !== String(length) || owner.capacity !== String(length) ||
      !Array.isArray(owner.entries) || owner.entries.length !== length ||
      !owner.entries.every(entry => typeof entry === "string" && INTEGER.test(entry))) {
    fail(`${name} owner changed`);
  }
  return owner.entries;
}
function ownerMap(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}

function replayCompactPayload(payload) {
  if (payload.field.id !== FIELD_ID || payload.field.degree !== "3" ||
      payload.field.definingPolynomialAscending.join(",") !==
        "2000000000018,-2000000000010,0,1") {
    fail("row 6 field identity changed");
  }
  if (payload.classGroup.classNumber !== "4" ||
      payload.classGroup.invariantFactors.join(",") !== "2,2") {
    fail("row 6 class group changed");
  }
  if (payload.unitGroup.rank !== "2" || payload.unitGroup.torsionOrder !== "2" ||
      payload.unitGroup.materialization?.tag !== "not_given" ||
      payload.unitGroup.materialization?.reason !== "LARGE" ||
      payload.unitGroup.materialization?.precisionBits !== "192") {
    fail("row 6 compact unit result changed");
  }
  if (payload.terminal.correspondence_complete !== true ||
      payload.terminal.public_complete !== false) {
    fail("row 6 completion status changed");
  }

  const owners = ownerMap(payload);
  if (owners.has("exact-unit-coordinates") || owners.has("expanded-unit-coordinates")) {
    fail("an eager unit materialization owner appeared");
  }
  const rawToKernel = integers(owners.get("raw-to-unit-kernel-transform"),
    "raw-to-unit-kernel", RELATIONS * KERNEL_COLUMNS);
  const compact = integers(owners.get("compact-unit-transform"),
    "compact-unit-transform", UNIT_RANK * KERNEL_COLUMNS);
  const factored = integers(owners.get("factored-unit-transform"),
    "factored-unit-transform", UNIT_RANK * RELATIONS);
  const records = integers(owners.get("raw-relation-records"),
    "raw-relation-records", ROWS * RELATIONS);
  const unitNorms = integers(owners.get("unit-norms"), "unit-norms", UNIT_RANK);

  let compactNonzero = 0;
  let maximumCompactAbsolute = 0n;
  let factoredNonzero = 0;
  for (let unit = 0; unit < UNIT_RANK; unit += 1) {
    for (let relation = 0; relation < RELATIONS; relation += 1) {
      let sum = 0n;
      for (let column = 0; column < KERNEL_COLUMNS; column += 1) {
        const coefficient = BigInt(compact[unit * KERNEL_COLUMNS + column]);
        sum += BigInt(rawToKernel[column * RELATIONS + relation]) * coefficient;
        if (relation === 0 && coefficient !== 0n) {
          compactNonzero += 1;
          const absolute = coefficient < 0n ? -coefficient : coefficient;
          if (absolute > maximumCompactAbsolute) maximumCompactAbsolute = absolute;
        }
      }
      if (sum !== BigInt(factored[unit * RELATIONS + relation])) {
        fail(`factored transform replay failed at unit ${unit}, relation ${relation}`);
      }
      if (sum !== 0n) factoredNonzero += 1;
    }
  }
  if (compactNonzero !== 4 || maximumCompactAbsolute !== 289737766830681n ||
      factoredNonzero === 0) {
    fail("compact transform support changed");
  }

  let checkedProducts = 0;
  for (let unit = 0; unit < UNIT_RANK; unit += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      let sum = 0n;
      for (let relation = 0; relation < RELATIONS; relation += 1) {
        sum += BigInt(records[relation * ROWS + row]) *
          BigInt(factored[unit * RELATIONS + relation]);
      }
      checkedProducts += 1;
      if (sum !== 0n) fail(`factored unit ${unit} does not annihilate row ${row}`);
    }
  }
  if (unitNorms.join(",") !== "-1,-1") fail("compact unit norm signs changed");

  return Object.freeze({
    compactTransformShape: [KERNEL_COLUMNS, UNIT_RANK],
    compactTransformNonzero: compactNonzero,
    maximumCompactAbsolute: String(maximumCompactAbsolute),
    factoredTransformShape: [RELATIONS, UNIT_RANK],
    factoredTransformNonzero: factoredNonzero,
    relationMatrixShape: [ROWS, RELATIONS],
    exactZeroProductsChecked: checkedProducts,
    unitNorms: [...unitNorms],
  });
}

function executeRow6CompactReplay({ owner, manifestPath = compactManifest.MANIFEST_PATH }) {
  const manifest = compactManifest.validateManifest(manifestPath);
  const frozenRow = manifest.fields.find(field => field.panelIndex === 6);
  if (!frozenRow || frozenRow.id !== FIELD_ID || frozenRow.degree !== 3 ||
      frozenRow.signature.join(",") !== "3,0") {
    fail("row 6 is not the frozen compact-tier row");
  }
  const stat = fs.statSync(owner);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o444) {
    fail("row 6 retained owner must be an immutable mode-0444 file");
  }
  const raw = fs.readFileSync(owner);
  if (sha256(raw) !== ENVELOPE_SHA256) fail("row 6 retained owner digest changed");
  let envelope;
  try { envelope = JSON.parse(raw.toString("ascii")); }
  catch (error) { throw new CompactFlagOneRow6Failure("row 6 owner is not JSON", { cause: error }); }
  if (!neutral.canonical(envelope).equals(raw)) fail("row 6 owner is not canonical JSON");
  exactKeys(envelope, ["payload", "payloadSha256", "schema"], "row 6 envelope");
  if (envelope.schema !== neutral.ENVELOPE_SCHEMA ||
      envelope.payloadSha256 !== PAYLOAD_SHA256 ||
      neutral.sha256Canonical(envelope.payload) !== PAYLOAD_SHA256) {
    fail("row 6 envelope identity changed");
  }
  neutral.validatePayload(envelope.payload);
  const replay = replayCompactPayload(envelope.payload);
  return Object.freeze({
    schema: RECEIPT_SCHEMA,
    diagnosticOnly: true,
    qualifiedTiming: false,
    finalRun: false,
    tier: "compact-flag-one",
    boundary: "retained-owner-compact-replay",
    implementation: "sagejs",
    fieldId: FIELD_ID,
    authority: { envelopeSha256: ENVELOPE_SHA256, payloadSha256: PAYLOAD_SHA256 },
    execution: {
      compactReplayExecuted: true,
      pariFlagOneCallExecuted: false,
      eagerExpansionExecuted: false,
      exactFieldUnitMaterializationExecuted: false,
      measurements: [],
    },
    replay,
    output: {
      classNumber: "4",
      invariantFactors: ["2", "2"],
      unitRank: "2",
      unitMaterialization: { tag: "not_given", reason: "LARGE" },
    },
  });
}

function argumentsOf(argv) {
  if (argv.length !== 4 || argv[2] !== "--owner") {
    fail("usage: compact_flag_one_row6_replay.cjs --owner OWNER.json");
  }
  return { owner: argv[3] };
}

module.exports = {
  CompactFlagOneRow6Failure,
  ENVELOPE_SHA256,
  FIELD_ID,
  PAYLOAD_SHA256,
  RECEIPT_SCHEMA,
  executeRow6CompactReplay,
  replayCompactPayload,
};

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(executeRow6CompactReplay(argumentsOf(process.argv)))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
