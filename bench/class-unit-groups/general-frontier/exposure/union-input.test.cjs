// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const api = require("./export.cjs"), rec = require("./reconcile.cjs"), adapter = require("./union-input.cjs");
const coverage = require("./source-coverage.cjs"), policy = require("./source-coverage-policy-v2.json");
const base = require("../corpus/candidate-pool.cjs"), hard = require("../corpus/hard-windows.cjs"), builder = require("../corpus/source-union.cjs");
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-exposure-union-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v2 = path.join(dir, "v2"), hw = path.join(dir, "hard"); fs.mkdirSync(v2); fs.mkdirSync(hw);
  function row(index) {
    const d = (BigInt(hard.WINDOWS[0].lower_inclusive) + BigInt(index)).toString();
    return { ...Object.fromEntries(base.RAW_KEYS.map(k => [k, null])), label: `8.8.${d}.1`, degree: 8, r2: 0,
      disc_abs: d, disc_sign: 1, coeffs: [String(-999-index),"0","0","0","0","0","0","0","1"] };
  }
  const first = row(1), second = row(2), identity = base.identity([], null, [first.label]);
  const cell = base.cells().find(c => c.id === "n8-r2-0-d5-all"), receipt = base.receipt(cell, [first], identity);
  hard.immutableJson(path.join(v2,"export.json"), identity);
  hard.immutableJson(path.join(v2,cell.id+".000001.receipt.json"), receipt);
  hard.immutableJson(path.join(v2,"pool.json"), base.assemble(identity,[receipt]));
  hard.immutableJson(path.join(hw,"manifest.json"), hard.manifest([{path:"/offline/exclusions.json",json:"[]",sha256:base.sha256("[]"),labels:[]}]));
  hard.fetch(hw, w => ({raw:Buffer.from(w.id===hard.WINDOWS[0].id?JSON.stringify(second)+"\n":""),failure:null,response_truncated:false}));
  const union = builder.buildUnion(v2,hw), acquisitions = {v2_directory:v2,hard_directory:hw};
  const inventoryBody = {schema:api.OUTPUT_SCHEMA,sources:[],records:[]};
  const inventory = {...inventoryBody,inventory_sha256:api.digest(inventoryBody)};
  const oracle = {schema_version:1,cases:[],oracle_baseline:{oracles:{sage_pari:{records:[]},magma:{records:[]}}}};
  function write(name,value) { const file=path.join(dir,name),raw=api.canonical(value)+"\n";fs.writeFileSync(file,raw);return {path:file,sha256:api.sha256(raw)}; }
  const manifest = {schema:rec.UNION_INPUT_SCHEMA,candidates:write("union.json",union),acquisitions,
    inventory:write("inventory.json",inventory),oracle_fixture:write("oracle.json",oracle)};
  return {dir,union,acquisitions,inventory,oracle,manifest,write};
}
test("union manifests retain acquisition hashes without a fake v2 pool identity", t => {
  const f=setup(t), out=rec.fromManifest(f.manifest,f.dir);
  assert.equal(out.schema,"sagejs.general-frontier/exposure-reconciliation-envelope-v2");
  assert.equal(out.result.schema,"sagejs.general-frontier/conservative-exposure-reconciliation-v2");
  assert.equal(out.result.candidate_source.union_sha256,f.union.union_sha256);
  assert.deepEqual(out.result.candidate_source.acquisitions,f.union.acquisitions);
  assert.equal(Object.hasOwn(out.result,"pool_sha256"),false);
  for(const r of out.result.candidates) assert.deepEqual(r.sources,f.union.records.find(x=>x.label===r.label).sources);
  assert.equal(out.result.counts.quarantined,1);
  assert.ok(out.result.candidates.some(r=>r.reasons.some(x=>x.kind==="retained-acquisition-historical-quarantine")));
  assert.deepEqual(out.result.candidates.map(r=>r.holdout_eligible),[false,null]);
  assert.equal(out.result.source_coverage_approved,false);
});
test("self-consistent union hashes cannot substitute for source replay", t => {
  const f=setup(t);
  assert.throws(()=>rec.poolRecords(f.union),/requires unchanged independently/);
  f.union.records[0].sources[0].source_receipt_sha256="a".repeat(64);
  f.union.records_sha256=api.digest(f.union.records);
  const {union_sha256,...body}=f.union;f.union.union_sha256=api.digest(body);
  f.manifest.candidates=f.write("forged-union.json",f.union);
  assert.throws(()=>rec.fromManifest(f.manifest,f.dir),/differs from independently/);
});
test("raw union hash and acquisition-directory bindings both fail closed", t => {
  const f=setup(t);
  assert.throws(()=>rec.fromManifest({...f.manifest,candidates:{...f.manifest.candidates,sha256:"0".repeat(64)}},f.dir),/raw input SHA/);
  assert.throws(()=>rec.fromManifest({...f.manifest,acquisitions:{...f.acquisitions,hard_directory:path.join(f.dir,"absent")}},f.dir),/ENOENT/);
  assert.throws(()=>rec.fromManifest({...f.manifest,pool:f.manifest.candidates},f.dir),/unknown or missing/);
  const {candidates,acquisitions,...legacy}=f.manifest;
  assert.throws(()=>rec.fromManifest({...legacy,schema:rec.INPUT_SCHEMA,pool:candidates},f.dir),/actual v2 pool/);
});
test("authenticated in-memory unions cannot be changed after reconstruction", t => {
  const f=setup(t), u=adapter.authenticateUnion(f.union,f.acquisitions,f.dir);
  assert.equal(rec.poolRecords(u).length,2);
  u.records[0].coefficients[0]="-777";
  assert.throws(()=>rec.poolRecords(u),/requires unchanged independently/);
});
test("all 82 finite proofs rerun against a validated union with explicit report identity", t => {
  const f=setup(t), u=rec.loadCandidateInput(f.manifest,f.dir);
  const out=coverage.compileCoverage(policy,path.resolve(__dirname,"../../../.."),u);
  assert.equal(out.report.schema,"sagejs.general-frontier/source-coverage-report-v3");
  assert.equal(out.report.presentations.length,82);
  assert.equal(out.report.candidate_source.union_sha256,u.union_sha256);
  assert.equal(Object.hasOwn(out.report,"pool_sha256"),false);
  assert.equal(out.report.source_coverage_approved,false);
  assert.equal(out.report.holdout_eligible,null);
});
