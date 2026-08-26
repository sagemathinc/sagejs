// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("number-field ideals retain their exact order and authenticated prime data", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dumps, loads",
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 - x - 1)",
    "O = K.maximal_order()",
    "I = O.ideal(2)",
    "P = O.primes_above(5)[0]",
    "answer = loads(dumps([K, O, I, P, I, P]))",
    "KK, OO, II, PP = answer[:4]",
    "print(OO.number_field() is KK, II.number_field() is KK)",
    "print(II.ring() is OO, PP.ring() is OO)",
    "print(answer[4] is II, answer[5] is PP)",
    "print(II.basis_matrix() == I.basis_matrix(), II.norm() == I.norm())",
    "print((II * II.inverse()).basis_matrix() == OO.ideal(1).basis_matrix())",
    "print(PP.basis_matrix() == P.basis_matrix())",
    "print(PP.rational_prime(), PP.ramification_index(), PP.residue_class_degree())",
    "print(PP is OO.primes_above(5)[0])",
    "L = NumberField(x^2 - x - 1, 'a')",
    "OL = L.maximal_order()",
    "try:",
    "    OL.ideal_from_dict(I.to_dict())",
    "except ValueError as error:",
    "    print('another field or order instance' in str(error))",
    "from sagejs.number_fields.prime_ideals import prime_ideal_from_dict",
    "try:",
    "    prime_ideal_from_dict(OL, P.to_dict())",
    "except ValueError as error:",
    "    print('another field instance' in str(error))",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "True True",
      "True True",
      "True True",
      "True True",
      "True",
      "True",
      "5 2 1",
      "True",
      "True",
      "True",
    ].join("\n"),
  );
});
