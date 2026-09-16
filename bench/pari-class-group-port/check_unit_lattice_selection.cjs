"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:path.join(pari,'..','pari-2.17.4.tar.gz')),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const src=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);assert.equal(hash(src),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
 const start=src.indexOf('GEN\nextract_full_lattice(GEN x)'),end=src.indexOf('\n}',start)+2;assert(start>=0&&end>start);
 let body=src.slice(start,end).replace('extract_full_lattice(GEN x)','oracle_select(GEN x)');
 body=body.replace('H = ZM_hnf(x);','counts[0]++; H = ZM_hnf(x);').replace('h2 = ZM_hnf(vecpermute(x, v));','counts[0]++; h2 = ZM_hnf(vecpermute(x, v));').replace('/* these dj columns can be eliminated */','/* these dj columns can be eliminated */ counts[1]++;').replace('/* at least one interesting column, try with first half of this set */','/* at least one interesting column, try with first half of this set */ counts[2]++;').replace('/* this column should be kept */','/* this column should be kept */ counts[3]++;').replace('if (ZM_equal(h2, H)) break;','if (ZM_equal(h2, H)) { counts[4]++; break; }');
 const cases=[];
 for(const rows of [1,2,3,4])for(const columns of [198,199,200,257])for(let kind=0;kind<5;kind++){
  const values=Array(rows*columns).fill(0);
  for(let j=0;j<columns;j++)for(let i=0;i<rows;i++){
   if(kind===1&&j===columns-rows+i)values[j*rows+i]=1;
   if(kind===2){if(j===i)values[j*rows+i]=2;if(j===columns-rows+i)values[j*rows+i]=3;}
   if(kind===3)values[j*rows+i]=(j*13+i*7+j*i)%11-5;
   if(kind===4){if(i===0&&j<=10)values[j*rows+i]=2**(10-j);if(i>0&&j===columns-rows+i)values[j*rows+i]=1;}
  }
  cases.push({rows,columns,values});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-unit-selection-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,`#include "pari.h"\n#include <stdio.h>\nstatic long counts[5];\n${body}\nint main(void){pari_init(64000000,1000);long rows,cols;while(scanf("%ld %ld",&rows,&cols)==2){pari_sp av=avma;GEN x=zeromatcopy(rows,cols);for(long j=1;j<=cols;j++)for(long i=1;i<=rows;i++){long a;if(scanf("%ld",&a)!=1)return 2;gcoeff(x,i,j)=stoi(a);}for(int i=0;i<5;i++)counts[i]=0;GEN v=oracle_select(x);printf("%d %ld",v?1:0,v?lg(v)-1:0);for(int i=0;i<5;i++)printf(" %ld",counts[i]);printf("|");if(v)for(long i=1;i<lg(v);i++)printf("%ld ",v[i]);printf("\\n");avma=av;}pari_close();}`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:cases.map(r=>[r.rows,r.columns,...r.values].join(' ')).join('\n')}),expected=trace.trim().split('\n').map(s=>{const [a,b]=s.split('|');return {state:a.split(' ').map(Number),selected:b.trim()?b.trim().split(' ').map(Number):[]};});assert.equal(cases.length,expected.length);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.unit_lattice_selection').pari_unit_lattice_selection
for r,e in zip(*json.load(sys.stdin)):
 n,c=r['rows'],r['columns'];z=n*c
 args=[r['values'],n,c,[77]*c,[77]*7,[77]*z,[77]*z,[77]*n,[77]*z,[77]*z,[77]*z,[77]*n,[77]*c,[77]*15]
 assert f(*args)==e['state'][0]
 assert args[4]==e['state'],(r,e,args[4])
 assert args[3][:e['state'][1]]==e['selected']
 if not e['state'][0]:assert args[3]==[77]*c
 for index,value in [(1,0),(2,-1),(0,[]),(3,[]),(4,[]),(5,[]),(6,[]),(7,[]),(8,[]),(9,[]),(10,[]),(11,[]),(12,[]),(13,[])]:
  bad=[x[:] if isinstance(x,list) else x for x in args];bad[index]=value;before=str(bad)
  try:f(*bad)
  except ValueError:pass
  else:raise AssertionError('invalid accepted')
  assert str(bad)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const branchTotals=Array.from({length:5},(_,i)=>expected.reduce((s,e)=>s+e.state[i+2],0));assert(branchTotals.every(n=>n>0));assert(expected.some(e=>e.selected.length>7));
 const summary={cases:cases.length,branchTotals,atomicGuardsPerBackend:14,traceSha256:hash(trace),sourceSha256:hash(src),ubsan:true,qualifiedTiming:false,artifactDirectory:dir};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'unit_lattice_selection.py')}),f=require(built.modulePath).pari_unit_lattice_selection;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp','tagged'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],n=r.rows,c=r.columns,z=n*c,view=x=>Array.isArray(x)?x:x.toArray();
  const make=k=>backend==='javascript'?Array(k).fill(77n):f.createIntegerBuffer(k,128,Array(k).fill(77n));
  const args=[r.values.map(BigInt),BigInt(n),BigInt(c),Array(c).fill(77n),Array(7).fill(77n),make(z),make(z),make(n),make(z),make(z),make(z),Array(n).fill(77n),Array(c).fill(77n),Array(15).fill(77n)];
  assert.equal(f[backend](...args),BigInt(e.state[0]));assert.deepEqual(args[4],e.state.map(BigInt),backend+' state '+ix);assert.deepEqual(args[3].slice(0,e.state[1]),e.selected.map(BigInt),backend+' selector '+ix);
  if(!e.state[0])assert.deepEqual(args[3],Array(c).fill(77n));
  if(ix===5)for(const [index,value]of [[1,0n],[2,-1n],[0,[]],[3,[]],[4,[]],[5,make(0)],[6,make(0)],[7,make(0)],[8,make(0)],[9,make(0)],[10,make(0)],[11,[]],[12,[]],[13,[]]]){
   const bad=args.slice();bad[index]=value;const snap=()=>bad.map(x=>typeof x==='bigint'?x:view(x).slice()),before=snap();assert.throws(()=>f[backend](...bad));assert.deepEqual(snap(),before);
  }
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey}));
})().catch(e=>{console.error(e);process.exitCode=1;});
