"use strict";
// Coverage and phase diagnostics, not a population-weighted speed comparison.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {validate,sha256} = require("./cubic-broad-corpus.cjs");

function loadRun(corpus, directory) {
  const protocol = JSON.parse(fs.readFileSync(path.join(directory,"protocol.json")));
  const finished = JSON.parse(fs.readFileSync(path.join(directory,"finished.json")));
  assert.equal(protocol.corpus_sha256,corpus.payload_sha256,"wrong corpus");
  assert.equal(finished.fields,corpus.records.length,"unfinished panel");
  const rows = corpus.records.map(r=>JSON.parse(fs.readFileSync(path.join(directory,r.label+".json"))));
  return {directory,protocol,finished,rows,payload_sha256:sha256(JSON.stringify(rows))};
}

function result(output) {
  assert.equal(output.length,64);
  assert(output.every(x=>typeof x==="string" && /^(0|-?[1-9][0-9]*)$/.test(x)));
  assert.equal(output[0],"2","accepted output was not published");
  const count=Number(output[2]);
  assert(Number.isSafeInteger(count) && count>=0 && count<=17);
  const invariants=output.slice(3,3+count);
  let product=1n,previous=1n;
  for (const x of invariants) {
    const n=BigInt(x);assert(n>1n && n%previous===0n);
    product*=n;previous=n;
  }
  assert.equal(String(product),output[1],"invalid invariant order");
  return {class_number:output[1],invariants};
}

function report(corpus, pariRun, nativeRuns) {
  validate(corpus);
  const pari=new Map(pariRun.rows.map(r=>[r.label,r]));
  assert.equal(pari.size,corpus.records.length);
  const counts=rows=>rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
  const bySignature=[0,1].map(r2=>{
    const rows=corpus.records.filter(r=>r.r2===r2).map(r=>pari.get(r.label));
    assert(rows.every(Boolean));
    const complete=rows.filter(r=>["agree","complete-no-database-answer"].includes(r.status));
    return {r2,fields:rows.length,complete:complete.length,
      nf_wall_ms:complete.reduce((n,r)=>n+r.nf_wall_ms,0),
      bnf_wall_ms:complete.reduce((n,r)=>n+r.bnf_wall_ms,0)};
  });
  const runs=nativeRuns.map(run=>{
    const rows=new Map(run.rows.map(r=>[r.label,r]));
    assert.equal(rows.size,corpus.records.length);
    const errors={},phases={},accepted=[];
    for (const field of corpus.records) {
      const row=rows.get(field.label);assert(row,"missing field");
      assert(["accepted","declined","exception","timeout","process-error","outside-complex-signature"].includes(row.status));
      assert.equal(row.status==="outside-complex-signature",field.r2===0);
      if(row.attempts) {
        assert.equal(row.source_hash,run.protocol.source_hash);
        assert.equal(row.cache_key,run.protocol.cache_key);
      }
      if(row.status==="accepted") {
        const attempt=row.attempts.find(a=>a.accepted===true);assert(attempt);
        const answer=result(attempt.output),oracle=pari.get(field.label);
        assert(["agree","complete-no-database-answer"].includes(oracle.status),"missing PARI comparison");
        assert.deepEqual(answer,{class_number:oracle.class_number,invariants:oracle.invariants},field.label);
        assert.equal(attempt.output[28],String(-BigInt(field.discriminant_absolute)));
        assert.equal(attempt.output[29],field.equation_order_index);
        accepted.push(field.label);
      } else if(row.status==="exception") {
        const error=row.attempts.find(a=>a.error)?.error;assert(error);
        errors[error]=(errors[error]||0)+1;
      } else if(row.status==="declined") {
        assert(row.attempts.length && row.attempts.every(a=>a.accepted===false && !a.error));
        const phase=row.attempts.at(-1).output[63];phases[phase]=(phases[phase]||0)+1;
      }
    }
    const pariCostBands={};
    for(const field of corpus.records.filter(f=>f.r2===1)) {
      const oracle=pari.get(field.label);
      const complete=["agree","complete-no-database-answer"].includes(oracle.status);
      const time=oracle.nf_wall_ms+oracle.bnf_wall_ms;
      const band=!complete?"incomplete":time<10?"<10ms":time<100?"10-99ms":time<1000?"100-999ms":">=1000ms";
      const entry=pariCostBands[band]||={fields:0,statuses:{}};
      entry.fields++;
      const status=rows.get(field.label).status;
      entry.statuses[status]=(entry.statuses[status]||0)+1;
    }
    return {directory:run.directory,source_hash:run.protocol.source_hash,
      cache_key:run.protocol.cache_key,payload_sha256:run.payload_sha256,
      statuses:counts(run.rows),errors,decline_phases:phases,complex_pari_cost_bands:pariCostBands,accepted};
  });
  const comparisons=runs.slice(1).map((r,i)=>{
    const base=nativeRuns[0],candidate=nativeRuns[i+1];
    const byLabel=new Map(candidate.rows.map(r=>[r.label,r]));
    const changed=base.rows.filter(b=>b.status==="accepted").filter(b=>{
      const c=byLabel.get(b.label);
      return c.status!=="accepted" || JSON.stringify(b.attempts.find(a=>a.accepted).output)!==JSON.stringify(c.attempts.find(a=>a.accepted).output);
    });
    return {candidate:r.directory,new_accepted:r.accepted.filter(x=>!runs[0].accepted.includes(x)),
      parent_accepted_output_changes:changed.map(x=>x.label)};
  });
  return {corpus_sha256:corpus.payload_sha256,pari_statuses:counts(pariRun.rows),
    pari_signature_phases:bySignature,runs,comparisons,
    scope:"All accepted native answers compared with PARI. No independent certificate replay or competitive native timing claim. Phase sums are unweighted diagnostics, not workload prevalence."};
}

if(require.main===module) {
  const [corpusFile,pariDirectory,...nativeDirectories]=process.argv.slice(2);
  if(!nativeDirectories.length) throw Error("usage: cubic-broad-report.cjs CORPUS PARI_RUN NATIVE_RUN...");
  const corpus=validate(JSON.parse(fs.readFileSync(corpusFile)));
  console.log(JSON.stringify(report(corpus,loadRun(corpus,pariDirectory),nativeDirectories.map(p=>loadRun(corpus,p))),null,2));
}
module.exports={loadRun,result,report};
