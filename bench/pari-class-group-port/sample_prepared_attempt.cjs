"use strict";
// Linux x86-64 diagnostic adapter, not mathematical implementation.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { createHash } = require("node:crypto");
assert.equal(process.platform, "linux");
assert.equal(process.arch, "x64");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-pc-sampler-"));
const source = String.raw`
#define _GNU_SOURCE
#include <node_api.h>
#include <signal.h>
#include <stdint.h>
#include <stdatomic.h>
#include <time.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <ucontext.h>
#include <errno.h>
#include <stdio.h>
#define CAPACITY 100000
_Static_assert(ATOMIC_LONG_LOCK_FREE==2 && sizeof(uintptr_t)==sizeof(unsigned long), "lock-free PC slots required");
static _Atomic unsigned long pcs[CAPACITY];
static volatile sig_atomic_t count, dropped, overruns, active;
static int token;
static uint64_t elapsed;
static pid_t owner;
static void sample(int signal, siginfo_t *info, void *context) {
  (void)signal;
  if (!active || info->si_code != SI_TIMER || info->si_value.sival_ptr != &token) return;
  if(info->si_overrun>0) overruns = info->si_overrun>2147483647-overruns ? 2147483647 : overruns+info->si_overrun;
  sig_atomic_t n = count;
  if (n < CAPACITY) {
    atomic_store_explicit(&pcs[n],(unsigned long)((ucontext_t *)context)->uc_mcontext.gregs[REG_RIP],memory_order_relaxed);
    count = n + 1;
  } else if (dropped < 2147483647) dropped++;
}
static uint64_t ns(void) {
  struct timespec t;
  if(clock_gettime(CLOCK_THREAD_CPUTIME_ID, &t)) {fputs("fatal: thread CPU clock failed\n",stderr); _exit(70);}
  return (uint64_t)t.tv_sec * 1000000000ULL + t.tv_nsec;
}
static napi_value fail(napi_env env, const char *message) {
  napi_throw_error(env, NULL, message); return NULL;
}
static napi_value measure(napi_env env, napi_callback_info callback) {
  size_t argc = 1; napi_value fn, receiver, result = NULL;
  napi_get_cb_info(env, callback, &argc, &fn, &receiver, NULL);
  napi_valuetype type; if(argc != 1 || napi_typeof(env,fn,&type)!=napi_ok || type!=napi_function)
    return fail(env,"measure requires a synchronous callback");
  if(active) return fail(env,"sampler already active");
  if((pid_t)syscall(SYS_gettid)!=getpid()) return fail(env,"diagnostic sampler requires main thread");
  int sig = SIGRTMIN + 6;
  if(sig > SIGRTMAX) return fail(env,"no realtime signal available");
  sigset_t set, oldmask, pending; sigemptyset(&set); sigaddset(&set,sig);
  if(pthread_sigmask(SIG_BLOCK,&set,&oldmask)) return fail(env,"cannot block sample signal");
  struct sigaction previous, action = {0};
  if(sigaction(sig,NULL,&previous) || sigpending(&pending) ||
     previous.sa_handler != SIG_DFL || sigismember(&pending,sig) || sigismember(&oldmask,sig)) {
    if(pthread_sigmask(SIG_SETMASK,&oldmask,NULL)) _exit(70);
    return fail(env,"sample signal is not unused and unblocked");
  }
  action.sa_sigaction=sample; action.sa_flags=SA_SIGINFO; sigemptyset(&action.sa_mask);
  if(sigaction(sig,&action,NULL)) {
    if(pthread_sigmask(SIG_SETMASK,&oldmask,NULL)) _exit(70);
    return fail(env,"cannot install sample handler");
  }
  owner=(pid_t)syscall(SYS_gettid);
  struct sigevent event={0}; event.sigev_notify=SIGEV_THREAD_ID;
  event.sigev_signo=sig; event.sigev_value.sival_ptr=&token;
  event._sigev_un._tid=owner;
  timer_t timer;
  if(timer_create(CLOCK_THREAD_CPUTIME_ID,&event,&timer)) {
    if(sigaction(sig,&previous,NULL) || pthread_sigmask(SIG_SETMASK,&oldmask,NULL)) _exit(70);
    return fail(env,"thread CPU timer creation failed");
  }
  count=0; dropped=0; overruns=0; elapsed=0; active=1;
  struct itimerspec period={{0,1000000},{0,1000000}};
  int setup_error=timer_settime(timer,0,&period,NULL);
  uint64_t start=ns();
  napi_status call_status=napi_ok;
  if(!setup_error) {
    if(pthread_sigmask(SIG_SETMASK,&oldmask,NULL)) setup_error=1;
    else call_status=napi_call_function(env,receiver,fn,0,NULL,&result);
  }
  // Block delivery before disarming/deleting; consume pending timer signal
  // before restoring the old disposition. No pending default-action signal
  // is permitted to escape the measurement window.
  int cleanup_error=pthread_sigmask(SIG_BLOCK,&set,NULL);
  if(cleanup_error) {fputs("fatal: cannot block sampler signal during cleanup\n",stderr); _exit(70);}
  elapsed=ns()-start;
  struct itimerspec zero={{0,0},{0,0}};
  if(timer_settime(timer,0,&zero,NULL)) cleanup_error=1;
  if(timer_delete(timer)) cleanup_error=1;
  if(cleanup_error) {fputs("fatal: cannot disarm/delete sampler timer\n",stderr); _exit(70);}
  active=0;
  struct timespec instant={0,0};
  for (;;) {
    int waited=sigtimedwait(&set,NULL,&instant);
    if(waited==sig) continue;
    if(waited<0 && errno==EINTR) continue;
    if(waited<0 && errno==EAGAIN) break;
    cleanup_error=1; break;
  }
  if(cleanup_error || sigaction(sig,&previous,NULL) || pthread_sigmask(SIG_SETMASK,&oldmask,NULL)) {
    fputs("fatal: cannot restore sampler signal state\n",stderr); _exit(70);
  }
  if(setup_error || cleanup_error) return fail(env,"sampler setup/cleanup failed");
  if(call_status!=napi_ok) return NULL; // Preserve the pending callback exception.
  return result;
}
static napi_value data(napi_env env,napi_callback_info unused) {
  (void)unused; if(active)return fail(env,"cannot inspect active sampler");
  napi_value out, array, value; napi_create_object(env,&out);
  napi_create_array_with_length(env,count,&array);
  for(sig_atomic_t i=0;i<count;i++) {
    char hex[32]; snprintf(hex,sizeof(hex),"0x%lx",atomic_load_explicit(&pcs[i],memory_order_relaxed));
    napi_create_string_utf8(env,hex,NAPI_AUTO_LENGTH,&value); napi_set_element(env,array,i,value);
  }
  napi_set_named_property(env,out,"samples",array);
  char decimal[32]; snprintf(decimal,sizeof(decimal),"%llu",(unsigned long long)elapsed);
  napi_create_string_utf8(env,decimal,NAPI_AUTO_LENGTH,&value); napi_set_named_property(env,out,"cpuNanoseconds",value);
  napi_create_uint32(env,1000000,&value); napi_set_named_property(env,out,"intervalNanoseconds",value);
  napi_create_uint32(env,dropped,&value); napi_set_named_property(env,out,"dropped",value);
  napi_create_uint32(env,overruns,&value); napi_set_named_property(env,out,"timerOverruns",value);
  napi_create_int32(env,owner,&value); napi_set_named_property(env,out,"tid",value);
  napi_create_int32(env,(int)sysconf(_SC_PAGESIZE),&value); napi_set_named_property(env,out,"pageSize",value);
  return out;
}
__attribute__((noinline)) static uint64_t known_hot_loop(uint64_t n) {
  volatile uint64_t value=1;
  while(n--) value=value*1664525+1013904223;
  return value;
}
static napi_value hot(napi_env env,napi_callback_info unused) {
  (void)unused; uint64_t start=ns(), value=0;
  do {value^=known_hot_loop(1000000);}while(ns()-start<300000000);
  napi_value out; napi_create_bigint_uint64(env,value,&out); return out;
}
static napi_value init(napi_env env,napi_value exports) {
  napi_property_descriptor methods[]={
    {"measure",0,measure,0,0,0,napi_default,0},
    {"data",0,data,0,0,0,napi_default,0},
    {"hot",0,hot,0,0,0,napi_default,0}};
  napi_define_properties(env,exports,3,methods); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
`;
fs.writeFileSync(path.join(directory,"sampler.c"),source);
fs.writeFileSync(path.join(directory,"binding.gyp"),JSON.stringify({targets:[{
  target_name:"sampler",sources:["sampler.c"],cflags:["-O2","-g","-fno-omit-frame-pointer"],libraries:["-lrt","-lpthread"]}]}));
