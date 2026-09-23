"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,input){const r=spawnSync(c,a,{input,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),fixture=path.resolve(process.argv[4]);
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/bibli2.c']),zsource=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/ZV.c']);
 function section(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);}
 const sort=section(source,'static GEN\ngen_sortspec(','\nstatic void\ninit_sort(');
 const cmp=section(source,'int\ncmp_prime_over_p(','\nint\ncmp_prime_ideal(');
 const zcmp=section(zsource,'int\nZV_cmp(','/* assume lg(x) = lg(y), x,y in Z^n */');
 const zobs=zcmp.replace('ZV_cmp(','observed_zcmp(').replace('for (i=1; i<lx; i++)','for (i=1; i<lx; i++, coordinates++)').replace('return fl;','{ coordinates++; return fl; }');
 const cobs=cmp.replace('cmp_prime_over_p(','observed_cmp(').replace('  long k =','  comparisons++; long k =').replace('ZV_cmp(','observed_zcmp(');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-descriptor-sort-'));
 const control='#include "pari.h"\n#include "paripriv.h"\nstatic long comparisons,coordinates;\n'+zobs+cobs+sort+String.raw`
static int wrapped(void *E,GEN a,GEN b){(void)E;return observed_cmp(a,b);}
int main(void){pari_init(16000000,10000);long n,count;char text[4096];int first=1;putchar('[');
while(scanf("%ld %ld",&n,&count)==2){pari_sp av=avma;GEN v=cgetg(count+1,t_VEC);for(long j=1;j<=count;j++){long f;scanf("%ld",&f);GEN u=cgetg(n+1,t_COL);for(long i=1;i<=n;i++){scanf("%4095s",text);gel(u,i)=gp_read_str(text);}gel(v,j)=mkvec5(gen_2,u,gen_1,utoipos(f),gen_1);}
comparisons=coordinates=0;GEN order=count?gen_sortspec(v,count,NULL,wrapped):cgetg(1,t_VECSMALL);
if(!first)putchar(',');first=0;printf("[[");for(long i=1;i<=count;i++){if(i>1)putchar(',');printf("%ld",order[i]-1);}printf("],%ld,%ld]",comparisons,coordinates);set_avma(av);}
puts("]");pari_close();return 0;}
`;
 fs.writeFileSync(path.join(directory,'oracle.c'),control);const lib=path.join(pari,'Olinux-x86_64'),binary=path.join(directory,'oracle');
 run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
 const rows=[];
 for(const n of [3,4,5])for(let count=0;count<=Math.min(n,4);count++)for(let code=0;code<4**count;code++){
  let x=code;const degrees=[],generators=[];
  for(let j=0;j<count;j++){const k=x%4;x=Math.floor(x/4);degrees.push([1,1,2,1][k]);const u=Array(n).fill('0');if(k===1)u[n-1]='-1';if(k===2)u[0]=String(1n<<100n);generators.push(...u);}
  rows.push({n,count,degrees,generators,synthetic:true});
 }
 const actual=JSON.parse(fs.readFileSync(fixture)),groups=new Map();
 for(const r of actual.rows){const key=r.field+':'+r.p;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 function permutations(a){if(a.length<2)return [a];return a.flatMap((x,i)=>permutations(a.filter((_,j)=>i!==j)).map(b=>[x,...b]));}
 for(const group of groups.values())for(const order of permutations(group))rows.push({n:order[0].n,count:order.length,degrees:order.map(r=>r.factor.length-1),generators:order.flatMap(r=>r.u),actual:true,field:order[0].field,p:order[0].p});
 const expected=JSON.parse(run(binary,[],rows.map(r=>[r.n,r.count,...r.degrees.flatMap((f,j)=>[f,...r.generators.slice(j*r.n,(j+1)*r.n)])].join(' ')).join('\n')+'\n'));
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prime_descriptor_sort').pari_prime_descriptor_sort
out=[]
for r in json.load(sys.stdin):
 a=[r['degrees'].copy(),list(map(int,r['generators'])),r['n'],r['count'],[77]*(r['count']+2),[77]*4]
 assert f(*a)==r['count']
 assert a[0]==r['degrees'] and a[1]==list(map(int,r['generators']))
 out.append([a[4],a[5]])
for which in range(8):
 a=[[1],[0,0,0],3,1,[77]*3,[77]*4]
 if which==0:a[2]=2
 if which==1:a[3]=-1
 if which==2:a[3]=4
 if which==3:a[0]=[]
 if which==4:a[1]=[]
 if which==5:a[4]=[]
 if which==6:a[5]=[]
 if which==7:a[0]=[0]
 before=[x.copy() if isinstance(x,list) else x for x in a]
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError('missing descriptor-sort guard')
 assert a==before
bad=[[1]*5,[0]*25,5,5,[77]*7,[77]*4]
before=[x.copy() if isinstance(x,list) else x for x in bad]
try:f(*bad)
except ValueError:pass
else:raise AssertionError('degree-five count-five sort escaped frontier')
assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],JSON.stringify(rows)));
 for(let i=0;i<rows.length;i++)assert.deepEqual(cp[i],[[...expected[i][0],77,77],[expected[i][1],expected[i][2],77,77]]);
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'prime_descriptor_sort.py')});
 const f=require(built.modulePath).pari_prime_descriptor_sort;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const r=rows[i],a=[r.degrees.map(BigInt),r.generators.map(BigInt),BigInt(r.n),BigInt(r.count),Array(r.count+2).fill(77n),Array(4).fill(77n)];
  const args=a.map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,4,x):x);
  assert.equal(Number(f[backend](...args)),r.count);assert.deepEqual([args[4].toArray().map(Number),args[5].toArray().map(Number)],cp[i]);assert.deepEqual(args[0].toArray(),a[0]);assert.deepEqual(args[1].toArray(),a[1]);
 }
 for(const backend of ['javascript','gmp','tagged'])for(let which=0;which<8;which++){
  const a=[[1n],[0n,0n,0n],3n,1n,[77n,77n,77n],[77n,77n,77n,77n]];
  if(which===0)a[2]=2n;if(which===1)a[3]=-1n;if(which===2)a[3]=4n;
  if(which===3)a[0]=[];if(which===4)a[1]=[];if(which===5)a[4]=[];if(which===6)a[5]=[];if(which===7)a[0]=[0n];
  const args=a.map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,4,x):x);
  assert.throws(()=>f[backend](...args),/descriptor/);assert.deepEqual(args.map(x=>typeof x==='bigint'?x:x.toArray()),a);
 }
 for(const backend of ['javascript','gmp','tagged']){
  const a=[[1n,1n,1n,1n,1n],Array(25).fill(0n),5n,5n,Array(7).fill(77n),Array(4).fill(77n)];
  const args=a.map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,4,x):x);
  assert.throws(()=>f[backend](...args),/descriptor/);assert.deepEqual(args.map(x=>typeof x==='bigint'?x:x.toArray()),a);
 }
 const result={cases:rows.length,actual:rows.filter(r=>r.actual).length,invalidControls:9,backends:['cpython','javascript','gmp','tagged'],directory,sortHash:hash(sort),comparatorHash:hash(cmp+zcmp),controlHash:hash(control),actualFixtureHash:hash(fs.readFileSync(fixture)),candidateHash:hash(fs.readFileSync(path.join(__dirname,'prime_descriptor_sort.py'))),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
