#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row19_live_unit_result.py");
const COMPACT = "/scratch/sagejs-row19-live-rank1-unit/row19-live-rank1-unit-d0537e45fc9ecb8c89e7252325f612262363df1d84dbe0c507f0e47ea6ac4116.json.gz";
const COMPACT_SHA256 = "d0537e45fc9ecb8c89e7252325f612262363df1d84dbe0c507f0e47ea6ac4116";
const COMPACT_COMPRESSED_SHA256 = "5807069dfc9ff429659d6204f3d01335541893a811ef9405c4fa2c28ca956f5b";
const TERMINAL = "/scratch/sagejs-row19-terminal-continuation/row19-terminal-continuation-f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76.json.gz";
const TERMINAL_SHA256 = "f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76";
const TERMINAL_COMPRESSED_SHA256 = "bfa7c4a68a2571e5c2663fb43b672d7dcaae36905262b0256a318e44221123dd";
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-19-0aab4dadcd4bc7c7.json";
const W0_SHA256 = "0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9";
const OUTPUT = "/scratch/sagejs-row19-live-unit-result";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 300_000,
    maxBuffer: 64*1024*1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function descriptor(file, ownerSha256, compressedSha256) {
  return { path: file, ownerSha256, compressedSha256 };
}

function python(compact, terminal, ancestry) {
  return spawnSync("python3", [SOURCE], { cwd: ROOT, encoding: "utf8",
    input: JSON.stringify({ compact, terminal, ancestry }), timeout: 300_000,
    maxBuffer: 32*1024*1024,
    env: { ...process.env,
      PYTHONPYCACHEPREFIX: "/scratch/sagejs-row19-live-unit-result-cache/check-pycache" } });
}

