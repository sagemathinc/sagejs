#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row23_index_prime_packet.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json";
const W0_SHA256 = "6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89";
const PARI = path.resolve(process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4");
const ARCHIVE = path.resolve(process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz");
const ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const SOURCE_HASHES = new Map([
  ["src/basemath/base3.c", "5cbf4ebd6c70deb06cfd83f94b8d86368e60cd084f318a003a8ee14821e1cbea"],
  ["src/basemath/base4.c", "46301497631028a5978266bb4a27c2bdf0a13aab8fb60335e3f359438b76d5e7"],
  ["src/basemath/bibli2.c", "ad03adfa80ec125e41cfe435e7ee1ab1c160b2954c074fdd30eef7709ce66d4f"],
  ["src/basemath/hnf_snf.c", "264aef9c86b4454b2761d8424571f74c8ecc5ed38f12aa806800c0bef5f6cdbf"],
]);

const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function pariOracle(directory) {
  const library = path.join(PARI, "Olinux-x86_64");
  const source = path.join(directory, "row23-prime-131-oracle.c");
  const binary = path.join(directory, "row23-prime-131-oracle");
  fs.writeFileSync(source, String.raw`
#include "pari.h"
static void zjson(GEN value) { pari_printf("\"%Ps\"", value); }
static void vector_json(GEN value, long n) {
  putchar('['); for (long i = 1; i <= n; i++) { if (i > 1) putchar(','); zjson(gel(value, i)); } putchar(']');
}
static void matrix_json(GEN value, long n) {
  putchar('['); for (long i = 1; i <= n; i++) for (long j = 1; j <= n; j++) {
    if (i > 1 || j > 1) putchar(','); zjson(gcoeff(value, i, j));
  } putchar(']');
}
int main(void) {
  pari_init(128000000, 10000);
  GEN nf = nfinit(gp_read_str("x^5-2*x^4-141*x^3+772*x^2-970*x+341"), DEFAULTPREC);
  GEN decomposition = idealprimedec(nf, utoipos(131));
  printf("{\"count\":%ld,\"ideals\":[", lg(decomposition) - 1);
  for (long j = 1; j < lg(decomposition); j++) {
    GEN P = gel(decomposition, j), H = pr_hnf(nf, P);
    if (j > 1) putchar(',');
    printf("{\"e\":%ld,\"f\":%ld,\"generator\":", pr_get_e(P), pr_get_f(P));
    vector_json(pr_get_gen(P), 5); printf(",\"hnf\":"); matrix_json(H, 5);
    printf(",\"norm\":"); zjson(pr_norm(P)); putchar('}');
  }
  puts("]}"); pari_close(); return 0;
}`);
  run("cc", ["-O2", `-I${path.join(PARI, "src/headers")}`, `-I${library}`,
    source, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm", "-o", binary]);
  return { result: JSON.parse(run(binary, [])), sourceSha256: sha(fs.readFileSync(source)),
    binarySha256: sha(fs.readFileSync(binary)) };
}

function unpack(output) {
  const count = Number(output.count);
  const descriptors = output.descriptors.slice(0, count * 33);
  return {
    count,
    state: output.state,
    ranks: output.ranks.slice(0, count),
    primes: Array.from({ length: count }, (_, i) => descriptors[i * 33]),
    e: Array.from({ length: count }, (_, i) => descriptors[i * 33 + 1]),
    f: Array.from({ length: count }, (_, i) => descriptors[i * 33 + 2]),
    generators: Array.from({ length: count }, (_, i) => descriptors.slice(i * 33 + 3, i * 33 + 8)),
    descriptors,
    ideals: Array.from({ length: count }, (_, i) => output.ideals.slice(i * 25, i * 25 + 25)),
    norms: output.norms.slice(0, count),
  };
}

async function main() {
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256);
  assert.equal(sha(fs.readFileSync(ARCHIVE)), ARCHIVE_SHA256);
  for (const [relative, expected] of SOURCE_HASHES) {
    const archived = run("tar", ["-xOf", ARCHIVE, `pari-2.17.4/${relative}`]);
    assert.equal(sha(archived), expected);
    assert.equal(fs.readFileSync(path.join(PARI, relative), "utf8"), archived);
  }
  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  const authority = auth.authenticatePreparedNf(prepared);
  assert.equal(authority.degree, 5);
  assert.deepEqual(authority.signature, [5, 0]);
  assert.equal(authority.index, "131");

  const artifactDirectory = fs.mkdtempSync(path.join("/scratch", "sagejs-row23-prime131-"));
  const oracle = pariOracle(artifactDirectory);
  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath).pari_row23_index_prime_packet;
  assert.equal(fn.nativeAvailable, true);
  const make = (length, words = 16, values) =>
    fn.createIntegerBuffer(length, words, values?.map(BigInt));
  const inputs = () => [
    make(125, 16, prepared.basis_table),
    make(25, 16, prepared.admission_matrix_m),
    make(25, 4, prepared.admission_matrix_p),
    make(25, 16, prepared.admission_matrix_e),
  ];
  function nativeOutput(backend) {
    const descriptors = make(165), ranks = make(5, 4), ideals = make(125),
      norms = make(5), state = make(5, 4);
    const count = fn[backend](...inputs(), make(12600, 32), descriptors, ranks, ideals, norms, state);
    return {
      count: String(count),
      descriptors: descriptors.toArray().map(String), ranks: ranks.toArray().map(String),
      ideals: ideals.toArray().map(String), norms: norms.toArray().map(String),
      state: state.toArray().map(String),
    };
  }
  const outputs = Object.fromEntries(["javascript", "gmp", "tagged"].map(backend => [backend, nativeOutput(backend)]));
  assert.deepEqual(outputs.gmp, outputs.javascript);
  assert.deepEqual(outputs.tagged, outputs.javascript);

  const python = run("python3", ["-c", String.raw`
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.row23_index_prime_packet').pari_row23_index_prime_packet
p=json.load(sys.stdin)
d=[0]*165;r=[0]*5;h=[0]*125;n=[0]*5;s=[0]*5
c=f(list(map(int,p['basis_table'])),list(map(int,p['admission_matrix_m'])),list(map(int,p['admission_matrix_p'])),list(map(int,p['admission_matrix_e'])),[0]*12600,d,r,h,n,s)
print(json.dumps({'count':str(c),'descriptors':list(map(str,d)),'ranks':list(map(str,r)),'ideals':list(map(str,h)),'norms':list(map(str,n)),'state':list(map(str,s))}))
`, ROOT, path.join(ROOT, "src/lib")], { input: JSON.stringify(prepared) });
  outputs.cpython = JSON.parse(python);
  assert.deepEqual(outputs.cpython, outputs.javascript);

  const actual = unpack(outputs.gmp);
  assert.equal(actual.count, 3);
  assert.deepEqual(actual.state, ["0", "3", "33", "10", "3"]);
  assert.deepEqual(actual.primes, ["131", "131", "131"]);
  assert.deepEqual(actual.e, oracle.result.ideals.map(ideal => String(ideal.e)));
  assert.deepEqual(actual.f, oracle.result.ideals.map(ideal => String(ideal.f)));
  assert.deepEqual(actual.ideals, oracle.result.ideals.map(ideal => ideal.hnf));
  assert.deepEqual(actual.norms, oracle.result.ideals.map(ideal => ideal.norm));
  assert.notDeepEqual(actual.generators[2], oracle.result.ideals[2].generator,
    "the ideal-identity check must not silently reduce to generator byte equality");

  const shortDescriptors = make(164, 16, Array(164).fill(77));
  const malformedOwners = [shortDescriptors, make(5, 4, Array(5).fill(77)),
    make(125, 16, Array(125).fill(77)), make(5, 16, Array(5).fill(77)),
    make(5, 4, Array(5).fill(77))];
  const before = malformedOwners.map(owner => owner.toArray());
  assert.throws(() => fn.gmp(...inputs(), make(12600, 32), ...malformedOwners),
    /short row23 index-prime packet storage/);
  assert.deepEqual(malformedOwners.map(owner => owner.toArray()), before);

  const receipt = {
    schema: "sagejs.pari-class-group/row23-index-prime-packet-v1",
    fieldId: raw.field.id,
    prime: 131,
    preparedAuthoritySha256: authority.sha256,
    count: actual.count,
    ramification: actual.e,
    residueDegrees: actual.f,
    descriptorRanks: actual.ranks,
    packetNorms: actual.norms,
    descriptorSha256: sha(Buffer.from(JSON.stringify(actual.descriptors))),
    packetHnfSha256: sha(Buffer.from(JSON.stringify(actual.ideals))),
    sourceSha256: sha(fs.readFileSync(SOURCE)),
    coreSha256: sha(fs.readFileSync(built.coreSourcePath)),
    oracleSourceSha256: oracle.sourceSha256,
    oracleBinarySha256: oracle.binarySha256,
    upstreamSourceSha256: Object.fromEntries(SOURCE_HASHES),
    backends: ["CPython", "JavaScript", "native GMP", "native tagged"],
    malformedRejectedBeforeMutation: 1,
    boundary: "authenticated prepared maximal-order multiplication and embeddings only; descriptors, residue degrees, generators, packet HNFs, and norms computed live; pinned PARI results are assertion-only oracle outputs",
    conclusion: "three computed p=131 descriptor packets have exact PARI 2.17.4 HNF identity even when a uniformizer representative differs",
    qualifiedTiming: false,
    artifactDirectory,
  };
  fs.writeFileSync(path.join(artifactDirectory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
