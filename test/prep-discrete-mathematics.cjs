// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const sage = await createSage();
  try {
    assert.equal(
      (
        await sage.evaluate(
          "pets=['dog','cat','snake','spider']; Combinations(pets).list()",
        )
      ).repr,
      "[[], ['dog'], ['cat'], ['snake'], ['spider'], ['dog', 'cat'], " +
        "['dog', 'snake'], ['dog', 'spider'], ['cat', 'snake'], " +
        "['cat', 'spider'], ['snake', 'spider'], ['dog', 'cat', 'snake'], " +
        "['dog', 'cat', 'spider'], ['dog', 'snake', 'spider'], " +
        "['cat', 'snake', 'spider'], ['dog', 'cat', 'snake', 'spider']]",
    );
    assert.equal(
      (await sage.evaluate("Permutations(pets,2).list()")).repr,
      "[['dog', 'cat'], ['dog', 'snake'], ['dog', 'spider'], " +
        "['cat', 'dog'], ['cat', 'snake'], ['cat', 'spider'], " +
        "['snake', 'dog'], ['snake', 'cat'], ['snake', 'spider'], " +
        "['spider', 'dog'], ['spider', 'cat'], ['spider', 'snake']]",
    );
    assert.equal(
      (
        await sage.evaluate(
          "(Permutations(5).cardinality(), multinomial(24,3,5), " +
            "falling_factorial(10,4), rising_factorial(10,4))",
        )
      ).repr,
      "(120, 589024800, 5040, 17160)",
    );
    assert.equal(
      (
        await sage.evaluate(
          "Derangements([1,1,2,2,3,4,5]).list()[:5]",
        )
      ).repr,
      "[[2, 2, 1, 1, 4, 5, 3], [2, 2, 1, 1, 5, 3, 4], " +
        "[2, 2, 1, 3, 1, 5, 4], [2, 2, 1, 3, 4, 5, 1], " +
        "[2, 2, 1, 3, 5, 1, 4]]",
    );

    const setup = [
      "G=matrix(GF(2),[[1,1,1,0,0,0,0],[1,0,0,1,1,0,0]," +
        "[0,1,0,1,0,1,0],[1,1,0,1,0,0,1]])",
      "C=LinearCode(G)",
      "D=C.dual_code()",
    ].join("\n");
    assert.equal(
      (await sage.evaluate(setup + "\n(C.is_self_dual(), D, D.basis())")).repr,
      "(False, [7, 3] linear code over GF(2), " +
        "[(1, 0, 1, 0, 1, 0, 1), (0, 1, 1, 0, 0, 1, 1), " +
        "(0, 0, 0, 1, 1, 1, 1)])",
    );
    assert.equal(
      (
        await sage.evaluate(
          "R=LinearCode(matrix(GF(2),[[1,1,1]])); " +
            "(R.cardinality(), R.minimum_distance(), " +
            "R.permutation_automorphism_group().order())",
        )
      ).repr,
      "(2, 3, 6)",
    );
  } finally {
    await sage.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
