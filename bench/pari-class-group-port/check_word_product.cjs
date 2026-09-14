"use strict";
const assert=require("node:assert/strict"),path=require("node:path");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
 const limit=(1n<<64n)-1n,values=[0n,1n,limit];
 for(let k=1n;k<64n;k++)values.push((1n<<k)-1n,1n<<k);
 const pairs=values.flatMap(a=>values.map(b=>[a,b]));
 let state=17n;
 for(let i=0;i<1024;i++){state=(6364136223846793005n*state+1442695040888963407n)&limit;const a=state;state=(6364136223846793005n*state+1442695040888963407n)&limit;pairs.push([a,state]);}
 const oracle=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
module=importlib.import_module('bench.pari-class-group-port.short_product')
f=module.pari_mulll_words
for a,b in json.load(sys.stdin):
 a,b=int(a),int(b)
 assert f(a,b)==((a*b)&((1<<64)-1),(a*b)>>64)
H,B=1<<63,1<<64
for args,want in [((H+1,64,7,B-2,64,-3),(H,64,5)),
                  ((H+1,64,7,((H+2)<<64)|(B-1),128,-3),(H+4,64,4))]:
 for sign in [1,-1]:
  signed=(sign*args[0],)+args[1:]
  expected=(sign*want[0],)+want[1:]
  assert module.pari_short_product(*signed)==expected
  assert module.pari_short_product(*(signed[3:]+signed[:3]))==expected
print('CPython wide products pass')
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(pairs.map(p=>p.map(String))),encoding:"utf8",timeout:30000,maxBuffer:4000000});
 assert.equal(oracle.status,0,oracle.stderr);
 const built=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")}),m=require(built.modulePath);
 for(const [a,b]of pairs)for(const backend of ["javascript","gmp","tagged"])
  assert.deepEqual(m.pari_mulll_words[backend](a,b),[(a*b)&limit,(a*b)>>64n]);
 for(const backend of ["javascript","gmp","tagged"]){
  assert.throws(()=>m.pari_mulll_words[backend](-1n,1n));
  assert.throws(()=>m.pari_mulll_words[backend](1n,limit+1n));
 }
 // Deliberately exercise rare rounding-overflow and unequal-precision carry
 // branches, identified by the independent source review.
 const H=1n<<63n,B=1n<<64n;
 const edgeCases=[
  [[H+1n,64n,0n,B-2n,64n,0n],[H,64n,1n]],
  [[H+1n,64n,0n,((H+2n)<<64n)|(B-1n),128n,0n],[H+4n,64n,0n]],
 ];
 for(const [args,expected]of edgeCases)for(const reverse of [false,true])for(const sign of [1n,-1n]){
  let input=[...args];input[0]*=sign;input[2]=7n;input[5]=-3n;
  if(reverse)input=[...input.slice(3),...input.slice(0,3)];
  const want=[expected[0]*sign,expected[1],expected[2]+4n];
  for(const backend of ["javascript","gmp","tagged"])
   assert.deepEqual(m.pari_short_product[backend](...input),want);
 }
 console.log(JSON.stringify({cases:pairs.length,backends:["CPython","javascript","gmp","tagged"],status:"pass"}));
})().catch(e=>{console.error(e);process.exitCode=1;});
