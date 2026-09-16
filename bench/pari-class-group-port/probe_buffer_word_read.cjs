"use strict";
// Isolated candidate experiment; does not change the compiler/runtime.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const compiler=fs.readFileSync(path.join(__dirname,'../../tools/native-kernel/c-backend.cjs'),'utf8');
const start=compiler.indexOf('static void sagejs_integer_buffer_get_mpz('),end=compiler.indexOf('\nstatic int sagejs_integer_buffer_set_mpz(',start);
assert(start>=0&&end>start);const baseline=compiler.slice(start,end);
const before='    mpz_import(result, count, -1, sizeof(uint64_t), 0, 0,\n        buffer->limbs + position * buffer->word_capacity);';
assert.equal(baseline.split(before).length,2);
const candidate=baseline.replace('sagejs_integer_buffer_get_mpz','candidate_get').replace(before,`#if ULONG_MAX == UINT64_MAX && !defined(SAGEJS_PROBE_FORCE_IMPORT)
    if (count == 1)
        mpz_set_ui(result, (unsigned long)buffer->limbs[position * buffer->word_capacity]);
    else
#endif
${before}`);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-buffer-read-probe-')),c=path.join(dir,'probe.c'),exe=path.join(dir,'probe');
fs.writeFileSync(c,`#include <stdio.h>
#include <stdint.h>
#include <stddef.h>
#include <limits.h>
#include <time.h>
#include <gmp.h>
typedef struct {int32_t *sizes;uint64_t *limbs;size_t length,word_capacity;} sagejs_integer_buffer;
${baseline}
${candidate}
int main(void){
 int32_t sizes[]={0,1,-1,1,-1,2,-2,1};
 uint64_t limbs[]={0,99,1,99,1,99,UINT64_MAX,99,UINT64_MAX,99,0,1,UINT64_MAX,1,0,99};
 sagejs_integer_buffer b={sizes,limbs,8,2};mpz_t x,y,s;mpz_inits(x,y,s,NULL);
 for(int i=0;i<8;i++){mpz_setbit(x,1000);mpz_setbit(y,1000);sagejs_integer_buffer_get_mpz(&b,i,x);candidate_get(&b,i,y);if(mpz_cmp(x,y))return 2;}
 for(int sample=0;sample<3;sample++)for(int order=0;order<2;order++){
  int variant=(sample+order)%2;struct timespec a,z;mpz_set_ui(s,0);clock_gettime(CLOCK_MONOTONIC,&a);
  for(int i=0;i<2000000;i++){if(variant)candidate_get(&b,i%8,x);else sagejs_integer_buffer_get_mpz(&b,i%8,x);mpz_add(s,s,x);}
  clock_gettime(CLOCK_MONOTONIC,&z);printf("%d %d %.9f ",sample,variant,(z.tv_sec-a.tv_sec)+(z.tv_nsec-a.tv_nsec)*1e-9);mpz_out_str(stdout,10,s);puts("");
 }
 mpz_clears(x,y,s,NULL);return 0;
}`);
const prefix=process.env.SAGEJS_FLINT_PREFIX;assert(prefix);
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
run('cc',['-O2','-I'+path.join(prefix,'include'),c,'-L'+path.join(prefix,'lib'),'-Wl,-rpath,'+path.join(prefix,'lib'),'-lgmp','-o',exe]);
const rows=run(exe,[]).trim().split('\n').map(line=>{const [sample,variant,seconds,sum]=line.split(' ');return {sample:Number(sample),variant:Number(variant),seconds:Number(seconds),sum};});
assert.equal(rows.length,6);assert(rows.every(r=>r.sum===rows[0].sum));
run('cc',['-O2','-DSAGEJS_PROBE_FORCE_IMPORT','-I'+path.join(prefix,'include'),c,'-L'+path.join(prefix,'lib'),'-Wl,-rpath,'+path.join(prefix,'lib'),'-lgmp','-o',exe+'-fallback']);
const fallback=run(exe+'-fallback',[]).trim().split('\n');
assert.equal(fallback.length,6);assert(fallback.every(line=>line.split(' ')[3]===rows[0].sum));
console.log(JSON.stringify({diagnostic:true,compilerChanged:false,forcedFallbackPassed:true,iterations:2000000,rows}));
