"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { runFirstHnf } = require("./row14_first_hnf_host.cjs");

const ROWS = 799, PLACES = 3;

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8").match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n").map(line => line.trim().replace(/,$/, "").split(": "));
}

function array(owner) {
  return owner.toArray ? owner.toArray() : Array.from(owner);
}

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result, Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
  }
  return result;
}

async function compile(sourceName, exportName) {
  const source = path.join(__dirname, sourceName);
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable);
  return { fn, names: signature(source, exportName), built };
}

async function runRow14Schedule(metadata) {
  const first = await runFirstHnf(metadata, { hnfWords: 16 });
  assert.equal(first.status, 0);
  assert.equal(array(first.values.power_metadata).length, 5,
    "selected-exponent continuation requires its fifth metadata slot");
  const resident = {
    h: array(first.values.hnf_result_h).slice(0, 9),
    dep: array(first.values.hnf_result_dep).slice(0, 12),
    b: array(first.values.hnf_result_b).slice(0, 7 * 792),
    c: array(first.values.hnf_result_c).slice(0, 7 * PLACES * 802),
    perm: array(first.values.hnf_perm),
    state: first.hnfState.slice(),
  };
  const snapshot = columns => ({ columns, state: resident.state.slice(),
    h: resident.h.map(String), dep: resident.dep.map(String),
    b: resident.b.map(String), c: resident.c.map(String),
    perm: resident.perm.map(String) });

  const collector = await compile("collected_log_embeddings.py", "pari_collect_and_log_relations");
  const compact = new Set(["relation_basis", "relation_records", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch", "generators"]);
  let clonedBytes = 0;
  const cv = {};
  for (const [name, kind] of collector.names) {
    if (name === "scalar_prefix_count") {
      cv[name] = 42n;
      continue;
    }
    assert(Object.hasOwn(first.values, name), `first root lacks collector owner ${name}`);
    const source = first.values[name];
    if (!kind.endsWith("Buffer")) {
      cv[name] = source;
      continue;
    }
    const values = array(source);
    if (kind === "Float64Buffer") {
      clonedBytes += 8 * values.length;
      cv[name] = collector.fn.createFloat64Buffer(values.map(Number));
    } else if (kind === "Int64Buffer") {
      clonedBytes += 8 * values.length;
      cv[name] = collector.fn.createInt64Buffer(values.map(BigInt));
    } else {
      const capacity = words(values, compact.has(name) ? 1 : 16);
      clonedBytes += values.length * (4 + 8 * capacity);
      cv[name] = collector.fn.createIntegerBuffer(values.length, capacity, values.map(BigInt));
    }
  }

  const next = await compile("row14_next_pass.py", "pari_row14_prepare_next_pass");
  const append = await compile("hnfadd.py", "pari_hnfadd");
  let squash = 0;
  const checkpoints = [snapshot(802)];
  const expectedCheckpoints = [804, 805, 806];
  const passTrace = [];
  let checkpointIndex = 0, collectionPasses = 0;

  while (checkpointIndex < expectedCheckpoints.length) {
    collectionPasses += 1;
    assert(collectionPasses <= 8, "row-14 continuation exceeded eight authentic passes");
    const need = ROWS - resident.state[0] - resident.state[2];
    assert(need > 0, "row-14 schedule closed before 806");
    const search = next.fn.createIntegerBuffer(ROWS, 1, array(cv.search_ideals).map(BigInt));
    const outerPerm = next.fn.createIntegerBuffer(ROWS, 1, array(cv.outer_perm).map(BigInt));
    const outer = next.fn.createInt64Buffer(array(cv.outer_state).map(BigInt));
    const cache = next.fn.createIntegerBuffer(6, 1, array(cv.relation_state).map(BigInt));
    const schedule = next.fn.createInt64Buffer(array(cv.schedule).map(BigInt));
    const completed = next.fn.createIntegerBuffer(1, 1, array(cv.log_completed).map(BigInt));
    const control = next.fn.createInt64Buffer(3);
    const perm = next.fn.createInt64Buffer(resident.perm.map(BigInt));
    assert.equal(next.fn.gmp(perm, BigInt(ROWS), BigInt(resident.state[0]), BigInt(need),
      BigInt(squash), search, outerPerm, 1n, outer, cache, schedule, completed, control), 0n);
    const nextControl = Array.from(control).map(Number);
    squash = nextControl[1];
    cv.search_ideals = collector.fn.createIntegerBuffer(ROWS, 1, search.toArray());
    cv.outer_perm = collector.fn.createIntegerBuffer(ROWS, 1, outerPerm.toArray());
    cv.outer_state = collector.fn.createInt64Buffer(Array.from(outer));
    cv.relation_state = collector.fn.createIntegerBuffer(6, 1, cache.toArray());
    cv.schedule = collector.fn.createInt64Buffer(Array.from(schedule));
    cv.log_completed = collector.fn.createIntegerBuffer(1, 1, completed.toArray());
    cv.search_count = BigInt(nextControl[0]);
    cv.outer_mode = 1n;
    cv.outer_ru = BigInt(PLACES);
    cv.scalar_prefix_count = 42n;

    assert.equal(collector.fn.gmp(...collector.names.map(([name]) => cv[name])), 0n);
    const relationState = cv.relation_state.toArray().map(Number);
    const columns = relationState[0], oldColumns = resident.state[7];
    passTrace.push({ pass: collectionPasses, need, searchCount: nextControl[0],
      squash, before: oldColumns, after: columns,
      schedule: Array.from(cv.schedule).map(Number),
      outer: Array.from(cv.outer_state).map(Number) });
    if (columns === oldColumns) continue;
    const expectedColumns = expectedCheckpoints[checkpointIndex];
    assert.equal(columns, expectedColumns);
    const newColumns = columns - oldColumns;
    const records = cv.relation_records.toArray();
    const logs = cv.log_embeddings.toArray();
    const newRelations = records.slice(oldColumns * ROWS, columns * ROWS);
    const newLogs = logs.slice(oldColumns * 7 * PLACES, columns * 7 * PLACES);

    const hRows = resident.state[0], bColumns = resident.state[2];
    const lig = ROWS - bColumns, width = hRows + newColumns, cWidth = width + bColumns;
    const lengths = {
      top: lig * newColumns, exact_product: lig * newColumns,
      log_product: 7 * PLACES * newColumns, adjusted_logs: 7 * PLACES * newColumns,
      joined: lig * width, joined_logs: 7 * PLACES * cWidth,
      rank_matrix: lig * width, occupied: width, pivots: lig, best: lig, profile: lig,
      rank_state: 10, perm_work: ROWS, matb: lig * width, new_dep: lig * width,
      permuted_b: lig * bColumns, full_h: lig * width, transform: width * width,
      lam: width * width, d: width + 1, hnf_state: 11, full_dep: lig * width,
      work_b: lig * bColumns, work_c: 7 * PLACES * cWidth, diagonal: lig,
      final_c: 7 * PLACES * cWidth, result_h: lig * lig, result_dep: lig * lig,
      result_b: lig * (bColumns + lig), result_c: 7 * PLACES * columns,
      final_state: 7, state: 9,
    };
    const explicit = {
      h: resident.h, h_rows: hRows, dep: resident.dep, b: resident.b,
      b_columns: bColumns, logs: resident.c, total_columns: oldColumns,
      log_rows: PLACES, perm: resident.perm, rows: ROWS,
      new_relations: newRelations, new_columns: newColumns, new_logs: newLogs,
    };
    const av = {};
    for (const [name, kind] of append.names) {
      const supplied = explicit[name];
      if (!kind.endsWith("Buffer")) {
        av[name] = BigInt(supplied);
      } else if (kind === "Int64Buffer") {
        const values = supplied === undefined ? Array(lengths[name]).fill(0n) : supplied.map(BigInt);
        av[name] = append.fn.createInt64Buffer(values);
      } else {
        const values = supplied === undefined ? Array(lengths[name]).fill(0n) : supplied.map(BigInt);
        av[name] = append.fn.createIntegerBuffer(values.length, 16, values);
      }
    }
    assert.equal(append.fn.gmp(...append.names.map(([name]) => av[name])), 0n);
    resident.state = Array.from(av.state).map(Number);
    resident.perm = Array.from(av.perm);
    const newH = resident.state[0], newB = resident.state[2], depRows = ROWS - newB - newH;
    resident.h = av.result_h.toArray().slice(0, newH * newH);
    resident.dep = av.result_dep.toArray().slice(0, depRows * newH);
    resident.b = av.result_b.toArray().slice(0, (ROWS - newB) * newB);
    resident.c = av.result_c.toArray().slice(0, 7 * PLACES * columns);
    relationState[4] = columns;
    cv.relation_state = collector.fn.createIntegerBuffer(6, 1, relationState.map(BigInt));
    checkpoints.push(snapshot(columns));
    checkpointIndex += 1;
  }
  assert.equal(first.ownerBytes + clonedBytes < 3.5 * 1024 ** 3, true);
  return { first, collectorValues: cv, resident, checkpoints, collectionPasses, passTrace,
    ownerBytesUpperBound: first.ownerBytes + clonedBytes };
}

module.exports = { runRow14Schedule };
