"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const hash = (value) => createHash("sha256").update(value).digest("hex");
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
const lib = path.join(pari, "Olinux-x86_64");
assert.equal(
  hash(fs.readFileSync(archive)),
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
);

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "sagejs-field3-c4-regulator-"),
);
const source = path.join(directory, "oracle.c");
const executable = path.join(directory, "oracle");
fs.writeFileSync(
  source,
  `/* Fresh low-precision differential against pristine PARI 2.17.4.
   * GPL-2.0-or-later. No field-3 answer or frozen checkpoint is used. */
#include "pari.h"
#include "paripriv.h"
static void packed(GEN x) {
  long e;
  if (typ(x) == t_INT) { pari_printf("[\\\"%Ps\\\",\\\"-1\\\",\\\"0\\\"]", x); return; }
  pari_printf("[\\\"%Ps\\\",\\\"%ld\\\",\\\"%ld\\\"]",
    signe(x) ? mantissa_real(x, &e) : gen_0,
    signe(x) ? bit_prec(x) : 0,
    expo(x));
}
int main(void) {
  pari_init(32000000, 1000);
  GEN lambda = cgetg(14, t_MAT);
  for (long j = 1; j <= 13; j++) {
    gel(lambda,j) = cgetg(3, t_COL);
    for (long i = 1; i <= 2; i++)
      gcoeff(lambda,i,j) = j == i ? itor(gen_1, 192) : real_0_bit(-192);
  }
  GEN D = stoi(10), L = bestappr(lambda, D), den = Q_denom(L);
  long bit = -gexpo(gsub(L, lambda));
  GEN H = ZM_hnf(L); long r = lg(H) - 1;
  GEN R = gmul(itor(gen_1, 192),
               gdiv(ZM_det_triangular(H), powiu(den, r)));
  printf("{\\\"regulator\\\":"); packed(R);
  pari_printf(",\\\"denominator\\\":\\\"%Ps\\\",\\\"bits\\\":%ld,\\\"rank\\\":%ld,\\\"relations\\\":[", den, bit, r);
  for (long j = 1; j <= 13; j++) for (long i = 1; i <= 2; i++) {
    if (j > 1 || i > 1) putchar(',');
    pari_printf("\\\"%Ps\\\"", gcoeff(L,i,j));
  }
  puts("]}");
  pari_close(); return 0;
}
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
const oracleText = run(executable, []);
const oracle = JSON.parse(oracleText);

const python = String.raw`
import copy, importlib, json, sys
sys.path[:0] = sys.argv[1:3]
mod = importlib.import_module("bench.pari-class-group-port.field3_high_precision_regulator_schedule")
oracle = json.load(sys.stdin)

def reconstruction(precision=192):
    coordinates = []
    for column in range(13):
        for row in range(2):
            if column == row and column < 2:
                coordinates += [1 << (precision - 1), precision, 0]
            else:
                coordinates += [0, 0, -precision]
    args = [
        coordinates, [1 << (precision - 1), precision, 0], 10,
        [77] * 78, [77] * 26, [77] * 26, [77] * 2, [77] * 26,
        [77] * 15, [77] * 3, [77] * 26, [77], [77] * 5,
        [77] * 2, [77] * 13,
    ]
    return args

# Fresh qualified 192-bit PARI differential for the reconstruction cut.
args = reconstruction()
assert mod.pari_field3_reconstruct_with_bound(*args) == 0
assert args[9] == list(map(int, oracle["regulator"]))
assert args[10] == list(map(int, oracle["relations"]))
assert args[11] == [int(oracle["denominator"])]
assert args[12][2:] == [oracle["bits"], oracle["rank"], 10]

# The same arithmetic source runs at the scalar precision and at the separate
# internal embedding guard precision without a cap. The latter is not C3 A.
for precision in (153088, 153152):
    high = reconstruction(precision)
    assert mod.pari_field3_reconstruct_with_bound(*high) == 0
    assert high[9] == [1 << (precision - 1), precision, 0]
    assert high[10][:4] == [1, 0, 0, 1]

def coordinator(precision, complete):
    packed = []
    for _ in range(39):
        packed += [1, 0, 0, -precision, 0, -1, 0]
    c3_state = [0 if complete else 7, 1 if complete else 0, 3, 13,
                precision, 41, 273, 1]
    if precision == 192:
        precision_protocol = [192, 192, 384, 1]
    else:
        precision_protocol = [153088, 153152, 229632, 1]
    c3_hash = [0x12345678, -0x22334455, 0x33445566, -0x44556677]
    latches = list(mod.pari_field3_regulator_owner_latches(packed, 273))
    n, c, z, q = 3, 13, 3 * 14, 9
    lengths = [
        3*z, c+1, 3, 3*z, n, c+1, 3, z, z, n, c+1, c+1, 10,
        3*q, 3*q, 3*q, 3, n, 5, 3*q, 3*q, 3*q, n, 3, 3*q,
        3*q, 3, 3*(n-1)*c,
    ]
    multiple_work = [[77] * length for length in lengths]
    suffix = [
        [77] * 78, [77] * 26, [77] * 26, [77] * 2, [77] * 26,
        [77] * 15, [97] * 3, [97] * 26, [77], [77] * 5,
        [77] * 2, [77] * 13, [77] * 117, [91] * 4, [91] * 2,
        [88] * 7,
    ]
    args = [
        packed, [-2000042, -2000022, 0, 0, 1],
        [4, 2, 1, 3, 13, 273, 1, 2], c3_state,
        precision_protocol, c3_hash[:], c3_hash[:], latches, 10,
        *multiple_work, [77] * 4, *suffix,
    ]
    return args

# Real high-precision publication is impossible until the complete C3 owner
# exists. The coordinator must return before changing any caller-owned buffer.
for precision in (153088,):
    args = coordinator(precision, False)
    before = copy.deepcopy(args)
    assert mod.pari_field3_high_precision_regulator_schedule(*args) == 7
    assert args == before

# Boundary/hash/order mutations reject before scratch or publication writes.
base = coordinator(153088, True)
for index, mutate in (
    (1, lambda value: value.__setitem__(0, value[0] + 1)),
    (2, lambda value: value.__setitem__(3, 4)),
    (4, lambda value: value.__setitem__(1, 153088)),
    (6, lambda value: value.__setitem__(0, value[0] ^ 1)),
    (0, lambda value: value.__setitem__(0, 9)),
):
    trial = copy.deepcopy(base)
    mutate(trial[index])
    if index == 0:
        trial[7] = list(mod.pari_field3_regulator_owner_latches(trial[0], 273))
    before = copy.deepcopy(trial)
    try:
        mod.pari_field3_high_precision_regulator_schedule(*trial)
    except ValueError:
        pass
    else:
        raise AssertionError(("accepted mutated C4 authority", index))
    assert trial == before

# A complete but rank-zero synthetic A is rejected and cannot publish R/L,
# C3 hash, or latches. Scratch and diagnostic state may change by contract.
trial = coordinator(192, True)
candidate_regulator, candidate_relations = trial[-10], trial[-9]
published_hash, published_latches, state = trial[-3], trial[-2], trial[-1]
status = mod.pari_field3_high_precision_regulator_schedule(*trial)
assert status != 0
assert candidate_regulator == [97] * 3
assert candidate_relations == [97] * 26
assert published_hash == [91] * 4 and published_latches == [91] * 2
assert state[5] == 0 and state[6] == 1

# Source semantics are deliberately distinct: a compute_R PRECI authorizes
# Buchall's myprecdbl transition, while getfu PRECI is terminal not_given.
retry_work, outcome = [77] * 6, [77] * 5
assert mod.pari_field3_precision_outcome(3, 0, 153088, retry_work, outcome) == 3
assert outcome == [1, 229632, 0, 0, 153088]
assert retry_work[3] == 229632
retry_work, outcome = [77] * 6, [77] * 5
assert mod.pari_field3_precision_outcome(0, 3, 153088, retry_work, outcome) == 3
assert outcome == [0, 0, 1, 3, 153088]
assert retry_work == [77] * 6
retry_work, outcome = [77] * 6, [77] * 5
assert mod.pari_field3_precision_outcome(3, 0, 192, retry_work, outcome) == 3
assert outcome[1] == 384

print(json.dumps({
    "pariDifferentialCases": 1,
    "targetPrecisionFallbackCases": 4,
    "authorityMutationCases": 5,
    "incompleteC3AtomicCases": 1,
    "syntheticCompleteRejectionCases": 1,
    "precisionOutcomeCases": 3,
}))
`;
const summary = JSON.parse(
  run("python3", ["-c", python, root, path.join(root, "src/lib")], {
    input: JSON.stringify(oracle),
  }),
);
console.log(
  JSON.stringify({
    ...summary,
    pariArchiveSha256: hash(fs.readFileSync(archive)),
    oracleTraceSha256: hash(oracleText),
    sourceSha256: hash(
      fs.readFileSync(
        path.join(__dirname, "field3_high_precision_regulator_schedule.py"),
      ),
    ),
    ubsan: true,
    heavyNativeBuild: false,
    artifactDirectory: directory,
  }),
);
