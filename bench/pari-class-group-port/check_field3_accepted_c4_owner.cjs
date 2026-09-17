#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "field3_accepted_c4_owner_coordinator.cjs");
const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
const archive = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz");
const archiveSha = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const fieldName = "x^4-2000022*x-2000042";
const runIdentity = "synthetic-c4-low-64:field3";
const basisTable = [
  1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1,
  0,1,0,0, 0,1,1,0, 1499998,48,-15,37, 621622,13531,-7,14,
  0,0,1,0, 1499998,48,-15,37, -999954,1999925,29,-74, -2418900,810720,13545,-77,
  0,0,0,1, 621622,13531,-7,14, -2418900,810720,13545,-77, 546040180,257065,21935,-27074,
].map(String);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function immutableOwner(directory, name, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const file = path.join(directory, name);
  fs.writeFileSync(file, bytes, { mode: 0o444 });
  return { file, sha256: sha(bytes) };
}

function sourceCatalog(directory) {
  assert.equal(sha(fs.readFileSync(archive)), archiveSha);
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  const lib = path.join(pari, "Olinux-x86_64");
  fs.writeFileSync(source, `#include "pari.h"
#include "${path.join(pari, "src/basemath/buch2.c")}" 
int main(void) {
  pari_init(64000000,10000);
  GEN nf=nfinit(gp_read_str("x^4-2000022*x-2000042"),nbits2prec(192));
  GRHcheck_t S; long n=nf_get_degree(nf),r1=nf_get_r1(nf),r2=(n-r1)/2;
  GEN D=absi_shallow(nf_get_disc(nf)); double ld=dbllog2(D)*M_LN2;
  long bound=primeneeded(n,r1,r2,ld),offset=0;
  init_GRHcheck(&S,n,r1,ld); cache_prime_dec(&S,10001,nf);
  pari_printf("{\\"discriminant\\":\\"%Ps\\",\\"rootsOfUnity\\":\\"%Ps\\",",D,gel(nfrootsof1(nf),1));
  printf("\\"primes\\":["); for(long i=0;i<S.nprimes;i++){if(i)putchar(',');printf("\\"%lu\\"",S.primes[i].p);} printf("],\\"offsets\\":[");
  for(long i=0;i<S.nprimes;i++){GEN f=gel(S.primes[i].dec,1);if(i)putchar(',');printf("\\"%ld\\"",offset);offset+=lg(f)-1;} printf("],\\"counts\\":[");
  for(long i=0;i<S.nprimes;i++){GEN f=gel(S.primes[i].dec,1);if(i)putchar(',');printf("\\"%ld\\"",lg(f)-1);} printf("],\\"degrees\\":[");
  long first=1;for(long i=0;i<S.nprimes;i++){GEN f=gel(S.primes[i].dec,1);for(long j=1;j<lg(f);j++){if(!first)putchar(',');first=0;printf("\\"%ld\\"",f[j]);}} printf("],\\"multiplicities\\":[");
  first=1;for(long i=0;i<S.nprimes;i++){GEN f=gel(S.primes[i].dec,1),e=gel(S.primes[i].dec,2);for(long j=1;j<lg(f);j++){if(!first)putchar(',');first=0;printf("\\"%ld\\"",e[j]);}} printf("],\\"bound\\":%ld}\\n",bound);
  free_GRHcheck(&S); pari_close(); return 0;
}`);
  run("cc", ["-O1", "-fsanitize=undefined", "-fno-sanitize-recover=undefined",
    `-I${path.join(pari, "src/headers")}`, `-I${lib}`, source, `-L${lib}`,
    `-Wl,-rpath,${lib}`, "-lpari", "-lm", "-o", executable]);
  return JSON.parse(run(executable, []));
}

function packedA() {
  const zero = ["1", "0", "-1", "0", "0", "-1", "0"];
  const triple = (mantissa, exponent = 0) => [
    "1", String(mantissa), "64", String(exponent), "0", "-1", "0",
  ];
  const result = Array.from({ length: 39 }, () => zero).flat();
  const columns = [
    [triple(1n << 63n), triple(1n << 63n), triple(-((1n << 64n) - 1n))],
    [triple(1n << 63n), triple(1n << 63n, 1), triple(-(3n * (1n << 62n) - 1n), 1)],
  ];
  for (let column = 0; column < 2; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      result.splice((column * 3 + row) * 7, 7, ...columns[column][row]);
    }
  }
  return result;
}

