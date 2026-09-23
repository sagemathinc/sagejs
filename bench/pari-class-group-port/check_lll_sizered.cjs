"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
let source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/lll.c']);assert.equal(createHash('sha256').update(source).digest('hex'),'ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b');
source+=`
static void matrix(GEN M,int triples){for(long i=1;i<lgcols(M);i++)for(long j=1;j<lg(M);j++){GEN x=gcoeff(M,i,j);long e;if(!triples)pari_printf(" %Ps",x);else if(typ(x)==t_INT)pari_printf(" %Ps -1 0",x);else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}}
int main(void){pari_init(64000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,5,7,11,13,17,19};
for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),192);for(long p=0;p<8;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[p])),1));GEN R=gramschmidt_dynprec(ZM_mul(nf_get_roundG(nf),I));long N=lg(R)-1,n=N/2,c=N-n;GEN R1=matslice(R,1,n,1,n),R2=matslice(R,1,n,n+1,N),R3=matslice(R,n+1,N,n+1,N);GEN T1=lllfp(R1,.99,LLL_IM|LLL_UPPER|LLL_NOCERTIFY),T3=lllfp(R3,.99,LLL_IM|LLL_UPPER|LLL_NOCERTIFY);
for(long variant=0;variant<2;variant++){if(variant){T1=matid(n);gcoeff(T1,1,n)=stoi(n==1?-1:3);T3=mkmat2(mkcol2(gen_1,gen_0),mkcol2(stoi(-2),gen_1));}GEN A=RgM_mul(RgM_inv_upper(R1),R2),B=RgM_mul(A,T3),C=gmul(ZM_inv(T1,NULL),B),U=sizered(T1,T3,R1,R2);printf("%ld %ld",n,c);matrix(T1,0);matrix(T3,0);matrix(R1,1);matrix(R2,1);matrix(A,1);matrix(B,1);matrix(C,1);matrix(U,0);puts("");}avma=av;}avma=outer;}pari_close();return 0;}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-sizered-')),cpath=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');fs.writeFileSync(cpath,source);
run('cc',['-O2','-fvisibility=hidden','-I'+path.join(pari,'src/headers'),'-I'+lib,cpath,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
const cases=run(exe,[]).trim().split('\n').map(line=>{const a=line.split(' '),n=Number(a.shift()),c=Number(a.shift()),take=k=>a.splice(0,k);const r={n,c,t1:take(n*n),t3:take(c*c),r1:take(3*n*n),r2:take(3*n*c),first:take(3*n*c),second:take(3*n*c),final:take(3*n*c),out:take(n*c)};assert.equal(a.length,0);return r;});assert.equal(cases.length,64);
run('python3',['-c',`
import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_sizered').pari_lll_sizered
for r in json.load(sys.stdin):
 n=r['n'];c=r['c'];out=[0]*4;first=[0]*12;second=[0]*12;final=[0]*12
 f(*[list(map(int,r[k])) for k in ('t1','t3','r1','r2')],n,c,[0]*12,first,second,final,[0]*4,out)
 for name,v in [('first',first),('second',second),('final',final),('out',out)]:assert v[:len(r[name])]==list(map(int,r[name])),(name,r,v)
r=json.loads(sys.argv[3]);out=[99]*4
try:f([2],list(map(int,r['t3'])),list(map(int,r['r1'])),list(map(int,r['r2'])),1,2,[0]*12,[0]*12,[0]*12,[0]*12,[0]*4,out)
except ValueError as e:assert 'unimodular' in str(e)
else:raise AssertionError('invalid transform accepted')
assert out==[99]*4
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib'),JSON.stringify(cases[0])],{input:JSON.stringify(cases)});
const mod=require((await compileKernel({sourcePath:path.join(__dirname,'lll_sizered.py')})).modulePath);
for(const r of cases)for(const backend of ['javascript','gmp']){const first=Array(12).fill(0n),second=first.slice(),final=first.slice(),out=Array(4).fill(0n);mod.pari_lll_sizered[backend](...['t1','t3','r1','r2'].map(k=>r[k].map(BigInt)),BigInt(r.n),BigInt(r.c),Array(12).fill(0n),first,second,final,Array(4).fill(0n),out);for(const [name,v]of Object.entries({first,second,final,out}))assert.deepEqual(v.slice(0,r[name].length),r[name].map(BigInt),name);}
for(const backend of ['javascript','gmp']){const r=cases[0],out=Array(4).fill(99n);assert.throws(()=>mod.pari_lll_sizered[backend]([2n],...['t3','r1','r2'].map(k=>r[k].map(BigInt)),1n,2n,Array(12).fill(0n),Array(12).fill(0n),Array(12).fill(0n),Array(12).fill(0n),Array(4).fill(0n),out),/unimodular/);assert.deepEqual(out,Array(4).fill(99n));}
console.log('64 cross-block size reductions match PARI/CPython/JS/GMP, including all three real matrix intermediates');
})().catch(e=>{console.error(e);process.exitCode=1;});
