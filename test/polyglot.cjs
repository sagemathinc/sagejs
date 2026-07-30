"use strict";

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

async function output(session, language, source) {
  const result = await session.evaluate(source, { language });
  return result.stdout.trim();
}

(async () => {
  const session = await createSage();
  try {
    await session.evaluate(`
b = True
n = 2026
q = 22/7
r = 1.25
message = "shared"
values = [2, 3, 5]
primes = {2, 3, 5}
labels = {"meaning": 42}
import numpy as np
A = np.array([[1, 2], [3, 4]])
R = QQ['t']
t = R.gen()
f = t^2 + 1
expression = sin(x)^2 + cos(x)^2
graphic = plot(sin(x), (x, 0, 1))
`);
    await session.evaluate("z = 3 + 4j", { language: "python" });

    assert.equal(
      await output(
        session,
        "magma",
        [
          "Type(b); Type(n); Type(q); Type(r); Type(z); Type(message);",
          "Type(values); Type(primes); Type(labels); Type(A);",
          "Type(f); Type(expression); Type(graphic); values[2];",
        ].join("\n"),
      ),
      [
        "BoolElt",
        "RngIntElt",
        "FldRatElt",
        "FldReElt",
        "FldComElt",
        "MonStgElt",
        "SeqEnum",
        "SetEnum",
        "Assoc",
        "AlgMatElt",
        "RngUPolElt",
        "SymExpr",
        "GrphObj",
        "3",
      ].join("\n"),
    );

    assert.equal(
      await output(
        session,
        "matlab",
        [
          "size(A)",
          "class(A)",
          "numel(A)",
          "values(2)",
          "A(2,1) = 99;",
        ].join("\n"),
      ),
      ["(2, 2)", "int64", "4", "3"].join("\n"),
    );
    assert.equal(
      (await session.evaluate("(A[1, 0], values[1])")).repr,
      "(99, 3)",
    );

    assert.equal(
      await output(
        session,
        "maple",
        [
          "whattype(n); whattype(q); whattype(z); whattype(values);",
          "whattype(primes); whattype(labels); whattype(A);",
          "whattype(f); whattype(expression); whattype(graphic);",
          "nops(values);",
        ].join("\n"),
      ),
      [
        "integer",
        "fraction",
        "complex",
        "list",
        "set",
        "table",
        "Array",
        "polynom",
        "expression",
        "PLOT",
        "3",
      ].join("\n"),
    );

    assert.equal(
      await output(
        session,
        "wolfram",
        [
          "Head[n]",
          "Head[q]",
          "Head[z]",
          "Head[values]",
          "Head[primes]",
          "Head[labels]",
          "Head[A]",
          "Head[f]",
          "Head[expression]",
          "Head[graphic]",
          "Dimensions[A]",
          "Length[values]",
        ].join("\n"),
      ),
      [
        "Integer",
        "Rational",
        "Complex",
        "List",
        "Set",
        "Association",
        "NumericArray",
        "Polynomial",
        "SageExpression",
        "Graphics",
        "[2, 2]",
        "3",
      ].join("\n"),
    );

    await session.evaluate("A[0, 1] = 77", { language: "python" });
    assert.equal(await output(session, "matlab", "A(1,2)"), "77");
    assert.match(await output(session, "magma", "A;"), /77/);
    assert.match(await output(session, "maple", "A;"), /77/);
    assert.match(await output(session, "wolfram", "A"), /77/);

    assert.equal(await output(session, "magma", "Factorization(n);"), "2 * 1013");
    assert.equal(await output(session, "maple", "factor(n);"), "2 * 1013");
    assert.equal(
      await output(session, "wolfram", "FactorInteger[n]"),
      "[[2, 1], [1013, 1]]",
    );

    await assert.rejects(
      session.evaluate("values(:,1)", { language: "matlab" }),
      /shared sequences currently support one scalar MATLAB index/,
    );
  } finally {
    await session.close();
  }

  console.log("Polyglot interoperability contract passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
