import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

const productionLayout = JSON.parse(readFileSync(
  new URL("../release/production-layout.json", import.meta.url),
  "utf8",
));
const distributed = productionLayout.modules.some(({ id }) => id === "class-group");

test("the public Wasm kernel declines the unapproved Rust class-group reactor", {
  skip: distributed && "the public package includes the class-group reactor",
}, async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    await assert.rejects(
      sage.evaluate([
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^2 + 23)",
        "K.class_group(algorithm='rust')",
      ].join("\n")),
      (error) => error?.name === "RustClassGroupCapabilityDecline" &&
        /reactor is unavailable/.test(error.message),
    );
  } finally {
    await sage.close();
  }
});

// These acceptance cases activate automatically when the reviewed production
// layout includes the class-group reactor.
const pendingPublicDistribution = {
  skip: !distributed && "class-group reactor has not cleared distribution eligibility",
};

test("public imaginary quadratic class groups retain exact ideals in Wasm", pendingPublicDistribution, async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    const answer = await sage.evaluate([
      "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^2 + 23)",
      "G = K.class_group(algorithm='rust')",
      "A = K.class_group()",
      "w = (1+a)/2",
      "I = K.ideal(2, w)",
      "J = K.ideal(3, w)",
      "Q = QuadraticField(-23)",
      "[G.order(), G.invariants(), G.proof_status, G.gen().coordinates(),",
      " G(G.gen().ideal()).coordinates(), G(I).coordinates(),",
      " G(J).coordinates(), G(I*J).coordinates(),",
      " K.class_number(algorithm='rust'),",
      " K.class_number(), A.algorithm, A(G.gen().ideal()).coordinates(),",
      " Q.class_number(algorithm='rust'), Q.class_group(algorithm='rust').invariants(),",
      " QuadraticField(-8173415).class_number(algorithm='rust'),",
      " 'completeClassMapCorePacked' in rust_runtime.rust_imaginary_result(",
      " K, operation='imaginary-class-group', algorithm='rust')]",
    ].join("\n"));
    assert.equal(
      answer.repr,
      "[3, (3,), 'exact-unconditional', (1,), (1,), (1,), (2,), (0,), 3, 3, 'rust', (1,), 3, (3,), 4378, True]",
    );
  } finally {
    await sage.close();
  }
});

test("large public imaginary class maps cross the Wasm boundary exactly", pendingPublicDistribution, async () => {
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

test("medium-band imaginary class maps remain exact in Wasm", pendingPublicDistribution, async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    const answer = await sage.evaluate([
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^2-x+25000000001)",
      "G = K.class_group(algorithm='rust')",
      "[G.order(), G.invariants(), G.proof_status,",
      " G(G.gen().ideal()).coordinates(),",
      " G((G.gen()^17).ideal()).coordinates()]",
    ].join("\n"));
    assert.equal(
      answer.repr,
      "[31057, (31057,), 'exact-unconditional', (1,), (17,)]",
    );
  } finally {
    await sage.close();
  }
});

test("noncyclic medium-band ideal classes retain both coordinates in Wasm", pendingPublicDistribution, async () => {
  const sage = await createSage({ timeout: 120_000 });
  try {
    const answer = await sage.evaluate([
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^2-x+3750000079)",
      "G = K.class_group(algorithm='rust')",
      "I = G.gen(0).ideal()",
      "J = G.gen(1).ideal()",
      "[G.order(), G.invariants(), G.proof_status,",
      " G(G.gen(0).ideal()).coordinates(),",
      " G(G.gen(1).ideal()).coordinates(),",
      " G((G.gen(0)*G.gen(1)^17).ideal()).coordinates(),",
      " G(I*J).coordinates(), G(2*I).coordinates()]",
    ].join("\n"));
    assert.equal(
      answer.repr,
      "[33768, (2, 16884), 'exact-unconditional', (1, 0), (0, 1), (1, 17), (1, 1), (1, 0)]",
    );
  } finally {
    await sage.close();
  }
});
