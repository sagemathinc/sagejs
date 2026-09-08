"use strict";
// Diagnostic only: copy the companion Python file to DIRECTORY/public-target.py.
// Usage: node diagnose-cubic-public-target.cjs BUILT_ROOT DIRECTORY GP
// See docs/cubic-public-target-boundaries.md for boundaries and limitations.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const assert=require('assert/strict');const {spawnSync,execFileSync}=require('child_process');
const [root,directory,gp]=process.argv.slice(2);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const source=path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py');
const index=JSON.parse(fs.readFileSync(path.join(root,'dist/native-kernels/index.json')));
const native=index.logicalSources?.['sagejs/number_fields/cubic_class_number_native.py'] || index.sources[source];assert.ok(native);assert.equal(native.sourceHash,hash(source));
const sourceHash=hash(source), packPath=path.join(root,'dist/native-kernels/pack/sagejs_native_kernel_pack.node'), packHash=hash(packPath);
const before=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const envdir=fs.mkdtempSync('/tmp/cubic-target-cache-');
const env={PATH:process.env.PATH,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC',XDG_CACHE_HOME:envdir,
 OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1',BLIS_NUM_THREADS:'1',FLINT_NUM_THREADS:'1',NUMEXPR_NUM_THREADS:'1',
 SAGEJS_USE_SOURCE:'1',SAGEJS_NATIVE_MODE:'auto',SAGEJS_NATIVE_AUTOLOAD:'1',SAGEJS_NATIVE_REQUIRED:'1',SAGEJS_NATIVE_INTEGER_BACKEND:'auto',
 SAGEJS_NATIVE_CACHE_DIR:path.join(root,'dist/native-kernels'),SAGEJS_MODULE_CACHE_AUTO_CLEANUP:'0',
 SAGEJS_DYNAMIC_CACHE_DIR:path.join(envdir,'dynamic'),SAGEJS_PRECOMPILED_DYNAMIC_CACHE_DIR:path.join(envdir,'precompiled-absent'),SAGEJS_SITE_PACKAGES:path.join(envdir,'site-absent')};
const samples=[];
// Changing parisizemax discards the remainder of its GP input line. Keep stack
// commands separate from setup or the prepared branch receives a linear f.
const gpSource='default(parisizemax,8589934592);\nallocatemem(1073741824);\nsetrand(1);f=x^3-x^2-11*x-63;for(i=1,10,b=bnfinit(f,0));\n'+
'for(mode=0,1,if(mode==0,prepared=vector(128,i,nfinit(f)));t=getwalltime();for(i=1,128,b=if(mode==0,bnfinit(prepared[i],0),bnfinit(Polrev([-63,-11,-1,1]),0)));elapsed=getwalltime()-t;print(mode,"|",elapsed,"|",b.no,"|",b.cyc));quit;\n';
for(let round=0;round<11;round++){
 for(const system of round%2?['pari','sagejs']:['sagejs','pari']){
  const args=system==='sagejs'?[path.join(root,'bin/sagejs'),'--python',path.join(directory,'public-target.py')]:['-fq'];
  const r=spawnSync(system==='sagejs'?process.execPath:gp,args,{cwd:root,env,encoding:'utf8',input:system==='pari'?gpSource:undefined,timeout:180000,maxBuffer:8e6});
  fs.writeFileSync(path.join(directory,`public-${round}-${system}.stdout`),r.stdout||'');fs.writeFileSync(path.join(directory,`public-${round}-${system}.stderr`),r.stderr||'');
  assert.equal(r.status,0,r.stderr);
  if(system==='sagejs'){
   const line=r.stdout.split('\n').find(l=>l.startsWith('CUBIC_TARGET_RESULT='));assert.ok(line,r.stdout);
   for(const row of JSON.parse(line.slice('CUBIC_TARGET_RESULT='.length)))samples.push({round,system,...row,ms:Number(row.root_ns)/row.iterations/1e6});
  }else{
   const lines=r.stdout.trim().split('\n');assert.equal(lines.length,2);
   for(const line of lines){const [mode,elapsed,h,cyc]=line.split('|');assert.equal(h,'3');assert.equal(cyc,'[3]');samples.push({round,system,boundary:mode==='0'?'scalar-prepared':'fresh-complete',ms:Number(elapsed)/128});}
  }
 }
 console.error('public round',round+1);
}
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),before);
assert.equal(hash(source),sourceHash);assert.equal(hash(packPath),packHash);
console.log(JSON.stringify({diagnostic:true,promotion:false,full_corpus_qualified:false,source_commit:before,native,node:process.version,host:os.hostname(),source_sha256:sourceHash,pack_sha256:packHash,gp_sha256:hash(gp),samples},null,2));
