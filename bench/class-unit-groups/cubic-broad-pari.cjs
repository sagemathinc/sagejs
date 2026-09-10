"use strict";
// Serial, time-censored phase pilot. Not an end-to-end competitive claim.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const cp = require("node:child_process");
const {validate,sha256} = require("./cubic-broad-corpus.cjs");

function pilot(corpus) {
  validate(corpus);
  const selected = new Map();
  const bands = new Map();
  for (const r of corpus.records) {
    if(r.extremes.length) selected.set(r.label,{record:r,reasons:["database-extreme:"+r.extremes.join(",")]});
    if(r.role!=="development") continue;
    const key=r.r2+":"+r.d_band;
    const previous=bands.get(key);
    // A metadata-selected regulator stress representative, not a random sample.
    if(!previous || Number(r.regulator)>Number(previous.regulator) ||
       (r.regulator===previous.regulator && r.label<previous.label)) bands.set(key,r);
  }
  for(const [band,r] of bands) selected.set(r.label,{record:r,reasons:["largest-recorded-regulator-among-development:"+band]});
  return [...selected.values()].sort((a,b)=>a.record.label.localeCompare(b.record.label,"en"));
}

function gpSource(r,debug=0) {
  if(![0,1].includes(debug)) throw Error("unsupported debug level");
  if(r.coefficients.some(c=>! /^(0|-?[1-9][0-9]*)$/.test(c))) throw Error("unsafe coefficient");
  const f=r.coefficients.map((c,i)=>`(${c})*x^${i}`).join("+");
  return `default(parisizemax,536870912);
setrand(1);
f=${f};
print(["irreducible",polisirreducible(f)]);
t=getwalltime();c=gettime();n=nfinit(f);wt=getwalltime()-t;ct=gettime();print(["nf",wt,ct,Str(n.disc),Str(n.index),n.sign]);
setdebug("bnf",${debug});
t=getwalltime();c=gettime();b=bnfinit(n,0);wt=getwalltime()-t;ct=gettime();print(["bnf",wt,ct,Str(b.no),vector(#b.cyc,i,Str(b.cyc[i])),Str(b.reg)]);
quit;
`;
}

