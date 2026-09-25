import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

test("public imaginary quadratic class groups retain exact ideals in Wasm", async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    const answer = await sage.evaluate([
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^2 + 23)",
      "G = K.class_group(algorithm='rust')",
      "w = (1+a)/2",
      "I = K.ideal(2, w)",
      "J = K.ideal(3, w)",
      "Q = QuadraticField(-23)",
      "[G.order(), G.invariants(), G.proof_status, G.gen().coordinates(),",
      " G(G.gen().ideal()).coordinates(), G(I).coordinates(),",
      " G(J).coordinates(), G(I*J).coordinates(),",
      " K.class_number(algorithm='rust'),",
      " Q.class_number(algorithm='rust'), Q.class_group(algorithm='rust').invariants(),",
      " QuadraticField(-8173415).class_number(algorithm='rust')]",
    ].join("\n"));
    assert.equal(
      answer.repr,
      "[3, (3,), 'exact-unconditional', (1,), (1,), (1,), (2,), (0,), 3, 3, (3,), 4378]",
    );
  } finally {
    await sage.close();
  }
});

test("large public imaginary class maps cross the Wasm boundary exactly", async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    const answer = await sage.evaluate([
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^2-x+2043354)",
      "G = K.class_group(algorithm='rust')",
      "[G.order(), G.invariants(), G.proof_status,",
      " G(G.gen().ideal()).coordinates(),",
      " G((G.gen()^2).ideal()).coordinates(),",
      " G((G.gen()^17).ideal()).coordinates()]",
    ].join("\n"));
    assert.equal(
      answer.repr,
      "[4378, (4378,), 'exact-unconditional', (1,), (2,), (17,)]",
    );
  } finally {
    await sage.close();
  }
});
