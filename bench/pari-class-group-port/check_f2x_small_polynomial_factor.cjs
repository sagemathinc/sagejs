"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/FpX_factor.c']);
 const start=source.indexOf('static GEN\nF2x_ddf_simple('),end=source.indexOf('#if 0',start);assert(start>=0&&end>start);
 const ds=source.indexOf('GEN\nF2x_ddf(GEN T)',start),de=source.indexOf('static GEN\nF2xq_frobtrace',ds);
 const fe=source.indexOf('static GEN\nFE_concat('),fee=source.indexOf('static GEN\nddf_to_ddf2_i',fe);
 const literal=source.slice(fe,fee)+source.slice(start,ds)+source.slice(de,end);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-f2x-polynomial-factor-'));
 const control=String.raw`#include "pari.h"
#include "paripriv.h"
static long draws;
static int cmpGuGu(GEN a,GEN b){return (ulong)a<(ulong)b?-1:(a==b?0:1);}
static GEN observed_random(long d,long vs){draws++;return random_F2x(d,vs);}
#define random_F2x observed_random
`+literal+String.raw`
static void state_json(void){GEN x=getrand();putchar('[');for(long i=0;i<66;i++){if(i)putchar(',');GEN word=modii(x,int2n(64));if(i==65)word=modii(word,stoi(64));pari_printf("\"%Ps\"",word);x=shifti(x,-64);}putchar(']');}
int main(void){pari_init(256000000,10000);putchar('[');int first=1;
for(long seed=1;seed<=3;seed++)for(long bits=4;bits<32;bits++){GEN f=mkvecsmall2(0,bits);setrand(stoi(seed));GEN initial=getrand();draws=0;GEN F=F2x_degree(f)>2?F2x_factor_Cantor(f):F2x_factor(f);GEN final=getrand();
setrand(stoi(seed));GEN reference=F2x_factor(f);if(!gequal(F,reference)||!gequal(final,getrand()))return 12;
setrand(initial);if(!first)putchar(',');first=0;printf("{\"seed\":%ld,\"polynomial\":%ld,\"initial\":",seed,bits);state_json();setrand(final);printf(",\"final\":");state_json();printf(",\"draws\":%ld,\"factors\":[",draws);GEN factors=gel(F,1),exponents=gel(F,2);for(long i=1;i<lg(factors);i++){if(i>1)putchar(',');printf("\"%lu\"",uel(gel(factors,i),2));}printf("],\"exponents\":[");for(long i=1;i<lg(exponents);i++){if(i>1)putchar(',');printf("\"%ld\"",exponents[i]);}printf("]}");}
puts("]");pari_close();return 0;}
`;
 fs.writeFileSync(path.join(dir,'oracle.c'),control);run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'oracle')]);
 const rows=JSON.parse(run(path.join(dir,'oracle'),[]));assert.equal(rows.length,84);
 const packets=rows.map(r=>[String(r.polynomial),Array(6).fill('77'),Array(6).fill('77'),Array(26).fill('77'),[...r.initial,'77','77'],['77','77','77']]);
 const expected=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.f2x_small_polynomial_factor').pari_f2x_small_polynomial_factor
out=[]
for packet in json.load(sys.stdin):
 a=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 result=f(*a)
 out.append({'result':result,'args':[[str(y) for y in x] if isinstance(x,list) else str(x) for x in a]})
 for index,length in [(1,1),(2,1),(3,23),(4,65),(5,0)]:
  bad=[x.copy() if isinstance(x,list) else x for x in a];bad[index]=[77]*length
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  try:f(*bad)
  except ValueError as e:assert 'short binary polynomial factor storage' in str(e)
  else:raise AssertionError('missing short guard')
  assert bad==before
 for value in [0,3,32]:
  bad=[x.copy() if isinstance(x,list) else x for x in a];bad[0]=value
  before=[x.copy() if isinstance(x,list) else x for x in bad]
  try:f(*bad)
  except ValueError as e:assert 'binary polynomial factor degree frontier' in str(e)
  else:raise AssertionError('missing polynomial guard')
  assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(packets)}));
 function verify(r,v){assert.equal(v.result,r.factors.length);assert.deepEqual(v.args[1],[...r.factors,...Array(6-r.factors.length).fill('77')]);assert.deepEqual(v.args[2],[...r.exponents,...Array(6-r.exponents.length).fill('77')]);assert.deepEqual(v.args[4],[...r.final,'77','77']);assert.deepEqual(v.args[5],[String(r.draws),'77','77']);assert.deepEqual(v.args[3].slice(-2),['77','77']);}
 rows.forEach((r,i)=>verify(r,expected[i]));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'f2x_small_polynomial_factor.py')});const f=require(built.modulePath).pari_f2x_small_polynomial_factor;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,8,x.map(BigInt)):BigInt(x));const result=Number(f[backend](...args));const snap=()=>args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String));const got={result,args:snap()};assert.deepEqual(got,expected[i]);verify(rows[i],got);
  for(const [index,length]of [[1,1],[2,1],[3,23],[4,65],[5,0]]){const bad=args.slice(),before=snap();bad[index]=f.createIntegerBuffer(length,8,Array(length).fill(77n));assert.throws(()=>f[backend](...bad),/short binary polynomial factor storage/);assert.deepEqual(snap(),before);assert.deepEqual(bad[index].toArray(),Array(length).fill(77n));}
  for(const value of [0n,3n,32n]){const before=snap(),bad=args.slice();bad[0]=value;assert.throws(()=>f[backend](...bad),/binary polynomial factor degree frontier/);assert.deepEqual(snap(),before);}
 }
 const libraryPath=fs.realpathSync(path.join(lib,'libpari.so'));
 const result={cases:rows.length,polynomials:28,seeds:3,backends:['cpython','javascript','gmp','tagged'],sourceHash:hash(fs.readFileSync(path.join(__dirname,'f2x_small_polynomial_factor.py'))),archiveHash:hash(fs.readFileSync(archive)),factorSourceHash:hash(source),oracleSourceHash:hash(literal),controlHash:hash(control),libraryPath,libraryHash:hash(fs.readFileSync(libraryPath)),coreHash:hash(fs.readFileSync(built.coreSourcePath)),directory:dir,qualifiedTiming:false};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
