"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const upstream=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/rootpol.c']);
 assert.equal(hash(fs.readFileSync(path.join(pari,'src/basemath/rootpol.c'))),hash(upstream));
 const libraryPath=fs.realpathSync(path.join(lib,'libpari.so')),libraryHash=hash(fs.readFileSync(libraryPath));
 const rows=[];
 for(const bit of [0,1,2,51,52,53,54,62,63,64,65,127,128,129,191,192,255,256,1023,1024,2047,4095])
  for(let delta=-3n;delta<=3n;delta++){const n=(1n<<BigInt(bit))+delta;if(n>0n)rows.push(n,-n);}
 let seed=0x987654321fedcban;
 for(let i=0;i<180;i++){
  let value=0n;const words=1+i%64;
  for(let j=0;j<words;j++){seed=(seed*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);value=(value<<64n)|seed;}
  rows.push(value,-value);
 }
 // Low words must not affect the pinned two-leading-word approximation.
 const top=(0xfedcba9876543210n<<64n)|0xffffffffffffffffn;
 for(const low of [0n,1n,(1n<<192n)-1n])rows.push((top<<192n)|low);
 const strings=rows.map(String),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-discriminant-log-'));
 const control=`#include <pari.h>\n#include <stdio.h>\n#include <math.h>\nint main(void){if(sizeof(long)!=8)return 2;pari_init(8000000,1000);char s[8192];int first=1;putchar('[');while(scanf("%8191s",s)==1){pari_sp av=avma;GEN d=strtoi(s);if(!first)putchar(',');first=0;printf("%.17g",dbllog2(absi_shallow(d))*M_LN2);set_avma(av);}puts("]");pari_close();return 0;}\n`;
 // strtoi consumes an unsigned digit sequence; the test includes negative D.
 const signedControl=control.replace('GEN d=strtoi(s);','GEN d=gp_read_str(s);');
 fs.writeFileSync(path.join(dir,'oracle.c'),signedControl);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,'-include','pari.h','-include','paripriv.h',path.join(dir,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'oracle')]);
 const expected=JSON.parse(run(path.join(dir,'oracle'),[],{input:strings.join('\n')}));assert.equal(expected.length,rows.length);
 const cp=JSON.parse(run('python3',['-c',`import sys,importlib,json
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.discriminant_log').pari_discriminant_log
try:f(0)
except ValueError:pass
else:raise AssertionError('zero accepted')
print(json.dumps([f(int(x)) for x in json.load(sys.stdin)]))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(strings)}));
 assert.deepEqual(cp,expected);
 const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
 const built=await compileKernel({sourcePath:path.join(__dirname,'discriminant_log.py')}),f=require(built.modulePath).pari_discriminant_log;
 const outputs=[];
 for(const backend of ['javascript','gmp','tagged']){
  let maxRelativeError=0,firstDifference=null;
  for(let i=0;i<rows.length;i++){
   const got=f[backend](rows[i]),want=expected[i];
   if(backend!=='javascript')assert.equal(got,want,backend+' '+i);
   const error=Math.abs(got-want)/Math.max(1,Math.abs(want));assert(error<=4*Number.EPSILON);
   maxRelativeError=Math.max(maxRelativeError,error);
   if(got!==want&&firstDifference===null)firstDifference={index:i,got,want};
  }
  assert.throws(()=>f[backend](0n),/zero number-field discriminant/);
  outputs.push({backend,maxRelativeError,firstDifference});
 }
 const result={cases:rows.length,outputs,directory:dir,upstreamSourceHash:hash(upstream),libraryPath,libraryHash,sourceHash:hash(fs.readFileSync(path.join(__dirname,'discriminant_log.py'))),controlHash:hash(signedControl),qualifiedTiming:false};
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
