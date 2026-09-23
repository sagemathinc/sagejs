"use strict";

// Derive the correctness-only C1=5,C2=31 honesty factor-base owner from the
// same-run row-21 prepared factor-base owner.  This is a projection of live
// Sage-computed descriptors, never a frozen PARI trace.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const SCHEMA = "sagejs.pari-class-group/row21-honesty-factor-owner-v1";
const DEFAULT_SCHEMA = "sagejs.pari-class-group/row21-prepared-factor-base-v1";
const PREPARED_SHA256 =
  "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f";
const STRUCTURAL_FIXTURE_SHA256 =
  "f90ff02e7c0f8e08282d13e3d73193d6a2751420988d502482ce294f7562f35c";
const SOURCE_PROBES = [
  [4, 11, 1, "260c1da686ed66c2b1e60def2acb45b14f9737cdd74ea05d5cac7d39e534e4a1"],
  [4, 11, 2, "a42932f8d27c94250679d27cf52bb7e128b05ae0a21206fd7054c33ab67ad562"],
  [4, 11, 3, "6811538c930de4455c4e58647ba28625158b85cf508a8f2de98207c4a10b414b"],
  [5, 13, 1, "6617abc25ab7b93797bbb4b8e204887cc8d1f4196c47b91ff3760b8b0f7545a0"],
  [9, 29, 1, "02b933008654ebb0baf6ee57c9216ad9908049fcb9dc715d3c5eede3763204cf"],
  [9, 29, 2, "779c8886bcc2acfff0d1ef76a25562ad2692e4903b62410af1bb7db42092862a"],
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map(key =>
      [key, canonical(value[key])]));
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function derive(defaultResult) {
  assert(defaultResult && typeof defaultResult === "object");
  assert.equal(typeof defaultResult.ownerSha256, "string");
  const source = defaultResult.owner;
  assert.equal(source.schema, DEFAULT_SCHEMA);
  assert.equal(source.authority.preparedSha256, PREPARED_SHA256);
  assert.deepEqual(source.field.polynomial,
    ["36", "930", "-305", "-90", "0", "1"]);

  const descriptors = source.factorBase.descriptors;
  const ideals = source.factorBase.ideals;
  const norms = source.factorBase.norms;
  assert.equal(descriptors.length, ideals.length);
  assert.equal(descriptors.length, norms.length);

  const groups = [];
  let cursor = 0;
  for (const rawPrime of source.factorBase.rationalPrimes) {
    const prime = Number(rawPrime), start = cursor;
    while (cursor < descriptors.length && Number(descriptors[cursor][0]) === prime)
      cursor += 1;
    groups.push({ prime, start, count: cursor - start });
  }
  assert.equal(cursor, descriptors.length);

  const eligible = (group, bound) => {
    for (let i = group.start; i < group.start + group.count; i += 1)
      if (BigInt(norms[i]) <= BigInt(bound)) return true;
    return false;
  };
  const initialGroups = groups.filter(group => eligible(group, 5));
  const checkingGroups = groups.filter(group => eligible(group, 31));
  assert.deepEqual(initialGroups.map(group => group.prime), [2, 3, 5]);
  assert.deepEqual(checkingGroups.map(group => group.prime),
    [2, 3, 5, 11, 13, 17, 19, 23, 29, 31]);

  const initialIndices = initialGroups.flatMap(group =>
    Array.from({ length: group.count }, (_, i) => group.start + i));
  assert.equal(initialIndices.length, 6);
  const initialDescriptors = initialIndices.map(index => descriptors[index]);
  const outerSchedule = [];
  const expectedProbeCounts = new Map();
  for (let iz = initialGroups.length; iz < checkingGroups.length; iz += 1) {
    const group = checkingGroups[iz];
    const rawJ = group.count + 1;
    const lastRamification = Number(
      descriptors[group.start + group.count - 1][1]);
    const effectiveJ = lastRamification === 1 ? rawJ - 1 : rawJ;
    outerSchedule.push([iz + 1, group.prime, rawJ, lastRamification, effectiveJ]);
    expectedProbeCounts.set(group.prime, effectiveJ - 1);
  }
  assert.deepEqual(outerSchedule, [
    [4, 11, 4, 2, 4], [5, 13, 3, 1, 2], [6, 17, 2, 1, 1],
    [7, 19, 2, 1, 1], [8, 23, 2, 1, 1], [9, 29, 4, 1, 3],
    [10, 31, 2, 1, 1],
  ]);
  const probeSchedule = [], probeNorms = [], probeIdeals = [];
  for (const [iz, prime, slot, idealSha256] of SOURCE_PROBES) {
    const group = checkingGroups[iz - 1];
    assert.equal(group.prime, prime);
    const matches = Array.from({ length: group.count }, (_, j) => group.start + j)
      .filter(index => sha256(canonicalBytes(ideals[index])) === idealSha256);
    assert.equal(matches.length, 1,
      "source-order honesty ideal is not a unique same-run owner");
    const index = matches[0];
    probeSchedule.push([iz, prime, slot]);
    probeNorms.push(norms[index]);
    probeIdeals.push(ideals[index]);
  }
  for (const [prime, count] of expectedProbeCounts) assert.equal(
    probeSchedule.filter(row => row[1] === prime).length, count,
    "source-order honesty probe count changed");
  assert.deepEqual(probeNorms, ["11", "11", "11", "13", "29", "29"]);

  const owner = {
    schema: SCHEMA,
    authority: {
      preparedSha256: PREPARED_SHA256,
      sameRunDefaultFactorOwnerSha256: defaultResult.ownerSha256,
      derivation: "live-descriptor-norm-projection",
    },
    field: structuredClone(source.field),
    bounds: {
      C1: "5", C2: "31", KC: "6", KCZ: "3", KCZ2: "10",
      prodZ: "30", nonidentityAutomorphisms: "0",
    },
    initialFactorBase: {
      rationalPrimes: initialGroups.map(group => String(group.prime)),
      descriptors: initialDescriptors,
      ideals: initialIndices.map(index => ideals[index]),
      norms: initialIndices.map(index => norms[index]),
    },
    checkingFactorBase: {
      rationalPrimes: checkingGroups.map(group => String(group.prime)),
      outerSchedule: outerSchedule.map(row => row.map(String)),
      probeSchedule: probeSchedule.map(row => row.map(String)),
      probeNorms,
      probeIdeals,
    },
    provenance: {
      frozenAnswerInputs: false,
      pariStatusRuntimeInput: false,
      policy: "correctness-only-custom-bounds",
      sourceOrderAuthority: "structural-ideals-only",
      structuralFixtureSha256: STRUCTURAL_FIXTURE_SHA256,
    },
  };
  return { owner, ownerSha256: sha256(canonicalBytes(owner)) };
}

module.exports = { PREPARED_SHA256, SCHEMA, STRUCTURAL_FIXTURE_SHA256,
  canonicalBytes, derive, sha256 };
