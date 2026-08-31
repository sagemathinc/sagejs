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
  assert.equal(payload.schema, "sagejs.modular-qexp-differential-corpus.v1");
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
  assert.equal(
    sha256(canonicalRows(payload.old_new.ambient_rref)),
    PINNED.old_new.ambient_sha256,
  );
  assert.equal(
    sha256(canonicalRows(payload.old_new.old_rref)),
    PINNED.old_new.old_sha256,
  );
  assert.deepEqual(
    payload.coefficient_field.coefficient_minpolys,
    PINNED.coefficient_field.coefficient_minpolys,
  );
  return {
    executable,
    version: payload.oracle.version,
    cases: PINNED.trivial_character.length + 3,
    status: "pass",
  };
}

function parseMagma(stdout) {
  const lines = stdout.split(/\r?\n/);
  const matrices = new Map();
  const dimensions = new Map();
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
    } else if (line.startsWith("SAGEJS_QEXP_MAGMA_HECKE|")) {
      const [, id, prime, ...polynomialParts] = line.split("|");
      hecke.set(`${id}:${prime}`, polynomialParts.join("|").replaceAll("$.1", "x"));
    }
  }
  return { dimensions, hecke, matrices, version };
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
  const oldNew = parsed.matrices.get(
    `${PINNED.old_new.id}:ambient_rref`,
  );
  assert.equal(sha256(oldNew.encoded), PINNED.old_new.ambient_sha256);
  for (const [prime, expected] of Object.entries(
    PINNED.coefficient_field.hecke_characteristic_polynomials,
  )) {
    assert.equal(
      parsed.hecke.get(`level23-weight2:${prime}`),
      expected,
    );
  }
  return {
    executable,
    version: parsed.version,
    cases: PINNED.trivial_character.length + 2,
    status: "pass",
  };
}

const receipt = {
  schema: "sagejs.modular-qexp-oracle-receipt.v1",
  pinned_corpus: "bench/modular/qexp-correctness/pinned-corpus.json",
  sagemath: verifySageMath(),
  magma: verifyMagma(),
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