function predecessors(directory, catalogData, h = 1n << 35n) {
  const transform = Array(301 * 15).fill("0");
  for (let column = 0; column < 15; column += 1) transform[column * 301 + column] = "1";
  const common = { field: fieldName, runIdentity };
  const full = {
    ...common,
    schema: "sagejs.pari-class-group/field3-full-terminal-ancestry-v1",
    targetBits: 64,
    terminalShape: [3, 15],
    transformShape: [301, 15],
    unitColumns: 13,
    classColumns: 2,
    retentionState: [0, 301, 15, 293, 3, 4515, 13, 2],
    imageState: [0, 288, 301, 13, 2, 15, 3744, 576],
    terminalH: [String(h), "0", "0", "1"],
    transform,
  };
  const c3 = {
    ...common,
    schema: "sagejs.pari-class-group/field3-high-precision-A-v1",
    targetBits: 64,
    acceptedShape: [3, 13],
    transformShape: [301, 13],
    kernelState: [0, 288, 301, 13, 3744],
    packedA: packedA(),
    transform: transform.slice(0, 301 * 13),
  };
  const fieldFile = catalogData.owners.field;
  const catalog = catalogData.values.catalog;
  return {
    full: immutableOwner(directory, `full-${h}.json`, full),
    c3: immutableOwner(directory, `c3-${h}.json`, c3),
    field: fieldFile,
    catalog: catalogData.owners.catalog,
    values: { full, c3, field: catalogData.values.field, catalog },
  };
}

function derivedInputs(directory, catalogData, output) {
  const prepared = immutableOwner(directory, "prepared-test.json", {
    schema: "sagejs.pari-class-group/test-field3-prepared-embedding-owner-v1",
    field: fieldName, runIdentity, testOnly: true, requestedBits: 64,
    polynomial: ["-2000042", "-2000022", "0", "0", "1"],
    signature: ["2", "1"], tensor: basisTable,
  });
  const initial = immutableOwner(directory, "initial-test.json", {
    schema: "sagejs.pari-class-group/test-field3-initial-catalog-consequences-v1",
    field: fieldName, runIdentity, testOnly: true, basisTable, residueBound: 6144,
    admission_primes: catalogData.primes,
    admission_prime_offsets: catalogData.offsets,
    admission_prime_counts: catalogData.counts,
    admission_group_f: catalogData.degrees,
    admission_group_e: catalogData.multiplicities,
  });
  const expandedPrimes = [];
  for (let i = 0; i < catalogData.primes.length; i += 1) {
    for (let j = 0; j < Number(catalogData.counts[i]); j += 1) expandedPrimes.push(catalogData.primes[i]);
  }
  const authority = immutableOwner(directory, "authority-test.json", {
    schema: "sagejs.pari-class-group/test-field3-catalog-authority-v1",
    field: fieldName, runIdentity, testOnly: true,
    relationPrimes: expandedPrimes, ramification: catalogData.multiplicities,
  });
  const result = JSON.parse(run(process.execPath, [coordinator, "--operation", "derive-inputs",
    "--profile", "synthetic-test", "--prepared-owner", prepared.file,
    "--prepared-sha256", prepared.sha256, "--initial-owner", initial.file,
    "--initial-sha256", initial.sha256, "--authority-owner", authority.file,
    "--authority-sha256", authority.sha256, "--output-dir", output]));
  return {
    owners: {
      field: { file: result.field.path, sha256: result.field.sha256 },
      catalog: { file: result.catalog.path, sha256: result.catalog.sha256 },
    },
    values: {
      field: JSON.parse(fs.readFileSync(result.field.path)),
      catalog: JSON.parse(fs.readFileSync(result.catalog.path)),
    },
    sources: { prepared, initial, authority },
    result,
  };
}