const nodeGyp=require.resolve("node-gyp/bin/node-gyp.js",{paths:[path.join(__dirname,"../../packages/flint")]});
const build=spawnSync(process.execPath,[nodeGyp,"rebuild","--jobs","1"],{cwd:directory,encoding:"utf8",timeout:60000});
assert.equal(build.status,0,build.stderr);
const addonPath=path.join(directory,"build/Release/sampler.node"), addon=require(addonPath);
const runs=[];
const measured=callback=>{try{return addon.measure(callback);}finally{runs.push(addon.data());}};
function executableIdentities(maps) {
  const binarySha256={};
  for(const line of maps.split("\n")) {
    const match=line.match(/^\S+\s+(\S+)\s+\S+\s+\S+\s+(\d+)\s+(\/.*)$/);
    if(!match || !match[1].includes("x"))continue;
    const file=match[3];
    assert(!file.endsWith(" (deleted)"),"executable mapping deleted: "+file);
    const before=fs.statSync(file,{bigint:true});
    assert.equal(String(before.ino),match[2],"mapped executable inode changed: "+file);
    const bytes=fs.readFileSync(file);
    const after=fs.statSync(file,{bigint:true});
    assert.equal(after.ino,before.ino); assert.equal(after.mtimeNs,before.mtimeNs);
    binarySha256[file]=createHash("sha256").update(bytes).digest("hex");
  }
  return binarySha256;
}
measured(()=>addon.hot());
const control=runs[0],expected=Number(control.cpuNanoseconds)/control.intervalNanoseconds;
assert(control.samples.length>expected*0.65 && control.samples.length<expected*1.2,
  `inadequate control coverage: ${control.samples.length}/${expected}`);
