const fs=require('fs'),cp=require('child_process'),path=require('path'),os=require('os'),crypto=require('crypto');
const root=__dirname,sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name),prefix+e.name+'/'):e.name.endsWith('.py')?[{path:prefix+e.name,sha:sha(path.join(dir,e.name))}]:[]).sort((a,b)=>a.path.localeCompare(b.path));}
const sources=files(path.join(root,'baseline/src/lib/mpmath'));
if(JSON.stringify(sources)!==JSON.stringify(files(path.join(root,'candidate/src/lib/mpmath')))||sources.length!==87)throw Error('mpmath source mismatch');
const hashes=Object.fromEntries(['baseline','candidate'].map(n=>[n,sha(path.join(root,n,'dist/compiler/compiler.js'))]));
if (process.version !== 'v26.7.0' || sha(process.execPath) !== 'ad19784f7e90ba789a099eccba77ede8dc90a778c424f1c10a70fed3ff903fdc') throw Error('wrong Node');
if(hashes.baseline!=='3a4f8c162b35ba63b49be64853046a74d8f2e6abbe3a0877b711e1674f5d8f3b'||hashes.candidate!=='2429c323c002b99b31a50525fb8130afb186d1d55b4515d2a34d2ee35f0b3a50')throw Error('wrong compiler');
const report={scope:'compiler-only cold developer experiment: PR263 compiler vs exact same source plus PR252 arraylike tag-set delta, both private-import guards enabled; common c4 runtime/resources; gate30s separately; fixed four non-gating90s diagnostics; no retries, not whole-build qualification',baselineCommit:'ed9506f08 (source9ad99322e)',candidateCommit:'ed9506f08 plus only PR252 builtins.py from7d015d0ce',candidateBuildNode:'26.8.1',baselineBuildNode:'26.8.1',node:process.version,nodeHash:sha(process.execPath),hashes,sources,runs:[]};
for(const [kind,n,cap] of [['gate','baseline',30000],['gate','candidate',30000],...['baseline','candidate','candidate','baseline'].map(n=>['phase',n,90000])]){
 const scratch=fs.mkdtempSync(path.join(root,'cache-'));fs.mkdirSync(path.join(scratch,'empty-precompiled'));
 const env={PATH:'/usr/bin:/bin',HOME:scratch,USERPROFILE:scratch,APPDATA:scratch,LOCALAPPDATA:scratch,XDG_CACHE_HOME:scratch,TMPDIR:scratch,TEMP:scratch,TMP:scratch,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC',SAGEJS_MODULE_CACHE_AUTO_CLEANUP:'0',SAGEJS_PRECOMPILED_MODULE_CACHE_DIR:path.join(scratch,'empty-precompiled')};
 const before=cp.execFileSync('ps',['-eo','pid,comm,pcpu','--sort=-pcpu'],{encoding:'utf8'}),start=performance.now();
 const r=cp.spawnSync(process.execPath,[path.join(root,n,'bin/sagejs-source.cjs'),'--python',path.join(root,kind+'.py')],{cwd:scratch,env,encoding:'utf8',timeout:cap,killSignal:'SIGKILL',maxBuffer:1048576});
 const result={kind,name:n,capMs:cap,scratch,load:os.loadavg(),before,elapsedMs:performance.now()-start,status:r.status,signal:r.signal,error:r.error?.code,stdout:r.stdout,stderr:r.stderr};
 if(r.status===0){if(kind==='phase'&&!r.stdout.includes('PHASE complete'))throw Error('missing verified completion');if(kind==='gate'&&r.stdout!=='1.4142135623730950488\n1.6449340668482264365\n')throw Error('wrong gate output');}
 report.runs.push(result);fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(result));
}
for(const [n,h]of Object.entries(hashes))if(sha(path.join(root,n,'dist/compiler/compiler.js'))!==h)throw Error('artifact changed');
report.verified=true;fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));
