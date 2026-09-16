"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {compileKernel} = require('../../tools/native-kernel/compiler.cjs');
function run(command, args, options = {}) {
  const r = spawnSync(command, args, {encoding:'utf8', timeout:60000, maxBuffer:32*1024*1024, ...options});
  assert.equal(r.status, 0, r.stderr || String(r.error));
  return r.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]), archive = path.resolve(process.argv[3]);
  const lib = path.join(pari, 'Olinux-x86_64');
  const sha = x => createHash('sha256').update(x).digest('hex');
  assert.equal(sha(fs.readFileSync(archive)), '02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
  const sources = {};
  for (const name of ['base2.c','base3.c','bb_group.c']) {
    const relative = 'src/basemath/' + name;
    sources[name] = run('tar', ['-xOf', archive, 'pari-2.17.4/' + relative]);
    assert.equal(fs.readFileSync(path.join(pari, relative), 'utf8'), sources[name]);
  }
  const source = sources['base2.c'];
  const begin = source.indexOf('typedef struct {\n  GEN nf, p;\n  long I;\n} eltmod_muldata;');
  const end = source.indexOf('/* nf a true nf; return a Z basis', begin);
  assert(begin >= 0 && end > begin);
  const original = source.slice(begin, end);
  assert.equal(original.split('gen_pow_fold(y, p, (void*)&D, &sqr_mod, &ei_msqr_mod)').length, 2);
  // Only callback references change; wrappers call the unmodified extracted callbacks.
  const instrumented = original.replace('&sqr_mod, &ei_msqr_mod', '&traced_sqr, &traced_msqr');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sagejs-integral-frobenius-'));
  const c = path.join(dir, 'oracle.c'), exe = path.join(dir, 'oracle');
  fs.writeFileSync(c, `#include "pari.h"
#include "paripriv.h"
static long squares,multiples,steps;static unsigned char sequence[1024];
static GEN traced_sqr(void*,GEN);static GEN traced_msqr(void*,GEN);
${instrumented}
static GEN traced_sqr(void *d,GEN x){squares++;if(steps>=1024)abort();sequence[steps++]=1;return sqr_mod(d,x);}
static GEN traced_msqr(void *d,GEN x){multiples++;if(steps>=1024)abort();sequence[steps++]=2;return ei_msqr_mod(d,x);}
static void vec(GEN x){putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');pari_printf("\\\"%Ps\\\"",gel(x,i));}putchar(']');}
int main(void){pari_init(128000000,10000);
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
const char *ps[]={"2","3","5","37","101","65537","3037000493","18446744073709551629","170141183460469231731687303715884105727"};
for(long f=0;f<4;f++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[f]),DEFAULTPREC);long n=nf_get_degree(nf);GEN table=cgetg(n*n*n+1,t_VEC);long pos=1;
if((f==1&&!equaliu(nf_get_index(nf),3))||(f==3&&!equaliu(nf_get_index(nf),37)))return 5;
for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=n;k++)gel(table,pos++)=gel(v,k);}
for(long pi=0;pi<9;pi++)for(long i=1;i<=n;i++){pari_sp av2=avma;GEN p=gp_read_str(ps[pi]);squares=multiples=steps=0;GEN y=pow_ei_mod_p(nf,i,p);GEN trace=gen_0;for(long s=0;s<steps;s++)trace=addis(mulsi(4,trace),sequence[s]);
if(pi<5&&!gequal(y,FpC_red(algtobasis(nf,nfpow(nf,col_ei(n,i),p)),p)))return 6;
printf("{\\\"field\\\":%ld,\\\"n\\\":%ld,\\\"i\\\":%ld,\\\"p\\\":\\\"%s\\\",\\\"counts\\\":[\\\"%ld\\\",\\\"%ld\\\",",f,n,i,ps[pi],squares,multiples);pari_printf("\\\"%Ps\\\"],\\\"table\\\":",trace);vec(table);printf(",\\\"out\\\":");vec(y);puts("}");avma=av2;}
avma=av;}pari_close();return 0;}`);
  // Large exponents are verified by the extracted modular path, not expanded nfpow.
  const cSource = fs.readFileSync(c, 'utf8');
  run('cc', ['-O2', '-I'+path.join(pari,'src/headers'), '-I'+lib, c, '-L'+lib, '-Wl,-rpath,'+lib, '-lpari', '-lm', '-o', exe]);
  const trace = run(exe, []), rows = trace.trim().split('\n').map(JSON.parse);
  run('python3', ['-c', `import sys,json,importlib,decimal
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.integral_frobenius')
for r in json.load(sys.stdin):
 n=r['n'];table=list(map(int,r['table']));temporary=[77]*(n+2);out=[77]*(n+2);counts=[91]*5
 assert m.pari_integral_basis_frobenius(table,n,r['i'],int(r['p']),temporary,out,counts)==0
 assert out==list(map(int,r['out']))+[77,77],r
 assert counts==list(map(int,r['counts']))+[91,91],r
 assert temporary[n:]==[77,77] and table==list(map(int,r['table']))
`, path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')], {input:JSON.stringify(rows)});
  const backends = ['cpython'];
  let coreSha256 = null;
  if (process.argv.includes('--native')) {
    const built = await compileKernel({sourcePath:path.join(__dirname,'integral_frobenius.py')});
    const f = require(built.modulePath).pari_integral_basis_frobenius;
    assert(f.nativeAvailable);
    coreSha256 = sha(fs.readFileSync(built.coreSourcePath));
    for (const backend of ['javascript','gmp','tagged']) {
      for (const r of rows) {
        const n = r.n, table = r.table.map(BigInt), temporary = Array(n+2).fill(77n), out = Array(n+2).fill(77n), counts = Array(5).fill(91n);
        assert.equal(f[backend](table,BigInt(n),BigInt(r.i),BigInt(r.p),temporary,out,counts),0n);
        assert.deepEqual(out,[...r.out.map(BigInt),77n,77n]);
        assert.deepEqual(counts,[...r.counts.map(BigInt),91n,91n]);
        assert.deepEqual(temporary.slice(n),[77n,77n]);
        assert.deepEqual(table,r.table.map(BigInt));
      }
      const row = rows[0], n = row.n;
      for (const change of [a=>a[1]=2n,a=>a[2]=0n,a=>a[2]=5n,a=>a[3]=1n,a=>a[0]=[],a=>a[4]=[],a=>a[5]=[],a=>a[6]=[]]) {
        const args = [row.table.map(BigInt),BigInt(n),1n,3n,Array(n).fill(77n),Array(n).fill(77n),Array(3).fill(91n)];
        change(args);const before = args.map(x=>Array.isArray(x)?x.slice():x);
        assert.throws(()=>f[backend](...args),/unsupported integral Frobenius|insufficient integral Frobenius/);
        assert.deepEqual(args,before);
      }
      backends.push(backend);
    }
  }
  const result = {cases:rows.length,backends,coreSha256,sourceSha256:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,sha(v)])),extractedSha256:sha(original),oracleSha256:sha(cSource),traceSha256:sha(trace),qualifiedTiming:false};
  fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,result}));
  console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
