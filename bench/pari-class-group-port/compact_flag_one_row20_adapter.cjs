#!/usr/bin/env node
"use strict";

// Untimed admission adapter only. It reads already-computed authorities and
// must never run C6, C7, bnfinit, calibration, or a timing loop.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const neutral = require("./class_unit_correspondence_result.cjs");
const c6Authority = require("./row20_successful_c6_coordinator.cjs");

const HERE = __dirname;
const MANIFEST_PATH = path.join(HERE, "compact-flag-one-manifest.json");
const COMMON_SCHEMA = "sagejs.pari-class-group/compact-flag-one-common-output-v1";
const RECEIPT_SCHEMA = "sagejs.pari-class-group/compact-flag-one-row20-authority-v2";
const FIELD_ID = "5.1.1000000.1";
const C6_SHA256 = "5449d3812514fa9aad06364e6b5ba0c18d10ee66225d0baa4fc5ea7d39f7ea1d";
const C7_SHA256 = "3d0b7e2fdb43e70a9f6e6be4c50c50ca6d5e4414e05812b58f6ce049b3496052";
const C7_PAYLOAD_SHA256 = "7e10bce72a5b41f036dcc7834131a4b095e541889055a3586f431d53fa23dd98";
const PARI_AUTHORITY_SHA256 = "772caa06af410de7ec071ca879765a859238e0c74263c50b4c8dbc374d8777dc";
const PARI_SOURCE_SHA256 = "b4f52dfc8be212b0b069f48214a869255bff4d8e07252c8f6f52f7de30617a33";
const PARI_ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const PARI_BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const PARI_LIBRARY_SHA256 = "fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f";

class CompactFlagOneSeedFailure extends Error {}
function fail(message) { throw new CompactFlagOneSeedFailure(message); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function canonicalBytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function canonicalDigest(value) { return sha256(canonicalBytes(value)); }
function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join("\0") !== [...expected].sort().join("\0"))
    fail(`${label} has unexpected fields`);
}
function readJson(filename, label) {
  try { return JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch (error) { throw new CompactFlagOneSeedFailure(`${label} is not JSON`, { cause: error }); }
}

function validateManifest(manifestPath = MANIFEST_PATH) {
  const manifest = readJson(manifestPath, "compact manifest");
  if (manifest.schema !== "sagejs.pari-class-group/compact-flag-one-manifest-v1" ||
      manifest.targetPariVersion !== "2.17.4") fail("compact manifest identity changed");
  assert.deepEqual(manifest.execution, { enabled: false, timingEnabled: false,
    finalRunEnabled: false, reserveOpeningEnabled: false });
  const expectedPins = {
    panel: ["panel.json", "7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5"],
    qualificationManifest: ["class-unit-qualification-manifest.json", "3821a5a51390ca25b3110e7a8058d73cd9945d0ab6ad254c07186e0ac19c1c50"],
    qualificationRunner: ["run_class_unit_qualification.cjs", "ee2aa15e99cde50e4217a6ebe7e38fc94133c0f48fa9ac64112494feec99fb0a"],
    receiptSchema: ["class-unit-qualification-receipt.schema.json", "afb0c69d742b7e2ec5f308e3fabe855980a4fa0d4e5b41eb8e5911296c579bb8"],
  };
  for (const [name, [relative, digest]] of Object.entries(expectedPins)) {
    const pin = manifest.sourcePins?.[name];
    if (pin?.path !== relative || pin?.sha256 !== digest) fail(`${name} pin changed`);
    if (sha256(fs.readFileSync(path.join(HERE, relative))) !== digest) fail(`${name} source changed`);
  }
  const panel = readJson(path.join(HERE, expectedPins.panel[0]), "panel");
  const qualification = readJson(path.join(HERE, expectedPins.qualificationManifest[0]),
    "qualification manifest");
  const derived = qualification.fields.filter(field => field.role === "additional-development");
  if (derived.length !== 12 || manifest.fields?.length !== 12) fail("compact population is not 12 rows");
  assert.deepEqual(manifest.derivation.panelIndices, derived.map(field => field.panelIndex));
  for (const [index, field] of manifest.fields.entries()) {
    const qualified = derived[index];
    const row = panel.rows[field.panelIndex];
    assert.deepEqual(field, { panelIndex: qualified.panelIndex, id: row.id, stratum: row.stratum,
      degree: row.degree, signature: row.signature, polynomialSha256: row.polynomial_sha256 });
    assert.equal(qualified.id, row.id);
    assert.notEqual(qualified.role, "final-reserve");
  }
  if (manifest.commonOutput?.schema !== COMMON_SCHEMA ||
      manifest.commonOutput?.encoding !== "canonical-key-sorted-json-sha256")
    fail("common output contract changed");
  return manifest;
}

function authenticateFile(filename, expected, label, immutable = false) {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || (immutable && (stat.mode & 0o777) !== 0o444))
    fail(`${label} is not ${immutable ? "immutable mode-0444" : "a file"}`);
  const raw = fs.readFileSync(filename);
  if (sha256(raw) !== expected) fail(`${label} digest changed`);
  return { raw, value: readJson(filename, label) };
}