function acceptArgs(owners, output) {
  return [coordinator, "--operation", "accept",
    "--full-terminal-owner", owners.full.file, "--full-terminal-sha256", owners.full.sha256,
    "--c3-owner", owners.c3.file, "--c3-sha256", owners.c3.sha256,
    "--field-owner", owners.field.file, "--field-sha256", owners.field.sha256,
    "--catalog-owner", owners.catalog.file, "--catalog-sha256", owners.catalog.sha256,
    "--output-dir", output];
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-accepted-c4-"));
try {
  const catalogData = sourceCatalog(temporary);
  assert.equal(catalogData.bound, 6144);
  const output = path.join(temporary, "out");
  const analyticInputs = derivedInputs(temporary, catalogData, output);
  assert.equal(analyticInputs.values.field.discriminant, catalogData.discriminant);
  for (const published of [analyticInputs.result.field, analyticInputs.result.catalog]) {
    assert.equal(fs.statSync(published.path).mode & 0o777, 0o444);
    assert.equal(sha(fs.readFileSync(published.path)), published.sha256);
  }
  const owners = predecessors(temporary, analyticInputs);
  const first = JSON.parse(run(process.execPath, acceptArgs(owners, output)));
  const second = JSON.parse(run(process.execPath, acceptArgs(owners, output)));
  assert.deepEqual(second, first);
  for (const published of [first.acceptedC4, first.analyticAccepted]) {
    assert.equal(fs.statSync(published.path).mode & 0o777, 0o444);
    assert.equal(sha(fs.readFileSync(published.path)), published.sha256);
  }
  const c4 = JSON.parse(fs.readFileSync(first.acceptedC4.path));
  const analytic = JSON.parse(fs.readFileSync(first.analyticAccepted.path));
  assert.equal(c4.candidatePublished, true);
  assert.equal(c4.analyticPending, false);
  assert.equal(c4.candidateClassNumber, String(1n << 35n));
  assert.deepEqual(c4.acceptanceState, ["0", "1", "64", "1"]);
  assert.equal(c4.schema, "sagejs.pari-class-group/test-field3-accepted-c4-v1");
  assert.equal(analytic.schema, "sagejs.pari-class-group/test-field3-analytic-accepted-owner-v1");
  assert.deepEqual(c4.candidateRelations.slice(0, 4), ["1", "0", "0", "1"]);
  assert.equal(c4.analyticOwnerState[0], "6144");
  assert.equal(analytic.acceptedC4OwnerSha256, first.acceptedC4.sha256);
  assert.deepEqual(analytic.regulator, c4.candidateRegulator);
  assert.equal(analytic.classNumber, c4.candidateClassNumber);
  assert.equal(analytic.denominator, c4.candidateDenominator);

  const projection = JSON.parse(run(process.execPath, [coordinator,
    "--operation", "project-c7", "--accepted-c4-owner", first.acceptedC4.path,
    "--accepted-c4-sha256", first.acceptedC4.sha256,
    ...acceptArgs(owners, output).slice(3),
  ]));
  assert.deepEqual(projection, first.analyticAccepted);

  let mutationCases = 0;
  const before = new Set(fs.readdirSync(output));
  const reject = (args, pattern) => {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, pattern);
    assert.deepEqual(new Set(fs.readdirSync(output)), before);
    assert.equal(fs.readdirSync(output).some((name) => name.startsWith(".")), false);
    mutationCases += 1;
  };
  const retry = predecessors(temporary, analyticInputs, 1n);
  reject(acceptArgs(retry, output), /PRECI at 64 bits requests retry at 128 bits/);
  const detached = structuredClone(owners.values.catalog);
  detached.fieldOwnerSha256 = "0".repeat(64);
  const detachedOwner = immutableOwner(temporary, "catalog-detached.json", detached);
  reject(acceptArgs({ ...owners, catalog: detachedOwner }, output), /catalog detached/);
  reject(acceptArgs({ ...owners, c3: { ...owners.c3, sha256: "0".repeat(64) } }, output), /digest changed/);
  const alteredC3 = structuredClone(owners.values.c3);
  alteredC3.transform[0] = "2";
  const alteredC3Owner = immutableOwner(temporary, "c3-altered.json", alteredC3);
  reject(acceptArgs({ ...owners, c3: alteredC3Owner }, output), /transform detached/);
  const alteredAccepted = structuredClone(c4);
  alteredAccepted.analytic.badCheckStatus = 1;
  const alteredAcceptedOwner = immutableOwner(temporary, "accepted-altered.json", alteredAccepted);
  reject([coordinator, "--operation", "project-c7", "--accepted-c4-owner",
    alteredAcceptedOwner.file, "--accepted-c4-sha256", alteredAcceptedOwner.sha256,
    ...acceptArgs(owners, output).slice(3)], /analytic gate was not accepted/);
  const forgedField = structuredClone(owners.values.field);
  forgedField.schema = "sagejs.pari-class-group/field3-analytic-field-v1";
  forgedField.testOnly = false;
  forgedField.runIdentity = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
  const forgedFieldOwner = immutableOwner(temporary, "field-forged-production.json", forgedField);
  const forgedCatalog = structuredClone(owners.values.catalog);
  forgedCatalog.schema = "sagejs.pari-class-group/field3-analytic-prime-catalog-v1";
  forgedCatalog.testOnly = false;
  forgedCatalog.runIdentity = forgedField.runIdentity;
  forgedCatalog.fieldOwnerSha256 = forgedFieldOwner.sha256;
  const forgedCatalogOwner = immutableOwner(temporary, "catalog-forged-production.json", forgedCatalog);
  reject(acceptArgs({ ...owners, field: forgedFieldOwner, catalog: forgedCatalogOwner }, output),
    /predecessor field identity diverged|production identity requires 153088 bits/);
  const alteredLatch = structuredClone(c4);
  alteredLatch.c3Latches[0] = String(BigInt(alteredLatch.c3Latches[0]) + 1n);
  const alteredLatchOwner = immutableOwner(temporary, "accepted-altered-latch.json", alteredLatch);
  reject([coordinator, "--operation", "project-c7", "--accepted-c4-owner",
    alteredLatchOwner.file, "--accepted-c4-sha256", alteredLatchOwner.sha256,
    ...acceptArgs(owners, output).slice(3)], /C4 C3 latches changed/);
  fs.chmodSync(owners.catalog.file, 0o644);
  reject(acceptArgs(owners, output), /not an immutable mode-0444 file/);
  fs.chmodSync(owners.catalog.file, 0o444);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/field3-accepted-c4-check-v1",
    pariArchiveSha256: archiveSha,
    lowPrecisionAccepted: true,
    mutationCases,
    genuinePreciTransition: [64, 128],
    publications: [first.acceptedC4.schema, first.analyticAccepted.schema],
    publication: "content-addressed-idempotent-mode0444",
    authentic153088Run: false,
  }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
