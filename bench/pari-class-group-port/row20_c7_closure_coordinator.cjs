#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row20_c7_closure.py");
const SCHEMA = "sagejs.pari-class-group/row20-c7-closure-v1";
const REPLAY_SCHEMA = "sagejs.pari-class-group/row20-c7-correspondence-replay-v1";
const C6_SHA256 = "5449d3812514fa9aad06364e6b5ba0c18d10ee66225d0baa4fc5ea7d39f7ea1d";
const W0_SHA256 = "6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468";
const FIELD_ID = "5.1.1000000.1";
const PARI_SOURCE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

class Row20C7Failure extends Error {}
function fail(message) { throw new Row20C7Failure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }

function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(values, key)) fail(`duplicate --${key}`);
    values[key] = argv[index + 1];
  }
  const operation = values.operation;
  const common = ["operation", "c6-owner", "c6-sha256", "pristine-w0", "pristine-sha256"];
  const required = operation === "compose" ? [...common, "output-dir"] :
    operation === "replay" ? [...common, "envelope", "envelope-sha256"] : [];
  if (!required.length || Object.keys(values).sort().join("\0") !== required.sort().join("\0"))
    fail("invalid operation arguments");
  return values;
}

function strictParse(bytes, label) {
  const script = String.raw`import json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate key: '+key)
  out[key]=value
 return out
value=json.load(sys.stdin,object_pairs_hook=strict)
if not isinstance(value,dict): raise ValueError('not an object')
json.dump(value,sys.stdout,separators=(',',':'))`;
  const run = spawnSync("python3", ["-c", script], { cwd: ROOT, input: bytes,
    encoding: "utf8", timeout: 30_000, maxBuffer: 128 * 1024 * 1024 });
  if (run.status !== 0) fail(`${label} is not strict JSON`);
  return JSON.parse(run.stdout);
}

function authenticate(selected, expected, label, immutable) {
  if (!DIGEST.test(expected)) fail(`${label} digest is invalid`);
  const info = fs.statSync(selected);
  if (!info.isFile() || (immutable && (info.mode & 0o777) !== 0o444))
    fail(`${label} is not ${immutable ? "immutable mode-0444" : "a file"}`);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== expected) fail(`${label} digest changed`);
  return { path: path.resolve(selected), sha256: expected, value: strictParse(bytes, label) };
}

