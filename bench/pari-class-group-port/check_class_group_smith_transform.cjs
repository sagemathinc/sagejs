"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

(async () => {
  const pari = path.resolve(process.argv[2]);
  const archive = path.resolve(process.argv[3]);
  const lib = path.join(pari, "Olinux-x86_64");
  assert.equal(
    hash(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  let seed = 0x51f17e2d;
  function random(limit) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  }
  const cases = [];
  for (let n = 0; n <= 8; n += 1) {
    for (let variant = 0; variant < 18; variant += 1) {
      const diagonal = Array.from({ length: n }, (_, row) =>
        BigInt(1 + ((3 * row + variant + random(29)) % 47)),
      );
      const W = Array.from({ length: n * n }, (_, at) => {
        const row = at % n;
        const column = Math.floor(at / n);
        if (row > column) return 0n;
        if (row === column) return diagonal[row];
        return BigInt(random(Number(diagonal[row])));
      });
      cases.push({ n, W: W.map(String), kind: "word-hnf" });
    }
  }
  // Multiword diagonal cases exercise exact storage/inversion without making
  // transformation equality depend on GMP's private multiword gcdext choice.
  for (const bits of [65n, 129n, 257n, 513n]) {
    for (let n = 1; n <= 6; n += 1) {
      const W = Array.from({ length: n * n }, (_, at) => {
        const row = at % n;
        const column = Math.floor(at / n);
        return row === column ? (1n << bits) + BigInt(2 * row + 1) : 0n;
      });
      cases.push({ n, W: W.map(String), kind: "multiword-diagonal" });
    }
  }
  cases.push(
    { n: 2, W: ["2", "0", "1", "2"], kind: "c4" },
    { n: 2, W: ["2", "0", "0", "2"], kind: "c2xc2" },
    { n: 3, W: ["6", "0", "0", "1", "2", "0", "5", "1", "15"], kind: "repair" },
  );
  let collectorFixtureSha256 = null;
  const collectorAt = process.argv.indexOf("--collector-fixtures");
  if (collectorAt >= 0) {
    const bytes = fs.readFileSync(path.resolve(process.argv[collectorAt + 1]));
    collectorFixtureSha256 = hash(bytes);
    const payload = JSON.parse(bytes);
    for (const output of payload.nativeOutputs.filter((entry) => entry.backend === "gmp")) {
      const n = output.hnfState[0];
      assert.equal(output.H.length, n * n);
      cases.push({
        n,
        W: output.H.map(String),
        kind: "actual-collector-hnf",
        field: output.field,
      });
    }
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-class-smith-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `/* Pristine PARI 2.17.4 class_group_gen matrix schedule. */
#include "pari.h"
static GEN rd(void){char s[8192];if(scanf("%8191s",s)!=1)exit(2);return gp_read_str(s);}
static GEN matrix(long n){GEN x=cgetg(n+1,t_MAT);for(long j=1;j<=n;j++){gel(x,j)=cgetg(n+1,t_COL);for(long i=1;i<=n;i++)gcoeff(x,i,j)=rd();}return x;}
static void pm(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++){if(j>1||i>1)putchar(',');pari_printf("\\\"%Ps\\\"",gcoeff(x,i,j));}putchar(']');}
int main(void){pari_init(256000000,1000);long count=itos(rd());for(long t=0;t<count;t++){pari_sp av=avma;long n=itos(rd()),j,l;GEN W=matrix(n),U,V,D=ZM_snfall(W,&U,&V),Ui=ZM_inv(U,NULL),Y,X,Ur=ZM_hnfdivrem(U,D,&Y),Uir=ZM_hnfdivrem(Ui,W,&X),M2=ZM_add(ZM_mul(X,Ur),ZM_mul(V,Y)),Df=gcopy(D),Vf=gcopy(V);for(j=1;j<lg(D);j++)if(is_pm1(gcoeff(D,j,j)))break;l=j;setlg(V,l);setlg(D,l);GEN M1=ZM_add(V,ZM_mul(X,D));printf("{\\\"D\\\":");pm(Df);printf(",\\\"U\\\":");pm(U);printf(",\\\"Ui\\\":");pm(Ui);printf(",\\\"V\\\":");pm(Vf);printf(",\\\"Ur\\\":");pm(Ur);printf(",\\\"Y\\\":");pm(Y);printf(",\\\"Uir\\\":");pm(Uir);printf(",\\\"X\\\":");pm(X);printf(",\\\"M1\\\":");pm(M1);printf(",\\\"M2\\\":");pm(M2);printf(",\\\"count\\\":%ld}\\n",l-1);avma=av;}pari_close();return 0;}
`,
  );
  run("cc", [
    "-O1",
    "-fsanitize=undefined",
    "-fno-sanitize-recover=undefined",
    `-I${path.join(pari, "src/headers")}`,
    `-I${lib}`,
    source,
    `-L${lib}`,
    `-Wl,-rpath,${lib}`,
    "-lpari",
    "-lm",
    "-o",
    executable,
  ]);
  const trace = run(executable, [], {
    input: [cases.length, ...cases.flatMap((entry) => [entry.n, ...entry.W])].join(" "),
  });
  const expected = trace.trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(expected.length, cases.length);
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
  const add = (left, right) => left.map((value, index) => value + right[index]);
  for (let index = 0; index < cases.length; index += 1) {
    const n = cases[index].n;
    const want = Object.fromEntries(
      Object.entries(expected[index]).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map(BigInt) : value,
      ]),
    );
    const W = cases[index].W.map(BigInt);
    const identity = Array.from({ length: n * n }, (_, at) =>
      at % n === Math.floor(at / n) ? 1n : 0n,
    );
    assert.deepEqual(multiply(multiply(want.U, n, n, W, n), n, n, want.V, n), want.D);
    assert.deepEqual(multiply(want.U, n, n, want.Ui, n), identity);
    assert.deepEqual(multiply(want.Ui, n, n, want.U, n), identity);
    assert.deepEqual(want.Ur, add(want.U, multiply(want.D, n, n, want.Y, n)));
    assert.deepEqual(want.Uir, add(want.Ui, multiply(W, n, n, want.X, n)));
    assert.deepEqual(
      want.M2,
      add(
        multiply(want.X, n, n, want.Ur, n),
        multiply(want.V, n, n, want.Y, n),
      ),
    );
    const columns = want.count;
    assert.deepEqual(
      want.M1,
      add(
        want.V.slice(0, n * columns),
        multiply(want.X, n, n, want.D.slice(0, n * columns), columns),
      ),
    );
  }

  const python = run(
    "python3",
    [
      "-c",
      `import decimal,importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.class_group_smith_transform').pari_class_group_smith_transform
cases,expected=json.load(sys.stdin)
for ix,(case,want) in enumerate(zip(cases,expected)):
 n=case['n'];size=n*n;W=list(map(int,case['W']));tails=2
 mats=[[77]*(size+tails) for _ in range(10)]
 inv=[77]*(n+tails);h=[77,77];col=[77]*(n+tails);product=[77]*(size+tails);aug=[77]*(2*size+tails)
 states=[[77]*7,[77]*7,[77]*7,[77]*7,[77]*9]
 args=[W+[999],n,*mats,inv,h,col,product,aug,*states]
 assert f(*args)==0,(ix,states)
 names=['D','U','Ui','V','Ur','Y','Uir','X','M1','M2']
 for pos,name in enumerate(names):
  length=size if name!='M1' else n*want['count']
  assert args[2+pos][:length]==list(map(int,want[name])),(ix,name,args[2+pos][:length],want[name])
  assert args[2+pos][size:]==[77]*tails,(ix,name,'tail')
 assert args[12][:want['count']]==[int(want['D'][i*n+i]) for i in range(want['count'])]
 h0=1
 for value in args[12][:want['count']]:h0*=value
 assert args[13]==[h0,77]
 assert args[0]==W+[999] and args[18][-2:]==[77]*tails
 assert args[-1][0:2]==[0,want['count']]
print(json.dumps({'cases':len(cases),'sourceMode':'cpython'}))
`,
      path.resolve(__dirname, "../.."),
      path.resolve(__dirname, "../../src/lib"),
    ],
    { input: JSON.stringify([cases, expected]) },
  );
  const pythonSummary = JSON.parse(python);
  if (process.argv.includes("--source-only")) {
    console.log(JSON.stringify({
      ...pythonSummary,
      traceSha256: hash(trace),
      collectorFixtureSha256,
      artifactDirectory: directory,
      qualifiedTiming: false,
    }));
    return;
  }

  const sourcePath = path.join(__dirname, "class_group_smith_transform.py");
  const built = await compileKernel({ sourcePath });
  const native = require(built.modulePath).pari_class_group_smith_transform;
  assert(native.nativeAvailable);
  assert.doesNotMatch(
    fs.readFileSync(built.coreSourcePath, "utf8"),
    /napi_call_function|PyObject_Call|v8::/,
  );
  function values(owner) {
    return Array.isArray(owner) ? owner : owner.toArray();
  }
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (let index = 0; index < cases.length; index += 1) {
      const entry = cases[index];
      const want = expected[index];
      const n = entry.n;
      const size = n * n;
      const make = (length) =>
        native.createIntegerBuffer(length, 640, Array(length).fill(77n));
      const original = native.createIntegerBuffer(
        size + 1,
        640,
        [...entry.W.map(BigInt), 999n],
      );
      const matrices = Array.from({ length: 10 }, () => make(size + 2));
      const args = [
        original,
        BigInt(n),
        ...matrices,
        make(n + 2),
        make(2),
        make(n + 2),
        make(size + 2),
        make(2 * size + 2),
        Array(7).fill(77n),
        Array(7).fill(77n),
        Array(7).fill(77n),
        Array(7).fill(77n),
        Array(9).fill(77n),
      ];
      assert.equal(native[backend](...args), 0n, `${backend}:${index}`);
      const names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"];
      for (let at = 0; at < names.length; at += 1) {
        const name = names[at];
        const length = name === "M1" ? n * want.count : size;
        assert.deepEqual(
          values(matrices[at]).slice(0, length),
          want[name].map(BigInt),
          `${backend}:${index}:${name}`,
        );
        assert.deepEqual(values(matrices[at]).slice(size), [77n, 77n]);
      }
      assert.deepEqual(values(original), [...entry.W.map(BigInt), 999n]);
      assert.deepEqual(args.at(-1).slice(0, 2), [0n, BigInt(want.count)]);
    }
  }
  console.log(JSON.stringify({
    cases: cases.length,
    backends: ["cpython", "javascript", "gmp", "tagged"],
    traceSha256: hash(trace),
    collectorFixtureSha256,
    sourceSha256: hash(fs.readFileSync(sourcePath)),
    coreBytes: fs.statSync(built.coreSourcePath).size,
    cacheKey: built.cacheKey,
    ubsan: true,
    qualifiedTiming: false,
    artifactDirectory: directory,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
