"use strict";
// Diagnostic only: extract the pinned routine and observe header growth.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
const original=fs.readFileSync(path.join(pari,'src/basemath/trans1.c'),'utf8');
const start=original.indexOf('GEN\nexp1r_abs(GEN x)'),end=original.indexOf('\nGEN\nmpexpm1(',start);
assert(start>=0&&end>start);
let routine=original.slice(start,end).replace('exp1r_abs(GEN x)','diagnostic_exp1r_abs(GEN x)');
const setup='X = rtor(x,L); shiftr_inplace(X, -m); setsigne(X, 1);';assert(routine.includes(setup));
routine=routine.replace(setup,setup+`
  if (guard_mode) { GEN extra=rtor(X,L+64); setprec(extra,L); X=extra; X[prec2lg(L)]=guard_mode==1?0:-1; }
`);
const step='setprec(X,l1); p3 = divru(X,i);';assert(routine.includes(step));
routine=routine.replace(step,`if(l1>L) printf("growth mode=%d L=%ld requested=%ld adjacent_is_y=%d extra_word=%lx\\n",guard_mode,L,l1,X+prec2lg(L)==y,(ulong)X[prec2lg(L)]);
      `+step);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-exp-precision-')),source=path.join(dir,'probe.c'),exe=path.join(dir,'probe');
fs.writeFileSync(source,`#include "pari.h"
#include "paripriv.h"
static int guard_mode;
${routine}
int main(void){pari_init(16000000,10000);
for(long e=-63;e<=-48;e++)for(long pattern=0;pattern<10;pattern++){
pari_sp av=avma;GEN x=real_1(64);if(pattern==1)x[2]=(long)~0UL;if(pattern==2)x[2]=(long)(HIGHBIT|(HIGHBIT>>2));if(pattern>2)x[2]=(long)(HIGHBIT|((ulong)pattern*0x9e3779b97f4a7c15UL));setexpo(x,e);
GEN expected=exp1r_abs(x);printf("input e=%ld pattern=%ld\\n",e,pattern);
for(guard_mode=0;guard_mode<3;guard_mode++){GEN got=diagnostic_exp1r_abs(x);printf("result mode=%d equal=%d\\n",guard_mode,equalrr(expected,got));if(!equalrr(expected,got))return 2;}
avma=av;}pari_close();return 0;}`);
const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);
assert.equal((run.stdout.match(/result mode=\d equal=1/g)||[]).length,480);
const growth=run.stdout.split('\n').filter(line=>line.startsWith('growth mode=0'));
assert(growth.length>0);assert(growth.every(line=>line.includes('L=64 requested=128 adjacent_is_y=1')));
console.log(`160 inputs, 480 guarded/unmodified comparisons agree; ${growth.length} original paths grow into the adjacent y header`);
