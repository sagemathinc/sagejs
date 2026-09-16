"use strict";
const assert=require('node:assert/strict'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
 const cases=[];
 for(const degree of [3,4])for(const distinguished of [0,1,2,3])for(const power of [0,1,2,3])for(const status of [0,-3,1,2,-1,-2])for(const count of [0,1,2,3]){
  // Reference the reverse L_jid loop and its trivial-relation skip directly;
  // supplied collector statuses stand in for ideal preparation/collection.
  const order=[3,1,2].slice(0,count).reverse().filter(j=>!(j===distinguished&&(power+1)%(j===2?1:degree)===0&&(j===2?1:degree)===degree));
  const wanted=status===0||status===-3?order:order.slice(0,1);
  cases.push({degree,distinguished,power,status,count,wanted});
 }
 const python=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.ideal_schedule').pari_next_small_norm_ideal
for c in json.load(sys.stdin):
 s=[0]*4;cur=[9]*5;cnt=[11,12,13,14];p=[21,22,0,0];ids=[]
 while True:
  j=f([3,1,2,0,999],c['count'],[c['degree'],1,c['degree']],[1,1,1],c['degree'],c['distinguished'],c['power'],s,cur,cnt,p)
  if not j: break
  assert cur==[0]*5 and cnt[0]==cnt[3]==p[0]==p[2]==p[3]==0
  assert cnt[1]==3*len(ids) and cnt[2]==13+len(ids) and p[1]==2*len(ids)
  ids.append(j);cnt[1]+=3;cnt[2]+=1;p[1]+=2;p[2]=1;p[3]=c['status']
 assert ids==c['wanted'],(c,ids)
 assert s[2]==1 and s[3]==(0 if c['status'] in (0,-3) or not ids else c['status'])
 before=(s[:],cur[:],cnt[:],p[:]);assert f([3,1,2,0,999],c['count'],[c['degree'],1,c['degree']],[1,1,1],c['degree'],c['distinguished'],c['power'],s,cur,cnt,p)==0
 assert before==(s,cur,cnt,p)
for count in [-1,3]:
 s=[0]*4;cur=[9]*5;cnt=[11,12,13,14];p=[21,22,0,0]
 before=(s[:],cur[:],cnt[:],p[:])
 try:f([0,999],count,[3,1,3],[1,1,1],3,0,0,s,cur,cnt,p)
 except ValueError:pass
 else:raise AssertionError('invalid count accepted')
 assert before==(s,cur,cnt,p)
s=[0]*4;cur=[9]*5;cnt=[11,12,13,14];p=[21,22,0,0]
assert f([0,999],0,[3,1,3],[1,1,1],3,0,0,s,cur,cnt,p)==0
assert s==[0,1,1,0] and cur==[9]*5 and cnt==[11,0,13,14] and p==[21,0,0,0]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases),encoding:'utf8',timeout:30000});assert.equal(python.status,0,python.stderr);
 const mod=require((await compileKernel({sourcePath:path.join(__dirname,'ideal_schedule.py')})).modulePath);
 for(const c of cases)for(const backend of ['javascript','gmp']){
  const s=[0n,0n,0n,0n],cur=Array(5).fill(9n),cnt=[11n,12n,13n,14n],p=[21n,22n,0n,0n],ids=[];
  const args=[[3n,1n,2n,0n,999n],BigInt(c.count),[BigInt(c.degree),1n,BigInt(c.degree)],[1n,1n,1n],BigInt(c.degree),BigInt(c.distinguished),BigInt(c.power),s,cur,cnt,p];
  const invoke=()=>mod.pari_next_small_norm_ideal[backend](...args);
  while(true){const j=invoke();if(!j)break;
   assert.deepEqual(cur,[0n,0n,0n,0n,0n]);assert.deepEqual(cnt,[0n,BigInt(3*ids.length),BigInt(13+ids.length),0n]);assert.deepEqual(p,[0n,BigInt(2*ids.length),0n,0n]);
   assert.throws(invoke,/not terminal/);
   ids.push(Number(j));cnt[1]+=3n;cnt[2]+=1n;p[1]+=2n;p[2]=1n;p[3]=BigInt(c.status);
  }
  assert.deepEqual(ids,c.wanted);assert.equal(s[2],1n);assert.equal(s[3],BigInt(c.status===0||c.status===-3||!ids.length?0:c.status));
  const before=JSON.stringify(args,(_,v)=>typeof v==='bigint'?String(v):v);assert.equal(invoke(),0n);assert.equal(JSON.stringify(args,(_,v)=>typeof v==='bigint'?String(v):v),before);
 }
 for(const backend of ['javascript','gmp']){
  const f=mod.pari_next_small_norm_ideal[backend];
  for(const count of [-1n,3n]){
   const s=[0n,0n,0n,0n],cur=Array(5).fill(9n),cnt=[11n,12n,13n,14n],p=[21n,22n,0n,0n];
   const before=[s.slice(),cur.slice(),cnt.slice(),p.slice()];
   assert.throws(()=>f([0n,999n],count,[3n,1n,3n],[1n,1n,1n],3n,0n,0n,s,cur,cnt,p),/invalid prepared small-norm schedule/);
   assert.deepEqual([s,cur,cnt,p],before);
  }
  const s=[0n,0n,0n,0n],cur=Array(5).fill(9n),cnt=[11n,12n,13n,14n],p=[21n,22n,0n,0n];
  assert.equal(f([0n,999n],0n,[3n,1n,3n],[1n,1n,1n],3n,0n,0n,s,cur,cnt,p),0n);
  assert.deepEqual([s,cur,cnt,p],[[0n,1n,1n,0n],Array(5).fill(9n),[11n,0n,13n,14n],[21n,0n,0n,0n]]);
 }
 console.log(cases.length+' prepared schedule controls pass CPython/JS/GMP; reverse order, skip, termination and preserved cross-ideal counters checked');
})().catch(e=>{console.error(e);process.exitCode=1;});
