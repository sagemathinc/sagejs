"use strict";
// Controlled diagnostic boundary, not public receipts or a release benchmark.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const [directory,gp,...extra]=process.argv.slice(2);assert.ok(directory&&gp&&!extra.length);
const builds=JSON.parse(fs.readFileSync(path.join(directory,'builds.json')));
assert.equal(builds.schema,'sagejs.diagnostic/portable-cubic-ablation-v1');
const fields=[
  {coefficients:['122','-7','-1','1'],h:'8',cyc:'[4, 2]'},
  {coefficients:['-55','9','0','1'],h:'5',cyc:'[5]'},
  {coefficients:['-4','3','-1','1'],h:'2',cyc:'[2]'},
  {coefficients:['-63','-11','-1','1'],h:'3',cyc:'[3]'},
];
const implementations=builds.records.map(r=>{
  assert.match(r.name,/^[a-z0-9_]+$/);
  const root=path.join(directory,r.name);
  assert.equal(hash(fs.readFileSync(path.join(root,'source.py'))),r.sourceSha256);
  assert.equal(hash(fs.readFileSync(path.join(root,'index.cjs'))),r.moduleSha256);
  assert.equal(hash(fs.readFileSync(path.join(root,'build/Release/sagejs_native_kernel.node'))),r.addonSha256);
  const m=require(path.resolve(root,'index.cjs'));assert.equal(m.nativeAvailable,true);
  const k=m.certified_complex_cubic_class_group_v1;
  return {...r,k,out:k.createIntegerBuffer(64,256),scratch:[k.createUInt64Buffer(4161),
    ...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))]};
});
function execute(c,input){
  for(const effort of [5,1,7,8]){
    const accepted=c.k(c.out,input,...c.scratch,0,effort,1048576,3145728);
    if(accepted)return effort;
    // Mirror the existing host retry rule; no new retries are permitted.
    const output=c.out.toArray();
    const phase=Number(output[63]),reason=Number(output[59]);
    if(![41,42,43,8].includes(phase)&&!(phase===44&&[437,438].includes(reason)))break;
  }
  throw Error('diagnostic field did not certify');
}
const samples=[];
for(const field of fields){
  const inputs=implementations.map(c=>c.k.packIntegerBuffer(field.coefficients.map(BigInt)));
  for(let i=0;i<implementations.length;i++)for(let w=0;w<20;w++)execute(implementations[i],inputs[i]);
  for(let round=0;round<7;round++){
    const order=Array.from({length:implementations.length+1},(_,i)=>i);
    if(round%2)order.reverse();
    for(const i of order){
      if(i===implementations.length){
        const source=`setrand(1);f=Polrev([${field.coefficients}]);for(i=1,20,b=bnfinit(f,0));t=getwalltime();for(i=1,256,b=bnfinit(f,0));print(getwalltime()-t);print(b.no);print(b.cyc);quit;\n`;
        const p=spawnSync(gp,['-fq'],{input:source,encoding:'utf8',timeout:30000});
        assert.equal(p.status,0,p.stderr);assert.equal(p.stderr.trim(),'');
        const lines=p.stdout.trim().split('\n');assert.equal(lines.length,3);
        assert.equal(lines[1],field.h);assert.equal(lines[2],field.cyc);
        samples.push({coefficients:field.coefficients,round,name:'pari',ms:Number(lines[0])/256});
      }else{
        const c=implementations[i];let effort;const start=performance.now();
        for(let j=0;j<64;j++)effort=execute(c,inputs[i]);
        const ms=(performance.now()-start)/64,output=c.out.toArray().map(String);
        assert.equal(output[1],field.h);
        assert.deepEqual(output.slice(3,3+Number(output[2])).sort(),JSON.parse(field.cyc).map(String).sort());
        samples.push({coefficients:field.coefficients,round,name:c.name,ms,effort,output});
      }
    }
    console.error(field.coefficients.join(','),'round',round+1);
  }
}
console.log(JSON.stringify({schema:'sagejs.diagnostic/cubic-ablation-timing-v1',
  public_call:false,independent_exact_replay:false,promotion:false,
  boundary:'polynomial-to-native-result with preallocated external scratch and existing retry policy versus fresh PARI bnfinit(f,0)',
  sampling:'7 alternating forward/reverse rounds; 64 native calls per sample; 256 PARI calls; 20 warmups',
  host:require('node:os').hostname(),cpus:require('node:os').cpus().map(c=>c.model),node:process.version,
  gpSha256:hash(fs.readFileSync(gp)),builds,samples},null,2));
