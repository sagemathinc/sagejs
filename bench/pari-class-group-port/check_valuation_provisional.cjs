"use strict";
// Synthetic source controls, NOT prime ideals: tau=I with provisional e=0.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const hash = x => createHash('sha256').update(x).digest('hex');
function run(command, args, input) {
  const r = spawnSync(command, args, {input, encoding:'utf8', timeout:120000, maxBuffer:16*1024*1024});
  assert.equal(r.status, 0, r.stderr || String(r.error)); return r.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]), archive = path.resolve(process.argv[3]);
  assert.equal(hash(fs.readFileSync(archive)), '02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
  const source = run('tar', ['-xOf',archive,'pari-2.17.4/src/basemath/base3.c']);
  const start = source.indexOf('long\nZC_nfvalrem('), end = source.indexOf('\nlong\nZC_nfval(', start);
  assert(start >= 0 && end > start);
  const literal = source.slice(start,end);
  // Only rename the extracted function and expose the failing row's quotient.
  const observed = literal.replace('ZC_nfvalrem(', 'observed_nfvalrem(')
    .replace('if (r != gen_0) { if (newx)', 'if (r != gen_0) { failed_quotient = gel(y,i); if (newx)');
  assert.notEqual(observed, literal);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-valuation-provisional-'));
  const c = '#include "pari.h"\n#include "paripriv.h"\nstatic GEN failed_quotient;\n' + observed + String.raw`
int main(void) {
 pari_init(8000000,10000); putchar('['); int first=1;
 for(long p=2;p<=3;p++) for(long e=0;e<=1;e++) for(long k=0;k<=17;k+=17) {
  pari_sp av=avma; GEN x=mkcol3(mulsi(-4,powuu(p,k)),powuu(p,k),gen_0);
  /* Match mk_pr literally: pr_get_e reads limb[2], even for provisional e=0. */
  GEN pr=mkvec5(utoipos(p),gen_0,utoipos(e),utoipos(0),matid(3));
  long v=observed_nfvalrem(x,pr,NULL);
  if(!first)putchar(','); first=0;
  pari_printf("{\"p\":%ld,\"e\":%ld,\"k\":%ld,\"value\":%ld,\"failedQuotient\":\"%Ps\"}",p,e,k,v,failed_quotient);
  set_avma(av);
 } puts("]"); pari_close(); return 0;
}
`;
  fs.writeFileSync(path.join(directory,'oracle.c'),c);
  const lib=path.join(pari,'Olinux-x86_64'), binary=path.join(directory,'oracle');
  run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',binary]);
  const oracle=JSON.parse(run(binary,[]));
  const packets=oracle.map(r=>{
    const q=BigInt(r.p)**BigInt(r.k), fill=n=>Array(n).fill('77');
    return [[String(-4n*q),String(q),'0','77'],['1','0','0','0','1','0','0','0','1','77'],fill(4),fill(4),fill(4),fill(32),'3',String(r.p),String(r.e),'0'];
  });
  const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.valuation').pari_prepared_ideal_valuation
out=[]
for packet in json.load(sys.stdin):
 a=[list(map(int,x)) if isinstance(x,list) else int(x) for x in packet]
 v=f(*a)
 out.append(dict(value=v,args=[[str(y) for y in x] if isinstance(x,list) else str(x) for x in a]))
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],JSON.stringify(packets)));
  for(let i=0;i<oracle.length;i++) {
    const r=oracle[i], got=cp[i]; assert.equal(got.value,r.value);
    assert.equal(r.value,r.k===17 ? 16+r.e : 0);
    for(const j of [0,1])assert.deepEqual(got.args[j],packets[i][j]);
    for(const j of [2,3,4])assert.equal(got.args[j][3],'77');
    if(r.p===3 && r.k===0) {
      assert.equal(r.failedQuotient,'-1');
      assert.deepEqual(got.args[3],['-1','77','77','77']);
    }
  }
  const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'valuation.py')});
  const f=require(built.modulePath).pari_prepared_ideal_valuation;
  for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<packets.length;i++) {
    const args=packets[i].map(x=>Array.isArray(x)?f.createIntegerBuffer(x.length,40,x.map(BigInt)):BigInt(x));
    const value=Number(f[backend](...args));
    assert.deepEqual({value,args:args.map(x=>typeof x==='bigint'?String(x):x.toArray().map(String))},cp[i]);
  }
  const result={cases:oracle.length,backends:['cpython','javascript','gmp','tagged'],synthetic:true,qualifiedTiming:false,directory,sourceHash:hash(literal),observedSourceHash:hash(observed),controlHash:hash(c),coreHash:hash(fs.readFileSync(built.coreSourcePath))};
  fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({oracle,packets,expected:cp,result}));
  console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
