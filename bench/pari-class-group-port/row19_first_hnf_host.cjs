"use strict";

// First row-19 hnfspec boundary, fed directly by the live 423-column owner.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const collection = require("./row19_first_collection_host.cjs");

const ROWS = 424, COLUMNS = 423, PLACES = 2, K0 = 3;

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8").match(
    new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function hnfLengths() {
  const size = ROWS * COLUMNS, square = COLUMNS * COLUMNS;
  const logs = 7 * PLACES * COLUMNS;
  return {
    original: size, perm: ROWS, logs,
    mat: size, dense: K0*COLUMNS, transform: square, vmax: COLUMNS,
    found: 1, sparse_state: 13, bottom: (ROWS-K0)*COLUMNS,
    updated_dense: K0*COLUMNS, extra: size, cleanup_state: 10,
    rank_matrix: size, occupied: COLUMNS, pivots: ROWS, best: ROWS,
    profile: ROWS+1, rank_state: 10, perm_work: ROWS, matbnew: size,
    dep: size, b: size, assembly_state: 6, transformed_logs: logs,
    full_h: size, hnf_transform: square, lam: square, d: COLUMNS+1,
    hnf_state: 11, full_dep: size, work_b: size, work_c: logs,
    diagonal: ROWS, result_h: size, result_dep: size,
    result_b: ROWS*(COLUMNS+ROWS), result_c: logs, final_state: 7,
    state: 9, cup_arena: 2_881_440, cup_frames: 64,
    cup_solve_state: 8, cup_state: 8,
  };
}

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result,
      Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
  }
  return result;
}

function view(owner, length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}

function exactState(values) {
  const state = Array.from(values.state).map(Number);
  const sparse = Array.from(values.sparse_state).map(Number);
  const assembly = Array.from(values.assembly_state).map(Number);
  const activeRows = assembly[0], activeColumns = assembly[2];
  const hRows = state[0], bColumns = state[2];
  const depRows = ROWS - bColumns - hRows;
  const retained = state[7];
  assert(activeRows >= 0 && activeColumns >= activeRows);
  assert.equal(retained, COLUMNS);
  return {
    state,
    sparseState: sparse,
    cleanupState: Array.from(values.cleanup_state).map(Number),
    rankState: values.rank_state.toArray().map(String),
    assemblyState: assembly,
    hnfState: Array.from(values.hnf_state).map(Number),
    finalState: Array.from(values.final_state).map(Number),
    cupState: Array.from(values.cup_state).map(Number),
    cupSolveState: Array.from(values.cup_solve_state).map(Number),
    dimensions: { rows: ROWS, columns: COLUMNS, retained, activeRows,
      activeColumns, hRows, depRows, bColumns, logRows: PLACES },
    // H and its active transform are the pre-unit-removal ancestry boundary.
    ancestry: {
      relation: view(values.matbnew, activeRows * activeColumns),
      H: view(values.full_h, activeRows * activeColumns),
      transform: view(values.hnf_transform, activeColumns * activeColumns),
      cleanupTransform: view(values.transform, retained * retained),
    },
    // W/B/dep/C are PARI's published first-HNF blocks.
    result: {
      W: view(values.result_h, hRows * hRows),
      dep: view(values.result_dep, depRows * hRows),
      B: view(values.result_b, (ROWS - bColumns) * bColumns),
      C: view(values.result_c, 7 * PLACES * COLUMNS),
      perm: view(values.perm, ROWS),
    },
  };
}

async function runFirstHnf(prepared, prefix) {
  assert.equal(prefix.factor.subfactor.length, K0,
    "hnfspec k0 must be the live subfactor count");
  const collected = await collection.runFirstCollection(prepared, prefix);
  const cv = collected.values;
  assert.deepEqual(cv.relation_state.toArray().map(String),
    ["423", "4350", "7", "0", "0", "423"]);
  const source = path.join(__dirname, "hnfspec_complete.py");
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath).pari_hnfspec_complete;
  assert(fn?.nativeAvailable);
  const names = signature(source, "pari_hnfspec_complete"), lengths = hnfLengths();
  const input = { rows: ROWS, columns: COLUMNS, k0: K0, log_rows: PLACES,
    original: cv.relation_records.toArray().slice(0, ROWS*COLUMNS),
    // Collection mutates the live PARI ordering while trimming the small-norm
    // list.  HNF consumes that retained owner, not the initial factor order.
    perm: cv.outer_perm.toArray().slice(0, ROWS),
    logs: cv.log_embeddings.toArray().slice(0, 7*PLACES*COLUMNS) };
  const compact = new Set(["cup_arena", "cup_frames"]);
  const values = {}; let ownerBytesUpperBound = collected.ownerBytesUpperBound;
  for (const [name, kind] of names) {
    const supplied = input[name];
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(supplied, undefined, `missing scalar ${name}`);
      values[name] = BigInt(supplied); continue;
    }
    const length = supplied === undefined ? lengths[name] : supplied.length;
    assert.notEqual(length, undefined, `missing owner shape ${name}`);
    if (kind === "Int64Buffer") {
      ownerBytesUpperBound += 8 * length;
      values[name] = fn.createInt64Buffer(
        supplied === undefined ? length : supplied.map(BigInt));
    } else {
      const capacity = words(supplied, compact.has(name) ? 1 : 16);
      ownerBytesUpperBound += length * (4 + 8 * capacity);
      values[name] = fn.createIntegerBuffer(length, capacity,
        supplied === undefined ? undefined : supplied.map(BigInt));
    }
  }
  assert(ownerBytesUpperBound < 4 * 1024 ** 3);
  const status = fn.gmp(...names.map(([name]) => values[name]));
  assert.equal(status, 0n);
  const exact = exactState(values);
  assert.deepEqual(exact.state, [9, 15, 408, 7, 6, 69, 0, 423, 0]);
  return { collected, built, values, exact, ownerBytesUpperBound };
}

module.exports = { runFirstHnf, exactState, hnfLengths };
