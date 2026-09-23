#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const neutral = require("./class_unit_correspondence_result.cjs");
const row16Presentation = require("./row16_mixed_cubic_owner_coordinator.cjs");
const row18Presentation = require("./row18_mixed_cubic_retry_coordinator.cjs");
const row16Class = require("./row16_mixed_cubic_class_witness_coordinator.cjs");
const row18Class = require("./row18_mixed_cubic_class_witness_coordinator.cjs");
const rank1Unit = require("./mixed_cubic_rank1_unit_coordinator.cjs");

const PARI_SOURCE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const REPLAY_SCHEMA = "sagejs.pari-class-group/mixed-cubic-c7-replay-v1";
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;
class MixedCubicC7Failure extends Error {}
function fail(message) { throw new MixedCubicC7Failure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function integers(values, length, label) {
  if (!Array.isArray(values) || values.length !== length) fail(`${label} has the wrong length`);
  return values.map((entry, index) => {
    if (typeof entry !== "string" || !INTEGER.test(entry)) fail(`${label}[${index}] is not canonical`);
    return entry;
  });
}
function storage(name, role, entries) {
  const values = integers(entries, entries.length, `${name} entries`);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role };
}
function loadOwner(filename, digest, label) {
  if (!SHA256.test(digest)) fail(`${label} digest is invalid`);
  const selected = path.resolve(filename);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== digest || (fs.statSync(selected).mode & 0o777) !== 0o444)
    fail(`${label} digest or mode changed`);
  return JSON.parse(bytes);
}
function composePayload(presentation, classWitness, unit) {
  const row = presentation.field?.panelIndex;
  if (row === 16) {
    row16Presentation.verifyOwner(presentation, presentation.ancestry);
    row16Class.verifyWitness(classWitness, classWitness.ancestry);
  } else if (row === 18) {
    row18Presentation.verifyOwner(presentation, presentation.ancestry);
    row18Class.verifyOwner(classWitness, classWitness.ancestry);
  } else fail("unsupported mixed-cubic row");
  rank1Unit.verifyOwner(unit, unit.ancestry);
  if (unit.fieldId !== presentation.field.id || unit.outcome?.fundamentalUnitDerived !== true ||
      unit.outcome?.usedFrozenFundamentalUnit !== false) fail("unit owner is detached from presentation");
  const invariants = presentation.presentation.invariants;
  const classNumber = presentation.presentation.classNumber;
  const generatorIdeals = row === 16
    ? classWitness.witnesses.flatMap(witness => witness.descriptor.idealHnf)
    : classWitness.generator.idealHnf;
  const orderWitnesses = row === 16
    ? classWitness.witnesses.flatMap(witness => [
        ...witness.orderRelation.rawRelationCoefficients,
        ...witness.orderRelation.principalGenerator,
        ...witness.exactIdealReplay.powerHnf,
      ])
    : [
        ...classWitness.orderRelation.rawRelationCoefficients,
        ...classWitness.orderRelation.principalGenerator,
        ...classWitness.exactIdealReplay.powerHnf,
      ];
  const stores = [
    storage("class-generator-ideals", "class-generator-ideal", generatorIdeals),
    storage("class-generator-order-witnesses", "exact-order-principal-witness", orderWitnesses),
    storage("exact-unit-coordinates", "exact-unit-coordinates", unit.factorback.exactUnit),
    storage("exact-unit-norms", "exact-unit-norms", [unit.factorback.unitNorm]),
    storage("factor-base-presentation", "class-presentation", presentation.presentation.matrix),
    storage("raw-unit-provenance", "exact-unit-raw-provenance", unit.factorback.rawRelationCoefficients),
    storage("regulator-enclosure", "regulator-enclosure", presentation.presentation.packedRegulator),
    storage("torsion-generator", "torsion-generator", ["-1", "0", "0"]),
    storage("unit-transform", "exact-unit-kernel-transform", unit.cleanarch.bezoutTransform),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const payload = {
    classGroup: { classNumber, generatorCount: String(invariants.length),
      invariantFactors: [...invariants], presentationOwner: "factor-base-presentation" },
    field: { definingPolynomialAscending: [...presentation.field.polynomial], degree: "3",
      id: presentation.field.id },
    honesty: { evidenceOwner: null, outcome: "not-required",
      sourcePolicy: "retained-W0-honesty-complete-extra-not-required" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        { disposition: "assumed", id: "factor-base-bounds",
          statement: "PARI's factor-base generation and relation bounds are assumed correct" },
        { disposition: "assumed", id: "pari-correspondence",
          statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
      ],
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: PARI_SOURCE_SHA256,
      pariVersion: "2.17.4",
      replaySchema: REPLAY_SCHEMA,
    },
    storage: stores,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: {
      materialization: { coordinatesOwner: "exact-unit-coordinates",
        normsOwner: "exact-unit-norms", tag: "exact_units" },
      rank: "1", regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator", torsionOrder: "2",
    },
  };
  neutral.validatePayload(payload);
  return payload;
}
function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  const required = ["class-owner", "class-sha256", "output-dir", "presentation-owner",
    "presentation-sha256", "unit-owner", "unit-sha256"];
  if (Object.keys(values).sort().join() !== required.sort().join()) fail("required C7 owner arguments are missing");
  return values;
}
function main() {
  const options = argumentsOf(process.argv);
  const presentation = loadOwner(options["presentation-owner"], options["presentation-sha256"], "presentation");
  const classWitness = loadOwner(options["class-owner"], options["class-sha256"], "class witness");
  const unit = loadOwner(options["unit-owner"], options["unit-sha256"], "unit");
  const payload = composePayload(presentation, classWitness, unit);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const envelopeSha256 = sha(raw);
  const mathematicalAuthoritySha256 = sha(Buffer.from([
    options["presentation-sha256"], options["class-sha256"], options["unit-sha256"],
  ].join("\n")));
  const payloadSha256 = neutral.sha256Canonical(payload);
  const authority = neutral.createDetachedClassUnitAuthority({ envelopeSha256,
    mathematicalAuthoritySha256, replaySchema: REPLAY_SCHEMA,
    replay(candidate) {
      if (neutral.sha256Canonical(candidate) !== payloadSha256) fail("C7 replay payload changed");
      return { correspondence_complete: true, fieldId: payload.field.id,
        mathematicalAuthoritySha256, payloadSha256, public_complete: false,
        schema: REPLAY_SCHEMA };
    } });
  const result = new neutral.ClassUnitCorrespondencePublisher().publish(raw, authority);
  const directory = path.resolve(options["output-dir"]); fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory,
    `row${presentation.field.panelIndex}-mixed-cubic-c7-${result.sha256}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== result.sha256)
      fail("existing immutable C7 envelope changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try { fs.writeFileSync(temporary, result.canonicalJSON(), { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444); }
    catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  process.stdout.write(`${JSON.stringify({ schema: neutral.ENVELOPE_SCHEMA,
    fieldId: payload.field.id, row: presentation.field.panelIndex, path: destination,
    sha256: result.sha256, bytes: raw.length, payloadSha256, mathematicalAuthoritySha256,
    correspondenceComplete: true, publicComplete: false })}\n`);
}
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { MixedCubicC7Failure, REPLAY_SCHEMA, composePayload };
