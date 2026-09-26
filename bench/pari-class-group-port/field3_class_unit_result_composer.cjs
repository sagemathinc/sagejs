"use strict";

// Narrow adapter from the independently replayed mixed-quartic field-3
// components to the field-neutral class/unit correspondence envelope.  This
// module never manufactures mathematical authority.  The currently retained
// run is intentionally blocked before sealing because its 301x13 exact unit
// transform and same-run suffix owner are absent.

const neutral = require("./class_unit_correspondence_result.cjs");

const COMPOSITION_SCHEMA =
  "sagejs.pari-class-group/field3-result-composition-v1";
const UNIT_BOUNDARY_SCHEMA =
  "sagejs.pari-class-group/field3-unit-correspondence-boundary-v1";
const FIELD_ID = "pari-2.17.4:x^4-2000022*x-2000042";
const POLYNOMIAL = Object.freeze(["-2000042", "-2000022", "0", "0", "1"]);
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const AUTHORITY_SHA256 =
  "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const INITIAL_SHA256 =
  "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe";
const SUFFIX_SHA256 =
  "b3ccd8916527e8a7df4a7d10a2f5cb9e76865d5209532817ac65c1aaa178f5e7";
const COMPONENT_REPLAY_SCHEMAS = Object.freeze({
  compact: "sagejs.pari-class-group/field3-compact-unit-authority-v1",
  relation: "sagejs.pari-class-group/field3-relation-map-authority-v1",
  torsion: "sagejs.pari-class-group/field3-torsion-authority-v1",
});
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

class Field3ResultCompositionFailure extends Error {}

function fail(message) {
  throw new Field3ResultCompositionFailure(message);
}

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

function digest(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${name} is not a SHA-256 digest`);
  }
  return value;
}

function integer(value, name) {
  const text = typeof value === "bigint" ? String(value) : String(value);
  if ((typeof value !== "string" && typeof value !== "number" &&
       typeof value !== "bigint") || !INTEGER.test(text) ||
      (typeof value === "number" && (!Number.isSafeInteger(value) || String(value) !== text))) {
    fail(`${name} is not a canonical integer`);
  }
  return text;
}

function integers(value, name, length = undefined) {
  return array(value, name, length).map((entry, index) =>
    integer(entry, `${name}[${index}]`));
}

function equal(actual, expected, name) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${name} changed`);
}

function frozen(value) {
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) value.forEach(frozen);
  else if (value && typeof value === "object") Object.values(value).forEach(frozen);
  return Object.freeze(value);
}

function owner(name, role, entries, logicalLength = entries.length) {
  const canonical = integers(entries, `${name} entries`);
  if (!Number.isSafeInteger(logicalLength) || logicalLength < 0 ||
      logicalLength > canonical.length) fail(`${name} has an invalid logical length`);
  return {
    capacity: String(canonical.length),
    encoding: "canonical-decimal-integer",
    entries: canonical,
    logicalLength: String(logicalLength),
    name,
    role,
  };
}

function openComponent(input, name, replaySchema, mathematicalAuthoritySha256) {
  const component = plain(input, `${name} component`);
  const receipt = plain(component.receipt, `${name} receipt`);
  const authority = plain(component.authority, `${name} authority`);
  if (authority.replaySchema !== replaySchema || typeof authority.replay !== "function" ||
      digest(authority.receiptSha256, `${name} receipt authority`) !==
        neutral.sha256Canonical(receipt) ||
      digest(authority.mathematicalAuthoritySha256, `${name} mathematical authority`) !==
        mathematicalAuthoritySha256) {
    fail(`${name} lacks its out-of-band authority`);
  }
  let replay;
  try {
    replay = authority.replay(structuredClone(receipt));
  } catch (error) {
    throw new Field3ResultCompositionFailure(`${name} cold replay rejected`, {
      cause: error,
    });
  }
  if (replay && typeof replay.then === "function") fail(`${name} replay must be synchronous`);
  const result = plain(replay, `${name} replay receipt`);
  if (result.schema !== replaySchema || result.fieldId !== FIELD_ID ||
      result.receiptSha256 !== authority.receiptSha256 ||
      result.mathematicalAuthoritySha256 !== mathematicalAuthoritySha256 ||
      result.accepted !== true) {
    fail(`${name} out-of-band replay did not authorize this receipt`);
  }
  return receipt;
}

