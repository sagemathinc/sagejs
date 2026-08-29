// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "classical and icosian arithmetic share the exact finite Hecke set contract",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import (
    FiniteHeckeSet,
    HilbertModularFormsQsqrt5,
    SupersingularModule,
    finite_hecke_set,
)

S = SupersingularModule(37)
classical = finite_hecke_set(S)
assert isinstance(classical, FiniteHeckeSet)
assert classical.cardinality() == 3
assert classical.mass_weights() == S.mass_weights()
assert classical.T(2) is S.T(2)
assert classical.T(3).commutes_with(classical.T(2))

H = HilbertModularFormsQsqrt5((31,19))
icosian = finite_hecke_set(H)
assert isinstance(icosian, FiniteHeckeSet)
assert icosian is H.finite_hecke_set()
assert icosian.cardinality() == 2
assert icosian.mass_weights() == (QQ(1)/10,QQ(1)/6)
assert icosian.T(2) is H.T(2)
assert icosian.T(2).matrix() == matrix(ZZ,[[0,5],[3,2]])
(classical.cardinality(),icosian.cardinality(),icosian.mass_weights())
`);
      assert.equal(result.repr, "(3, 2, (1/10, 1/6))");
    } finally {
      await session.close();
    }
  },
);

test(
  "the finite Hecke set publisher rejects wrong degrees and mass adjoints",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import FiniteHeckeSet

class BadDegree(FiniteHeckeSet):
    def __init__(self):
        FiniteHeckeSet.__init__(self)
    def cardinality(self):
        return 2
    def mass(self,index):
        return QQ(1)
    def hecke_degree(self,index):
        return 3
    def hecke_row(self,index,row):
        return ((row,2),)

class BadAdjoint(FiniteHeckeSet):
    def __init__(self):
        FiniteHeckeSet.__init__(self)
    def cardinality(self):
        return 2
    def mass(self,index):
        return (QQ(1),QQ(2))[index]
    def hecke_degree(self,index):
        return 2
    def hecke_row(self,index,row):
        return (((0,1),(1,1)),((0,1),(1,1)))[row]

out=[]
for finite in [BadDegree(),BadAdjoint()]:
    try:
        finite.T(2)
        out.append('accepted')
    except ArithmeticError:
        out.append('rejected')
out
`);
      assert.equal(result.repr, "['rejected', 'rejected']");
    } finally {
      await session.close();
    }
  },
);
