"use strict";

// Data-only C7 join for development-panel row 14.  Every input is admitted
// through a detached replay capability.  This module performs no filesystem or
// process work and does not manufacture authority from the JSON it consumes.

const neutral = require("./class_unit_correspondence_result.cjs");

const COMPOSITION_SCHEMA =
  "sagejs.pari-class-group/row14-c7-result-composition-v1";
const INPUT_REPLAY_SCHEMA =
  "sagejs.pari-class-group/row14-c7-input-replay-v1";
const PUBLICATION_REPLAY_SCHEMA =
  "sagejs.pari-class-group/row14-c7-publication-replay-v1";
const POST806_SCHEMA =
  "sagejs.pari-class-group/row14-post806-terminal-projection-v1";
const FIELD_ID =
  "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413";
const POLYNOMIAL = Object.freeze(["-200000002", "-200000002", "0", "0", "1"]);
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const ACCEPTED_OWNER_SHA256 =
  "9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65";
const METADATA_SHA256 =
  "cca3c14630fc91a407a052bbc7fb2799b5e95bce79f1948fc422ca39cda07684";
const UNIT_OWNER_SHA256 =
  "763a91e02ed0f3245d561ba38430930f09eedf8dfce943d27130f7cc579ac212";
const UNIT_RELATIONS_SHA256 =
  "ac3b40e1d95edee9b8af61f2689a32a937945ed43b2a6112ec97f0783497aef8";
const ROWS = 799;
const RELATIONS = 806;
const DEGREE = 4;
const KERNEL_COLUMNS = 7;
const PRESENTATION_COLUMNS = 3;
const UNIT_RANK = 2;
const PACKED_LOG_CELLS = 21;
const GENERATOR_IDEALS = Object.freeze([
  Object.freeze(["5099", "0", "0", "0", "1784", "1", "0", "0", "2435", "0",
    "1", "0", "3663", "0", "0", "1"]),
  Object.freeze(["334218769636951", "0", "0", "0", "58264613846794", "1", "0",
    "0", "132395815055232", "0", "1", "0", "140653091603643", "0", "0", "1"]),
]);
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

class Row14C7CompositionFailure extends Error {}
function fail(message) { throw new Row14C7CompositionFailure(message); }

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

function integer(value, name) {
  if ((typeof value !== "string" && typeof value !== "number" &&
       typeof value !== "bigint") || !INTEGER.test(String(value)) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) {
    fail(`${name} is not a canonical integer`);
  }
  return String(value);
}

function integers(value, name, length = undefined) {
  return array(value, name, length).map((entry, index) =>
    integer(entry, `${name}[${index}]`));
}

