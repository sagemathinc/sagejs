"use strict";
// Sequential, bounded fresh processes, with source hashes and exact comparison.
const { spawnSync, execFileSync } = require("node:child_process");
const { readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../../..");
const output = process.argv[2];
const samples = Number(process.argv[3] || 3);
if (!output || !Number.isSafeInteger(samples) || samples < 1) throw Error("usage: node morphisms-performance.cjs OUTPUT.json [SAMPLES]");
const directory = "src/lib/sagejs/modular_abelian_varieties";
const sources = [...readdirSync(path.join(root,directory)).filter(f=>f.endsWith(".py")).map(f=>`${directory}/${f}`),
  "src/baselib/matrix.py", "src/baselib/modular.py"];
const report = { date: new Date().toISOString(), revision: execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  host:{cpu:os.cpus()[0].model,platform:os.platform(),architecture:os.arch(),node:process.version},
  sourceSha256:Object.fromEntries(sources.map(f=>[f,createHash("sha256").update(readFileSync(path.join(root,f))).digest("hex")])),
  policy:"Sequential fresh processes. No library warmup. Timed construction forces integral matrices. Startup excluded. Warm reuse averages ten requests on the same matrix/map. Default native backends; not pinned single-core.",
  samples, results:[] };
const save = () => writeFileSync(output,JSON.stringify(report,null,2)+"\n");
const expected = new Map();
save();
for (const [level,decomposition] of [[389,false],[1009,false],[121,true],[242,true],[363,true]]) {
  for(let sample=0;sample<samples;sample++) for(const system of ["sagejs","sage"]) {
    const executable = system === "sagejs" ? process.execPath : (process.env.SAGE_ORACLE || "/home/user/bin/sage");
    const args=system==="sagejs"?[path.join(__dirname,"morphisms-sagejs.cjs")]:["-python",path.join(__dirname,"morphisms-sage.py")];
    args.push(String(level));
    if(decomposition) args.push("--decomposition");
    process.stdout.write(`Running ${system} N=${level} sample=${sample} ${decomposition ? "oldform-isogeny":"T2-minus-1"}\n`);
    const child=spawnSync(executable,args,{cwd:root,encoding:"utf8",timeout:300000,maxBuffer:8*1024*1024});
    const records=(child.stdout||"").split("\n").filter(l=>l.startsWith("{")).map(l=>JSON.parse(l));
    report.results.push({system,level,sample,status:child.status,signal:child.signal,error:child.error?.message,records});
    save();
    if(child.error?.code==="ETIMEDOUT") continue;
    if(child.status!==0) throw Error(child.stderr||String(child.error));
    assert.equal(records.length,1);
    const {dimension,rank,invariants}=records[0];
    const key=`${level}:${decomposition}`, value={dimension,rank,invariants};
    if(expected.has(key)) assert.deepEqual(value,expected.get(key));
    else expected.set(key,value);
  }
}
console.log(`Saved exact-checked benchmark: ${output}`);
