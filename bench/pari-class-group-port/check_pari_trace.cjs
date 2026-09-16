"use strict";
// Diagnostic only. Requires the pinned source plus pari-trace.patch; never use
// this instrumented binary as an unmodified timed comparator.
const assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const {createHash}=require("node:crypto");
const path=require("node:path");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
const panel=require("./panel.json");
// PARI's formatter can separate the mantissa and exponent with whitespace.
function real(tokens,start){
  const value=Number(tokens.slice(start).join(""));
  assert.ok(Number.isFinite(value),"invalid diagnostic real");
  return value;
}
assert.equal(real(["2.0443380014300652","e-38"],0),2.0443380014300652e-38);
(async()=>{
  const gp=process.argv[2];
  assert.ok(gp,"supply absolute diagnostic GP binary path");
  const built=await compileKernel({sourcePath:path.join(__dirname,"enumeration.py")});
  const mod=require(built.modulePath);
  const fields=[3,4].flatMap(degree=>panel.rows.filter(r=>r.phase==="tuning"&&r.degree===degree).slice(0,2));
  for(const field of fields){
    const polynomial=field.coefficients.map((a,i)=>`(${a})*x^${i}`).join("+");
    const run=spawnSync(gp,["-fq"],{input:`nf=nfinit(${polynomial});setrand(1);b=bnfinit(nf,0);print("SJRESULT ",b.no," ",b.cyc);\n`,env:{...process.env,SAGEJS_TRACE_FP:"1"},encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});
    assert.equal(run.status,0,run.error?.message||run.stderr.slice(-1000));
    assert.match(run.stdout,/SJRESULT /);
    const segments=[];let active;
    for(const line of run.stderr.split("\n")){
      const marker=line.indexOf("SJFP_");
      if(marker<0)continue;
      const tokens=line.slice(marker).trim().split(/\s+/);
      if(tokens[0]==="SJFP_BEGIN"){
        const degree=Number(tokens[1]),stride=degree+1;
        active={degree,skip:Number(tokens[2]),bound:real(tokens,3),q:Array(stride*stride).fill(0),v:Array(stride).fill(0),rows:[]};segments.push(active);
      }else if(tokens[0]==="SJFP_V"&&active)active.v[Number(tokens[1])]=real(tokens,2);
      else if(tokens[0]==="SJFP_Q"&&active)active.q[Number(tokens[1])*(active.degree+1)+Number(tokens[2])]=real(tokens,3);
      else if(tokens[0]==="SJFP_X"&&active)active.rows.push({trials:Number(tokens[1]),x:tokens.slice(2).map(Number)});
    }
    assert.ok(segments.length>0,"no instrumented enumeration calls observed");
    let compared=0;
    for(const s of segments)for(const execute of [mod.pari_fp_next,mod.pari_fp_next.javascript]){
      const n=s.degree+1,x=Array(n).fill(0),y=Array(n).fill(0),z=Array(n).fill(0),inc=Array(n).fill(0),state=[0,0,0,0];
      for(const row of s.rows){
        assert.equal(execute(s.q,s.v,x,y,z,inc,state,s.degree,s.bound,s.skip),1n);
        assert.deepEqual(x.slice(1).map(Number),row.x,JSON.stringify({field:field.id,segment:segments.indexOf(s),row,actual:x.map(String),inc:inc.map(String),y,z,q:s.q,v:s.v,bound:s.bound,skip:s.skip}));
        assert.equal(Number(state[1]),row.trials);
        compared++;
      }
    }
    console.log(JSON.stringify({id:field.id,segments:segments.length,candidateComparisons:compared,traceSha256:createHash("sha256").update(JSON.stringify(segments)).digest("hex"),result:run.stdout.trim(),scope:"candidate-prefix and trial counters only; no timing or termination equivalence"}));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