function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} shape changed`);
  return value.map((entry, index) => {
    if ((typeof entry !== "string" && typeof entry !== "number") || !INTEGER.test(String(entry)) ||
        (typeof entry === "number" && (!Number.isSafeInteger(entry) || String(entry) !== String(Number(entry)))))
      fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
}

function verifyEvidence(value, ancestry = undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schema !== SCHEMA ||
      value.status !== "closed" || value.field?.id !== FIELD_ID || value.field?.degree !== 5 ||
      value.field?.signature?.join(",") !== "1,2") fail("closure identity changed");
  if (ancestry && JSON.stringify(value.ancestry) !== JSON.stringify(ancestry)) fail("closure ancestry changed");
  if (!Object.values(value.ancestry || {}).every(entry => typeof entry === "string" && DIGEST.test(entry)))
    fail("closure ancestry digest changed");
  if (JSON.stringify(value.dimensions) !== JSON.stringify({ factorBaseSize: 7, relationCount: 14, kernelRank: 7, degree: 5 }))
    fail("closure dimensions changed");
  const closure = value.relationClosure || {};
  const transform = integers(closure.rawToKernel, 98, "raw-to-kernel transform");
  const rightInverse = integers(closure.rightInverse, 98, "right inverse");
  const presentation = integers(closure.presentation, 49, "presentation");
  if (closure.rawToKernelShape?.join(",") !== "14,7" || closure.rightInverseShape?.join(",") !== "14,7" ||
      closure.presentationShape?.join(",") !== "7,7" || closure.rawToKernelSha256 !== arraySha(transform) ||
      closure.rightInverseSha256 !== arraySha(rightInverse)) fail("closure transform changed");
  const identity = Array.from({ length: 49 }, (_, index) => String(index % 8 === 0 ? 1 : 0));
  if (JSON.stringify(presentation) !== JSON.stringify(identity)) fail("class presentation is not identity");
  const exact = value.exactRelations || {};
  integers(exact.relationRecords, 98, "relation records");
  integers(exact.principalGenerators, 70, "principal generators");
  integers(exact.factorBaseDescriptors, 63, "factor descriptors");
  integers(exact.factorBaseIdeals, 175, "factor ideals");
  integers(exact.factorBaseNorms, 7, "factor norms");
  integers(exact.relationNorms, 14, "relation norms");
  if (!Array.isArray(exact.factorbackMembershipCounts) || exact.factorbackMembershipCounts.length !== 14 ||
      exact.factorbackMembershipCounts.some(entry => !Number.isSafeInteger(entry) || entry < 1))
    fail("factorback membership receipts changed");
  const units = value.units || {};
  integers(units.compactTransform, 14, "compact unit transform");
  integers(units.materializedRawTransform, 28, "materialized raw transform");
  integers(units.coordinates, 10, "unit coordinates");
  const norms = integers(units.norms, 2, "unit norms");
  if (norms.some(entry => entry !== "-1" && entry !== "1")) fail("unit norms changed");
  integers(units.inverses, 10, "unit inverses");
  integers(value.regulator, 3, "regulator");
  if (value.torsion?.order !== "2" || value.torsion?.generator?.join(",") !== "-1,0,0,0,0")
    fail("torsion changed");
  const proof = value.proof || {};
  for (const name of ["rawLogsToCompactExact", "relationTimesKernelZero", "relationTimesRightInverseIdentity",
    "presentationIdentity", "all14PrincipalIdealsExact", "all14PrincipalNormsExact", "unitRawAncestryExact",
    "unitNormsAndInversesExact"]) if (proof[name] !== true) fail(`${name} is not proved`);
  if (proof.classNumber !== "1" || !Array.isArray(proof.invariants) || proof.invariants.length ||
      JSON.stringify(proof.hnfState) !== JSON.stringify([0, 7, 7, 0, 7, 4, 0, 14, 0]) ||
      !DIGEST.test(proof.rawLogsSha256) || !DIGEST.test(proof.compactLogsSha256)) fail("presentation proof changed");
  if (JSON.stringify(value.assumptions) !== JSON.stringify({ pari2174Correspondence: true,
    factorBaseSelection: true, grhAndRelationBounds: true, publicCompletion: false }) ||
      value.provenance?.referenceFinalClassImported !== false ||
      value.provenance?.referenceFundamentalUnitsImported !== false ||
      value.provenance?.c6MaterializedUnitsConsumed !== true) fail("provenance changed");
  return true;
}

function owner(name, role, entries) {
  return { capacity: String(entries.length), encoding: "canonical-decimal-integer", entries,
    logicalLength: String(entries.length), name, role };
}

function payloadFromEvidence(evidence) {
  verifyEvidence(evidence);
  const exact = evidence.exactRelations, closure = evidence.relationClosure, units = evidence.units;
  const storage = [
    owner("class-presentation", "class-presentation", closure.presentation),
    owner("compact-unit-transform", "compact-unit-transform", units.compactTransform),
    owner("exact-unit-coordinates", "exact-unit-coordinates", units.coordinates),
    owner("exact-unit-inverses", "exact-unit-inverses", units.inverses),
    owner("exact-unit-norms", "exact-unit-norms", units.norms),
    owner("exact-unit-raw-transform", "exact-unit-raw-transform", units.materializedRawTransform),
    owner("factor-base-descriptors", "factor-base-descriptors", exact.factorBaseDescriptors),
    owner("factor-base-ideals", "factor-base-ideals", exact.factorBaseIdeals),
    owner("factor-base-norms", "factor-base-norms", exact.factorBaseNorms),
    owner("honesty-evidence", "honesty-evidence", ["14", "7", "7", "1"]),
    owner("principal-generators", "principal-relation-generators", exact.principalGenerators),
    owner("raw-relation-records", "raw-relation-records", exact.relationRecords),
    owner("raw-to-kernel", "raw-to-kernel", closure.rawToKernel),
    owner("regulator-enclosure", "regulator-enclosure", evidence.regulator),
    owner("relation-norms", "relation-norms", exact.relationNorms),
    owner("relation-right-inverse", "relation-right-inverse", closure.rightInverse),
    owner("torsion-generator", "torsion-generator", evidence.torsion.generator),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: { classNumber: "1", generatorCount: "0", invariantFactors: [], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: ["-12", "-5", "0", "0", "0", "1"], degree: "5", id: FIELD_ID },
    honesty: { evidenceOwner: "honesty-evidence", outcome: "not-required", sourcePolicy: "PARI-2.17.4-buchall-row20-equal-bound" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [
      { disposition: "assumed", id: "factor-base-generation", statement: "PARI's factor-base generation and selection are assumed correct" },
      { disposition: "assumed", id: "grh-and-bounds", statement: "GRH and PARI's class-group relation bounds are assumed correct" },
      { disposition: "assumed", id: "pari-correspondence", statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
    ], correspondence: "upstream-assumed-pari-correspondence", pariSourceSha256: PARI_SOURCE_SHA256,
      pariVersion: "2.17.4", replaySchema: REPLAY_SCHEMA },
    storage,
    terminal: { correspondence_complete: true, public_complete: false, status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { coordinatesOwner: "exact-unit-coordinates", normsOwner: "exact-unit-norms", tag: "exact_units" },
      rank: "2", regulatorOwner: "regulator-enclosure", torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}

function runEvidence(c6, w0, ancestry) {
  const script = String.raw`import hashlib,importlib,json,resource,sys
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
sys.path.extend(['src/lib','src/baselib'])
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate key: '+key)
  out[key]=value
 return out
