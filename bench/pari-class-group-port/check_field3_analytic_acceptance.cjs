"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

(async () => {

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

const root = path.resolve(__dirname, "../..");
const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
const archive = path.resolve(
  process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
);
assert.equal(
  createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
);

const { records } = JSON.parse(
  run(process.execPath, [
    path.join(__dirname, "check_compiled_residue.cjs"),
    pari,
    "--export-fixtures",
  ]),
);
const { fields } = JSON.parse(
  run(process.execPath, [
    path.join(__dirname, "check_selected_inverse_hr.cjs"),
    pari,
    archive,
    "--export-fixtures",
  ]),
);

// The acceptance cut has a tiny independent pristine-PARI differential.
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "sagejs-field3-analytic-acceptance-"),
);
const source = path.join(directory, "oracle.c");
const executable = path.join(directory, "oracle");
const lib = path.join(pari, "Olinux-x86_64");
fs.writeFileSync(
  source,
  `#include "pari.h"
#include "paripriv.h"
static void packed(GEN x) { long e; pari_printf("[\\"%Ps\\",\\"%ld\\",\\"%ld\\"]", mantissa_real(x,&e), bit_prec(x), expo(x)); }
int main(void) {
  pari_init(32000000,1000); GEN lambda=cgetg(14,t_MAT);
  for(long j=1;j<=13;j++){ gel(lambda,j)=cgetg(3,t_COL); for(long i=1;i<=2;i++) gcoeff(lambda,i,j)=j==i?itor(gen_1,192):real_0_bit(-192); }
  GEN L=bestappr(lambda,stoi(2)), den=Q_denom(L), H=ZM_hnf(L);
  GEN R=gmul(itor(gen_1,192),gdiv(ZM_det_triangular(H),powiu(den,lg(H)-1)));
  printf("{\\"regulator\\":");packed(R);pari_printf(",\\"denominator\\":\\"%Ps\\",\\"relations\\":[",den);
  for(long j=1;j<=13;j++)for(long i=1;i<=2;i++){if(j>1||i>1)putchar(',');pari_printf("\\"%Ps\\"",gcoeff(L,i,j));}puts("]}");
  pari_close(); return 0;
}`,
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
const oracleText = run(executable, []);
const oracle = JSON.parse(oracleText);

const python = String.raw`
import copy, importlib, json, sys
sys.path[:0] = sys.argv[1:3]
mod = importlib.import_module("bench.pari-class-group-port.field3_analytic_acceptance")
data = json.load(sys.stdin)
r, f, oracle = data["record"], data["field"], data["oracle"]

primes = list(map(int, r["primes"])); offsets = list(map(int, r["offsets"]))
counts = list(map(int, r["counts"])); degrees = list(map(int, r["degrees"]))
multiplicities = list(map(int, r["multiplicities"]))
catalog = list(mod.pari_field3_catalog_latches(primes, len(primes), offsets, counts, degrees, multiplicities, len(degrees)))

def preparation():
    return [
        [-2000042,-2000022,0,0,1], int(f["discriminant"]), f["r1"], f["r2"], int(f["rootsOfUnity"]),
        primes[:], len(primes), offsets[:], counts[:], degrees[:], multiplicities[:], len(degrees), catalog[:],
        [0.0], [0.0]*7, [0.0]*31, [0.0], [0.0]*len(primes), [0.0], [0]*3,
        [0]*3, [0]*3, [0]*1024, [0]*1024, [0]*1024, [0]*1024, [0]*128,
        [71]*3, [83]*6,
    ]

prep = preparation()
assert mod.pari_field3_analytic_preparation(*prep) == 0
assert prep[-2] == list(map(int, f["inverse_hr"]))
assert prep[-1][:4] == [f["residueBound"], r["selected"][5], *catalog]
assert prep[-1][5] == 1

# Catalog mutation is rejected before public output or owner-state publication.
bad = preparation(); bad[5][0] += 1; before = copy.deepcopy(bad)
try: mod.pari_field3_analytic_preparation(*bad)
except ValueError: pass
else: raise AssertionError("accepted mutated prepared catalog")
assert bad[-2:] == before[-2:]

precision=192; one=[1 << 191,192,0]
packed=[0]*273; c3=list(mod.pari_field3_regulator_owner_latches(packed,273))
inverse_hr=one[:]
inv_latch=(inverse_hr[0] % 2305843009213693951 + 1000003*inverse_hr[1] + 1000033*(inverse_hr[2] % 2305843009213693951)) % 2305843009213693951
analytic=[2,1,11,13,inv_latch,1]
coords=[]
for column in range(13):
    for row in range(2): coords += one[:] if column==row and column<2 else [0,0,-precision]

def acceptance(hnf=(1,0,0,1), multiple_value=None, getfu=0):
    multiple_value = one[:] if multiple_value is None else multiple_value
    h1,h2=4,12
    for index,value in enumerate(hnf):
        h1=(h1*1000003 + value % 2305843009213693951 + index+1) % 2305843009213693951
        h2=(h2*1000033 + value % 2305843009213693921 + index+1) % 2305843009213693921
    return [
      packed[:], c3[:], [0,2,13,precision,*c3,1], list(hnf), [0,2,h1,h2,1], inverse_hr[:], analytic[:], precision, getfu,
      coords[:], multiple_value[:], [71], [71]*3, [71]*78, [71]*26, [71]*26, [71]*2,
      [71]*26, [71]*15, [71]*3, [71]*26, [71], [71]*4, [71]*2, [71]*13, [71]*6,
      [91], [91]*3, [91]*3, [91]*26, [91], [91]*6,
    ]

accepted=acceptance(); assert mod.pari_field3_analytic_acceptance(*accepted)==0
assert accepted[-6] == [1] and accepted[-5] == one
assert accepted[-4] == list(map(int, oracle["regulator"]))
assert accepted[-3] == list(map(int, oracle["relations"]))
assert accepted[-2] == [int(oracle["denominator"])]
assert accepted[-1] == [0,0,0,0,1,192]

# RELAT and PRECI preserve all result owners; only diagnostic state/scratch move.
relat=acceptance((2,0,0,1)); public=copy.deepcopy(relat[-6:-1])
assert mod.pari_field3_analytic_acceptance(*relat)==1 and relat[-6:-1]==public
tiny=[1 << 191,192,-8]; preci=acceptance(multiple_value=tiny); public=copy.deepcopy(preci[-6:-1])
assert mod.pari_field3_analytic_acceptance(*preci)==3 and preci[-6:-1]==public
assert preci[-1][1:3] == [1,384]

# getfu PRECI is terminal after accepted compute_R and never requests a retry.
terminal=acceptance(getfu=3)
assert mod.pari_field3_analytic_acceptance(*terminal)==3
assert terminal[-1] == [0,0,0,1,1,192]

# C3 mutation and inverse-hR mutation reject before scratch/result publication.
for index in (0,5):
    trial=acceptance(); trial[index][0] += 1; before=copy.deepcopy(trial)
    try: mod.pari_field3_analytic_acceptance(*trial)
    except ValueError: pass
    else: raise AssertionError(("accepted owner mutation",index))
    assert trial == before

print(json.dumps({"analyticDifferential":1,"pariAcceptanceDifferential":1,"mutationCases":3,"relatCases":1,"computeRRetryCases":1,"getfuTerminalCases":1}))
`;
const summary = JSON.parse(
  run("python3", ["-c", python, root, path.join(root, "src/lib")], {
    input: JSON.stringify({ record: records[3], field: fields[3], oracle }),
  }),
);
let javascriptCases = 0;
if (!process.argv.includes("--source-only")) {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "field3_analytic_acceptance.py"),
  });
  const mod = require(built.modulePath);
  const field = fields[3];
  const record = records[3];
  const big = (values) => values.map(BigInt);
  const primes = big(record.primes);
  const offsets = big(record.offsets);
  const counts = big(record.counts);
  const degrees = big(record.degrees);
  const multiplicities = big(record.multiplicities);
  const catalog = mod.pari_field3_catalog_latches.javascript(
    primes,
    BigInt(primes.length),
    offsets,
    counts,
    degrees,
    multiplicities,
    BigInt(degrees.length),
  );
  const inverseHR = [71n, 71n, 71n];
  const owner = Array(6).fill(83n);
  const prepArgs = [
    big([-2000042, -2000022, 0, 0, 1]),
    BigInt(field.discriminant),
    2n,
    1n,
    2n,
    primes,
    BigInt(primes.length),
    offsets,
    counts,
    degrees,
    multiplicities,
    BigInt(degrees.length),
    catalog,
    [0],
    Array(7).fill(0),
    Array(31).fill(0),
    [0],
    Array(primes.length).fill(0),
    [0],
    Array(3).fill(0n),
    Array(3).fill(0n),
    Array(3).fill(0n),
    Array(1024).fill(0n),
    Array(1024).fill(0n),
    Array(1024).fill(0n),
    Array(1024).fill(0n),
    Array(128).fill(0n),
    inverseHR,
    owner,
  ];
  assert.equal(mod.pari_field3_analytic_preparation.javascript(...prepArgs), 0n);
  assert.deepEqual(inverseHR.map(String), field.inverse_hr);

  const precision = 192n;
  const one = [1n << 191n, precision, 0n];
  const packed = Array(273).fill(0n);
  const c3 = mod.pari_field3_regulator_owner_latches.javascript(packed, 273n);
  const invLatch =
    (one[0] % 2305843009213693951n + 1000003n * one[1]) %
    2305843009213693951n;
  const coords = [];
  const hnf = [1n, 0n, 0n, 1n];
  let h1 = 4n, h2 = 12n;
  for (let index = 0; index < 4; index++) {
    h1 = (h1 * 1000003n + hnf[index] + BigInt(index + 1)) % 2305843009213693951n;
    h2 = (h2 * 1000033n + hnf[index] + BigInt(index + 1)) % 2305843009213693921n;
  }
  for (let column = 0; column < 13; column++)
    for (let row = 0; row < 2; row++)
      coords.push(
        ...(column === row && column < 2 ? one : [0n, 0n, -precision]),
      );
  const resultClass = [91n], resultZeta = Array(3).fill(91n);
  const resultRegulator = Array(3).fill(91n), resultRelations = Array(26).fill(91n);
  const resultDenominator = [91n], resultState = Array(6).fill(91n);
  const acceptArgs = [
    packed, c3, [0n, 2n, 13n, precision, ...c3, 1n], hnf, [0n, 2n, h1, h2, 1n], one,
    [2n, 1n, 11n, 13n, invLatch, 1n], precision, 0n, coords, one,
    [71n], Array(3).fill(71n), Array(78).fill(71n), Array(26).fill(71n),
    Array(26).fill(71n), Array(2).fill(71n), Array(26).fill(71n), Array(15).fill(71n),
    Array(3).fill(71n), Array(26).fill(71n), [71n], Array(4).fill(71n),
    Array(2).fill(71n), Array(13).fill(71n), Array(6).fill(71n),
    resultClass, resultZeta, resultRegulator, resultRelations, resultDenominator, resultState,
  ];
  assert.equal(mod.pari_field3_analytic_acceptance.javascript(...acceptArgs), 0n);
  assert.deepEqual(resultRegulator.map(String), oracle.regulator);
  assert.deepEqual(resultRelations.map(String), oracle.relations);
  javascriptCases = 2;
}
console.log(
  JSON.stringify({
    ...summary,
    javascriptCases,
    pariArchiveSha256: createHash("sha256")
      .update(fs.readFileSync(archive))
      .digest("hex"),
    oracleTraceSha256: createHash("sha256").update(oracleText).digest("hex"),
    qualifiedTiming: false,
  }),
);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
