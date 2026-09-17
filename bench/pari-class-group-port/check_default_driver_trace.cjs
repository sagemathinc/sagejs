"use strict";
// Diagnostic boundary tracing of the complete, unmodified-decision PARI driver.
// GPL-2.0-or-later upstream source is extracted from the pinned release archive;
// no source checkout is modified and no timing comparison is made.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const hash = x => createHash('sha256').update(x).digest('hex');
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr || String(r.error));
  return r.stdout;
}
const pari = path.resolve(process.argv[2]);
const archive = path.resolve(process.argv[3]);
const options = process.argv.slice(4);
assert(options.length <= 1 && options.every(x => /^--field[0-3]$/.test(x) || /^--panel-index=\d+$/.test(x)),
  'Expected at most one legacy --field0..3 or --panel-index=N selector');
// `process.argv[1]` keeps this checker usable by the existing VM-based source
// instrumentation controls, which intentionally do not provide `__dirname`.
const panel = JSON.parse(fs.readFileSync(path.join(path.dirname(process.argv[1]), 'panel.json'), 'utf8'));
const legacyPanelIndices = [0, 1, 8, 10];
const panelIndex = options.length === 0 ? 1
  : options[0].startsWith('--field') ? legacyPanelIndices[Number(options[0].slice(-1))]
  : Number(options[0].slice('--panel-index='.length));
assert(Number.isSafeInteger(panelIndex) && panelIndex >= 0 && panelIndex < panel.rows.length,
  'Panel index is outside the frozen panel');
