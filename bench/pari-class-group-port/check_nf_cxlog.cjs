"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

const scalar = (numerator, denominator, exponent) => ({
  kind: 0,
  numerator,
  denominator,
  coordinates: [0, 0, 0],
  exponent,
});
const basis = (coordinates, exponent) => ({
  kind: 1,
  numerator: 0,
  denominator: 1,
  coordinates,
  exponent,
});

const cases = [
  { precision: 192, factors: [], branches: [0, 0, 0, 0] },
  { precision: 192, factors: [scalar(12, 5, 7)], branches: [1, 0, 0, 0] },
  { precision: 192, factors: [scalar(-3, 2, 4)], branches: [0, 1, 0, 0] },
  { precision: 192, factors: [scalar(-3, 2, -3)], branches: [0, 0, 1, 0] },
  { precision: 192, factors: [basis([1, 1, 0], 2)], branches: [0, 0, 0, 1] },
  { precision: 192, factors: [basis([2, 2, 0], -2)], branches: [0, 0, 0, 1] },
  {
    precision: 192,
    factors: [
      scalar(17, 11, 9),
      basis([1, -2, 1], 3),
      scalar(-5, 7, -5),
      basis([-3, 1, 1], -2),
      scalar(-13, 2, 8),
    ],
    branches: [1, 1, 1, 2],
  },
  { precision: 192, factors: [basis([1, 1, 0], 0)], branches: [0, 0, 0, 1] },
  { precision: 192, lowPrecisionMatrix: true, factors: [basis([1, 1, 0], 1)], branches: [0, 0, 0, 0] },
];

function flattenCase(c) {
  return [
    c.precision,
    Number(Boolean(c.lowPrecisionMatrix)),
    c.factors.length,
    ...c.factors.flatMap((f) => [
      f.kind,
      f.numerator,
      f.denominator,
      ...f.coordinates,
      f.exponent,
    ]),
  ];
}

function packed(c) {
  return {
    offsets: [0, c.factors.length],
    kinds: c.factors.map((f) => f.kind),
    numerators: c.factors.map((f) => f.numerator),
    denominators: c.factors.map((f) => f.denominator),
    coordinates: c.factors.flatMap((f) => f.coordinates),
    exponents: c.factors.map((f) => f.exponent),
  };
}

