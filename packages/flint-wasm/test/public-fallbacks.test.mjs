import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

test("public Wasm fallbacks cover exact builtins and extension matrices", async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    const result = await sage.evaluate([
      "K=GF(7^2,'a')",
      "A=random_matrix(K,10)",
      "M=matrix(K,[[1,K.gen(),0],[0,1,K.gen()],[0,0,1]])",
      "[factorial(20),binomial(100,50),prime_pi(10^6),A.dimensions(),A.base_ring()==K,(A-A).is_zero(),A.transpose().transpose()==A,2*M==M+M,(-M+M).is_zero(),(M*M)[0,2]==K.gen()^2,M.det(),M.rank(),M.rref()==identity_matrix(K,3),M.right_kernel().dimension()]",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[2432902008176640000, 100891344545564193334812497256, 78498, (10, 10), True, True, True, True, True, True, 1, 3, True, 0]",
    );
  } finally {
    await sage.close();
  }
});

test("public Wasm Brandt construction has its weight-2 degeneracy map", async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    const result = await sage.evaluate(
      "B=BrandtModule(3,11); [B.discriminant(),B.level(),B.dimension()]",
    );
    assert.equal(result.repr, "[3, 33, 2]");
  } finally {
    await sage.close();
  }
});

test("public Wasm uses mathematical fallbacks for complex matrices and EC points", async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    const result = await sage.evaluate([
      "z=CDF.gen()",
      "A=matrix(CDF,[[1.2,z],[2,3]])",
      "expected=CDF(3.6,-2)",
      "E=EllipticCurve(GF(101),[0,0,0,1,1])",
      "P=E.points()[1]",
      "[A.dimensions(),(A+A-A)==A,2*A==A+A,A.transpose().transpose()==A,A.rank(),abs(A.det()-expected)<1e-12,abs((A*A)[0,0]-CDF(1.44,2))<1e-12,17*P==P._affine_scalar_mul(17)]",
    ].join("\n"));
    assert.equal(result.repr, "[(2, 2), True, True, True, 2, True, True, True]");
  } finally {
    await sage.close();
  }
});
