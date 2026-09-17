"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  authenticatePreparedBundle,
  normalizePreparedBundle,
} = require("./prepared_nf_authentication.cjs");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function scalar(value, name) {
  assert(value && value.kind === "integer", `${name} is not an exact integer`);
  assert.match(value.value, /^-?(0|[1-9][0-9]*)$/, `${name} is not canonical`);
  return BigInt(value.value);
}

function vector(value, name) {
  assert(value && Array.isArray(value.values), `${name} is not an exported vector`);
  return value.values;
}

function integerVector(value, name) {
  return vector(value, name).map((entry, index) => scalar(entry, `${name}[${index}]`));
}

function integerMatrix(value, name) {
  const columns = vector(value, name);
  return columns.flatMap((column, index) => integerVector(column, `${name}[${index}]`));
}

function rowMajor(value, dimension, name) {
  const columnMajor = integerMatrix(value, name);
  assert.equal(columnMajor.length, dimension * dimension, `${name} is not square`);
  return Array.from({ length: columnMajor.length }, (_, index) => {
    const row = Math.floor(index / dimension);
    const column = index % dimension;
    return columnMajor[dimension * column + row];
  });
}

function uniqueEvent(bundle, name) {
  const events = bundle.events.filter(event => event.event === name);
  assert.equal(events.length, 1, `expected one ${name} event`);
  return events[0];
}

function loadAuthenticatedRow1(payloadPath, manifestPath) {
  const bytes = fs.readFileSync(payloadPath);
  const bundle = JSON.parse(bytes);
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const record = manifest.records.find(entry => entry.panelIndex === 1);
  assert(record, "row 1 is absent from the frozen development manifest");
  assert.equal(path.basename(payloadPath), record.filename);
  assert.equal(bytes.length, record.bytes);
  assert.equal(sha256(bytes), record.sha256, "row-1 payload digest mismatch");
  assert.equal(sha256(JSON.stringify(bundle.prepared)), record.preparedSha256);
  assert.equal(sha256(JSON.stringify(bundle.events)), record.eventsSha256);
  assert.equal(sha256(JSON.stringify(bundle.events.at(-1))), record.terminalResultSha256);
  assert.equal(bundle.events.length, record.eventCount);
  assert.equal(bundle.field.id, record.id);
  assert.equal(bundle.field.panelIndex, 1);
  assert.equal(bundle.field.stratum, "real-cubic");
  const authority = authenticatePreparedBundle(bundle);
  const prepared = normalizePreparedBundle(bundle);

  const hnf = uniqueEvent(bundle, "hnf");
  const input = uniqueEvent(bundle, "class_group_input");
  const output = uniqueEvent(bundle, "class_group_output");
  const result = uniqueEvent(bundle, "result");
  assert.deepEqual(input.W, hnf.exactW, "class-group W left the retained HNF");
  assert.deepEqual(input.relationRecords, hnf.relationRecords,
    "class-group relation records left the retained HNF event");
  const relationHnf = integerMatrix(input.W, "class_group_input.W");
  assert.equal(relationHnf.length, 1, "row-1 retained presentation is not 1 by 1");

  const descriptors = vector(input.Vbase, "class_group_input.Vbase");
  const descriptor = vector(descriptors[0], "class_group_input.Vbase[0]");
  assert.equal(descriptor.length, 5);
  const prime = scalar(descriptor[0], "Vbase prime");
  const generator = integerVector(descriptor[1], "Vbase generator");
  const residueDegree = scalar(descriptor[3], "Vbase residue degree");
  const expectedClg1 = vector(output.clg1, "class_group_output.clg1");
  const expectedGenerators = vector(expectedClg1[2], "class_group_output generators");
  assert.equal(expectedGenerators.length, 1);
  const expectedClg2 = vector(output.clg2, "class_group_output.clg2");

  return {
    authority,
    prepared,
    oracle: bundle.oracle,
    relationHnf,
    descriptor: { prime, generator, residueDegree, inert: residueDegree === 3n ? 1n : 0n },
    expected: {
      classNumber: scalar(expectedClg1[0], "clg1 class number"),
      invariants: integerVector(expectedClg1[1], "clg1 invariants"),
      generatorIdeal: rowMajor(expectedGenerators[0], 3, "clg1 generator ideal"),
      ur: integerMatrix(expectedClg2[0], "clg2 Ur"),
      m1: integerMatrix(expectedClg2[4], "clg2 M1"),
      m2: integerMatrix(expectedClg2[5], "clg2 M2"),
      resultClassNumber: BigInt(result.classNumber),
      resultInvariants: result.invariants.map(BigInt),
    },
    hashes: {
      payload: record.sha256,
      events: record.eventsSha256,
      terminalResult: record.terminalResultSha256,
    },
    relationCount: hnf.relations,
  };
}

module.exports = { loadAuthenticatedRow1 };
