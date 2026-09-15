"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64'),sha=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(sha(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/random.c']);assert.equal(fs.readFileSync(path.join(pari,'src/basemath/random.c'),'utf8'),source);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-pari-random-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,String.raw`#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
static void snapshot(void){GEN s=getrand();printf("[");for(int i=0;i<66;i++){ulong v=*int_W(s,i);if(i==65)v&=63;printf("%s\"%lu\"",i?",":"",v);}puts("]");}
int main(void){pari_init(8000000,10000);ulong seed,n;int count,kind;while(scanf("%lu %d",&seed,&count)==2){setrand(utoi(seed));snapshot();for(int i=0;i<count;i++){scanf("%d %lu",&kind,&n);ulong v=kind?pari_rand():random_Fl(n);printf("\"%lu\"\n",v);snapshot();}}pari_close();return 0;}`);
 run('cc',['-O2','-fsanitize=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const seeds=['1','2','18446744073709551615','9223372036854775809'];
 const calls=[];for(let j=0;j<12;j++){for(const n of ['1','2','3','4','5','37','65537','9223372036854775808','9223372036854775809','18446744073709551614','18446744073709551615'])calls.push({kind:0,n});calls.push({kind:1,n:'1'});}
 const trace=run(exe,[],{input:seeds.map(s=>[s,calls.length,...calls.flatMap(c=>[c.kind,c.n])].join(' ')).join('\n')+'\n'}).trim().split('\n').map(JSON.parse);
 let cursor=0;const rows=seeds.map(seed=>{const initial=trace[cursor++],steps=calls.map(c=>({...c,value:trace[cursor++],state:trace[cursor++]}));return {seed,initial,steps};});assert.equal(cursor,trace.length);
 const py=run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.pari_random')
rows=json.load(sys.stdin)
for row in rows:
 s=[77]*68;m.pari_random_seed(s,int(row['seed']));assert s[:66]==list(map(int,row['initial'])) and s[66:]==[77,77]
 for step in row['steps']:
  n=int(step['n']);v=m.pari_random_word(s) if step['kind'] else m.pari_random_fl(s,n)
  assert v==int(step['value']) and s[:66]==list(map(int,step['state'])) and s[66:]==[77,77],step
  s=s.copy()
for seed in [0,-1,2**64]:
 s=[77]*68
 try:m.pari_random_seed(s,seed);assert False
 except ValueError:assert s==[77]*68
for n in [0,-1,2**64]:
 s=[77]*68
 try:m.pari_random_fl(s,n);assert False
 except ValueError:assert s==[77]*68
for name in ['pari_random_seed','pari_random_fl','pari_random_word']:
 s=[77]*65
 try:getattr(m,name)(s,*(() if name=='pari_random_word' else (1,)));assert False
 except ValueError:assert s==[77]*65
for index in [-1,64]:
 s=[0]*66;s[65]=index;before=s.copy()
 try:m.pari_random_word(s);assert False
 except ValueError:assert s==before
print('ok')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});assert.equal(py.trim(),'ok');
 const backends=['cpython'];let coreSha256=null;
 if(process.argv.includes('--native')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'pari_random.py')}),m=require(built.modulePath);coreSha256=sha(fs.readFileSync(built.coreSourcePath));
  for(const backend of ['javascript','gmp','tagged']){
   for(const row of rows){let s=Array(68).fill(77n);assert.equal(m.pari_random_seed[backend](s,BigInt(row.seed)),0n);assert.deepEqual(s,[...row.initial.map(BigInt),77n,77n]);
    for(const step of row.steps){const n=BigInt(step.n),v=step.kind?m.pari_random_word[backend](s):m.pari_random_fl[backend](s,n);assert.equal(v,BigInt(step.value));assert.deepEqual(s,[...step.state.map(BigInt),77n,77n]);s=s.slice();}
   }
   for(const bad of [0n,-1n,18446744073709551616n])for(const name of ['pari_random_seed','pari_random_fl']){const s=Array(68).fill(77n);assert.throws(()=>m[name][backend](s,bad),/outside/);assert.deepEqual(s,Array(68).fill(77n));}
   for(const name of ['pari_random_seed','pari_random_fl','pari_random_word']){const s=Array(65).fill(77n);assert.throws(()=>m[name][backend](s,1n),/short/);assert.deepEqual(s,Array(65).fill(77n));}
   for(const index of [-1n,64n]){const s=Array(66).fill(0n);s[65]=index;const before=s.slice();assert.throws(()=>m.pari_random_word[backend](s),/index/);assert.deepEqual(s,before);}
   backends.push(backend);
  }
 }
 let rejectedCalls=0,zeroDrawCalls=0,maxDraws=0,indexZero=0;
 for(const row of rows){let previous=row.initial;for(const step of row.steps){const draws=(Number(step.state[65])-Number(previous[65])+64)%64;if(draws>1)rejectedCalls++;if(draws===0){zeroDrawCalls++;assert.equal(step.n,'1');assert.equal(step.kind,0);assert.deepEqual(step.state,previous);}maxDraws=Math.max(maxDraws,draws);if(step.state[65]==='0')indexZero++;previous=step.state;}}
 assert(rejectedCalls>0&&zeroDrawCalls===48&&indexZero>0);
 const result={seeds:seeds.length,callsPerSeed:calls.length,rejectedCalls,zeroDrawCalls,maxDraws,indexZero,backends,coreSha256,pariSourceSha256:sha(source),sourceSha256:sha(fs.readFileSync(path.join(__dirname,'pari_random.py'))),qualifiedTiming:false};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,result}));console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
