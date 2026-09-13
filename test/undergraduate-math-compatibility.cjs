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
      (
        await sage.evaluate(
          "repr(table([('i','v'),(0,1),(1,-2)], header_row=True))",
        )
      ).repr,
      "'  i   v\\n├───┼────┤\\n  0   1\\n  1   -2'",
    );
    assert.match(
      (
        await sage.evaluate(
          "table([('x','x^2'),(2,4)], header_row=True)._html_()",
        )
      ).repr,
      /<table class="table_form">/,
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
      (
        await sage.evaluate(
          "A=matrix([[1,2],[3,4]]); B=matrix([[5]]); block_diagonal_matrix(A,B)",
        )
      ).repr,
      "[1 2|0]\n[3 4|0]\n[---+-]\n[0 0|5]",
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
      (
        await sage.evaluate(
          [
            "var('t')",
            "r=vector((2*t-4,t^2,t^3/4))",
            "(r(t=5),r.diff(t),diff(r,t),r.diff(t).norm())",
          ].join("\n"),
        )
      ).repr,
      "((6, 25, 125/4), (2, 2*t, 3/4*t^2), (2, 2*t, 3/4*t^2), " +
        "sqrt(4*abs(t)^2 + 9/16*abs(t^2)^2 + 4))",
    );
    assert.equal(
      (
        await sage.evaluate(
          "v=vector([3,4]); (v.norm(),v/5,(v/5).n())",
        )
      ).repr,
      "(5, (3/5, 4/5), (0.6, 0.8))",
    );
    assert.equal(
      (
        await sage.evaluate(
          "G=matrix(QQ,[[1,2,3],[2,4,6]]); V=G.right_kernel(); " +
            "c=V.coordinate_vector([1,4,-3]); V.basis_matrix().transpose()*c",
        )
      ).repr,
      "(1, 4, -3)",
    );
    assert.equal(
      (
        await sage.evaluate(
          "H=matrix(QQ,[[2,0],[0,3]]); D,P=H.eigenmatrix_right(); " +
            "(sorted(D.diagonal()),P*D==H*P)",
        )
      ).repr,
      "([2, 3], True)",
    );
    assert.equal(
      (
        await sage.evaluate(
          "U=random_matrix(QQ,4,algorithm='unimodular'); abs(U.det())",
        )
      ).repr,
      "1",
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
    assert.equal(
      (await sage.evaluate("point((1,2,3))")).repr,
      "Graphics3d Object",
    );
    assert.equal(
      (
        await sage.evaluate(
          "var('t'); len(parametric_plot((cos(t),sin(t)),(t,0,2*pi),fill=True))",
        )
      ).repr,
      "2",
    );
    assert.equal(
      (
        await sage.evaluate(
          "len(polar_plot([cos(4*t)+1.5,cos(4*t)/2+2.5]," +
            "(t,0,2*pi),fill=True,fillcolor='orange'))",
        )
      ).repr,
      "4",
    );
    assert.equal(
      (
        await sage.evaluate(
          "contour_plot.options['fill']=False; a=contour_plot.options['fill']; " +
            "b=contour_plot.defaults()['fill']; (a,b)",
        )
      ).repr,
      "(False, True)",
    );
    assert.equal(
      (
        await sage.evaluate(
          "len(region_plot(sin(x)>=0,(x,-2,2),(t,-2,2),bordercol='black'))",
        )
      ).repr,
      "2",
    );
    assert.equal(
      (
        await sage.evaluate(
          "plot(cos(x),(x,0,pi/2),ticks=[[0,pi/4,pi/2],None]," +
            "tick_formatter=pi)",
        )
      ).repr,
      "Graphics object consisting of 1 graphics primitive",
    );
    assert.equal(
      (await sage.evaluate("golden_ratio == (1+sqrt(5))/2")).repr,
      "True",
    );
  } finally {
    await sage.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
