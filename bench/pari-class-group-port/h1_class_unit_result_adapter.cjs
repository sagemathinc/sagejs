"use strict";

// Adapter from the independently cold-replayed real-cubic H1 owner bundle to
// the field-neutral class/unit correspondence envelope.  This module does not
// create either the owner-bundle authority or the final publication authority.

const neutral = require("./class_unit_correspondence_result.cjs");

const BOUNDARY_SCHEMA =
  "sagejs.pari-class-group/h1-data-only-cross-runtime-boundary-v1";
const BOUNDARY_REPLAY_SCHEMA =
  "sagejs.pari-class-group/h1-data-only-cross-runtime-replay-v1";
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const POLYNOMIAL = Object.freeze(["20034", "-20018", "0", "1"]);
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const COLD_REPLAY_SCHEMA =
  "sagejs.pari-class-group/h1-terminal-numeric-snapshot-v2";
const REGULATOR_SCHEMA =
  "sagejs.pari-class-group/live-regulator-interval-authority-v1";
const WORKLOAD_BOUNDARY = Object.freeze({
  exactUnitAndRegulatorReplay: "independent-stronger-post-pass",
  expandedFundamentalUnits: null,
  includedInMatchedFlagZeroTiming: false,
  matchedPariFlag: "0",
  matchedPariPrecisionBits: "192",
  matchedPariUnitState: "compact-log-state-only",
});
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

const OWNER_LENGTHS = Object.freeze({
  accept_acceptance_state: 3,
  accept_reconstruction_state: 4,
  attempt_state: 4,
  basis_table: 27,
  bridge_state: 16,
  class_m2_scratch: 64,
  class_uir_scratch: 64,
  class_ur_scratch: 64,
  class_x_scratch: 64,
  class_y_scratch: 64,
  cursor_output: 4,
  final_compact_provenance: 14,
  final_exact_norms: 2,
  final_exact_units: 6,
  final_invariants: 8,
  final_left: 64,
  final_left_inverse: 64,
  final_polynomial: 4,
  final_presentation: 64,
  final_presentation_to_relation: 120,
  final_regulator: 3,
  final_relation_to_presentation: 120,
  final_retained_relation_map: 146,
  final_right: 64,
  final_right_inverse: 64,
  final_smith: 64,
  final_state: 16,
  final_torsion_generator: 3,
  final_torsion_order: 1,
  generators: 219,
  hnf_full_h: 120,
  hnf_hnf_transform: 225,
  hnf_matbnew: 120,
  hnf_result_c: 1533,
  hnf_transform: 5329,
  inc: 4,
  log_embeddings: 1533,
  packet_ideals: 594,
  packet_norms: 66,
  precision_authority_state: 16,
  precision_determinant_state: 5,
  precision_exact_units_integral: 6,
  precision_getfu_factor: 4,
  precision_published_logs: 18,
  precision_published_phases: 6,
  precision_retry_state: 6,
  prep_kummer_random_state: 66,
  prep_zk: 9,
  progress: 4,
  relation_hashes: 780,
  relation_metadata: 2340,
  relation_records: 4818,
  schedule: 4,
  search_ideals: 66,
  state: 5,
  torsion_state: 6,
  unified_state: 12,
});

class H1ClassUnitAdapterFailure extends Error {}

function fail(message) {
  throw new H1ClassUnitAdapterFailure(message);
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
  if (typeof value !== "string" || !INTEGER.test(value)) {
    fail(`${name} is not a canonical integer`);
  }
  return value;
}

function integers(value, name, length = undefined) {
  return array(value, name, length).map((entry, index) =>
    integer(entry, `${name}[${index}]`));
}

