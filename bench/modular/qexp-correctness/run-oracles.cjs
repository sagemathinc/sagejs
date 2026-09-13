#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const HERE = __dirname;
const PINNED = JSON.parse(
  fs.readFileSync(path.join(HERE, "pinned-corpus.json"), "utf8"),
);

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function canonicalRows(rows) {
  return rows.map((row) => row.join(",")).join(";");
}

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: path.resolve(HERE, "../../.."),
    encoding: "utf8",
    env: { ...process.env, MAGMA_LIBRARIES: "" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${executable} exited ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function verifySageMath() {
  const executable = process.env.SAGE || "/home/user/sagelite/sage";
  const result = run(executable, [
    "-python",
    path.join(HERE, "sage-oracle.py"),
  ]);
  const jsonStart = result.stdout.indexOf("{");
  if (jsonStart < 0) throw new Error("SageMath oracle did not emit JSON");
  const payload = JSON.parse(result.stdout.slice(jsonStart));
  assert.equal(payload.schema, "sagejs.modular-qexp-differential-corpus.v2");
  const byId = new Map(payload.trivial_character.map((item) => [item.id, item]));
  for (const expected of PINNED.trivial_character) {
    const actual = byId.get(expected.id);
    assert.ok(actual, `missing SageMath case ${expected.id}`);
    assert.equal(actual.sturm_bound, expected.sturm_bound);
    assert.equal(actual.ambient_dimension, expected.ambient_dimension);
    assert.equal(actual.formula_dimension, expected.formula_dimension);
    assert.equal(
      sha256(canonicalRows(actual.ambient_rref)),
      expected.ambient_sha256,
    );
    assert.equal(
      sha256(canonicalRows(actual.formula_rref)),
      expected.formula_sha256,
    );
  }
  assert.equal(
    sha256(canonicalRows(payload.nontrivial_character.basis_rref)),
    PINNED.nontrivial_character.basis_sha256,
  );
  const oldNewById = new Map(payload.old_new.map((item) => [item.id, item]));
  for (const expected of PINNED.old_new) {
    const actual = oldNewById.get(expected.id);
    assert.ok(actual, `missing SageMath old/new case ${expected.id}`);
    assert.equal(actual.sturm_bound, expected.sturm_bound);
    assert.equal(
      sha256(canonicalRows(actual.ambient_rref)),
      expected.ambient_sha256,
    );
    assert.equal(
      sha256(canonicalRows(actual.old_rref)),
      expected.old_sha256,
    );
    assert.equal(
      sha256(canonicalRows(actual.new_rref)),
      expected.new_sha256,
    );
    assert.deepEqual(
      actual.hecke_characteristic_polynomials,
      expected.hecke_characteristic_polynomials,
    );
  }
  assert.deepEqual(
    payload.coefficient_field.coefficient_minpolys,
    PINNED.coefficient_field.coefficient_minpolys,
  );
  assert.equal(
    sha256(canonicalRows(payload.coefficient_field.basis_rref)),
    PINNED.coefficient_field.basis_sha256,
  );
  assert.deepEqual(
    payload.higher_coefficient_field.coefficient_minpolys,
    PINNED.higher_coefficient_field.coefficient_minpolys,
  );
  assert.equal(
    sha256(canonicalRows(payload.higher_coefficient_field.basis_rref)),
    PINNED.higher_coefficient_field.basis_sha256,
  );
  return {
    executable,
    version: payload.oracle.version,
    cases: PINNED.trivial_character.length + PINNED.old_new.length + 3,
    status: "pass",
  };
}

function parseMagma(stdout) {
  const lines = stdout.split(/\r?\n/);
  const matrices = new Map();
  const dimensions = new Map();
  const oldNewDimensions = new Map();
  const hecke = new Map();
  let version = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("SAGEJS_QEXP_MAGMA_VERSION|")) {
      version = line.slice(line.indexOf("|") + 1).trim().split(/\s+/).join(".");
    } else if (line.startsWith("SAGEJS_QEXP_MAGMA_CASE|")) {
      const [, id, level, weight, precision, dimension] = line.split("|");
      dimensions.set(id, {
        level: Number(level),
        weight: Number(weight),
        precision: Number(precision),
        dimension: Number(dimension),
      });
    } else if (line.startsWith("SAGEJS_QEXP_MAGMA|")) {
      const [, id, label, rows, columns] = line.split("|");
      let encoded = "";
      while (index + 1 < lines.length) {
        const continuation = lines[index + 1];
        if (continuation.startsWith("SAGEJS_QEXP_MAGMA")) break;
        index += 1;
        encoded += continuation.endsWith("\\")
          ? continuation.slice(0, -1)
          : continuation;
        if (!continuation.endsWith("\\")) break;
      }
      matrices.set(`${id}:${label}`, {
        rows: Number(rows),
        columns: Number(columns),
        encoded,
      });
    } else if (line.startsWith("SAGEJS_QEXP_MAGMA_OLDNEW|")) {
      const [, id, level, weight, precision, ambient, old, fresh] =
        line.split("|");
      oldNewDimensions.set(id, {
        level: Number(level),
        weight: Number(weight),
        precision: Number(precision),
        ambient: Number(ambient),
        old: Number(old),
        new: Number(fresh),
      });
    } else if (line.startsWith("SAGEJS_QEXP_MAGMA_HECKE|")) {
      const [, id, prime, ...polynomialParts] = line.split("|");
      let polynomial = polynomialParts.join("|");
      while (
        index + 1 < lines.length &&
        !lines[index + 1].startsWith("SAGEJS_QEXP_MAGMA")
      ) {
        index += 1;
        polynomial += ` ${lines[index]}`;
      }
      hecke.set(
        `${id}:${prime}`,
        polynomial.replaceAll("$.1", "x").replace(/\s+/gu, " ").trim(),
      );
    }
  }
  return { dimensions, hecke, matrices, oldNewDimensions, version };
}