function validateC7(raw, envelope) {
  if (!neutral.canonical(envelope).equals(raw)) fail("C7 envelope is not canonical JSON");
  exactKeys(envelope, ["payload", "payloadSha256", "schema"], "C7 envelope");
  if (envelope.schema !== neutral.ENVELOPE_SCHEMA || envelope.payloadSha256 !== C7_PAYLOAD_SHA256 ||
      neutral.sha256Canonical(envelope.payload) !== C7_PAYLOAD_SHA256) fail("C7 payload digest changed");
  neutral.validatePayload(envelope.payload);
  return envelope.payload;
}

function validatePristinePariAuthority(filename, manifest) {
  const authenticated = authenticateFile(filename, PARI_AUTHORITY_SHA256,
    "pristine PARI row20 authority");
  const authority = authenticated.value;
  if (!Buffer.concat([canonicalBytes(authority), Buffer.from("\n")]).equals(authenticated.raw))
    fail("pristine PARI authority is not canonical JSON");
  exactKeys(authority, ["diagnosticOnly", "execution", "provenance", "qualifiedTiming", "run",
    "schema"], "pristine PARI authority");
  if (authority.schema !== "sagejs.pari-class-group/pristine-row20-flag-one-authority-v1" ||
      authority.diagnosticOnly !== true || authority.qualifiedTiming !== false)
    fail("pristine PARI authority mode changed");
  assert.deepEqual(authority.execution, { addressSpaceLimitBytes: "4294967296", calls: 1,
    coldProcess: true, cpuLimitSeconds: "600", wallTimeoutSeconds: "600" });
  exactKeys(authority.provenance, ["archiveSha256", "buch2Sha256", "compiler",
    "compilerArguments", "executableSha256", "librarySha256", "producerSourceSha256"],
  "pristine PARI provenance");
  if (authority.provenance.archiveSha256 !== PARI_ARCHIVE_SHA256 ||
      authority.provenance.buch2Sha256 !== PARI_BUCH2_SHA256 ||
      authority.provenance.librarySha256 !== PARI_LIBRARY_SHA256 ||
      authority.provenance.producerSourceSha256 !== PARI_SOURCE_SHA256 ||
      sha256(fs.readFileSync(path.join(HERE, "pari_compact_flag_one_row20_authority.c"))) !==
        PARI_SOURCE_SHA256 ||
      !/^[0-9a-f]{64}$/.test(authority.provenance.executableSha256))
    fail("pristine PARI provenance changed");
  const run = authority.run;
  exactKeys(run, ["call", "output", "rng", "schema", "work"], "pristine PARI run");
  if (run.schema !== "sagejs.pari-class-group/pristine-row20-flag-one-run-v1")
    fail("pristine PARI run schema changed");
  assert.deepEqual(run.call, { boundary: "bnfinit0(prepared_nf,1,NULL,nbits2prec(192))",
    pariVersion: ["2", "17", "4"], precisionBits: "192",
    preparation: "nfinit0(polynomial,0,nbits2prec(192))", timed: false });
  assert.deepEqual(run.work, { degree: "5", expandedUnitCount: "2", factorBaseSize: "7",
    logEmbeddingColumns: "2", logEmbeddingRows: "3", retainedClassRows: "0",
    schema: "sagejs.pari-class-group/pristine-row20-flag-one-work-v1" });
  exactKeys(run.rng, ["algorithm", "seed", "terminalState"], "pristine PARI RNG");
  if (run.rng.algorithm !== "pari-xorshift1024star-2.17.4" || run.rng.seed !== "1" ||
      !Array.isArray(run.rng.terminalState) || run.rng.terminalState.length !== 66 ||
      !run.rng.terminalState.every(word => /^(0|[1-9][0-9]*)$/.test(word)))
    fail("pristine PARI RNG changed");
  const outputDigest = canonicalDigest(run.output);
  if (outputDigest !== manifest.commonOutput.row20Sha256)
    fail("pristine PARI common output digest changed");
  return { authority, outputDigest };
}

function commonOutput(payload) {
  return {
    schema: COMMON_SCHEMA,
    field: { id: payload.field.id, definingPolynomialAscending: payload.field.definingPolynomialAscending },
    classGroup: { classNumber: payload.classGroup.classNumber,
      invariantFactors: payload.classGroup.invariantFactors },
    unitGroup: { rank: payload.unitGroup.rank, torsionOrder: payload.unitGroup.torsionOrder,
      materialization: payload.unitGroup.materialization.tag },
  };
}