function validateRelation(receipt) {
  const relation = plain(receipt, "relation replay");
  if (relation.schema !==
      "sagejs.pari-class-group-port/field3-relation-replay-map/v1") {
    fail("relation replay schema changed");
  }
  if (relation.field !== 3 ||
      relation.polynomial !== "x^4 - 2000022*x - 2000042" ||
      relation.fingerprintsAreAuthority !== false ||
      relation.exactOwnersAreAuthority !== true ||
      relation.pariCallsAfterBoundary !== 0) {
    fail("relation replay provenance changed");
  }
  if (digest(relation.authoritySha256, "relation authority") !== AUTHORITY_SHA256 ||
      digest(relation.initialFixtureSha256, "relation fixture") !== INITIAL_SHA256) {
    fail("relation replay belongs to a different retained run");
  }
  const matrix = plain(relation.matrix, "relation matrix receipt");
  equal(integers(matrix.invariants, "class invariants", 2), ["2", "2"],
    "class invariants");
  if (integer(matrix.order, "class number") !== "4" ||
      integer(matrix.rank, "presentation rank") !== "288" ||
      integer(matrix.canonicalRows, "canonical rows") !== "288" ||
      integer(matrix.factorBase, "factor base") !== "288" ||
      integer(matrix.sourceRelations, "source relations") !== "301") {
    fail("full class presentation changed");
  }
  equal(integers(matrix.selected, "selected packets", 2), ["11", "2"],
    "selected packets");
  equal(matrix.alignment, [[0, 1], [1, 0]], "suffix alignment");
  equal(matrix.inverse, [[0, 1], [1, 0]], "suffix inverse");
  equal(integers(matrix.fullCoordinates, "full coordinates", 2), ["0", "1"],
    "full coordinates");
  equal(integers(matrix.suffixCoordinates, "suffix coordinates", 2), ["1", "0"],
    "suffix coordinates");
  const selectedGeneratorIdeals = array(relation.selectedGeneratorIdeals,
    "selected class-generator ideals", 2).map((ideal, index) =>
    integers(ideal, `selected class-generator ideal ${index}`, 16));
  const arbitrary = plain(relation.arbitraryIdeal, "arbitrary-ideal receipt");
  if (arbitrary.exactQuotientReplay !== true) fail("ideal quotient was not replayed");
  equal(integers(arbitrary.fullCoordinates, "ideal full coordinates", 2), ["0", "1"],
    "ideal full coordinates");
  equal(integers(arbitrary.suffixCoordinates, "ideal suffix coordinates", 2), ["1", "0"],
    "ideal suffix coordinates");
  equal(integers(arbitrary.quotientGenerator, "quotient generator", 4),
    ["1", "1", "0", "0"], "quotient generator");
  const exact = plain(plain(relation.cpython, "CPython replay").receipt,
    "exact quotient replay");
  if (integer(exact.factor_base_size, "exact factor base") !== "288" ||
      integer(exact.relations, "exact relations") !== "301" ||
      integer(exact.packet_index, "exact packet index") !== "11") {
    fail("exact arbitrary-ideal provenance changed");
  }
  equal(integers(exact.quotient_generator, "exact quotient generator", 4),
    ["1", "1", "0", "0"], "exact quotient generator");
  return {
    arbitraryIdeal: integers(exact.ideal, "arbitrary ideal", 16),
    fullCoordinates: integers(matrix.fullCoordinates, "full coordinates", 2),
    nonzeroEntries: integer(exact.nonzero_relation_entries, "nonzero relations"),
    presentation: ["2", "0", "0", "2", ...selectedGeneratorIdeals.flat()],
    quotientGenerator: integers(exact.quotient_generator, "quotient generator", 4),
    representative: integers(exact.representative, "ideal representative", 16),
    suffixCoordinates: integers(matrix.suffixCoordinates, "suffix coordinates", 2),
  };
}

