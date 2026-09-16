"use strict";
// Pinned source extraction; no alternate gamma-function formula.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const archive=path.resolve(process.argv[2]);
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const upstream=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 assert.equal(hash(upstream),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
 const body=upstream.match(/static double\nballvol\(long n\)\n\{[^]*?\n\}/)[0];
 const constant=upstream.match(/static const long maxtry_FACT = 500;/)[0];
 assert(upstream.includes('Fincke_Pohst_bound(4 * maxtry_FACT / F->ballvol, r)'));
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-ball-volume-'));
 const source=`#include <math.h>
#include <stdio.h>
#define odd(n) ((n)&1)
${constant}
${body}
int main(void){putchar('[');for(long n=0;n<=128;n++){if(n)putchar(',');printf("[%.17g,%.17g]",ballvol(n),4*maxtry_FACT/ballvol(n));}puts("]");return 0;}
`;
 fs.writeFileSync(path.join(directory,'oracle.c'),source);
 run('cc',['-O2','-fsanitize=undefined','-fno-sanitize-recover=undefined',path.join(directory,'oracle.c'),'-lm','-o',path.join(directory,'oracle')]);
 const expected=JSON.parse(run(path.join(directory,'oracle'),[]));
 const cp=JSON.parse(run('python3',['-c',`import decimal,sys,importlib,json
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.ball_volume')
for f in (m.pari_ball_volume,m.pari_small_norm_scale):
 try:f(-1)
 except ValueError:pass
 else:raise AssertionError('negative dimension accepted')
print(json.dumps([[m.pari_ball_volume(n),m.pari_small_norm_scale(n)] for n in range(129)]))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')]));
 assert.deepEqual(cp,expected);
 const backends=[];
 if(process.argv.includes('--native')){
  const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
  const built=await compileKernel({sourcePath:path.join(__dirname,'ball_volume.py')});
  const m=require(built.modulePath);
  for(const backend of ['javascript','gmp','tagged']){
   const actual=expected.map((_,n)=>[m.pari_ball_volume[backend](BigInt(n)),m.pari_small_norm_scale[backend](BigInt(n))]);
   assert.deepEqual(actual,expected,backend);
   assert.throws(()=>m.pari_ball_volume[backend](-1n),/negative ball dimension/);
   assert.throws(()=>m.pari_small_norm_scale[backend](-1n),/negative ball dimension/);
   backends.push(backend);
  }
 }
 const result={cases:expected.length,negativeCases:2,backends,sourceHash:hash(source),bodyHash:hash(body),upstreamHash:hash(upstream),directory,qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
