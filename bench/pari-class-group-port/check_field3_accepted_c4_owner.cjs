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
const runIdentity = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
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
  const preparedOwnerSha256 = "b".repeat(64);
  const field = {
    ...common,
    schema: "sagejs.pari-class-group/field3-analytic-field-v1",
    polynomial: ["-2000042", "-2000022", "0", "0", "1"],
    discriminant: catalogData.discriminant,
    degree: "4",
    realPlaces: "2",
    complexPlaces: "1",
    rootsOfUnity: catalogData.rootsOfUnity,
    preparedOwnerSha256,
  };
  const fieldFile = immutableOwner(directory, `field-${h}.json`, field);
  const catalog = {
    ...common,
    schema: "sagejs.pari-class-group/field3-analytic-prime-catalog-v1",
    fieldOwnerSha256: fieldFile.sha256,
    preparedOwnerSha256,
    primes: catalogData.primes,
    offsets: catalogData.offsets,
    counts: catalogData.counts,
    degrees: catalogData.degrees,
    multiplicities: catalogData.multiplicities,
  };
  return {
    full: immutableOwner(directory, `full-${h}.json`, full),
    c3: immutableOwner(directory, `c3-${h}.json`, c3),
    field: fieldFile,
    catalog: immutableOwner(directory, `catalog-${h}.json`, catalog),
    values: { full, c3, field, catalog },
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
  const owners = predecessors(temporary, catalogData);
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
  assert.deepEqual(c4.candidateRelations.slice(0, 4), ["1", "0", "0", "1"]);
  assert.equal(c4.analyticOwnerState[0], "6144");
  assert.equal(analytic.acceptedC4OwnerSha256, first.acceptedC4.sha256);
  assert.deepEqual(analytic.regulator, c4.candidateRegulator);
  assert.equal(analytic.classNumber, c4.candidateClassNumber);
  assert.equal(analytic.denominator, c4.candidateDenominator);

  const projection = JSON.parse(run(process.execPath, [coordinator,
    "--operation", "project-c7", "--accepted-c4-owner", first.acceptedC4.path,
    "--accepted-c4-sha256", first.acceptedC4.sha256, "--output-dir", output]));
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
  const retry = predecessors(temporary, catalogData, 1n);
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
    "--output-dir", output], /analytic gate was not accepted/);
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
