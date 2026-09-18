"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const neutral = require("./class_unit_correspondence_result.cjs");

const COMPOSITION_SCHEMA =
  "sagejs.pari-class-group/row13-c7-result-composition-v1";
const PUBLICATION_REPLAY_SCHEMA =
  "sagejs.pari-class-group/row13-c7-publication-replay-v1";
const FIELD_ID =
  "generated-sha256-353468f1887e96f5a2f66e3121564636ed8cdbd75bde6571609627bbe8586e33";
const POLYNOMIAL = ["-20000000010", "-20000000006", "0", "0", "1"];
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const ROWS = 999;
const RELATIONS = 1006;
const hash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function storageOwner(name, role, entries) {
  const values = entries.map(String);
  return {
    capacity: String(values.length),
    encoding: "canonical-decimal-integer",
    entries: values,
    logicalLength: String(values.length),
    name,
    role,
  };
}

function composeFactored(rawToKernel, compactTransform) {
  assert.equal(rawToKernel.length, 7 * RELATIONS);
  assert.equal(compactTransform.length, 14);
  const output = [];
  for (let unit = 0; unit < 2; unit += 1) {
    for (let relation = 0; relation < RELATIONS; relation += 1) {
      let sum = 0n;
      for (let column = 0; column < 7; column += 1) {
        sum +=
          BigInt(rawToKernel[column * RELATIONS + relation]) *
          BigInt(compactTransform[unit * 7 + column]);
      }
      output.push(String(sum));
    }
  }
  return output;
}

