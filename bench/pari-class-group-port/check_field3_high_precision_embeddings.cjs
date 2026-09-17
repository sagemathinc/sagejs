"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const TARGET = 153088;
const root = path.resolve(__dirname, "../..");
const pari = path.resolve(process.env.PARI_ROOT || "/home/user/upstream/pari-2.17.4");
const archive = path.resolve(process.env.PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const values = (buffer) =>
  (buffer.toArray ? buffer.toArray() : Array.from(buffer)).map(BigInt);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function pristineOwnerAndEmbedding() {
  assert.equal(sha(fs.readFileSync(archive)), "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "field3-hp-embedding-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(source, String.raw`
#include "pari.h"
static void integer(GEN x){ pari_printf("\"%Ps\"",x); }
static void scalar(GEN x){ long e=0; if (typ(x)==t_INT) { integer(x); printf(",\"-1\",\"0\""); }
  else { if (!signe(x)) printf("\"0\""); else integer(mantissa_real(x,&e));
    printf(",\"%ld\",\"%ld\"",signe(x)?bit_prec(x):0,expo(x)); } }
static void component(GEN x,long imag){ if(typ(x)==t_COMPLEX) scalar(gel(x,imag?2:1)); else if(imag) scalar(gen_0); else scalar(x); }
static void polynomial(GEN x,long n){ putchar('['); for(long i=0;i<=n;i++){if(i)putchar(',');integer(polcoef_i(x,i,-1));}putchar(']'); }
static void basis(GEN zk,long n){ putchar('[');for(long j=1;j<=n;j++)for(long i=0;i<n;i++){if(j>1||i)putchar(',');integer(polcoef_i(gel(zk,j),i,-1));}putchar(']'); }
static void tensor(GEN nf,long n){putchar('[');for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN t=tablemul_ei_ej(nf,i,j);for(long k=1;k<=n;k++){if(i>1||j>1||k>1)putchar(',');integer(gel(t,k));}}putchar(']');}
static void rootvec(GEN ro,long r1){putchar('[');for(long i=1;i<lg(ro);i++){if(i>1)putchar(',');putchar('[');component(gel(ro,i),0);putchar(',');component(gel(ro,i),i>r1);putchar(']');}putchar(']');}
static void matrix(GEN M,long n,long r1){putchar('[');for(long row=1;row<=r1+2*((n-r1)/2);row++)for(long col=1;col<=n;col++){if(row>1||col>1)putchar(',');GEN z=gcoeff(M,row<=r1?row:r1+(row-r1+1)/2,col);component(z,row>r1&&(row-r1)%2==0);}putchar(']');}
int main(void){pari_init(1073741824,10000);GEN p=gp_read_str("x^4-2000022*x-2000042");long resident=nbits2prec(192),target=nbits2prec(${TARGET});
  GEN nf0=nfinit(p,resident),zk=nf_get_zkprimpart(nf0);long n=nf_get_degree(nf0),r1=nf_get_r1(nf0),r2=nf_get_r2(nf0);
  printf("{\"schema\":\"sagejs.pari-class-group/field3-prepared-embedding-owner-v1\",\"runIdentity\":\"pari-2.17.4:nfinit192->nfnewprec153088:field3\",\"polynomial\":");polynomial(nf_get_pol(nf0),n);
  printf(",\"signature\":[%ld,%ld],\"zkden\":",r1,r2);integer(nf_get_zkden(nf0));printf(",\"zk\":");basis(zk,n);printf(",\"tensor\":");tensor(nf0,n);
  GEN nf=nfnewprec(nf0,target);printf(",\"roots\":");rootvec(nf_get_roots(nf),r1);printf(",\"embedding\":");matrix(nf_get_M(nf),n,r1);puts("}");pari_close();return 0;}
`);
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${library}`, source,
    `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm", "-o", executable]);
  const text = run(executable, []);
  return { directory, text, value: JSON.parse(text), sha256: sha(text) };
}

(async () => {
  const oracle = pristineOwnerAndEmbedding();
  if (process.argv.includes("--oracle")) {
    console.log(oracle.text.trim());
    return;
  }
  const ownerCapsule = {
    runIdentity: oracle.value.runIdentity,
    polynomial: oracle.value.polynomial,
    signature: oracle.value.signature,
    zkden: oracle.value.zkden,
    zk: oracle.value.zk,
    tensor: oracle.value.tensor,
  };
  const ownerPath = path.join(oracle.directory, "owner.json");
  fs.writeFileSync(ownerPath, oracle.text);
  const independent = JSON.parse(
    run("python3", [
      path.join(__dirname, "check_field3_high_precision_embeddings.py"),
      ownerPath,
    ]),
  );

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "field3_high_precision_embeddings.py"),
  });
  const api = require(built.modulePath).pari_field3_high_precision_embeddings;
  assert(api.nativeAvailable);
  const integer = (length, initial = []) =>
    api.createIntegerBuffer(length, 154112, initial);
  const int64 = (initial) => api.createInt64Buffer(initial);
  const polynomial = integer(5, oracle.value.polynomial.map(BigInt));
  const signature = int64(oracle.value.signature.map(BigInt));
  const basis = integer(16, oracle.value.zk.map(BigInt));
  const tensor = integer(64, oracle.value.tensor.map(BigInt));
  const scratch = integer(48, Array(48).fill(0n));
  const rootM = integer(4, Array(4).fill(777n));
  const rootP = integer(4, Array(4).fill(777n));
  const rootE = integer(4, Array(4).fill(777n));
  const embeddingM = integer(16, Array(16).fill(777n));
  const embeddingP = integer(16, Array(16).fill(777n));
  const embeddingE = integer(16, Array(16).fill(777n));
  const state = int64(Array(6).fill(777n));
  const started = process.hrtime.bigint();
  assert.equal(
    api.gmp(
      polynomial,
      signature,
      basis,
      37n,
      tensor,
      BigInt(TARGET),
      scratch,
      rootM,
      rootP,
      rootE,
      embeddingM,
      embeddingP,
      embeddingE,
      state,
    ),
    0n,
  );
  const nativeMs = Number(process.hrtime.bigint() - started) / 1e6;
  const expectedRoots = oracle.value.roots
    .map((row) => row.slice(0, 3).map(BigInt))
    .concat([oracle.value.roots[2].slice(3, 6).map(BigInt)]);
  const actualRoots = values(rootM).map((mantissa, index) => [
    mantissa,
    values(rootP)[index],
    values(rootE)[index],
  ]);
  assert.deepEqual(actualRoots, expectedRoots);
  const expectedEmbedding = Array.from({ length: 16 }, (unused, index) =>
    oracle.value.embedding.slice(3 * index, 3 * index + 3).map(BigInt),
  );
  const actualEmbedding = values(embeddingM).map((mantissa, index) => [
    mantissa,
    values(embeddingP)[index],
    values(embeddingE)[index],
  ]);
  const mismatches = actualEmbedding.flatMap((entry, index) =>
    entry.every((value, component) => value === expectedEmbedding[index][component])
      ? []
      : [{
          index,
          mantissaDifference: String(entry[0] - expectedEmbedding[index][0]),
          actualPrecision: String(entry[1]),
          expectedPrecision: String(expectedEmbedding[index][1]),
          exponent: String(entry[2]),
        }],
  );
  assert.deepEqual(mismatches, [{
    index: 6,
    mantissaDifference: "-1",
    actualPrecision: "153152",
    expectedPrecision: "153152",
    exponent: "13",
  }]);

  const heldRoots = actualRoots.flat();
  const heldEmbedding = actualEmbedding.flat();
  const heldState = values(state);
  assert.throws(
    () => api.gmp(polynomial, signature, basis, 37n, tensor, 153024n, scratch,
      rootM, rootP, rootE, embeddingM, embeddingP, embeddingE, state),
    /unsupported field-3 high-precision root target/,
  );
  const wrongBasis = [...oracle.value.zk.map(BigInt)];
  wrongBasis[10] += 1n;
  assert.throws(
    () => api.gmp(polynomial, signature, integer(16, wrongBasis), 37n, tensor,
      BigInt(TARGET), scratch, rootM, rootP, rootE, embeddingM, embeddingP,
      embeddingE, state),
    /wrong field-3 prepared integral basis/,
  );
  assert.deepEqual(
    values(rootM).flatMap((mantissa, index) => [mantissa, values(rootP)[index], values(rootE)[index]]),
    heldRoots,
  );
  assert.deepEqual(
    values(embeddingM).flatMap((mantissa, index) => [
      mantissa,
      values(embeddingP)[index],
      values(embeddingE)[index],
    ]),
    heldEmbedding,
  );
  assert.deepEqual(values(state), heldState);

  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.match(core, /mpz_mul/);
  console.log(JSON.stringify({
    status: "partial-root-subset-complete",
    oracleTraceSha256: oracle.sha256,
    ownerSha256: sha(JSON.stringify(ownerCapsule)),
    runIdentity: oracle.value.runIdentity,
    rootPackedTriplesBitExact: 4,
    embeddingPackedTriplesBitExact: 15,
    embeddingPackedTriplesTotal: 16,
    embeddingMismatch: mismatches,
    missingPrimitive: "pre-truncation get_roots guard-word state used by make_M",
    independent,
    native: {
      backend: "gmp",
      elapsedMs: nativeMs,
      cacheKey: built.cacheKey,
      mpzMul: true,
    },
    transactionalRejections: 2,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