assert.equal(control.dropped,0);
const marker=new Error("intentional sampler callback exception");
assert.throws(()=>measured(()=>{throw marker;}),error=>error===marker);
measured(()=>addon.hot());
assert(runs[2].samples.length>150,"sampler did not recover after exception");
const report={diagnosticOnly:true,qualifiedTiming:false,pageSize:control.pageSize,runs,maps:fs.readFileSync("/proc/self/maps","utf8"),
  artifacts:{directory,addonPath,sourceSha256:createHash("sha256").update(source).digest("hex")}};
fs.writeFileSync(path.join(directory,"control.json"),JSON.stringify(report));
console.log(JSON.stringify({directory,controlSamples:control.samples.length,controlExpected:expected,afterExceptionSamples:runs[2].samples.length}));
const kernelAt=process.argv.indexOf("--kernel");
if(kernelAt>=0) {
  const probePath=path.join(__dirname,"probe_resident_class_attempt.cjs");
  let probe=fs.readFileSync(probePath,"utf8");
  const call="const action = f[backend](...args);";
  assert.equal(probe.split(call).length,2,"resident invocation changed");
  probe=probe.replace(call,"const action = measureNative(() => f[backend](...args));");
  const entry="(async () => {";
  assert.equal(probe.split(entry).length,2,"resident entry changed");
  probe=probe.replace(entry,"return "+entry);
  const args=process.argv.slice(kernelAt+1);
  assert(args.includes("--profile-symbols"),"kernel sampling requires cached symbol build");
  assert(!args.includes("--word-capacity"),"kernel sampling preserves default 64-word policy");
  const scopedProcess=Object.create(process);
  Object.defineProperty(scopedProcess,"argv",{value:[process.execPath,probePath,...args]});
  runs.length=0;
  const execute=new Function("require","__dirname","__filename","process","console","measureNative",probe);
  Promise.resolve(execute(createRequire(probePath),__dirname,probePath,scopedProcess,console,measured)).then(()=>{
    assert(!scopedProcess.exitCode,"resident probe failed");
    assert(runs.length>0,"no native calls sampled");
    const kernelReport={...report,runs,maps:fs.readFileSync("/proc/self/maps","utf8"),
      boundary:"Synchronous callback windows on the calling main thread; includes native/JS call bridge and warmup. Not qualified timing.",
      probeArguments:args,probeSha256:createHash("sha256").update(fs.readFileSync(probePath)).digest("hex")};
    kernelReport.binarySha256=executableIdentities(kernelReport.maps);
    const output=path.join(directory,"kernel.json");
    fs.writeFileSync(output,JSON.stringify(kernelReport));
    console.log(JSON.stringify({kernelSamples:output,calls:runs.length,totalSamples:runs.reduce((n,r)=>n+r.samples.length,0)}));
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
