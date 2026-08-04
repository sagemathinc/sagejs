"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage();
  try {
    assert.equal((await session.evaluate("x")).repr, "x");
    assert.equal((await session.evaluate("parent(x)")).repr, "Symbolic Ring");
    assert.equal(
      (await session.evaluate("type(x)")).repr,
      "<class 'sage.symbolic.expression.Expression'>",
    );
    assert.equal((await session.evaluate("f = sin(x^2)\nf")).repr, "sin(x^2)");
    assert.equal((await session.evaluate("f.subs(x=2)")).repr, "sin(4)");
    assert.equal(
      (await session.evaluate("f.derivative(x)")).repr,
      "2*x*cos(x^2)",
    );
    assert.equal(
      (await session.evaluate("fast_callable(f, vars=[x])(2)")).repr,
      "-0.7568024953079282",
    );
    assert.equal(
      (await session.evaluate("fast_callable(e^(x/2), vars=[x])(2)")).repr,
      String(Math.E),
    );
    assert.equal(
      (await session.evaluate("(x^2).integrate(x, 0, 1)")).repr,
      "1/3",
    );
    assert.equal(
      (await session.evaluate("(x^2).integral((x, 0, 1))")).repr,
      "1/3",
    );
    assert.equal(
      (
        await session.evaluate(
          "integral(log(x)*x, (x, 2, 10))",
        )
      ).repr,
      "-24 - 2*log(2) + 50*log(10)",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "value, error = numerical_integral(exp(x^2), 1, 2)",
            "(abs(value - 14.989976019600048) < 1e-12, error < 1e-10)",
          ].join("\n"),
        )
      ).repr,
      "(True, True)",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "quadrature_value, quadrature_error = numerical_integral(",
            "    lambda t: abs(t - 0.1), 0, 1,",
            "    eps_abs=1e-12, eps_rel=1e-12)",
            "(abs(quadrature_value - 0.41) < 1e-12, quadrature_error < 1e-12)",
          ].join("\n"),
        )
      ).repr,
      "(True, True)",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "parameterized(t, a) = 1/(a + t^2)",
            "parameter_value = numerical_integral(",
            "    parameterized, 1, 2, params=[1])[0]",
            "abs(parameter_value - 0.3217505543966422) < 1e-12",
          ].join("\n"),
        )
      ).repr,
      "True",
    );
    assert.equal(
      (await session.evaluate("numerical_integral(2, [1,7]) == (12,0)")).repr,
      "True",
    );
    assert.equal(
      (await session.evaluate("numerical_integral(log, 0, 0) == (0,0)")).repr,
      "True",
    );
    await assert.rejects(
      session.evaluate("numerical_integral(x, 0, 1, algorithm='unknown')"),
      /invalid integration algorithm/,
    );
    await assert.rejects(
      session.evaluate("y=var('y'); numerical_integral(x*y, 0, 1)"),
      /depends on 2 variables/,
    );
    assert.equal(
      (
        await session.evaluate(
          "limit(sin(2*x)/tan(3*x), x=0)",
        )
      ).repr,
      "2/3",
    );
    assert.equal(
      (await session.evaluate("(sin(x)/x).limit(x, 0)")).repr,
      "1",
    );
    assert.equal(
      (await session.evaluate("limit(1/x, x=0, dir='right')")).repr,
      "+Infinity",
    );
    await assert.rejects(
      session.evaluate("limit(sin(x)/x, x=0, algorithm='sympy')"),
      /limit algorithm 'sympy' is not implemented/,
    );
    assert.ok(
      Math.abs(
        Number((await session.evaluate("(x^2 - 2).find_root(1, 2)")).repr) -
          Math.SQRT2,
      ) < 1e-10,
    );
    assert.equal((await session.evaluate("x + 1")).repr, "x + 1");
    assert.equal((await session.evaluate("QQ(1, 2)*x")).repr, "1/2*x");
    assert.equal((await session.evaluate("sqrt(QQ(10))")).repr, "sqrt(10)");
    assert.equal((await session.evaluate("QQ(9, 4).sqrt()")).repr, "3/2");
    await assert.rejects(session.evaluate("QQ(10).sqrt()"), /not a square/);
    assert.equal((await session.evaluate("var('x y')")).repr, "(x, y)");
    assert.equal((await session.evaluate("pi")).repr, "pi");
    assert.equal((await session.evaluate("e")).repr, "e");
    assert.equal((await session.evaluate("I")).repr, "I");
    assert.equal((await session.evaluate("i")).repr, "I");
    assert.equal((await session.evaluate("bool(x < 2)")).repr, "False");
    assert.equal(
      (await session.evaluate("x,y,z = var('x,y,z')\nx+y+z")).repr,
      "x + y + z",
    );
    assert.equal(
      (await session.evaluate("g(x) = x^2\ng")).repr,
      "x |--> x^2",
    );
    assert.equal(
      (
        await session.evaluate(
          "fresh_symbol(tau) = tau^2\n" +
            "(fresh_symbol, parent(tau), fresh_symbol(5))",
        )
      ).repr,
      "(tau |--> tau^2, Symbolic Ring, 25)",
    );
    assert.equal((await session.evaluate("g(3)")).repr, "9");
    assert.equal(
      (await session.evaluate("g.derivative()")).repr,
      "x |--> 2*x",
    );
    assert.equal(
      (await session.evaluate("g.arguments()")).repr,
      "(x,)",
    );
    assert.equal(
      (
        await session.evaluate(
          "b,c=var('b,c')\nsolve(x^2+b*x+c==0, x)",
        )
      ).repr,
      "[x == -1/2*b - 1/2*sqrt(b^2 - 4*c), " +
        "x == -1/2*b + 1/2*sqrt(b^2 - 4*c)]",
    );
    assert.equal(
      (
        await session.evaluate(
          "x,y=var('x,y')\nsolve([x+y==6,x-y==4],x,y)",
        )
      ).repr,
      "[[x == 5, y == 1]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "var('x y p q')",
            "eq1 = p+q == 9",
            "eq2 = q*y+p*x == -6",
            "eq3 = q*y^2+p*x^2 == 24",
            "solve([eq1,eq2,eq3,p==1],p,q,x,y)",
          ].join("\n"),
        )
      ).repr,
      "[[p == 1, q == 8, x == -2/3 - 4/3*sqrt(10), " +
        "y == -2/3 + sqrt(10)/6], " +
        "[p == 1, q == 8, x == -2/3 + 4/3*sqrt(10), " +
        "y == -2/3 - sqrt(10)/6]]",
    );
    assert.equal(
      (await session.evaluate("SR(1).n(30)")).repr,
      "1.0000000",
    );
    assert.equal(
      (
        await session.evaluate(
          "t=var('t')\n" +
            "u=function('u')(t)\n" +
            "desolve(diff(u,t)+u-1,[u,t])",
        )
      ).repr,
      "(_C + e^t)*e^(-t)",
    );
    assert.equal(
      (
        await session.evaluate(
          "x=var('x')\n" +
            "y=function('y')(x)\n" +
            "desolve(diff(y,x)+y-1,y,ics=[10,2])",
        )
      ).repr,
      "(e^10 + e^x)*e^(-x)",
    );
    assert.equal(
      (
        await session.evaluate(
          "x=var('x')\n" +
            "y=function('y')(x)\n" +
            "de=diff(y,x,2)-y==x\n" +
            "desolve(de,y)",
        )
      ).repr,
      "_K2*e^(-x) + _K1*e^x - x",
    );
    assert.equal(
      (
        await session.evaluate(
          "x=var('x')\n" +
            "y=function('y')(x)\n" +
            "de=diff(y,x,2)-y==x\n" +
            "f=desolve(de,y,ics=[10,2,1])\n" +
            "(f(x=10), derivative(f,x)(x=10))",
        )
      ).repr,
      "(2, 1)",
    );
    assert.equal(
      (
        await session.evaluate(
          "s=var('s')\n" +
            "f=t^2*exp(t)-sin(t)\n" +
            "f.laplace(t,s).simplify_rational()",
        )
      ).repr,
      "-(s^3 - 5*s^2 + 3*s - 3)/" +
        "(s^5 - 3*s^4 + 4*s^3 - 4*s^2 + 3*s - 1)",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "t,s=SR.var('t,s')",
            "u=function('u')",
            "v=function('v')",
            "f=2*u(t).diff(t,2)+6*u(t)-2*v(t)",
            "f.laplace(t,s)",
          ].join("\n"),
        )
      ).repr,
      "2*s^2*laplace(u(t), t, s) - 2*s*u(0) + " +
        "6*laplace(u(t), t, s) - 2*laplace(v(t), t, s) - " +
        "2*D[0](u)(0)",
    );
    assert.equal(
      (
        await session.evaluate(
          "inverse_laplace((3*s^3+15*s)/(s^4+5*s^2+4),s,t)",
        )
      ).repr,
      "-cos(2*t) + 4*cos(t)",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            'de2=maxima("diff(y(t),t, 2) + 2*y(t) - 2*x(t)")',
            'de2.laplace("t","s").sage()',
          ].join("\n"),
        )
      ).repr,
      "s^2*laplace(y(t), t, s) - s*y(0) - " +
        "2*laplace(x(t), t, s) + 2*laplace(y(t), t, s) - " +
        "D[0](y)(0)",
    );
    assert.equal(
      (
        await session.evaluate(
          'maxima.eval("f:bessel_y(v,w)")\n' +
            'maxima.eval("diff(f,w)")',
        )
      ).repr,
      "'(bessel_y(v-1,w)-bessel_y(v+1,w))/2'",
    );
    assert.equal(
      (
        await session.evaluate(
          "x=var('x')\nsolve(sin(x)*cos(x)==0.1,x)",
        )
      ).repr,
      "[sin(x) == 1/10/cos(x)]",
    );
    assert.equal(
      (await session.evaluate("function('f')(x)")).repr,
      "f(x)",
    );
    assert.equal((await session.evaluate("log(8, 2)")).repr, "3");
    assert.equal((await session.evaluate("floor(log(17, 2))")).repr, "4");
    assert.equal(
      (
        await session.evaluate(
          "f = 1/((1+x)*(x-1))\nf.partial_fraction(x)",
        )
      ).repr,
      "-1/2/(x + 1) + 1/2/(x - 1)",
    );
    assert.equal(
      (await session.evaluate("float(pi)")).repr,
      "3.141592653589793",
    );
    assert.equal(
      (await session.evaluate("bessel_I(1,1).n(250)")).repr,
      "0.56515910399248502720769602760986330732889962162109200948029448947925564096",
    );

    const plotted = await session.evaluate(
      [
        "plot(sin(x^2), (x, 0, 2*pi),",
        "     plot_points=3, adaptive_recursion=0, randomize=False)",
      ].join("\n"),
    );
    assert.equal(plotted.display?.mime, "application/vnd.plotly.v1+json");
    assert.deepEqual(plotted.display?.data.data[0].x, [
      0,
      Math.PI,
      2 * Math.PI,
    ]);
    assert.deepEqual(plotted.display?.data.data[0].y, [
      0,
      Math.sin(Math.PI ** 2),
      Math.sin((2 * Math.PI) ** 2),
    ]);

    await session.evaluate("R.<x> = QQ[]");
    assert.equal(
      (await session.evaluate("sin(x)")).repr,
      "sin(x)",
    );
    assert.equal(
      (await session.evaluate("SR((x + 1)^2)")).repr,
      "x^2 + 2*x + 1",
    );
    const polynomialVariablePlot = await session.evaluate(
      [
        "plot(sin(x), (x, 0, 4*pi),",
        "     plot_points=3, adaptive_recursion=0, randomize=False)",
      ].join("\n"),
    );
    assert.equal(
      polynomialVariablePlot.display?.mime,
      "application/vnd.plotly.v1+json",
    );
    assert.deepEqual(polynomialVariablePlot.display?.data.data[0].x, [
      0,
      2 * Math.PI,
      4 * Math.PI,
    ]);
  } finally {
    await session.close();
  }

  const pythonSession = await createSage({ mode: "python" });
  try {
    await assert.rejects(
      pythonSession.evaluate("x"),
      /x is not defined/,
    );
  } finally {
    await pythonSession.close();
  }

  console.log("Cortex-backed symbolic expression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
