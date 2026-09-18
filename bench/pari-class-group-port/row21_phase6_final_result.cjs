"use strict";

// Immutable, capability-backed row-21 result over the resident Phase-6 root.
// The native clock ends in row21_phase6_unit_host before any projection,
// witness construction, canonicalization, replay, or publication happens.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const neutral = require("./class_unit_correspondence_result.cjs");
const unitHost = require("./row21_phase6_unit_host.cjs");

const FIELD_ID = "5.3.1009349859375.3";
const PREPARED_AUTHORITY =
  "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const REPLAY_SCHEMA =
  "sagejs.pari-class-group/row21-phase6-resident-result-replay-v1";
const RESULT_SCHEMA =
  "sagejs.pari-class-group/row21-phase6-resident-result-v1";
const DEGREE = 5;
const ROWS = 24;
const COLUMNS = 32;

class Row21Phase6ResultFailure extends Error {}
function fail(message) { throw new Row21Phase6ResultFailure(message); }

const RESIDENTS = new WeakSet();
const CANDIDATES = new WeakMap();
const CAPABILITIES = new WeakMap();

function integers(value, length, name) {
  if (!Array.isArray(value) || value.length !== length)
    fail(`${name} has the wrong length`);
  return value.map((entry, index) => {
    const text = String(entry);
    if (!/^(0|-?[1-9][0-9]*)$/.test(text))
      fail(`${name}[${index}] is not a canonical integer`);
    return text;
  });
}
function bigints(value, length, name) {
  return integers(value, length, name).map(BigInt);
}
function view(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}
function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function frozen(value) {
  if (Array.isArray(value)) value.forEach(frozen);
  else if (value && typeof value === "object" && !Buffer.isBuffer(value))
    Object.values(value).forEach(frozen);
  return Object.freeze(value);
}
function same(left, right) {
  return neutral.canonical(left).equals(neutral.canonical(right));
}
function floorDiv(left, positiveRight) {
  assert(positiveRight > 0n);
  let quotient = left / positiveRight;
  if (left < 0n && left % positiveRight !== 0n) quotient -= 1n;
  return quotient;
}
function extendedGcd(left, right) {
  let oldR = left < 0n ? -left : left;
  let remainder = right < 0n ? -right : right;
  let oldU = 1n, u = 0n, oldV = 0n, v = 1n;
  while (remainder !== 0n) {
    const quotient = oldR / remainder;
    [oldR, remainder] = [remainder, oldR - quotient * remainder];
    [oldU, u] = [u, oldU - quotient * u];
    [oldV, v] = [v, oldV - quotient * v];
  }
  return [left < 0n ? -oldU : oldU, right < 0n ? -oldV : oldV, oldR];
}
function addColumns(matrix, first, second, a, b, c, d) {
  if (first === second) {
    for (const row of matrix) row[first] *= a;
    return;
  }
  for (const row of matrix) {
    const left = row[first], right = row[second];
    row[first] = a * left + b * right;
    row[second] = c * left + d * right;
  }
}
function determinant(entries, size) {
  if (entries.length !== size * size) fail("determinant shape changed");
  if (size === 0) return 1n;
  const work = Array.from({ length: size }, (_, row) =>
    entries.slice(row * size, (row + 1) * size));
  let previous = 1n, sign = 1n;
  for (let k = 0; k < size - 1; k += 1) {
    let pivotRow = k;
    while (pivotRow < size && work[pivotRow][k] === 0n) pivotRow += 1;
    if (pivotRow === size) return 0n;
    if (pivotRow !== k) {
      [work[pivotRow], work[k]] = [work[k], work[pivotRow]];
      sign = -sign;
    }
    const pivot = work[k][k];
    for (let row = k + 1; row < size; row += 1)
      for (let column = k + 1; column < size; column += 1) {
        const numerator = work[row][column] * pivot -
          work[row][k] * work[k][column];
        if (numerator % previous !== 0n) fail("Bareiss division was not exact");
        work[row][column] = numerator / previous;
      }
    previous = pivot;
  }
  return sign * work[size - 1][size - 1];
}
function multiplyMatrices(left, rows, inner, right, columns) {
  if (left.length !== rows * inner || right.length !== inner * columns)
    fail("matrix multiplication shape changed");
  const output = Array(rows * columns).fill(0n);
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1)
      for (let k = 0; k < inner; k += 1)
        output[row * columns + column] +=
          left[row * inner + k] * right[k * columns + column];
  return output;
}
function identity(size) {
  return Array.from({ length: size * size }, (_, index) =>
    index % (size + 1) === 0 ? 1n : 0n);
}

