"use strict";
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createHash } = require('node:crypto');
const { compileKernel } = require('../../tools/native-kernel/compiler.cjs');
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, ...options });
  assert.equal(r.status, 0, r.stderr || String(r.error)); return r.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]), lib = path.join(pari, 'Olinux-x86_64');
  for (const [file, sha] of Object.entries({
    'src/basemath/base4.c': '46301497631028a5978266bb4a27c2bdf0a13aab8fb60335e3f359438b76d5e7',
    'src/basemath/polarit2.c': 'fe797d71a778939e24989d174be23e37b4fad2d0e37a24ad472c84bb96473c2a',
  })) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(pari, file))).digest('hex'), sha);
    assert.equal(createHash('sha256').update(run('tar', ['-xOf', process.argv[3], 'pari-2.17.4/' + file])).digest('hex'), sha);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sagejs-integral-ideal-')), c = path.join(dir, 'oracle.c'), exe = path.join(dir, 'oracle');
  // Only input preparation and calls to pinned upstream mathematics, not a C replacement.
  fs.writeFileSync(c, `#include "pari.h"
#include "paripriv.h"
static void mat(GEN M){long n=nbrows(M);putchar('[');for(long i=1;i<=n;i++)for(long j=1;j<lg(M);j++){if(i!=1||j!=1)putchar(',');pari_printf("\\"%Ps\\"",gcoeff(M,i,j));}putchar(']');}
int main(void){pari_init(128000000,10000);
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long scales[]={1,2,6};
for(long field=0;field<4;field++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[field]),DEFAULTPREC),P=gel(idealprimedec(nf,gen_2),1),Q=gel(idealprimedec(nf,stoi(3)),1);long n=nf_get_degree(nf);
for(long e=1;e<=4;e++)for(long t=0;t<3;t++)for(long kind=0;kind<4;kind++){
GEN I=ZM_Z_mul(idealpows(nf,P,e),stoi(scales[t])),content,primitive=Q_primitive_part(I,&content),alpha=kind?stoi(kind==1?0:kind==2?-3:1):zk_multable(nf,pr_get_gen(Q));
GEN H=idealmul(nf,I,kind?idealhnf_two(nf,mkvec2(stoi(3),alpha)):Q);
printf("{\\"n\\":%ld,\\"isScalar\\":%ld,\\"scalarAlpha\\":",n,kind!=0);pari_printf("\\"%Ps\\",\\"content\\":\\"%Ps\\",\\"ideal\\":",kind?alpha:gen_0,content?content:gen_1);mat(I);printf(",\\"primitive\\":");mat(primitive);printf(",\\"alpha\\":");if(kind)printf("[]");else mat(alpha);printf(",\\"output\\":");mat(H);puts("}");}
avma=av;}pari_close();return 0;}`);
  run('cc', ['-O2', '-I' + path.join(pari, 'src/headers'), '-I' + lib, c, '-L' + lib, '-Wl,-rpath,' + lib, '-lpari', '-lm', '-o', exe]);
  const trace = run(exe, []), rows = trace.trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 192);
  assert(rows.some(r => BigInt(r.content) > 1n));
  run('python3', ['-c', `import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.composite_ideal_hnf').pari_integral_ideal_mul_two
for ix,r in enumerate(json.load(sys.stdin)):
 n=r['n'];scalar=r['isScalar'];a=list(map(int,r['ideal']));alpha=list(map(int,r['alpha']));primitive=[0]*(n*n);out=[0]*(n*n)
 product=[] if scalar else [0]*(2*n*n);work=[] if scalar else [0]*(n*(3*n+1));tri=[] if scalar else [0]*(n*(n+1));mod=[] if scalar else [0]*n
 content=f(a,alpha,3,n,scalar,int(r['scalarAlpha']),primitive,product,work,tri,mod,out)
 assert content==int(r['content']) and primitive==list(map(int,r['primitive'])) and out==list(map(int,r['output'])),(ix,r,out)
 assert a==list(map(int,r['ideal'])) and alpha==list(map(int,r['alpha']))
for tag,message in [(2,'invalid ideal generator tag'),(1,'zero ideal is outside the integral HNF domain')]:
 primitive=[91]*9;out=[77]*9
 try:f([0]*9,[],3,3,tag,0,primitive,[],[],[],[],out)
 except ValueError as error:assert str(error)==message
 else:raise AssertionError('unsupported input was accepted')
 assert primitive==[91]*9 and out==[77]*9
`, path.resolve(__dirname, '../..'), path.resolve(__dirname, '../../src/lib')], { input: JSON.stringify(rows) });
  const built = await compileKernel({ sourcePath: path.join(__dirname, 'composite_ideal_hnf.py') });
  const f = require(built.modulePath).pari_integral_ideal_mul_two;
  assert.equal(f.nativeAvailable, true);
  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath, 'utf8'), /napi_call_function|PyObject_Call/);
  for (const [ix,r] of rows.entries()) for (const backend of ['javascript','gmp']) {
    const n = r.n, a = r.ideal.map(BigInt), alpha = r.alpha.map(BigInt), primitive = Array(n*n).fill(0n), out = Array(n*n).fill(0n);
    const product = r.isScalar ? [] : Array(2*n*n).fill(0n), work = r.isScalar ? [] : Array(n*(3*n+1)).fill(0n), tri = r.isScalar ? [] : Array(n*(n+1)).fill(0n), mod = r.isScalar ? [] : Array(n).fill(0n);
    assert.equal(f[backend](a,alpha,3n,BigInt(n),BigInt(r.isScalar),BigInt(r.scalarAlpha),primitive,product,work,tri,mod,out), BigInt(r.content));
    assert.deepEqual(out,r.output.map(BigInt), `${ix} ${backend}`);
    assert.deepEqual(primitive,r.primitive.map(BigInt));
    assert.deepEqual(a,r.ideal.map(BigInt)); assert.deepEqual(alpha,r.alpha.map(BigInt));
    if (!r.isScalar) {
      const expected = Array(2*n*n).fill(0n);
      for (let i=0;i<n;i++) for(let j=0;j<n;j++) {
        for(let k=0;k<n;k++) expected[i*2*n+j] += alpha[i*n+k]*primitive[k*n+j];
        expected[i*2*n+n+j] = 3n*primitive[i*n+j];
      }
      assert.deepEqual(product,expected);
    }
  }
  for (const backend of ['javascript','gmp']) for (const [tag,message] of [[2n,/invalid ideal generator tag/],[1n,/zero ideal is outside the integral HNF domain/]]) {
    const primitive=Array(9).fill(91n),out=Array(9).fill(77n);
    assert.throws(()=>f[backend](Array(9).fill(0n),[],3n,3n,tag,0n,primitive,[],[],[],[],out),message);
    assert.deepEqual(primitive,Array(9).fill(91n));assert.deepEqual(out,Array(9).fill(77n));
  }
  console.log(JSON.stringify({ cases: rows.length, matrixGenerator: rows.filter(r=>!r.isScalar).length, scalarGenerator: rows.filter(r=>r.isScalar).length, traceSha256: createHash('sha256').update(trace).digest('hex'), coreBytes: fs.statSync(built.coreSourcePath).size, qualifiedTiming:false }));
})().catch(e=>{console.error(e);process.exitCode=1;});
