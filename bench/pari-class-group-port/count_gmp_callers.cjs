"use strict";
// Bench-only frozen-object relink. No mathematical source or cached file edits.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {createRequire}=require('node:module'),{createHash}=require('node:crypto');
const hash=b=>createHash('sha256').update(b).digest('hex');
const key='14daec3462ab7248d9cb5e3d181b67455f5f42abeec5a3b5194a7a4db6a39bed';
const cache=path.join(__dirname,'.sagejs-native-kernels',key);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-gmp-callers-'));
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
const source=String.raw`
#include <node_api.h>
#include <gmp.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define CAP 4096
typedef struct {uintptr_t pc; uint64_t count; unsigned kind;} entry;
static _Thread_local entry table[CAP];
static _Thread_local uint64_t dropped, saturated;
static _Thread_local int active;
static void record(uintptr_t pc,unsigned kind){
 if(!active)return;
 unsigned at=(unsigned)((pc>>4)^(pc>>16)^kind)%CAP;
 for(unsigned n=0;n<CAP;n++,at=(at+1)%CAP){
  entry *e=&table[at];
  if(!e->count){e->pc=pc;e->kind=kind;e->count=1;return;}
  if(e->pc==pc&&e->kind==kind){if(e->count<UINT64_MAX)e->count++;else if(saturated<UINT64_MAX)saturated++;return;}
 }
 if(dropped<UINT64_MAX)dropped++;
}
extern size_t __real___gmpz_sizeinbase(mpz_srcptr,int);
extern void *__real___gmpz_export(void *,size_t *,int,size_t,int,size_t,mpz_srcptr);
__attribute__((noinline)) size_t __wrap___gmpz_sizeinbase(mpz_srcptr z,int base){
 record((uintptr_t)__builtin_extract_return_addr(__builtin_return_address(0)),0);
 return __real___gmpz_sizeinbase(z,base);
}
__attribute__((noinline)) void *__wrap___gmpz_export(void *r,size_t *count,int order,size_t size,int endian,size_t nails,mpz_srcptr z){
 record((uintptr_t)__builtin_extract_return_addr(__builtin_return_address(0)),1);
 return __real___gmpz_export(r,count,order,size,endian,nails,z);
}
static napi_value fail(napi_env env,const char *s){napi_throw_error(env,NULL,s);return NULL;}
static napi_value measure(napi_env env,napi_callback_info info){
 napi_value fn,self,out=NULL;size_t argc=1;napi_valuetype type;
 if(napi_get_cb_info(env,info,&argc,&fn,&self,NULL)!=napi_ok||argc!=1||napi_typeof(env,fn,&type)!=napi_ok||type!=napi_function)return fail(env,"synchronous callback required");
 if(active)return fail(env,"counter window already active");
 memset(table,0,sizeof(table));dropped=saturated=0;active=1;
 napi_status status=napi_call_function(env,self,fn,0,NULL,&out);active=0;
 return status==napi_ok?out:NULL;
}
static napi_value data(napi_env env,napi_callback_info info){
 (void)info;if(active)return fail(env,"active counter window");
 napi_value out,rows,item,v;napi_create_object(env,&out);napi_create_array(env,&rows);unsigned index=0;
 for(unsigned i=0;i<CAP;i++)if(table[i].count){
  char s[40];napi_create_object(env,&item);
  snprintf(s,sizeof(s),"0x%lx",(unsigned long)table[i].pc);napi_create_string_utf8(env,s,NAPI_AUTO_LENGTH,&v);napi_set_named_property(env,item,"returnAddress",v);
  napi_create_uint32(env,table[i].kind,&v);napi_set_named_property(env,item,"kind",v);
  snprintf(s,sizeof(s),"%llu",(unsigned long long)table[i].count);napi_create_string_utf8(env,s,NAPI_AUTO_LENGTH,&v);napi_set_named_property(env,item,"count",v);napi_set_element(env,rows,index++,item);
 }
 napi_set_named_property(env,out,"rows",rows);
 napi_create_bigint_uint64(env,dropped,&v);napi_set_named_property(env,out,"dropped",v);
 napi_create_bigint_uint64(env,saturated,&v);napi_set_named_property(env,out,"saturated",v);return out;
}
static napi_value control(napi_env env,napi_callback_info info){
 (void)info;mpz_t z;mpz_init_set_ui(z,12345);size_t count=0;uint64_t word=0;
 size_t bits=__wrap___gmpz_sizeinbase(z,2);
 void *returned=__wrap___gmpz_export(&word,&count,-1,sizeof(word),0,0,z);mpz_clear(z);
 if(bits!=14||word!=12345||count!=1||returned!=&word)return fail(env,"forwarded GMP result changed");
 napi_value out;napi_get_boolean(env,1,&out);return out;
}
extern napi_value sagejs_original_register(napi_env,napi_value);
NAPI_MODULE_EXPORT napi_value napi_register_module_v1(napi_env env,napi_value exports){
 napi_value out=sagejs_original_register(env,exports);if(out==NULL)return NULL;
 napi_property_descriptor d[]={{"__countMeasure",0,measure,0,0,0,napi_default,0},{"__countData",0,data,0,0,0,napi_default,0},{"__countControl",0,control,0,0,0,napi_default,0}};
 napi_define_properties(env,out,3,d);return out;
}
`;
(async()=>{
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
 const original=path.join(cache,'build/Release/obj.target/sagejs_native_kernel/kernel.o');
 const before=hash(fs.readFileSync(original));
 fs.copyFileSync(original,path.join(directory,'kernel.o'));
 run('objcopy',['--redefine-sym','napi_register_module_v1=sagejs_original_register',path.join(directory,'kernel.o')]);
 fs.writeFileSync(path.join(directory,'count.c'),source);
 const binding=JSON.parse(fs.readFileSync(path.join(cache,'binding.gyp'))).targets[0];
 const makefile=fs.readFileSync(path.join(cache,'build/sagejs_native_kernel.target.mk'),'utf8');
 const nodeInclude=makefile.match(/-I([^\s]+\/include\/node)\s/)[1];
 const addonPath=path.join(directory,'build/Release/sagejs_native_kernel.node');fs.mkdirSync(path.dirname(addonPath),{recursive:true});
 run('cc',['-O2','-g','-fPIC','-shared','-I'+nodeInclude,...binding.include_dirs.map(p=>'-I'+p),path.join(directory,'count.c'),path.join(directory,'kernel.o'),...binding.libraries,...binding.ldflags,'-Wl,--wrap=__gmpz_sizeinbase','-Wl,--wrap=__gmpz_export','-o',addonPath]);
 assert.equal(hash(fs.readFileSync(original)),before);
 fs.copyFileSync(path.join(cache,'index.cjs'),path.join(directory,'index.cjs'));
 const addon=require(addonPath),snap=()=>addon.__countData();
 assert.equal(addon.__countMeasure(()=>addon.__countControl()),true);
 const control=snap();assert.equal(control.dropped,0n);assert.equal(control.saturated,0n);
 for(const kind of [0,1])assert.equal(control.rows.filter(r=>r.kind===kind).reduce((s,r)=>s+BigInt(r.count),0n),1n);
 addon.__countMeasure(()=>{});assert.equal(snap().rows.length,0);
 assert.throws(()=>addon.__countMeasure(()=>{throw new Error('expected counter exception');}),/expected counter exception/);
 assert.equal(addon.__countMeasure(()=>addon.__countControl()),true);
 const runs=[],probePath=path.join(__dirname,'probe_resident_class_attempt.cjs');
 let probe=fs.readFileSync(probePath,'utf8');
 const marker='const action = f[backend](...args);';assert.equal(probe.split(marker).length,2);
 probe=probe.replace(marker,'const action = countCall(() => f[backend](...args));');
 assert.equal(probe.split('(async () => {').length,2);probe=probe.replace('(async () => {','return (async () => {');
 const args=process.argv.slice(2),scoped=Object.create(process);
 assert(args.includes('--profile-symbols'));assert(args.includes('--arena-bytes'));assert(args.includes('gmp'));
 Object.defineProperty(scoped,'argv',{value:[process.execPath,probePath,...args]});
 const originalRequire=createRequire(probePath);let report;
 const req=name=>name==='../../tools/native-kernel/compiler.cjs'?{compileKernel:async()=>({modulePath:path.join(directory,'index.cjs'),coreSourcePath:path.join(cache,'kernel_core.c')})}:originalRequire(name);
 await new Function('require','__dirname','__filename','process','console','countCall',probe)(req,__dirname,probePath,scoped,{log:s=>{report=JSON.parse(s);},error:console.error},callback=>{try{return addon.__countMeasure(callback);}finally{runs.push(snap());}});
 assert(!scoped.exitCode);assert(report&&runs.length);for(const r of runs){assert.equal(r.dropped,0n);assert.equal(r.saturated,0n);}
 const result={diagnosticOnly:true,qualifiedTiming:false,counts:'wrapped relocation calls, including static-library calls; not elapsed costs or inclusive stacks',kinds:['__gmpz_sizeinbase','__gmpz_export'],cacheKey:key,objectSha256:before,wrapperSha256:hash(source),addonSha256:hash(fs.readFileSync(addonPath)),directory,control,runs,maps:fs.readFileSync('/proc/self/maps','utf8'),probeReport:report};
 const symbolizer=require('./symbolize_native_samples.cjs'),maps=symbolizer.mappings(result.maps);
 const segments=symbolizer.loads(run('readelf',['-W','-l',addonPath]));
 const symbols=symbolizer.symbols(run('nm',['-n','-S','--defined-only',addonPath]));
 result.callerAttribution='Sized ELF symbol containing returnAddress-1; not inclusive cost; tail calls can identify an outer caller';
 result.callers=runs.map(r=>{
  const groups=new Map();
  for(const row of r.rows){
   const pc=BigInt(row.returnAddress)-1n,m=maps.find(m=>pc>=m.start&&pc<m.end);
   const address=m?.path===addonPath?symbolizer.virtualAddress(pc,m,segments,4096n):null;
   const symbol=address===null?null:symbolizer.containing(address,symbols);
   const key=JSON.stringify([row.kind,symbol?.name||'<unresolved>']);groups.set(key,(groups.get(key)||0n)+BigInt(row.count));
  }
  return [...groups].map(([key,count])=>({kind:JSON.parse(key)[0],name:JSON.parse(key)[1],count:String(count)})).sort((a,b)=>Number(BigInt(b.count)-BigInt(a.count)));
 });
 assert.equal(hash(fs.readFileSync(original)),before);
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v));
 console.log(JSON.stringify({directory,calls:runs.length,rows:runs.map(r=>r.rows.length),totals:runs.map(r=>[0,1].map(k=>r.rows.filter(x=>x.kind===k).reduce((s,x)=>s+BigInt(x.count),0n).toString()))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