function columnHnfWitness(columnMajorEntries) {
  const entries = bigints(columnMajorEntries, ROWS * COLUMNS, "relation matrix");
  const original = Array.from({ length: ROWS * COLUMNS }, (_, index) => {
    const row = Math.floor(index / COLUMNS), column = index % COLUMNS;
    return entries[column * ROWS + row];
  });
  const work = Array.from({ length: ROWS }, (_, row) =>
    original.slice(row * COLUMNS, (row + 1) * COLUMNS));
  const transform = Array.from({ length: COLUMNS }, (_, row) =>
    Array.from({ length: COLUMNS }, (_, column) => row === column ? 1n : 0n));
  let pivotColumn = COLUMNS;
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (pivotColumn === 0) break;
    pivotColumn -= 1;
    for (let column = pivotColumn - 1; column >= 0; column -= 1) {
      if (work[row][column] === 0n) continue;
      const [u, v, divisor] = extendedGcd(
        work[row][pivotColumn], work[row][column]);
      if (divisor === 0n) fail("zero HNF divisor");
      const r = work[row][pivotColumn] / divisor;
      const s = work[row][column] / divisor;
      addColumns(work, pivotColumn, column, u, v, -s, r);
      addColumns(transform, pivotColumn, column, u, v, -s, r);
    }
    let pivot = work[row][pivotColumn];
    if (pivot < 0n) {
      addColumns(work, pivotColumn, pivotColumn, -1n, 0n, -1n, 0n);
      addColumns(transform, pivotColumn, pivotColumn, -1n, 0n, -1n, 0n);
      pivot = -pivot;
    }
    if (pivot === 0n) { pivotColumn += 1; continue; }
    for (let column = pivotColumn + 1; column < COLUMNS; column += 1) {
      const quotient = floorDiv(work[row][column], pivot);
      addColumns(work, column, pivotColumn, 1n, -quotient, 0n, 1n);
      addColumns(transform, column, pivotColumn, 1n, -quotient, 0n, 1n);
    }
  }
  if (pivotColumn !== COLUMNS - ROWS) fail("relation matrix lacks full row rank");
  const hnf = work.flat();
  const expected = Array.from({ length: ROWS * COLUMNS }, (_, index) => {
    const row = Math.floor(index / COLUMNS), column = index % COLUMNS;
    return column === COLUMNS - ROWS + row ? 1n : 0n;
  });
  if (!same(hnf.map(String), expected.map(String))) fail("class HNF is not [0 | I]");
  const flatTransform = transform.flat();
  if (!same(multiplyMatrices(original, ROWS, COLUMNS, flatTransform, COLUMNS)
    .map(String), expected.map(String))) fail("class transform does not replay");
  const det = determinant(flatTransform, COLUMNS);
  if (det !== 1n && det !== -1n) fail("class transform is not unimodular");
  const rightInverse = transform.flatMap(row => row.slice(COLUMNS - ROWS));
  if (!same(multiplyMatrices(original, ROWS, COLUMNS, rightInverse, ROWS)
    .map(String), identity(ROWS).map(String))) fail("class right inverse failed");
  return frozen({
    relationEntries: original.map(String),
    hnf: expected.map(String),
    transform: flatTransform.map(String),
    transformDeterminant: String(det),
    rightInverse: rightInverse.map(String),
  });
}

function multiplyCoordinates(left, right, table) {
  const a = bigints(left, DEGREE, "left field element");
  const b = bigints(right, DEGREE, "right field element");
  const multiplication = bigints(table, DEGREE ** 3, "multiplication table");
  const answer = Array(DEGREE).fill(0n);
  for (let i = 0; i < DEGREE; i += 1)
    for (let j = 0; j < DEGREE; j += 1)
      for (let k = 0; k < DEGREE; k += 1)
        answer[k] += a[i] * b[j] * multiplication[25 * i + 5 * j + k];
  return answer;
}
function multiplicationMatrix(unit, table) {
  const columns = Array.from({ length: DEGREE }, (_, column) => {
    const basis = Array(DEGREE).fill("0"); basis[column] = "1";
    return multiplyCoordinates(unit, basis, table);
  });
  return Array.from({ length: DEGREE * DEGREE }, (_, index) => {
    const row = Math.floor(index / DEGREE), column = index % DEGREE;
    return columns[column][row];
  });
}

