"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  compileKernel,
} = require("../../tools/native-kernel/compiler.cjs");

(async () => {
  const pari = path.resolve(process.argv[2]);
  const lib = path.join(pari, "Olinux-x86_64");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-smooth-factor-"));
  const source = path.join(dir, "oracle.c");
  const exe = path.join(dir, "oracle");
  fs.writeFileSync(
    source,
    `#include <pari.h>
#include <paripriv.h>
int main(void) {
  pari_init(64000000, 10000);
  GEN products = prodprimes();
  printf("%lu", maxprimelim());
  for (long i = 1; i <= pari_PRIMES[0]; i++) printf(" %lu", pari_PRIMES[i]);
  puts("");
  for (long i = 1; i < lg(products); i++) {
    char *s = GENtostr(gel(products, i));
    printf("%s%s", i == 1 ? "" : " ", s);
    pari_free(s);
  }
  puts("");
  char input[512];
  while (scanf("%511s", input) == 1) {
    pari_sp av = avma;
    GEN n = gp_read_str(input), f = absZ_factor(n);
    for (long i = 1; i < lg(gel(f, 1)); i++) {
      char *p = GENtostr(gel(gel(f, 1), i));
      printf("%s%s %ld", i == 1 ? "" : " ", p, itos(gel(gel(f, 2), i)));
      pari_free(p);
    }
    puts("");
    avma = av;
  }
  pari_close();
  return 0;
}
`,
  );
  const cc = spawnSync(
    "cc",
    [
      "-O2",
      "-I" + path.join(pari, "src/headers"),
      "-I" + lib,
      source,
      "-L" + lib,
      "-Wl,-rpath," + lib,
      "-lpari",
      "-o",
      exe,
    ],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(cc.status, 0, cc.stderr);
  const inputs = [
    153478191335764572837n,
    2n ** 80n * 3n ** 12n * 7523n,
    3n ** 48n * 7n ** 7n * 37n,
  ];
  const run = spawnSync(exe, [], {
    input: inputs.join("\n") + "\n",
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trim().split("\n");
  const [primeLimit, ...primeWords] = lines[0].split(" ");
  const primes = primeWords.map(BigInt);
  const products = lines[1].split(" ").map(BigInt);
  const expected = lines.slice(2).map((line) => line.split(" ").map(BigInt));
  const factorProduct = 2n * products.at(-1);

  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import decimal,importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname, "../.."))},${JSON.stringify(path.resolve(__dirname, "../../src/lib"))}]
factor=importlib.import_module('bench.pari-class-group-port.factorization').pari_smooth_factor_from_catalog
admit=importlib.import_module('bench.pari-class-group-port.admission').pari_prepared_factor_norm
d=json.load(sys.stdin); result=[]
for value in map(int,d['inputs']):
    p=[0]*32;e=[0]*32
    count,residual=factor(value,list(map(int,d['primes'])),p,e,0)
    q=[0]*32;x=[0]*32
    stage,acount,aresidual=admit(value,int(d['factorProduct']),list(map(int,d['primes'])),list(map(int,d['products'])),0,int(d['primeLimit']),q,x)
    result.append([[str(count),str(residual)],list(map(str,p)),list(map(str,e)),[str(stage),str(acount),str(aresidual)],list(map(str,q)),list(map(str,x))])
print(json.dumps(result))
`,
    ],
    {
      input: JSON.stringify({
        inputs: inputs.map(String),
        primes: primes.map(String),
        products: products.map(String),
        factorProduct: String(factorProduct),
        primeLimit,
      }),
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(python.status, 0, python.stderr);
  const reference = JSON.parse(python.stdout).map((row) =>
    row.map((part) => part.map(BigInt)),
  );
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "admission.py"),
  });
  const mod = require(built.modulePath);
  for (let i = 0; i < inputs.length; i++) {
    const factors = expected[i];
    for (const backend of ["javascript", "gmp", "tagged"]) {
      const p = Array(32).fill(0n);
      const e = Array(32).fill(0n);
      const direct = mod.pari_smooth_factor_from_catalog[backend](
        inputs[i],
        primes,
        p,
        e,
        0n,
      );
      const q = Array(32).fill(0n);
      const x = Array(32).fill(0n);
      const admission = mod.pari_prepared_factor_norm[backend](
        inputs[i],
        factorProduct,
        primes,
        products,
        0n,
        BigInt(primeLimit),
        q,
        x,
      );
      assert.deepEqual([direct, p, e, admission, q, x], reference[i]);
      assert.deepEqual(admission, [3n, BigInt(factors.length / 2), 1n]);
      assert.deepEqual(
        q.slice(0, factors.length / 2).flatMap((prime, j) => [prime, x[j]]),
        factors,
      );
    }
  }
  console.log(
    `${inputs.length} arbitrary-precision smooth norms match PARI absZ_factor and CPython/JS/GMP/tagged admission`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
