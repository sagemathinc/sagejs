"use strict";
// Diagnostic source instrumentation only; never a Sage.js mathematical backend.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const PIN = "ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b";
function run(command, args) {
  const r = spawnSync(command, args, { encoding: "utf8", timeout: 60000, maxBuffer: 8*1024*1024 });
  assert.equal(r.status, 0, r.stderr || String(r.error));
  return r.stdout;
}
const pari = path.resolve(process.argv[2]), archive = path.resolve(process.argv[3]);
const lib = path.join(pari, "Olinux-x86_64");
let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/lll.c"]);
assert.equal(createHash("sha256").update(source).digest("hex"), PIN);
assert.equal(source.split("\nZM_lll_norms(GEN x,").length, 2);
source = source.replace("\nZM_lll_norms(GEN x,", "\nprobe_ZM_lll_norms(GEN x,");
source = source.replace('#include "paripriv.h"', '#include "paripriv.h"\nstatic long stages[5], returns[4], selection[5], qrstatus;');
const qrGuard = "  if (!QR_init(RgM_gtofp(M, prec), &B, &Q, &L, prec) || !gsisinv(L)) return NULL;";
assert.equal(source.split(qrGuard).length, 2);
source = source.replace(qrGuard, "  qrstatus=QR_init(RgM_gtofp(M, prec), &B, &Q, &L, prec);\n  if (!qrstatus || !gsisinv(L)) return NULL;");
const calls = [
  "fplll_fast(&B, &U, DELTA, ETA, keepfirst)",
  "fplll_heuristic(&B, &U, DELTA, ETA, keepfirst, p, p)",
  "fplll_dpe(&G, &B, &U, pN, DELTA, ETA, keepfirst)",
  "fplll(&G, &B, &U, pN, DELTA, ETA, keepfirst, p)",
];
for (let i=0;i<calls.length;i++) {
  const before = "zeros = " + calls[i] + ";";
  assert.equal(source.split(before).length, 2);
  source = source.replace(before, `stages[${i}]++; ${before} returns[${i}]=zeros;`);
}
assert.equal(source.split("  if (useflatter)\n  {").length, 2);
source = source.replace("  if (useflatter)\n  {", "  if (useflatter)\n  { stages[4]++;");
assert.equal(source.split("      useflatter = sz >= thr;").length, 2);
source = source.replace("      useflatter = sz >= thr;", "      selection[0]=1;selection[1]=sz;selection[2]=thr;selection[3]=spr;selection[4]=rank;\n      useflatter = sz >= thr;");
source += `
static void emit_matrix(GEN M) {
 printf("[");for(long i=1;i<lgcols(M);i++)for(long j=1;j<lg(M);j++) {
  char *s=GENtostr(gcoeff(M,i,j));printf("%s\\\"%s\\\"",i==1&&j==1?"":",",s);pari_free(s);
 }printf("]");
}
int main(void) {
 pari_init(128000000,10000);DEBUGLEVEL=0;
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
 long primes[]={2,3,5,7,11,13,17,19};
 for(long f=0;f<4;f++) {
  pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));
  for(long k=0;k<8;k++) {
   pari_sp keep=avma;GEN pr=gel(idealprimedec(nf,stoi(primes[k])),1);
   GEN I=idealhnf(nf,pr), M=ZM_mul(nf_get_roundG(nf),I);
   for(long i=0;i<5;i++)stages[i]=0;
   for(long i=0;i<5;i++)selection[i]=-999;
   qrstatus=-999;
   for(long i=0;i<4;i++)returns[i]=-999;
   GEN U=probe_ZM_lll_norms(M,.99,LLL_IM,NULL);
   long saved[5],result[4];for(long i=0;i<5;i++)saved[i]=stages[i];
   for(long i=0;i<4;i++)result[i]=returns[i];
   if(!gequal(U,ZM_lll_norms(M,.99,LLL_IM,NULL)))return 4;
   GEN B=gcopy(M), V=matid(lg(M)-1);
   long fast=fplll_fast(&B,&V,.99,.51,0);
   if(!equali1(absi(ZM_det(U))) || !gequal(ZM_mul(M,V),B))return 3;
   printf("{\\\"field\\\":%ld,\\\"prime\\\":%ld,\\\"degree\\\":%ld,\\\"stages\\\":[%ld,%ld,%ld,%ld,%ld],\\\"returns\\\":[%ld,%ld,%ld,%ld],\\\"fast_status\\\":%ld,\\\"fast_equals_full\\\":%s,\\\"input\\\":",f,primes[k],lg(M)-1,saved[0],saved[1],saved[2],saved[3],saved[4],result[0],result[1],result[2],result[3],fast,gequal(U,V)?"true":"false");
   emit_matrix(M);printf(",\\\"qr_status\\\":%ld,\\\"selection\\\":[%ld,%ld,%ld,%ld,%ld],\\\"transform\\\":",qrstatus,selection[0],selection[1],selection[2],selection[3],selection[4]);emit_matrix(U);puts("}");avma=keep;
  }avma=outer;
 }pari_close();return 0;
}
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-lll-preparation-"));
const c=path.join(dir,"probe.c"),exe=path.join(dir,"probe");fs.writeFileSync(c,source);
run("cc",["-O2","-fvisibility=hidden","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe]);
assert(!/\b(?:ZM_lll_norms|probe_ZM_lll_norms|ZM_flatter_rank)\b/.test(run("nm",["-D","--defined-only",exe])), "probe must not interpose on shared-library preparation");
const rows=run(exe,[]).trim().split("\n").map(JSON.parse);
assert.equal(rows.length,32);
assert(rows.every(r=>r.input.length===r.degree*r.degree && r.transform.length===r.input.length));
console.log(JSON.stringify({schema:"pari-lll-preparation-diagnostic-v1",sourceSHA256:PIN,stageOrder:["fast","heuristic","dpe","arbitrary_precision","flatter"],qualifiedTiming:false,rows}));
