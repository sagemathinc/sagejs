// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const sage = await createSage();
  try {
    assert.equal((await sage.evaluate("lim is limit")).repr, "True");
    assert.equal(
      (await sage.evaluate("det(matrix([[1,2],[3,4]]))")).repr,
      "-2",
    );
    assert.equal(
      (
        await sage.evaluate(
          "a=[1,[2]]; b=copy(a); (a == b, a is b, a[1] is b[1])",
        )
      ).repr,
      "(True, False, True)",
    );
    assert.equal(
      (await sage.evaluate("(mod(12,5), parent(mod(12,5)), mod(10,0))"))
        .repr,
      "(2, Ring of integers modulo 5, 10)",
    );
    assert.equal(
      (await sage.evaluate("(sinh(x), sec(x), csc(x), cot(x))")).repr,
      "(sinh(x), sec(x), csc(x), cot(x))",
    );
    assert.equal(
      (await sage.evaluate("list(fibonacci_sequence(3,8))")).repr,
      "[2, 3, 5, 8, 13]",
    );

    assert.equal(
      (await sage.evaluate("matrix(2, [[1,2],[3,4]])")).repr,
      "[1 2]\n[3 4]",
    );
    assert.equal(
      (await sage.evaluate("column_matrix(QQ, [[1,2,3],[4,5,6]])")).repr,
      "[1 4]\n[2 5]\n[3 6]",
    );
    assert.equal(
      (
        await sage.evaluate(
          [
            "F1=matrix(QQ,[[0,1],[1,0]])",
            "F2=matrix(QQ,[[1,2],[3,4]])",
            "F3=matrix(QQ,[[3,1]])",
            "block_matrix(2,2,[F1,F2,0,F3]).list()",
          ].join("\n"),
        )
      ).repr,
      "[0, 1, 1, 2, 1, 0, 3, 4, 0, 0, 3, 1]",
    );

    assert.equal(
      (await sage.evaluate("solve([x^2==1,x^3==1],x)")).repr,
      "[[x == 1]]",
    );
    assert.equal(
      (await sage.evaluate("var('n k'); sum(k^2,k,1,n)")).repr,
      "1/3*n^3 + 1/2*n^2 + 1/6*n",
    );
    assert.equal(
      (await sage.evaluate("var('n'); sum((1/3)^n,n,0,oo)")).repr,
      "3/2",
    );
    assert.equal(
      (await sage.evaluate("var('n k'); sum(binomial(n,k),k,0,n)")).repr,
      "2^n",
    );

    assert.equal(
      (
        await sage.evaluate(
          "f(x,y)=x^2+x*y+y^2-6*x+2; (f.gradient(), f.hessian().det())",
        )
      ).repr,
      "(((x, y) |--> 2*x + y - 6, (x, y) |--> x + 2*y), (x, y) |--> 3)",
    );
    assert.equal(
      (
        await sage.evaluate(
          "x,y,z=var('x y z'); vector([x,y,z]).cross_product(vector([1,2,3]))",
        )
      ).repr,
      "(3*y - 2*z, -3*x + z, 2*x - y)",
    );
    assert.equal(
      (await sage.evaluate("x,y=var('x y'); jacobian([x^2,y^2],[x,y])"))
        .repr,
      "[2*x   0]\n[  0 2*y]",
    );

    assert.equal(
      (
        await sage.evaluate(
          "y=function('y')(x); desolve(diff(y,x)+y-2,y,ics=[0,3])",
        )
      ).repr,
      "e^(-x) + 2",
    );
    assert.equal(
      (
        await sage.evaluate(
          "y=function('y')(x); desolve(diff(y,x)==x*y,y)",
        )
      ).repr,
      "_C/e^(-1/2*x^2)",
    );
    assert.equal(
      (
        await sage.evaluate(
          "a,b=var('a b'); f(a,b)=a^3*b^2; f.diff(a,2,b)",
        )
      ).repr,
      "(a, b) |--> 12*a*b",
    );
    assert.equal(
      (
        await sage.evaluate(
          "y=function('y')(x); desolve(diff(y,x,2)-y==x,y)",
        )
      ).repr,
      "_K2*e^(-x) + _K1*e^x - x",
    );
    await assert.rejects(
      sage.evaluate(
        "y=function('y')(x); desolve(y^2+diff(y,x)==0,y)",
      ),
      /not in either supported family/,
    );

    assert.equal(
      (
        await sage.evaluate(
          "parametric_plot((x^2,sin(x),cos(x)),(x,0,pi))",
        )
      ).repr,
      "Graphics3d Object",
    );
  } finally {
    await sage.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
