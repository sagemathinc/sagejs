"use strict";

// Data-only C7 join for development-panel row 6.  This is deliberately an
// internal correspondence result: it retains enough exact data to replay the
// class and compact-unit maps, but cannot authorize public publication.

const crypto = require("node:crypto");
const neutral = require("./class_unit_correspondence_result.cjs");

const COMPOSITION_SCHEMA =
  "sagejs.pari-class-group/row6-c7-result-composition-v1";
const PUBLICATION_REPLAY_SCHEMA =
  "sagejs.pari-class-group/row6-c7-publication-replay-v1";
const FIELD_ID =
  "generated-sha256-55ba15494f03f38bf8f687ff4d2813e81184d71c84dbed9e1adc6af7ba62f0eb";
const POLYNOMIAL = Object.freeze(["2000000000018", "-2000000000010", "0", "1"]);
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const GATE_CONTENT_SHA256 =
  "6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98";
const FACTOR_CONTENT_SHA256 =
  "1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef";
const ANCESTRY_SOURCE_SHA256 =
  "aafbe40446e563b9b93a2d186d24a9c0f4b9908c922c24dd64ce1c78e3500ae9";
const CLASS_OWNER_SOURCE_SHA256 =
  "c26dcda33b8a95c89d4bf8125990737238092cdef3ad5af7d816252b3a345aba";
const UNIT_OWNER_SOURCE_SHA256 =
  "5308cfc9a128a1b5d1667a21c84866f0c91c8db6107e777eefd9cf88c0243551";
const PREPARED_SOURCE_SHA256 =
  "abfa328710a3d1c2e39b3893e6f6b6cf0214b7da7a101d5360502fe56c8ac58b";
const POST1137_SOURCE_SHA256 =
  "85d9f2e0fc3ac096909e78e06527ba0492de94650b661124088ec70ad9d79976";
const ROWS = 1130;
const RELATIONS = 1137;
const DEGREE = 3;
const KERNEL_COLUMNS = 7;
const UNIT_RANK = 2;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

class Row6C7CompositionFailure extends Error {}
function fail(message) { throw new Row6C7CompositionFailure(message); }
function plain(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  return value;
}
function array(value, name, length = undefined) {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length)) {
    fail(`${name} has the wrong shape`);
  }
  return value;
}
function integers(value, name, length = undefined) {
  return array(value, name, length).map((entry, index) => {
    const text = String(entry);
    if (!INTEGER.test(text) ||
        (typeof entry === "number" && !Number.isSafeInteger(entry))) {
      fail(`${name}[${index}] is not a canonical integer`);
    }
    return text;
  });
}
function equal(actual, expected, name) {
  if (!neutral.canonical(actual).equals(neutral.canonical(expected))) {
    fail(`${name} changed`);
  }
}
function frozen(value) {
  if (Array.isArray(value)) value.forEach(frozen);
  else if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(frozen);
  }
  return Object.freeze(value);
}
const sourceOrderSha256 = value =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function storageOwner(name, role, entries) {
  const values = integers(entries, `${name} entries`);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role };
}

function composeFactored(rawToKernel, compactTransform) {
  const raw = integers(rawToKernel, "raw-to-unit-kernel", KERNEL_COLUMNS * RELATIONS);
  const compact = integers(compactTransform, "compact unit transform",
    UNIT_RANK * KERNEL_COLUMNS);
  const output = [];
  for (let unit = 0; unit < UNIT_RANK; unit += 1) {
    for (let relation = 0; relation < RELATIONS; relation += 1) {
      let sum = 0n;
      for (let column = 0; column < KERNEL_COLUMNS; column += 1) {
        sum += BigInt(raw[column * RELATIONS + relation]) *
          BigInt(compact[unit * KERNEL_COLUMNS + column]);
      }
      output.push(String(sum));
    }
  }
  return output;
}