function equal(actual, expected, name) {
  if (neutral.canonical(actual).compare(neutral.canonical(expected)) !== 0) {
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

function owner(name, role, entries) {
  const canonical = integers(entries, `${name} entries`);
  return {
    capacity: String(canonical.length),
    encoding: "canonical-decimal-integer",
    entries: canonical,
    logicalLength: String(canonical.length),
    name,
    role,
  };
}

function validateRawOwners(rawOwners) {
  const input = plain(rawOwners, "raw replay owners");
  equal(Object.keys(input).sort(), Object.keys(OWNER_LENGTHS).sort(),
    "raw replay owner names");
  return Object.fromEntries(Object.entries(OWNER_LENGTHS).map(([name, length]) =>
    [name, integers(input[name], `raw replay owner ${name}`, length)]));
}

function validateColdReplay(receipt) {
  const input = plain(receipt, "cold replay receipt");
  if (input.schema !== COLD_REPLAY_SCHEMA || input.actualUnifiedPublication !== true ||
      input.publicComplete !== false || input.relations !== 73 ||
      input.factorBase !== 66 || input.exactUnits !== 2 ||
      input.publishedCells !== 811 || input.intermediateSerializations !== 0 ||
      input.mutationsRejected < 11) {
    fail("exact H1 cold replay did not complete");
  }
  digest(input.sha256, "cold replay envelope");
  return structuredClone(input);
}

function validateRegulatorAuthority(authority) {
  const input = structuredClone(plain(authority, "regulator authority"));
  if (input.schema !== REGULATOR_SCHEMA || input.authority?.scope !==
      "independent-exact-unit-interval-verifier" ||
      input.authority.timed_native_root !== false ||
      input.authority.intervals_generated_from_exact_units !== true ||
      input.authority.serialized_known_envelope_accepted_as_input !== false ||
      input.authority.unit_saturation_index_one !== false ||
      input.authority.public_class_unit_complete !== false ||
      input.evidence?.live_regulator_contained !== true ||
      input.evidence?.regulator_enclosure?.rigorous !== true ||
      input.evidence?.regulator_enclosure?.full_rank_certified !== true ||
      !Array.isArray(input.evidence.packed_log_matches) ||
      input.evidence.packed_log_matches.length !== 6 ||
      input.evidence.packed_log_matches.some(value => value !== true)) {
    fail("rigorous regulator authority is incomplete");
  }
  const stated = digest(input.authority_sha256, "regulator authority");
  delete input.authority_sha256;
  if (neutral.sha256Canonical(input) !== stated) {
    fail("regulator authority digest changed");
  }
  input.authority_sha256 = stated;
  return input;
}

function validateHonesty(honesty) {
  const input = structuredClone(plain(honesty, "equal-bound honesty evidence"));
  const expected = {
    accepted_relations: 73,
    checking_bound: 48,
    checking_groups: 48,
    class_number: 1,
    honesty_status: "equal-bound-source-skip",
    invariant_count: 0,
    relation_bound: 48,
    relation_groups: 48,
  };
  equal(input, expected, "equal-bound honesty evidence");
  return input;
}

function openBoundary(boundary) {
  const input = plain(boundary, "H1 cross-runtime boundary");
  if (input.schema !== BOUNDARY_SCHEMA || input.fieldId !== FIELD_ID) {
    fail("H1 boundary field or schema changed");
  }
  const rawOwners = validateRawOwners(input.rawOwners);
  const coldReplay = validateColdReplay(input.coldReplay);
  const regulatorAuthority = validateRegulatorAuthority(input.regulatorAuthority);
  const honesty = validateHonesty(input.honesty);
  const authority = plain(input.authority, "H1 boundary authority");
  if (authority.replaySchema !== BOUNDARY_REPLAY_SCHEMA ||
      typeof authority.replay !== "function") {
    fail("H1 boundary lacks an out-of-band replay capability");
  }
  const mathematicalAuthoritySha256 = digest(
    authority.mathematicalAuthoritySha256,
    "H1 mathematical authority",
  );
  const evidence = {
    coldReplay,
    fieldId: FIELD_ID,
    honesty,
    rawOwners,
    regulatorAuthority,
    schema: BOUNDARY_SCHEMA,
  };
  const evidenceSha256 = neutral.sha256Canonical(evidence);
  if (digest(authority.evidenceSha256, "H1 evidence authority") !== evidenceSha256) {
    fail("H1 evidence lacks out-of-band identity");
  }
  let replay;
  try {
    replay = authority.replay(structuredClone(evidence));
  } catch (error) {
    throw new H1ClassUnitAdapterFailure("H1 out-of-band replay rejected", {
      cause: error,
    });
  }
  if (replay && typeof replay.then === "function") fail("H1 replay must be synchronous");
  const receipt = plain(replay, "H1 replay receipt");
  if (receipt.schema !== BOUNDARY_REPLAY_SCHEMA || receipt.fieldId !== FIELD_ID ||
      receipt.evidenceSha256 !== evidenceSha256 ||
      receipt.mathematicalAuthoritySha256 !== mathematicalAuthoritySha256 ||
      receipt.coldReplaySha256 !== coldReplay.sha256 ||
      receipt.regulatorAuthoritySha256 !== regulatorAuthority.authority_sha256 ||
      receipt.correspondenceComplete !== true || receipt.publicComplete !== false ||
      receipt.accepted !== true) {
    fail("H1 replay did not authorize the submitted owner bundle");
  }
  return { evidence, mathematicalAuthoritySha256 };
}

function powerCoordinates(rawOwners) {
  const basis = rawOwners.prep_zk.map(BigInt);
  const integral = rawOwners.final_exact_units.map(BigInt);
  const answer = [];
  for (let unit = 0; unit < 2; unit += 1) {
    for (let power = 0; power < 3; power += 1) {
      let value = 0n;
      for (let column = 0; column < 3; column += 1) {
        value += basis[3 * column + power] * integral[3 * unit + column];
      }
      answer.push(String(value));
    }
  }
  return answer;
}

function dyadicPoint(triple, name) {
  const [mantissaText, precisionText, exponentText] = integers(triple, name, 3);
  const mantissa = BigInt(mantissaText);
  const precision = BigInt(precisionText);
  const exponent = BigInt(exponentText);
  if (precision < 1n) fail(`${name} is not a packed inexact real`);
  return { numerator: mantissa, exponent: exponent - (precision - 1n) };
}

function addDyadic(left, right, subtract = false) {
  const exponent = left.exponent < right.exponent ? left.exponent : right.exponent;
  const a = left.numerator << (left.exponent - exponent);
  const b = right.numerator << (right.exponent - exponent);
  return { numerator: subtract ? a - b : a + b, exponent };
}

function multiplyDyadic(left, right) {
  return {
    numerator: left.numerator * right.numerator,
    exponent: left.exponent + right.exponent,
  };
}

function normalizeDyadic(point) {
  let numerator = point.numerator;
  let exponent = point.exponent;
  if (numerator < 0n) numerator = -numerator;
  if (numerator === 0n) return { numerator, exponent: 0n };
  while ((numerator & 1n) === 0n) {
    numerator >>= 1n;
    exponent += 1n;
  }
  return { numerator, exponent };
}

function compareDyadic(left, right) {
  const difference = addDyadic(left, right, true);
  return difference.numerator < 0n ? -1 : difference.numerator > 0n ? 1 : 0;
}

function regulatorHull(rawOwners) {
  const logs = rawOwners.precision_published_logs;
  const points = Array.from({ length: 6 }, (_, index) =>
    dyadicPoint(logs.slice(3 * index, 3 * index + 3), `packed log ${index}`));
  let determinant = addDyadic(
    multiplyDyadic(points[0], points[4]),
    multiplyDyadic(points[1], points[3]),
    true,
  );
  determinant = normalizeDyadic(determinant);
  const regulator = normalizeDyadic(dyadicPoint(rawOwners.final_regulator,
    "packed regulator"));
  const lower = compareDyadic(determinant, regulator) <= 0 ? determinant : regulator;
  const upper = lower === determinant ? regulator : determinant;
  if (lower.numerator <= 0n) fail("regulator hull is not positive");
  return [String(lower.numerator), String(lower.exponent),
    String(upper.numerator), String(upper.exponent)];
}

function canonicalBytes(value) {
  return [...neutral.canonical(value)].map(entry => String(entry));
}

function makePayload(opened, publicationReplaySchema) {
  if (typeof publicationReplaySchema !== "string" || publicationReplaySchema.length === 0) {
    fail("publication replay schema is missing");
  }
  const { rawOwners, regulatorAuthority, honesty } = opened.evidence;
  equal(rawOwners.final_polynomial, POLYNOMIAL, "published polynomial");
  equal(rawOwners.final_state, [
    "0", "0", "0", "0", "0", "0", "73", "8",
    "1", "0", "2", "2", "0", "811", "1", "0",
  ], "terminal publication state");
  equal(rawOwners.final_invariants, Array(8).fill("0"), "H1 invariants");
  equal(rawOwners.final_torsion_order, ["2"], "torsion order");
  equal(rawOwners.final_torsion_generator, ["-1", "0", "0"],
    "torsion generator");
  if (rawOwners.final_exact_norms.some(value => value !== "-1" && value !== "1")) {
    fail("an exact H1 unit lost unit norm");
  }

  const storage = [
    owner("class-presentation", "class-presentation", rawOwners.final_presentation),
    owner("exact-unit-coordinates", "exact-unit-coordinates",
      powerCoordinates(rawOwners)),
    owner("exact-unit-norms", "exact-unit-norms", rawOwners.final_exact_norms),
    owner("honesty-evidence", "honesty-evidence", canonicalBytes(honesty)),
    owner("regulator-enclosure", "regulator-enclosure", regulatorHull(rawOwners)),
    owner("regulator-rigorous-authority", "rigorous-regulator-authority-canonical-json",
      canonicalBytes(regulatorAuthority)),
    ...Object.keys(rawOwners).sort().map(name =>
      owner(`replay-${name}`, "h1-cold-replay-owner", rawOwners[name])),
    owner("torsion-generator", "torsion-generator", rawOwners.final_torsion_generator),
    owner("workload-boundary-evidence", "workload-boundary-canonical-json",
      canonicalBytes(WORKLOAD_BOUNDARY)),
  ].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

  return {
    classGroup: {
      classNumber: "1",
      generatorCount: "0",
      invariantFactors: [],
      presentationOwner: "class-presentation",
    },
    field: {
      definingPolynomialAscending: [...POLYNOMIAL],
      degree: "3",
      id: FIELD_ID,
    },
    honesty: {
      evidenceOwner: "honesty-evidence",
      outcome: "equal-bound-source-skip",
      sourcePolicy: "PARI-2.17.4-buchall-equal-bound-branch",
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
        {
          disposition: "assumed",
          id: "prepared-maximal-order",
          statement: "The prepared maximal order imported from PARI is assumed correct",
        },
        {
          disposition: "assumed",
          id: "unit-index-selection",
          statement: "PARI's unit-index selection policy is assumed correct",
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
        coordinatesOwner: "exact-unit-coordinates",
        normsOwner: "exact-unit-norms",
        tag: "exact_units",
      },
      rank: "2",
      regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator",
      torsionOrder: "2",
    },
  };
}

function prepareH1ClassUnitResult(boundary, options = {}) {
  const opened = openBoundary(boundary);
  const payload = makePayload(opened, options.publicationReplaySchema);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  return frozen({
    boundaryEvidenceSha256: neutral.sha256Canonical(opened.evidence),
    correspondenceComplete: true,
    envelopeSha256: neutral.sha256Bytes(raw),
    fieldId: FIELD_ID,
    mathematicalAuthoritySha256: opened.mathematicalAuthoritySha256,
    publicComplete: false,
    sealedEnvelopeHex: raw.toString("hex"),
    status: "ready-for-out-of-band-publication-authority",
  });
}

function publishPreparedH1Result(prepared, authority, publisher = undefined) {
  const input = plain(prepared, "prepared H1 result");
  if (input.status !== "ready-for-out-of-band-publication-authority" ||
      input.correspondenceComplete !== true || input.publicComplete !== false ||
      input.fieldId !== FIELD_ID || typeof input.sealedEnvelopeHex !== "string") {
    fail("H1 result is not ready for publication");
  }
  const raw = Buffer.from(input.sealedEnvelopeHex, "hex");
  if (raw.toString("hex") !== input.sealedEnvelopeHex ||
      neutral.sha256Bytes(raw) !== input.envelopeSha256) {
    fail("prepared H1 envelope changed");
  }
  const destination = publisher ?? new neutral.ClassUnitCorrespondencePublisher();
  return destination.publish(raw, authority);
}

module.exports = {
  BOUNDARY_REPLAY_SCHEMA,
  BOUNDARY_SCHEMA,
  COLD_REPLAY_SCHEMA,
  FIELD_ID,
  H1ClassUnitAdapterFailure,
  OWNER_LENGTHS,
  PARI_SOURCE_SHA256,
  POLYNOMIAL,
  REGULATOR_SCHEMA,
  WORKLOAD_BOUNDARY,
  prepareH1ClassUnitResult,
  publishPreparedH1Result,
};