function validateCompact(receipt) {
  const compact = plain(receipt, "compact-unit replay");
  if (compact.schema !== "sagejs.pari-class-group/field3-compact-unit-replay-v1" ||
      compact.field !== "x^4 - 2000022*x - 2000042") {
    fail("compact-unit replay field changed");
  }
  const source = plain(compact.source, "compact-unit source");
  if (source.hashes_are_mathematical_authority !== false ||
      digest(source.authority_sha256, "compact authority") !== AUTHORITY_SHA256 ||
      digest(source.initial_sha256, "compact initial fixture") !== INITIAL_SHA256 ||
      digest(source.suffix_sha256, "compact suffix") !== SUFFIX_SHA256) {
    fail("compact-unit replay belongs to a different retained run");
  }
  const verified = plain(compact.verified, "compact-unit verified evidence");
  if (integer(verified.principal_relation_norms, "principal relation count") !== "301" ||
      integer(verified.terminal_packed_log_columns, "packed log columns") !== "2" ||
      verified.getfu_decision !== "PRECI-not_given" ||
      verified.expanded_units !== null) {
    fail("compact-unit PRECI outcome changed");
  }
  equal(integers(verified.selected_log_support, "selected log support", 2), ["0", "1"],
    "selected log support");
  equal(integers(verified.compact_transform_shape, "compact transform shape", 2),
    ["13", "2"], "compact transform shape");
  const transform = integers(verified.compact_transform_entries,
    "compact transform", 26);
  const lattice = integers(verified.lattice_entries, "compact lattice", 26);
  const regulator = integers(verified.regulator, "regulator", 3);
  const terminal = plain(compact.terminal, "compact-unit terminal");
  if (terminal.status !== "honest-partial-missing-exact-owner" ||
      terminal.exact_units_verified !== false ||
      terminal.principal_ideal_one_verified !== false ||
      terminal.unit_saturation_verified !== false) {
    fail("compact-unit incompleteness was overstated");
  }
  const missing = plain(terminal.missing_owner, "missing unit owner");
  if (missing.name !== "raw_to_accepted_relation_transform" ||
      missing.layout !== "column-major-raw-relations-by-accepted-columns" ||
      integer(missing.required_entries, "missing transform entries") !== "3913") {
    fail("missing unit owner changed");
  }
  equal(integers(missing.shape, "missing transform shape", 2), ["301", "13"],
    "missing transform shape");
  const suffixGap = plain(terminal.additional_capture_gap, "same-run suffix gap");
  if (suffixGap.name !== "same_run_retained_unit_suffix") {
    fail("same-run unit suffix gap changed");
  }
  return { lattice, missing, regulator, suffixGap, transform };
}

function validateTorsion(receipt) {
  const torsion = plain(receipt, "torsion replay");
  equal(integers(torsion.polynomial, "torsion polynomial", 5), POLYNOMIAL,
    "torsion polynomial");
  equal(integers(torsion.signature, "field signature", 2), ["2", "1"],
    "field signature");
  if (integer(torsion.order, "torsion order") !== "2" ||
      integer(torsion.generatorNorm, "torsion generator norm") !== "1") {
    fail("torsion group changed");
  }
  equal(integers(torsion.generator, "torsion generator", 4), ["-1", "0", "0", "0"],
    "torsion generator");
  equal(integers(torsion.state, "torsion state", 8),
    ["0", "4", "2", "1", "23", "23", "529", "1"], "torsion state");
  return { generator: ["-1", "0", "0", "0"] };
}

function componentEvidence(receipts) {
  const input = plain(receipts, "field3 receipts");
  const compactAuthority = neutral.sha256Canonical({
    authoritySha256: AUTHORITY_SHA256,
    initialSha256: INITIAL_SHA256,
    suffixSha256: SUFFIX_SHA256,
  });
  const torsionAuthority = neutral.sha256Canonical({
    generator: ["-1", "0", "0", "0"],
    polynomial: POLYNOMIAL,
    state: ["0", "4", "2", "1", "23", "23", "529", "1"],
  });
  return {
    compact: validateCompact(openComponent(input.compact, "compact unit",
      COMPONENT_REPLAY_SCHEMAS.compact, compactAuthority)),
    relation: validateRelation(openComponent(input.relation, "relation map",
      COMPONENT_REPLAY_SCHEMAS.relation, AUTHORITY_SHA256)),
    torsion: validateTorsion(openComponent(input.torsion, "torsion",
      COMPONENT_REPLAY_SCHEMAS.torsion, torsionAuthority)),
  };
}