const panelRow = panel.rows[panelIndex];
const explicitPanelSelector = options.length === 1 && options[0].startsWith('--panel-index=');
assert.equal(panelRow.phase, 'tuning', 'Final-reserve rows are closed during development tracing');
assert.equal(panelRow.coefficient_order, 'ascending');
const polynomial = `Polrev([${panelRow.coefficients.join(',')}])`;
const legacyField = legacyPanelIndices.indexOf(panelIndex);
const field = legacyField >= 0 ? legacyField : panelIndex;
const lib = path.join(pari, 'Olinux-x86_64');
assert.equal(hash(fs.readFileSync(archive)), '02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
let source = run('tar', ['-xOf', archive, 'pari-2.17.4/src/basemath/buch2.c']);
assert.equal(hash(source), '904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
function replace(from, to) {
  assert.equal(source.split(from).length, 2, 'Unique instrumentation boundary: ' + from);
  source = source.replace(from, to);
}
// Helpers do not change avma, the random state, or driver-owned objects.
replace('#include "paripriv.h"', `#include "paripriv.h"
static void trace_integer(GEN x) { pari_sp av=avma; pari_printf("\\\"%Ps\\\"",x); set_avma(av); }
static void trace_shape(const char *label,GEN a) { printf("\\\"%s\\\":[%ld,%ld]",label,lg(a)>1?lg(gel(a,1))-1:0,lg(a)-1); }
static void trace_scalar(GEN x) {
  pari_sp av=avma; long e=0;
  if (!x) { printf("null"); return; }
  if (typ(x)==t_INT) trace_integer(x);
  else { printf("{\\\"mantissa\\\":");trace_integer(signe(x)?mantissa_real(x,&e):gen_0);printf(",\\\"precision\\\":%ld,\\\"exponent\\\":%ld}",bit_prec(x),expo(x)); }
  set_avma(av);
}
static void trace_exact(GEN x) {
  long t;
  if (!x) { printf("null"); return; }
  t=typ(x);
  if (t==t_INT) { printf("{\\\"kind\\\":\\\"integer\\\",\\\"value\\\":");trace_integer(x);putchar('}');return; }
  if (t==t_REAL) { long e=0;printf("{\\\"kind\\\":\\\"real\\\",\\\"mantissa\\\":");trace_integer(signe(x)?mantissa_real(x,&e):gen_0);printf(",\\\"precision\\\":%ld,\\\"exponent\\\":%ld}",bit_prec(x),expo(x));return; }
  if (t==t_COMPLEX) { printf("{\\\"kind\\\":\\\"complex\\\",\\\"real\\\":");trace_exact(gel(x,1));printf(",\\\"imag\\\":");trace_exact(gel(x,2));putchar('}');return; }
  if (t==t_FRAC || t==t_RFRAC || t==t_INTMOD || t==t_POLMOD || t==t_QUAD) {
    printf("{\\\"kind\\\":\\\"pair-%ld\\\",\\\"left\\\":",t);trace_exact(gel(x,1));printf(",\\\"right\\\":");trace_exact(gel(x,2));putchar('}');return;
  }
  if (t==t_VECSMALL) { printf("{\\\"kind\\\":\\\"small-vector\\\",\\\"values\\\":[");for(long i=1;i<lg(x);i++){if(i>1)putchar(',');printf("\\\"%ld\\\"",x[i]);}printf("]}");return; }
  if (t==t_POL) { printf("{\\\"kind\\\":\\\"polynomial\\\",\\\"variable\\\":%ld,\\\"coefficients\\\":[",varn(x));long d=degpol(x);for(long i=0;i<=d;i++){if(i)putchar(',');trace_exact(gel(x,i+2));}printf("]}");return; }
  if (t==t_VEC || t==t_COL || t==t_MAT) { printf("{\\\"kind\\\":\\\"%s\\\",\\\"values\\\":[",t==t_VEC?"vector":t==t_COL?"column":"matrix");for(long i=1;i<lg(x);i++){if(i>1)putchar(',');trace_exact(gel(x,i));}printf("]}");return; }
  printf("{\\\"kind\\\":\\\"pari-%ld\\\",\\\"value\\\":\\\"",t);pari_printf("%Ps",x);printf("\\\"}");
}
static GEN trace_component(GEN column,long row,long r1) {
  if (row<r1) return gel(column,row+1);
  GEN v=gel(column,r1+1+(row-r1)/2);
  if (typ(v)==t_COMPLEX) return gel(v,1+(row-r1)%2);
  return (row-r1)%2? gen_0: v;
}
static void trace_matrix_flat(GEN x) { printf("[");long first=1;for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++){if(!first)putchar(',');first=0;trace_exact(gcoeff(x,i,j));}putchar(']'); }
static void trace_matrix_row_flat(GEN x) { printf("[");long first=1,nc=lg(x)-1,nr=nc?lg(gel(x,1))-1:0;for(long i=1;i<=nr;i++)for(long j=1;j<=nc;j++){if(!first)putchar(',');first=0;trace_exact(gcoeff(x,i,j));}putchar(']'); }
static void trace_rng(void) { GEN r=getrand();printf("[");for(long i=0;i<66;i++){ulong v=*int_W(r,i);if(i==65)v&=63;if(i)putchar(',');printf("\\\"%lu\\\"",v);}putchar(']'); }
static void trace_prepared(GEN nf,GEN zu,long precision) {
  long n=nf_get_degree(nf),r1,r2;nf_get_sign(nf,&r1,&r2);GEN T=nf_get_pol(nf),zk=nf_get_zkprimpart(nf),M=nf_get_M(nf);
  printf("{\\\"event\\\":\\\"prepared\\\",\\\"degree\\\":%ld,\\\"signature\\\":[%ld,%ld],\\\"precision\\\":%ld,\\\"polynomial\\\":[",n,r1,r2,precision);
  for(long i=0;i<=degpol(T);i++){if(i)putchar(',');trace_integer(polcoef_i(T,i,-1));}
  printf("],\\\"discriminant\\\":");trace_integer(nf_get_disc(nf));printf(",\\\"index\\\":");trace_integer(nf_get_index(nf));printf(",\\\"rootsOfUnity\\\":");trace_exact(zu);
  printf(",\\\"zkden\\\":");trace_integer(nf_get_zkden(nf));printf(",\\\"zk\\\":[");for(long j=1;j<=n;j++)for(long i=0;i<n;i++){if(j>1||i)putchar(',');trace_integer(polcoef_i(gel(zk,j),i,-1));}
  printf("],\\\"zkDegrees\\\":[");for(long j=1;j<=n;j++){if(j>1)putchar(',');printf("%ld",typ(gel(zk,j))==t_POL?degpol(gel(zk,j)):0);}printf("],\\\"invzk\\\":");trace_matrix_flat(nf_get_invzk(nf));
  printf(",\\\"multiplicationTensor\\\":[");for(long a=1;a<=n;a++)for(long b=1;b<=n;b++){GEN c=tablemul_ei_ej(nf,a,b);for(long i=1;i<=n;i++){if(a>1||b>1||i>1)putchar(',');trace_integer(gel(c,i));}}putchar(']');
  printf(",\\\"embeddingM\\\":[");for(long row=0;row<n;row++)for(long j=1;j<=n;j++){if(row||j>1)putchar(',');trace_exact(trace_component(gel(M,j),row,r1));}printf("],\\\"embeddingG\\\":");trace_matrix_row_flat(nf_get_G(nf));printf(",\\\"roundedEmbedding\\\":");trace_matrix_row_flat(nf_get_roundG(nf));
  printf(",\\\"factorLimit\\\":%lu,\\\"primeLimit\\\":%lu,\\\"runtimePrimes\\\":[",GP_DATA->factorlimit,maxprimelim());for(long i=1;i<=pari_PRIMES[0];i++){if(i>1)putchar(',');printf("%lu",pari_PRIMES[i]);}printf("],\\\"runtimeProducts\\\":");trace_exact(prodprimes());printf("}\\n");
}`);
replace('} RELCACHE_t;', `} RELCACHE_t;
static void trace_relations(RELCACHE_t *cache) {
  printf("[");for(REL_t *r=cache->base+1;r<=cache->last;r++){if(r>cache->base+1)putchar(',');printf("{\\\"R\\\":");trace_exact(r->R);printf(",\\\"nz\\\":%ld,\\\"m\\\":",r->nz);trace_exact(r->m);printf(",\\\"origin\\\":%ld,\\\"automorphism\\\":%ld}",r->relorig,r->relaut);}putchar(']');
}`);
replace('  gel(zu,2) = nf_to_scalar_or_alg(nf, gel(zu,2));', `  gel(zu,2) = nf_to_scalar_or_alg(nf, gel(zu,2));
  trace_prepared(nf,zu,PREC);`);
replace('  if (lg(F.subFB) == 1) goto START;', `  if (lg(F.subFB) == 1) goto START;
  printf("{\\\"event\\\":\\\"factor_base\\\",\\\"attempt\\\":%ld,\\\"precision\\\":%ld,\\\"C1\\\":%ld,\\\"C2\\\":%ld,\\\"KC\\\":%ld,\\\"KCZ\\\":%ld,\\\"KCZ2\\\":%ld,\\\"subfactorCount\\\":%ld,\\\"ballvol\\\":%.17g,\\\"FB\\\":",TRIES,PREC,LIMC,LIMC2,F.KC,F.KCZ,F.KCZ2,lg(F.subFB)-1,F.ballvol);trace_exact(F.FB);printf(",\\\"LP\\\":");trace_exact(F.LP);printf(",\\\"perm\\\":");trace_exact(F.perm);printf(",\\\"subfactor\\\":");trace_exact(F.subFB);printf(",\\\"embeddingPermutation\\\":");trace_exact(F.embperm);printf(",\\\"rng\\\":");trace_rng();printf("}\\n");`);
replace('  cache.end = cache.last + need;\n\n  if (computed)', `  cache.end = cache.last + need;
  printf("{\\\"event\\\":\\\"initialized\\\",\\\"relations\\\":%ld,\\\"target\\\":%ld,\\\"need\\\":%ld,\\\"Nrelid\\\":%ld,\\\"basis\\\":",cache.last-cache.base,cache.end-cache.base,need,Nrelid);trace_exact(cache.basis);printf(",\\\"missing\\\":%lu,\\\"relationRecords\\\":",cache.missing);trace_relations(&cache);printf(",\\\"rng\\\":");trace_rng();printf("}\\n");

  if (computed)`);
replace('  if (DEBUGLEVEL>1)\n  {\n    if (DEBUGLEVEL>3) err_printf("\\n");\n    err_printf("BOUND = %.4g\\n",BOUND);\n  }', `  if (DEBUGLEVEL>1)
  {
    if (DEBUGLEVEL>3) err_printf("\\n");
    err_printf("BOUND = %.4g\\n",BOUND);
  }
  printf("{\\\"event\\\":\\\"ideal_probe\\\",\\\"jid\\\":%ld,\\\"jid0\\\":%ld,\\\"e0\\\":%ld,\\\"Nrelid\\\":%ld,\\\"bound\\\":%.17g,\\\"idealNorm\\\":",jid,jid0,e0,Nrelid,BOUND);trace_exact(NI);printf(",\\\"ideal\\\":");trace_exact(I);printf(",\\\"reducedIdeal\\\":");trace_exact(ideal);printf(",\\\"cholesky\\\":");trace_exact(r);printf(",\\\"rng\\\":");trace_rng();printf("}\\n");`);
replace('    if (add_rel(cache, F, R, nz, gx, rex? 1: 0) <= 0)\n    {', `    long trace_add_result = add_rel(cache, F, R, nz, gx, rex? 1: 0);
    printf("{\\\"event\\\":\\\"relation_candidate\\\",\\\"jid\\\":%ld,\\\"jid0\\\":%ld,\\\"e0\\\":%ld,\\\"nz\\\":%ld,\\\"addResult\\\":%ld,\\\"coordinates\\\":",jid,jid0,e0,nz,trace_add_result);trace_exact(gx);printf(",\\\"row\\\":");trace_exact(R);printf(",\\\"factorization\\\":[");for(long trace_i=1;trace_i<=fact[0].pr;trace_i++){if(trace_i>1)putchar(',');printf("[\\\"%ld\\\",\\\"%ld\\\"]",fact[trace_i].pr,fact[trace_i].ex);}printf("],\\\"rng\\\":");trace_rng();printf("}\\n");
    if (trace_add_result <= 0)
    {`);
replace('        if (lg(F.L_jid) > 1) small_norm(&cache, &F, nf, Nrelid, fact, j);', `        if (lg(F.L_jid) > 1) {
          printf("{\\\"event\\\":\\\"small_norm_before\\\",\\\"j\\\":%ld,\\\"relations\\\":%ld,\\\"target\\\":%ld,\\\"search\\\":",j,cache.last-cache.base,cache.end-cache.base);trace_exact(F.L_jid);printf(",\\\"perm\\\":");trace_exact(F.perm);printf(",\\\"subfactor\\\":");trace_exact(F.subFB);printf(",\\\"rng\\\":");trace_rng();printf("}\\n");
          small_norm(&cache, &F, nf, Nrelid, fact, j);
          printf("{\\\"event\\\":\\\"small_norm_after\\\",\\\"relations\\\":%ld,\\\"missing\\\":%lu,\\\"basis\\\":",cache.last-cache.base,cache.missing);trace_exact(cache.basis);printf(",\\\"relationRecords\\\":");trace_relations(&cache);printf(",\\\"rng\\\":");trace_rng();printf("}\\n");
        }`);
replace('        rnd_rel(&cache, &F, nf, fact);', `        rnd_rel(&cache, &F, nf, fact);
        printf("{\\\"event\\\":\\\"random_relations\\\",\\\"relations\\\":%ld,\\\"basis\\\":",cache.last-cache.base);trace_exact(cache.basis);printf(",\\\"relationRecords\\\":");trace_relations(&cache);printf(",\\\"rng\\\":");trace_rng();printf("}\\n");`);
replace('        gerepileall(av2, 5, &W,&C,&B,&dep,&embs);', `        gerepileall(av2, 5, &W,&C,&B,&dep,&embs);
        printf("{\\\"event\\\":\\\"hnf\\\",\\\"relations\\\":%ld,\\\"newRelations\\\":%ld,\\\"precision\\\":%ld,",cache.last-cache.base,cache.last-cache.chk,PREC);
        trace_shape("W",W);putchar(',');trace_shape("B",B);putchar(',');trace_shape("dep",dep);putchar(',');trace_shape("C",C);putchar(',');trace_shape("embeddings",embs);printf(",\\\"exactW\\\":");trace_exact(W);printf(",\\\"exactB\\\":");trace_exact(B);printf(",\\\"exactDep\\\":");trace_exact(dep);printf(",\\\"exactC\\\":");trace_exact(C);printf(",\\\"exactEmbeddings\\\":");trace_exact(embs);printf(",\\\"perm\\\":");trace_exact(F.perm);printf(",\\\"relationRecords\\\":");trace_relations(&cache);printf("}\\n");`);
replace('    R = compute_multiple_of_R(Ar, RU, N, &need, &bit, &lambda);', `    R = compute_multiple_of_R(Ar, RU, N, &need, &bit, &lambda);
    printf("{\\\"event\\\":\\\"regulator_multiple\\\",\\\"zc\\\":%ld,\\\"need\\\":%ld,\\\"bit\\\":%ld,\\\"lambdaPresent\\\":%s,\\\"R\\\":",zc,need,bit,lambda?"true":"false");trace_scalar(R);printf(",\\\"exactR\\\":");trace_exact(R);printf(",\\\"lambda\\\":");trace_exact(lambda);printf("}\\n");`);
replace('    i = compute_R(lambda, mulir(h,invhr), &L, &R);', `    i = compute_R(lambda, mulir(h,invhr), &L, &R);
    printf("{\\\"event\\\":\\\"acceptance\\\",\\\"code\\\":%ld,\\\"h\\\":",i);trace_integer(h);printf(",\\\"R\\\":");trace_scalar(R);printf(",\\\"exactR\\\":");trace_exact(R);printf(",\\\"lambda\\\":");trace_exact(lambda);printf(",\\\"lattice\\\":");trace_exact(L);printf(",\\\"rng\\\":");trace_rng();printf("}\\n");`);
replace('    F.KCZ2 = 0; /* be honest only once */', `    printf("{\\\"event\\\":\\\"honesty_complete\\\",\\\"extraRequired\\\":%s}\\n",F.KCZ2>F.KCZ?"true":"false");
    F.KCZ2 = 0; /* be honest only once */`);
replace('      CU = CU? ZM_mul(CU, U): cgetg(1, t_MAT);', `      CU = CU? ZM_mul(CU, U): cgetg(1, t_MAT);
      printf("{\\\"event\\\":\\\"fundamental_units\\\",\\\"A\\\":");trace_exact(A);printf(",\\\"U\\\":");trace_exact(U);printf(",\\\"CU\\\":");trace_exact(CU);printf(",\\\"fu\\\":");trace_exact(fu);printf(",\\\"regulator\\\":");trace_exact(R);printf("}\\n");`);
replace('  clg1 = class_group_gen(nf,W,Ce,Vbase,PREC, &clg2);', `  printf("{\\\"event\\\":\\\"class_group_input\\\",\\\"W\\\":");trace_exact(W);printf(",\\\"Ce\\\":");trace_exact(Ce);printf(",\\\"Vbase\\\":");trace_exact(Vbase);printf(",\\\"B\\\":");trace_exact(B);printf(",\\\"unitLogs\\\":");trace_exact(A);printf(",\\\"relationRecords\\\":");trace_relations(&cache);printf("}\\n");
  clg1 = class_group_gen(nf,W,Ce,Vbase,PREC, &clg2);
  printf("{\\\"event\\\":\\\"class_group_output\\\",\\\"clg1\\\":");trace_exact(clg1);printf(",\\\"clg2\\\":");trace_exact(clg2);printf("}\\n");`);
replace('  res = buchall_end(nf,res,clg2,W,B,A,Ce,Vbase);', `  res = buchall_end(nf,res,clg2,W,B,A,Ce,Vbase);
  printf("{\\\"event\\\":\\\"final_state\\\",\\\"result\\\":");trace_exact(res);printf("}\\n");`);
// Observe repeated driver and collection passes without changing their policy.
replace('START:\n  if (DEBUGLEVEL) timer_start(&T);', `START:
  printf("{\\\"event\\\":\\\"factor_base_start\\\",\\\"attempt\\\":%ld}\\n",TRIES);
  if (DEBUGLEVEL) timer_start(&T);`);
replace('    GEN Ar, C0;\n    do', `    GEN Ar, C0;
    printf("{\\\"event\\\":\\\"driver_pass\\\",\\\"need\\\":%ld,\\\"precision\\\":%ld}\\n",need,PREC);
    do`);
replace('      pari_sp av4 = avma;\n      if (need > 0)', `      pari_sp av4 = avma;
      printf("{\\\"event\\\":\\\"collection_pass\\\",\\\"need\\\":%ld,\\\"relations\\\":%ld}\\n",need,cache.last-cache.base);
      if (need > 0)`);
source += `
int main(void) {
  setvbuf(stdout,NULL,_IOLBF,0);
  pari_init(256000000,10000); DEBUGLEVEL=0;
  GEN nf=nfinit(gp_read_str(${JSON.stringify(polynomial)}),nbits2prec(192));
  GEN bnf=Buchall_param(nf,0.,0.,BNF_RELPID,0,192),cyc=bnf_get_cyc(bnf);
  printf("{\\\"event\\\":\\\"result\\\",\\\"classNumber\\\":");trace_integer(bnf_get_no(bnf));
  printf(",\\\"invariants\\\":[");for(long j=1;j<lg(cyc);j++){if(j>1)putchar(',');trace_integer(gel(cyc,j));}
  printf("],\\\"regulator\\\":");trace_scalar(bnf_get_reg(bnf));printf("}\\n");pari_close();return 0;
}
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sagejs-default-driver-'));
fs.writeFileSync(path.join(dir, 'oracle.c'), source);
run('cc', ['-O1', '-fsanitize=undefined', '-fno-sanitize-recover=undefined', '-I'+path.join(pari,'src/headers'), '-I'+lib, path.join(dir,'oracle.c'), '-L'+lib, '-Wl,-rpath,'+lib, '-lpari', '-lm', '-o', path.join(dir,'oracle')]);
const execution = spawnSync(path.join(dir, 'oracle'), [], { encoding: 'utf8', timeout: 600000, maxBuffer: 512 * 1024 * 1024 });
fs.writeFileSync(path.join(dir, 'stdout.txt'), execution.stdout || '');
fs.writeFileSync(path.join(dir, 'stderr.txt'), execution.stderr || '');
if (execution.status !== 0) {
  console.error(JSON.stringify({ field, polynomial, directory: dir, status: execution.status, error: String(execution.error || ''), partialTraceRetained: true }));
}
assert.equal(execution.status, 0, execution.stderr || String(execution.error));
const text = execution.stdout;
const events = text.trim().split('\n').map(line => JSON.parse(line));
const prepared = events.find(event => event.event === 'prepared');
assert(prepared, 'Prepared-state event is missing');
assert.equal(prepared.degree, panelRow.degree);
assert.deepEqual(prepared.signature, panelRow.signature);
assert.deepEqual(prepared.polynomial, panelRow.coefficients);
assert.equal(events.at(-1).event, 'result');
if (panelIndex === 1) {
  assert.equal(events.at(-1).classNumber, '3');
  assert.deepEqual(events.at(-1).invariants, ['3']);
  const acceptance = events.findLast(e => e.event === 'acceptance');
  assert.equal(acceptance.code, 0);
  assert.deepEqual(acceptance.R, { mantissa: '3895441961913051012156655978319959870688113589397982850906', precision: 192, exponent: 17 });
}
const eventCounts = {};
for (const event of events) eventCounts[event.event] = (eventCounts[event.event] || 0) + 1;
const decisionSummary = {
  factorBaseAttempts: events.filter(event => event.event === 'factor_base').map(event => event.attempt),
  driverPrecisions: events.filter(event => event.event === 'driver_pass').map(event => event.precision),
  acceptanceCodes: events.filter(event => event.event === 'acceptance').map(event => event.code),
  naturalRandomRelationPasses: eventCounts.random_relations || 0,
  honestyExtraRequired: events.filter(event => event.event === 'honesty_complete').map(event => event.extraRequired),
};
const receipt = { diagnosticOnly: true, qualificationExecutionEnabled: false,
  field, panelIndex, fieldId: panelRow.id, preparedPolynomial: polynomial,
  preparedPrecision: 192, sourceHash: hash(source), directory: dir,
  eventCount: events.length, eventCounts, decisionSummary, preparedSha256: hash(JSON.stringify(prepared)),
  eventsSha256: hash(JSON.stringify(events)), terminalResultSha256: hash(JSON.stringify(events.at(-1))) };
if (explicitPanelSelector) {
  const fieldIdentity = { panelIndex, id: panelRow.id, stratum: panelRow.stratum,
    degree: panelRow.degree, signature: panelRow.signature, unitRank: panelRow.unit_rank,
    polynomialSha256: panelRow.polynomial_sha256, coefficients: panelRow.coefficients,
    coefficientOrder: panelRow.coefficient_order };
  assert(!Object.keys(fieldIdentity).some(key => /reference|historical|classNumber|regulator/i.test(key)));
  const payload = { schema: 'sagejs.pari-class-group/development-default-driver-trace-v1',
    diagnosticOnly: true, qualificationExecutionEnabled: false, reserveOpened: false,
    oracle: { pariVersion: '2.17.4',
      archiveSha256: '02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53',
      buch2Sha256: '904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac',
      instrumentedSourceSha256: receipt.sourceHash },
    field: fieldIdentity,
    preparationBoundary: 'maximal-order nfinit at the precision selected by pristine Buchall_param; no factor base, relations, capacities, retry decisions, class data, units, or regulator are supplied as inputs',
    prepared, events };
  const payloadPath = path.join(dir, 'payload.json');
  fs.writeFileSync(payloadPath, JSON.stringify(payload)+'\n');
  const payloadBytes = fs.readFileSync(payloadPath);
  Object.assign(receipt, { payloadPath, payloadBytes: payloadBytes.length,
    payloadSha256: hash(payloadBytes) });
  console.log(JSON.stringify(receipt));
} else {
  fs.writeFileSync(path.join(dir, 'trace.json'), JSON.stringify(events, null, 2)+'\n');
  console.log(JSON.stringify({ ...receipt, events }, null, 2));
}
