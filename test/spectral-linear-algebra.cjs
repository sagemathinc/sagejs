"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("FLINT-backed exact and approximate spectral linear algebra", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "matrix([[0, 4], [-1, 0]]).eigenvalues()",
        )
      ).repr,
      "[-2*I, 2*I]",
    );
    assert.equal(
      (
        await session.evaluate(
          "matrix([[1, 3], [3, 1]]).eigenvectors_left()",
        )
      ).repr,
      "[(4, [(1, 1)], 1), (-2, [(1, -1)], 1)]",
    );

    const realEigenvalues = JSON.parse(
      (
        await session.evaluate(
          "matrix(RDF, [[1.2, 2], [3, 4.1]]).eigenvalues()",
        )
      ).repr,
    );
    assert.ok(
      Math.abs(realEigenvalues[0] + 0.1964890654980568) < 1e-14,
    );
    assert.ok(
      Math.abs(realEigenvalues[1] - 5.496489065498056) < 1e-14,
    );
    assert.equal(
      (
        await session.evaluate(
          "parent(matrix(RDF, [[0, -1], [1, 0]]).eigenvalues()[0])",
        )
      ).repr,
      "Complex Double Field",
    );
    assert.equal(
      (
        await session.evaluate(
          "matrix(RDF, [[1.2, 2], [3, 4.1]]).echelon_form()",
        )
      ).repr,
      "[1 0]\n[0 1]",
    );

    const complexEigenvalues = await session.evaluate(
      [
        "A = matrix(CDF, [[1.2, I], [2, 3]])",
        "[[float(v.real()), float(v.imag())] for v in A.eigenvalues()]",
      ].join("\n"),
    );
    assert.deepEqual(
      JSON.parse(complexEigenvalues.repr),
      [
        [0.8818456983293742, -0.8209140653434133],
        [3.3181543016706256, 0.8209140653434133],
      ],
    );
    assert.equal(
      (
        await session.evaluate(
          "E = A.eigenvectors_right()\n" +
            "[len(E), len(E[0][1]), E[0][2], " +
            "len(E[1][1]), E[1][2]]",
        )
      ).repr,
      "[2, 1, 1, 1, 1]",
    );
  } finally {
    await session.close();
  }
});