function prepareRow20({ manifestPath = MANIFEST_PATH, c6Owner, c7Envelope, pristineW0,
  pariAuthority }) {
  const manifest = validateManifest(manifestPath);
  const seed = manifest.row20Seed?.sagejs;
  if (seed?.status !== "untimed-authority-adapter" || seed.c6OwnerSha256 !== C6_SHA256 ||
      seed.c7EnvelopeSha256 !== C7_SHA256 || seed.c7PayloadSha256 !== C7_PAYLOAD_SHA256 ||
      seed.pristineW0Sha256 !== c6Authority.W0_SHA256) fail("row20 seed authority changed");
  const pariSeed = manifest.row20Seed?.pari;
  if (pariSeed?.status !== "untimed-pristine-authority" ||
      pariSeed.authoritySha256 !== PARI_AUTHORITY_SHA256 ||
      pariSeed.outputSha256 !== manifest.commonOutput.row20Sha256 ||
      pariSeed.boundary !== "bnfinit0(prepared_nf,1,NULL,nbits2prec(192))")
    fail("row20 pristine PARI seed changed");
  const pariPath = pariAuthority || path.join(HERE, pariSeed.authorityPath);
  const pari = validatePristinePariAuthority(pariPath, manifest);
  const w0 = authenticateFile(pristineW0, c6Authority.W0_SHA256, "pristine W0");
  const c6 = authenticateFile(c6Owner, C6_SHA256, "C6 owner", true);
  c6Authority.verifyOwner(c6.value);
  if (c6.value.ancestry?.pristineW0Sha256 !== c6Authority.W0_SHA256)
    fail("C6 does not descend from pristine W0");
  const c7 = authenticateFile(c7Envelope, C7_SHA256, "C7 envelope", true);
  const payload = validateC7(c7.raw, c7.value);
  const row = manifest.fields.find(field => field.panelIndex === 20);
  if (!row || payload.field.id !== FIELD_ID || payload.field.degree !== String(row.degree) ||
      payload.field.definingPolynomialAscending.join(",") !== w0.value.field?.coefficients?.join(","))
    fail("row20 field identity changed");
  const owners = new Map(payload.storage.map(owner => [owner.name, owner.entries]));
  if (owners.get("exact-unit-coordinates")?.join(",") !== c6.value.exactUnitBasis.join(",") ||
      owners.get("exact-unit-norms")?.join(",") !== c6.value.exactUnitProofs.map(proof => proof.norm).join(",") ||
      payload.unitGroup.rank !== String(c6.value.field.unitRank)) fail("C6/C7 unit authority disagrees");
  const output = commonOutput(payload);
  const outputDigest = canonicalDigest(output);
  if (outputDigest !== manifest.commonOutput.row20Sha256) fail("common output digest changed");
  if (outputDigest !== pari.outputDigest) fail("Sage.js/PARI common output disagrees");
  return {
    schema: RECEIPT_SCHEMA,
    diagnosticOnly: true,
    qualifiedTiming: false,
    executionEnabled: false,
    tier: "compact-flag-one",
    implementation: "sagejs-pari-matched",
    fieldId: FIELD_ID,
    authority: { pristineW0Sha256: c6Authority.W0_SHA256,
      c6OwnerSha256: C6_SHA256, c7EnvelopeSha256: C7_SHA256,
      c7PayloadSha256: C7_PAYLOAD_SHA256,
      pristinePariAuthoritySha256: PARI_AUTHORITY_SHA256 },
    matchedImplementations: ["pari-2.17.4", "sagejs"],
    output,
    outputDigest,
    timing: { eagerExpansionExecuted: false, measurements: [] },
  };
}

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  const expected = ["c6-owner", "c7-envelope", "pristine-w0"];
  if (Object.keys(result).sort().join("\0") !== expected.sort().join("\0"))
    fail(`required arguments are ${expected.map(key => `--${key}`).join(", ")}`);
  return result;
}

function main(argv = process.argv) {
  const options = argumentsOf(argv);
  const receipt = prepareRow20({ c6Owner: options["c6-owner"],
    c7Envelope: options["c7-envelope"], pristineW0: options["pristine-w0"] });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

module.exports = { C6_SHA256, C7_PAYLOAD_SHA256, C7_SHA256, COMMON_SCHEMA, CompactFlagOneSeedFailure,
  MANIFEST_PATH, PARI_AUTHORITY_SHA256, RECEIPT_SCHEMA, canonicalBytes, canonicalDigest,
  commonOutput, prepareRow20, validateManifest, validatePristinePariAuthority };

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
