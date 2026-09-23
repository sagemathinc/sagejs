"use strict";

// Field-neutral C7 adapter for panel row 8. Mathematical authority remains
// detached twice: first at the injected terminal-closure boundary and again
// at publication through class_unit_correspondence_result.cjs.

const neutral = require("./class_unit_correspondence_result.cjs");
const crypto = require("node:crypto");

const COMPOSITION_SCHEMA =
  "sagejs.pari-class-group/panel8-c7-result-composition-v1";
const TERMINAL_CLOSURE_SCHEMA =
  "sagejs.pari-class-group/panel8-terminal-closure-v1";
const CLOSURE_REPLAY_SCHEMA =
  "sagejs.pari-class-group/panel8-terminal-closure-replay-v1";
const FIELD_ID =
  "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363";
const POLYNOMIAL = Object.freeze(["-20034", "-20018", "0", "0", "1"]);
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const ACCEPTED_SHA256 =
  "b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591";
const C5_SHA256 =
  "f93fa0ff5f68531646f213d799339e87a7b2d338e18457399fe81d6b0fb1df21";
const C6_SHA256 =
  "d1f4e9e2ce4ae987952cbce8e8af9d6c9ede318f5ffa89b185fbd003ab5e28df";
const TERMINAL_CLOSURE_OWNER_SHA256 =
  "2e7a8a896f68e80093e3e5a5e198597569e804e4dc53f888869138a97710919d";
const PRISTINE_W0_SHA256 =
  "4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1";
const PREPARED_AUTHORITY_SHA256 =
  "f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01";
const C6_SOURCE_SHA256 =
  "17367362f6d54344e1e1ccd62864b5c0c5c394c20278aab7c03801ce25e6c430";
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

class Panel8C7CompositionFailure extends Error {}

