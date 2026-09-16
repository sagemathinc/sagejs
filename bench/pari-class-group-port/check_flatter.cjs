"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
let source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/lll.c']);assert.equal(createHash('sha256').update(source).digest('hex'),'ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b');
const start=source.indexOf('static GEN\nZM_flatter(GEN M,'),end=source.indexOf('\nstatic GEN\nZM_flatter_rank',start);assert(start>0&&end>start);let body=source.slice(start,end);
function replace(a,b){assert.equal(body.split(a).length,2);body=body.replace(a,b);}
replace('    if (t==0) { s = t; break; }','    steps=i; lastdrop=t;\n    if (t==0) { s = t; reason=1; break; }');
replace('if (s==t && pot>=pot2)\n        break;', 'if (s==t && pot>=pot2)\n        { reason=2; break; }');
replace('      if (s<t && i > 20)\n      {','      if (s<t && i > 20)\n      { reason=3;');
replace('    M = M2;','    accepted++; M = M2;');
replace('  return  gerepilecopy(ltop, inplace ? M: T);','  observed=gclone(M);\n  return gerepilecopy(ltop, inplace ? M: T);');
source=source.slice(0,start)+'static long steps,accepted,lastdrop,reason; static GEN observed;\n'+body+source.slice(end);
source+=`
static void matrix(GEN M){for(long i=1;i<lgcols(M);i++)for(long j=1;j<lg(M);j++)pari_printf(" %Ps",gcoeff(M,i,j));}
static void emit(GEN M){steps=accepted=lastdrop=reason=0;GEN U=ZM_flatter(M,LLL_IM);printf("%ld %ld %ld %ld %ld",lg(M)-1,steps,accepted,lastdrop,reason);matrix(M);matrix(U);matrix(observed);puts("");if(!gequal(ZM_mul(M,U),observed))exit(3);gunclone(observed);}
int main(void){pari_init(64000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,5,7,11,13,17,19};
for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),192);for(long p=0;p<8;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[p])),1));emit(ZM_mul(nf_get_roundG(nf),I));avma=av;}avma=outer;}
for(long n=3;n<=4;n++)for(long shift=24;shift<=48;shift+=24)for(long sign=-1;sign<=1;sign+=2){pari_sp av=avma;GEN M=zeromatcopy(n,n);for(long i=1;i<=n;i++)gcoeff(M,i,i)=mulsi(sign,int2n(shift*(n-i)));emit(M);avma=av;}pari_close();return 0;}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flatter-')),cpath=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');fs.writeFileSync(cpath,source);
run('cc',['-O2','-fvisibility=hidden','-I'+path.join(pari,'src/headers'),'-I'+lib,cpath,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
const cases=run(exe,[]).trim().split('\n').map(line=>{const r=line.split(' '),n=Number(r[0]),k=n*n;assert.equal(r.length,5+3*k);return {n,diag:r.slice(1,5),basis:r.slice(5,5+k),transform:r.slice(5+k,5+2*k),current:r.slice(5+2*k)};});assert.equal(cases.length,40);assert(cases.some(r=>Number(r.diag[1])>0));
const sourcePath=path.join(__dirname,'flatter.py'),names=fs.readFileSync(sourcePath,'utf8').match(/def pari_flatter\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().split(':')[0]);
function inputs(r){const n=r.n,v={basis:r.basis,n:String(n)};for(const name of names){if(name in v)continue;let length=n*n;if(['qr_input','qr','vectors'].includes(name))length=3*n*n;else if(['betas','norms','column'].includes(name))length=3*n;else if(name==='y')length=n;else if(name==='diagnostic')length=7;else if(['r1','r2','r3','inverse','first','second','final'].includes(name))length=12;else if(['t1','t2','t3','integers','rounded'].includes(name))length=4;v[name]=Array(length).fill('0');}return v;}
const all=cases.map(inputs);
run('python3',['-c',`
import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.flatter').pari_flatter
names,inputs,expected=json.load(sys.stdin)
for raw,r in zip(inputs,expected):
 v={k:list(map(int,x)) if isinstance(x,list) else int(x) for k,x in raw.items()}
 assert f(*(v[k] for k in names))==1,r
 for name in ('current','transform'):assert v[name]==list(map(int,r[name])),(name,r,v[name])
 assert v['diagnostic'][3:7]==list(map(int,r['diag'])),(r,v['diagnostic'])
raw=inputs[0];v={k:list(map(int,x)) if isinstance(x,list) else int(x) for k,x in raw.items()}
v['basis']=[1,0,0,0,1,0,0,0,1<<300]
assert f(*(v[k] for k in names))==2
assert v['diagnostic'][4]==0 and v['diagnostic'][6]==4
assert v['current']==v['basis'] and v['transform']==[1,0,0,0,1,0,0,0,1]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([names,all,cases])});
const mod=require((await compileKernel({sourcePath})).modulePath);
for(let i=0;i<cases.length;i++)for(const backend of ['javascript','gmp']){const v={};for(const[k,x]of Object.entries(all[i]))v[k]=Array.isArray(x)?x.map(BigInt):BigInt(x);assert.equal(mod.pari_flatter[backend](...names.map(k=>v[k])),1n);for(const name of ['current','transform'])assert.deepEqual(v[name],cases[i][name].map(BigInt));assert.deepEqual(v.diagnostic.slice(3,7),cases[i].diag.map(BigInt));}
for(const backend of ['javascript','gmp']){const v={};for(const[k,x]of Object.entries(all[0]))v[k]=Array.isArray(x)?x.map(BigInt):BigInt(x);v.basis=[1n,0n,0n,0n,1n,0n,0n,0n,1n<<300n];assert.equal(mod.pari_flatter[backend](...names.map(k=>v[k])),2n);assert.equal(v.diagnostic[4],0n);assert.equal(v.diagnostic[6],4n);assert.deepEqual(v.current,v.basis);assert.deepEqual(v.transform,[1n,0n,0n,0n,1n,0n,0n,0n,1n]);}
console.log('40 connected FLATTER runs match PARI/CPython/JS/GMP: bases, accumulated transforms, accepted/discarded steps and stopping reasons '+[...new Set(cases.map(r=>r.diag[3]))].join(',')+'; accepted-step cases='+cases.filter(r=>Number(r.diag[1])>0).length+'; maximum steps='+Math.max(...cases.map(r=>Number(r.diag[0]))));
})().catch(e=>{console.error(e);process.exitCode=1;});
