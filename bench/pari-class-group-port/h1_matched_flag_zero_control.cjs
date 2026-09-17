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
  long i,j; putchar('['); for(j=1;j<lg(x);j++)for(i=1;i<lg(gel(x,j));i++) {
    if(j>1||i>1)putchar(',');
    if(typ(gel(x,j))==t_VECSMALL)printf("\"%ld\"",gel(x,j)[i]);
    else matched_int(gcoeff(x,i,j));
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
  for(rel=cache->base+1;rel<=cache->last;rel++) {
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

function instrumentAdaptedRelation(pristine) {
  assert.equal(sha256(pristine), BUCH2_SHA256);
  let source = pristine;
  const replace = (from, to) => {
    assert.equal(source.split(from).length, 2, `non-unique adapted marker: ${from}`);
    source = source.replace(from, to);
  };
  replace(
    '#include "paripriv.h"',
    '#include "paripriv.h"\nstatic GEN matched_ideals,matched_norms;\nstatic long matched_small,matched_fact,matched_ideals_visited;',
  );
  // This is the already-audited eager resident reference boundary: prepare
  // every selected packet once, then make small_norm consume those owners.
  replace(
    "{ Nid = pr_norm(id); id = pr_hnf(nf, id);}",
    "{ Nid = gel(matched_norms,j); id = gel(matched_ideals,j); matched_ideals_visited++; }",
  );
  replace("      gel(y,k) = pr_norm(P);", "      gel(y,k) = gel(matched_norms,k);");
  replace("if (DEBUGLEVEL && Nsmall) (*Nsmall)++;", "if (Nsmall) (*Nsmall)++;");
  replace("if (DEBUGLEVEL && Nfact) (*Nfact)++;", "if (Nfact) (*Nfact)++;");
  replace(
    "  if (DEBUGLEVEL && Nsmall)\n  {",
    "  matched_small=Nsmall; matched_fact=Nfact;\n  if (DEBUGLEVEL && Nsmall)\n  {",
  );
  source += String.raw`
static void mr_int(GEN x){pari_printf("\"%Ps\"",x);}
static void mr_component(GEN x){long e=0;
  if(typ(x)==t_INT)pari_printf("\"%Ps\",\"-1\",\"0\"",x);
  else if(!signe(x))fputs("\"0\",\"-1\",\"0\"",stdout);
  else pari_printf("\"%Ps\",\"%ld\",\"%ld\"",mantissa_real(x,&e),bit_prec(x),expo(x));
}
static void mr_real7(GEN x){
  if(typ(x)==t_COMPLEX){fputs("[\"2\",",stdout);mr_component(gel(x,1));putchar(',');mr_component(gel(x,2));putchar(']');}
  else {fputs("[\"1\",",stdout);mr_component(x);fputs(",\"0\",\"-1\",\"0\"]",stdout);}
}
static void mr_rng(void){GEN x=getrand();putchar('[');for(long i=0;i<66;i++){ulong w=*int_W(x,i);if(i==65)w&=63;printf("%s\"%lu\"",i?",":"",w);}putchar(']');}
static void mr_relations(GEN mat){putchar('[');for(long j=1;j<lg(mat);j++){GEN c=gel(mat,j);for(long i=1;i<lg(c);i++)printf("%s\"%ld\"",j>1||i>1?",":"",c[i]);}putchar(']');}
static void mr_generators(GEN nf,RELCACHE_t *cache,long count){putchar('[');for(long j=1;j<=count;j++){GEN v=algtobasis(nf,cache->base[j].m);for(long i=1;i<lg(v);i++){if(j>1||i>1)putchar(',');mr_int(gel(v,i));}}putchar(']');}
static void mr_metadata(RELCACHE_t *cache,long count){putchar('[');for(long j=1;j<=count;j++){REL_t *r=cache->base+j;printf("%s\"%ld\",\"%ld\",\"%ld\"",j>1?",":"",j,r->relorig,r->relaut);}putchar(']');}
static void mr_descriptors(long count){putchar('[');for(long j=1;j<=count;j++){GEN H=gel(matched_ideals,j);if(j>1)putchar(',');putchar('[');mr_int(gel(matched_norms,j));for(long r=1;r<lgcols(H);r++)for(long c=1;c<lg(H);c++){putchar(',');mr_int(gcoeff(H,r,c));}putchar(']');}putchar(']');}
static void mr_logs(GEN C){putchar('[');for(long j=1;j<lg(C);j++)for(long i=1;i<lg(gel(C,j));i++){if(j>1||i>1)putchar(',');mr_real7(gcoeff(C,i,j));}putchar(']');}
int main(void){
  pari_init(256000000,10000);DEBUGLEVEL=0;
  GEN nf=nfinit(gp_read_str("x^3-20018*x+20034"),nbits2prec(192));
  long N=nf_get_degree(nf),r1=nf_get_r1(nf),r2=nf_get_r2(nf),RU=r1+r2,PREC=nbits2prec(192);
  double LOGD=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2,LOGD2=LOGD*LOGD;
  PREC=maxss(DEFAULTPREC,nf_get_prec(nf));PREC=maxss(PREC,nbits2prec((long)(LOGD2*.02)+N*N));
  GEN cyclic,auts=automorphism_matrices(nf,&cyclic),embperm=automorphism_perms(nf_get_M(nf),auts,cyclic,r1,r2,N);
  GRHcheck_t S;FB_t F={0};RELCACHE_t cache={0};init_GRHcheck(&S,N,r1,LOGD);cache_prime_dec(&S,10007,nf);
  long low=1,high=1;while(!GRHchk(nf,&S,high)){low=high;high*=2;}while(high-low>1){long t=(low+high)/2;if(GRHchk(nf,&S,t))high=t;else low=t;}
  long C2=(high==2&&GRHchk(nf,&S,1))?1:high;if(C2>(long)(4*LOGD2))C2=(long)(4*LOGD2);long C1=maxss(C2,nthideal(&S,nf,N));if(C2<C1)C2=C1;
  setrand(gen_1);FBgen(&F,nf,N,C1,C2,&S);F.embperm=embperm;
  matched_ideals=cgetg(F.KC+1,t_VEC);matched_norms=cgetg(F.KC+1,t_VEC);long packet=0;
  for(long j=1;j<=F.KCZ;j++){GEN group=gel(F.LV,F.FB[j]);for(long k=1;k<lg(group);k++){GEN id=gel(group,k);packet++;gel(matched_ideals,packet)=pr_hnf(nf,id);gel(matched_norms,packet)=pr_norm(id);}}
  double lim=LOGD<20?exp(-N+r2*log(4/M_PI)+LOGD/2)*sqrt(2*M_PI*N):-1;if(lim>=0&&lim<3)lim=3;
  subFBgen(&F,auts,cyclic,lim<0?C2:mindd(lim,C2),MINSFB);long k0=lg(F.subFB)-1;F.L_jid=trim_list(&F);
  FACT *fact=(FACT*)stack_malloc((F.KC+1)*sizeof(FACT));fact[0].pr=0;cache.basis=zero_Flm_copy(F.KC,F.KC);init_rel(&cache,&F,RELSUP+RU-1);
  long initial=cache.last-cache.base;matched_small=matched_fact=matched_ideals_visited=0;small_norm(&cache,&F,nf,BNF_RELPID,fact,0);long count=cache.last-cache.base;
  GEN mat=cgetg(count+1,t_MAT),C=cgetg(count+1,t_MAT);for(long j=1;j<=count;j++){gel(mat,j)=cache.base[j].R;gel(C,j)=get_log_embed(cache.base+j,nf_get_M(nf),RU,r1,PREC);}
  long patterns=0,factors=0;for(long j=0;j<S.nprimes;j++){GEN d=gel(S.primes[j].dec,1),m=gel(S.primes[j].dec,2);patterns+=lg(d)-1;for(long k=1;k<lg(m);k++)factors+=m[k];}
  printf("{\"kind\":\"relation-prefix\",\"rows\":\"%ld\",\"columns\":\"%ld\",\"factorDescriptors\":",F.KC,count);mr_descriptors(F.KC);
  fputs(",\"relations\":",stdout);mr_relations(mat);fputs(",\"generators\":",stdout);mr_generators(nf,&cache,count);
  fputs(",\"metadata\":",stdout);mr_metadata(&cache,count);fputs(",\"logs\":",stdout);mr_logs(C);
  printf(",\"counters\":{\"catalogEntries\":\"%ld\",\"degreeGroups\":\"%ld\",\"factorSlots\":\"%ld\",\"C1\":\"%ld\",\"C2\":\"%ld\",\"KC\":\"%ld\",\"KCZ\":\"%ld\",\"KCZ2\":\"%ld\",\"decompositionCalls\":\"%ld\",\"descriptors\":\"%ld\",\"subfactorTrials\":\"%ld\",\"initialRelations\":\"%ld\",\"acceptedRelations\":\"%ld\",\"visitedIdeals\":\"%ld\",\"smallElements\":\"%ld\",\"factorAttempts\":\"%ld\",\"randomRelations\":\"0\"},\"terminalRngState\":",S.nprimes,patterns,factors,C1,C2,F.KC,F.KCZ,F.KCZ2,F.KCZ,F.KC,k0,initial,count,matched_ideals_visited,matched_small,matched_fact);mr_rng();puts("}");
  delete_cache(&cache);delete_FB(&F);free_GRHcheck(&S);pari_close();return 0;
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
  const relationSource = instrumentAdaptedRelation(pristine);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-h1-matched-flag-zero-"));
  const cPath = path.join(directory, "control.c");
  const executable = path.join(directory, "control");
  const relationCPath = path.join(directory, "relation-control.c");
  const relationExecutable = path.join(directory, "relation-control");
  fs.writeFileSync(cPath, source);
  fs.writeFileSync(relationCPath, relationSource);
  const library = path.join(pariRoot, "Olinux-x86_64");
  run(process.env.CC || "cc", [
    "-O3", "-Wall", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${library}`,
    cPath, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm", "-o", executable,
  ]);
  run(process.env.CC || "cc", [
    "-O3", "-Wall", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${library}`,
    relationCPath, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm", "-o", relationExecutable,
  ]);
  const stockRecords = run(executable, []).trim().split("\n").map(JSON.parse);
  const relationRecord = JSON.parse(run(relationExecutable, []).trim());
  const records = [relationRecord, stockRecords[1]];
  assert.deepEqual(records.map(record => record.kind), ["relation-prefix", "compact-p192"]);
  return {
    schema: "sagejs.pari-class-group/h1-matched-flag-zero-control-v1",
    polynomial: POLYNOMIAL,
    archiveSha256: ARCHIVE_SHA256,
    pristineBuch2Sha256: BUCH2_SHA256,
    instrumentedBuch2Sha256: sha256(source),
    adaptedRelationBuch2Sha256: sha256(relationSource),
    executableSha256: sha256(fs.readFileSync(executable)),
    relationExecutableSha256: sha256(fs.readFileSync(relationExecutable)),
    records,
  };
}

module.exports = {
  ARCHIVE_SHA256,
  BUCH2_SHA256,
  buildAndRun,
  instrument,
  instrumentAdaptedRelation,
};

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(buildAndRun())}\n`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
