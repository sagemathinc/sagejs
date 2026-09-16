"use strict";
// Alternating prepared-nf candidate comparison. No compilation or altered math.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const {createHash}=require("node:crypto"),{createRequire}=require("node:module");
const sha=x=>createHash("sha256").update(x).digest("hex");
const fileHash=p=>sha(fs.readFileSync(p));
const timingKeys=["unqualifiedBatchSeconds","unqualifiedTeardownBatchSeconds","unqualifiedComputeAndTeardownBatchSeconds"];
function parsePari(stdout,expected){
 const rows=stdout.trim().split("\n").map(JSON.parse);assert.equal(rows.length,2,"reference must emit result and timing lines");
 const result={...rows[0],...rows[1]};
 for(const key of Object.keys(expected))if(!timingKeys.includes(key))assert.deepEqual(result[key],expected[key],"PARI repeat mismatch: "+key);
 for(const key of timingKeys){assert.equal(result[key].length,1);assert(Number.isFinite(result[key][0])&&result[key][0]>=0);}
 assert(result.unqualifiedComputeAndTeardownBatchSeconds[0]>0);
 assert(Math.abs(result.unqualifiedComputeAndTeardownBatchSeconds[0]-result.unqualifiedBatchSeconds[0]-result.unqualifiedTeardownBatchSeconds[0])<1e-9);
 return result;
}
function assertPort(report,reference){
 assert.equal(report.generatedResident,true);assert.equal(report.samples.length,1);
 assert.equal(report.answer.action,0);
 for(const key of ["classNumber","invariants","regulator"])assert.deepEqual(report.answer[key],reference[key],key);
 assert.equal(Number(report.answer.relations),reference.relations);
 for(const key of ["smallElements","factorAttempts","ideals"])assert.equal(report.answer.work[key],reference[key],key);
 const p=report.preparation;assert(p);
 assert.deepEqual(p.degreeState.slice(0,4).map(Number),reference.degreeState);
 assert.deepEqual(p.base.slice(0,5).map(Number),[reference.C1,reference.C2,reference.KC,reference.KCZ,reference.KCZ2]);
 assert.equal(Number(p.state[4]),reference.subfactorCount);
 assert.deepEqual(p.inverseHR.slice(0,3),reference.inverseHR);
 assert.deepEqual(p.rng.slice(0,66),reference.rng);
 const s=report.samples[0];assert(s.milliseconds>0&&s.resetMilliseconds>=0);
}
function ratios(port,pari,portRepetitions,pariRepetitions){
 const denominator=1000*pari.unqualifiedComputeAndTeardownBatchSeconds[0]/pariRepetitions;
 const kernel=port.samples[0].milliseconds/portRepetitions,reset=port.samples[0].resetMilliseconds/portRepetitions;
 return {portKernelMilliseconds:kernel,portResetMilliseconds:reset,pariComputeAndTeardownMilliseconds:denominator,
  kernelSlowdown:kernel/denominator,resetAndKernelSlowdown:(kernel+reset)/denominator};
}
function selfTest(){
 const expected={field:0,action:0,classNumber:"1",invariants:[],regulator:["5","192","1"],relations:73,smallElements:1046,factorAttempts:96,ideals:16,
  degreeState:[0,1230,1833,2270],C1:333,C2:333,KC:66,KCZ:48,KCZ2:48,subfactorCount:4,inverseHR:["7","64","-21"],rng:Array(66).fill("1")};
 const timers={unqualifiedBatchSeconds:[1],unqualifiedTeardownBatchSeconds:[.2],unqualifiedComputeAndTeardownBatchSeconds:[1.2]};
 const p=parsePari(JSON.stringify(expected)+"\n"+JSON.stringify(timers),expected);
 assert.throws(()=>parsePari(JSON.stringify({...expected,smallElements:99})+"\n"+JSON.stringify(timers),expected));
 const report={generatedResident:true,samples:[{milliseconds:80,resetMilliseconds:20}],answer:{action:0,classNumber:"1",invariants:[],regulator:expected.regulator,relations:"73",work:{smallElements:1046,factorAttempts:96,ideals:16}},
  preparation:{degreeState:expected.degreeState.map(String),base:[333,333,66,48,48].map(String),state:["7","0","66","48","4"],inverseHR:expected.inverseHR,rng:expected.rng}};
 assertPort(report,expected);const r=ratios(report,p,4,160);assert.equal(r.kernelSlowdown,20/7.5);assert.equal(r.resetAndKernelSlowdown,25/7.5);
 assert.throws(()=>assertPort({...report,answer:{...report.answer,work:{...report.answer.work,ideals:15}}},expected));
 console.log(JSON.stringify({selfTest:"pass",kernelExecuted:false}));
}
async function main(argv=process.argv.slice(2)){
 if(argv.includes("--self-test")){selfTest();return;}
 assert.equal(process.platform,"linux","explicit Linux affinity diagnostic");
 function get(name,fallback){const i=argv.indexOf(name);if(i<0)return fallback;assert.equal(argv.lastIndexOf(name),i);assert(argv[i+1]&&!argv[i+1].startsWith("--"),name);return argv[i+1];}
 function count(name,fallback,maximum){const text=get(name,String(fallback));assert(/^[1-9][0-9]*$/.test(text),name);const n=Number(text);assert(Number.isSafeInteger(n)&&n<=maximum,name);return n;}
 assert(argv[0]&&argv[1],"INPUTS REFERENCE_BINARY --cpu CPU --cache-key KEY [--run]");
 const inputPath=path.resolve(argv[0]),referenceBinary=path.resolve(argv[1]);
 const cpu=get("--cpu",null);assert(/^\d+$/.test(cpu),"explicit --cpu required; launch under taskset -c CPU");
 const cacheKey=get("--cache-key",null);assert(/^[0-9a-f]{64}$/.test(cacheKey),"explicit canonical --cache-key required");
 const pairs=count("--pairs",7,100),warmups=count("--warmups",3,100),portRepetitions=count("--port-repetitions",4,10000),pariRepetitions=count("--pari-repetitions",160,10000);
 const backend=get("--backend","gmp");assert(["gmp","tagged"].includes(backend));
 const first=get("--first","port");assert(["port","pari"].includes(first));
 const canonical=path.join(__dirname,".sagejs-native-kernels",cacheKey),sourcePath=path.join(__dirname,"resident_generated_class_attempt.py");
 const files={core:path.join(canonical,"kernel_core.c"),adapter:path.join(canonical,"kernel.c"),binding:path.join(canonical,"binding.gyp"),addon:path.join(canonical,"build/Release/sagejs_native_kernel.node"),module:path.join(canonical,"index.cjs"),manifest:path.join(canonical,"manifest.json"),source:sourcePath,harness:__filename,
  input:inputPath,inputResult:path.join(path.dirname(inputPath),"result.json"),inputOutput:path.join(path.dirname(inputPath),"output.json"),referenceBinary,
  referenceFixture:path.resolve(get("--reference-fixtures",path.join(path.dirname(referenceBinary),"fixtures.json"))),probe:path.join(__dirname,"probe_resident_class_attempt.cjs")};
 const hashes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fileHash(p)]));
 const manifest=JSON.parse(fs.readFileSync(files.manifest)),qualified=JSON.parse(fs.readFileSync(files.inputResult)),reference=JSON.parse(fs.readFileSync(files.referenceFixture));
 assert.equal(manifest.cacheKey,cacheKey);assert.equal(manifest.sourceHash,hashes.source);assert.equal(qualified.sourceHash,hashes.source);
 assert.equal(qualified.artifacts.coreHash,hashes.core);assert.equal(qualified.artifacts.addonHash,hashes.addon);
 assert.equal(qualified.outputHash,hashes.inputOutput);
 assert.deepEqual(reference.build.flags,["-O3"],"release reference required");assert.equal(reference.build.executableHash,hashes.referenceBinary);
 assert.equal(reference.output.precisionBits,192);
 files.referenceSource=reference.build.sourcePath;hashes.referenceSource=fileHash(files.referenceSource);assert.equal(hashes.referenceSource,reference.transformedHash);
 files.referenceLibrary=reference.build.pariLibraryPath;hashes.referenceLibrary=fileHash(files.referenceLibrary);assert.equal(hashes.referenceLibrary,reference.build.pariLibraryHash);
 const readOptional=p=>{try{return fs.readFileSync(p,"utf8").trim();}catch{return null;}};
 const affinity=fs.readFileSync("/proc/self/status","utf8").match(/^Cpus_allowed_list:\s*(.*)$/m)[1].trim();
 const host={date:new Date().toISOString(),hostname:os.hostname(),platform:process.platform,arch:process.arch,node:process.version,nodeExecutable:process.execPath,nodeHash:fileHash(process.execPath),kernel:os.release(),cpu,affinity,
  cpus:os.cpus().map(({model,speed})=>({model,speed})),loadavg:os.loadavg(),openblasThreads:process.env.OPENBLAS_NUM_THREADS??null,
  governor:readOptional(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_governor`),frequencyKHz:readOptional(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_cur_freq`)};
 const metadata={qualifiedTiming:false,comparisonToPari:true,pairs,warmups,portRepetitions,pariRepetitions,backend,first,cacheKey,files,hashes,host,
  boundary:"Prepared nf to first accepted invariant-only candidate. PARI compute plus teardown versus native kernel; native reset also reported separately. Not whole bnfinit.",
  limitations:["Single field and shared-host run; CPU affinity does not establish an idle machine.","Eager degree cache, packet substitution and omitted units/generators/honesty frontier follow resident reference audit.","PARI allocation is inside compute; port owner allocation is setup and reset is separate. Ratios do not isolate compiler overhead.","Same cached native module is loaded once, but each pair has fresh JS owner setup and warmups. No compiler lowering is performed.","Manifest and canonical artifacts are pinned to qualified fixture; current transitive source equality is not inferred from entry hash alone.","PARI process launch/nfinit/setup and port require/setup/decoding/assertions are outside kernel clocks; report setup and reset explicitly."]};
 if(!argv.includes("--run")){console.log(JSON.stringify({...metadata,preparedOnly:true,kernelExecuted:false}));return;}
 assert.equal(affinity,cpu,"run under taskset -c the requested CPU");assert.equal(process.env.OPENBLAS_NUM_THREADS,"1");
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-resident-pair-"));
 fs.writeFileSync(path.join(directory,"metadata.json"),JSON.stringify(metadata,null,2));
 const probeSource=fs.readFileSync(files.probe,"utf8");assert.equal(probeSource.split("(async () => {").length,2);
 const executeProbe=new Function("require","__dirname","process","console",probeSource.replace("(async () => {","return (async () => {"));
 const ordinaryRequire=createRequire(files.probe);ordinaryRequire(files.module); // Canonical module/addon loaded once, before all clocks.
 const referenceForProbe=path.join(directory,"reference-for-probe.json");fs.writeFileSync(referenceForProbe,JSON.stringify({outputs:[reference.output]}));
 let interceptions=0;
 async function port(){let report;await executeProbe(name=>name==="../../tools/native-kernel/compiler.cjs"?{compileKernel:async options=>{assert.equal(options.sourcePath,sourcePath);assert.equal(options.profileSymbols,false);interceptions++;return {modulePath:files.module,coreSourcePath:files.core};}}:ordinaryRequire(name),__dirname,
  {argv:[process.execPath,files.probe,inputPath,"--generated-resident","--backend",backend,"--samples","1","--warmups",String(warmups),"--repetitions",String(portRepetitions),"--reference-fixtures",referenceForProbe],cpuUsage:process.cpuUsage.bind(process),resourceUsage:process.resourceUsage.bind(process)},
  {log:text=>{assert.equal(report,undefined);report=JSON.parse(text);},error:error=>{throw error;}});
  assert(report);assertPort(report,reference.output);assert.equal(report.coreSha256,hashes.core);assert.equal(report.sourceSha256,hashes.source);assert.equal(report.inputSha256,hashes.input);return report;
 }
 function pari(){const args=[String(warmups),"1",String(pariRepetitions)];const r=spawnSync(referenceBinary,args,{encoding:"utf8",timeout:600000,maxBuffer:8*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:"1"}});assert.equal(r.status,0,r.stderr||String(r.error));return {args,output:parsePari(r.stdout,reference.output)};}
 const records=[];
 for(let i=0;i<pairs;i++){
  const order=i%2?[first==="port"?"pari":"port",first]:[first,first==="port"?"pari":"port"];
  const record={pair:i+1,order,start:new Date().toISOString()};
  for(const item of order)record[item]=item==="port"?await port():pari();
  record.comparison=ratios(record.port,record.pari.output,portRepetitions,pariRepetitions);records.push(record);
  fs.writeFileSync(path.join(directory,`pair-${i+1}.json`),JSON.stringify(record));
  console.log(JSON.stringify({pair:i+1,order,...record.comparison}));
 }
 assert.equal(interceptions,pairs,"exactly one intercepted compile request per fresh probe setup; zero actual compiler calls");
 for(const [name,p]of Object.entries(files))assert.equal(fileHash(p),hashes[name],"artifact changed during comparison: "+name);
 const mean=key=>Math.exp(records.reduce((s,r)=>s+Math.log(r.comparison[key]),0)/records.length);
 const summary={...metadata,directory,records,compileRequestsIntercepted:interceptions,actualCompilerCalls:0,geometricMeanKernelSlowdown:mean("kernelSlowdown"),geometricMeanResetAndKernelSlowdown:mean("resetAndKernelSlowdown"),endingLoadavg:os.loadavg()};
 fs.writeFileSync(path.join(directory,"result.json"),JSON.stringify(summary,null,2));console.log(JSON.stringify({directory,qualifiedTiming:false,geometricMeanKernelSlowdown:summary.geometricMeanKernelSlowdown,geometricMeanResetAndKernelSlowdown:summary.geometricMeanResetAndKernelSlowdown}));
}
module.exports={parsePari,assertPort,ratios,main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
