"use strict";
// Pinned PARI Flx_degfact + literal get_fs grouping; no supplied factors enter
// the candidate. Synthetic reducible polynomials are local algorithm controls.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const hash = x => createHash('sha256').update(x).digest('hex');
function run(c, a, options = {}) {
  const r = spawnSync(c, a, {encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024, ...options});
  assert.equal(r.status, 0, r.stderr || String(r.error)); return r.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]), archive = path.resolve(process.argv[3]);
  assert.equal(hash(fs.readFileSync(archive)), '02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
  const upstreamHashes = {};
  for (const name of ['FpX_factor.c', 'Flx.c', 'bb_group.c']) {
    const pristine = run('tar', ['-xOf', archive, `pari-2.17.4/src/basemath/${name}`]);
    upstreamHashes[name] = hash(pristine);
    assert.equal(hash(fs.readFileSync(path.join(pari, 'src/basemath', name))), upstreamHashes[name]);
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sagejs-get-fs-small-'));
  const rows = [];
  const primes = [3, 5, 7, 17, 509, 521, 33554393, 33554467, 3037000493];
  let seed = 152346789n;
  for (const p of primes) for (const degree of [2, 3, 4]) for (let sample = 0; sample < 8; sample++) {
    const coefficients = [];
    for (let i = 0; i < degree; i++) {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
      coefficients.push(String((seed % (4n * BigInt(p))) - 2n * BigInt(p)));
    }
    rows.push({prime: p, coefficients: [...coefficients, '1']});
  }
  for (const [prime, coefficients] of [
    [3, [-3, 0, 0, 1]], [3, [1, 0, 0, 1]], [3, [-1, 2, 0, -2, 1]],
    [3, [1, 0, 2, 0, 1]], [5, [1, -4, 6, -4, 1]],
    [5, [1, 0, -2, 0, 1]], [5, [2, -4, 3, -2, 1]],
    [5, [4, 0, 4, 0, 1]], [3, [2, 1, 0, 0, 1]], [5, [1, 1, 0, 0, 1]],
    [3, [0, 0, 0, 1]], [5, [0, 0, 0, 0, 1]], [5, [-5, 0, 0, 0, 1]],
    [3037000493, [-1, -1, -1, -1, 1]], [3037000493, [1, -1, 1, -1, 1]],
  ]) rows.push({prime, coefficients: coefficients.map(String)});
  // Arbitrarily large coefficients must be reduced exactly before word work.
  rows.push({prime: 521, coefficients: [String(-(1n << 200n)), '0', String(1n << 180n), '1']});
  const control = `#include <pari.h>
#include <stdio.h>
static void vec(GEN v) { putchar('['); for(long i=1;i<lg(v);i++){if(i>1)putchar(',');printf("%ld",v[i]);}putchar(']'); }
int main(void) {
  if(sizeof(long)!=8)return 2; pari_init(8000000,1000);
  unsigned long p;char s[8192];int first=1;putchar('[');
  while(scanf("%lu %8191s",&p,s)==2){
    pari_sp av=avma;GEN P=gp_read_str(s);
    if(p==0){GEN nf=nfinit(P,DEFAULTPREC);if(!first)putchar(',');first=0;pari_printf("[\\\"%Ps\\\",\\\"%Ps\\\"]",nf_get_index(nf),absi(nf_get_disc(nf)));set_avma(av);continue;}
    if(!uisprime(p))return 3;
    GEN F=Flx_degfact(ZX_to_Flx(P,p),p),fs=gel(F,1),es=gel(F,2);
    if(!first)putchar(',');first=0;putchar('[');vec(fs);putchar(',');vec(es);putchar(',');
    long l=lg(fs),k=1,f=fs[1],n=1;GEN ds=cgetg(l,t_VECSMALL),ns=cgetg(l,t_VECSMALL);
    for(long j=2;j<l;j++)if(fs[j]==f)n++;else{ns[k]=n;ds[k]=f;k++;f=fs[j];n=1;}
    ns[k]=n;ds[k]=f;k++;setlg(ds,k);setlg(ns,k);vec(ds);putchar(',');vec(ns);putchar(']');set_avma(av);
  }puts("]");pari_close();return 0;
}
`;
  fs.writeFileSync(path.join(directory, 'oracle.c'), control);
  const lib = path.join(pari, 'Olinux-x86_64');
  run('cc', ['-O2', '-I' + path.join(pari, 'src/headers'), '-I' + lib, path.join(directory, 'oracle.c'), '-L' + lib, '-Wl,-rpath,' + lib, '-lpari', '-lm', '-o', path.join(directory, 'oracle')]);
  const polynomial = c => c.map((v, i) => `(${v})*x^${i}`).join('+');
  const catalogAt = process.argv.indexOf('--catalog');
  let catalog = null;
  if (catalogAt >= 0) {
    const bytes = fs.readFileSync(process.argv[catalogAt + 1]), data = JSON.parse(bytes);
    const polynomials = [[20034,-20018,0,1],[20018,-20010,0,1],[-20034,-20018,0,0,1],[-2000042,-2000022,0,0,1]].map(c=>c.map(String));
    const metadata = JSON.parse(run(path.join(directory,'oracle'),[],{input:polynomials.map(c=>'0 '+polynomial(c)).join('\n')+'\n'}));
    assert.equal(data.cases.length,4);catalog={hash:hash(bytes),metadata,fields:[]};
    for(let field=0;field<4;field++){
      const c=data.cases[field],[index,disc]=metadata[field];assert.equal(disc,c.discriminant);
      const report={field,supported:0,characteristicTwo:0,indexDivisors:0};
      for(let i=0;i<c.primes.length;i++){
        const p=Number(c.primes[i]);
        if(p===2){report.characteristicTwo++;continue;}
        if(BigInt(index)%BigInt(p)===0n){report.indexDivisors++;continue;}
        const start=Number(c.offsets[i]),length=Number(c.counts[i]);
        rows.push({prime:p,coefficients:polynomials[field],equationIndex:index,catalogExpected:[c.degrees.slice(start,start+length).map(Number),c.multiplicities.slice(start,start+length).map(Number)]});report.supported++;
      }
      catalog.fields.push(report);
    }
  }
  const input = rows.map(r => r.prime + ' ' + polynomial(r.coefficients)).join('\n') + '\n';
  const expected = JSON.parse(run(path.join(directory, 'oracle'), [], {input}));
  assert.equal(expected.length, rows.length);
  for(let i=0;i<rows.length;i++)if(rows[i].catalogExpected)assert.deepEqual(expected[i].slice(2),rows[i].catalogExpected);
  const payload = {rows, expected};
  if (process.argv.includes('--oracle-only')) {
    fs.writeFileSync(path.join(directory, 'oracle-fixtures.json'), JSON.stringify(payload));
    console.log(JSON.stringify({oracleCases: rows.length, directory, qualifiedTiming: false}));
    return;
  }
  const cp = JSON.parse(run('python3', ['-c', `import decimal,sys,json,importlib,copy,itertools
sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
m=importlib.import_module('bench.pari-class-group-port.get_fs_small');f=m.pari_get_fs_small
size=9+m.pari_flx_small_factor_workspace_size()
for row,wanted in zip(d['rows'],d['expected']):
 n=len(row['coefficients'])-1
 a=[list(map(int,row['coefficients']))+[77],n,int(row.get('equationIndex',1)),row['prime'],[77]*(size+2)]+[[77]*(n+2) for _ in range(4)]+[[77]*5]
 assert f(*a)==0
 k=a[9][1];nf=a[9][2]
 got=[a[5][:nf],a[6][:nf],a[7][:k],a[8][:k]]
 assert got==wanted,(row,got,wanted)
 assert a[9]==[0,k,nf,77,77] and a[4][size:]==[77,77]
 assert sum(x*y for x,y in zip(got[0],got[1]))==n
 for i,used in [(5,nf),(6,nf),(7,k),(8,k)]:assert a[i][used:]==[77]*(n+2-used)
sort=importlib.import_module('bench.pari-class-group-port.flx_small_factor').pari_flx_small_sort_factor
sort_controls=0
for n in range(1,5):
 for row in itertools.product(range(1,5),repeat=n):
  factors=list(row);exponents=list(range(n));w=[77]*12;sort(w,0,n,factors,exponents)
  assert list(zip(factors,exponents))==sorted(zip(row,range(n)))
  sort_controls+=1
print(json.dumps({'cases':len(d['rows']),'workspace':size,'stable_sort_controls':sort_controls}))
`, path.resolve(__dirname, '../..'), path.resolve(__dirname, '../../src/lib')], {input: JSON.stringify(payload)}));
  const args = r => {
    const n = r.coefficients.length - 1;
    return [[...r.coefficients, '77'], n, r.equationIndex || 1, r.prime, Array(cp.workspace + 2).fill('77'), ...Array.from({length: 4}, () => Array(n + 2).fill('77')), Array(5).fill('77')];
  };
  const unsupported = [];
  for (const [change, status] of [
    [a => a[3] = 2, -2], [a => a[2] = a[3], -3], [a => a[1] = 5, -4],
    [a => a[3] = 3037000507, -5], [a => a[4] = [], -6], [a => a[5] = [], -6],
    [a => a[6] = [], -6], [a => a[7] = [], -6], [a => a[8] = [], -6], [a => a[0] = [], -6],
  ]) { const a = args(rows[0]); change(a); unsupported.push({args: a, status}); }
  const invalid = [];
  for (const change of [a => a[9] = [], a => a[3] = 1, a => a[2] = 0, a => a[0][a[1]] = '2']) {
    const a = args(rows[0]); change(a); invalid.push(a);
  }
  run('python3', ['-c', `import decimal,sys,json,importlib,copy
sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
f=importlib.import_module('bench.pari-class-group-port.get_fs_small').pari_get_fs_small
def convert(a):return [[int(x) for x in v] if isinstance(v,list) else int(v) for v in a]
for case in d['unsupported']:
 a=convert(case['args']);before=copy.deepcopy(a);assert f(*a)==case['status'];assert a[:-1]==before[:-1];assert a[-1]==[case['status'],0,0,77,77]
for raw in d['invalid']:
 a=convert(raw);before=copy.deepcopy(a)
 try:f(*a)
 except ValueError:pass
 else:raise AssertionError('invalid accepted')
 assert a==before
`, path.resolve(__dirname, '../..'), path.resolve(__dirname, '../../src/lib')], {input: JSON.stringify({unsupported, invalid})});
  const backends = [], artifacts = {};
  if (process.argv.includes('--native')) {
    const {compileKernel} = require('../../tools/native-kernel/compiler.cjs');
    const built = await compileKernel({sourcePath: path.join(__dirname, 'get_fs_small.py')});
    const f = require(built.modulePath).pari_get_fs_small; assert(f.nativeAvailable);
    const convert = a => a.map(v => Array.isArray(v) ? v.map(BigInt) : BigInt(v));
    for (const backend of ['javascript', 'gmp', 'tagged']) {
      for (let i = 0; i < rows.length; i++) {
        const a = convert(args(rows[i])), n = Number(a[1]); assert.equal(f[backend](...a), 0n);
        const k = Number(a[9][1]), nf = Number(a[9][2]);
        assert.deepEqual([a[5].slice(0,nf),a[6].slice(0,nf),a[7].slice(0,k),a[8].slice(0,k)].map(v=>v.map(Number)),expected[i]);
        assert.deepEqual(a[9],[0n,BigInt(k),BigInt(nf),77n,77n]);
        assert.deepEqual(a[4].slice(cp.workspace),[77n,77n]);
        for (const [j,used] of [[5,nf],[6,nf],[7,k],[8,k]]) assert.deepEqual(a[j].slice(used),Array(n+2-used).fill(77n));
      }
      for (const c of unsupported) { const a=convert(c.args),before=structuredClone(a);assert.equal(f[backend](...a),BigInt(c.status));assert.deepEqual(a.slice(0,-1),before.slice(0,-1));assert.deepEqual(a[9],[BigInt(c.status),0n,0n,77n,77n]); }
      for (const raw of invalid) { const a=convert(raw),before=structuredClone(a);assert.throws(()=>f[backend](...a),/get_fs/);assert.deepEqual(a,before); }
      backends.push(backend);
    }
    Object.assign(artifacts,{corePath:built.coreSourcePath,coreHash:hash(fs.readFileSync(built.coreSourcePath)),addonPath:built.addonPath,addonHash:hash(fs.readFileSync(built.addonPath))});
  }
  const libraryPath=fs.realpathSync(path.join(lib,'libpari.so'));
  const sourceHashes=Object.fromEntries(['get_fs_small.py','flx_small.py','flx_small_power.py','flx_small_factor.py'].map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const result={...cp,catalog,unsupported:unsupported.length,invalid:invalid.length,backends,artifacts,sourceHashes,upstreamHashes,libraryPath,libraryHash:hash(fs.readFileSync(libraryPath)),controlHash:hash(control),directory,qualifiedTiming:false};
  fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({...payload,result}));
  console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