(async () => {
  const pari = path.resolve(process.argv[2]);
  const archive = path.resolve(process.argv[3]);
  const lib = path.join(pari, "Olinux-x86_64");
  assert.equal(
    crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  const base3 = run("tar", [
    "-xOf",
    archive,
    "pari-2.17.4/src/basemath/base3.c",
  ]);
  assert.equal(
    crypto.createHash("sha256").update(base3).digest("hex"),
    "5cbf4ebd6c70deb06cfd83f94b8d86368e60cd084f318a003a8ee14821e1cbea",
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-nf-cxlog-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `#include "pari.h"
#include "paripriv.h"
static GEN rd(void) { char s[8192]; if (scanf("%8191s", s) != 1) exit(2); return gp_read_str(s); }
static void emit_scalar(GEN x) {
  long e;
  if (typ(x) == t_INT) { pari_printf("%Ps -1 0 ", x); return; }
  pari_printf("%Ps %ld %ld ", signe(x) ? mantissa_real(x, &e) : gen_0,
              signe(x) ? bit_prec(x) : 0, expo(x));
}
static void emit_entry(GEN x) {
  if (typ(x) == t_COMPLEX) {
    printf("2 "); emit_scalar(gel(x, 1)); emit_scalar(gel(x, 2));
  } else {
    printf("1 "); emit_scalar(x); printf("0 -1 0 ");
  }
}
int main(void) {
  pari_init(128000000, 10000);
  long count = itos(rd());
  for (long test = 0; test < count; test++) {
    pari_sp av = avma;
    long bits = itos(rd()), low_precision_matrix = itos(rd()), factors = itos(rd());
    GEN G = cgetg(factors + 1, t_COL), E = cgetg(factors + 1, t_COL);
    for (long i = 1; i <= factors; i++) {
      long kind = itos(rd());
      GEN numerator = rd(), denominator = rd();
      GEN coordinates = cgetg(4, t_COL);
      for (long j = 1; j <= 3; j++) gel(coordinates, j) = rd();
      gel(E, i) = rd();
      gel(G, i) = kind == 0 ? gdiv(numerator, denominator) : coordinates;
    }
    GEN nf = nfinit(gp_read_str("x^3-20010*x+20018"), nbits2prec(bits));
    GEN M = nf_get_M(nf);
    if (low_precision_matrix)
      for (long column = 1; column <= 3; column++)
        gcoeff(M, 1, column) = gtofp(gcoeff(M, 1, column), DEFAULTPREC);
    GEN fa = mkmat2(G, E);
    GEN value = nf_cxlog(nf, fa, nbits2prec(bits));
    printf("%ld ", value ? 0L : 1L);
    for (long row = 1; row <= 3; row++)
      for (long column = 1; column <= 3; column++) emit_scalar(gcoeff(M, row, column));
    if (value) for (long row = 1; row <= 3; row++) emit_entry(gel(value, row));
    putchar('\\n');
    avma = av;
  }
  pari_close();
  return 0;
}`,
  );
  run("cc", [
    "-O2",
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
  const oracleInput = [cases.length, ...cases.flatMap(flattenCase)].join(" ");
  const trace = run(executable, [], { input: oracleInput });
  const fixtures = trace
    .trim()
    .split("\n")
    .map((line, index) => {
      const words = line.trim().split(" ");
      const failed = Number(words[0]);
      const triples = words.slice(1, 28);
      return {
        ...cases[index],
        failed,
        matrix: [0, 1, 2].map((part) =>
          triples.filter((_, i) => i % 3 === part),
        ),
        expected: failed ? null : words.slice(28),
      };
    });
  assert.equal(fixtures.length, cases.length);
  assert.equal(fixtures.at(-1).failed, 1, "64-bit precision must hit low_prec");

  const python = `import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.nf_cxlog').pari_prepared_famat_cxlog
for ix,r in enumerate(json.load(sys.stdin)):
 p={k:list(map(int,v)) for k,v in r['packed'].items()}
 ga=[77]*21; state=[0,0,-1,-1,0,0,0,0]
 work=[[0]*3,[0]*21,[0]*21,[0]*3,[0]*3]+[[0]*64 for _ in range(4)]+[[0]*128]
 status=f(*[list(map(int,v)) for v in r['matrix']],p['offsets'],p['kinds'],p['numerators'],p['denominators'],p['coordinates'],p['exponents'],1,r['precision'],ga,state,*work)
 assert status==r['failed'],(ix,status,r['failed'])
 if r['failed']:
  assert ga==[77]*21 and state[1:4]==[0,0,0],(ix,ga,state)
 else:
  assert ga==list(map(int,r['expected'])),(ix,ga,r['expected'])
  assert state[1]==1
 assert state[4:8]==r['branches'],(ix,state,r['branches'])
`;
  const payload = fixtures.map((fixture) => ({
    ...fixture,
    packed: packed(fixture),
  }));
  run(
    "python3",
    [
      "-c",
      python,
      path.resolve(__dirname, "../.."),
      path.resolve(__dirname, "../../src/lib"),
    ],
    { input: JSON.stringify(payload) },
  );

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "nf_cxlog.py"),
  });
  const fn = require(built.modulePath).pari_prepared_famat_cxlog;
  assert(fn.nativeAvailable);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const make = (size, values = Array(size).fill(0n)) =>
      backend === "javascript"
        ? values.slice()
        : fn.createIntegerBuffer(size, 64, values);
    const array = (value) => (Array.isArray(value) ? value : value.toArray());
    for (const [index, fixture] of payload.entries()) {
      const p = fixture.packed;
      const ga = make(21, Array(21).fill(77n));
      const state = make(8, [0n, 0n, -1n, -1n, 0n, 0n, 0n, 0n]);
      const work = [
        make(3),
        make(21),
        make(21),
        make(3),
        make(3),
        ...Array.from({ length: 4 }, () => make(64)),
        make(128),
      ];
      const status = fn[backend](
        ...fixture.matrix.map((values) => values.map(BigInt)),
        p.offsets.map(BigInt),
        p.kinds.map(BigInt),
        p.numerators.map(BigInt),
        p.denominators.map(BigInt),
        p.coordinates.map(BigInt),
        p.exponents.map(BigInt),
        1n,
        BigInt(fixture.precision),
        ga,
        state,
        ...work,
      );
      assert.equal(status, BigInt(fixture.failed), `${backend} status ${index}`);
      assert.deepEqual(
        array(ga),
        fixture.failed
          ? Array(21).fill(77n)
          : fixture.expected.map(BigInt),
        `${backend} Ga ${index}`,
      );
      assert.deepEqual(
        array(state).slice(4, 8),
        fixture.branches.map(BigInt),
        `${backend} branches ${index}`,
      );
    }
  }

  // Atomic publication: the empty first generator commits, while a low-prec
  // basis factor in the second leaves its complete 21-cell sentinel intact.
  const low = payload.at(-1);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const make = (size, values = Array(size).fill(0n)) =>
      backend === "javascript"
        ? values.slice()
        : fn.createIntegerBuffer(size, 64, values);
    const array = (value) => (Array.isArray(value) ? value : value.toArray());
    const ga = make(42, Array(42).fill(77n));
    const state = make(8, [0n, 0n, -1n, -1n, 0n, 0n, 0n, 0n]);
    const work = [make(3), make(21), make(21), make(3), make(3), ...Array.from({ length: 4 }, () => make(64)), make(128)];
    assert.equal(
      fn[backend](
        ...low.matrix.map((values) => values.map(BigInt)),
        [0n, 0n, 1n], [1n], [0n], [1n], [1n, 1n, 0n], [1n],
        2n, 192n, ga, state, ...work,
      ),
      1n,
    );
    assert.deepEqual(array(ga).slice(0, 21), payload[0].expected.map(BigInt));
    assert.deepEqual(array(ga).slice(21), Array(21).fill(77n));
    assert.equal(array(state)[1], 1n);
  }

  // Malformed prepared inputs reject before publishing any output.
  const good = payload[4];
  for (const mutate of [
    (p) => (p.kinds[0] = 9),
    (p) => (p.denominators[0] = 0),
    (p) => (p.coordinates = [1, 0, 0]),
    (p) => (p.offsets = [1, 1]),
  ]) {
    const p = structuredClone(good.packed);
    mutate(p);
    const ga = Array(21).fill(77n), state = [0n, 0n, -1n, -1n, 0n, 0n, 0n, 0n];
    assert.throws(() =>
      fn.javascript(
        ...good.matrix.map((values) => values.map(BigInt)),
        p.offsets.map(BigInt), p.kinds.map(BigInt), p.numerators.map(BigInt),
        p.denominators.map(BigInt), p.coordinates.map(BigInt), p.exponents.map(BigInt),
        1n, 192n, ga, state,
        Array(3).fill(0n), Array(21).fill(0n), Array(21).fill(0n),
        Array(3).fill(0n), Array(3).fill(0n),
        ...Array.from({ length: 4 }, () => Array(64).fill(0n)), Array(128).fill(0n),
      ),
    );
    assert.deepEqual(ga, Array(21).fill(77n));
  }

  console.log(
    JSON.stringify({
      cases: payload.length,
      successful: payload.filter((x) => !x.failed).length,
      lowPrecisionFrontiers: payload.filter((x) => x.failed).length,
      malformedRejected: 4,
      atomicPrefixBackends: 3,
      backends: ["PARI", "CPython", "javascript", "gmp", "tagged"],
      traceSha256: crypto.createHash("sha256").update(trace).digest("hex"),
      coreBytes: fs.statSync(built.coreSourcePath).size,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
