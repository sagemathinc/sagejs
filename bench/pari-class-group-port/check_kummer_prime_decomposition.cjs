'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{spawnSync}=require('child_process'),{createHash}=require('crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,input){const r=spawnSync(c,a,{input,encoding:'utf8',timeout:240000,maxBuffer:64000000});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
// Reuse only the prepared nf data collector. Factors/descriptors are never
// passed to the candidate, and expected answers below come from idealprimedec.
const receipt=JSON.parse(run(process.execPath,[path.join(__dirname,'check_kummer_prime_descriptor.cjs'),pari,archive]).trim().split('\n').at(-1));
const prepared=JSON.parse(fs.readFileSync(path.join(receipt.directory,'fixtures.json'))).rows;
const seen=new Set(),rows=[];for(const r of prepared){const key=r.field+':'+r.p;if(seen.has(key))continue;seen.add(key);for(const seed of [1,2])for(const limit of [0,1,2,r.n])rows.push({...r,seed,limit});}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-kummer-decomposition-'));
const code=String.raw`#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
int main(void){pari_init(128000000,10000);long n,p,seed;while(scanf("%ld%ld%ld",&n,&p,&seed)==3){pari_sp av=avma;GEN f=cgetg(n+3,t_POL);f[1]=evalsigne(1);for(long i=0;i<=n;i++){long a;scanf("%ld",&a);gel(f,i+2)=stoi(a);}GEN nf=nfinit(f,nbits2prec(192));setrand(stoi(seed));GEN P=idealprimedec(nf,stoi(p));printf("{\"count\":%ld,\"output\":[",lg(P)-1);int first=1;for(long j=1;j<lg(P);j++){GEN pr=gel(P,j),tau=pr_get_tau(pr),u=pr_get_gen(pr);long inert=typ(tau)==t_INT;if(!first)putchar(',');first=0;printf("\"%ld\",\"%ld\",\"%ld\",\"%ld\"",p,pr_get_e(pr),pr_get_f(pr),inert);for(long i=1;i<=n;i++)pari_printf(",\"%Ps\"",gel(u,i));for(long c=1;c<=n;c++)for(long i=1;i<=n;i++)pari_printf(",\"%Ps\"",inert?(c==1&&i==1?gen_1:gen_0):gcoeff(tau,i,c));}printf("],\"rng\":[");GEN state=getrand();for(long i=0;i<66;i++){if(i)putchar(',');ulong v=*int_W(state,i);if(i==65)v&=63;printf("\"%lu\"",v);}puts("]}");avma=av;}pari_close();}`;
const limitCode=code.replace('long n,p,seed;','long n,p,seed,limit;').replace('scanf("%ld%ld%ld",&n,&p,&seed)==3','scanf("%ld%ld%ld%ld",&n,&p,&seed,&limit)==4').replace('idealprimedec(nf,stoi(p))','idealprimedec_limit_f(nf,stoi(p),limit)');
fs.writeFileSync(path.join(directory,'oracle.c'),limitCode);run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(directory,'oracle')]);
const expected=run(path.join(directory,'oracle'),[],rows.map(r=>[r.n,r.p,r.seed,r.limit,...r.polynomial].join(' ')).join('\n')+'\n').trim().split('\n').map(JSON.parse);
const packets=rows.map(r=>{const n=r.n,s=4+n+n*n,F=k=>Array(k+2).fill('77');return [r.polynomial,r.invzk,r.zk,r.zkDegrees.map(String),r.table,String(n),String(r.p),r.index,r.zkden,F(66),F(16994),F(n+1),F(3),F(1),F(36),F(n),F(n),F(2*n),F(n),F(n),F(n*n+n),F(25),F(n),F(n*n),F(12),F(n*s),F(n*n),F(n),F(n),F(2),F(n*s),F(3)];});
const invalid=[];const original=packets[0],n=rows[0].n,s=4+n+n*n;
packets.forEach((packet,i)=>packet.push(String(rows[i].limit)));
const minima={0:n+1,1:n*n,2:n*n,3:n,4:n*n*n,9:66,10:16994,11:n+1,12:3,13:1,14:36,15:n,16:n,17:2*n,18:n,19:n,20:n*n+n,21:25,22:n,23:n*n,24:12,25:n*s,26:n*n,27:n,28:n,29:2,30:n*s,31:3};
for(const [index,length]of Object.entries(minima)){const a=structuredClone(original);a[index]=Array(length-1).fill('77');invalid.push(a);}
for(const [index,value]of [[5,'2'],[5,'5'],[6,'1'],[6,'3037000494'],[7,'0'],[7,'-1'],[7,original[6]],[8,'0'],[8,'-1']]){const a=structuredClone(original);a[index]=value;invalid.push(a);}
{const a=structuredClone(original);a[32]='-1';invalid.push(a);}
for(const [index,offset,value]of [[0,n,'2'],[3,0,String(n)],[3,0,'-1']]){const a=structuredClone(original);a[index][offset]=value;invalid.push(a);}
const cp=JSON.parse(run('python3',['-c',`import sys,json,importlib,hashlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.kummer_prime_decomposition').pari_kummer_prime_decomposition
seed=importlib.import_module('bench.pari-class-group-port.pari_random').pari_random_seed
packets,rows,invalid=json.load(sys.stdin);out=[]
for packet,row in zip(packets,rows):
 a=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet];seed(a[9],row['seed']);count=f(*a)
 for j in range(5):assert a[j]==list(map(int,packet[j]))
 for j in range(9,32):assert a[j][-2:]==[77,77],j
 out.append(dict(count=count,args=[[str(v) for v in x] if isinstance(x,list) else str(x) for x in a]))
for packet in invalid:
 a=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet];before=[x.copy() if isinstance(x,list) else x for x in a]
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError('missing decomposition guard')
 assert a==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],JSON.stringify([packets,rows,invalid])));
for(let i=0;i<rows.length;i++){assert.equal(cp[i].count,expected[i].count);assert.deepEqual(cp[i].args[30].slice(0,expected[i].output.length),expected[i].output);assert.deepEqual(cp[i].args[9],[...expected[i].rng,'77','77']);assert(cp[i].args[30].slice(expected[i].output.length).every(x=>x==='77'));const r=rows[i],corrections=prepared.filter(x=>x.field===r.field&&x.p===r.p&&x.corrected&&(r.limit===0||x.factor.length-1<=r.limit)).length;assert.deepEqual(cp[i].args[31],['0',String(expected[i].count),String(corrections),'77','77']);}
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs'),built=await compileKernel({sourcePath:path.join(__dirname,'kummer_prime_decomposition.py')}),f=require(built.modulePath).pari_kummer_prime_decomposition;
const sb=await compileKernel({sourcePath:path.join(__dirname,'pari_random.py')}),seed=require(sb.modulePath).pari_random_seed;
for(const backend of ['javascript','gmp','tagged']){
for(let i=0;i<rows.length;i++){const a=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));seed.javascript(a[9],BigInt(rows[i].seed));const count=Number(f[backend](...a));assert.deepEqual({count,args:a.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String))},cp[i]);}
for(const packet of invalid){const a=packet.map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));assert.throws(()=>f[backend](...a),/Kummer decomposition/);assert.deepEqual(a.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String)),packet);}
}
const result={cases:rows.length,primes:seen.size,invalidControls:invalid.length,backends:['cpython','javascript','gmp','tagged'],sourceHash:hash(fs.readFileSync(path.join(__dirname,'kummer_prime_decomposition.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify({directory,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
