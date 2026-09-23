"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const recursive=process.argv.includes('--recursive-visits');
 const oracle=await require(recursive?'./quotient_split_recursive_oracle.cjs':'./quotient_split_oracle.cjs').collect(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
 if(recursive)oracle.rows=oracle.rows.flatMap(r=>r.visits.map(v=>({...r,...v,radical:v.H,radicalColumns:v.rank})));
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.quotient_split');root=importlib.import_module('bench.pari-class-group-port.small_prime_polynomial_roots')
root_size=root.pari_small_prime_polynomial_roots_workspace_size();result=[]
for r in json.load(sys.stdin):
 n=int(r['n']);s=n*n;rank=int(r['radicalColumns'])
 projection=[77]*(11*s+2*n);w=[77]*(10*s+3*n);a=[77]*(n+2);col=[77]*n;matrix=[77]*(s+2);pw=[77]*(2*n*(n+2)+4*n+4);coeff=[77]*(n+4);pd=[77]*2;roots=[77]*(n+2);rw=[77]*root_size;children=[77]*(n*s+2);ranks=[77]*(n+2);state=[77]*8
 count=m.pari_small_quotient_split_step(list(map(int,r['table'])),list(map(int,r['radical'])),list(map(int,r['phi'])),n,rank,int(r['p']),projection,w,a,col,matrix,pw,coeff,pd,roots,rw,children,ranks,state)
 result.append({'count':count,'workspace':w,'element':a,'matrix':matrix,'coefficients':coeff,'roots':roots,'children':children,'ranks':ranks,'state':state})
print(json.dumps({'rootSize':root_size,'rows':result}))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(oracle.rows)}));
 function verify(r,got){
  const n=Number(r.n),s=n*n,q=Number(r.quotientDimension),component=Number(r.dimension),images=r.split?r.imageBases:[{rank:r.radicalColumns,matrix:r.radical}];
  assert.equal(got.count,images.length);
  const rootCount=r.split?r.roots.length:0,degree=r.split?r.coefficients.length-1:-1;
  assert.deepEqual(got.state,[0,q,component,rootCount,degree,Number(!r.split||rootCount===component),77,77]);
  const wanted=Array(n*s+2).fill(77),ranks=Array(n+2).fill(77);
  images.forEach((im,j)=>{ranks[j]=Number(im.rank);im.matrix.forEach((x,i)=>wanted[j*s+i]=Number(x));});
  assert.deepEqual(got.children,wanted);assert.deepEqual(got.ranks,ranks);
  for(const [name,key,capacity]of [['element','a',n+2],['matrix','mul2',s+2],['coefficients','coefficients',n+4],['roots','roots',n+2]]){
   const e=r.split?r[key].map(Number):[];assert.deepEqual(got[name],[...e,...Array(capacity-e.length).fill(77)],name);
  }
  if(r.split)assert.deepEqual(got.workspace.slice(2*s,3*s),r.mula.map(Number));
 }
 oracle.rows.forEach((r,i)=>verify(r,cp.rows[i]));
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'quotient_split.py')});
 const f=require(built.modulePath).pari_small_quotient_split_step;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<oracle.rows.length;i++){
  const r=oracle.rows[i],n=Number(r.n),s=n*n,buf=a=>f.createIntegerBuffer(a.length,3,a.map(BigInt)),fill=l=>buf(Array(l).fill(77));
  const table=buf(r.table),ideal=buf(r.radical),phi=buf(r.phi),projection=fill(11*s+2*n),w=fill(10*s+3*n),a=fill(n+2),matrix=fill(s+2),coeff=fill(n+4),roots=fill(n+2),children=fill(n*s+2),ranks=fill(n+2),state=fill(8);
  const args=[table,ideal,phi,BigInt(n),BigInt(r.radicalColumns),BigInt(r.p),projection,w,a,fill(n),matrix,fill(2*n*(n+2)+4*n+4),coeff,fill(2),roots,fill(cp.rootSize),children,ranks,state];
  const count=Number(f[backend](...args));
  const got={count,workspace:w.toArray().map(Number),element:a.toArray().map(Number),matrix:matrix.toArray().map(Number),coefficients:coeff.toArray().map(Number),roots:roots.toArray().map(Number),children:children.toArray().map(Number),ranks:ranks.toArray().map(Number),state:state.toArray().map(Number)};
  verify(r,got);assert.deepEqual(got,cp.rows[i]);
  assert.deepEqual(table.toArray().map(String),r.table.map(String));assert.deepEqual(ideal.toArray().map(String),r.radical.map(String));assert.deepEqual(phi.toArray().map(String),r.phi.map(String));
  for(const [index,length] of [[7,10*s+3*n-1],[14,3]]) {
   const before=args.map(x=>typeof x==='bigint'?x:x.toArray()),bad=args.slice();bad[index]=fill(length);
   assert.throws(()=>f[backend](...bad),/short quotient split storage/);
   assert.deepEqual(args.map(x=>typeof x==='bigint'?x:x.toArray()),before);
  }
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-quotient-split-'));
 const names=['quotient_split.py','quotient_projection.py','small_prime_matrix_basis.py','small_prime_polynomial_roots.py','quotient_minpoly.py'];
 const sourceHashes=Object.fromEntries(names.map(x=>[x,hash(fs.readFileSync(path.join(__dirname,x)))]));
 const result={cases:oracle.rows.length,splitCases:oracle.rows.filter(r=>r.split).length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHashes,coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,expected:cp,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