function missingResult(evidence) {
  const relationOwner = owner("class-presentation", "class-presentation",
    evidence.relation.presentation);
  return frozen({
    correspondenceComplete: false,
    fieldId: FIELD_ID,
    mathematicalEvidenceSha256: neutral.sha256Canonical({
      classPresentation: relationOwner,
      compactTransform: evidence.compact.transform,
      relationAuthoritySha256: AUTHORITY_SHA256,
      regulator: evidence.compact.regulator,
      suffixAuthoritySha256: SUFFIX_SHA256,
      torsion: evidence.torsion.generator,
    }),
    missing: [
      {
        entries: "3913",
        name: "raw_to_accepted_relation_transform",
        requiredReplay: [
          "relationRecords * transform == 0",
          "packedRelationLogs * transform == terminalAcceptedA",
          "exact reconstructed units generate principal ideal one",
        ],
        shape: ["301", "13"],
      },
      {
        name: "same_run_retained_unit_suffix",
        requiredReplay: ["all 13 accepted columns come from this retained run"],
      },
    ],
    publicComplete: false,
    schema: COMPOSITION_SCHEMA,
    sealedEnvelopeHex: null,
    status: "blocked-missing-exact-unit-correspondence",
    verified: {
      arbitraryIdealExactQuotient: true,
      classGroup: { classNumber: "4", invariantFactors: ["2", "2"] },
      compactTransformShape: ["13", "2"],
      pariCallsAfterBoundary: "0",
      unitMaterialization: "not_given(PRECI)",
      unitRank: "2",
      torsionOrder: "2",
    },
  });
}

