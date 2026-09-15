"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const archive=path.resolve(process.argv[2]);assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const start=source.indexOf('        long oneed = cache.end - cache.last;'),end=source.indexOf('        F.L_jid = trim_list(&F);',start);assert(start>0&&end>start);
 const block=source.slice(start,end),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-collector-next-pass-'));
 // Only allocation is observed, not executed: the production helper returns a
 // capacity frontier instead of silently growing borrowed owners.
 const oracle=`#include <stdio.h>
typedef struct{long len;} object; typedef object* GEN;
#define lg(x) ((x)->len)
typedef struct{long *base,*last,*end;long len;} cache_t;
static long required;
static void pre_allocate(cache_t*c,long n){required=c->last-c->base+n;}
int main(void){long count;if(scanf("%ld",&count)!=1)return 2;long storage[8192];
for(long t=0;t<count;t++){long last,capacity,oldend,need,a,r,w,auts_count;if(scanf("%ld %ld %ld %ld %ld %ld %ld %ld",&last,&capacity,&oldend,&need,&a,&r,&w,&auts_count)!=8)return 3;
cache_t cache={storage,storage+last,storage+oldend,capacity};object wo={w+1},ao={auts_count+1};GEN W=&wo,auts=&ao,R=r?&wo:NULL;
${block}
printf("[%ld,%ld,%ld,%ld]\\n",need,(long)(cache.end-cache.base),required,required>=capacity?-1L:0L);}}
`;
 fs.writeFileSync(path.join(dir,'oracle.c'),oracle);run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined',path.join(dir,'oracle.c'),'-o',path.join(dir,'oracle')]);
 const cases=[];
 // Actual source pass counts: field2 j1/j2; field3 j1..j5. These are
 // boundary-state tests, not claims that this checker discovers relations.
 for(const [last,need,a,r,w,done] of [[150,1,1,0,0,1],[151,1,1,0,0,2],[293,2,0,0,5,1],[293,2,0,0,5,2],[295,1,1,1,5,3],[299,1,1,1,3,4],[300,1,1,1,3,5]])cases.push({last,capacity:4000,oldend:last,need,a,r,w,auts:1,done,phase:1});
 for(let i=0;i<100;i++)cases.push({last:i,capacity:i+1+i%9,oldend:i+i%2,need:1+i%5,a:i%2,r:i%2,w:i%7,auts:i%3,done:1+i%6,phase:i%2+1});
 const expected=run(path.join(dir,'oracle'),[],{input:[cases.length,...cases.flatMap(v=>[v.last,v.capacity,v.oldend,v.need,v.a,v.r,v.w,v.auts])].join(' ')}).trim().split('\n').map(JSON.parse);
 const cp=run('python3',['-c',`import sys,json,importlib,copy
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.collector_next_pass').pari_prepare_next_small_norm_pass
def args(v):
 outer=[0,4,v['done'],2,9,v['last'],v['oldend'],0,0,0,0,v['last'],7,8,0,0,0,v['phase'],0,77]
 return [v['need'],v['a'],v['r'],v['w'],v['auts'],outer,[v['last'],v['capacity'],0,7,19,v['oldend'],77],[0,1,1,1,77],[v['last'],77]]
cases,expected=json.load(sys.stdin)
for v,e in zip(cases,expected):
 a=args(v);before=copy.deepcopy(a);assert f(*a)==e[3]
 if e[3]==0:
  before[6][5]=e[1];before[5][0]=e[0];before[5][14:19]=[v['a'],v['r'],v['w'],0,0];before[7][:4]=[0]*4
 assert a==before,(v,a,before)
for owner in [5,6,7,8]:
 a=args(cases[0]);a[owner]=[];before=copy.deepcopy(a)
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError('short owner')
 assert a==before
for index,value in [(9,1),(17,4),(18,-11),(0,2),(2,0)]:
 a=args(cases[0]);a[5][index]=value;before=copy.deepcopy(a)
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError('unfinished pass')
 assert a==before
a=args(cases[0]);a[8][0]-=1;before=copy.deepcopy(a)
try:f(*a)
except ValueError:pass
else:raise AssertionError('unfinished logprefix')
assert a==before
print('CPython passed')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const built=await compileKernel({sourcePath:path.join(__dirname,'collector_next_pass.py')}),f=require(built.modulePath).pari_prepare_next_small_norm_pass;
 const args=v=>[BigInt(v.need),BigInt(v.a),BigInt(v.r),BigInt(v.w),BigInt(v.auts),[0,4,v.done,2,9,v.last,v.oldend,0,0,0,0,v.last,7,8,0,0,0,v.phase,0,77].map(BigInt),[v.last,v.capacity,0,7,19,v.oldend,77].map(BigInt),[0n,1n,1n,1n,77n],[BigInt(v.last),77n]];
 for(const backend of ['javascript','gmp','tagged']){
  for(let i=0;i<cases.length;i++){const v=cases[i],e=expected[i],a=args(v),before=structuredClone(a);assert.equal(f[backend](...a),BigInt(e[3]));if(e[3]===0){before[6][5]=BigInt(e[1]);before[5][0]=BigInt(e[0]);before[5].splice(14,5,BigInt(v.a),BigInt(v.r),BigInt(v.w),0n,0n);before[7].splice(0,4,0n,0n,0n,0n);}assert.deepEqual(a,before);}
  for(const owner of [5,6,7,8]){const a=args(cases[0]);a[owner]=[];const before=structuredClone(a);assert.throws(()=>f[backend](...a));assert.deepEqual(a,before);}
  for(const [index,value] of [[9,1],[17,4],[18,-11],[0,2],[2,0]]){const a=args(cases[0]);a[5][index]=BigInt(value);const before=structuredClone(a);assert.throws(()=>f[backend](...a));assert.deepEqual(a,before);}
  const a=args(cases[0]);a[8][0]--;const before=structuredClone(a);assert.throws(()=>f[backend](...a));assert.deepEqual(a,before);
  const packed=args(cases[0]),log=f.createIntegerBuffer(2,2,packed[8]);packed[8]=log;
  assert.equal(f[backend](...packed),0n);assert.deepEqual(log.toArray(),[BigInt(cases[0].last),77n]);
 }
 const summary={cases:cases.length,cp:cp.trim(),backends:['javascript','gmp','tagged'],ubsan:true,sourceBlockSha256:hash(block),artifactDirectory:dir,qualifiedTiming:false,realCollectorReplay:false,coreBytes:fs.statSync(built.coreSourcePath).size};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected,summary}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
