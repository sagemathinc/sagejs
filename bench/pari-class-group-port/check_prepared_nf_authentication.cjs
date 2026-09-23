#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  authenticatePreparedBundle,
  authenticatePreparedNf,
  countRealRoots,
  irreducibleModPrime,
  polynomialDiscriminant,
  primesThrough,
} = require("./prepared_nf_authentication.cjs");

const inputPath = process.argv[2];
assert(inputPath, "usage: check_prepared_nf_authentication.cjs INPUTS.json");
const resolvedInput = path.resolve(inputPath);

function mutateExportedInteger(value, delta = 1n) {
  if (value && typeof value === "object" && value.kind === "integer") {
    value.value = String(BigInt(value.value) + delta);
    return;
  }
  throw new Error("mutation target is not an exported integer object");
}

function changedExportedInteger(value, delta = 1n) {
  if (value && typeof value === "object" && value.kind === "integer") {
    const changed = structuredClone(value);
    mutateExportedInteger(changed, delta);
    return changed;
  }
  return String(BigInt(value) + delta);
}

function checkExportBundle(bundle, label, adversarial = false) {
  assert.equal(bundle.diagnosticOnly, true, `${label} is not diagnostic-only`);
  assert.equal(bundle.qualificationExecutionEnabled, false,
    `${label} unexpectedly enables qualification`);
  assert.equal(bundle.reserveOpened, false, `${label} opened a reserve field`);
  const authority = authenticatePreparedBundle(bundle);
  const rejected = [];
  if (adversarial) {
    assert.deepEqual(authenticatePreparedBundle({ ...bundle,
      events: [{ classNumber: "answer-must-not-affect-authentication" }] }), authority,
    `${label}: non-preparation events affected authority`);
    const rejectBundle = (name, mutate, pattern) => {
      const changed = structuredClone(bundle);
      mutate(changed);
      assert.throws(() => authenticatePreparedBundle(changed), pattern, `${label}: ${name} was accepted`);
      rejected.push(name);
    };
    rejectBundle("field identity", value => {
      value.field.coefficients[0] = String(BigInt(value.field.coefficients[0]) + 1n);
    }, /polynomial disagrees/);
    rejectBundle("signature", value => { value.prepared.signature[0] += 2; }, /signature/);
    rejectBundle("discriminant", value => {
      value.prepared.discriminant = String(BigInt(value.prepared.discriminant) + 1n);
    }, /discriminant disagrees/);
    rejectBundle("index", value => {
      value.prepared.index = String(BigInt(value.prepared.index) + 1n);
    }, /index does not explain/);
    rejectBundle("basis", value => {
      value.prepared.zk[0] = changedExportedInteger(value.prepared.zk[0]);
    }, /basis inverse/);
    rejectBundle("inverse", value => {
      value.prepared.invzk[0] = changedExportedInteger(value.prepared.invzk[0]);
    }, /basis inverse/);
    rejectBundle("basis degree", value => {
      value.prepared.zkDegrees[0] = changedExportedInteger(value.prepared.zkDegrees[0]);
    }, /is false/);
    rejectBundle("multiplication tensor", value => {
      const cell = value.prepared.multiplicationTensor.at(-1);
      if (typeof cell === "object") mutateExportedInteger(cell);
      else value.prepared.multiplicationTensor[value.prepared.multiplicationTensor.length - 1] =
        String(BigInt(cell) + 1n);
    }, /multiplication tensor is false/);
    rejectBundle("embedding M", value => {
      const cell = value.prepared.embeddingM.find(entry => entry.kind === "real");
      cell.mantissa = String(BigInt(cell.mantissa) + (1n << 240n));
    }, /transformation is false|violates product/);
    rejectBundle("embedding G", value => {
      const cell = value.prepared.embeddingG.find(entry => entry.kind === "real");
      cell.mantissa = String(BigInt(cell.mantissa) + (1n << 240n));
    }, /transformation is false/);
    rejectBundle("rounded embedding", value => {
      mutateExportedInteger(value.prepared.roundedEmbedding.at(-1));
    }, /rounded embedding entry/);
    rejectBundle("roots-of-unity generator", value => {
      mutateExportedInteger(value.prepared.rootsOfUnity.values[1], 2n);
    }, /generator is not -1/);
    rejectBundle("runtime primes", value => {
      [value.prepared.runtimePrimes[100], value.prepared.runtimePrimes[101]] =
        [value.prepared.runtimePrimes[101], value.prepared.runtimePrimes[100]];
    }, /prime table is not exhaustive/);
    rejectBundle("runtime products", value => {
      mutateExportedInteger(value.prepared.runtimeProducts.values[0], 2n);
    }, /product table is not PARI/);
  }
  return { label, panelIndex: bundle.field.panelIndex, fieldId: bundle.field.id,
    degree: authority.degree, signature: authority.signature, authoritySha256: authority.sha256,
    rejectedMutations: rejected };
}

