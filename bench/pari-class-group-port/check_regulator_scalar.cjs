"use strict";
// Differential experiment against unmodified PARI 2.17.4 generic operations.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createHash } = require('node:crypto');
const { compileKernel } = require('../../tools/native-kernel/compiler.cjs');
function run(c, a, o = {}) { const r = spawnSync(c, a, { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024, ...o }); assert.equal(r.status, 0, r.stderr || String(r.error)); return r.stdout; }
(async () => {
  const pari = path.resolve(process.argv[2]), archive = path.resolve(process.argv[3]), lib = path.join(pari, 'Olinux-x86_64');
  assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), '02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
  const values = [];
  for (const n of [0n, 1n, -1n, 2n, -7n, (1n << 64n) - 1n, 1n << 64n, -(1n << 131n) + 3n]) values.push([n, -1n, 0n]);
  for (const [n, d] of [[1, 2], [-1, 2], [1, 3], [2, 3], [-5, 6], [7, 12], [-11, 18], [3, 10], [-7, 15], [13, 35]]) values.push([BigInt(n), -2n, BigInt(d)]);
  for (const p of [64n, 128n, 320n, 1856n]) for (const e of [-37n, 0n, 19n]) for (const s of [-1n, 1n]) values.push([s * ((1n << (p - 1n)) + 173n), p, e]);
  for (const e of [-400n, -17n, 0n, 20n]) values.push([0n, 0n, e]);
  const cases = [];
  for (let op = 0; op < 3; op++) for (let i = 0; i < values.length; i++) for (let j = 0; j < values.length; j++) {
    const a = values[i], b = values[j];
    if (op === 2 && b[0] === 0n) continue;
    // addir can require >2048 bits when a tiny real is added to a huge integer.
    // The selected exponents fit the existing conversion window.
    cases.push([op, ...a, ...b]);
  }
  // Authentic getfu uses bounded exact coefficients with these wide reals.
  // Exercise both input widths and the p+64 exact-one reciprocal explicitly,
  // without promising arbitrary exact-integer exponent gaps above the guard.
  for (const p of [2176n, 2240n, 2304n]) {
    const a = [(1n << (p - 1n)) + 173n, p, -2n];
    const b = [-((1n << (p - 1n)) + 911n), p, -3n];
    for (let op = 0; op < 3; op++) cases.push([op, ...a, ...b]);
    cases.push([2, 1n, -1n, 0n, ...a]);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sagejs-regulator-scalar-')), file = path.join(dir, 'oracle.c'), exe = path.join(dir, 'oracle');
  fs.writeFileSync(file, `#include "pari.h"
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN scalar(void){GEN m=rd();long p=itos(rd()),e=itos(rd());if(p==-1)return m;if(p==-2)return gdiv(m,stoi(e));if(!signe(m))return real_0_bit(e);GEN x=itor(m,p);setexpo(x,e);return x;}
static void ps(GEN x){long e;if(typ(x)==t_INT){pari_printf("[\\"%Ps\\",\\"-1\\",\\"0\\"]\\n",x);return;}if(typ(x)==t_FRAC){pari_printf("[\\"%Ps\\",\\"-2\\",\\"%Ps\\"]\\n",gel(x,1),gel(x,2));return;}pari_printf("[\\"%Ps\\",\\"%ld\\",\\"%ld\\"]\\n",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,1000);long count=itos(rd());for(long i=0;i<count;i++){pari_sp av=avma;long op=itos(rd());GEN a=scalar(),b=scalar();ps(op==0?gadd(a,b):op==1?gmul(a,b):gdiv(a,b));avma=av;}pari_close();return 0;}
`);
  run('cc', ['-O1', '-fsanitize=undefined', '-fno-sanitize-recover=undefined', '-I' + path.join(pari, 'src/headers'), '-I' + lib, file, '-L' + lib, '-Wl,-rpath,' + lib, '-lpari', '-lm', '-o', exe]);
  const trace = run(exe, [], { input: [cases.length, ...cases.flat()].join(' ') }), expected = trace.trim().split('\n').map(JSON.parse);
  const data = JSON.stringify([cases.map(r => r.map(String)), expected]);
  run('python3', ['-c', `import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.regulator_scalar')
fs=[m.pari_regulator_scalar_add,m.pari_regulator_scalar_multiply,m.pari_regulator_scalar_divide]
for i,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 r=list(map(int,r));e=tuple(map(int,e))
 try: got=fs[r[0]](*r[1:])
 except Exception as error: raise AssertionError((i,r,e)) from error
 assert got==e,(i,r,got,e)
`, path.resolve(__dirname, '../..'), path.resolve(__dirname, '../../src/lib')], { input: data });
  const summary = { cases: cases.length, traceSha256: createHash('sha256').update(trace).digest('hex'), ubsan: true, qualifiedTiming: false };
  if (process.argv.includes('--source-only')) { console.log(JSON.stringify(summary)); return; }
  const built = await compileKernel({ sourcePath: path.join(__dirname, 'regulator_scalar.py') }), mod = require(built.modulePath);
  for (const backend of ['javascript', 'gmp']) for (let i = 0; i < cases.length; i++) {
    const [op, ...args] = cases[i], f = mod[['pari_regulator_scalar_add', 'pari_regulator_scalar_multiply', 'pari_regulator_scalar_divide'][op]];
    assert(f.nativeAvailable); assert.deepEqual(f[backend](...args), expected[i].map(BigInt), backend + ' ' + i);
  }
  for (const backend of ['javascript', 'gmp'])
    assert.throws(() => mod.pari_regulator_scalar_divide[backend](1n, -1n, 0n, 1n << 2367n, 2368n, 0n), /reciprocal outside basecase window/);
  console.log(JSON.stringify({ ...summary, coreBytes: fs.statSync(built.coreSourcePath).size }));
})().catch(e => { console.error(e); process.exitCode = 1; });