function fail(message) {
  throw new Panel8C7CompositionFailure(message);
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

function integers(value, name, length = undefined) {
  return array(value, name, length).map((entry, index) => {
    if (typeof entry !== "string" || !INTEGER.test(entry)) {
      fail(`${name}[${index}] is not a canonical integer`);
    }
    return entry;
  });
}

function cellsSha256(values) {
  return crypto.createHash("sha256").update(values.join("\n"), "ascii").digest("hex");
}

function cellsDigest(value, values, name) {
  if (digest(value, name) !== cellsSha256(values)) fail(`${name} changed`);
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

function validateField(field, name) {
  const value = plain(field, `${name} field`);
  if (value.id !== FIELD_ID || value.panelIndex !== 8 || value.degree !== 4 ||
      value.polynomialCoefficientOrder !== "ascending" || value.unitRank !== 2) {
    fail(`${name} field identity changed`);
  }
  equal(value.polynomial, POLYNOMIAL, `${name} polynomial`);
  equal(value.signature, [2, 1], `${name} signature`);
  return value;
}

function validateInputs(acceptedInput, c5Input, c6Input) {
  const accepted = plain(acceptedInput, "accepted owner");
  const c5 = plain(c5Input, "C5 owner");
  const c6 = plain(c6Input, "C6 owner");
  if (accepted.schema !==
      "sagejs.pari-class-group/panel8-accepted-retry-owner-v1") {
    fail("accepted owner schema changed");
  }
  if (c5.schema !==
      "sagejs.pari-class-group/panel8-c5-unit-lattice-cleanarch-v2") {
    fail("C5 owner schema changed");
  }
  if (c6.schema !== "sagejs.pari-class-group/c6-getfu-not-given-v1") {
    fail("C6 owner schema changed");
  }
  validateField(accepted.field, "accepted");
  validateField(c5.field, "C5");
  validateField(c6.field, "C6");
  const terminal = plain(accepted.terminal, "accepted terminal");
  if (terminal.status !== "accepted" || terminal.classNumber !== "1" ||
      !Array.isArray(terminal.classInvariants) || terminal.classInvariants.length !== 0 ||
      terminal.relationLatticeShape?.[0] !== 9 ||
      terminal.relationLatticeShape?.[1] !== 2) {
    fail("accepted class-group terminal changed");
  }
  const acceptedAncestry = plain(accepted.ancestry, "accepted ancestry");
  if (acceptedAncestry.preparedW0Sha256 !== PRISTINE_W0_SHA256 ||
      acceptedAncestry.preparedAuthoritySha256 !== PREPARED_AUTHORITY_SHA256 ||
      accepted.pristineComparison?.allThreeExactPrefixesCompared !== true ||
      accepted.pristineComparison?.terminalStateCompared !== true) {
    fail("accepted owner ancestry or comparison latch changed");
  }
  if (c5.acceptedRetryOwnerSha256 !== ACCEPTED_SHA256 ||
      c5.pristineW0Sha256 !== PRISTINE_W0_SHA256 || c5.precision !== 192 ||
      c5.state?.[11] !== 1 || c5.state?.[14] !== 2 || c5.state?.[15] !== 9) {
    fail("C5 authority or terminal state changed");
  }
  if (c6.precision !== 192 || c6.status !== "not_given" ||
      c6.reason !== "PRECI" || c6.materialization !== "not_given(PRECI)" ||
      c6.matchedFlagZero !== true || c6.exactUnitsPublished !== false ||
      c6.correspondenceComplete !== true || c6.publicComplete !== false ||
      c6.ancestry?.acceptedRetryOwnerSha256 !== ACCEPTED_SHA256 ||
      c6.ancestry?.c5OwnerSha256 !== C5_SHA256 ||
      c6.ancestry?.pristineW0Sha256 !== PRISTINE_W0_SHA256 ||
      c6.ancestry?.preparedAuthoritySha256 !== PREPARED_AUTHORITY_SHA256 ||
      c6.ancestry?.sourceSha256 !== C6_SOURCE_SHA256) {
    fail("C6 PRECI authority changed");
  }
  equal(c6.state, [3, 15, -185, 0, 69863, 0, 0, 1], "C6 state");
  equal(c6.unitTransformShape, [9, 2], "compact unit transform shape");
  const transform = integers(c6.unitTransform, "compact unit transform", 18);
  equal(c6.archimedeanUnitShape, [3, 2], "compact log shape");
  const compactLogs = integers(c6.archimedeanUnits, "compact logs", 42);
  const regulator = integers(c6.regulator, "regulator enclosure", 3);
  equal(c5.u, transform, "C5/C6 compact transform");
  equal(c5.a, compactLogs, "C5/C6 compact logs");
  equal(c5.regulator, regulator, "C5/C6 regulator");
  return { compactLogs, regulator, transform };
}

function validateClosure(boundary) {
  const input = plain(boundary, "terminal-closure boundary");
  const closure = structuredClone(plain(input.closure, "terminal closure"));
  const authority = plain(input.authority, "terminal-closure authority");
  if (authority.ownerSha256 !== TERMINAL_CLOSURE_OWNER_SHA256) {
    fail("wrong immutable terminal-closure owner");
  }
  if (closure.schema !== TERMINAL_CLOSURE_SCHEMA || closure.status !== "closed") {
    fail("terminal closure schema or status changed");
  }
  validateField(closure.field, "terminal closure");
  equal(closure.dimensions, {
    degree: 4,
    factorBaseSize: 143,
    kernelRank: 9,
    places: 3,
    relationCount: 152,
  }, "terminal closure dimensions");
  const ancestry = plain(closure.ancestry, "terminal closure ancestry");
  const expectedAncestry = {
    acceptedRetryOwnerSha256: ACCEPTED_SHA256,
    c5OwnerSha256: C5_SHA256,
    c6OwnerSha256: C6_SHA256,
    preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
    pristineW0Sha256: PRISTINE_W0_SHA256,
  };
  for (const [name, expected] of Object.entries(expectedAncestry)) {
    if (ancestry[name] !== expected) fail(`terminal closure ancestry ${name} changed`);
  }
  digest(ancestry.sourceSha256, "terminal closure source digest");
  equal(Object.keys(ancestry).sort(),
    [...Object.keys(expectedAncestry), "sourceSha256"].sort(),
    "terminal closure ancestry fields");
  equal(plain(closure.assumptions, "terminal closure assumptions"), {
    c6Materialization: "not_given(PRECI)",
    pari2174Correspondence: true,
    publicCompletion: false,
    upstreamBoundsAssumed: true,
  }, "terminal closure assumptions");
  const relation = plain(closure.relationClosure, "relation closure");
  equal(relation.transformShape, [152, 9], "relation transform shape");
  equal(relation.rightInverseShape, [152, 143], "right inverse shape");
  const transform = integers(relation.transform, "relation transform", 152 * 9);
  const rightInverse = integers(
    relation.rightInverse, "relation right inverse", 152 * 143);
  const permutation = integers(
    relation.terminalPermutation, "terminal permutation", 143);
  cellsDigest(relation.transformSha256, transform, "relation transform digest");
  cellsDigest(relation.rightInverseSha256, rightInverse,
    "relation right inverse digest");
  if (relation.relationTimesTransformZero !== true ||
      relation.relationTimesRightInverseIdentity !== true) {
    fail("terminal relation closure is incomplete");
  }
  const exact = plain(closure.exactRelations, "exact relations");
  equal(exact.relationRecordsShape, [143, 152], "relation records shape");
  equal(exact.principalGeneratorsShape, [4, 152], "principal generators shape");
  equal(exact.factorBaseIdealsShape, [4, 4, 143], "factor-base ideals shape");
  const relationRecords = integers(
    exact.relationRecords, "relation records", 143 * 152);
  const principalGenerators = integers(
    exact.principalGenerators, "principal generators", 4 * 152);
  const factorBaseIdeals = integers(
    exact.factorBaseIdeals, "factor-base ideals", 4 * 4 * 143);
  const factorBaseNorms = integers(exact.factorBaseNorms, "factor-base norms", 143);
  const relationNorms = integers(exact.relationNorms, "relation norms", 152);
  cellsDigest(exact.relationRecordsSha256, relationRecords,
    "relation records digest");
  cellsDigest(exact.principalGeneratorsSha256, principalGenerators,
    "principal generators digest");
  cellsDigest(exact.factorBaseIdealsSha256, factorBaseIdeals,
    "factor-base ideals digest");
  const replayFlags = plain(closure.replay, "closure replay flags");
  for (const name of [
    "w0RelationsExact",
    "packedLogsSourceOrderExact",
    "principalIdealsExact",
    "principalNormsExact",
    "all152RelationsReplayed",
  ]) {
    if (replayFlags[name] !== true) fail(`terminal closure lacks ${name}`);
  }
  array(replayFlags.packedLogCheckpointSha256,
    "packed-log checkpoint digests", 3).forEach((value, index) =>
    digest(value, `packed-log checkpoint digest ${index}`));
  equal(replayFlags.hnfStates, [
    [0, 7, 143, 0, 7, 14, 0, 150, 0],
    [0, 8, 143, 0, 8, 0, 0, 151, 0],
    [0, 9, 143, 0, 9, 0, 0, 152, 0],
  ], "HNF replay states");
  if (authority.replaySchema !== CLOSURE_REPLAY_SCHEMA ||
      typeof authority.replay !== "function") {
    fail("terminal closure lacks detached replay authority");
  }
  const closureSha256 = neutral.sha256Canonical(closure);
  if (digest(authority.closureSha256, "terminal closure authority") !==
      closureSha256) {
    fail("terminal closure lacks out-of-band identity");
  }
  const mathematicalAuthoritySha256 = digest(
    authority.mathematicalAuthoritySha256,
    "terminal closure mathematical authority",
  );
  let replay;
  try {
    replay = authority.replay(structuredClone(closure));
  } catch (error) {
    throw new Panel8C7CompositionFailure("terminal closure cold replay rejected", {
      cause: error,
    });
  }
  if (replay && typeof replay.then === "function") {
    fail("terminal closure replay must be synchronous");
  }
  const receipt = plain(replay, "terminal closure replay receipt");
  if (receipt.schema !== CLOSURE_REPLAY_SCHEMA || receipt.fieldId !== FIELD_ID ||
      receipt.closureSha256 !== closureSha256 ||
      receipt.mathematicalAuthoritySha256 !== mathematicalAuthoritySha256 ||
      receipt.accepted !== true || receipt.all152RelationsReplayed !== true ||
      receipt.relationTimesTransformZero !== true ||
      receipt.relationTimesRightInverseIdentity !== true ||
      receipt.packedLogsSourceOrderExact !== true ||
      receipt.principalIdealsExact !== true || receipt.principalNormsExact !== true ||
      receipt.correspondenceComplete !== true || receipt.publicComplete !== false) {
    fail("terminal closure cold replay receipt is incomplete");
  }
  return {
    factorBaseIdeals,
    factorBaseNorms,
    mathematicalAuthoritySha256,
    permutation,
    principalGenerators,
    relationNorms,
    relationRecords,
    rightInverse,
    transform,
  };
}

function completePayload(evidence, closure, publicationReplaySchema) {
  if (typeof publicationReplaySchema !== "string" ||
      publicationReplaySchema.length === 0) {
    fail("publication replay schema is absent");
  }
  const storage = [
    owner("class-presentation", "class-presentation", []),
    owner("compact-archimedean-units", "compact-archimedean-units",
      evidence.compactLogs),
    owner("compact-unit-transform", "compact-unit-transform", evidence.transform),
    owner("factor-base-ideals", "factor-base-ideals", closure.factorBaseIdeals),
    owner("factor-base-norms", "factor-base-norms", closure.factorBaseNorms),
    owner("honesty-evidence", "honesty-evidence", ["152", "143", "9", "0"]),
    owner("principal-generators", "principal-relation-generators",
      closure.principalGenerators),
    owner("regulator-enclosure", "regulator-enclosure", evidence.regulator),
    owner("relation-kernel-transform", "exact-unit-relation-transform",
      closure.transform),
    owner("relation-norms", "relation-norms", closure.relationNorms),
    owner("relation-records", "raw-relation-records", closure.relationRecords),
    owner("relation-right-inverse", "relation-right-inverse", closure.rightInverse),
    owner("terminal-permutation", "relation-terminal-permutation",
      closure.permutation),
    // The field has a real embedding, so every root of unity is real; the only
    // real roots of unity are +/-1. In the ascending power basis, -1 is below.
    owner("torsion-generator", "torsion-generator", ["-1", "0", "0", "0"]),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: {
      classNumber: "1",
      generatorCount: "0",
      invariantFactors: [],
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
      sourcePolicy: "PARI-2.17.4-buchall-panel8-PRECI-flag-zero",
    },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        {
          disposition: "assumed",
          id: "factor-base-generation",
          statement: "PARI's factor-base generation and selection are assumed correct",
        },
        {
          disposition: "assumed",
          id: "grh-bounds",
          statement: "GRH and PARI's class-group relation bounds are assumed correct",
        },
        {
          disposition: "assumed",
          id: "pari-correspondence",
          statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful",
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
        precisionBits: "192",
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

function preparePanel8C7Result(inputs, options = {}) {
  const source = plain(inputs, "panel8 C7 inputs");
  const evidence = validateInputs(source.accepted, source.c5, source.c6);
  const closure = validateClosure(source.terminalClosure);
  const payload = completePayload(
    evidence, closure, options.publicationReplaySchema);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  return frozen({
    correspondenceComplete: true,
    fieldId: FIELD_ID,
    mathematicalAuthoritySha256: closure.mathematicalAuthoritySha256,
    publicComplete: false,
    schema: COMPOSITION_SCHEMA,
    sealedEnvelopeHex: raw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority",
  });
}

function publishPreparedPanel8C7Result(prepared, authority, publisher = undefined) {
  const input = plain(prepared, "prepared panel8 C7 result");
  if (input.schema !== COMPOSITION_SCHEMA ||
      input.status !== "ready-for-out-of-band-publication-authority" ||
      input.correspondenceComplete !== true || input.publicComplete !== false ||
      typeof input.sealedEnvelopeHex !== "string" ||
      !/^(?:[0-9a-f]{2})+$/.test(input.sealedEnvelopeHex)) {
    fail("panel8 C7 result is not ready for publication");
  }
  const raw = Buffer.from(input.sealedEnvelopeHex, "hex");
  if (digest(input.sealedEnvelopeSha256, "prepared C7 envelope") !==
      neutral.sha256Bytes(raw)) {
    fail("prepared C7 envelope digest changed");
  }
  if (publisher === undefined) {
    return neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  }
  if (!(publisher instanceof neutral.ClassUnitCorrespondencePublisher)) {
    fail("publication target is not transactional");
  }
  return publisher.publish(raw, authority);
}

module.exports = {
  ACCEPTED_SHA256,
  C5_SHA256,
  C6_SHA256,
  CLOSURE_REPLAY_SCHEMA,
  COMPOSITION_SCHEMA,
  FIELD_ID,
  PARI_SOURCE_SHA256,
  POLYNOMIAL,
  Panel8C7CompositionFailure,
  TERMINAL_CLOSURE_SCHEMA,
  TERMINAL_CLOSURE_OWNER_SHA256,
  preparePanel8C7Result,
  publishPreparedPanel8C7Result,
};
