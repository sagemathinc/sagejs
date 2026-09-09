"use strict";
// Instrument a private generated copy, never the production core/cache.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
function instrument(original) {
  const pattern=/^static int (fmpz_native_\w+)\(([^\n]*)\)\n\{/gm;
  const names=[...original.matchAll(pattern)].map(x=>x[1]);
  assert.equal(new Set(names).size,names.length);
  const root=names.indexOf('fmpz_native_certified_complex_cubic_class_group_v1');
  assert(root>=0);
  const foreign=names.length;
  names.push('foreign_number_field_analysis','foreign_recovery_hnf','foreign_recovery_lll');
  let core=original.replace(pattern,(whole,name,params)=>{
    const i=names.indexOf(name),args=params.split(',').map(p=>{
      const m=p.trim().match(/([a-zA-Z_]\w*)$/);assert(m);return m[1];
    }).join(', ');
    return `static int diagnostic_${name}(${params});\nstatic int ${name}(${params})\n{\n`+
      ` uint64_t started=diagnostic_enter();\n int result=diagnostic_${name}(${args});\n diagnostic_leave(${i},started);\n`+
      (i===root?` if(diagnostic_calls[${root}] % 100 == 0) diagnostic_report();\n`:'')+
      ` return result;\n}\nstatic int diagnostic_${name}(${params})\n{`;
  });
  function wrap(text,pattern,id) {
    let count=0;
    const result=text.replace(pattern,(whole,space,call)=>{
      count++;return `${space}uint64_t diagnostic_ffi_start_${id}=diagnostic_enter();\n${space}${call}\n${space}diagnostic_leave(${id},diagnostic_ffi_start_${id});`;
    });
    assert.equal(count,1,`expected one foreign call for ${names[id]}`);return result;
  }
  core=wrap(core,/^(\s*)(int sagejs_ffi_analysis_result = sagejs_number_field_analyze_resource\([^\n]+;)/gm,foreign);
  const begin=core.indexOf('static int diagnostic_fmpz_native__cubic_relation_prefix_has_archimedean_unit(');
  assert(begin>=0);
  // The first occurrence is the declaration; the second is the actual body.
  const start=core.indexOf('static int diagnostic_fmpz_native__cubic_relation_prefix_has_archimedean_unit(',begin+1);
  const end=core.indexOf('\nstatic int ',start+1);assert(start>begin&&end>start);
  let body=core.slice(start,end);
  body=wrap(body,/^(\s*)((?:int )?sagejs_ffi_\w+_result = sagejs_fmpz_matrix_hnf_transform_prefix\([^\n]+;)/gm,foreign+1);
  body=wrap(body,/^(\s*)((?:int )?sagejs_ffi_\w+_result = sagejs_fmpz_matrix_lll_transform_prefix\([^\n]+;)/gm,foreign+2);
  core=core.slice(0,start)+body+core.slice(end);
  core=`#include <stdint.h>\n#include <time.h>\n#include <stdio.h>\n#include <stdlib.h>\n`+
`static uint64_t diagnostic_inclusive[${names.length}],diagnostic_exclusive[${names.length}],diagnostic_calls[${names.length}];
static _Thread_local uint64_t diagnostic_children[512];
static _Thread_local unsigned diagnostic_depth;
static const char *diagnostic_names[]={${names.map(JSON.stringify).join(',')}};
static uint64_t diagnostic_now(void){struct timespec t;if(clock_gettime(CLOCK_MONOTONIC_RAW,&t))abort();return (uint64_t)t.tv_sec*UINT64_C(1000000000)+(uint64_t)t.tv_nsec;}
static uint64_t diagnostic_enter(void){if(diagnostic_depth>=512)abort();diagnostic_children[diagnostic_depth++]=0;return diagnostic_now();}
static void diagnostic_leave(unsigned i,uint64_t start){uint64_t duration=diagnostic_now()-start;if(!diagnostic_depth)abort();uint64_t children=diagnostic_children[--diagnostic_depth];if(children>duration)abort();diagnostic_inclusive[i]+=duration;diagnostic_exclusive[i]+=duration-children;diagnostic_calls[i]++;if(diagnostic_depth)diagnostic_children[diagnostic_depth-1]+=duration;}
static void diagnostic_report(void){for(unsigned i=0;i<${names.length};i++)if(diagnostic_calls[i])fprintf(stderr,"CUBIC_EXCLUSIVE|%s|%llu|%llu|%llu\\n",diagnostic_names[i],(unsigned long long)diagnostic_calls[i],(unsigned long long)diagnostic_inclusive[i],(unsigned long long)diagnostic_exclusive[i]);}
`+core;
  return {core,names};
}
function main(){
  const [sourceArg,destArg,...extra]=process.argv.slice(2);assert(sourceArg&&destArg&&!extra.length);
  assert.equal(process.platform,'linux','CLOCK_MONOTONIC_RAW diagnostic is Linux-only');
  const source=path.resolve(sourceArg),dest=path.resolve(destArg);fs.mkdirSync(dest);
  for(const f of ['index.cjs','manifest.json','kernel.c','kernel_core.h','binding.gyp'])fs.copyFileSync(path.join(source,f),path.join(dest,f));
  const original=fs.readFileSync(path.join(source,'kernel_core.c'),'utf8');
  const {core,names}=instrument(original),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
  fs.writeFileSync(path.join(dest,'kernel_core.c'),core);
  fs.writeFileSync(path.join(dest,'DIAGNOSTIC-ONLY.json'),JSON.stringify({diagnostic_only:true,production_eligible:false,source,
    original_core_sha256:hash(original),instrumented_core_sha256:hash(core),names,
    inherited_cache_identity_is_not_instrumented_artifact_identity:true,clock:'CLOCK_MONOTONIC_RAW',
    single_thread_only:true,overhead:'instrumentation included; not an uninstrumented performance result'},null,2));
  const nodeGyp=require.resolve('node-gyp/bin/node-gyp.js',{paths:[path.resolve(__dirname,'../../packages/flint')]});
  const r=spawnSync(process.execPath,[nodeGyp,'rebuild','--jobs','2'],{cwd:dest,stdio:'inherit'});assert.equal(r.status,0);
  console.log(dest);
}
module.exports={instrument};
if(require.main===module)main();
