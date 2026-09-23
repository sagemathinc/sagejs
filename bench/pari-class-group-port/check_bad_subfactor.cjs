"use strict";
// Differential oracle extracts the pinned PARI predicate, not a reimplementation.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const hash = value => createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60000,
    maxBuffer: 8 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]), archive = path.resolve(process.argv[3]);
  assert.equal(hash(fs.readFileSync(archive)), "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
  const upstream = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(hash(upstream), "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac");
  const predicate = upstream.match(/static int\nbad_subFB\(FB_t \*F, long t\)\n\{[^]*?\n\}/)?.[0];
  assert(predicate);
  const cases = [];
  for (let offset = 0; offset <= 16; offset++) for (let size = 1; size <= 8; size++)
    for (let complete = 0; complete <= 1; complete++) for (let i = 1; i <= size; i++)
      cases.push([offset + i, offset, size, complete]);
  const groups = [[], [1], [2], [1, 2, 3], [8, 1, 4, 2]];
  const bulk = groups.flatMap(sizes => [0, 1, 2].map(mode => {
    let end = 0;
    return { offsets: sizes.map(n => { const old = end; end += n; return old; }),
      sizes, complete: sizes.map((_, i) => mode === 2 ? i % 2 : mode), active: end };
  }));
  const collectorAt = process.argv.indexOf("--collector-fixtures");
  let actualPolicyCases = 0;
  if (collectorAt >= 0) {
    const fixture = JSON.parse(fs.readFileSync(process.argv[collectorAt + 1], "utf8"));
    for (const row of fixture.expected) {
      assert(Array.isArray(row.groups) && Array.isArray(row.bad));
      bulk.push({ offsets: row.groups.map(g => g.offset), sizes: row.groups.map(g => g.ideals.length),
        complete: row.groups.map(g => g.complete), active: row.KC, referenceBad: row.bad });
      actualPolicyCases++;
    }
  }
  // Include every bulk predicate in the same extracted-source oracle stream.
  const scalarCount = cases.length;
  for (const g of bulk) for (let j = 0; j < g.sizes.length; j++)
    for (let i = 1; i <= g.sizes[j]; i++)
      cases.push([g.offsets[j] + i, g.offsets[j], g.sizes[j], g.complete[j]]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-bad-subfactor-"));
  const c = `#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
typedef struct { GEN LP, LV, iLP; } FB_t;
#define pr_get_smallp(pr) gel(pr,1)[2]
${predicate}
static const long cases[][4]={${cases.map(row => `{${row.join(",")}}`).join(",")}};
int main(void){pari_init(8000000,1000);putchar('[');
for(unsigned k=0;k<sizeof(cases)/sizeof(cases[0]);k++){
 pari_sp av=avma;long t=cases[k][0],off=cases[k][1],n=cases[k][2];
 FB_t F;F.LP=cgetg(off+n+1,t_VEC);F.LV=cgetg(3,t_VEC);F.iLP=cgetg(3,t_VECSMALL);
 gel(F.LP,t)=mkvec(utoipos(2));GEN group=cgetg(n+1,t_VEC);
 gel(F.LV,2)=group;F.iLP[2]=off;if(cases[k][3])setisclone(group);
 if(k)putchar(',');printf("%d",bad_subFB(&F,t));set_avma(av);
}puts("]");pari_close();return 0;}
`;
  const source = path.join(directory, "oracle.c"), executable = path.join(directory, "oracle");
  fs.writeFileSync(source, c);
  const lib = path.join(pari, "Olinux-x86_64");
  run("cc", ["-O1", "-fsanitize=undefined", "-fno-sanitize-recover=undefined",
    "-I" + path.join(pari, "src/headers"), "-I" + lib, source,
    "-L" + lib, "-Wl,-rpath," + lib, "-lpari", "-lm", "-o", executable]);
  const expected = JSON.parse(run(executable, []));
  let position = scalarCount;
  for (const g of bulk) {
    g.expected = expected.slice(position, position + g.active); position += g.active;
    if (g.referenceBad) assert.deepEqual(g.expected, g.referenceBad, "actual FBgen bad_subFB mismatch");
  }
  const invalid = [
    { offsets: [1], sizes: [1], complete: [1], active: 1 },
    { offsets: [0], sizes: [0], complete: [1], active: 0 },
    { offsets: [0], sizes: [1], complete: [2], active: 1 },
    { offsets: [0], sizes: [2], complete: [1], active: 1 },
    { offsets: [0], sizes: [1], complete: [1], active: 2 },
    { offsets: [0, 3], sizes: [2, 1], complete: [0, 1], active: 3 },
    { offsets: [], sizes: [], complete: [], active: -1 },
    { offsets: [], sizes: [], complete: [], active: 0, groupCount: -1 },
    { offsets: [], sizes: [1], complete: [1], active: 1 },
    { offsets: [0], sizes: [], complete: [1], active: 1, groupCount: 1 },
    { offsets: [0], sizes: [1], complete: [], active: 1 },
    { offsets: [0], sizes: [1], complete: [1], active: 1, outputLength: 0 },
  ];
  const invalidScalar = [[0, 0, 1, 1], [2, 0, 1, 1], [1, -1, 2, 0], [1, 0, 0, 1]];
  const payload = { cases, expected, bulk, invalid, invalidScalar };
  const cp = JSON.parse(run("python3", ["-c", `import decimal,sys,json,importlib
sys.path.insert(0,sys.argv[1]);sys.path.insert(0,sys.argv[2])
m=importlib.import_module('bench.pari-class-group-port.bad_subfactor');d=json.load(sys.stdin)
for c,w in zip(d['cases'],d['expected']):assert m.pari_bad_subfactor_ideal(*c[:3],bool(c[3]))==bool(w)
for g in d['bulk']:
 out=[77]*(g['active']+2)
 assert m.pari_bad_subfactor_flags(g['offsets'],g['sizes'],g['complete'],len(g['sizes']),g['active'],out)==g['active']
 assert out==g['expected']+[77,77]
for g in d['invalid']:
 out=[77]*g.get('outputLength',10)
 try:m.pari_bad_subfactor_flags(g['offsets'],g['sizes'],g['complete'],g.get('groupCount',len(g['sizes'])),g['active'],out)
 except ValueError:pass
 else:raise AssertionError('accepted invalid group')
 assert out==[77]*g.get('outputLength',10)
for t,off,n,complete in d['invalidScalar']:
 try:m.pari_bad_subfactor_ideal(t,off,n,bool(complete))
 except ValueError:pass
 else:raise AssertionError('accepted invalid scalar')
print(json.dumps({'scalar':len(d['cases']),'bulk':len(d['bulk']),'invalid':len(d['invalid'])+len(d['invalidScalar'])}))`,
  path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")],
  { input: JSON.stringify(payload) }));
  const backends = [];
  if (process.argv.includes("--native")) {
    const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
    const built = await compileKernel({ sourcePath: path.join(__dirname, "bad_subfactor.py") });
    const mod = require(built.modulePath);
    for (const backend of ["javascript", "gmp", "tagged"]) {
      for (let i = 0; i < cases.length; i++) {
        const [t, off, size, complete] = cases[i];
        assert.equal(mod.pari_bad_subfactor_ideal[backend](BigInt(t), BigInt(off), BigInt(size), Boolean(complete)), Boolean(expected[i]));
      }
      for (const g of bulk) {
        const out = Array(g.active + 2).fill(77n);
        assert.equal(mod.pari_bad_subfactor_flags[backend](g.offsets.map(BigInt), g.sizes.map(BigInt),
          g.complete.map(BigInt), BigInt(g.sizes.length), BigInt(g.active), out), BigInt(g.active));
        assert.deepEqual(out, [...g.expected.map(BigInt), 77n, 77n]);
      }
      for (const g of invalid) {
        const out = Array(g.outputLength ?? 10).fill(77n);
        assert.throws(() => mod.pari_bad_subfactor_flags[backend](g.offsets.map(BigInt), g.sizes.map(BigInt),
          g.complete.map(BigInt), BigInt(g.groupCount ?? g.sizes.length), BigInt(g.active), out), /subfactor/);
        assert.deepEqual(out, Array(g.outputLength ?? 10).fill(77n));
      }
      for (const [t, off, size, complete] of invalidScalar)
        assert.throws(() => mod.pari_bad_subfactor_ideal[backend](BigInt(t), BigInt(off), BigInt(size), Boolean(complete)), /subfactor/);
      backends.push(backend);
    }
  }
  const report = { ...cp, backends, actualPolicyCases, upstreamHash: hash(upstream), predicateHash: hash(predicate),
    oracleHash: hash(c), sourceHash: hash(fs.readFileSync(path.join(__dirname, "bad_subfactor.py"))),
    directory, qualifiedTiming: false,
    boundary: "bad_subFB predicate from FBgen group metadata; no supplied bad flags, new selection policy, or prime decomposition" };
  fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
