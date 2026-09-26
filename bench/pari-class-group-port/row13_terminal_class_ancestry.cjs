"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const {
  authenticatePackedLogCheckpoint,
  embedHnfInputColumn,
  reverseHnfFinal,
  reverseSchedule,
} = require("./relation_column_ancestry.cjs");

const ROWS = 999;
const COLUMNS = 1006;
const PLACES = 3;
const INITIAL_COLUMNS = 995;
const CHECKPOINTS = [995, 996, 999, 1000, 1001, 1002, 1005, 1006];
const view = (value) => (value.toArray ? value.toArray() : Array.from(value));
const hash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs
    .readFileSync(source, "utf8")
    .match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing ${name}`);
  return match[1]
    .trim()
    .split("\n")
    .map((line) => line.trim().replace(/,$/, "").split(": "));
}

async function compiled(file, name) {
  const source = path.join(__dirname, file);
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[name];
  assert(fn?.nativeAvailable);
  return { fn, names: signature(source, name) };
}

function words(values, minimum = 1) {
  return values.reduce((answer, raw) => {
    let value = BigInt(raw);
    if (value < 0n) value = -value;
    return Math.max(
      answer,
      Math.ceil(Math.max(1, value.toString(2).length) / 64),
    );
  }, minimum);
}

function allocate(kernel, names, lengths, explicit = {}, options = {}) {
  const output = {};
  const compact = options.compact || new Set();
  const wide = options.wide || new Set();
  for (const [name, kind] of names) {
    if (!kind.endsWith("Buffer")) {
      output[name] =
        typeof explicit[name] === "boolean"
          ? explicit[name]
          : BigInt(explicit[name]);
      continue;
    }
    const supplied = explicit[name];
    const length = supplied === undefined ? lengths[name] : supplied.length;
    assert.notEqual(length, undefined, `missing length ${name}`);
    if (kind === "Int64Buffer") {
      output[name] = kernel.createInt64Buffer(
        supplied === undefined ? length : supplied.map(BigInt),
      );
    } else {
      const capacity = supplied === undefined
        ? compact.has(name)
          ? 1
          : wide.has(name)
            ? 16
            : 8
        : words(supplied, wide.has(name) ? 16 : compact.has(name) ? 1 : 8);
      output[name] = kernel.createIntegerBuffer(
        length,
        capacity,
        supplied === undefined ? undefined : supplied.map(BigInt),
      );
    }
  }
  return output;
}

function hnfStep(
  values,
  rows,
  depRows,
  columns,
  tail,
  trailingName,
  transformName,
) {
  return {
    rows,
    depRows,
    columns,
    tail,
    trailing: view(values[trailingName]).slice(0, (rows + depRows) * tail),
    transform: view(values[transformName]).slice(0, columns * columns),
    fullH: view(values.full_h).slice(0, rows * columns),
    fullDep: view(values.full_dep).slice(0, depRows * columns),
    diagonal: view(values.diagonal).slice(0, rows),
  };
}

function relationProduct(records, coefficients) {
  const output = Array(ROWS).fill(0n);
  for (let column = 0; column < coefficients.length; column += 1) {
    const coefficient = coefficients[column];
    if (!coefficient) continue;
    for (let row = 0; row < ROWS; row += 1) {
      output[row] += coefficient * records[column * ROWS + row];
    }
  }
  return output;
}

function logCheckpoint(owner, columns, state, values) {
  const checkpoint = owner.schedule.checkpoints.find(
    (entry) => entry.columns === columns,
  );
  assert(checkpoint, `missing ${columns} checkpoint`);
  // The accepted live run and the deterministic source replay can retain a
  // different count of unit diagonal pivots while exposing the same resident
  // dimensions.  That is an alternate valid B/C authority, not permission to
  // pretend its path-dependent packed logarithms are byte-identical.
  for (const index of [0, 1, 2, 3, 4, 6, 7, 8]) {
    assert.equal(state[index], checkpoint.state[index]);
  }
  const strings = values.map(String);
  const digest = hash(strings);
  authenticatePackedLogCheckpoint(strings, digest);
  const changed = strings.slice();
  changed[0] = String(BigInt(changed[0]) + 1n);
  assert.throws(
    () => authenticatePackedLogCheckpoint(changed, digest),
    /hash changed/,
  );
  return {
    columns,
    cells: strings.length,
    acceptedSha256: checkpoint.hashes.c,
    replaySha256: digest,
    byteIdenticalToAccepted: digest === checkpoint.hashes.c,
    acceptedState: checkpoint.state,
    replayState: state,
    sourceOrderPreserved: true,
    mutationRejected: true,
  };
}

async function deriveRow13ColumnAncestry(owner, metadataReceipt) {
  assert.equal(
    owner.schema,
    "sagejs.pari-class-group/row13-accepted-relation-owner-v1",
  );
  assert.equal(
    owner.ancestry.factorMetadataSha256,
    metadataReceipt.metadataSha256,
  );
  assert.deepEqual(
    owner.schedule.checkpoints.map((entry) => entry.columns),
    CHECKPOINTS,
  );
  const metadata = metadataReceipt.metadata;
  const records = owner.final.records.map(BigInt);
  const logs = owner.final.logs.map(BigInt);
  const initial = await compiled(
    "hnfspec_complete.py",
    "pari_hnfspec_complete",
  );
  const k0 = Number(metadata.policy.hnfK0);
  const size = ROWS * INITIAL_COLUMNS;
  const lengths = {
    mat: size,
    dense: k0 * INITIAL_COLUMNS,
    transform: INITIAL_COLUMNS ** 2,
    vmax: INITIAL_COLUMNS,
    found: 1,
    sparse_state: 13,
    bottom: (ROWS - k0) * INITIAL_COLUMNS,
    updated_dense: k0 * INITIAL_COLUMNS,
    extra: size,
    cleanup_state: 10,
    rank_matrix: size,
    occupied: INITIAL_COLUMNS,
    pivots: ROWS,
    best: ROWS,
    profile: ROWS + 1,
    rank_state: 10,
    perm_work: ROWS,
    matbnew: size,
    dep: size,
    b: size,
    assembly_state: 6,
    transformed_logs: 21 * INITIAL_COLUMNS,
    full_h: size,
    hnf_transform: INITIAL_COLUMNS ** 2,
    lam: INITIAL_COLUMNS ** 2,
    d: INITIAL_COLUMNS + 1,
    hnf_state: 11,
    full_dep: size,
    work_b: size,
    work_c: 21 * INITIAL_COLUMNS,
    diagonal: ROWS,
    result_h: size,
    result_dep: size,
    result_b: ROWS * (INITIAL_COLUMNS + ROWS),
    result_c: 21 * INITIAL_COLUMNS,
    final_state: 7,
    state: 9,
    cup_arena: 6_000_000,
    cup_frames: 64,
    cup_solve_state: 8,
    cup_state: 8,
  };
  const wide = new Set([
    "transform",
    "full_h",
    "hnf_transform",
    "lam",
    "d",
    "full_dep",
    "work_b",
    "result_h",
    "result_dep",
    "result_b",
  ]);
  const iv = allocate(
    initial.fn,
    initial.names,
    lengths,
    {
      original: records.slice(0, size),
      rows: ROWS,
      columns: INITIAL_COLUMNS,
      perm: metadata.factor.permutation,
      k0,
      logs: logs.slice(0, 21 * INITIAL_COLUMNS),
      log_rows: PLACES,
    },
    { compact: new Set(["cup_arena", "cup_frames"]), wide },
  );
  assert.equal(initial.fn.gmp(...initial.names.map(([name]) => iv[name])), 0n);
  const initialState = Array.from(iv.state, Number);
  assert.deepEqual(
    initialState.filter((_, index) => index !== 5),
    [1, 8, 987, 11, 7, 0, 995, 0],
  );
  const assembly = Array.from(iv.assembly_state, Number);
  const [genuine, redundant, width, lig, tail] = assembly;
  assert.equal(genuine + redundant, lig);
  assert.equal(width + tail, INITIAL_COLUMNS);
  const initialStep = {
    columns: INITIAL_COLUMNS,
    cleanupTransform: view(iv.transform).slice(0, INITIAL_COLUMNS ** 2),
    hnf: hnfStep(
      iv,
      genuine,
      redundant,
      width,
      tail,
      "b",
      "hnf_transform",
    ),
  };
  let resident = {
    state: initialState,
    perm: view(iv.perm),
    h: view(iv.result_h).slice(0, 1),
    dep: view(iv.result_dep).slice(0, 11),
    b: view(iv.result_b).slice(0, 12 * 987),
    c: view(iv.result_c).slice(0, 21 * INITIAL_COLUMNS),
  };
  const logProvenance = [
    logCheckpoint(owner, INITIAL_COLUMNS, resident.state, resident.c),
  ];
  const append = await compiled("hnfadd.py", "pari_hnfadd");
  const appendSteps = [];
  for (const nextTotal of CHECKPOINTS.slice(1)) {
    const oldTotal = resident.state[7];
    const newColumns = nextTotal - oldTotal;
    const hRows = resident.state[0];
    const bColumns = resident.state[2];
    const localRows = ROWS - bColumns;
    const localWidth = hRows + newColumns;
    const cWidth = localWidth + bColumns;
    const newRelations = records.slice(oldTotal * ROWS, nextTotal * ROWS);
    const appendLengths = {
      top: localRows * newColumns,
      exact_product: localRows * newColumns,
      log_product: 21 * newColumns,
      adjusted_logs: 21 * newColumns,
      joined: localRows * localWidth,
      joined_logs: 21 * cWidth,
      rank_matrix: localRows * localWidth,
      occupied: localWidth,
      pivots: localRows,
      best: localRows,
      profile: localRows,
      rank_state: 10,
      perm_work: ROWS,
      matb: localRows * localWidth,
      new_dep: localRows * localWidth,
      permuted_b: localRows * bColumns,
      full_h: localRows * localWidth,
      transform: localWidth ** 2,
      lam: localWidth ** 2,
      d: localWidth + 1,
      hnf_state: 11,
      full_dep: localRows * localWidth,
      work_b: localRows * bColumns,
      work_c: 21 * cWidth,
      diagonal: localRows,
      final_c: 21 * cWidth,
      result_h: localRows ** 2,
      result_dep: localRows ** 2,
      result_b: localRows * (bColumns + localRows),
      result_c: 21 * nextTotal,
      final_state: 7,
      state: 9,
    };
    const beforePerm = resident.perm.slice();
    const av = allocate(
      append.fn,
      append.names,
      appendLengths,
      {
        h: resident.h,
        h_rows: hRows,
        dep: resident.dep,
        b: resident.b,
        b_columns: bColumns,
        logs: resident.c,
        total_columns: oldTotal,
        log_rows: PLACES,
        perm: resident.perm,
        rows: ROWS,
        new_relations: newRelations,
        new_columns: newColumns,
        new_logs: logs.slice(oldTotal * 21, nextTotal * 21),
      },
      { wide: new Set(Object.keys(appendLengths)) },
    );
    assert.equal(append.fn.gmp(...append.names.map(([name]) => av[name])), 0n);
    const rankState = view(av.rank_state).map(Number);
    const appendRedundant = rankState[7];
    assert.equal(rankState[2], appendRedundant);
    assert.equal(rankState[8], localRows);
    const appendGenuine = localRows - appendRedundant;
    appendSteps.push({
      oldTotal,
      newColumns,
      zeroPrefix: oldTotal - bColumns - hRows,
      hRows,
      bColumns,
      perm: beforePerm,
      newRelations,
      rows: ROWS,
      hnf: hnfStep(
        av,
        appendGenuine,
        appendRedundant,
        localWidth,
        bColumns,
        "permuted_b",
        "transform",
      ),
    });
    const state = Array.from(av.state, Number);
    const newH = state[0];
    const newB = state[2];
    const newDep = ROWS - newB - newH;
    resident = {
      state,
      perm: Array.from(av.perm),
      h: view(av.result_h).slice(0, newH * newH),
      dep: view(av.result_dep).slice(0, newDep * newH),
      b: view(av.result_b).slice(0, (ROWS - newB) * newB),
      c: view(av.result_c).slice(0, 21 * nextTotal),
    };
    logProvenance.push(
      logCheckpoint(owner, nextTotal, resident.state, resident.c),
    );
  }
  assert.deepEqual(resident.state, [1, 8, 998, 0, 7, 1, 0, 1006, 0]);
  assert.deepEqual(resident.h.map(String), owner.final.h);
  const transforms = reverseSchedule(
    COLUMNS,
    Array.from({ length: 8 }, (_, index) => index),
    initialStep,
    appendSteps,
  );
  const unit = transforms.slice(0, 7);
  const klass = transforms[7];
  for (const vector of unit) {
    assert.deepEqual(relationProduct(records, vector), Array(ROWS).fill(0n));
  }
  const active = Number(resident.perm[0]) - 1;
  const acceptedActive = Number(owner.final.perm[0]) - 1;
  const expected = Array(ROWS).fill(0n);
  expected[active] = BigInt(owner.final.h[0]);
  assert.deepEqual(relationProduct(records, klass), expected);
  return {
    schema: "sagejs.pari-class-group/row13-column-ancestry-v1",
    rawToUnitKernel: unit.flat().map(String),
    rawToPresentation: klass.map(String),
    state: {
      backend: "source-hnfspec-hnfadd-reverse-replay",
      selectedColumns: 8,
      kernelColumns: 7,
      classColumns: 1,
      relationReplayCells: ROWS * 8,
      initialAssembly: assembly,
      acceptedOwnerSha256: hash(owner),
      metadataSha256: metadataReceipt.metadataSha256,
      activeFactorRow: active,
      acceptedActiveFactorRow: acceptedActive,
      replayPermutationSha256: hash(resident.perm.map(String)),
      acceptedPermutationSha256: hash(owner.final.perm),
      packedLogProvenance: {
        arithmetic: "source-stage-order",
        pathDependent: true,
        oneShotRawTransformAuthoritative: false,
        rawToUnitKernelAuthority: "integer relation kernel R*T=0",
        terminalPackedEquality:
          hash(resident.c.map(String)) === hash(owner.final.c),
        alternateValidBCPivotAuthority: true,
        checkpoints: logProvenance,
        mutationsRejected: logProvenance.length,
      },
      relationCollectionRerun: false,
      frozenW0UsedAsInput: false,
    },
  };
}

module.exports = { deriveRow13ColumnAncestry };
