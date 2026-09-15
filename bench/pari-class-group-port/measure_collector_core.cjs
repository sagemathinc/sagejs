"use strict";
// Standalone generated-core boundary adapter: no handwritten mathematics.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(command,args,options={}) {
 const r=spawnSync(command,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});
 assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;
}
(async()=>{
 const pari=path.resolve(process.argv[2]);
 const unreduced=process.argv.includes('--unreduced');
 const smallNorm=process.argv.includes('--small-norm'),distinguished=process.argv.includes('--distinguished'),prepareOnly=process.argv.includes('--prepare-only');
 assert(!smallNorm||unreduced,'small-norm driver requires unreduced mode');
 assert(!distinguished||smallNorm,'distinguished driver requires small-norm mode');
 const entry=smallNorm?'pari_collect_unreduced_ideals':unreduced?'pari_collect_unreduced_ideal':'pari_collect_ideal_relations';
 const profile=process.argv.includes('--profile'),repetitions=profile?100:1;
 const fixture=JSON.parse(run(process.execPath,smallNorm?[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,path.resolve(process.argv[3]),'--export-fixtures','--unreduced','--distinct','--construct-primes',...(distinguished?['--distinguished']:[])]:[path.join(__dirname,'check_compiled_ideal_collector.cjs'),pari,'--export-fixtures',...(unreduced?['--unreduced']:[])]));
 assert.equal(fixture.schema,smallNorm?'pari-small-norm-collector-v1':unreduced?'pari-unreduced-ideal-collector-v1':'pari-prepared-ideal-collector-v1');
 const built=await compileKernel({sourcePath:path.join(__dirname,smallNorm?'unreduced_small_norm.py':unreduced?'unreduced_ideal_collector.py':'ideal_collector.py')});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-collector-core-')),c=path.join(dir,'driver.c'),exe=path.join(dir,'driver');
 const declarations=[],cleanup=[],snapshots=[],resets=[],stream=[String(fixture.cases.length)];
 for(const [name,kind] of fixture.names) {
  assert(/^[a-z_][a-z_0-9]*$/.test(name));
  if(kind==='IntegerBuffer') {declarations.push(`sagejs_integer_buffer ${name}=read_integer_buffer();`);cleanup.push(`free(${name}.sizes);free(${name}.limbs);`);}
  else if(kind==='Int64Buffer') {declarations.push(`sagejs_int64_buffer ${name}=read_int64_buffer();`);cleanup.push(`free(${name}.data);`);}
  else if(kind==='Float64Buffer') {declarations.push(`sagejs_float64_buffer ${name}=read_float64_buffer();`);cleanup.push(`free(${name}.data);`);}
  else if(kind==='int') {declarations.push(`mpz_t ${name};mpz_init(${name});check(mpz_inp_str(${name},stdin,10)>0);`);cleanup.push(`mpz_clear(${name});`);}
  else {assert.equal(kind,'float');declarations.push(`double ${name};check(scanf("%lf",&${name})==1);`);}
  const parts=kind==='IntegerBuffer'?[['sizes',`${name}.length*sizeof(int32_t)`],['limbs',`${name}.length*${name}.word_capacity*sizeof(uint64_t)`]]:
   kind==='Int64Buffer'?[['data',`${name}.length*sizeof(int64_t)`]]:
   kind==='Float64Buffer'?[['data',`${name}.length*sizeof(double)`]]:[];
  for(const [part,bytes] of parts){const saved=`initial_${name}_${part}`;
   snapshots.push(`void *${saved}=copy_bytes(${name}.${part},${bytes});`);
   resets.push(`memcpy(${name}.${part},${saved},${bytes});`);cleanup.push(`free(${saved});`);
  }
 }
 for(const entry of fixture.cases)for(const [name,kind] of fixture.names) {
  const x=entry.input[name];
  if(Array.isArray(x)) {
   stream.push(String(x.length));
   if(kind==='IntegerBuffer')stream.push(String(x.reduce((m,s)=>Math.max(m,Math.ceil((BigInt(s)<0n?-BigInt(s):BigInt(s)).toString(2).length/64)),unreduced?64:8)));
   stream.push(...x.map(String));
  } else stream.push(String(x));
 }
 fs.writeFileSync(c,`#include <stdio.h>
#include "${built.coreHeaderPath}"
#include <stdlib.h>
#include <inttypes.h>
#include <time.h>
#include <string.h>
static void check(int ok){if(!ok){fputs("invalid core fixture or allocation\\n",stderr);exit(2);}}
static void *copy_bytes(const void *p,size_t n){void *q=malloc(n?n:1);check(q!=NULL);memcpy(q,p,n);return q;}
static sagejs_integer_buffer read_integer_buffer(void){
 sagejs_integer_buffer b;check(scanf("%zu%zu",&b.length,&b.word_capacity)==2);
 check(b.word_capacity>0 && b.word_capacity<10000 && b.length<1000000);
 b.sizes=calloc(b.length?b.length:1,sizeof(int32_t));b.limbs=calloc(b.length?b.length*b.word_capacity:1,sizeof(uint64_t));check(b.sizes&&b.limbs);
 mpz_t x;mpz_init(x);for(size_t i=0;i<b.length;i++){check(mpz_inp_str(x,stdin,10)>0);size_t count=0;
 check(mpz_sizeinbase(x,2)<=64*b.word_capacity);mpz_export(b.limbs+i*b.word_capacity,&count,-1,8,0,0,x);b.sizes[i]=(mpz_sgn(x)<0?-1:1)*(int32_t)count;}
 mpz_clear(x);return b;
}
static sagejs_int64_buffer read_int64_buffer(void){sagejs_int64_buffer b;check(scanf("%zu",&b.length)==1);check(b.length<1000000);b.data=calloc(b.length?b.length:1,sizeof(int64_t));check(b.data!=NULL);for(size_t i=0;i<b.length;i++)check(scanf("%" SCNd64,&b.data[i])==1);return b;}
static sagejs_float64_buffer read_float64_buffer(void){sagejs_float64_buffer b;check(scanf("%zu",&b.length)==1);check(b.length<1000000);b.data=calloc(b.length?b.length:1,sizeof(double));check(b.data!=NULL);for(size_t i=0;i<b.length;i++)check(scanf("%lf",&b.data[i])==1);return b;}
static void get(mpz_t x,sagejs_integer_buffer b,size_t i){check(i<b.length);int32_t n=b.sizes[i];mpz_import(x,n<0?-n:n,-1,8,0,0,b.limbs+i*b.word_capacity);if(n<0)mpz_neg(x,x);}
static long small(sagejs_integer_buffer b,size_t i){mpz_t x;mpz_init(x);get(x,b,i);check(mpz_fits_slong_p(x));long v=mpz_get_si(x);mpz_clear(x);return v;}
static void array(sagejs_integer_buffer b,size_t count,int quoted){check(count<=b.length);mpz_t x;mpz_init(x);putchar('[');for(size_t i=0;i<count;i++){if(i)putchar(',');get(x,b,i);if(quoted)putchar('"');mpz_out_str(stdout,10,x);if(quoted)putchar('"');}putchar(']');mpz_clear(x);}
int main(int argc,char **argv){long repetitions=argc>1?atol(argv[1]):${repetitions};check(repetitions>=1&&repetitions<=100000);size_t cases;check(scanf("%zu",&cases)==1);for(size_t index=0;index<cases;index++){
 ${declarations.join('\n')}
 ${snapshots.join('\n')}
 sagejs_native_status error={0};mpz_t output;mpz_init(output);struct timespec timing_begin,timing_end;
 double elapsed=0;
 for(long repetition=${smallNorm?-3:0};repetition<repetitions;repetition++){
 ${resets.join('\n')}
 clock_gettime(CLOCK_MONOTONIC,&timing_begin);
 int ok=sagejs_kernel_${entry}(&error,output,${fixture.names.map(([name])=>name).join(',')});
 clock_gettime(CLOCK_MONOTONIC,&timing_end);
 if(!ok||error.code){fprintf(stderr,"core error %d %s\\n",error.code,error.message?error.message:"");return 3;}
 if(repetition>=0)elapsed+=(timing_end.tv_sec-timing_begin.tv_sec)+(timing_end.tv_nsec-timing_begin.tv_nsec)*1e-9;
 }
 long last=small(relation_state,0);
 printf("{\\\"index\\\":%zu,\\\"seconds\\\":%.17g,\\\"status\\\":%ld,\\\"trials\\\":%" PRId64 ",\\\"attempts\\\":%" PRId64 ",\\\"relid\\\":%" PRId64 ",\\\"nfact\\\":%" PRId64 ",\\\"fact_count\\\":%" PRId64 ",\\\"last\\\":%ld,\\\"missing\\\":%ld,\\\"sup\\\":%ld,\\\"basis\\\":",index,elapsed,mpz_get_si(output),state.data[1],counters.data[0],progress.data[0],progress.data[1],counters.data[2],last,small(relation_state,2),small(relation_state,3));
 array(relation_basis,relation_basis.length,0);printf(",\\\"hashes\\\":");array(relation_hashes,last,0);
 printf(",\\\"records\\\":");array(relation_records,last*relation.length,0);printf(",\\\"generators\\\":");array(generators,last*mpz_get_ui(n),1);${smallNorm?'putchar(44);putchar(34);fputs("small",stdout);putchar(34);printf(":%" PRId64,counters.data[1]);':''}puts("}");
 mpz_clear(output);${cleanup.join('\n')}
 }return 0;}
`);
 const prefix=process.env.SAGEJS_FLINT_PREFIX;assert(prefix,'set SAGEJS_FLINT_PREFIX');
 const start=performance.now();
 run('cc',['-O2','-ffp-contract=off',...(profile?['-pg']:[]),'-I'+path.join(prefix,'include'),c,built.coreSourcePath,'-L'+path.join(prefix,'lib'),'-Wl,-rpath,'+path.join(prefix,'lib'),'-lgmp','-lm','-o',exe]);
 const compileSeconds=(performance.now()-start)/1000;
 const input=stream.join('\n')+'\n',inputPath=path.join(dir,'input.txt'),fixturePath=path.join(dir,'fixture.json');
 fs.writeFileSync(inputPath,input);fs.writeFileSync(fixturePath,JSON.stringify(fixture));
 let pariExe=null;
 if(smallNorm){
  let control=fixture.controlSource;
  function replace(a,b){assert.equal(control.split(a).length,2,a);control=control.replace(a,b);}
  // Move clocks around the complete two-visit entry, including distinguished
  // power/product construction. Cache/workspace initialization stays outside
  // both comparators' entry clocks. This changes no mathematical decisions.
  replace('clock_gettime(CLOCK_MONOTONIC,&begin);','');
  replace('struct timespec begin,end;','struct timespec begin,end;clock_gettime(CLOCK_MONOTONIC,&begin);');
  replace('clock_gettime(CLOCK_MONOTONIC,&end);elapsed+=seconds(begin,end);if(status)break;}',
   'if(status)break;}clock_gettime(CLOCK_MONOTONIC,&end);elapsed+=seconds(begin,end);');
  replace('for(long rep=0;rep<repetitions;rep++) {','for(long rep=-3;rep<repetitions;rep++) {');
  replace('elapsed+=seconds(begin,end);','if(rep>=0)elapsed+=seconds(begin,end);');
  const pariC=path.join(dir,'pari-control.c');pariExe=path.join(dir,'pari-control');fs.writeFileSync(pariC,control);
  const lib=path.join(pari,'Olinux-x86_64');
  run('cc',['-O2','-ffp-contract=off','-I'+path.join(pari,'src/headers'),'-I'+lib,pariC,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',pariExe]);
 }
 if(prepareOnly){
  const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const report={qualified:false,preparedOnly:true,smallNorm,distinguished,entry,exe,pariExe,inputPath,fixturePath,modulePath:built.modulePath,warmups:smallNorm?3:0,core:built.coreSourcePath,coreHeader:built.coreHeaderPath,compileSeconds,fixtureSha256:createHash('sha256').update(JSON.stringify(fixture.cases)).digest('hex'),hashes:{exe:hash(exe),pariExe:pariExe?hash(pariExe):null,input:hash(inputPath),fixture:hash(fixturePath),core:hash(built.coreSourcePath),module:hash(built.modulePath)},preparedManifest:path.join(dir,'prepared.json')};
  fs.writeFileSync(report.preparedManifest,JSON.stringify(report,null,2));console.log(JSON.stringify(report));return;
 }
 const executionStart=performance.now();
 const rows=run(exe,[],{input:stream.join('\n')+'\n',cwd:dir}).trim().split('\n').map(JSON.parse);
 const executionWallSeconds=(performance.now()-executionStart)/1000;
 assert.equal(rows.length,fixture.cases.length);
 for(const {index,seconds,...actual} of rows){assert(Number.isFinite(seconds)&&seconds>=0);assert.deepEqual(actual,fixture.cases[index].expected,`core case ${index}`);}
 const report=profile?run('gprof',['-b',exe,path.join(dir,'gmon.out')]):null;
 if(report)fs.writeFileSync(path.join(dir,'gprof.txt'),report);
 const profileCalls={};
 if(report)for(const line of report.split('\n')){
  const m=line.match(/^\s*[\d.]+\s+[\d.]+\s+[\d.]+\s+(\d+)\s+[\d.]+\s+[\d.]+\s+(\w+)\s*$/);
  if(m&&['native_pari_collect_unreduced_ideal','native_pari_prepare_enumeration','sagejs_integer_buffer_get_mpz','sagejs_integer_buffer_set_mpz','mpz_to_int64'].includes(m[2]))profileCalls[m[2]]=Number(m[1]);
 }
 console.log(JSON.stringify({qualified:false,unreduced,profile,repetitions,entry,warmups:smallNorm?3:0,integerBufferMinimumWords:unreduced?64:8,boundary:'Standalone generated core; input allocation, parsing, reset, validation and serialization excluded; no paired samples',compileSeconds,executionWallSeconds,totalSeconds:rows.reduce((s,r)=>s+r.seconds,0),measurements:rows.map(({index,seconds})=>({index,seconds})),exe,core:built.coreSourcePath,profilePath:report?path.join(dir,'gprof.txt'):null,profileSha256:report?createHash('sha256').update(report).digest('hex'):null,profileCalls}));
})().catch(e=>{console.error(e);process.exitCode=1;});