function digest(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${name} is not a SHA-256 digest`);
  }
  return value;
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

function storageOwner(name, role, entries) {
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

function openBoundary(input, label, expectedSha256 = undefined) {
  const boundary = plain(input, `${label} boundary`);
  const value = structuredClone(plain(boundary.owner, `${label} owner`));
  const authority = plain(boundary.authority, `${label} authority`);
  const ownerSha256 = digest(authority.ownerSha256, `${label} owner authority`);
  if (expectedSha256 !== undefined && ownerSha256 !== expectedSha256) {
    fail(`${label} owner identity changed`);
  }
  if (authority.replaySchema !== INPUT_REPLAY_SCHEMA ||
      typeof authority.replay !== "function") {
    fail(`${label} detached replay authority changed`);
  }
  let receipt;
  try { receipt = authority.replay(structuredClone(value)); }
  catch (error) {
    throw new Row14C7CompositionFailure(`${label} replay rejected`, { cause: error });
  }
  if (receipt && typeof receipt.then === "function") fail(`${label} replay must be synchronous`);
  receipt = plain(receipt, `${label} replay receipt`);
  if (receipt.schema !== INPUT_REPLAY_SCHEMA || receipt.accepted !== true ||
      receipt.ownerSha256 !== ownerSha256 || receipt.fieldId !== FIELD_ID ||
      !SHA256.test(receipt.evidenceSha256 || "")) {
    fail(`${label} replay receipt changed`);
  }
  return { owner: value, ownerSha256, receipt };
}

function validateAccepted(boundary) {
  const opened = openBoundary(boundary, "accepted relation", ACCEPTED_OWNER_SHA256);
  const value = opened.owner;
  if (value.schema !== "sagejs.pari-class-group/row14-accepted-relation-owner-v1" ||
      value.field?.degree !== DEGREE) fail("accepted relation owner changed");
  equal(value.field.polynomial, POLYNOMIAL, "accepted polynomial");
  if (value.ancestry?.factorMetadataSha256 !== METADATA_SHA256) {
    fail("accepted metadata ancestry changed");
  }
  equal(value.acceptanceBoundary, {
    rows: ROWS, hRows: 3, bColumns: 796, totalColumns: RELATIONS,
    places: 3, degree: DEGREE, previousAcceptanceColumns: 0, cacheChanged: true,
  }, "accepted boundary");
  const final = plain(value.final, "accepted final state");
  const records = integers(final.records, "raw relation records", ROWS * RELATIONS);
  const generators = integers(final.generators, "raw principal generators",
    DEGREE * RELATIONS);
  const logs = integers(final.logs, "raw relation logs", PACKED_LOG_CELLS * RELATIONS);
  const presentation = integers(final.h, "terminal presentation", 9);
  const B = integers(final.b, "terminal B", 3 * 796);
  const C = integers(final.c, "terminal C", PACKED_LOG_CELLS * RELATIONS);
  const permutation = integers(final.perm, "terminal permutation", ROWS);
  equal(integers(final.hnfState, "terminal HNF state", 9),
    ["3", "10", "796", "0", "7", "0", "0", "806", "0"],
    "terminal HNF state");
  equal(presentation, ["24", "0", "0", "4", "4", "0", "5", "3", "2"],
    "terminal presentation");
  equal(integers(final.relationState, "terminal relation state", 6),
    ["806", "8110", "0", "0", "806", "806"], "terminal relation state");
  return { ...opened, B, C, generators,
    hnfState: integers(final.hnfState, "retained HNF state", 9), logs, permutation,
    presentation, records,
    relationState: integers(final.relationState, "retained relation state", 6) };
}

function validatePost806(boundary) {
  const opened = openBoundary(boundary, "post-806 terminal");
  const value = opened.owner;
  if (value.schema !== POST806_SCHEMA || value.ownerSha256 !== ACCEPTED_OWNER_SHA256 ||
      value.metadataSha256 !== METADATA_SHA256 || value.status !== "0") {
    fail("post-806 owner identity changed");
  }
  equal(integers(value.invariants, "source invariant factors", 2), ["24", "8"],
    "source invariant factors");
  if (integer(value.classNumber, "class number") !== "192") fail("class number changed");
  const regulator = integers(value.regulator, "regulator", 3);
  const unitRelations = integers(value.unitRelations, "unit relation lattice", 14);
  if (digest(value.unitRelationsSha256, "unit relation digest") !==
      UNIT_RELATIONS_SHA256 || neutral.sha256Canonical(unitRelations) !==
      UNIT_RELATIONS_SHA256) fail("unit relation lattice changed");
  equal(integers(value.terminalState, "terminal state", 10),
    ["0", "0", "7", "0", "2", "806", "0", "0", "2", "0"],
    "terminal state");
  equal(value.completeness, { fullSmithTransform: false,
    idealGeneratorWitnesses: false, principalRelationWitnesses: false },
  "pre-join completeness");
  return { ...opened, regulator, unitRelations };
}

function validateFactorBase(value) {
  const factor = plain(value, "class factor-base projection");
  const ideals = integers(factor.packetIdeals, "factor-base ideals", 16 * ROWS);
  const norms = integers(factor.packetNorms, "factor-base norms", ROWS);
  const packetIds = integers(factor.packetIds, "factor-base packet ids", ROWS);
  const relationPrimes = integers(factor.relationPrimes, "factor-base primes", ROWS);
  const multiplicationTable = integers(factor.basisTable,
    "multiplication table", 64);
  return { ideals, multiplicationTable, norms, packetIds, relationPrimes };
}

function denseOrderWitness(witness, acceptedGenerators, label) {
  const entries = array(witness.rawPrincipalProduct, `${label} raw principal product`);
  const dense = Array(RELATIONS).fill("0");
  for (const [index, entryValue] of entries.entries()) {
    const entry = plain(entryValue, `${label} raw term ${index}`);
    const relation = Number(integer(entry.rawRelationIndex, `${label} raw index`));
    if (relation < 0 || relation >= RELATIONS || dense[relation] !== "0") {
      fail(`${label} raw relation index is invalid or repeated`);
    }
    const exponent = integer(entry.exponent, `${label} raw exponent`);
    if (exponent === "0") fail(`${label} raw exponent vanished`);
    const factors = array(entry.principalFactors, `${label} principal factors`, 1);
    const factor = plain(factors[0], `${label} principal factor`);
    equal(integers(factor.values, `${label} principal values`, DEGREE),
      acceptedGenerators.slice(DEGREE * relation, DEGREE * (relation + 1)),
    `${label} principal source`);
    if (integer(factor.denominator, `${label} denominator`) !== "1" ||
        integer(factor.exponent, `${label} factor exponent`) !== "1") {
      fail(`${label} principal factor representation changed`);
    }
    dense[relation] = exponent;
  }
  if (!dense.some(value => value !== "0")) fail(`${label} witness is empty`);
  return dense;
}

function validateClass(boundary, accepted) {
  const opened = openBoundary(boundary, "terminal class");
  const value = opened.owner;
  if (value.schema !== "sagejs.pari-class-group/row14-terminal-class-owner-v1" ||
      value.ancestry?.sourceSha256 !== METADATA_SHA256 ||
      value.ancestry?.terminalOwnerSha256 !== ACCEPTED_OWNER_SHA256 ||
      value.relationCollectionRerun !== false || value.frozenW0UsedAsInput !== false ||
      value.publicComplete !== false) fail("terminal class owner changed");
  const factorMap = integers(value.factorMap, "class factor map", ROWS * 3);
  const activeRows = integers(value.activeFactorRows, "active factor rows", 3);
  equal(activeRows, accepted.permutation.slice(0, 3).map(entry =>
    String(Number(entry) - 1)), "active factor rows");
  for (let basis = 0; basis < 3; basis += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const expected = String(row) === activeRows[basis] ? "1" : "0";
      if (factorMap[basis * ROWS + row] !== expected) fail("class factor map changed");
    }
  }
  const rawToPresentation = integers(value.rawToPresentation,
    "raw-to-presentation transform", RELATIONS * 3);
  const rawToUnitKernel = integers(value.rawToUnitKernel,
    "raw-to-unit-kernel transform", RELATIONS * KERNEL_COLUMNS);
  const ancestry = plain(value.columnAncestry, "column ancestry state");
  if (ancestry.backend !== "source-hnfspec-hnfadd-reverse-replay" ||
      ancestry.selectedColumns !== 10 || ancestry.kernelColumns !== 7 ||
      ancestry.classColumns !== 3 || ancestry.relationCollectionRerun !== false ||
      ancestry.frozenW0UsedAsInput !== false) fail("column ancestry state changed");
  const principal = plain(value.principalAuthentication, "principal authentication");
  if (principal.principalEquations !== RELATIONS ||
      principal.maximumRawExponent !== 10 || principal.nonzeroRelationEntries <= 0 ||
      principal.idealProducts <= 0) fail("principal relation replay changed");
  const classWitness = plain(value.classWitness, "class witness");
  if (classWitness.schema !==
      "sagejs.pari-class-group/row14-terminal-class-witness-v1" ||
      classWitness.field?.id !== FIELD_ID || classWitness.publicComplete !== false) {
    fail("class witness identity changed");
  }
  equal(classWitness.field.coefficients, POLYNOMIAL, "class witness polynomial");
  equal(classWitness.classGroup, { classNumber: "192", invariants: ["24", "8"] },
    "class witness group");
  const witnesses = array(classWitness.witnesses, "class witnesses", 2);
  const orders = ["24", "8"];
  const smithCoordinates = [["1", "0", "0"], ["-2", "-1", "-1"]];
  const presentationRelations = [["1", "0", "0"], ["0", "1", "-4"]];
  const ideals = [];
  const orderCoefficients = [];
  for (let index = 0; index < 2; index += 1) {
    const witness = plain(witnesses[index], `class witness ${index}`);
    if (integer(witness.order, `class witness ${index} order`) !== orders[index] ||
        Number(integer(witness.properMultiplesRejected,
          `class witness ${index} minimality`)) !== Number(orders[index]) - 1) {
      fail(`class witness ${index} order changed`);
    }
    const ideal = integers(witness.idealHnf, `class witness ${index} ideal`, 16);
    equal(ideal, GENERATOR_IDEALS[index], `class witness ${index} mapped ideal`);
    equal(integers(witness.smithQuotientCoordinates,
      `class witness ${index} Smith coordinates`, 3), smithCoordinates[index],
    `class witness ${index} Smith coordinates`);
    equal(integers(witness.presentationRelation,
      `class witness ${index} presentation relation`, 3), presentationRelations[index],
    `class witness ${index} presentation relation`);
    ideals.push(...ideal);
    const dense = denseOrderWitness(witness, accepted.generators,
      `class witness ${index}`);
    const expectedDense = Array.from({ length: RELATIONS }, (_, relation) => {
      let sum = 0n;
      for (let column = 0; column < PRESENTATION_COLUMNS; column += 1) {
        sum += BigInt(rawToPresentation[column * RELATIONS + relation]) *
          BigInt(presentationRelations[index][column]);
      }
      return String(sum);
    });
    equal(dense, expectedDense, `class witness ${index} raw principal coefficients`);
    orderCoefficients.push(...dense);
  }
  equal(integers(classWitness.proof?.smithMinorGcd === undefined ? [] :
    [classWitness.proof.smithMinorGcd], "Smith minor gcd", 1), ["8"],
  "Smith minor gcd");
  if (classWitness.proof?.rawRelations !== RELATIONS ||
      classWitness.proof?.factorBaseSize !== ROWS ||
      classWitness.proof?.independenceChecks !== 192 ||
      classWitness.proof?.frozenW0UsedAsInput !== false) {
    fail("class witness replay proof changed");
  }
  // Independently replay both source-operation transforms against the raw R.
  for (let column = 0; column < KERNEL_COLUMNS; column += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      let sum = 0n;
      for (let relation = 0; relation < RELATIONS; relation += 1) {
        sum += BigInt(accepted.records[relation * ROWS + row]) *
          BigInt(rawToUnitKernel[column * RELATIONS + relation]);
      }
      if (sum !== 0n) fail("raw-to-unit transform is not an exact kernel");
    }
  }
  for (let column = 0; column < PRESENTATION_COLUMNS; column += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      let source = 0n; let target = 0n;
      for (let relation = 0; relation < RELATIONS; relation += 1) {
        source += BigInt(accepted.records[relation * ROWS + row]) *
          BigInt(rawToPresentation[column * RELATIONS + relation]);
      }
      for (let basis = 0; basis < 3; basis += 1) {
        target += BigInt(factorMap[basis * ROWS + row]) *
          BigInt(accepted.presentation[column * 3 + basis]);
      }
      if (source !== target) fail("raw-to-presentation transform failed exact replay");
    }
  }
  return { ...opened, factorBase: validateFactorBase(value.factorBase), factorMap,
    ideals, orderCoefficients, rawToPresentation, rawToUnitKernel };
}

function validateUnit(boundary, post806) {
  const opened = openBoundary(boundary, "rank-two C5/C6", UNIT_OWNER_SHA256);
  const value = opened.owner;
  if (value.schema !== "sagejs.pari-class-group/row14-rank2-c5-c6-v1" ||
      value.field?.degree !== DEGREE || value.field?.unitRank !== UNIT_RANK ||
      value.precision !== 192 || value.status !== "not_given" ||
      value.reason !== "LARGE" || value.materialization !== "not_given(LARGE)" ||
      value.matchedFlagZero !== true || value.exactUnitsPublished !== false ||
      value.compactFactoredUnitsRetained !== false ||
      value.correspondenceComplete !== false) fail("authentic LARGE owner changed");
  equal(value.field.polynomial, POLYNOMIAL, "unit owner polynomial");
  equal(integers(value.c6State, "C6 state", 8),
    ["2", "38", "0", "0", "0", "0", "0", "1"], "C6 state");
  if (value.ancestry?.acceptedOwnerSha256 !== ACCEPTED_OWNER_SHA256 ||
      value.ancestry?.metadataSha256 !== METADATA_SHA256 ||
      value.provenance?.frozenW0RuntimeInput !== false ||
      value.provenance?.postcomputeDifferentialOnly !== true) {
    fail("unit owner ancestry changed");
  }
  const compact = plain(value.compact, "compact unit owner");
  equal(compact.unitTransformShape, [7, 2], "compact transform shape");
  equal(compact.relationLatticeShape, [7, 2], "unit lattice shape");
  equal(compact.archimedeanUnitShape, [3, 2], "archimedean unit shape");
  equal(compact.getfuFactorShape, [2, 2], "getfu factor shape");
  const transform = integers(compact.unitTransform, "compact unit transform", 14);
  const lattice = integers(compact.relationLattice, "compact unit lattice", 14);
  const regulator = integers(compact.regulator, "unit regulator", 3);
  equal(lattice, post806.unitRelations, "post-806/unit lattice");
  equal(regulator, post806.regulator, "post-806/unit regulator");
  return { ...opened, archimedeanUnits: integers(compact.archimedeanUnits,
    "compact archimedean units", 42), getfuCandidateA: integers(compact.getfuCandidateA,
    "getfu candidate A", 42), getfuFactor: integers(compact.getfuFactor,
    "getfu factor", 4), lattice, regulator, transform };
}

function composeFactored(rawToKernel, compactTransform) {
  const output = [];
  for (let unit = 0; unit < UNIT_RANK; unit += 1) {
    for (let relation = 0; relation < RELATIONS; relation += 1) {
      let sum = 0n;
      for (let column = 0; column < KERNEL_COLUMNS; column += 1) {
        sum += BigInt(rawToKernel[column * RELATIONS + relation]) *
          BigInt(compactTransform[unit * KERNEL_COLUMNS + column]);
      }
      output.push(String(sum));
    }
  }
  return output;
}

function determinant4(matrix) {
  const value = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => BigInt(matrix[4 * row + column])));
  let sign = 1n; let denominator = 1n;
  for (let pivotIndex = 0; pivotIndex < 3; pivotIndex += 1) {
    if (value[pivotIndex][pivotIndex] === 0n) {
      const swap = value.findIndex((row, index) =>
        index > pivotIndex && row[pivotIndex] !== 0n);
      if (swap <= pivotIndex) fail("principal generator multiplication is singular");
      [value[pivotIndex], value[swap]] = [value[swap], value[pivotIndex]];
      sign = -sign;
    }
    const pivot = value[pivotIndex][pivotIndex];
    for (let row = pivotIndex + 1; row < 4; row += 1) {
      for (let column = pivotIndex + 1; column < 4; column += 1) {
        const numerator = value[row][column] * pivot -
          value[row][pivotIndex] * value[pivotIndex][column];
        if (numerator % denominator !== 0n) fail("nonexact principal norm division");
        value[row][column] = numerator / denominator;
      }
    }
    denominator = pivot;
  }
  return sign * value[3][3];
}

function exactUnitNormSigns(generators, factored, table) {
  const signs = [];
  for (let relation = 0; relation < RELATIONS; relation += 1) {
    const element = generators.slice(4 * relation, 4 * relation + 4).map(BigInt);
    const multiplication = Array.from({ length: 16 }, (_, entry) => {
      let value = 0n;
      for (let basis = 0; basis < 4; basis += 1) {
        value += element[basis] * BigInt(table[16 * basis + entry]);
      }
      return value;
    });
    const norm = determinant4(multiplication);
    if (norm === 0n) fail("principal generator has zero norm");
    signs.push(norm < 0n ? 1n : 0n);
  }
  return Array.from({ length: 2 }, (_, unit) => {
    let parity = 0n;
    for (let relation = 0; relation < RELATIONS; relation += 1) {
      parity += signs[relation] * BigInt(factored[unit * RELATIONS + relation]);
    }
    return parity % 2n === 0n ? "1" : "-1";
  });
}

function joinEvidence(inputs) {
  const accepted = validateAccepted(inputs.accepted);
  const post806 = validatePost806(inputs.post806);
  const klass = validateClass(inputs.classOwner, accepted);
  const unit = validateUnit(inputs.unitOwner, post806);
  const factored = composeFactored(klass.rawToUnitKernel, unit.transform);
  for (let unitColumn = 0; unitColumn < UNIT_RANK; unitColumn += 1) {
    if (!factored.slice(unitColumn * RELATIONS, (unitColumn + 1) * RELATIONS)
      .some(value => value !== "0")) fail("factored unit provenance is empty");
    for (let row = 0; row < ROWS; row += 1) {
      let sum = 0n;
      for (let relation = 0; relation < RELATIONS; relation += 1) {
        sum += BigInt(accepted.records[relation * ROWS + row]) *
          BigInt(factored[unitColumn * RELATIONS + relation]);
      }
      if (sum !== 0n) fail("factored unit does not generate principal ideal one");
    }
  }
  const unitNorms = exactUnitNormSigns(accepted.generators, factored,
    klass.factorBase.multiplicationTable);
  return { accepted, post806, klass, unit, factored, unitNorms };
}

function completePayload(evidence, replaySchema) {
  if (typeof replaySchema !== "string" || replaySchema.length === 0) {
    fail("publication replay schema is absent");
  }
  const { accepted, post806, klass, unit } = evidence;
  const storage = [
    storageOwner("class-generator-ideals", "class-generator-ideals", klass.ideals),
    storageOwner("class-order-principal-coefficients",
      "exact-order-principal-witnesses", klass.orderCoefficients),
    storageOwner("class-presentation", "class-presentation", accepted.presentation),
    storageOwner("class-source-invariants", "source-order-invariant-factors",
      ["24", "8"]),
    storageOwner("compact-archimedean-units", "compact-archimedean-units",
      unit.archimedeanUnits),
    storageOwner("compact-getfu-candidate", "compact-getfu-candidate",
      unit.getfuCandidateA),
    storageOwner("compact-getfu-factor", "compact-getfu-factor", unit.getfuFactor),
    storageOwner("compact-unit-lattice", "compact-unit-lattice", unit.lattice),
    storageOwner("compact-unit-transform", "compact-unit-transform", unit.transform),
    storageOwner("factor-base-ideals", "factor-base-ideals", klass.factorBase.ideals),
    storageOwner("factor-base-norms", "factor-base-norms", klass.factorBase.norms),
    storageOwner("factor-base-packet-ids", "factor-base-packet-ids",
      klass.factorBase.packetIds),
    storageOwner("factor-base-primes", "factor-base-primes",
      klass.factorBase.relationPrimes),
    storageOwner("factor-map", "class-factor-map", klass.factorMap),
    storageOwner("factored-unit-transform", "exact-unit-raw-provenance",
      evidence.factored),
    storageOwner("field-multiplication-table", "integral-basis-multiplication-table",
      klass.factorBase.multiplicationTable),
    storageOwner("honesty-evidence", "honesty-evidence",
      ["5978", "5978", "799", "487", "487", "799"]),
    storageOwner("principal-generators", "principal-relation-generators",
      accepted.generators),
    storageOwner("raw-relation-logs", "raw-relation-logs", accepted.logs),
    storageOwner("raw-relation-records", "raw-relation-records", accepted.records),
    storageOwner("raw-to-presentation-transform", "class-presentation-transform",
      klass.rawToPresentation),
    storageOwner("raw-to-unit-kernel-transform", "exact-unit-relation-transform",
      klass.rawToUnitKernel),
    storageOwner("regulator-enclosure", "regulator-enclosure", post806.regulator),
    storageOwner("terminal-B", "terminal-dependent-reduction", accepted.B),
    storageOwner("terminal-C", "terminal-archimedean-relations", accepted.C),
    storageOwner("terminal-hnf-state", "terminal-hnf-state", accepted.hnfState),
    storageOwner("terminal-permutation", "relation-terminal-permutation",
      accepted.permutation),
    storageOwner("terminal-relation-state", "terminal-relation-state",
      accepted.relationState),
    storageOwner("torsion-generator", "torsion-generator", ["-1", "0", "0", "0"]),
    storageOwner("unit-norms", "compact-unit-norms", evidence.unitNorms),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: { classNumber: "192", generatorCount: "2",
      invariantFactors: ["8", "24"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: [...POLYNOMIAL], degree: "4", id: FIELD_ID },
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
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4", replaySchema,
    },
    storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { precisionBits: "192", reason: "LARGE",
      tag: "not_given" }, rank: "2", regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}

function prepareRow14C7Result(inputs, options = {}) {
  const source = plain(inputs, "row14 C7 inputs");
  const evidence = joinEvidence(source);
  const replaySchema = options.publicationReplaySchema || PUBLICATION_REPLAY_SCHEMA;
  const payload = completePayload(evidence, replaySchema);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const componentOwnerSha256 = {
    accepted: evidence.accepted.ownerSha256, classOwner: evidence.klass.ownerSha256,
    post806: evidence.post806.ownerSha256, unitOwner: evidence.unit.ownerSha256,
  };
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    componentOwnerSha256,
    factoredUnitTransformSha256: neutral.sha256Canonical(evidence.factored),
    normalizedInvariants: ["8", "24"], sourceInvariants: ["24", "8"],
    unitNorms: evidence.unitNorms,
  });
  return frozen({
    componentOwnerSha256, correspondenceComplete: true, fieldId: FIELD_ID,
    mathematicalAuthoritySha256, publicComplete: false, schema: COMPOSITION_SCHEMA,
    sealedEnvelopeHex: raw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority",
  });
}

function publishPreparedRow14C7Result(prepared, authority, publisher = undefined) {
  const input = plain(prepared, "prepared row14 C7 result");
  if (input.schema !== COMPOSITION_SCHEMA ||
      input.status !== "ready-for-out-of-band-publication-authority" ||
      input.correspondenceComplete !== true || input.publicComplete !== false ||
      typeof input.sealedEnvelopeHex !== "string" ||
      !/^(?:[0-9a-f]{2})+$/.test(input.sealedEnvelopeHex)) {
    fail("row14 C7 result is not ready for publication");
  }
  const raw = Buffer.from(input.sealedEnvelopeHex, "hex");
  if (input.sealedEnvelopeSha256 !== neutral.sha256Bytes(raw)) {
    fail("prepared row14 C7 envelope digest changed");
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
  ACCEPTED_OWNER_SHA256, COMPOSITION_SCHEMA, FIELD_ID, INPUT_REPLAY_SCHEMA,
  METADATA_SHA256, PARI_SOURCE_SHA256, POLYNOMIAL, POST806_SCHEMA,
  PUBLICATION_REPLAY_SCHEMA, Row14C7CompositionFailure, UNIT_OWNER_SHA256,
  UNIT_RELATIONS_SHA256, joinEvidence, prepareRow14C7Result,
  publishPreparedRow14C7Result,
};
