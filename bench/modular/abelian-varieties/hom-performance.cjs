"use strict";
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const os = require("node:os");
const root = resolve(__dirname, "../../..");
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function child() {
  const request = JSON.parse(readFileSync(0, "utf8"));
  const createSage = process.argv[3] === "wasm"
    ? (await import(join(root, "packages/flint-wasm/node-kernel.mjs"))).createSage
    : require(join(root, "dist/tools/kernel.js")).createSage;
  const session = await createSage({ timeout: 290000 });
  try {
    const code = "import json\nlevel=" + request.level + "\noracle=json.loads(" +
      JSON.stringify(JSON.stringify(request.oracle)) + ")\n" +
      readFileSync(join(__dirname, "hom-performance.py"), "utf8");
    const result = await session.evaluate(code, { timeout: 290000 });
    process.stdout.write(result.stdout);
  } finally { await session.close(); }
}

function campaign() {
  const output = resolve(process.argv[2]);
  const samples = Number(process.argv[3] || 3);
  const levels = (process.argv[4] || "101,242,389").split(",").map(Number);
  const modes = (process.argv[5] || "native,wasm").split(",");
  if(!Number.isSafeInteger(samples)||samples<1||levels.some(n=>!Number.isSafeInteger(n)||n<1)||modes.some(m=>!["native","wasm"].includes(m))) throw new Error("invalid benchmark arguments");
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const paths = ["src/baselib/modular.py", ...["__init__", "abelian_variety", "lattices", "morphisms", "products", "degeneracy", "homspace"].map(s => "src/lib/sagejs/modular_abelian_varieties/"+s+".py"), ...["hom-performance.cjs","hom-performance.py","hom-performance-sage.py"].map(s=>"bench/modular/abelian-varieties/"+s)];
  const report = { revision, date: new Date().toISOString(), artifact: modes.includes("wasm") ? JSON.parse(readFileSync(join(root,"packages/flint-wasm/dist/production-manifest.json"))).identity : null, host: { cpu: os.cpus()[0].model, platform: process.platform, architecture: process.arch, node: process.version },
    sourceSha256: Object.fromEntries(paths.map(p => [p, digest(readFileSync(join(root,p)))])),
    policy: "Sequential fresh processes, startup excluded, no mathematical warmup. Force complete End(J0(N)).gens(). Independent exact Sage lattice comparison outside timer. Shared host, no concurrent owned builds/tests. Local observations, not four-platform performance qualification.",
    samples, results: [] };
  for (const level of levels) for (let sample=0; sample<samples; sample++) {
    const sage = spawnSync(process.env.SAGE || "/home/user/bin/sage", ["-python", join(__dirname,"hom-performance-sage.py"), String(level)], {encoding:"utf8", timeout:300000, maxBuffer:100*1024*1024});
    if(sage.status!==0) {
      report.results.push({system:"Sage",level,sample,status:sage.status,signal:sage.signal,error:sage.stderr.slice(-4000)});
      writeFileSync(output,JSON.stringify(report,null,2)+"\n");
      throw new Error("Sage oracle failed: "+sage.stderr);
    }
    const baseline = JSON.parse(sage.stdout.trim().split("\n").at(-1));
    const {oracle,...record}=baseline;
    const oracleSha256=digest(JSON.stringify(oracle));
    report.results.push({sample, ...record, oracleSha256});
    writeFileSync(output,JSON.stringify(report,null,2)+"\n");
    for(const mode of modes) {
      console.log(mode,level,sample);
      const result=spawnSync(process.execPath,[__filename,"--child",mode],{cwd:root,input:JSON.stringify({level,oracle}),encoding:"utf8",timeout:300000,maxBuffer:100*1024*1024});
      const entry={system:"Sage.js/"+mode,level,sample,status:result.status,signal:result.signal,oracleSha256};
      if(result.status===0) entry.record=JSON.parse(result.stdout.trim().split("\n").at(-1));
      else entry.error=(result.stderr||result.stdout).slice(-4000);
      report.results.push(entry);
      writeFileSync(output,JSON.stringify(report,null,2)+"\n");
      if(result.status!==0) throw new Error(JSON.stringify(entry));
      if(entry.record.rank!==record.rank||entry.record.dimension!==record.dimension) throw new Error("Sage dimension/rank mismatch");
    }
  }
}
if(process.argv[2]==="--child") child().catch(e=>{console.error(e);process.exitCode=1;});
else campaign();