if (fs.statSync(resolvedInput).isDirectory()) {
  const files = fs.readdirSync(resolvedInput).filter(name => /^panel-\d+-.*\.json$/.test(name)).sort();
  assert.equal(files.length, 16, "development export directory must contain exactly 16 tuning fields");
  const manifestPath = path.join(resolvedInput, "manifest.json");
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.diagnosticOnly, true);
  assert.equal(manifest.qualificationExecutionEnabled, false);
  assert.equal(manifest.reserveOpened, false);
  assert.equal(manifest.policy?.answerDerivedRuntimeFields, false);
  assert.equal(manifest.policy?.selectedPhase, "tuning");
  assert.equal(manifest.policy?.forbiddenPhase, "final-reserve");
  assert.equal(manifest.records.length, 16);
  assert.deepEqual(manifest.records.map(record => record.filename).sort(), files);
  const bundles = files.map(name => {
    const raw = fs.readFileSync(path.join(resolvedInput, name));
    const record = manifest.records.find(candidate => candidate.filename === name);
    assert(record, `manifest has no record for ${name}`);
    assert.equal(raw.length, record.bytes, `${name} byte count disagrees with manifest`);
    assert.equal(crypto.createHash("sha256").update(raw).digest("hex"), record.sha256,
      `${name} digest disagrees with manifest`);
    const bundle = JSON.parse(raw);
    assert.equal(bundle.field.panelIndex, record.panelIndex);
    assert.equal(bundle.field.id, record.id);
    return bundle;
  });
  const representativeIndices = new Set([
    bundles.findIndex(value => Number(value.prepared.degree) === 3),
    bundles.findIndex(value => Number(value.prepared.degree) === 4),
    bundles.findIndex(value => Number(value.prepared.degree) === 5),
  ]);
  const rows = bundles.map((bundle, i) => checkExportBundle(bundle, files[i], representativeIndices.has(i)));
  assert.deepEqual(Object.fromEntries([3, 4, 5].map(degree =>
    [degree, rows.filter(row => row.degree === degree).length])), { 3: 8, 4: 5, 5: 3 });
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/prepared-nf-development-authentication-v1",
    directory: resolvedInput,
    manifestSha256: crypto.createHash("sha256").update(manifestBytes).digest("hex"),
    count: rows.length,
    mutationCount: rows.reduce((sum, row) => sum + row.rejectedMutations.length, 0),
    rows,
  }, null, 2));
  process.exit(0);
}

const envelope = JSON.parse(fs.readFileSync(resolvedInput, "utf8"));
if (envelope.prepared) {
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/prepared-nf-export-authentication-v1",
    row: checkExportBundle(envelope, path.basename(resolvedInput), true),
  }, null, 2));
  process.exit(0);
}
const original = envelope.input;
const authority = authenticatePreparedNf(original);
const mutations = [];

function reject(name, mutate, pattern) {
  const changed = structuredClone(original);
  mutate(changed);
  assert.throws(() => authenticatePreparedNf(changed), pattern, `${name} was accepted`);
  mutations.push(name);
}

reject("signature", value => { value.admission_real_count = "1"; }, /signature disagrees/);
reject("reducible polynomial", value => {
  value.prep_polynomial = ["0", "-1", "0", "1"];
}, /no irreducible-mod-prime certificate/);
reject("runtime precision policy", value => { value.precision = "193"; }, /precision is not/);
reject("discriminant", value => { value.analytic_discriminant = "32075641032117"; },
  /discriminant disagrees/);
reject("index", value => { value.prep_index = "2"; }, /index does not explain/);
reject("basis", value => { value.prep_zk[6] = String(BigInt(value.prep_zk[6]) + 1n); },
  /basis inverse/);
reject("inverse", value => { value.prep_invzk[6] = String(BigInt(value.prep_invzk[6]) + 1n); },
  /basis inverse/);
