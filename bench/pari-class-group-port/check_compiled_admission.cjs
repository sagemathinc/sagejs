"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-admission-"));
  const gates=spawnSync("python3",[path.join(__dirname,"check_matrix_rows.py"),pari,"--gate-json"],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(gates.status,0,gates.stderr);
  const extra=spawnSync("python3",[path.join(__dirname,"check_matrix_rows.py"),pari,"--admission-json"],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(extra.status,0,extra.stderr);
  const rows=[...JSON.parse(gates.stdout),...JSON.parse(extra.stdout)],source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include <pari.h>
#include <paripriv.h>
int main(void){pari_init(64000000,10000);char s[128];GEN products=prodprimes(),support=mului(2,gel(products,lg(products)-1));
printf("%lu %lu",GP_DATA->factorlimit,maxprimelim());for(long i=1;i<=pari_PRIMES[0];i++)printf(" %lu",pari_PRIMES[i]);puts("");
for(long i=1;i<lg(products);i++){char*t=GENtostr(gel(products,i));printf("%s%s",i==1?"":" ",t);pari_free(t);}puts("");
while(scanf("%127s",s)==1){pari_sp av=avma;GEN n=gp_read_str(s);
for(int mode=0;mode<2;mode++){
int smooth=signe(n)&&is_pm1(Z_ppo(n,mode?support:gen_1));printf("%d",smooth);
if(smooth){GEN f=absZ_factor(n);for(long i=1;i<lg(gel(f,1));i++){char*p=GENtostr(gel(gel(f,1),i));printf(" %s %ld",p,itos(gel(gel(f,2),i)));pari_free(p);}}puts("");}
avma=av;}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{input:rows.map(r=>r.at(-3)).join("\n")+"\n",encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const lines=run.stdout.trim().split("\n").map(l=>l.split(" ")),[factorlimit,primeLimit,...primes]=lines[0],products=lines[1],oracle=lines.slice(2);
  const data={rows,oracle,primes,products,factorlimit,primeLimit};
  const py=spawnSync("python3",["-c",`
import sys,json,decimal,importlib
sys.set_int_max_str_digits(100000)
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
front=importlib.import_module('bench.pari-class-group-port.admission').pari_prepared_admission_front
d=json.load(sys.stdin); expected=[]
for i,row in enumerate(d['rows']):
  r=list(map(int,row)); n,real=r[:2]; end=2+3*n*n; entries=r[2:end]
  for mode in [0,1]:
    p=[97]*16;e=[7]*16;m=[0]*n;prec=[0]*n;expo=[0]*n
    args=[entries[0::3],entries[1::3],entries[2::3],r[end:end+n],m,prec,expo,n,real,r[-4],2*int(d['products'][-1]) if mode else 1,list(map(int,d['primes'])),list(map(int,d['products'])),int(d['factorlimit']),int(d['primeLimit']),p,e,7]
    if r[-1] and r[-3]==0:
      try: front(*args)
      except ValueError: expected.append(['error']);continue
      raise AssertionError('zero norm must reject invalid prepared input')
    result=front(*args);stage,norm,error,count,residual=result
    assert (norm,error)==tuple(r[-3:-1])
    factors=list(map(int,d['oracle'][2*i+mode]));smooth=factors[0]
    if not r[-1]: assert stage==0 and count==7 and p==[97]*16 and e==[7]*16
    elif not smooth: assert stage==1 and count==0
    else:
      assert stage in [2,3]
      reference=dict(zip(factors[1::2],factors[2::2]));reconstructed=residual
      for prime,exponent in zip(p[:count],e[:count]):
        assert reference[prime]==exponent
        reconstructed*=prime**exponent
      assert reconstructed==abs(norm)
      if stage==3: assert residual==1 and list(zip(p[:count],e[:count]))==list(reference.items())
    expected.append([list(map(str,result)),list(map(str,p)),list(map(str,e))])
print(json.dumps(expected))
`],{input:JSON.stringify(data),encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(py.status,0,py.stderr);
  const expected=JSON.parse(py.stdout),built=await compileKernel({sourcePath:path.join(__dirname,"admission.py")}),mod=require(built.modulePath),counts=[0,0,0,0,0],completedDegrees=new Set();
  for(let i=0;i<rows.length;i++)for(let mode=0;mode<2;mode++){
    const r=rows[i].map(BigInt),n=Number(r[0]),end=2+3*n*n,entries=r.slice(2,end),bad=expected[2*i+mode][0]==="error",reference=bad?null:expected[2*i+mode].map(a=>a.map(BigInt));counts[bad?4:Number(reference[0][0])]++;
    if(!bad&&reference[0][0]===3n)completedDegrees.add(n);
    for(const backend of ["javascript","gmp","tagged"]){
      const p=Array(16).fill(97n),e=Array(16).fill(7n);
      const args=[0,1,2].map(k=>entries.filter((_,j)=>j%3===k));
      args.push(r.slice(end,end+n),Array(n).fill(0n),Array(n).fill(0n),Array(n).fill(0n),r[0],r[1],r.at(-4),mode?2n*BigInt(products.at(-1)):1n,primes.map(BigInt),products.map(BigInt),BigInt(factorlimit),BigInt(primeLimit),p,e,7n);
      if(bad)assert.throws(()=>mod.pari_prepared_admission_front[backend](...args),/nonzero norm/);
      else assert.deepEqual([mod.pari_prepared_admission_front[backend](...args),p,e],reference);
    }
  }
  assert(counts.every(n=>n>0),`missing a stage control: ${counts}`);
  assert(completedDegrees.has(3)&&completedDegrees.has(4));
  console.log(`${expected.length} connected admission-front cases match PARI stage controls and CPython/JS/GMP/tagged; stages=${counts.join(',')}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
