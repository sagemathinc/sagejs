"use strict";
// Supplemental scaling, not a replacement for the complete Sage lattice oracle.
const {readFileSync,writeFileSync}=require("node:fs");
const {join,resolve}=require("node:path");
const {spawnSync,execFileSync}=require("node:child_process");
const {createHash}=require("node:crypto");
const root=resolve(__dirname,"../../..");
async function child(){
  const createSage=process.argv[3]==="wasm"?(await import(join(root,"packages/flint-wasm/node-kernel.mjs"))).createSage:require(join(root,"dist/tools/kernel.js")).createSage;
  const s=await createSage({timeout:290000});
  try{const r=await s.evaluate(`import time,json\nt=time.perf_counter()\nJ=J0(${Number(process.argv[4])})\nH=End(J)\ngens=H.gens()\nelapsed=time.perf_counter()-t\nassert H.verify()\nassert H.one()==J.identity_morphism()\nassert all(g.verify() for g in gens)\nprint(json.dumps({'dimension':J.dimension(),'rank':H.rank(),'seconds':elapsed,'basis':[[str(x) for x in row] for row in H.basis_matrix().rows()]}))`,{timeout:290000});process.stdout.write(r.stdout);}finally{await s.close();}
}
function run(){
  const output=process.argv[2],levels=(process.argv[3]||"242,389").split(",").map(Number),samples=Number(process.argv[4]||3);
  if(!output||levels.some(n=>!Number.isSafeInteger(n)||n<1)||!Number.isSafeInteger(samples)||samples<1)throw Error("invalid arguments");
  const report={revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),artifact:JSON.parse(readFileSync(join(root,"packages/flint-wasm/dist/production-manifest.json"))).identity,policy:"Sequential fresh processes, startup excluded, no warmup. Full End generators timed; completeness replay outside timer. Exact native/Wasm basis equality, NOT a Sage Hom lattice comparison. No concurrent owned builds/tests.",results:[]};
  const expected=new Map();
  report.host={platform:process.platform,architecture:process.arch,node:process.version,cpu:require("node:os").cpus()[0].model};
  report.sourceSha256=Object.fromEntries(["src/baselib/modular.py",... ["__init__","abelian_variety","homspace","lattices","morphisms","products","degeneracy"].map(n=>"src/lib/sagejs/modular_abelian_varieties/"+n+".py")].map(p=>[p,createHash("sha256").update(readFileSync(join(root,p))).digest("hex")]));
  for(const level of levels)for(let sample=0;sample<samples;sample++)for(const mode of ["native","wasm"]){
    console.log(mode,level,sample);
    const c=spawnSync(process.execPath,[__filename,"--child",mode,String(level)],{cwd:root,encoding:"utf8",timeout:300000,maxBuffer:100*1024*1024});
    const entry={level,sample,mode,status:c.status,signal:c.signal};
    if(c.status===0){const {basis,...record}=JSON.parse(c.stdout.trim().split("\n").at(-1));const hash=createHash("sha256").update(JSON.stringify(basis)).digest("hex");entry.record=record;entry.basisSha256=hash;if(expected.has(level)&&expected.get(level)!==hash)throw Error("native/Wasm Hom basis mismatch");expected.set(level,hash);}else entry.error=c.stderr.slice(-4000);
    report.results.push(entry);writeFileSync(output,JSON.stringify(report,null,2)+"\n");if(c.status!==0)throw Error(JSON.stringify(entry));
  }
}
if(process.argv[2]==="--child")child().catch(e=>{console.error(e);process.exitCode=1;});else run();
