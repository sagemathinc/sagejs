// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("portable character Hecke agrees entrywise with the native adapter", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(`
from sagejs.modular_forms.character_hecke import character_hecke_matrix
cases = [(12,7,3), (13,4,2), (5,2,3), (9,4,4), (25,4,2)]
checked = 0
degrees = set()
for level, conrey, weight in cases:
    chi = [c for c in DirichletGroup(level) if c.conrey_number() == conrey][0]
    for sign in [-1,0,1]:
        M = ModularSymbols(chi, weight, sign=sign)
        K = M.base_ring()
        degrees.add(1 if K == QQ else K.degree())
        P = M.p1list()
        R = P.character_presentation(weight, sign, chi, K)
        for p in sorted(set([2,3,prime_divisors(level)[0]])):
            portable = character_hecke_matrix(P, weight, chi, K, p, R)
            native = P.character_hecke_matrix(weight, sign, chi, K, p)
            assert portable == native, (level,conrey,weight,sign,p,portable,native)
            assert portable.nrows() == R.dimension()
            checked += 1
print(checked, sorted(degrees))
`, { timeout: 120000 });
  assert.equal(result.stdout.trim(), "39 [1, 2, 4]");
});

test("portable character action handles parity-zero presentations", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(`
from sagejs.modular_forms.character_hecke import character_hecke_matrix
chi = [c for c in DirichletGroup(5) if c.order()==4][0]
P = P1List(5)
K = CyclotomicField(4)
R = P.character_presentation(2, 1, chi, K)
A = character_hecke_matrix(P, 2, chi, K, 2, R)
[R.dimension(), A.nrows(), A.ncols()]
`);
  assert.equal(result.repr, "[0, 0, 0]");
});