function sourceOracle(owner, pari, archive) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row19-getfu-"));
  const library = path.join(pari, "Olinux-x86_64");
  assert.equal(sha(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  const sourceSha256 = sha(source);
  assert.equal(sourceSha256,
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac");
  source = source.replace('#include "paripriv.h"',
    '#include "paripriv.h"\nstatic long oracle_reason;');
  const marker = "static GEN\nnot_given(long reason)\n{";
  assert.equal(source.split(marker).length, 2);
  source = source.replace(marker, `${marker}\n  oracle_reason = reason;`);
  source += String.raw`
static GEN rat(const char *n,const char *d,long prec){return gtofp(gdiv(gp_read_str(n),gp_read_str(d)),prec);}
int main(int argc,char **argv){
 if(argc!=9)return 2;pari_init(256000000,10000);long prec=nbits2prec(192);
 GEN nf=nfinit(gp_read_str("x^3-51050867718180330"),prec);
 GEN z0=mkcomplex(rat(argv[1],argv[2],prec),rat(argv[5],argv[6],prec));
 GEN z1=mkcomplex(rat(argv[3],argv[4],prec),rat(argv[7],argv[8],prec));
 GEN A=mkmat(mkcol2(z0,z1)),U=NULL;oracle_reason=0;GEN fu=getfu(nf,&A,&U,prec);
 printf("{\"reason\":%ld,\"fuNull\":%s,\"factorRows\":%ld}\n",oracle_reason,fu?"false":"true",U?lgcols(U)-1:-1L);
 pari_close();return 0;
}
`;
  const c = path.join(directory, "oracle.c"), executable = path.join(directory, "oracle");
  fs.writeFileSync(c, source);
  run("cc", ["-O1", "-fsanitize=undefined", "-fno-sanitize-recover=undefined",
    "-I"+path.join(pari,"src/headers"), "-I"+library, c, "-L"+library,
    "-Wl,-rpath,"+library, "-lpari", "-lm", "-o", executable]);
  const logs = owner.logCertificate;
  const args = [logs.unitReal[0], logs.unitReal[1],
    logs.unitImaginary[0], logs.unitImaginary[1]].flat();
  const text = run(executable, args);
  return { ...JSON.parse(text), sourceSha256, traceSha256: sha(text) };
}

function main() {
  const api = require("./row19_live_unit_result_coordinator.cjs");
  const compactDescriptor = descriptor(COMPACT, COMPACT_SHA256, COMPACT_COMPRESSED_SHA256);
  const terminalDescriptor = descriptor(TERMINAL, TERMINAL_SHA256, TERMINAL_COMPRESSED_SHA256);
  const receipt = api.compose(compactDescriptor, terminalDescriptor, OUTPUT);
  assert.equal(receipt.ownerSha256,
    "ee4828c398ad0b59446e669ac24c1fb482bfc4f7226cf83a92b4f1b67ae44ea9");
  assert.equal(receipt.compressedSha256,
    "3c6b50dd3372bf8e7a840a2de5d0ae4933dba3cd09e02198e67288337601a326");
  assert.equal(receipt.exponentSha256,
    "d16c6852208fe906d02547b408e8957af9f7417c35fba8e1044b98b62b851420");
  assert.equal(receipt.generatorNormsSha256,
    "b452a96b0c3ee5fe00fd6d350eeecb8f479eadc72191ade84013688aebb0bc5f");
  const plain = zlib.gunzipSync(fs.readFileSync(receipt.path));
  assert.equal(sha(plain), receipt.ownerSha256);
  assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);
  const owner = api.verifyOwner(JSON.parse(plain), receipt.ancestry);

  const compact = api.authenticate(compactDescriptor,
    "sagejs.pari-class-group/row19-live-rank1-unit-v1", "compact owner");
  const terminal = api.authenticate(terminalDescriptor,
    "sagejs.pari-class-group/row19-terminal-continuation-owner-v1", "terminal owner");
  for (const [which, mutate] of [
    ["compact", value => { value.factoredUnit.relationExponents[0] = "1"; }],
    ["terminal", value => { value.relationIdentity.records[0] = "4"; }],
    ["terminal", value => { value.relationIdentity.logs[1] =
      String(BigInt(value.relationIdentity.logs[1]) + 1n); }],
    ["terminal", value => { value.relationIdentity.generators[0] = "0"; }],
  ]) {
    const changedCompact = structuredClone(compact), changedTerminal = structuredClone(terminal);
    mutate(which === "compact" ? changedCompact : changedTerminal);
    assert.notEqual(python(changedCompact, changedTerminal, receipt.ancestry).status, 0,
      `${which} mutation was accepted`);
  }

  // Source oracle and frozen answer are deliberately consulted only after the
  // live result has been computed and immutably published.
  const oracle = sourceOracle(owner,
    path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4"),
    path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz"));
  assert.deepEqual({ reason: oracle.reason, fuNull: oracle.fuNull, factorRows: oracle.factorRows },
    { reason: 2, fuNull: true, factorRows: 1 });
  const w0Bytes = fs.readFileSync(W0);
  assert.equal(sha(w0Bytes), W0_SHA256);
  const w0 = JSON.parse(w0Bytes);
  const fundamental = w0.events.filter(event => event.event === "fundamental_units");
  assert.equal(fundamental.length, 1);
  assert.equal(fundamental[0].fu, null);
  assert.deepEqual([fundamental[0].regulator.mantissa, fundamental[0].regulator.precision,
    fundamental[0].regulator.exponent], terminal.regulator.map((value, index) =>
    index === 1 || index === 2 ? Number(value) : value));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-live-unit-result-check-v1",
    owner: receipt.path, ownerSha256: receipt.ownerSha256,
    compressedSha256: receipt.compressedSha256,
    compactOwnerSha256: COMPACT_SHA256, terminalOwnerSha256: TERMINAL_SHA256,
    exactNorm: owner.compactAlgebraicUnit.exactNorm,
    exactInverseNorm: owner.compactAlgebraicUnit.exactInverseNorm,
    principalIdeal: owner.compactAlgebraicUnit.principalIdeal,
    materialization: "not_given(LARGE)", sourceReason: oracle.reason,
    sourceSha256: oracle.sourceSha256, oracleTraceSha256: oracle.traceSha256,
    w0Sha256: W0_SHA256, w0RuntimeInput: false, w0PostcomputeOnly: true,
    mutationRejections: 4,
  })}\n`);
}

try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
