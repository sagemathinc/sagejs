#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const auth = require("./prepared_nf_authentication.cjs");
const initial = require("./row3_prepared_initial_base_frontier.cjs");
const continuation = require("./row3_prepared_relation_hnf_frontier.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-03-aae73048ee765ce3.json";
const iv = value => String(value?.kind === "integer" ? value.value : value);
const packedReal = value => value.kind === "integer"
  ? [iv(value), "-1", "0"]
  : [iv(value.mantissa), iv(value.precision), iv(value.exponent)];
const packedScalar = value => value.kind === "complex"
  ? ["2", ...packedReal(value.real), ...packedReal(value.imag)]
  : ["1", ...packedReal(value), "0", "-1", "0"];
const packedMatrix = value => value.values.flatMap(column =>
  column.values.flatMap(packedScalar));
const integerMatrix = value => value.values.flatMap(column => column.values.map(iv));

(async () => {
  const raw = JSON.parse(fs.readFileSync(W0));
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  const factor = await initial.run(prepared);
  const owner = await continuation.run(prepared, factor);
  assert(Object.isFrozen(owner));
  assert.equal(owner.provenance.frozenAnswerInputs, false);

  // Answer-bearing trace is opened only after fresh publication.
  const hnf = raw.events.find(value => value.event === "hnf");
  assert(hnf);
  const oracleRecords = hnf.relationRecords.flatMap(value => value.R.values.map(iv));
  const oracleGenerators = hnf.relationRecords.flatMap(value => {
    if (value.m.kind === "integer") return [iv(value.m), "0", "0"];
    return value.m.values.map(iv);
  });
  assert.deepEqual(owner.relations.matrix, oracleRecords);
  assert.deepEqual(owner.relations.generators, oracleGenerators);
  assert.deepEqual(owner.relations.logs, packedMatrix(hnf.exactEmbeddings));
  assert.deepEqual(owner.hnf.state, [2, 9, 666, 0, 7, 69, 0, 675, 0]);
  assert.deepEqual(owner.hnf.w, hnf.exactW.values.flatMap(column =>
    column.values.map(iv)));
  assert.deepEqual(owner.hnf.b, integerMatrix(hnf.exactB));
  assert.deepEqual(owner.hnf.c, packedMatrix(hnf.exactC));
  assert.deepEqual(owner.hnf.permutation, hnf.perm.values.map(iv));
  const acceptance = raw.events.find(value => value.event === "acceptance");
  const result = raw.events.find(value => value.event === "result");
  assert(acceptance && result);
  assert.equal(owner.acceptance.classNumber, acceptance.h);
  assert.equal(owner.acceptance.classNumber, result.classNumber);
  assert.deepEqual(owner.acceptance.invariants, result.invariants);
  assert.deepEqual(owner.acceptance.regulator, packedReal(acceptance.exactR));
  assert.deepEqual(owner.acceptance.relationLattice,
    integerMatrix(acceptance.lattice));
  assert.equal(owner.units.source.preparedNfLiveRoot, true);
  assert.equal(owner.units.source.frozenW0UsedAsInput, false);
  assert.deepEqual(owner.units.units.unitKernelTransform,
    ["3", "-2", "3", "0", "0", "0", "0",
      "-2", "1", "-2", "0", "0", "0", "0"]);
  assert.deepEqual(owner.units.units.unitNorms, ["1", "-1"]);
  assert.deepEqual(owner.units.units.unitRealSigns, [1, 1, 1, -1, -1, -1]);
  assert.equal(crypto.createHash("sha256").update(Buffer.from(
    owner.units.units.rawUnitProvenance.join("\n"))).digest("hex"),
  "2d2ec2a83277b446b128e641741c0814042d2ac9c5652c7db933856fc70386e8");
  assert.deepEqual(owner.units.regulator.packed, packedReal(acceptance.exactR));
  assert.deepEqual(owner.units.classWitness.quotient, {
    presentation: ["3", "0", "0", "2"], smithInvariants: ["6"],
    generatorOrder: "6", properDivisorsRejected: ["1", "2", "3"],
    generatorNontrivial: true });
  assert.equal(owner.units.classWitness.compactPrincipalWitness.factorCount, 443);
  assert.equal(owner.units.completion.classWitnessComplete, true);
  assert.equal(owner.publication.acceptanceComplete, true);
  assert.equal(owner.publication.compactUnitsComplete, true);
  assert.equal(owner.publication.correspondenceComplete, true);
  assert.equal(owner.correspondence.preparedNfLiveRoot, true);
  assert.equal(owner.correspondence.frozenW0UsedAsInput, false);
  const sealed = Buffer.from(owner.correspondence.sealedEnvelopeHex, "hex");
  assert.equal(owner.correspondence.sealedEnvelopeSha256,
    neutral.sha256Bytes(sealed));
  const envelope = JSON.parse(sealed.toString("ascii"));
  assert.equal(envelope.payload.classGroup.classNumber, "6");
  assert.deepEqual(envelope.payload.classGroup.invariantFactors, ["6"]);
  assert.equal(envelope.payload.terminal.correspondence_complete, true);
  assert.equal(envelope.payload.terminal.public_complete, false);
  process.stdout.write(`${JSON.stringify({ schema:
    "sagejs.pari-class-group/row3-prepared-relation-hnf-frontier-check-v1",
  relations: 675, relationCells: owner.relations.matrix.length,
  generators: owner.relations.generators.length / 3,
  hnfState: owner.hnf.state, w: owner.hnf.w,
  classNumber: owner.acceptance.classNumber,
  invariants: owner.acceptance.invariants,
  regulator: owner.acceptance.regulator,
  compactUnits: owner.units.units.unitNorms.length,
  classWitnessFactors:
    owner.units.classWitness.compactPrincipalWitness.factorCount,
  correspondenceComplete: owner.publication.correspondenceComplete,
  firstUnsupportedDependency: owner.provenance.unsupportedNextDependency,
  oracleOpenedAfterPublication: true, qualifiedTiming: false })}\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
