"use strict";
const assert=require("node:assert/strict"),path=require("node:path");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
 const cases=[];
 for(const b of [2n,3n,7n,101n,(1n<<32n)-1n,(1n<<64n)-1n,1n<<64n,(1n<<80n)+3n])
  for(const e of [0n,1n,2n,12n,13n,14n,31n,64n,127n])
   for(const d of [-1n,0n,1n]){const x=b**e+d;if(x>0n)cases.push([x,b]);}
 for(const b of [3n,7n,(1n<<32n)+1n])cases.push([(1n<<64n)-1n,b]);
 const gp=spawnSync(path.join(process.argv[2],"gp"),["-q","-f"],{input:cases.map(([x,b])=>`print(logint(${x},${b}))`).join("\n")+"\n",encoding:"utf8",timeout:30000,maxBuffer:4000000});
 assert.equal(gp.status,0,gp.stderr);assert.equal(gp.stderr,"");
 const expected=gp.stdout.trim().split("\n").map(BigInt);assert.equal(expected.length,cases.length);
 const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.integral_log').pari_integral_log
for x,b,e in json.load(sys.stdin):
 x,b,e=map(int,(x,b,e))
 assert f(x,b,[0]*32)==e
 assert b**e<=x<b**(e+1)
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(cases.map((c,i)=>[...c,expected[i]].map(String))),encoding:"utf8",timeout:30000});
 assert.equal(py.status,0,py.stderr);
 const built=await compileKernel({sourcePath:path.join(__dirname,"integral_log.py")}),m=require(built.modulePath);
 for(const backend of ["javascript","gmp","tagged"]){
  // At most 2*81*127 bits in an overshooting square; 512 words suffice.
  const scratch=backend==="javascript"?Array(32).fill(0n):m.pari_integral_log.createIntegerBuffer(32,512);
  for(let i=0;i<cases.length;i++)assert.equal(m.pari_integral_log[backend](...cases[i],scratch),expected[i]);
  for(const [x,b]of [[0n,2n],[1n,1n],[-1n,3n]])assert.throws(()=>m.pari_integral_log[backend](x,b,[]));
  assert.throws(()=>m.pari_integral_log[backend](3n**100n,3n,[]),/scratch/);
 }
 console.log(JSON.stringify({cases:cases.length,status:"pass",backends:["PARI","CPython","javascript","gmp","tagged"]}));
})().catch(e=>{console.error(e);process.exitCode=1;});