function prepareRow13C7Result(inputs) {
  const { accepted, post1006, classOwner, unitOwner } = structuredClone(inputs);
  assert.equal(
    accepted.schema,
    "sagejs.pari-class-group/row13-accepted-relation-owner-v1",
  );
  assert.equal(
    post1006.schema,
    "sagejs.pari-class-group/row13-post1006-terminal-v1",
  );
  assert.equal(
    classOwner.schema,
    "sagejs.pari-class-group/row13-terminal-class-owner-v1",
  );
  assert.equal(
    unitOwner.schema,
    "sagejs.pari-class-group/row13-rank2-c5-c6-v1",
  );
  const acceptedSha256 = hash(accepted);
  assert.equal(post1006.acceptedOwnerSha256, acceptedSha256);
  assert.equal(classOwner.ancestry.acceptedOwnerSha256, acceptedSha256);
  assert.equal(unitOwner.ancestry.acceptedOwnerSha256, acceptedSha256);
  assert.deepEqual(post1006.invariants, ["2"]);
  assert.equal(post1006.classNumber, "2");
  assert.deepEqual(classOwner.classWitness.classGroup, {
    classNumber: "2",
    invariants: ["2"],
  });
  assert.equal(unitOwner.status, "not_given");
  assert.equal(unitOwner.reason, "LARGE");
  assert.equal(unitOwner.precision, 256);

  const factored = composeFactored(
    classOwner.rawToUnitKernel,
    unitOwner.compact.unitTransform,
  );
  const records = accepted.final.records;
  for (let unit = 0; unit < 2; unit += 1) {
    const coefficients = factored.slice(
      unit * RELATIONS,
      (unit + 1) * RELATIONS,
    );
    assert(coefficients.some((value) => value !== "0"));
    for (let row = 0; row < ROWS; row += 1) {
      let sum = 0n;
      for (let relation = 0; relation < RELATIONS; relation += 1) {
        sum +=
          BigInt(records[relation * ROWS + row]) *
          BigInt(coefficients[relation]);
      }
      assert.equal(sum, 0n, "factored unit is not principal ideal one");
    }
  }
  const signs = classOwner.principalNormSigns.map((entry) =>
    entry === "-1" ? 1n : 0n,
  );
  assert.equal(signs.length, RELATIONS);
  const unitNorms = Array.from({ length: 2 }, (_, unit) => {
    let parity = 0n;
    for (let relation = 0; relation < RELATIONS; relation += 1) {
      parity += signs[relation] * BigInt(factored[unit * RELATIONS + relation]);
    }
    return parity % 2n === 0n ? "1" : "-1";
  });
  const witness = classOwner.classWitness.witnesses[0];
  const orderCoefficients = Array(RELATIONS).fill("0");
  for (const term of witness.rawPrincipalProduct) {
    orderCoefficients[Number(term.rawRelationIndex)] = String(term.exponent);
  }
  assert.deepEqual(orderCoefficients, classOwner.rawToPresentation);

  const storage = [
    storageOwner(
      "class-generator-ideals",
      "class-generator-ideals",
      witness.idealHnf,
    ),
    storageOwner(
      "class-order-principal-coefficients",
      "exact-order-principal-witnesses",
      orderCoefficients,
    ),
    storageOwner("class-presentation", "class-presentation", ["2"]),
    storageOwner(
      "compact-archimedean-units",
      "compact-archimedean-units",
      unitOwner.compact.archimedeanUnits,
    ),
    storageOwner(
      "compact-getfu-candidate",
      "compact-getfu-candidate",
      unitOwner.compact.getfuCandidateA,
    ),
    storageOwner(
      "compact-getfu-factor",
      "compact-getfu-factor",
      unitOwner.compact.getfuFactor,
    ),
    storageOwner(
      "compact-unit-lattice",
      "compact-unit-lattice",
      unitOwner.compact.relationLattice,
    ),
    storageOwner(
      "compact-unit-transform",
      "compact-unit-transform",
      unitOwner.compact.unitTransform,
    ),
    storageOwner(
      "factor-base-ideals",
      "factor-base-ideals",
      classOwner.factorBase.packetIdeals,
    ),
    storageOwner(
      "factor-base-norms",
      "factor-base-norms",
      classOwner.factorBase.packetNorms,
    ),
    storageOwner(
      "factor-map",
      "class-factor-map",
      classOwner.factorMap,
    ),
    storageOwner(
      "factored-unit-transform",
      "exact-unit-raw-provenance",
      factored,
    ),
    storageOwner(
      "honesty-evidence",
      "honesty-evidence",
      ["8305", "8305", "999", "624", "624", "999"],
    ),
    storageOwner(
      "principal-generators",
      "principal-relation-generators",
      accepted.final.generators,
    ),
    storageOwner(
      "raw-relation-logs",
      "raw-relation-logs",
      accepted.final.logs,
    ),
    storageOwner(
      "raw-relation-records",
      "raw-relation-records",
      accepted.final.records,
    ),
    storageOwner(
      "raw-to-presentation-transform",
      "class-presentation-transform",
      classOwner.rawToPresentation,
    ),
    storageOwner(
      "raw-to-unit-kernel-transform",
      "exact-unit-relation-transform",
      classOwner.rawToUnitKernel,
    ),
    storageOwner(
      "regulator-enclosure",
      "regulator-enclosure",
      post1006.regulator,
    ),
    storageOwner(
      "terminal-B",
      "terminal-dependent-reduction",
      accepted.final.b,
    ),
    storageOwner(
      "terminal-C",
      "terminal-archimedean-relations",
      accepted.final.c,
    ),
    storageOwner(
      "terminal-hnf-state",
      "terminal-hnf-state",
      accepted.final.hnfState,
    ),
    storageOwner(
      "terminal-permutation",
      "relation-terminal-permutation",
      accepted.final.perm,
    ),
    storageOwner(
      "terminal-relation-state",
      "terminal-relation-state",
      accepted.final.relationState,
    ),
    storageOwner("torsion-generator", "torsion-generator", ["-1", "0", "0", "0"]),
    storageOwner("unit-norms", "compact-unit-norms", unitNorms),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const payload = {
    classGroup: {
      classNumber: "2",
      generatorCount: "1",
      invariantFactors: ["2"],
      presentationOwner: "class-presentation",
    },
    field: {
      definingPolynomialAscending: POLYNOMIAL,
      degree: "4",
      id: FIELD_ID,
    },
    honesty: {
      evidenceOwner: "honesty-evidence",
      outcome: "equal-bound-source-skip",
      sourcePolicy: "PARI-2.17.4-buchall-KCZ2-equals-KCZ",
    },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        {
          disposition: "assumed",
          id: "factor-base-bounds",
          statement:
            "PARI's factor-base generation and relation bounds are assumed correct",
        },
        {
          disposition: "assumed",
          id: "grh-bounds",
          statement: "GRH and PARI's conditional class-group bounds are assumed",
        },
        {
          disposition: "assumed",
          id: "pari-correspondence",
          statement:
            "PARI 2.17.4's class-and-unit correspondence is assumed faithful",
        },
      ],
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: PARI_SOURCE_SHA256,
      pariVersion: "2.17.4",
      replaySchema: PUBLICATION_REPLAY_SCHEMA,
    },
    storage,
    terminal: {
      correspondence_complete: true,
      public_complete: false,
      status: "pari-correspondence-complete-internal",
    },
    unitGroup: {
      materialization: {
        precisionBits: "256",
        reason: "LARGE",
        tag: "not_given",
      },
      rank: "2",
      regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator",
      torsionOrder: "2",
    },
  };
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const componentOwnerSha256 = {
    accepted: acceptedSha256,
    post1006: neutral.sha256Canonical(post1006),
    classOwner: neutral.sha256Canonical(classOwner),
    unitOwner: neutral.sha256Canonical(unitOwner),
  };
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    componentOwnerSha256,
    factoredUnitTransformSha256: neutral.sha256Canonical(factored),
    invariantFactors: ["2"],
    unitNorms,
  });
  return Object.freeze({
    schema: COMPOSITION_SCHEMA,
    fieldId: FIELD_ID,
    componentOwnerSha256,
    mathematicalAuthoritySha256,
    correspondenceComplete: true,
    publicComplete: false,
    sealedEnvelopeHex: raw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority",
  });
}

module.exports = {
  COMPOSITION_SCHEMA,
  FIELD_ID,
  PUBLICATION_REPLAY_SCHEMA,
  prepareRow13C7Result,
};
