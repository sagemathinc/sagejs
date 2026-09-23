"use strict";

// One resident invocation of the exact translated row-16 prepared root.
// Authentication, compilation, allocation, reset and projection are outside
// kernelNanoseconds. Every run restores every mutable owner first.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const inputApi = require("./row18_fresh_prepared_input.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-16-2fc44918cb458abb64b1573d4b9a45865348ca74e885787e25d7c68b667c937f.json";
const AUTHORITY = "8a2ed127c9e40b458ca074f8472911205b6cc7689a1539c97ed9e56139909d81";

function wordCapacity(values) {
  let result=64;
  for(const raw of values){const v=BigInt(raw),m=v<0n?-v:v;
    result=Math.max(result,Math.ceil(Math.max(1,m.toString(2).length)/64));}
  return result;
}
function view(owner) { return owner.toArray ? owner.toArray() : Array.from(owner); }

async function prepareResident(inputPath=DEFAULT_INPUT) {
  const prepared=JSON.parse(fs.readFileSync(inputPath,"utf8"));
  const authority=authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256,AUTHORITY,"prepared input is outside row 16");
  const fresh=inputApi.makeFreshInput(prepared);
  const built=await compileKernel({sourcePath:inputApi.SOURCE});
  const fn=require(built.modulePath).pari_resident_generated_class_attempt;
  assert.equal(fn.nativeAvailable,true);
  const owners={},reset=[];
  const args=fresh.names.map(([name,kind])=>{
    const raw=fresh.input[name]; let value;
    if(kind==="IntegerBuffer") { value=fn.createIntegerBuffer(raw.length,wordCapacity(raw),raw.map(BigInt));
      const sizes=value.sizes.slice(),limbs=value.limbs.slice(); reset.push(()=>{value.sizes.set(sizes);value.limbs.set(limbs);}); }
    else if(kind==="Int64Buffer") { value=fn.createInt64Buffer(raw.map(BigInt)); const copy=value.slice();reset.push(()=>value.set(copy)); }
    else if(kind==="Float64Buffer") { value=fn.createFloat64Buffer(raw.map(Number));const copy=value.slice();reset.push(()=>value.set(copy)); }
    else if(kind==="int") value=BigInt(raw); else if(kind==="float") value=Number(raw);
    else if(kind==="bool") value=Boolean(raw); else throw new Error(`unsupported ${kind}`);
    owners[name]=value; return value;
  });
  return {authority,built,fn,args,owners,reset};
}

function semanticProjection(owners) {
  assert.deepEqual(Array.from(owners.attempt_state,Number),[4,0,3,1]);
  assert.deepEqual(view(owners.relation_state).slice(0,1).map(String),["54"]);
  assert.deepEqual(view(owners.prep_base_state).slice(0,6).map(String),
    ["215","215","48","31","31","48"]);
  assert.deepEqual(view(owners.class_number).slice(0,1).map(String),["27"]);
  assert.deepEqual(view(owners.class_invariants).slice(0,3).map(String),["3","3","3"]);
  const regulator=view(owners.accept_regulator).slice(0,3).map(String);
  assert.notDeepEqual(regulator,["0","0","0"]);
  return {schema:"sagejs.pari-class-group/row16-flag-zero-matched-projection-v1",
    field:{id:"3.1.1002718428660.2",polynomialAscending:["-73393658","-146523","0","1"]},
    classGroup:{classNumber:"27",invariantFactors:["3","3","3"],generatorCount:"3"},
    unitGroup:{rank:"1",regulatorPresent:true,torsionOrder:"2",flagZeroStatus:"not_given(LARGE)"},
    terminalStatus:"pari-flag-zero-complete"};
}

function runResident(resident) {
  const resetStarted=process.hrtime.bigint(); resident.reset.forEach(fn=>fn());
  const resetNanoseconds=String(process.hrtime.bigint()-resetStarted);
  const started=process.hrtime.bigint(); const status=resident.fn.gmp(...resident.args);
  const kernelNanoseconds=String(process.hrtime.bigint()-started);
  assert.equal(status,0n); const projection=semanticProjection(resident.owners);
  return {schema:"sagejs.pari-class-group/row16-sage-prepared-sample-v1",
    kernelNanoseconds,resetNanoseconds,projection,
    work:{relationCount:"54",factorBaseSize:"48",attemptState:["4","0","3","1"]},
    boundary:{residentProcess:true,compilationInsideClock:false,allocationInsideClock:false,
      resetInsideClock:false,filesystemInsideClock:false,subprocessInsideClock:false,
      replayInsideClock:false,publicationInsideClock:false}};
}

module.exports={AUTHORITY,DEFAULT_INPUT,prepareResident,runResident,semanticProjection};
