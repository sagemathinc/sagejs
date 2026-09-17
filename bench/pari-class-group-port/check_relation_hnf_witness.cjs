"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function multiply(left, rows, inner, right, columns) {
  return Array.from({ length: rows * columns }, (_, at) => {
    const row = at % rows;
    const column = Math.floor(at / rows);
    let value = 0n;
    for (let k = 0; k < inner; k += 1) {
      value += left[k * rows + row] * right[column * inner + k];
    }
    return value;
  });
}
function identity(n) {
  return Array.from({ length: n * n }, (_, at) =>
    at % n === Math.floor(at / n) ? 1n : 0n,
  );
}
function verify(fixture, result) {
  const { rows, columns, relation, fullHnf, transform } = fixture;
  const zero = columns - rows;
  const presentation = fullHnf.slice(zero * rows);
  const inverse = result.inverse.map(BigInt);
  const r2p = result.relationToPresentation.map(BigInt);
  const p2r = result.presentationToRelation.map(BigInt);
  assert.deepEqual(multiply(relation, rows, columns, transform, columns), fullHnf);
  assert.deepEqual(fullHnf.slice(0, zero * rows), Array(zero * rows).fill(0n));
  assert.deepEqual(multiply(transform, columns, columns, inverse, columns), identity(columns));
  assert.deepEqual(multiply(inverse, columns, columns, transform, columns), identity(columns));
  assert.deepEqual(multiply(relation, rows, columns, r2p, rows), presentation);
  assert.deepEqual(multiply(presentation, rows, rows, p2r, columns), relation);
  assert.deepEqual(result.state.map(BigInt), [
    0n,
    BigInt(rows),
    BigInt(columns),
    BigInt(zero),
    BigInt(rows * columns),
    BigInt(2 * columns * columns),
    BigInt(rows * columns),
    BigInt(rows * columns),
  ]);
  const corrupted = r2p.slice();
  corrupted[0] += 1n;
  assert.notDeepEqual(multiply(relation, rows, columns, corrupted, rows), presentation);
}