function parse(run,r) {
  const markers=[];
  for(const line of (run.stdout||"").split(/\r?\n/)) {
    if(!line.startsWith("[")) continue;
    try {const value=JSON.parse(line);if(["irreducible","nf","bnf"].includes(value[0]))markers.push(value);} catch {}
  }
  const result={status:"incomplete",markers};
  if(run.error?.code==="ETIMEDOUT") return {...result,status:"timeout"};
  // buch2.c emits these starred non-error diagnostics at debug level 1.
  // Admit only their exact numeric shapes; other starred diagnostics fail.
  const debugDiagnostic = /^(?:\*\*\* Bach constant: | \*\*\*\*\* check = )[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?$/;
  if(run.error || run.status!==0 || (run.stderr||"").split(/\r?\n/).some(l=>l.includes("***")&&!l.includes("Warning:")&&!debugDiagnostic.test(l))) return {...result,status:"error"};
  if(markers.length!==3 || markers.map(m=>m[0]).join(",")!=="irreducible,nf,bnf") return result;
  const [irr,nf,bnf]=markers;
  if(irr.length!==2 || nf.length!==6 || bnf.length!==6 || !Array.isArray(nf[5]) || !Array.isArray(bnf[4]) ||
     ![nf[1],nf[2],bnf[1],bnf[2]].every(t=>Number.isSafeInteger(t)&&t>=0) ||
     typeof bnf[3]!=="string" || !/^[1-9][0-9]*$/.test(bnf[3]) ||
     !bnf[4].every(v=>typeof v==="string"&&/^[1-9][0-9]*$/.test(v)) ||
     !(Number.isFinite(Number(bnf[5]))&&Number(bnf[5])>0)) return {...result,status:"malformed"};
  if(irr[1]!==1) return {...result,status:"reducible"};
  if(nf[3]!==String(BigInt(r.discriminant_absolute)*BigInt(r.disc_sign)) ||
    nf[4]!==r.equation_order_index || JSON.stringify(nf[5])!==JSON.stringify([3-2*r.r2,r.r2])) return {...result,status:"field-mismatch"};
  const invariants=bnf[4].slice().reverse();
  let order=1n,previous=1n;
  for(const entry of invariants) {
    const value=BigInt(entry);
    if(value<=1n || value%previous!==0n) return {...result,status:"malformed"};
    order*=value; previous=value;
  }
  if(order!==BigInt(bnf[3])) return {...result,status:"malformed"};
  if(r.class_number!==null && (bnf[3]!==r.class_number || JSON.stringify(invariants)!==JSON.stringify(r.class_group))) return {...result,status:"class-mismatch"};
  return {...result,status:r.class_number===null?"complete-no-database-answer":"agree",
    nf_wall_ms:nf[1],nf_cpu_ms:nf[2],bnf_wall_ms:bnf[1],bnf_cpu_ms:bnf[2],
    class_number:bnf[3],invariants,regulator:bnf[5]};
}

function main(args) {
  const [corpusFile,destination,gp,mode="run"]=args;
  if(!gp || !["run","plan","all","plan-all"].includes(mode)) throw Error("usage: cubic-broad-pari.cjs CORPUS OUTPUT GP [run|plan|all|plan-all]");
  const corpus=validate(JSON.parse(fs.readFileSync(corpusFile,"utf8")));
  const selected=select(corpus,mode);
  const timeout=10000;
  fs.mkdirSync(destination,{recursive:false}); // Refuse accidental overwrite/restart.
  const protocol={corpus_sha256:corpus.payload_sha256,seed:1,timeout_ms:timeout,
    pari_stack_limit_bytes:536870912,mode,selected:selected.map(s=>({label:s.record.label,reasons:s.reasons})),
    scope:(mode.endsWith("all") ? "Complete frozen stratified panel" : "Metadata-selected stress pilot")+", one fresh process per field, nfinit then bnfinit(nf,0), GRH conditional, no bnfcertify or expanded unit output. Not a representative mean or a repeated competitive timing.",
    runner_sha256:sha256(fs.readFileSync(__filename)),started_at:new Date().toISOString()};
  fs.writeFileSync(path.join(destination,"protocol.json"),JSON.stringify(protocol,null,2)+"\n");
  if(mode.startsWith("plan")) {console.log(JSON.stringify(protocol,null,2));return;}
  protocol.gp=gp;
  protocol.gp_file_sha256=sha256(fs.readFileSync(gp));
  protocol.gp_version=cp.execFileSync(gp,["--version-short"],{encoding:"utf8",timeout:10000}).trim();
  protocol.host={hostname:os.hostname(),platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,load_start:os.loadavg()};
  fs.writeFileSync(path.join(destination,"protocol.json"),JSON.stringify(protocol,null,2)+"\n");
  for(const {record:r,reasons} of selected) {
    const file=path.join(destination,r.label+".gp");
    fs.writeFileSync(file,gpSource(r));
    const start=performance.now();
    const run=cp.spawnSync(gp,["-q","-f",file],{encoding:"utf8",timeout,maxBuffer:8*1024*1024});
    const result={label:r.label,reasons,...parse(run,r),process_wall_ms:performance.now()-start,
      exit_status:run.status,signal:run.signal,error:run.error?.message,stdout:run.stdout,stderr:run.stderr};
    fs.writeFileSync(path.join(destination,r.label+".json"),JSON.stringify(result,null,2)+"\n");
    console.log(JSON.stringify({label:r.label,status:result.status,nf_ms:result.nf_wall_ms,bnf_ms:result.bnf_wall_ms,process_ms:result.process_wall_ms}));
  }
  fs.writeFileSync(path.join(destination,"finished.json"),JSON.stringify({finished_at:new Date().toISOString(),fields:selected.length,load_end:os.loadavg()})+"\n");
}
function select(corpus,mode) {
  validate(corpus);
  if(!["run","plan","all","plan-all"].includes(mode)) throw Error("invalid selection mode");
  return mode.endsWith("all") ? corpus.records.map(record=>({record,reasons:["complete-frozen-panel:"+record.stratum]})) : pilot(corpus);
}
if(require.main===module) main(process.argv.slice(2));
module.exports={pilot,select,gpSource,parse};
