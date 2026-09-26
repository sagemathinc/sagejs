"use strict";
// Linux/glibc-only diagnostic. No GMP allocator replacement or ownership change.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const {createHash}=require("node:crypto"),{createRequire}=require("node:module");
const names=["mallocCalls","callocCalls","reallocCalls","freeCalls","mallocRequestedBytes",
  "callocRequestedBytes","reallocRequestedBytes","freeNullCalls","reallocNullCalls",
  "callocSizeOverflowCalls","counterOverflow"];
const sha=data=>createHash("sha256").update(data).digest("hex");
assert.equal(process.platform,"linux");
assert(process.report.getReport().header.glibcVersionRuntime,"glibc required");
const interposer=String.raw`
#include <stdint.h>
#include <stddef.h>
#include <limits.h>
extern void *__libc_malloc(size_t);
extern void *__libc_calloc(size_t,size_t);
extern void *__libc_realloc(void *,size_t);
extern void __libc_free(void *);
static _Thread_local int enabled;
static _Thread_local uint64_t counts[11];
static void add(unsigned i,uint64_t n){
  if(UINT64_MAX-counts[i]<n){counts[i]=UINT64_MAX;counts[10]=1;}else counts[i]+=n;
}
int sagejs_alloc_begin(void){if(enabled)return 0;for(unsigned i=0;i<11;i++)counts[i]=0;enabled=1;return 1;}
void sagejs_alloc_end(void){enabled=0;}
uint64_t sagejs_alloc_count(unsigned i){return i<11?counts[i]:0;}
void *malloc(size_t n){if(enabled){add(0,1);add(4,n);}return __libc_malloc(n);}
void *calloc(size_t n,size_t s){if(enabled){add(1,1);if(s && n>SIZE_MAX/s)add(9,1);else add(5,n*s);}return __libc_calloc(n,s);}
void *realloc(void *p,size_t n){if(enabled){add(2,1);add(6,n);if(!p)add(8,1);}return __libc_realloc(p,n);}
void free(void *p){if(enabled){add(3,1);if(!p)add(7,1);}__libc_free(p);}
`;
const adapter=String.raw`
#define _GNU_SOURCE
#include <node_api.h>
#include <stdint.h>
#include <stdlib.h>
#include <dlfcn.h>
#include <pthread.h>
#include <stdatomic.h>
#include <errno.h>
static int (*begin)(void);
static void (*end)(void);
static uint64_t (*count)(unsigned);
static napi_value error(napi_env e,const char *s){napi_throw_error(e,NULL,s);return NULL;}
static napi_value data(napi_env e,napi_callback_info c){
 (void)c;napi_value a,v;napi_create_array_with_length(e,11,&a);
 for(unsigned i=0;i<11;i++){napi_create_bigint_uint64(e,count(i),&v);napi_set_element(e,a,i,v);}return a;
}
static napi_value measure(napi_env e,napi_callback_info c){
 size_t n=1;napi_value fn,self,result=NULL;napi_valuetype type;
 napi_get_cb_info(e,c,&n,&fn,&self,NULL);
 if(n!=1 || napi_typeof(e,fn,&type)!=napi_ok || type!=napi_function)return error(e,"callback required");
 if(!begin())return error(e,"allocation counter already active");
 napi_status status=napi_call_function(e,self,fn,0,NULL,&result);
 end();if(status!=napi_ok)return NULL;return result;
}
static _Atomic int gate;
static void *worker(void *unused){
 (void)unused;while(atomic_load(&gate)!=1){}
 void *p=malloc(37);if(p){((volatile char *)p)[0]=1;free(p);}
 atomic_store(&gate,2);return NULL;
}
static napi_value controls(napi_env e,napi_callback_info c){
 (void)c;if(!begin())return error(e,"control nested");
 void *a=malloc(11);a=realloc(a,19);void *b=calloc(3,7);void *d=realloc(NULL,13);
 volatile size_t huge=SIZE_MAX;errno=0;void *bad=calloc(huge,2);
 int valid=a && b && d && !bad && errno==ENOMEM;
 errno=EDOM;free(a);valid=valid && errno==EDOM;
 free(b);free(d);free(NULL);valid=valid && errno==EDOM;end();
 if(!valid)return error(e,"control allocation/errno unexpected");
 napi_value result,first,second;napi_create_object(e,&result);first=data(e,c);
 atomic_store(&gate,0);pthread_t thread;
 if(pthread_create(&thread,NULL,worker,NULL))return error(e,"worker creation failed");
 if(!begin()){atomic_store(&gate,1);pthread_join(thread,NULL);return error(e,"worker control nested");}
 atomic_store(&gate,1);while(atomic_load(&gate)!=2){}end();
 // Snapshot before pthread_join or JS result allocation can affect anything.
 uint64_t copy[11];for(unsigned i=0;i<11;i++)copy[i]=count(i);
 if(pthread_join(thread,NULL))return error(e,"worker join failed");
 napi_create_array_with_length(e,11,&second);
 for(unsigned i=0;i<11;i++){napi_value v;napi_create_bigint_uint64(e,copy[i],&v);napi_set_element(e,second,i,v);}
 napi_set_named_property(e,result,"known",first);napi_set_named_property(e,result,"otherThread",second);return result;
}
static napi_value init(napi_env e,napi_value exports){
 begin=dlsym(RTLD_DEFAULT,"sagejs_alloc_begin");end=dlsym(RTLD_DEFAULT,"sagejs_alloc_end");count=dlsym(RTLD_DEFAULT,"sagejs_alloc_count");
 if(!begin || !end || !count)return error(e,"allocation interposer not loaded");
 napi_property_descriptor p[]={{"measure",0,measure,0,0,0,napi_default,0},{"data",0,data,0,0,0,napi_default,0},{"controls",0,controls,0,0,0,napi_default,0}};
 napi_define_properties(e,exports,3,p);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
`;
const childAt=process.argv.indexOf("--child");
if(childAt<0){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-alloc-count-"));
 fs.writeFileSync(path.join(directory,"counter.c"),interposer);
 fs.writeFileSync(path.join(directory,"adapter.c"),adapter);
 const library=path.join(directory,"libsagejs_alloc_count.so");
 const cc=spawnSync("cc",["-shared","-fPIC","-O2","-fno-builtin","-ftls-model=initial-exec","-o",library,path.join(directory,"counter.c")],{encoding:"utf8",timeout:30000});
 assert.equal(cc.status,0,cc.stderr);
 fs.writeFileSync(path.join(directory,"binding.gyp"),JSON.stringify({targets:[{target_name:"adapter",sources:["adapter.c"],cflags:["-O2","-fno-builtin"],libraries:["-ldl","-lpthread"]}]}));
 const nodeGyp=require.resolve("node-gyp/bin/node-gyp.js",{paths:[path.join(__dirname,"../../packages/flint")]});
 const build=spawnSync(process.execPath,[nodeGyp,"rebuild","--jobs","1"],{cwd:directory,encoding:"utf8",timeout:60000});
 assert.equal(build.status,0,build.stderr);
 const node=path.join(directory,"node");fs.copyFileSync(process.execPath,node);fs.chmodSync(node,0o700);
 assert.equal(sha(fs.readFileSync(node)),sha(fs.readFileSync(process.execPath)));
 const cap=spawnSync("getcap",[node],{encoding:"utf8"});assert.equal(cap.status,0,cap.stderr);assert.equal(cap.stdout.trim(),"");
 assert(!process.env.LD_PRELOAD,"refuse to compose unrelated allocator preload");
 console.log(JSON.stringify({directory,library,nodeSha256:sha(fs.readFileSync(node))}));
 const run=spawnSync(node,[__filename,"--child",directory,...process.argv.slice(2)],{env:{...process.env,LD_PRELOAD:library},stdio:"inherit",timeout:120000});
 assert.equal(run.status,0,"diagnostic child failed: "+run.signal);
}else{
 const directory=process.argv[childAt+1],addon=require(path.join(directory,"build/Release/adapter.node"));
 const controls=addon.controls();
 assert.deepEqual(controls.known,[1n,2n,2n,4n,11n,21n,32n,1n,1n,1n,0n]);
 assert.deepEqual(controls.otherThread,Array(11).fill(0n));
 assert.equal(addon.measure(()=>123),123);
 const empty=addon.data().map(String),marker=new Error("allocation control exception");
 assert.throws(()=>addon.measure(()=>{throw marker;}),e=>e===marker);
 addon.measure(()=>assert.throws(()=>addon.measure(()=>0),/already active/));
 assert.equal(addon.measure(()=>456),456);
 const report={diagnosticOnly:true,qualifiedTiming:false,names,controls:{known:controls.known.map(String),otherThread:controls.otherThread.map(String),empty},
  artifacts:{directory,library:path.join(directory,"libsagejs_alloc_count.so"),interposerSha256:sha(Buffer.from(interposer)),nodeSha256:sha(fs.readFileSync(process.execPath))},runs:[]};
 fs.writeFileSync(path.join(directory,"controls.json"),JSON.stringify(report));
 console.log(JSON.stringify({controls:"passed",directory}));
 const kernelAt=process.argv.indexOf("--kernel");
 if(kernelAt>=0){
  const probePath=path.join(__dirname,"probe_resident_class_attempt.cjs");
  let code=fs.readFileSync(probePath,"utf8"),call="const action = f[backend](...args);";
  assert.equal(code.split(call).length,2);code=code.replace(call,"const action = measuredAllocation(() => f[backend](...args));");
  assert.equal(code.split("(async () => {").length,2);code=code.replace("(async () => {","return (async () => {");
  const args=process.argv.slice(kernelAt+1);assert(args.includes("--profile-symbols"));assert(!args.includes("--word-capacity"));
  const scoped=Object.create(process);Object.defineProperty(scoped,"argv",{value:[process.execPath,probePath,...args]});
  const measured=fn=>{try{return addon.measure(fn);}finally{
   const counters=addon.data();assert.equal(counters[10],0n,"allocation counter overflow");
   report.runs.push(counters.map(String));
  }};
  const capturedConsole=Object.create(console);
  capturedConsole.log=(...values)=>{
   if(values.length===1 && typeof values[0]==="string"){
    try{const parsed=JSON.parse(values[0]);if(parsed.generatedModulePath)report.probeReport=parsed;}catch{}
   }
   console.log(...values);
  };
  const execute=new Function("require","__dirname","__filename","process","console","measuredAllocation",code);
  Promise.resolve(execute(createRequire(probePath),__dirname,probePath,scoped,capturedConsole,measured)).then(()=>{
   assert(!scoped.exitCode);assert(report.runs.length>0);report.probeArguments=args;report.probeSha256=sha(fs.readFileSync(probePath));
   report.boundary="Calling-thread malloc/calloc/realloc/free calls during synchronous callback, including call bridge and warmup; requested bytes, not live or peak allocation. No subtraction of empty control. Does not count aligned_alloc/mmap or direct __libc allocator bypasses.";
   report.maps=fs.readFileSync("/proc/self/maps","utf8");report.binarySha256={};
   for(const line of report.maps.split("\n")){
    const m=line.match(/^\S+\s+(\S+)\s+\S+\s+\S+\s+(\d+)\s+(\/.*)$/);
    if(!m || !m[1].includes("x"))continue;
    assert(!m[3].endsWith(" (deleted)"));
    const before=fs.statSync(m[3],{bigint:true});assert.equal(String(before.ino),m[2]);
    report.binarySha256[m[3]]=sha(fs.readFileSync(m[3]));
    const after=fs.statSync(m[3],{bigint:true});assert.equal(after.ino,before.ino);assert.equal(after.mtimeNs,before.mtimeNs);
   }
   const output=path.join(directory,"kernel.json");fs.writeFileSync(output,JSON.stringify(report));console.log(JSON.stringify({output,runs:report.runs}));
  }).catch(error=>{console.error(error);process.exitCode=1;});
 }
}
