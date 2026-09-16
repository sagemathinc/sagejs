"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
const probe=JSON.parse(run(process.execPath,[path.join(__dirname,'probe_lll_preparation.cjs'),pari,archive]));
const cases=probe.rows.map(r=>({n:r.degree,input:r.input}));
for(let n=1;n<=5;n++)for(const bits of [0,80])cases.push({n,input:Array.from({length:n*n},(_,i)=>String(i%n===Math.floor(i/n)?1n<<BigInt(bits+Math.floor(i/n)):i%n>Math.floor(i/n)?3n:0n))});
let source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/lll.c']);
assert.equal(createHash('sha256').update(source).digest('hex'),probe.sourceSHA256);
const start=source.indexOf('static GEN\ngramschmidt_dynprec('),end=source.indexOf('\n/* return -T1',start);assert(start>0&&end>start);
let body=source.slice(start,end);
body=body.replace('    if (!QR_init','    attempts++; requested=bitprec; actualprec=prec;\n    if (!QR_init');
source=source.slice(0,start)+'static long attempts, requested, actualprec;\n'+body+source.slice(end);
source+=`\nstatic void scalar(GEN x){long e;if(typ(x)==t_INT)pari_printf(" %Ps -1 0",x);else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,10000);\n`;
for(const c of cases){source+=`{pari_sp av=avma;GEN M=zeromatcopy(${c.n},${c.n});`;
 c.input.forEach((x,i)=>{assert(/^-?\d+$/.test(x));source+=`gcoeff(M,${Math.floor(i/c.n)+1},${i%c.n+1})=gp_read_str("${x}");`;});
 source+=`attempts=0;requested=actualprec=0;if(ZM_is_upper(M)){requested=${c.n}+31+GS_extraprec(M,0);actualprec=nbits2prec64(requested);attempts=1;}GEN R=gramschmidt_dynprec(M);printf("%ld %ld %ld",attempts,requested,actualprec);for(long i=1;i<=${c.n};i++)for(long j=1;j<=${c.n};j++)scalar(gcoeff(R,i,j));puts("");avma=av;}\n`;
}
source+='pari_close();return 0;}';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-adaptive-qr-')),cpath=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');fs.writeFileSync(cpath,source);
run('cc',['-O2','-fvisibility=hidden','-I'+path.join(pari,'src/headers'),'-I'+lib,cpath,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
const expected=run(exe,[]).trim().split('\n').map(x=>x.split(' '));assert.equal(expected.length,cases.length);
const py=run('python3',['-c',`
import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_preparation').pari_lll_gramschmidt
for c,w in zip(*json.load(sys.stdin)):
 n=c['n'];out=[0]*(3*n*n);diag=[0]*3
 assert f(list(map(int,c['input'])),n,[0]*(3*n*n),out,[0]*(3*n*n),[0]*(3*n),[0]*(3*n),[0]*(3*n),[0]*n,diag)==1
 assert diag+out==list(map(int,w)),(c,diag+out,w)
n=2;out=[99]*12;diag=[0]*3
assert f([1,0,0,1<<300],n,[0]*12,out,[0]*12,[0]*6,[0]*6,[0]*6,[0]*2,diag)==2
assert out==[99]*12 and diag==[0,637,640]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
const mod=require((await compileKernel({sourcePath:path.join(__dirname,'lll_preparation.py')})).modulePath);
for(let k=0;k<cases.length;k++)for(const backend of ['javascript','gmp']){
 const {n,input}=cases[k],out=Array(3*n*n).fill(0n),diag=[0n,0n,0n];
 assert.equal(mod.pari_lll_gramschmidt[backend](input.map(BigInt),BigInt(n),Array(3*n*n).fill(0n),out,Array(3*n*n).fill(0n),Array(3*n).fill(0n),Array(3*n).fill(0n),Array(3*n).fill(0n),Array(n).fill(0n),diag),1n);
 assert.deepEqual(diag.concat(out),expected[k].map(BigInt),`${k} ${backend}`);
}
assert(expected.slice(0,32).some(x=>Number(x[0])>1));
for(const backend of ['javascript','gmp']){
 const out=Array(12).fill(99n),diag=[0n,0n,0n];
 assert.equal(mod.pari_lll_gramschmidt[backend]([1n,0n,0n,1n<<300n],2n,Array(12).fill(0n),out,Array(12).fill(0n),Array(6).fill(0n),Array(6).fill(0n),Array(6).fill(0n),[0n,0n],diag),2n);
 assert.deepEqual(out,Array(12).fill(99n));assert.deepEqual(diag,[0n,637n,640n]);
}
console.log(`${cases.length} adaptive LLL QR preparations match PARI/CPython/JS/GMP, including exact precision retry schedules`);
})().catch(e=>{console.error(e);process.exitCode=1;});
