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
      "Q = QuadraticField(-23)",
      "[G.order(), G.invariants(), G.proof_status, G.gen().coordinates(),",
      " G(G.gen().ideal()).coordinates(), K.class_number(algorithm='rust'),",
      " Q.class_number(algorithm='rust'), Q.class_group(algorithm='rust').invariants(),",
      " QuadraticField(-8173415).class_number(algorithm='rust')]",
    ].join("\n"));
    assert.equal(
      answer.repr,
      "[3, (3,), 'exact-unconditional', (1,), (1,), 3, 3, (3,), 4378]",
    );
  } finally {
    await sage.close();
  }
});