function validateUnitBoundary(boundary, evidence) {
  const input = plain(boundary, "unit correspondence boundary");
  if (input.schema !== UNIT_BOUNDARY_SCHEMA || input.fieldId !== FIELD_ID ||
      typeof input.replay !== "function") {
    fail("unit correspondence boundary has the wrong type");
  }
  const transform = integers(input.rawToAcceptedTransform,
    "raw-to-accepted transform", 3913);
  const relationRecords = integers(input.relationRecords,
    "same-run relation records", 288 * 301);
  const principalGenerators = integers(input.principalGenerators,
    "same-run principal generators", 4 * 301);
  const sourceRawLogs = integers(input.sourceRawLogs,
    "same-run source raw logs", 7 * 3 * 301);
  const terminalAcceptedA = integers(input.terminalAcceptedA,
    "same-run terminal accepted A", 7 * 3 * 13);
  const factoredUnitTransform = integers(input.factoredUnitTransform,
    "factored rank-two unit transform", 301 * 2);
  const unitNorms = integers(input.unitNorms, "factored unit norms", 2);
  equal(unitNorms, ["1", "1"], "factored unit norms");
  const recomposed = [];
  for (let unit = 0; unit < 2; unit += 1) {
    for (let relation = 0; relation < 301; relation += 1) {
      let value = 0n;
      for (let accepted = 0; accepted < 13; accepted += 1) {
        value += BigInt(transform[accepted * 301 + relation]) *
          BigInt(evidence.compact.transform[unit * 13 + accepted]);
      }
      recomposed.push(String(value));
    }
  }
  equal(factoredUnitTransform, recomposed, "factored rank-two unit transform");
  // The independently injected replay remains the mathematical authority, but
  // the composer also rejects a detached or reordered R/T owner before calling
  // it.  This is only 1.13 million bounded exact products.
  for (let accepted = 0; accepted < 13; accepted += 1) {
    for (let row = 0; row < 288; row += 1) {
      let value = 0n;
      for (let relation = 0; relation < 301; relation += 1) {
        value += BigInt(relationRecords[relation * 288 + row]) *
          BigInt(transform[accepted * 301 + relation]);
      }
      if (value !== 0n) fail("same-run relation transform is not an exact kernel");
    }
  }
  const authoritySha256 = digest(input.authoritySha256, "unit correspondence authority");
  const detached = {
    authoritySha256,
    compactEvidenceSha256: neutral.sha256Canonical({
      lattice: evidence.compact.lattice,
      regulator: evidence.compact.regulator,
      transform: evidence.compact.transform,
    }),
    factoredUnitTransform: [...factoredUnitTransform],
    fieldId: FIELD_ID,
    principalGenerators: [...principalGenerators],
    rawToAcceptedTransform: [...transform],
    relationRecords: [...relationRecords],
    relationAuthoritySha256: AUTHORITY_SHA256,
    schema: UNIT_BOUNDARY_SCHEMA,
    sourceRawLogs: [...sourceRawLogs],
    suffixAuthoritySha256: SUFFIX_SHA256,
    terminalAcceptedA: [...terminalAcceptedA],
    unitNorms: [...unitNorms],
  };
  let replay;
  try {
    replay = input.replay(structuredClone(detached));
  } catch (error) {
    throw new Field3ResultCompositionFailure(
      "out-of-band unit correspondence replay rejected", { cause: error });
  }
  if (replay && typeof replay.then === "function") fail("unit replay must be synchronous");
  const receipt = plain(replay, "unit correspondence replay receipt");
  if (receipt.schema !== UNIT_BOUNDARY_SCHEMA || receipt.fieldId !== FIELD_ID ||
      receipt.authoritySha256 !== authoritySha256 ||
      receipt.relationAuthoritySha256 !== AUTHORITY_SHA256 ||
      receipt.suffixAuthoritySha256 !== SUFFIX_SHA256 ||
      receipt.transformSha256 !== neutral.sha256Canonical(transform) ||
      receipt.relationRecordsSha256 !== neutral.sha256Canonical(relationRecords) ||
      receipt.principalGeneratorsSha256 !== neutral.sha256Canonical(principalGenerators) ||
      receipt.sourceRawLogsSha256 !== neutral.sha256Canonical(sourceRawLogs) ||
      receipt.terminalAcceptedASha256 !== neutral.sha256Canonical(terminalAcceptedA) ||
      receipt.factoredUnitTransformSha256 !==
        neutral.sha256Canonical(factoredUnitTransform) ||
      receipt.compactUnitTransformSha256 !==
        neutral.sha256Canonical(evidence.compact.transform) ||
      JSON.stringify(receipt.unitNorms) !== JSON.stringify(unitNorms) ||
      receipt.exactKernelVerified !== true ||
      receipt.packedLogTransformVerified !== true ||
      receipt.principalIdealOneVerified !== true ||
      receipt.factoredUnitNormsVerified !== true ||
      receipt.sameRunPrincipalGeneratorsVerified !== true ||
      receipt.sameRunSuffixVerified !== true ||
      receipt.pariCallsAfterBoundary !== 0 ||
      receipt.correspondenceComplete !== true ||
      receipt.publicComplete !== false) {
    fail("unit correspondence replay receipt is incomplete");
  }
  return {
    authoritySha256,
    factoredUnitTransform,
    principalGenerators,
    relationRecords,
    sourceRawLogs,
    terminalAcceptedA,
    transform,
    unitNorms,
  };
}

