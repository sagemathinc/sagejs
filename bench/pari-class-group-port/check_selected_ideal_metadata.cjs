"use strict";
// Representation gather controls; actual PARI descriptors are also exercised
// by check_actual_initial_collector's independently extracted source oracle.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-selected-metadata-'));
 const cases=[];
 for(const n of [2,3,4])for(const selection of [[],[2,0],[1,1,0]]){
  const tau=Array.from({length:3*n*n},(_,i)=>String((i%2?-1n:1n)*(2n**90n+BigInt(i))));
  cases.push({n,p:['2','3','5'],e:['1','2','1'],f:['1','1','2'],inert:['0','0','0'],tau,selection});
 }
 function args(c){return structuredClone([c.p,c.e,c.f,c.inert,c.tau,3,c.selection,c.selection.length,c.n,...Array.from({length:4},()=>Array(c.selection.length+2).fill('77')),Array(c.selection.length*c.n*c.n+2).fill('77')]);}
 function wanted(c){const pick=a=>[...c.selection.map(i=>a[i]),'77','77'];return [pick(c.p),pick(c.e),pick(c.f),pick(c.inert),[...c.selection.flatMap(i=>c.tau.slice(i*c.n*c.n,(i+1)*c.n*c.n)),'77','77']];}
 cases.push({n:3,p:['2','3','5'],e:['1','1','1'],f:['1','3','1'],inert:['0','1','0'],tau:Array(27).fill('0'),selection:[1]});
 const valid=cases.map(c=>({args:args(c),expected:wanted(c)})),bad=[];
 for(const c of valid)c.args[6].push(999); // Only the active KC prefix is read.
 for(const mutate of [a=>a[5]=-1,a=>a[7]=-1,a=>a[8]=1,a=>a[6][1]=3,a=>a[6][1]=-1,a=>a[1][0]='0',a=>a[2][0]='9',a=>a[3][0]='2',a=>a[0][0]='1',a=>a[0][0]='18446744073709551616',...Array.from({length:5},(_,i)=>a=>a[i]=[]),...Array.from({length:5},(_,i)=>a=>a[i+9]=[])]){
  const a=args(cases[1]);mutate(a);bad.push(a);
 }
 const payload={valid,bad};
 const cp=run('python3',['-c',`import decimal,sys,json,importlib
sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
f=importlib.import_module('bench.pari-class-group-port.selected_ideal_metadata').pari_selected_ideal_metadata
def convert(a):return [[int(x) for x in v] if isinstance(v,list) else v for v in a]
for c in d['valid']:
 a=convert(c['args']);assert f(*a)==a[7];assert [[str(x) for x in v] for v in a[9:]]==c['expected']
for raw in d['bad']:
 a=convert(raw);before=[v.copy() for v in a[9:]]
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError('invalid descriptor accepted')
 assert a[9:]==before
print('PASS')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(payload)});
 assert.equal(cp.trim(),'PASS');
 const backends=[];
 if(process.argv.includes('--native')){
  const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
  const built=await compileKernel({sourcePath:path.join(__dirname,'selected_ideal_metadata.py')});
  const f=require(built.modulePath).pari_selected_ideal_metadata;
  const convert=a=>a.map(v=>Array.isArray(v)?v.map(BigInt):BigInt(v));
  for(const backend of ['javascript','gmp','tagged']){
   for(const c of valid){const a=convert(c.args);assert.equal(f[backend](...a),a[7]);assert.deepEqual(a.slice(9).map(v=>v.map(String)),c.expected);}
   for(const raw of bad){const a=convert(raw),before=a.slice(9).map(v=>v.slice());assert.throws(()=>f[backend](...a),/selected metadata/);assert.deepEqual(a.slice(9),before);}
   backends.push(backend);
  }
 }
 const result={valid:valid.length,invalid:bad.length,backends,directory,qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