(async () => {
  const fixtureAt = process.argv.indexOf("--resident-output");
  assert(fixtureAt >= 0 && process.argv[fixtureAt + 1], "pass --resident-output OUTPUT.json");
  const fixturePath = path.resolve(process.argv[fixtureAt + 1]);
  const fixtureBytes = fs.readFileSync(fixturePath);
  const fixtureSha256 = hash(fixtureBytes);
  assert([
    "a705f625bf6f47a25b62dd3ff8485abf1c8af5ec0f12d15ee5cbb89cf6195e0b",
    "876b14d20c95d722ff88cf19723d67c5e213b7722a030a5451f10318d3bef3df",
    "b3325b2c3d0842b4a87924a86dda138d551afceb92b031d2b0583f123d4a47ae",
  ].includes(fixtureSha256), "unqualified resident output artifact");
  const resident = JSON.parse(fixtureBytes);
  assert.equal(resident.relation_state[0], "73");
  assert.equal(resident.class_number[0], "1");
  assert.deepEqual(resident.prep_polynomial.slice(0, 4).map(String), ["20034", "-20018", "0", "1"]);
  assert.deepEqual(resident.hnf_assembly_state.slice(0, 5).map(Number), [8, 0, 15, 8, 58]);
  assert.deepEqual(resident.hnf_final_state.slice(0, 7).map(Number), [0, 7, 66, 0, 7, 8, 0]);
  const rows = 8;
  const columns = 15;
  const fixture = {
    rows,
    columns,
    relation: resident.hnf_matbnew.slice(0, rows * columns).map(BigInt),
    fullHnf: resident.hnf_full_h.slice(0, rows * columns).map(BigInt),
    transform: resident.hnf_hnf_transform.slice(0, columns * columns).map(BigInt),
  };

  // Same-source CPython is the dynamic fallback; matrix products below are the
  // independent oracle for the compact witnesses.
  const python = JSON.parse(run(
    "python3",
    [
      "-c",
      `import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.relation_hnf_witness').pari_relation_hnf_witness
v=json.load(sys.stdin);m=v['rows'];n=v['columns'];A=list(map(int,v['relation']));F=list(map(int,v['fullHnf']));V=list(map(int,v['transform']))
Vi=[77]*(n*n+2);aug=[77]*(2*n*n+2);ist=[77]*5;r2p=[77]*(m*n+2);p2r=[77]*(m*n+2);state=[77]*8
assert f(A,m,n,F,V,Vi,aug,ist,r2p,p2r,state)==0
good=dict(inverse=Vi[:n*n],relationToPresentation=r2p[:m*n],presentationToRelation=p2r[:m*n],state=state,inverseState=ist)
assert Vi[n*n:]==[77,77] and r2p[m*n:]==[77,77] and p2r[m*n:]==[77,77]
for key,at in [('relation',0),('fullHnf',0),('transform',0)]:
 badA=A[:];badF=F[:];badV=V[:];locals()[{'relation':'badA','fullHnf':'badF','transform':'badV'}[key]][at]+=1
 oi=[91]*(n*n);oa=[91]*(2*n*n);os=[91]*5;o1=[91]*(m*n);o2=[91]*(m*n);st=[91]*8
 assert f(badA,m,n,badF,badV,oi,oa,os,o1,o2,st)==-1
 assert oi==[91]*(n*n) and o1==[91]*(m*n) and o2==[91]*(m*n)
try:f(A,m,n-8,F,V,[0],[],[],[],[],[])
except ValueError:pass
else:raise AssertionError('malformed dimensions accepted')
print(json.dumps(good))`,
      path.resolve(__dirname, "../.."),
      path.resolve(__dirname, "../../src/lib"),
    ],
    { input: JSON.stringify(fixture, (_, value) => typeof value === "bigint" ? String(value) : value) },
  ));
  verify(fixture, python);

  const sourcePath = path.join(__dirname, "relation_hnf_witness.py");
  const built = await compileKernel({ sourcePath });
  const native = require(built.modulePath).pari_relation_hnf_witness;
  assert(native.nativeAvailable);
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  const values = (owner) => Array.isArray(owner) ? owner : owner.toArray();
  const summaries = {};
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const make = (entries, tail = 0, guard = 77n) => native.createIntegerBuffer(
      entries.length + tail,
      256,
      [...entries, ...Array(tail).fill(guard)],
    );
    const A = make(fixture.relation, 1, 999n);
    const F = make(fixture.fullHnf, 1, 999n);
    const V = make(fixture.transform, 1, 999n);
    const inverse = make(Array(columns * columns).fill(77n), 2);
    const augmented = make(Array(2 * columns * columns).fill(77n), 2);
    const inverseState = Array(5).fill(77n);
    const r2p = make(Array(rows * columns).fill(77n), 2);
    const p2r = make(Array(rows * columns).fill(77n), 2);
    const state = Array(8).fill(77n);
    assert.equal(native[backend](
      A, BigInt(rows), BigInt(columns), F, V, inverse, augmented,
      inverseState, r2p, p2r, state,
    ), 0n);
    const got = {
      inverse: values(inverse).slice(0, columns * columns),
      relationToPresentation: values(r2p).slice(0, rows * columns),
      presentationToRelation: values(p2r).slice(0, rows * columns),
      state,
      inverseState,
    };
    verify(fixture, got);
    for (const key of ["inverse", "relationToPresentation", "presentationToRelation"]) {
      assert.deepEqual(got[key], python[key].map(BigInt), `${backend}:${key}`);
    }
    assert.deepEqual(values(A).slice(-1), [999n]);
    assert.deepEqual(values(F).slice(-1), [999n]);
    assert.deepEqual(values(V).slice(-1), [999n]);
    assert.deepEqual(values(inverse).slice(-2), [77n, 77n]);
    assert.deepEqual(values(r2p).slice(-2), [77n, 77n]);
    assert.deepEqual(values(p2r).slice(-2), [77n, 77n]);

    // Exact in-place compaction aliases are intentional: V[:,z:] moves down
    // within V, and V^-1[z:,:] moves down within V^-1.
    const aliasV = make(fixture.transform);
    const aliasInverse = make(Array(columns * columns).fill(0n));
    assert.equal(native[backend](
      make(fixture.relation), BigInt(rows), BigInt(columns), make(fixture.fullHnf),
      aliasV, aliasInverse, make(Array(2 * columns * columns).fill(0n)),
      Array(5).fill(0n), aliasV, aliasInverse, Array(8).fill(0n),
    ), 0n);
    assert.deepEqual(values(aliasV).slice(0, rows * columns), python.relationToPresentation.map(BigInt));
    assert.deepEqual(values(aliasInverse).slice(0, rows * columns), python.presentationToRelation.map(BigInt));

    const badRelation = fixture.relation.slice();
    badRelation[0] += 1n;
    const guardedInverse = make(Array(columns * columns).fill(91n));
    const guardedR2p = make(Array(rows * columns).fill(91n));
    const guardedP2r = make(Array(rows * columns).fill(91n));
    assert.equal(native[backend](
      make(badRelation), BigInt(rows), BigInt(columns), make(fixture.fullHnf),
      make(fixture.transform), guardedInverse,
      make(Array(2 * columns * columns).fill(91n)), Array(5).fill(91n),
      guardedR2p, guardedP2r, Array(8).fill(91n),
    ), -1n);
    assert.deepEqual(values(guardedInverse), Array(columns * columns).fill(91n));
    assert.deepEqual(values(guardedR2p), Array(rows * columns).fill(91n));
    assert.deepEqual(values(guardedP2r), Array(rows * columns).fill(91n));
    assert.throws(() => native[backend](
      make(fixture.relation), 9n, 8n, make(fixture.fullHnf), make(fixture.transform),
      guardedInverse, make([]), [], guardedR2p, guardedP2r, [],
    ), /dimensions/);
    summaries[backend] = { mutationRejections: 1, inPlaceAliases: 2 };
  }
  console.log(JSON.stringify({
    authenticField: "x^3 - 20018*x + 20034",
    acceptedRelations: 73,
    activeRelationShape: [rows, columns],
    presentationShape: [rows, rows],
    fixtureSha256,
    sourceSha256: hash(fs.readFileSync(sourcePath)),
    coreSha256: hash(core),
    cacheKey: built.cacheKey,
    backends: ["cpython", "javascript", "gmp", "tagged"],
    summaries,
    independentIdentities: ["A*R2P=H", "H*P2R=A", "V*Vi=I", "Vi*V=I"],
    qualifiedTiming: false,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