function nativeCapability(name, role, owner, logicalLength) {
  if (!owner || typeof owner !== "object" || !Number.isSafeInteger(logicalLength) ||
      logicalLength < 0 || logicalLength > owner.length) fail(`${name} owner is invalid`);
  const capability = Object.freeze({ name, role, logicalLength,
    capacity: owner.length });
  CAPABILITIES.set(capability, () => view(owner, logicalLength));
  return capability;
}
function derivedCapability(name, role, read) {
  const initial = read();
  const capability = Object.freeze({ name, role, logicalLength: initial.length,
    capacity: initial.length });
  CAPABILITIES.set(capability, read);
  return capability;
}
function readCapability(capability) {
  const read = CAPABILITIES.get(capability);
  if (!read) fail("owner capability is not authentic");
  return integers(read(), capability.logicalLength, `${capability.name} owner`);
}
function storageOwner(capability) {
  const entries = readCapability(capability);
  return {
    capacity: String(capability.capacity),
    encoding: "canonical-decimal-integer",
    entries: [
      ...entries,
      ...Array(capability.capacity - capability.logicalLength).fill("0"),
    ],
    logicalLength: String(capability.logicalLength),
    name: capability.name,
    role: capability.role,
  };
}
function logical(owner) {
  return owner.entries.slice(0, Number(owner.logicalLength));
}

function capabilityBundle(resident, projection) {
  const v = resident.values;
  const prepared = resident.acceptance.connected.prefix.prepared;
  const relation = nativeCapability("relation-records", "relation-records",
    v.h_relation_records, ROWS * COLUMNS);
  const basis = nativeCapability("multiplication-table", "multiplication-table",
    v.fb_basis_table, DEGREE ** 3);
  const capabilities = [
    basis,
    relation,
    nativeCapability("class-number", "class-number",
      v.t_accept_class_number, 1),
    nativeCapability("accepted-regulator", "regulator-enclosure",
      v.t_accept_regulator, 3),
    nativeCapability("analytic-inverse-hr", "analytic-inverse-hr", v.t_inverse_hr, 3),
    nativeCapability("analytic-state", "analytic-state", v.t_analytic_state, 2),
    nativeCapability("post-hnf-state", "post-hnf-state", v.t_accept_post_hnf_state, 3),
    nativeCapability("multiple-state", "multiple-state", v.t_accept_multiple_state, 4),
    nativeCapability("acceptance-state", "acceptance-state",
      v.t_accept_acceptance_state, 3),
    nativeCapability("reconstruction-state", "reconstruction-state",
      v.t_accept_reconstruction_state, 4),
    nativeCapability("hnf-state", "hnf-state", v.h_hnf_state, 9),
    nativeCapability("exact-unit-coordinates", "exact-unit-coordinates",
      v.u_output_units, 15),
    nativeCapability("exact-unit-inverses", "exact-unit-inverses",
      v.u_output_inverses, 15),
    nativeCapability("exact-unit-norms", "exact-unit-norms", v.u_output_norms, 3),
    nativeCapability("exact-unit-real-signs", "exact-unit-real-signs",
      v.u_output_real_signs, 9),
    nativeCapability("relation-to-unit-transform", "relation-to-unit-transform",
      v.u_unit_transform, 24),
    nativeCapability("getfu-factor", "getfu-factor", v.u_factor, 9),
    nativeCapability("integer-lattice-state", "integer-lattice-state",
      v.u_integer_state, 5),
    nativeCapability("real-lattice-state", "real-lattice-state", v.u_real_state, 2),
    nativeCapability("cleanarch-state", "cleanarch-state", v.u_clean_state, 7),
    nativeCapability("getfu-real-state", "getfu-real-state", v.u_getfu_real_state, 2),
    nativeCapability("getfu-state", "getfu-state", v.u_getfu_state, 8),
    nativeCapability("unit-output-logs-real", "unit-output-logs-real",
      v.u_output_logs_real, 36),
    nativeCapability("unit-output-logs-imaginary", "unit-output-logs-imaginary",
      v.u_output_logs_imag, 36),
    nativeCapability("native-terminal-state", "native-terminal-state",
      v.unit_terminal_state, 14),
  ];
  const presentation = columnHnfWitness(readCapability(relation));
  capabilities.push(derivedCapability("class-presentation", "class-presentation", () => {
    const current = columnHnfWitness(readCapability(relation));
    return [...current.relationEntries, ...current.hnf, ...current.transform,
      ...current.rightInverse, current.transformDeterminant];
  }));
  capabilities.push(derivedCapability("torsion-generator", "torsion-generator",
    () => ["-1", "0", "0", "0", "0"]));
  capabilities.push(derivedCapability("prepared-context", "prepared-context", () => [
    String(prepared.n), String(prepared.precision),
    String(prepared.analytic_discriminant),
    String(prepared.analytic_roots_of_unity),
  ]));
  capabilities.push(derivedCapability("prepared-polynomial", "prepared-polynomial",
    () => prepared.prep_polynomial.map(String)));
  capabilities.push(derivedCapability("honesty-evidence", "honesty-evidence", () => [
    String(prepared.analytic_discriminant), String(prepared.analytic_roots_of_unity),
    ...projection.acceptanceState, ...projection.terminalState,
  ]));
  capabilities.push(derivedCapability("assumption-evidence", "assumption-evidence",
    () => [...neutral.canonical(assumptions())].map(String)));
  return Object.freeze({ capabilities: Object.freeze(capabilities), presentation });
}

