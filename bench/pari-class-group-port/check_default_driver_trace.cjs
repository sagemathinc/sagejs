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
assert(options.length <= 1 && options.every(x => /^--field[0-3]$/.test(x)), 'Expected at most one --field0|--field1|--field2|--field3');
const field = options.length ? Number(options[0].slice(-1)) : 1;
const polynomial = ['x^3-20018*x+20034', 'x^3-20010*x+20018', 'x^4-20018*x-20034', 'x^4-2000022*x-2000042'][field];
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
}`);
replace('  if (lg(F.subFB) == 1) goto START;', `  if (lg(F.subFB) == 1) goto START;
  printf("{\\\"event\\\":\\\"factor_base\\\",\\\"attempt\\\":%ld,\\\"precision\\\":%ld,\\\"C1\\\":%ld,\\\"C2\\\":%ld,\\\"KC\\\":%ld,\\\"KCZ\\\":%ld,\\\"KCZ2\\\":%ld,\\\"subfactorCount\\\":%ld,\\\"ballvol\\\":%.17g}\\n",TRIES,PREC,LIMC,LIMC2,F.KC,F.KCZ,F.KCZ2,lg(F.subFB)-1,F.ballvol);`);
replace('  cache.end = cache.last + need;\n\n  if (computed)', `  cache.end = cache.last + need;
  printf("{\\\"event\\\":\\\"initialized\\\",\\\"relations\\\":%ld,\\\"target\\\":%ld,\\\"need\\\":%ld,\\\"Nrelid\\\":%ld}\\n",cache.last-cache.base,cache.end-cache.base,need,Nrelid);

  if (computed)`);
replace('        if (lg(F.L_jid) > 1) small_norm(&cache, &F, nf, Nrelid, fact, j);', `        if (lg(F.L_jid) > 1) {
          printf("{\\\"event\\\":\\\"small_norm_before\\\",\\\"j\\\":%ld,\\\"relations\\\":%ld,\\\"target\\\":%ld,\\\"search\\\":%ld}\\n",j,cache.last-cache.base,cache.end-cache.base,lg(F.L_jid)-1);
          small_norm(&cache, &F, nf, Nrelid, fact, j);
          printf("{\\\"event\\\":\\\"small_norm_after\\\",\\\"relations\\\":%ld,\\\"missing\\\":%lu}\\n",cache.last-cache.base,cache.missing);
        }`);
replace('        rnd_rel(&cache, &F, nf, fact);', `        rnd_rel(&cache, &F, nf, fact);
        printf("{\\\"event\\\":\\\"random_relations\\\",\\\"relations\\\":%ld}\\n",cache.last-cache.base);`);
replace('        gerepileall(av2, 5, &W,&C,&B,&dep,&embs);', `        gerepileall(av2, 5, &W,&C,&B,&dep,&embs);
        printf("{\\\"event\\\":\\\"hnf\\\",\\\"relations\\\":%ld,\\\"newRelations\\\":%ld,\\\"precision\\\":%ld,",cache.last-cache.base,cache.last-cache.chk,PREC);
        trace_shape("W",W);putchar(',');trace_shape("B",B);putchar(',');trace_shape("dep",dep);putchar(',');trace_shape("C",C);putchar(',');trace_shape("embeddings",embs);printf("}\\n");`);
replace('    R = compute_multiple_of_R(Ar, RU, N, &need, &bit, &lambda);', `    R = compute_multiple_of_R(Ar, RU, N, &need, &bit, &lambda);
    printf("{\\\"event\\\":\\\"regulator_multiple\\\",\\\"zc\\\":%ld,\\\"need\\\":%ld,\\\"lambdaPresent\\\":%s,\\\"R\\\":",zc,need,lambda?"true":"false");trace_scalar(R);printf("}\\n");`);
replace('    i = compute_R(lambda, mulir(h,invhr), &L, &R);', `    i = compute_R(lambda, mulir(h,invhr), &L, &R);
    printf("{\\\"event\\\":\\\"acceptance\\\",\\\"code\\\":%ld,\\\"h\\\":",i);trace_integer(h);printf(",\\\"R\\\":");trace_scalar(R);printf("}\\n");`);
replace('    F.KCZ2 = 0; /* be honest only once */', `    printf("{\\\"event\\\":\\\"honesty_complete\\\",\\\"extraRequired\\\":%s}\\n",F.KCZ2>F.KCZ?"true":"false");
    F.KCZ2 = 0; /* be honest only once */`);
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
const execution = spawnSync(path.join(dir, 'oracle'), [], { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
fs.writeFileSync(path.join(dir, 'stdout.txt'), execution.stdout || '');
fs.writeFileSync(path.join(dir, 'stderr.txt'), execution.stderr || '');
if (execution.status !== 0) {
  console.error(JSON.stringify({ field, polynomial, directory: dir, status: execution.status, error: String(execution.error || ''), partialTraceRetained: true }));
}
assert.equal(execution.status, 0, execution.stderr || String(execution.error));
const text = execution.stdout;
const events = text.trim().split('\n').map(line => JSON.parse(line));
assert.equal(events.at(-1).event, 'result');
if (field === 1) {
  assert.equal(events.at(-1).classNumber, '3');
  assert.deepEqual(events.at(-1).invariants, ['3']);
  const acceptance = events.findLast(e => e.event === 'acceptance');
  assert.equal(acceptance.code, 0);
  assert.deepEqual(acceptance.R, { mantissa: '3895441961913051012156655978319959870688113589397982850906', precision: 192, exponent: 17 });
}
fs.writeFileSync(path.join(dir, 'trace.json'), JSON.stringify(events, null, 2)+'\n');
console.log(JSON.stringify({ diagnosticOnly: true, field, preparedPolynomial: polynomial, preparedPrecision: 192, sourceHash: hash(source), directory: dir, events }, null, 2));