reject("basis degree", value => { value.prep_zk_degrees[2] = "1"; }, /is false/);
reject("multiplication tensor", value => {
  value.basis_table[26] = String(BigInt(value.basis_table[26]) + 1n);
}, /multiplication tensor is false/);
reject("embedding alias", value => {
  value.preparation_embedding[3] = String(BigInt(value.preparation_embedding[3]) + (1n << 240n));
}, /M\/G transformation is false/);
reject("embedding homomorphism", value => {
  const index = 1;
  const perturbation = 1n << 240n;
  value.admission_matrix_m[index] = String(BigInt(value.admission_matrix_m[index]) + perturbation);
  value.preparation_embedding[3 * index] = value.admission_matrix_m[index];
}, /violates product/);
reject("rounded embedding", value => {
  value.preparation_rounded_embedding[8] = String(BigInt(value.preparation_rounded_embedding[8]) + 1n);
}, /rounded embedding entry/);
reject("admission prime table", value => {
  [value.admission_primes[100], value.admission_primes[101]] =
    [value.admission_primes[101], value.admission_primes[100]];
}, /prime table is not exhaustive/);
reject("admission product table", value => {
  value.admission_products[0] = String(BigInt(value.admission_products[0]) + 2n);
}, /product table is not PARI/);
reject("analytic prime table", value => { value.analytic_primes.pop(); }, /wrong length/);

console.log(JSON.stringify({
  schema: "sagejs.pari-class-group/prepared-nf-authentication-check-v2",
  inputPath: path.resolve(inputPath),
  authority,
  genericArithmetic: (() => {
    const rows = [
      { polynomial: [-1n, -1n, 0n, 0n, 1n], discriminant: -283n, realCount: 2n },
      { polynomial: [-1n, -1n, 0n, 0n, 0n, 1n], discriminant: 2869n, realCount: 1n },
    ];
    for (const row of rows) {
      assert.equal(polynomialDiscriminant(row.polynomial), row.discriminant);
      assert.equal(countRealRoots(row.polynomial), row.realCount);
      assert(primesThrough(257).map(Number).some(p => irreducibleModPrime(row.polynomial, p)));
    }
    return rows.map(row => ({
      degree: row.polynomial.length - 1,
      discriminant: String(row.discriminant),
      realCount: String(row.realCount),
    }));
  })(),
  exporterRoundTrip: (() => {
    const exact = value => ({ kind: "integer", value: String(value) });
    const cells = [];
    for (let i = 0; i < original.admission_matrix_m.length; i += 1) {
      const precision = original.admission_matrix_p[i];
      cells.push(String(precision) === "-1"
        ? exact(original.admission_matrix_m[i])
        : { kind: "real", mantissa: exact(original.admission_matrix_m[i]),
          precision: exact(precision), exponent: exact(original.admission_matrix_e[i]) });
    }
    const prepared = {
      degree: exact(original.n),
      signature: [exact(original.admission_real_count), exact(0)],
      precision: exact(original.precision),
      polynomial: original.prep_polynomial.map(exact),
      discriminant: exact(original.analytic_discriminant),
      index: exact(original.prep_index),
      rootsOfUnity: exact(original.analytic_roots_of_unity),
      zkden: exact(original.prep_zkden),
      zk: original.prep_zk.map(exact),
      zkDegrees: original.prep_zk_degrees.map(exact),
      invzk: original.prep_invzk.map(exact),
      multiplicationTensor: original.basis_table.map(exact),
      embeddingM: cells,
      embeddingG: structuredClone(cells),
      roundedEmbedding: original.preparation_rounded_embedding.map(exact),
      primeLimit: exact(original.admission_prime_limit),
      factorLimit: exact(original.admission_factorlimit),
      runtimePrimes: original.admission_primes.map(exact),
      runtimeProducts: original.admission_products.map(exact),
    };
    const bundle = {
      field: { degree: 3, signature: [3, 0], coefficients: [...original.prep_polynomial],
        coefficientOrder: "ascending" },
      prepared,
    };
    assert.deepEqual(authenticatePreparedBundle(bundle), authority);
    const alteredEmbedding = structuredClone(bundle);
    alteredEmbedding.prepared.embeddingG[1].mantissa.value = String(
      BigInt(alteredEmbedding.prepared.embeddingG[1].mantissa.value) + (1n << 240n));
    assert.throws(() => authenticatePreparedBundle(alteredEmbedding), /M\/G transformation is false/);
    const alteredField = structuredClone(bundle);
    alteredField.field.coefficients[0] = String(BigInt(alteredField.field.coefficients[0]) + 1n);
    assert.throws(() => authenticatePreparedBundle(alteredField), /polynomial disagrees/);
    mutations.push("exported embedding alias", "exported field identity");
    return true;
  })(),
  mutationCount: mutations.length,
  rejectedMutations: mutations,
}, null, 2));