function assumptions() {
  return [
    { disposition: "assumed", id: "factor-base-completeness",
      statement: "PARI 2.17.4's GRH-dependent factor-base completeness is assumed correct" },
    { disposition: "assumed", id: "pari-bounds-and-retries",
      statement: "PARI 2.17.4's heuristic bounds and retry decisions are assumed correct" },
    { disposition: "assumed", id: "regulator-acceptance",
      statement: "PARI 2.17.4's floating analytic and regulator acceptance is assumed correct" },
  ];
}

function payloadFromCapabilities(resident, bundle) {
  const storage = bundle.capabilities.map(storageOwner)
    .sort((left, right) => left.name.localeCompare(right.name));
  const prepared = resident.acceptance.connected.prefix.prepared;
  const classNumber = readCapability(bundle.capabilities.find(
    capability => capability.name === "class-number"))[0];
  if (classNumber !== "1") fail("row-21 class group is not trivial");
  const torsionOrder = String(prepared.analytic_roots_of_unity);
  if (torsionOrder !== "2") fail("row-21 torsion order changed");
  return {
    classGroup: { classNumber, generatorCount: "0", invariantFactors: [],
      presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: prepared.prep_polynomial.map(String),
      degree: "5", id: FIELD_ID },
    honesty: { evidenceOwner: "honesty-evidence", outcome: "not-required",
      sourcePolicy: "resident-PARI-2.17.4-equal-bound-correspondence" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: assumptions(),
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4",
      replaySchema: REPLAY_SCHEMA },
    storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { coordinatesOwner: "exact-unit-coordinates",
      normsOwner: "exact-unit-norms", tag: "exact_units" }, rank: "3",
      regulatorOwner: "accepted-regulator", torsionGeneratorOwner: "torsion-generator",
      torsionOrder },
  };
}