function verifyMagma() {
  const executable = process.env.MAGMA || "/home/user/bin/magma";
  const result = run(executable, ["-b", path.join(HERE, "magma-oracle.m")]);
  const parsed = parseMagma(result.stdout);
  assert.equal(parsed.version, "2.18.5");
  for (const expected of PINNED.trivial_character) {
    const dimensions = parsed.dimensions.get(expected.id);
    assert.deepEqual(dimensions, {
      level: expected.level,
      weight: expected.weight,
      precision: expected.precision,
      dimension: expected.ambient_dimension,
    });
    const matrix = parsed.matrices.get(`${expected.id}:ambient_rref`);
    assert.equal(matrix.rows, expected.ambient_dimension);
    assert.equal(matrix.columns, expected.precision);
    assert.equal(sha256(matrix.encoded), expected.ambient_sha256);
  }
  for (const expected of PINNED.old_new) {
    assert.deepEqual(parsed.oldNewDimensions.get(expected.id), {
      level: expected.level,
      weight: expected.weight,
      precision: expected.precision,
      ambient: expected.ambient_dimension,
      old: expected.old_dimension,
      new: expected.new_dimension,
    });
    for (const label of ["ambient", "old", "new"]) {
      const matrix = parsed.matrices.get(`${expected.id}:${label}_rref`);
      assert.equal(
        sha256(matrix.encoded),
        expected[`${label}_sha256`],
        `${expected.id} ${label}`,
      );
    }
    for (const [index, polynomial] of Object.entries(
      expected.hecke_characteristic_polynomials,
    )) {
      assert.equal(parsed.hecke.get(`${expected.id}:${index}`), polynomial);
    }
  }
  for (const [prime, expected] of Object.entries(
    PINNED.coefficient_field.hecke_characteristic_polynomials,
  )) {
    assert.equal(
      parsed.hecke.get(`level23-weight2:${prime}`),
      expected,
    );
  }
  for (const expected of [
    PINNED.coefficient_field,
    PINNED.higher_coefficient_field,
  ]) {
    const matrix = parsed.matrices.get(`${expected.id}:ambient_rref`);
    assert.equal(matrix.rows, expected.field_degree);
    assert.equal(matrix.columns, expected.precision);
    assert.equal(sha256(matrix.encoded), expected.basis_sha256);
  }
  for (const [prime, expected] of Object.entries(
    PINNED.higher_coefficient_field.hecke_characteristic_polynomials,
  )) {
    assert.equal(parsed.hecke.get(`level41-weight2:${prime}`), expected);
  }
  return {
    executable,
    version: parsed.version,
    cases: PINNED.trivial_character.length + PINNED.old_new.length + 2,
    status: "pass",
  };
}

function verifyPari() {
  const executable = process.env.SAGE || "/home/user/sagelite/sage";
  const result = run(executable, [
    "-python",
    path.join(HERE, "pari-oracle.py"),
  ]);
  const jsonStart = result.stdout.indexOf("{");
  if (jsonStart < 0) throw new Error("PARI oracle did not emit JSON");
  const payload = JSON.parse(result.stdout.slice(jsonStart));
  assert.equal(payload.schema, "sagejs.modular-qexp-pari-corpus.v1");
  assert.equal(payload.oracle.version, PINNED.oracles.pari);
  const trivialById = new Map(
    payload.trivial_character.map((item) => [item.id, item]),
  );
  for (const expected of PINNED.trivial_character) {
    assert.equal(
      sha256(canonicalRows(trivialById.get(expected.id).ambient_rref)),
      expected.ambient_sha256,
    );
  }
  const oldNewById = new Map(payload.old_new.map((item) => [item.id, item]));
  for (const expected of PINNED.old_new) {
    const actual = oldNewById.get(expected.id);
    for (const label of ["ambient", "old", "new"]) {
      assert.equal(
        sha256(canonicalRows(actual[`${label}_rref`])),
        expected[`${label}_sha256`],
      );
    }
    assert.deepEqual(
      actual.hecke_characteristic_polynomials,
      expected.hecke_characteristic_polynomials,
    );
  }
  assert.deepEqual(
    payload.coefficient_field_hecke[PINNED.coefficient_field.id],
    PINNED.coefficient_field.hecke_characteristic_polynomials,
  );
  assert.equal(
    sha256(
      canonicalRows(
        payload.coefficient_field_basis[PINNED.coefficient_field.id],
      ),
    ),
    PINNED.coefficient_field.basis_sha256,
  );
  assert.equal(
    sha256(
      canonicalRows(
        payload.coefficient_field_basis[PINNED.higher_coefficient_field.id],
      ),
    ),
    PINNED.higher_coefficient_field.basis_sha256,
  );
  assert.deepEqual(
    payload.coefficient_field_hecke[PINNED.higher_coefficient_field.id],
    PINNED.higher_coefficient_field.hecke_characteristic_polynomials,
  );
  return {
    executable,
    version: payload.oracle.version,
    cases: PINNED.trivial_character.length + PINNED.old_new.length + 2,
    status: "pass",
  };
}

const receipt = {
  schema: "sagejs.modular-qexp-oracle-receipt.v1",
  pinned_corpus: "bench/modular/qexp-correctness/pinned-corpus.json",
  sagemath: verifySageMath(),
  magma: verifyMagma(),
  pari: verifyPari(),
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
