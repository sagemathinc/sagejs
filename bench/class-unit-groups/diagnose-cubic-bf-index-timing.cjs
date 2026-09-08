const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
const {performance}=require('node:perf_hooks');
const {spawnSync}=require('node:child_process');
const [directory,gp]=process.argv.slice(2);
const builds=JSON.parse(fs.readFileSync(path.join(directory,'builds.json'))).records;
const variants=builds.map(b=>{
 const module=require(path.join(directory,'cache-'+b.name,b.cacheKey,'index.cjs'));
 assert.equal(module.nativeAvailable,true);const k=module.certified_complex_cubic_class_group_v1;
 return {name:b.name,k,out:k.createIntegerBuffer(64,256),coefficients:k.packIntegerBuffer([-63n,-11n,-1n,1n]),
 scratch:[k.createUInt64Buffer(4161),...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))]};
});
const execute=v=>v.k(v.out,v.coefficients,...v.scratch,0,5,1048576,3145728);
for(const v of variants)for(let i=0;i<100;i++)assert.equal(execute(v),true);
const samples=[];
for(let round=0;round<11;round++){
 for(const which of round%2?[2,1,0]:[0,1,2]){
  if(which===2){
   const r=spawnSync(gp,['-fq'],{encoding:'utf8',timeout:60000,input:'setrand(1);f=x^3-x^2-11*x-63;for(i=1,100,b=bnfinit(f,0));t=getwalltime();for(i=1,1000,b=bnfinit(f,0));print(getwalltime()-t);print(b.no);print(b.cyc);quit;\n'});
   assert.equal(r.status,0,r.stderr);const lines=r.stdout.trim().split('\n');assert.equal(lines[1],'3');assert.equal(lines[2],'[3]');
   samples.push({round,name:'pari',ms:Number(lines[0])/1000});
  }else{
   const v=variants[which];const start=performance.now();for(let i=0;i<256;i++)assert.equal(execute(v),true);
   const ms=(performance.now()-start)/256;const output=v.out.toArray().map(String);assert.equal(output[1],'3');
   assert.deepEqual(output,variants[0].out.toArray().map(String));samples.push({round,name:v.name,ms,output});
  }
 }
 console.error('indexed round',round+1);
}
console.log(JSON.stringify({diagnostic:true,public_call:false,independent_exact_replay:false,promotion:false,
 boundary:'native polynomial-to-result with preallocated scratch versus PARI bnfinit(polynomial,0)',
 host:os.hostname(),node:process.version,builds:builds.map(b=>({name:b.name,sourceSha256:b.sourceSha256,cacheKey:b.cacheKey})),samples},null,2));