function replayPayload(payload, capabilities, mathematicalAuthoritySha256) {
  neutral.validatePayload(payload);
  const capabilityByName = new Map(capabilities.map(cap => [cap.name, cap]));
  const owners = new Map(payload.storage.map(owner => [owner.name, owner]));
  if (owners.size !== capabilities.length) fail("storage capability count changed");
  for (const [name, owner] of owners) {
    const capability = capabilityByName.get(name);
    if (!capability || capability.role !== owner.role ||
        String(capability.logicalLength) !== owner.logicalLength ||
        String(capability.capacity) !== owner.capacity ||
        !same(readCapability(capability), logical(owner)))
      fail(`${name} is detached from its live owner capability`);
  }
  const table = logical(owners.get("multiplication-table"));
  const context = logical(owners.get("prepared-context"));
  if (!same([...neutral.canonical(payload.source.assumptions)].map(String),
      logical(owners.get("assumption-evidence"))))
    fail("source assumptions changed");
  if (!same(payload.field.definingPolynomialAscending,
      logical(owners.get("prepared-polynomial"))) || context[0] !== payload.field.degree ||
      context[3] !== payload.unitGroup.torsionOrder)
    fail("prepared field context changed");
  const units = logical(owners.get("exact-unit-coordinates"));
  const inverses = logical(owners.get("exact-unit-inverses"));
  const norms = logical(owners.get("exact-unit-norms"));
  const signs = logical(owners.get("exact-unit-real-signs"));
  for (let index = 0; index < 3; index += 1) {
    const unit = units.slice(index * DEGREE, (index + 1) * DEGREE);
    const inverse = inverses.slice(index * DEGREE, (index + 1) * DEGREE);
    if (!same(multiplyCoordinates(unit, inverse, table).map(String),
      ["1", "0", "0", "0", "0"])) fail(`unit ${index} inverse failed`);
    if (String(determinant(multiplicationMatrix(unit, table), DEGREE)) !== norms[index])
      fail(`unit ${index} norm failed`);
    const realSigns = signs.slice(3 * index, 3 * index + 3).map(BigInt);
    if (realSigns.some(sign => sign !== 1n && sign !== -1n) ||
        String(realSigns.reduce((a, b) => a * b, 1n)) !== norms[index])
      fail(`unit ${index} real signs disagree with its norm`);
  }
  const factorDeterminant = determinant(
    logical(owners.get("getfu-factor")).map(BigInt), 3);
  if (factorDeterminant !== 1n && factorDeterminant !== -1n)
    fail("getfu factor is not unimodular");
  if (!same(logical(owners.get("acceptance-state")), ["2", "0", "0"]) ||
      !same(logical(owners.get("native-terminal-state")),
        ["0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "1", "1"]) ||
      payload.classGroup.classNumber !== logical(owners.get("class-number"))[0] ||
      payload.classGroup.classNumber !== "1" || payload.classGroup.invariantFactors.length)
    fail("terminal class-and-unit state changed");
  const regulator = logical(owners.get("accepted-regulator"));
  if (regulator[0] === "0" || regulator[1] !== context[1])
    fail("accepted regulator precision changed");
  return {
    correspondence_complete: true,
    fieldId: FIELD_ID,
    mathematicalAuthoritySha256,
    payloadSha256: neutral.sha256Canonical(payload),
    public_complete: false,
    schema: REPLAY_SCHEMA,
  };
}

async function prepareResident(inputPath) {
  const resident = await unitHost.prepareResident(inputPath);
  RESIDENTS.add(resident);
  return resident;
}

function computeCandidate(resident) {
  if (!RESIDENTS.has(resident)) fail("resident capability is not authentic");
  const invocation = unitHost.runInvocation(resident);
  const bundle = capabilityBundle(resident, invocation.projection);
  const payload = payloadFromCapabilities(resident, bundle);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const mathematicalAuthoritySha256 = sha(neutral.canonical({
    preparedAuthority: PREPARED_AUTHORITY,
    replaySchema: REPLAY_SCHEMA,
    ownerNames: bundle.capabilities.map(capability => capability.name),
    resultSchema: RESULT_SCHEMA,
  }));
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
    replaySchema: REPLAY_SCHEMA,
    replay: candidate => replayPayload(candidate, bundle.capabilities,
      mathematicalAuthoritySha256),
  });
  const candidate = frozen({
    boundary: invocation.boundary,
    correspondenceComplete: true,
    envelopeSha256: neutral.sha256Bytes(raw),
    fieldId: FIELD_ID,
    kernelNanoseconds: invocation.kernelNanoseconds,
    publicComplete: false,
    schema: RESULT_SCHEMA,
    status: "ready-for-capability-backed-publication",
  });
  CANDIDATES.set(candidate, { authority, bundle, raw });
  return candidate;
}

function publishCandidate(candidate, publisher = undefined) {
  const state = CANDIDATES.get(candidate);
  if (!state) fail("candidate is not capability-backed");
  return (publisher ?? new neutral.ClassUnitCorrespondencePublisher())
    .publish(state.raw, state.authority);
}

function replayCandidatePayload(candidate, payload) {
  const state = CANDIDATES.get(candidate);
  if (!state) fail("candidate is not capability-backed");
  return replayPayload(payload, state.bundle.capabilities,
    state.authority.mathematicalAuthoritySha256);
}

function inspectCandidate(candidate) {
  const state = CANDIDATES.get(candidate);
  if (!state) fail("candidate is not capability-backed");
  return frozen({
    capabilities: state.bundle.capabilities.map(capability => frozen({
      capacity: String(capability.capacity), logicalLength: String(capability.logicalLength),
      name: capability.name, role: capability.role,
    })),
    payload: JSON.parse(state.raw.toString("ascii")).payload,
  });
}

module.exports = {
  FIELD_ID,
  REPLAY_SCHEMA,
  RESULT_SCHEMA,
  Row21Phase6ResultFailure,
  columnHnfWitness,
  computeCandidate,
  inspectCandidate,
  prepareResident,
  publishCandidate,
  replayCandidatePayload,
};