function completePayload(evidence, unit, publicationReplaySchema) {
  if (typeof publicationReplaySchema !== "string" || publicationReplaySchema.length === 0) {
    fail("publication replay schema is absent");
  }
  const relation = evidence.relation;
  const quotientEntries = [
    ...relation.arbitraryIdeal,
    ...relation.representative,
    ...relation.quotientGenerator,
    ...relation.fullCoordinates,
    ...relation.suffixCoordinates,
  ];
  const storage = [
    owner("arbitrary-ideal-quotient", "arbitrary-ideal-quotient", quotientEntries),
    owner("class-presentation", "class-presentation", relation.presentation),
    owner("compact-unit-lattice", "compact-unit-lattice", evidence.compact.lattice),
    owner("compact-unit-transform", "compact-unit-transform", evidence.compact.transform),
    owner("factored-unit-norms", "factored-unit-norms", unit.unitNorms),
    owner("factored-unit-transform", "factored-unit-transform",
      unit.factoredUnitTransform),
    owner("honesty-evidence", "honesty-evidence",
      ["301", "288", relation.nonzeroEntries, "11", "2"]),
    owner("principal-generators", "principal-relation-generators",
      unit.principalGenerators),
    owner("raw-relation-records", "raw-relation-records", unit.relationRecords),
    owner("raw-to-accepted-unit-transform", "exact-unit-relation-transform", unit.transform),
    owner("regulator-enclosure", "regulator-enclosure", evidence.compact.regulator),
    owner("source-raw-packed-logs", "source-raw-packed-logs", unit.sourceRawLogs),
    owner("terminal-accepted-packed-logs", "terminal-accepted-packed-logs",
      unit.terminalAcceptedA),
    owner("torsion-generator", "torsion-generator", evidence.torsion.generator),
  ];
  return {
    classGroup: {
      classNumber: "4",
      generatorCount: "2",
      invariantFactors: ["2", "2"],
      presentationOwner: "class-presentation",
    },
    field: {
      definingPolynomialAscending: [...POLYNOMIAL],
      degree: "4",
      id: FIELD_ID,
    },
    honesty: {
      evidenceOwner: "honesty-evidence",
      outcome: "not-required",
      sourcePolicy: "PARI-2.17.4-buchall-mixed-quartic-PRECI-flag-zero",
    },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        {
          disposition: "assumed",
          id: "factor-base-generation",
          statement: "PARI's factor-base generation policy is assumed correct",
        },
        {
          disposition: "assumed",
          id: "grh-plus-bounds",
          statement: "GRH and PARI's undocumented bounds are assumed correct",
        },
      ],
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: PARI_SOURCE_SHA256,
      pariVersion: "2.17.4",
      replaySchema: publicationReplaySchema,
    },
    storage,
    terminal: {
      correspondence_complete: true,
      public_complete: false,
      status: "pari-correspondence-complete-internal",
    },
    unitGroup: {
      materialization: {
        precisionBits: evidence.compact.regulator[1],
        reason: "PRECI",
        tag: "not_given",
      },
      rank: "2",
      regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator",
      torsionOrder: "2",
    },
  };
}

function prepareField3ClassUnitResult(receipts, options = {}) {
  const evidence = componentEvidence(receipts);
  if (options.unitCorrespondence === undefined || options.unitCorrespondence === null) {
    return missingResult(evidence);
  }
  const unit = validateUnitBoundary(options.unitCorrespondence, evidence);
  const payload = completePayload(evidence, unit, options.publicationReplaySchema);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  return frozen({
    correspondenceComplete: true,
    fieldId: FIELD_ID,
    publicComplete: false,
    schema: COMPOSITION_SCHEMA,
    sealedEnvelopeHex: raw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority",
    unitCorrespondenceAuthoritySha256: unit.authoritySha256,
  });
}

function publishPreparedField3Result(prepared, authority, publisher = undefined) {
  const result = plain(prepared, "prepared field3 result");
  if (result.schema !== COMPOSITION_SCHEMA ||
      result.status !== "ready-for-out-of-band-publication-authority" ||
      result.correspondenceComplete !== true || result.publicComplete !== false ||
      typeof result.sealedEnvelopeHex !== "string" ||
      result.sealedEnvelopeHex.length === 0 || result.sealedEnvelopeHex.length % 2 !== 0 ||
      !/^[0-9a-f]+$/.test(result.sealedEnvelopeHex) ||
      digest(result.sealedEnvelopeSha256, "prepared envelope") !==
        neutral.sha256Bytes(Buffer.from(result.sealedEnvelopeHex, "hex"))) {
    fail("field3 result is not ready for publication");
  }
  const raw = Buffer.from(result.sealedEnvelopeHex, "hex");
  // No authority factory exists here.  The caller must inject the neutral
  // envelope's separately transported mathematical replay capability.
  if (publisher === undefined) {
    return neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  }
  if (!(publisher instanceof neutral.ClassUnitCorrespondencePublisher)) {
    fail("publication target is not transactional");
  }
  return publisher.publish(raw, authority);
}

module.exports = {
  AUTHORITY_SHA256,
  COMPONENT_REPLAY_SCHEMAS,
  COMPOSITION_SCHEMA,
  FIELD_ID,
  Field3ResultCompositionFailure,
  INITIAL_SHA256,
  PARI_SOURCE_SHA256,
  POLYNOMIAL,
  SUFFIX_SHA256,
  UNIT_BOUNDARY_SCHEMA,
  prepareField3ClassUnitResult,
  publishPreparedField3Result,
};