def load(path,expected):
 data=open(path,'rb').read()
 if hashlib.sha256(data).hexdigest()!=expected: raise ValueError('input changed after authentication')
 return json.loads(data,object_pairs_hook=strict)
m=importlib.import_module('bench.pari-class-group-port.row20_c7_closure')
ancestry=json.load(sys.stdin,object_pairs_hook=strict)
json.dump(m.compose_authenticated_row20_c7(load(sys.argv[1],sys.argv[3]),load(sys.argv[2],sys.argv[4]),ancestry),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", script, c6.path, w0.path, c6.sha256, w0.sha256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000, maxBuffer: 128 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const evidence = strictParse(Buffer.from(run.stdout), "C7 closure evidence");
  verifyEvidence(evidence, ancestry);
  return evidence;
}

function publish(raw, directory) {
  const digest = sha(raw);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row20-c7-class-unit-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing C7 owner changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, raw, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { bytes: raw.length, path: destination, sha256: digest };
}

function authenticatedInputs(options) {
  if (options["c6-sha256"] !== C6_SHA256 || options["pristine-sha256"] !== W0_SHA256)
    fail("wrong predeclared input digest");
  const c6 = authenticate(options["c6-owner"], C6_SHA256, "C6 owner", true);
  const w0 = authenticate(options["pristine-w0"], W0_SHA256, "pristine W0", false);
  const ancestry = { c6OwnerSha256: c6.sha256, pristineW0Sha256: w0.sha256, sourceSha256: sha(fs.readFileSync(SOURCE)) };
  return { c6, w0, ancestry };
}

function main() {
  const options = argumentsOf(process.argv);
  const { c6, w0, ancestry } = authenticatedInputs(options);
  const evidence = runEvidence(c6, w0, ancestry);
  const payload = payloadFromEvidence(evidence);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical(ancestry);
  if (options.operation === "compose") {
    process.stdout.write(`${JSON.stringify({ schema: REPLAY_SCHEMA, correspondenceComplete: true,
      publicComplete: false, mathematicalAuthoritySha256, owner: publish(raw, options["output-dir"]) })}\n`);
    return;
  }
  const envelope = authenticate(options.envelope, options["envelope-sha256"], "C7 envelope", true);
  if (!raw.equals(fs.readFileSync(envelope.path))) fail("C7 envelope differs from cold replay");
  process.stdout.write(`${JSON.stringify({ correspondence_complete: true, fieldId: FIELD_ID,
    mathematicalAuthoritySha256, payloadSha256: neutral.sha256Canonical(payload), public_complete: false,
    schema: REPLAY_SCHEMA })}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { C6_SHA256, FIELD_ID, REPLAY_SCHEMA, SCHEMA, W0_SHA256, Row20C7Failure,
  arraySha, payloadFromEvidence, verifyEvidence };
