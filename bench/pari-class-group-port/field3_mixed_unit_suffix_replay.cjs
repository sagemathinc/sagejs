"use strict";

// Build a diagnostic entry point around pristine PARI.  It captures the
// actual field-3 owners at the fundamental-unit block; no captured result is
// used to choose a transform in the translated implementation.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 900000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function liveField3() {
  const pari = path.resolve(
    process.argv[2] ||
      "/scratch/sagejs-runtime/pari-class-group-e2e-20260916/toolchains/src/pari-2.17.4-phase0",
  );
  const archive = path.resolve(
    process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  assert.equal(
    hash(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  let source = run("tar", [
    "-xOf",
    archive,
    "pari-2.17.4/src/basemath/buch2.c",
  ]);
  assert.equal(
    hash(source),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  );
  source = source.replace(
    '#include "paripriv.h"',
    '#include "paripriv.h"\nstatic GEN oA,oL,oAU,oClean,oR,oU1,oU2,oU,oFinalA,oFinalU; static long oreason,oprec,ozc;',
  );
  const notGiven = "static GEN\nnot_given(long reason)\n{";
  assert.equal(source.split(notGiven).length, 2);
  source = source.replace(notGiven, `${notGiven}\n  oreason = reason;`);
  const first = "      U = ZM_lll(L, 0.99, LLL_IM);\n      U = ZM_mul(U, lll(RgM_ZM_mul(real_i(A), U)));";
  assert.equal(source.split(first).length, 2);
  source = source.replace(
    first,
    "      oA=gclone(A); oL=gclone(L); oR=gclone(R); oprec=PREC; ozc=zc;\n" +
      "      U = ZM_lll(L, 0.99, LLL_IM); oU1=gclone(U);\n" +
      "      oU2=gclone(lll(RgM_ZM_mul(real_i(A), U))); U = ZM_mul(U, oU2); oU=gclone(U);",
  );
  const clean = "      A = cleanarchunit(AU, N, NULL, PREC);";
  assert.equal(source.split(clean).length, 2);
  source = source.replace(
    clean,
    `${clean}\n      oAU=gclone(AU); if(A) oClean=gclone(A);`,
  );
  const getfu = "      fu = getfu(nf, &A, CU? &U: NULL, PREC);";
  assert.equal(source.split(getfu).length, 2);
  source = source.replace(
    getfu,
    `${getfu}\n      oFinalA=gclone(A); if(U) oFinalU=gclone(U);`,
  );
  source += String.raw`
static GEN ore(GEN x){return typ(x)==t_COMPLEX?gel(x,1):x;}
static GEN oim(GEN x){return typ(x)==t_COMPLEX?gel(x,2):gen_0;}
static void scalar(GEN x){long e=0;if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static void logs(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');GEN z=gcoeff(x,i,j);printf("[%ld,",typ(z)==t_COMPLEX?2:1);scalar(ore(z));putchar(',');scalar(oim(z));putchar(']');}putchar(']');}
static void zmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(x,i,j));}putchar(']');}
int main(){pari_init(1200000000,10000);GEN nf=nfinit(gp_read_str("x^4-2000022*x-2000042"),nbits2prec(192)),tensor=cgetg(5,t_VEC);for(long j=1;j<=4;j++)gel(tensor,j)=zk_multable(nf,col_ei(4,j));oreason=0;(void)Buchall_param(nf,0.,0.,BNF_RELPID,0,nbits2prec(192));printf("{\"precision\":%ld,\"zc\":%ld,\"A\":",oprec,ozc);logs(oA);printf(",\"L\":");zmat(oL);printf(",\"R\":");scalar(oR);printf(",\"U1\":");zmat(oU1);printf(",\"U2\":");zmat(oU2);printf(",\"U\":");zmat(oU);printf(",\"AU\":");logs(oAU);printf(",\"clean\":");logs(oClean);printf(",\"reason\":%ld,\"finalA\":",oreason);logs(oFinalA);printf(",\"finalU\":");zmat(oFinalU);printf(",\"embedding\":");logs(nf_get_M(nf));printf(",\"tensor\":[");for(long j=1;j<=4;j++){if(j>1)putchar(',');zmat(gel(tensor,j));}puts("]}");pari_close();return 0;}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-field3-unit-"));
  const c = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(c, source);
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", [
    "-O1",
    "-fsanitize=undefined",
    "-fno-sanitize-recover=undefined",
    "-I" + path.join(pari, "src/headers"),
    "-I" + library,
    c,
    "-L" + library,
    "-Wl,-rpath," + library,
    "-lpari",
    "-lm",
    "-o",
    executable,
  ]);
  const text = run(executable, []);
  const value = JSON.parse(text);
  value.traceSha256 = hash(text);
  return value;
}

function retainedField3(pari, archive, initial, analytic) {
  const bench = __dirname;
  let source = fs.readFileSync(
    path.join(bench, "check_post_rnd_lie_iteration.cjs"),
    "utf8",
  );
  // Reuse the authenticated live corridor, extending only its diagnostic
  // output.  Keeping the replay itself in that checker avoids introducing a
  // second implementation of the relation/HNF state transitions.
  source = source.replaceAll("__dirname", JSON.stringify(bench));
  source = source.replace(
    'require("../../tools/native-kernel/compiler.cjs")',
    `require(${JSON.stringify(path.resolve(bench, "../../tools/native-kernel/compiler.cjs"))})`,
  );
  const out = "out={'randomLast':295,";
  assert.equal(source.split(out).length, 2);
  source = source.replace(
    out,
    "out={'A':list(map(str,v['hnf_result_c'][:13*places*7]))," +
      "'L':list(map(str,v['accept_relations'][:26]))," +
      "'R':list(map(str,v['accept_regulator'][:3]))," +
      "'unitRelationState':list(map(str,v['accept_reconstruction_state']))," +
      "'randomLast':295,",
  );
  const summary = "const summary = {\n  field: 3,";
  assert.equal(source.split(summary).length, 2);
  source = source.replace(
    summary,
    `${summary}\n  retainedUnitAuthority: { A: expected.A, L: expected.L, R: expected.R, reconstructionState: expected.unitRelationState },`,
  );
  source = source.replace(
    "nativeSmoke().catch((error) => {",
    "console.log(JSON.stringify(summary));\nPromise.resolve().catch((error) => {",
  );
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-field3-retained-unit-"),
  );
  const script = path.join(directory, "replay.cjs");
  fs.writeFileSync(script, source);
  const value = JSON.parse(
    run("node", [script, pari, archive, initial, analytic]),
  );
  const retained = value.retainedUnitAuthority;
  assert.equal(retained.A.length, 273); // 13 columns * 3 places * 7 words.
  assert.equal(retained.L.length, 26);
  assert.equal(value.cpython.bridgeState[2], 301);
  assert.equal(value.cpython.bridgeState[4], 286);
  retained.authoritySha256 = hash(JSON.stringify(retained));
  retained.terminalColumns = 301;
  retained.retainedBColumns = 286;
  const prepared = liveField3();
  retained.embeddingReal = prepared.embedding.flatMap((entry) => entry[1]);
  retained.embeddingImag = prepared.embedding.flatMap((entry) => entry[2]);
  retained.multiplicationBasis = prepared.tensor.flat(2);
  retained.preparedOwnerSha256 = hash(
    JSON.stringify([
      retained.embeddingReal,
      retained.embeddingImag,
      retained.multiplicationBasis,
    ]),
  );
  return retained;
}

if (require.main === module) {
  assert.equal(
    process.argv.length,
    6,
    "usage: node field3_mixed_unit_suffix_replay.cjs PARI ARCHIVE INITIAL ANALYTIC",
  );
  process.stdout.write(
    JSON.stringify(retainedField3(...process.argv.slice(2))),
  );
}
module.exports = { liveField3, retainedField3, run, hash };
