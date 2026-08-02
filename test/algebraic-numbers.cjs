"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("FLINT-backed AA, QQbar, polynomial roots, and eigenspaces", async () => {
  const session = await createSage();
  try {
    assert.equal((await session.evaluate("AA")).repr, "Algebraic Real Field");
    assert.equal((await session.evaluate("QQbar")).repr, "Algebraic Field");
    assert.equal((await session.evaluate("QQbar(I)")).repr, "I");
    assert.equal(
      (await session.evaluate("QQbar(sqrt(2)).minpoly()")).repr,
      "x^2 - 2",
    );
    assert.equal(
      (await session.evaluate("sqrt(3) in QQbar")).repr,
      "True",
    );
    assert.equal(
      (await session.evaluate("AA(2)^(1/2)")).repr,
      "1.414213562373095?",
    );

    assert.equal(
      (
        await session.evaluate(
          "R.<x> = QQ[]\n" +
            "[(x^2-2).roots(AA), (x^2+1).roots(AA), " +
            "(x^2+1).roots(QQbar)]",
        )
      ).repr,
      "[[(-1.414213562373095?, 1), (1.414213562373095?, 1)], " +
        "[], [(-I, 1), (I, 1)]]",
    );
    assert.equal(
      (
        await session.evaluate(
          "R.<x> = QQ[]\n((x-1)^3).roots(QQbar)",
        )
      ).repr,
      "[(1, 3)]",
    );

    assert.equal(
      (
        await session.evaluate(
          "a = AA(2).sqrt()\n" +
            "A = matrix(AA, [[a,1],[0,-a]])\n" +
            "[A.det(), A.rank(), A*A, A.inverse()*A]",
        )
      ).repr,
      "[-2, 2, [2 0]\n[0 2], [1 0]\n[0 1]]",
    );
    assert.equal(
      (
        await session.evaluate(
          "A = matrix(QQ, [[0,2],[1,0]])\n" +
            "[parent(A.eigenvalues()[0]), A.eigenvectors_right()]",
        )
      ).repr,
      "[Algebraic Field, " +
        "[(1.414213562373095?, [(1, 0.7071067811865475?)], 1), " +
        "(-1.414213562373095?, [(1, -0.7071067811865475?)], 1)]]",
    );
    assert.equal(
      (
        await session.evaluate(
          "A = matrix(QQ, [[0,0,2],[1,0,0],[0,1,0]])\n" +
            "eigenspaces = A.eigenvectors_right()\n" +
            "all(A*item[1][0] == item[0]*item[1][0] " +
            "for item in eigenspaces)",
        )
      ).repr,
      "True",
    );
    assert.equal(
      (
        await session.evaluate(
          "K = CyclotomicField(5)\n" +
            "z = K.gen()\n" +
            "A = matrix(K, [[1,z,0,1+z,2,z^2]," +
            "[0,1,1,z,1-z,z^3]])\n" +
            "B = A.right_kernel_matrix()\n" +
            "L = matrix(K, [[1,0,z,0],[0,0,0,1],[z^2,0,0,0]])\n" +
            "R = matrix(K, [[z,1],[2,1-z],[0,z^3],[1,0]])\n" +
            "[B.nrows(), B.ncols(), B.rank(), " +
            "(A*B.transpose()).is_zero(), B == B.rref(), " +
            "B.pivots(), " +
            "B.matrix_from_columns([0,1,2,3]), " +
            "L._sparse_left_multiply(R) == L*R]",
        )
      ).repr,
      "[4, 6, 4, True, True, (0, 1, 2, 3), " +
        "[1 0 0 0]\n[0 1 0 0]\n" +
        "[0 0 1 0]\n[0 0 0 1], True]",
    );
  } finally {
    await session.close();
  }
});