function denseOrderWitness(witness, generators, label) {
  const dense = Array(RELATIONS).fill("0");
  for (const [index, raw] of array(witness.rawPrincipalProduct,
    `${label} raw principal product`).entries()) {
    const term = plain(raw, `${label} term ${index}`);
    const relation = Number(integers([term.rawRelationIndex], `${label} raw index`)[0]);
    if (relation < 0 || relation >= RELATIONS || dense[relation] !== "0") {
      fail(`${label} raw relation index is invalid or repeated`);
    }
    const exponent = integers([term.exponent], `${label} exponent`)[0];
    if (exponent === "0") fail(`${label} exponent vanished`);
    const factor = plain(term.principalFactor, `${label} principal factor`);
    if (String(factor.denominator) !== "1") fail(`${label} denominator changed`);
    const values = integers(factor.values,
      `${label} principal values`, DEGREE);
    equal(values, generators.slice(relation * DEGREE, (relation + 1) * DEGREE),
      `${label} principal generator ancestry`);
    dense[relation] = exponent;
  }
  return dense;
}

function prepareRow6C7Result(inputs) {
  const source = plain(inputs, "row6 C7 inputs");
  const gate = structuredClone(plain(source.gate, "Gate-C owner"));
  const factor = structuredClone(plain(source.factor, "factor-base owner"));
  const prepared = structuredClone(plain(source.prepared, "prepared owner"));
  const post = structuredClone(plain(source.post1137, "post-1137 owner"));
  const ancestry = structuredClone(plain(source.ancestry, "column ancestry"));
  const klass = structuredClone(plain(source.classOwner, "class owner"));
  const unit = structuredClone(plain(source.unitOwner, "unit owner"));
  if (gate.schema !== "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1" ||
      factor.schema !== "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1" ||
      post.schema !== "sagejs.pari-class-group/row6-post1137-terminal-v1" || post.status !== 0 ||
      ancestry.schema !== "sagejs.pari-class-group/row6-column-ancestry-v1" ||
      klass.schema !== "sagejs.pari-class-group/row6-terminal-class-owner-v1" ||
      unit.schema !== "sagejs.pari-class-group/row6-rank2-c5-c6-v1") {
    fail("row6 C7 input schema or status changed");
  }
  equal(gate.field?.polynomial, POLYNOMIAL, "field polynomial");
  equal(gate.field?.signature, [3, 0], "field signature");
  if (gate.field?.degree !== DEGREE || gate.field?.precision !== 192) {
    fail("field shape changed");
  }
  if (post.gateOwnerSha256 !== GATE_CONTENT_SHA256 ||
      post.factorOwnerSha256 !== FACTOR_CONTENT_SHA256 ||
      gate.authority?.factorOwnerSha256 !== FACTOR_CONTENT_SHA256 ||
      gate.authority?.preparedAuthoritySha256 !== prepared.authoritySha256 ||
      factor.authority?.preparedAuthoritySha256 !== prepared.authoritySha256 ||
      post.preparedAuthoritySha256 !== prepared.authoritySha256) {
    fail("terminal owner ancestry changed");
  }
  equal(post.invariants, ["2", "2"], "source invariant factors");
  if (post.classNumber !== "4") fail("class number changed");
  equal(klass.classWitness?.classGroup,
    { classNumber: "4", invariants: ["2", "2"] }, "class witness group");
  if (unit.status !== "not_given" || unit.reason !== "LARGE" ||
      unit.precision !== 192 || unit.correspondenceComplete !== true) {
    fail("unit owner status changed");
  }
  const gateSha256 = neutral.sha256Canonical(gate);
  const factorSha256 = neutral.sha256Canonical(factor);
  const preparedSha256 = neutral.sha256Canonical(prepared);
  const ancestrySha256 = neutral.sha256Canonical(ancestry);
  const ancestryChecks = [
    ["class gate", klass.ancestry?.gateOwnerSha256, sourceOrderSha256(gate)],
    ["class factor", klass.ancestry?.factorOwnerSha256, sourceOrderSha256(factor)],
    ["class prepared", klass.ancestry?.preparedAuthoritySha256, prepared.authoritySha256],
    ["unit gate", unit.ancestry?.gateOwnerSha256, sourceOrderSha256(gate)],
    ["prepared owner", sourceOrderSha256(prepared), PREPARED_SOURCE_SHA256],
    ["post-1137 owner", sourceOrderSha256(post), POST1137_SOURCE_SHA256],
    ["ancestry owner", sourceOrderSha256(ancestry), ANCESTRY_SOURCE_SHA256],
    ["class owner", sourceOrderSha256(klass), CLASS_OWNER_SOURCE_SHA256],
    ["unit owner", sourceOrderSha256(unit), UNIT_OWNER_SOURCE_SHA256],
    ["accepted archimedean image", sourceOrderSha256(unit.ancestry?.acceptedArch),
      sourceOrderSha256(ancestry.acceptedArch)],
    ["accepted sign image", sourceOrderSha256(unit.ancestry?.acceptedSigns),
      sourceOrderSha256(ancestry.acceptedSigns)],
    ["phase pi", sourceOrderSha256(unit.ancestry?.phasePi),
      sourceOrderSha256(ancestry.phasePi)],
  ];
  const changedAncestry = ancestryChecks.find(([, actual, expected]) => actual !== expected);
  if (changedAncestry) fail(`${changedAncestry[0]} ancestry changed`);

  const records = integers(gate.final?.relations, "raw relation records", ROWS * RELATIONS);
  const logs = integers(gate.final?.logs, "raw relation logs", 21 * RELATIONS);
  const generators = integers(gate.relationIdentity?.generators,
    "principal generators", DEGREE * RELATIONS);
  const rawToPresentation = integers(klass.rawToPresentation,
    "raw-to-presentation", 2 * RELATIONS);
  const rawToKernel = integers(klass.rawToUnitKernel,
    "raw-to-unit-kernel", KERNEL_COLUMNS * RELATIONS);
  const factored = composeFactored(rawToKernel, unit.compact?.unitTransform);
  for (let unitColumn = 0; unitColumn < UNIT_RANK; unitColumn += 1) {
    const coefficients = factored.slice(unitColumn * RELATIONS,
      (unitColumn + 1) * RELATIONS);
    if (!coefficients.some(value => value !== "0")) fail("factored unit vanished");
    for (let row = 0; row < ROWS; row += 1) {
      let sum = 0n;
      for (let relation = 0; relation < RELATIONS; relation += 1) {
        sum += BigInt(records[relation * ROWS + row]) * BigInt(coefficients[relation]);
      }
      if (sum !== 0n) fail("factored unit is not principal ideal one");
    }
  }
  const witnesses = array(klass.classWitness?.witnesses, "class witnesses", 2);
  const orderCoefficients = witnesses.flatMap((witness, index) =>
    denseOrderWitness(witness, generators, `class witness ${index}`));
  equal(orderCoefficients, rawToPresentation, "class witness presentation transform");

  const acceptedSigns = integers(unit.ancestry?.acceptedSigns, "accepted signs", 21);
  const compactTransform = integers(unit.compact?.unitTransform,
    "compact transform", 14);
  const unitNorms = [];
  for (let unitColumn = 0; unitColumn < UNIT_RANK; unitColumn += 1) {
    let parity = 0n;
    for (let column = 0; column < KERNEL_COLUMNS; column += 1) {
      const normSign = BigInt(acceptedSigns[column * 3]) +
        BigInt(acceptedSigns[column * 3 + 1]) +
        BigInt(acceptedSigns[column * 3 + 2]);
      parity += normSign * BigInt(compactTransform[unitColumn * KERNEL_COLUMNS + column]);
    }
    unitNorms.push(parity % 2n === 0n ? "1" : "-1");
  }
  const factorData = plain(factor.factor, "factor-base data");
  const preparedData = plain(prepared.data, "prepared data");
  const storage = [
    storageOwner("class-generator-ideals", "class-generator-ideals",
      witnesses.flatMap(witness => integers(witness.idealHnf, "class ideal", 9))),
    storageOwner("class-order-principal-coefficients",
      "exact-order-principal-witnesses", orderCoefficients),
    storageOwner("class-presentation", "class-presentation", ["2", "0", "0", "2"]),
    storageOwner("compact-clean-logs", "compact-archimedean-units", unit.compact.cleanLogs),
    storageOwner("compact-getfu-factor", "compact-getfu-factor", unit.compact.getfuFactor),
    storageOwner("compact-unit-lattice", "compact-unit-lattice", unit.compact.relationLattice),
    storageOwner("compact-unit-transform", "compact-unit-transform", compactTransform),
    storageOwner("factor-base-ideals", "factor-base-ideals", factorData.packetIdeals),
    storageOwner("factor-base-norms", "factor-base-norms", factorData.packetNorms),
    storageOwner("factor-base-packet-ids", "factor-base-packet-ids", factor.selectedIndices),
    storageOwner("factor-base-primes", "factor-base-primes", factorData.relationPrimes),
    storageOwner("factor-map", "class-factor-map", klass.factorMap),
    storageOwner("factored-unit-transform", "exact-unit-raw-provenance", factored),
    storageOwner("field-multiplication-table", "integral-basis-multiplication-table",
      preparedData.basis_table),
    storageOwner("honesty-evidence", "honesty-evidence", factor.baseState.slice(0, 6)),
    storageOwner("principal-generators", "principal-relation-generators", generators),
    storageOwner("raw-relation-logs", "raw-relation-logs", logs),
    storageOwner("raw-relation-records", "raw-relation-records", records),
    storageOwner("raw-to-presentation-transform", "class-presentation-transform",
      rawToPresentation),
    storageOwner("raw-to-unit-kernel-transform", "exact-unit-relation-transform",
      rawToKernel),
    storageOwner("regulator-enclosure", "regulator-enclosure", post.regulator),
    storageOwner("terminal-B", "terminal-dependent-reduction", gate.final.b),
    storageOwner("terminal-C", "terminal-archimedean-relations", gate.final.c),
    storageOwner("terminal-hnf-state", "terminal-hnf-state", gate.final.state),
    storageOwner("terminal-permutation", "relation-terminal-permutation", gate.final.perm),
    storageOwner("terminal-relation-state", "terminal-relation-state", gate.relationState),
    storageOwner("torsion-generator", "torsion-generator", ["-1", "0", "0"]),
    storageOwner("unit-norms", "compact-unit-norms", unitNorms),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const payload = {
    classGroup: { classNumber: "4", generatorCount: "2",
      invariantFactors: ["2", "2"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: [...POLYNOMIAL], degree: "3", id: FIELD_ID },
    honesty: { evidenceOwner: "honesty-evidence", outcome: "equal-bound-source-skip",
      sourcePolicy: "PARI-2.17.4-buchall-KCZ2-equals-KCZ" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        { disposition: "assumed", id: "factor-base-bounds",
          statement: "PARI's factor-base generation and relation bounds are assumed correct" },
        { disposition: "assumed", id: "grh-bounds",
          statement: "GRH and PARI's conditional class-group bounds are assumed" },
        { disposition: "assumed", id: "pari-correspondence",
          statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
      ],
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4",
      replaySchema: PUBLICATION_REPLAY_SCHEMA,
    },
    storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { precisionBits: "192", reason: "LARGE",
      tag: "not_given" }, rank: "2", regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const componentOwnerSha256 = { gate: gateSha256, factor: factorSha256,
    prepared: preparedSha256, post1137: neutral.sha256Canonical(post),
    ancestry: ancestrySha256, classOwner: neutral.sha256Canonical(klass),
    // The retained C5 trace intentionally contains diagnostic binary64 values;
    // authenticate its exact source-order JSON rather than admitting those
    // diagnostics into the canonical mathematical envelope.
    unitOwner: sourceOrderSha256(unit) };
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    componentOwnerSha256,
    factoredUnitTransformSha256: neutral.sha256Canonical(factored),
    invariantFactors: ["2", "2"], unitNorms,
  });
  return frozen({ schema: COMPOSITION_SCHEMA, fieldId: FIELD_ID,
    componentOwnerSha256, mathematicalAuthoritySha256,
    correspondenceComplete: true, publicComplete: false,
    sealedEnvelopeHex: raw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority" });
}

module.exports = { COMPOSITION_SCHEMA, FIELD_ID, PARI_SOURCE_SHA256, POLYNOMIAL,
  PUBLICATION_REPLAY_SCHEMA, Row6C7CompositionFailure, prepareRow6C7Result };
