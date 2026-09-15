"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
const real=process.argv.includes('--real-blocks');
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
let source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/lll.c']);
assert.equal(createHash('sha256').update(source).digest('hex'),'ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b');
const qfb=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/Qfb.c']);
assert.equal(createHash('sha256').update(qfb).digest('hex'),'861f61aecae22771bd1a9679b6913bafc6325e89ee3147b8d1516ed5cee535d6');
assert.equal(fs.readFileSync(path.join(pari,'src/basemath/Qfb.c'),'utf8'),qfb);
source+=`
static void scalar(GEN x){long e;if(typ(x)==t_INT)pari_printf(" %Ps -1 0",x);else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void emit_real_block(GEN B){GEN M=RgM_rescale_to_int(B),U=lllfp(B,.99,LLL_IM|LLL_UPPER|LLL_NOCERTIFY);printf("X");for(long i=1;i<=2;i++)for(long j=1;j<=2;j++)scalar(gcoeff(B,i,j));for(long i=1;i<=2;i++)for(long j=1;j<=2;j++)pari_printf(" %Ps",gcoeff(M,i,j));for(long i=1;i<=2;i++)for(long j=1;j<=2;j++)pari_printf(" %Ps",gcoeff(U,i,j));puts("");}
static void emit_form(long a,long b,long c){GEN U,Q=mkqfb(stoi(a),stoi(b),stoi(c),stoi(b*b-4*a*c));GEN R=redimagsl2(Q,&U);printf("F %ld %ld %ld",a,b,c);for(long i=1;i<=3;i++)pari_printf(" %Ps",gel(R,i));for(long i=1;i<=2;i++)for(long j=1;j<=2;j++)pari_printf(" %Ps",gcoeff(U,i,j));puts("");}
static void emit_block(GEN R,long first){GEN B=matslice(R,first,first+1,first,first+1);emit_real_block(B);GEN M=RgM_rescale_to_int(B);GEN U=ZM_lll_norms(M,.99,LLL_IM|LLL_UPPER|LLL_NOCERTIFY,NULL);printf("M");for(long i=1;i<=2;i++)for(long j=1;j<=2;j++)pari_printf(" %Ps",gcoeff(M,i,j));for(long i=1;i<=2;i++)for(long j=1;j<=2;j++)pari_printf(" %Ps",gcoeff(U,i,j));puts("");}
int main(void){pari_init(64000000,10000);
for(long a=1;a<=9;a++)for(long b=-30;b<=30;b++)for(long c=1;c<=9;c++)if(b*b<4*a*c){pari_sp av=avma;emit_form(a,b,c);avma=av;}
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),192);for(long p=2;p<=3;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(p)),1));GEN R=gramschmidt_dynprec(ZM_mul(nf_get_roundG(nf),I));long n=lg(R)-1;emit_block(R,n-1);emit_block(R,n==3?1:2);if(n==4)emit_block(R,1);avma=av;}avma=outer;}
for(long sign=-1;sign<=1;sign+=2)for(long shift=-3;shift<=3;shift++)for(long mode=0;mode<4;mode++){pari_sp av=avma;GEN B=mkmat2(mkcol2(stoi(sign*3),gen_0),mkcol2(stoi(5),stoi(16)));for(long i=1;i<=2;i++)for(long j=1;j<=2;j++)if(mode==1 || (mode==2&&i==j) || (mode==3&&j==2))gcoeff(B,i,j)=gmul2n(itor(gcoeff(B,i,j),128),shift);emit_real_block(B);avma=av;}
pari_close();return 0;}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-binary-lll-')),cpath=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');fs.writeFileSync(cpath,source);
run('cc',['-O2','-fvisibility=hidden','-I'+path.join(pari,'src/headers'),'-I'+lib,cpath,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
const rows=run(exe,[]).trim().split('\n').map(x=>x.split(' ')).filter(r=>real?r[0]==='X':r[0]!=='X');
if(real){
 assert.equal(rows.length,76);
 run('python3',['-c',`
import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.lll_rescale');f=m.pari_lll_binary_block
for row in json.load(sys.stdin):
 r=list(map(int,row[1:]));out=[0]*4
 assert f(r[:12],out)==tuple(r[16:]) and out==r[12:16],row
for bad in ([0,0,-64]*4,[1,1,0]*4):
 out=[99]*4
 try:m.pari_lll_rescale(bad,out)
 except ValueError:pass
 else:raise AssertionError('invalid boundary accepted')
 assert out==[99]*4
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 const mod=require((await compileKernel({sourcePath:path.join(__dirname,'lll_rescale.py')})).modulePath);
 for(const row of rows)for(const backend of ['javascript','gmp']){const r=row.slice(1).map(BigInt),out=[0n,0n,0n,0n];assert.deepEqual(mod.pari_lll_binary_block[backend](r.slice(0,12),out),r.slice(16));assert.deepEqual(out,r.slice(12,16));}
 for(const backend of ['javascript','gmp'])for(const triple of [[0n,0n,-64n],[1n,1n,0n]]){const out=Array(4).fill(99n);assert.throws(()=>mod.pari_lll_rescale[backend](Array(4).fill(triple).flat(),out),/outside this boundary|invalid/);assert.deepEqual(out,Array(4).fill(99n));}
 console.log('76 rescale-to-binary-LLL blocks match PARI/CPython/JS/GMP, including 20 actual FLATTER blocks');return;
}
assert.equal(rows.filter(r=>r[0]==='M').length,20);
run('python3',['-c',`
import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.lll_binary')
for row in json.load(sys.stdin):
 k=3 if row[0]=='F' else 4;r=list(map(int,row[1:]));f=m.pari_binary_reduce if k==3 else m.pari_lll_binary
 assert f(*r[:k])==tuple(r[k:]),row
try:m.pari_lll_binary(1,1<<5000,0,1)
except ValueError as e:assert 'recursive' in str(e)
else:raise AssertionError('recursive branch not rejected')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
const mod=require((await compileKernel({sourcePath:path.join(__dirname,'lll_binary.py')})).modulePath);
for(const row of rows){const k=row[0]==='F'?3:4,r=row.slice(1).map(BigInt),name=k===3?'pari_binary_reduce':'pari_lll_binary';for(const backend of ['javascript','gmp'])assert.deepEqual(mod[name][backend](...r.slice(0,k)),r.slice(k));
 const u=r.slice(-4);assert.equal(u[0]*u[3]-u[1]*u[2],1n);
 if(k===3){const [a,b,c,A,B,C]=r,[x,y,z,w]=u;assert.equal(a*x*x+b*x*z+c*z*z,A);assert.equal(2n*a*x*y+b*(x*w+y*z)+2n*c*z*w,B);assert.equal(a*y*y+b*y*w+c*w*w,C);}
}
for(const backend of ['javascript','gmp']){
 assert.throws(()=>mod.pari_lll_binary[backend](1n,1n<<5000n,0n,1n),/recursive/);
 assert.throws(()=>mod.pari_lll_binary[backend](1n,2n,2n,4n),/positive definite/);
}
console.log(`${rows.length} binary reductions match PARI/CPython/JS/GMP, including 20 actual FLATTER blocks and exact SL2/form identities`);
})().catch(e=>{console.error(e);process.exitCode=1;});
