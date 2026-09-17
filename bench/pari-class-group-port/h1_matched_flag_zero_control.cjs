#!/usr/bin/env node
"use strict";

// Source-instrumented PARI 2.17.4 control for the matched H1 boundary.
// The derivative changes no branch or arithmetic expression. It observes the
// first complete relation prefix immediately before hnfspec_i, and the compact
// p192 unit state immediately around the single flag-zero getfu call.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const POLYNOMIAL = "x^3-20018*x+20034";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  const answer = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(answer.status, 0, answer.stderr || String(answer.error));
  return answer.stdout;
}

function instrument(pristine) {
  assert.equal(sha256(pristine), BUCH2_SHA256);
  const notGiven = "static GEN\nnot_given(long reason)\n{";
  const hnf = "          W = hnfspec_i(mat, F.perm, &dep, &B, &C, F.subFB ? lg(F.subFB)-1:0);";
  const getfu = "      fu = getfu(nf, &A, CU? &U: NULL, PREC);";
  for (const marker of [notGiven, hnf, getfu])
    assert.equal(pristine.split(marker).length, 2, `non-unique PARI marker: ${marker}`);

  let source = pristine.replace(
    '#include "paripriv.h"',
    '#include "paripriv.h"\nstatic long matched_getfu_reason; static int matched_relation_emitted;',
  );
  source = source.replace(notGiven, `${notGiven}\n  matched_getfu_reason = reason;`);
  const hookMarker = "/* Nrelid = nb relations per ideal, possibly 0. If flag is set, keep data in\n * algebraic form. */";
  assert.equal(source.split(hookMarker).length, 2);
  source = source.replace(hookMarker, String.raw`
static void matched_int(GEN x) { pari_printf("\"%Ps\"", x); }
static void matched_vec(GEN x) {
  long i; putchar('['); for (i=1;i<lg(x);i++) { if(i>1)putchar(','); matched_int(gel(x,i)); } putchar(']');
}
static void matched_mat(GEN x) {
  long i,j; putchar('['); for(j=1;j<lg(x);j++)for(i=1;i<lgcols(x);i++) {
    if(j>1||i>1)putchar(','); matched_int(gcoeff(x,i,j));
  } putchar(']');
}
static void matched_real(GEN x) {
  long e=0; if(typ(x)==t_COMPLEX)x=gel(x,1);
  if(typ(x)==t_INT) pari_printf("[\"%Ps\",\"-1\",\"0\"]",x);
  else if(!signe(x)) fputs("[\"0\",\"0\",\"0\"]",stdout);
  else pari_printf("[\"%Ps\",\"%ld\",\"%ld\"]",mantissa_real(x,&e),bit_prec(x),expo(x));
}
static void matched_real_mat(GEN x) {
  long i,j; putchar('['); for(j=1;j<lg(x);j++)for(i=1;i<lgcols(x);i++) {
    if(j>1||i>1)putchar(','); matched_real(gcoeff(x,i,j));
  } putchar(']');
}
static void matched_rng(void) {
  GEN x=getrand(); long i; putchar('['); for(i=0;i<66;i++) {
    ulong w=*int_W(x,i); if(i==65)w&=63; printf("%s\"%lu\"",i?",":"",w);
  } putchar(']');
}
static void matched_relation_prefix(GEN nf, FB_t *F, RELCACHE_t *cache, GEN mat,
                                    long done_small,long small_fail,long nreldep,
                                    long sfb_trials,long LIMC,long LIMC2) {
  REL_t *rel; long count=lg(mat)-1, first=1;
  if(matched_relation_emitted)return; matched_relation_emitted=1;
  printf("{\"kind\":\"relation-prefix\",\"rows\":\"%ld\",\"columns\":\"%ld\",",F->KC,count);
  fputs("\"relations\":",stdout); matched_mat(mat); fputs(",\"generators\":[",stdout);
  for(rel=cache->base+1;rel<cache->last;rel++) {
    if(!first)putchar(','); first=0; if(rel->m)matched_vec(algtobasis(nf,rel->m));else fputs("null",stdout);
  }
  printf("],\"counters\":{\"C1\":\"%ld\",\"C2\":\"%ld\",\"KC\":\"%ld\",\"KCZ\":\"%ld\",\"KCZ2\":\"%ld\",\"doneSmall\":\"%ld\",\"smallFail\":\"%ld\",\"randomRelations\":\"%ld\",\"subfactorTrials\":\"%ld\"},\"terminalRngState\":",LIMC,LIMC2,F->KC,F->KCZ,F->KCZ2,done_small,small_fail,nreldep,sfb_trials);
  matched_rng(); puts("}");
}
static void matched_compact(GEN A, GEN U, GEN R, GEN fu, long PREC) {
  printf("{\"kind\":\"compact-p192\",\"precisionBits\":\"%ld\",\"getfuReason\":\"%ld\",\"cleanLogs\":",prec2nbits(PREC),matched_getfu_reason);
  matched_real_mat(A); fputs(",\"factor\":",stdout); matched_mat(U);
  fputs(",\"regulator\":",stdout); matched_real(R);
  fputs(",\"expandedUnits\":",stdout); if(fu)matched_mat(fu);else fputs("null",stdout);
  fputs(",\"terminalRngState\":",stdout); matched_rng(); puts("}");
}

${hookMarker}`);
  source = source.replace(hnf, `          matched_relation_prefix(nf,&F,&cache,mat,done_small,small_fail,nreldep,sfb_trials,LIMC,LIMC2);\n${hnf}`);
  source = source.replace(getfu, `      matched_getfu_reason = 0;\n${getfu}\n      matched_compact(A,U,R,fu,PREC);`);
  source += String.raw`
int main(void) {
  GEN nf, result; pari_init(768000000,1000000); setrand(gp_read_str("1"));
  nf=nfinit0(gp_read_str("x^3-20018*x+20034"),0,nbits2prec(192));
  result=Buchall_param(nf,0.,0.,BNF_RELPID,0,nbits2prec(192));
  if(!result)return 2; pari_close(); return 0;
}
`;
  return source;
}

function buildAndRun({
  pariRoot = process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4",
  archive = process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz",
} = {}) {
  pariRoot = path.resolve(pariRoot);
  archive = path.resolve(archive);
  assert.equal(sha256(fs.readFileSync(archive)), ARCHIVE_SHA256);
  const pristine = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  const source = instrument(pristine);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-h1-matched-flag-zero-"));
  const cPath = path.join(directory, "control.c");
  const executable = path.join(directory, "control");
  fs.writeFileSync(cPath, source);
  const library = path.join(pariRoot, "Olinux-x86_64");
  run(process.env.CC || "cc", [
    "-O3", "-Wall", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${library}`,
    cPath, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm", "-o", executable,
  ]);
  const stdout = run(executable, []);
  const records = stdout.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records.map(record => record.kind), ["relation-prefix", "compact-p192"]);
  return {
    schema: "sagejs.pari-class-group/h1-matched-flag-zero-control-v1",
    polynomial: POLYNOMIAL,
    archiveSha256: ARCHIVE_SHA256,
    pristineBuch2Sha256: BUCH2_SHA256,
    instrumentedBuch2Sha256: sha256(source),
    executableSha256: sha256(fs.readFileSync(executable)),
    records,
  };
}

module.exports = { ARCHIVE_SHA256, BUCH2_SHA256, buildAndRun, instrument };

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(buildAndRun())}\n`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
