"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const archive=path.resolve(process.argv[2]);
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const upstream=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 assert.equal(hash(upstream),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
 const body=upstream.match(/  if \(LOGD < 20\.\)[^]*?lim = -1;/)[0];
 const expression=upstream.match(/subFBgen\(&F,auts,cyclic,(lim < 0\? LIMC2: mindd\(lim,LIMC2\)),MINSFB\)/)[1];
 const cases=[];
 for(const n of [2,3,4,7,10])for(const r2 of [0,Math.floor(n/2)])for(const ld of [0,2,10,19.999999999999996,20,20.000000000000004,40])for(const cap of [1,3,5,100000])cases.push([n,r2,ld,cap]);
 // Straddle both the lower clamp and the final minimum at finite thresholds.
 for(const target of [3,5]){
  const center=2*(Math.log(target/Math.sqrt(2*Math.PI*3))+3-Math.log(4/Math.PI));
  for(const delta of [-1e-12,0,1e-12])cases.push([3,1,center+delta,target===3?100:5]);
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-subfactor-product-'));
 const source=`#include <math.h>
#include <stdio.h>
#define mindd(a,b) ((a)<(b)?(a):(b))
static double policy(long N,long R2,double LOGD,long LIMC2){double lim;
${body}
return ${expression};}
static double cases[][4]={${cases.map(row=>'{'+row.join(',')+'}').join(',')}};
int main(void){putchar('[');for(unsigned i=0;i<sizeof(cases)/sizeof(cases[0]);i++){if(i)putchar(',');printf("%.17g",policy(cases[i][0],cases[i][1],cases[i][2],cases[i][3]));}puts("]");return 0;}
`;
 fs.writeFileSync(path.join(directory,'oracle.c'),source);
 run('cc',['-O2','-fsanitize=undefined','-fno-sanitize-recover=undefined',path.join(directory,'oracle.c'),'-lm','-o',path.join(directory,'oracle')]);
 const expected=JSON.parse(run(path.join(directory,'oracle'),[]));
 const cp=JSON.parse(run('python3',['-c',`import decimal,sys,importlib,json
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.subfactor_product').pari_subfactor_product
for args in [(0,0,1.0,3),(3,-1,1.0,3),(3,2,1.0,3),(3,1,1.0,0)]:
 try:f(*args)
 except ValueError:pass
 else:raise AssertionError('invalid dimensions accepted')
print(json.dumps([f(*x) for x in json.load(sys.stdin)]))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases)}));
 assert.deepEqual(cp,expected,'CPython libm parity');
 const backends=[];
 if(process.argv.includes('--native')){
  const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
  const built=await compileKernel({sourcePath:path.join(__dirname,'subfactor_product.py')});
  const f=require(built.modulePath).pari_subfactor_product;
  for(const backend of ['javascript','gmp','tagged']){
   let maxRelativeError=0,firstDifference=null;
   for(let i=0;i<cases.length;i++){
    const [n,r,ld,cap]=cases[i],got=f[backend](BigInt(n),BigInt(r),ld,BigInt(cap)),want=expected[i];
    if(backend!=='javascript')assert.equal(got,want,'same host libm must match exactly');
    if(want===cap||want===3)assert.equal(got,want,'branch/clamp must agree');
    const error=Math.abs(got-want)/want;maxRelativeError=Math.max(maxRelativeError,error);
    if(got!==want&&firstDifference===null)firstDifference={case:cases[i],actual:got,reference:want};
    // Only JS transcendental functions may differ from the host libm oracle.
    if(backend==='javascript')assert(error<=4*Number.EPSILON,JSON.stringify({backend,i,got,want}));
   }
   for(const args of [[0n,0n,1,3n],[3n,-1n,1,3n],[3n,2n,1,3n],[3n,1n,1,0n]])assert.throws(()=>f[backend](...args),/invalid subfactor product inputs/);
   backends.push({backend,maxRelativeError,firstDifference});
  }
 }
 const result={cases:cases.length,backends,sourceHash:hash(source),policyHash:hash(body+expression),upstreamHash:hash(upstream),directory,qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
