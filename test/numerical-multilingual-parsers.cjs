#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

process.env.SAGEJS_NATIVE_DISABLE = "1";

const { createForeignFrontend } = require("../dist/tools/foreign");
const { createSage } = require("../dist/tools/kernel.js");

function closeTo(actual, expected, tolerance = 1e-11) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
}

test("MATLAB numerical heads lower to their owned runtime wrappers", async () => {
  const frontend = await createForeignFrontend("matlab");
  const cases = [
    ["arrayfun(@(x) x^2,[1 2])", "arrayfun"],
    ["conv([1 2],[3 4])", "conv"],
    ["fminbnd(@(x) (x-2)^2,0,4)", "fminbnd"],
    ["fminsearch(@(x) (x(1)-2)^2,[0])", "fminsearch"],
    ["fsolve(@(x) x,[1])", "fsolve"],
    ["integral(@(x) x^2,0,1)", "integral"],
    ["linsolve([3 1;1 2],[9;8])", "linsolve"],
    ["lsqminnorm([1 0;0 1],[2;3])", "lsqminnorm"],
    ["lsqnonlin(@(x) x,[1])", "lsqnonlin"],
    ["ode45(@(t,y) y,[0 1],[1])", "ode45"],
    ["polyfit([0 1 2],[1 3 5],1)", "polyfit"],
    ["sagejs_describe([1 2 3])", "sagejs_describe"],
    ["svd([3 1;1 2])", "svd"],
  ];
  for (const [source, target] of cases) {
    const lowering = frontend.lower(source, { captureResult: true });
    assert.match(lowering.source, new RegExp(`_matlab\\.${target}\\(`), source);
  }

  const convolution = frontend.lower("conv([1 2],[3 4])", {
    captureResult: true,
  });
  assert.match(convolution.source, /_matlab\.conv\(/);
  assert.doesNotMatch(convolution.source, /_np\.ravel/);
  const sweep = frontend.lower("arrayfun(@(x) x^2,[1 2;3 4])", {
    captureResult: true,
  });
  assert.doesNotMatch(sweep.source, /_np\.ravel/);
});

test("MATLAB numerical syntax fails closed before unqualified runtime calls", async () => {
  const frontend = await createForeignFrontend("matlab");
  for (const name of [
    "eig",
    "fft",
    "fitlm",
    "griddedInterpolant",
    "spline",
    "ttest",
    "ttest2",
  ]) {
    assert.throws(
      () => frontend.lower(`${name}([1 2 3])`, { captureResult: true }),
      (error) => {
        assert.equal(error.name, "MatlabSyntaxError");
        assert.match(error.message, /numerical syntax is not supported/);
        return true;
      },
    );
  }
});

test("Wolfram numerical heads lower only when argument semantics are preserved", async () => {
  const frontend = await createForeignFrontend("wolfram");
  const direct = [
    ["LinearSolve[{{3,1},{1,2}},{9,8}]", "LinearSolve"],
    ["LeastSquares[{{1,0},{0,1}},{2,3}]", "LeastSquares"],
    ["SageJSDescribe[{1,2,3,4}]", "SageJSDescribe"],
    ["OneSampleTTest[{1,2,3},2]", "OneSampleTTest"],
    ["TwoSampleTTest[{1,2,3},{2,3,4}]", "TwoSampleTTest"],
    ["LinearModelFitData[{1,2,3},{2,4,6}]", "LinearModelFitData"],
    ["Map[f,{1,2,3}]", "Map"],
  ];
  for (const [source, target] of direct) {
    const lowering = frontend.lower(source, { captureResult: true });
    assert.match(lowering.source, new RegExp(`_wolfram\\.${target}\\(`), source);
  }

  const integral = frontend.lower("NIntegrate[x^2,{x,0,1}]", {
    captureResult: true,
  });
  assert.match(integral.source, /_wolfram\.NIntegrate\(lambda x:/);
  assert.match(integral.source, /, 0, 1\)/);

});

test("Wolfram numerical syntax fails closed outside qualified slices", async () => {
  const frontend = await createForeignFrontend("wolfram");
  for (const [source, diagnostic] of [
    [
      "Interpolation[{{0,0},{1,1}}]",
      "Interpolation numerical syntax is not supported",
    ],
    [
      "NDSolveValue[f,{0,1},{1}]",
      "NDSolveValue numerical syntax is not supported",
    ],
    [
      "NonlinearLeastSquares[f,{0}]",
      "NonlinearLeastSquares numerical syntax is not supported",
    ],
    [
      "Fourier[{1,2,3}]",
      "Fourier numerical syntax is not supported",
    ],
    [
      "Eigensystem[{{3,1},{1,2}}]",
      "Eigensystem numerical syntax is not supported",
    ],
    [
      "NIntegrate[x,{x,a,1}]",
      "NIntegrate currently requires {variable, finiteNumericLower, finiteNumericUpper}",
    ],
    [
      "NIntegrate[x+y,{x,0,1}]",
      "NIntegrate expressions contain unsupported free symbol y",
    ],
    [
      "NIntegrate[Sin[x,1],{x,0,1}]",
      "NIntegrate expressions require supported unary numerical functions",
    ],
    [
      "NIntegrate[x,{x,0,1.*^9999}]",
      "NIntegrate currently requires {variable, finiteNumericLower, finiteNumericUpper}",
    ],
    [
      "FindMinimum[(x-2)^2,{x,0}]",
      "FindMinimum numerical syntax is not supported",
    ],
  ]) {
    assert.throws(
      () => frontend.lower(source, { captureResult: true }),
      (error) => {
        assert.equal(error.name, "WolframSyntaxError");
        assert.match(error.message, new RegExp(diagnostic.replace(/[{}]/g, "\\$&")));
        assert.equal(error.line, 1);
        assert.ok(error.column >= 1);
        return true;
      },
      source,
    );
  }
});

test("representative multilingual programs reach canonical runtime operations", {
  timeout: 120_000,
}, async () => {
  const session = await createSage();
  try {
    const matlabSolve = await session.evaluate(
      "linsolve([3 1;1 2],[9;8])",
      { language: "matlab" },
    );
    assert.equal(
      matlabSolve.repr.replace(/\s+/g, ""),
      "array([[2.][3.]])",
    );
    const matlabSolveSize = await session.evaluate(
      "x=linsolve([3 1;1 2],[9;8]); size(x)",
      { language: "matlab" },
    );
    assert.equal(matlabSolveSize.repr, "(2, 1)");
    const matlabSolveIndex = await session.evaluate(
      "x=linsolve([3 1;1 2],[9;8]); x(2,1)",
      { language: "matlab" },
    );
    closeTo(Number(matlabSolveIndex.repr), 3);

    const matlabLeastSquaresSize = await session.evaluate(
      "x=lsqminnorm([1 0;0 1;1 1],[1;2;3]); size(x)",
      { language: "matlab" },
    );
    assert.equal(matlabLeastSquaresSize.repr, "(2, 1)");
    const matlabLeastSquaresIndex = await session.evaluate(
      "x=lsqminnorm([1 0;0 1;1 1],[1;2;3]); x(2,1)",
      { language: "matlab" },
    );
    closeTo(Number(matlabLeastSquaresIndex.repr), 2);

    const matlabSvdSize = await session.evaluate(
      "s=svd([3 1;1 2]); size(s)",
      { language: "matlab" },
    );
    assert.equal(matlabSvdSize.repr, "(2, 1)");
    const matlabSvdIndex = await session.evaluate(
      "s=svd([3 1;1 2]); s(2,1)",
      { language: "matlab" },
    );
    closeTo(Number(matlabSvdIndex.repr), 1.381966011250105);

    for (const [operation, callback] of [
      ["fminsearch", "@(x) (x(1,1)-1)^2+(x(1,2)-2)^2"],
      ["fsolve", "@(x) [x(1,1)-1 x(1,2)-2]"],
      ["lsqnonlin", "@(x) [x(1,1)-1 x(1,2)-2]"],
    ]) {
      const rowSize = await session.evaluate(
        `x=${operation}(${callback},[1 2]); size(x)`,
        { language: "matlab" },
      );
      assert.equal(rowSize.repr, "(1, 2)", operation + " row shape");
      const rowIndex = await session.evaluate(
        `x=${operation}(${callback},[1 2]); x(1,2)`,
        { language: "matlab" },
      );
      closeTo(Number(rowIndex.repr), 2);

      const columnCallback = callback
        .replaceAll("x(1,2)", "x(2,1)")
        .replace("[x(1,1)-1 x(2,1)-2]", "[x(1,1)-1;x(2,1)-2]");
      const columnSize = await session.evaluate(
        `x=${operation}(${columnCallback},[1;2]); size(x)`,
        { language: "matlab" },
      );
      assert.equal(columnSize.repr, "(2, 1)", operation + " column shape");
      const columnIndex = await session.evaluate(
        `x=${operation}(${columnCallback},[1;2]); x(2,1)`,
        { language: "matlab" },
      );
      closeTo(Number(columnIndex.repr), 2);
    }

    const matlabConvolution = await session.evaluate(
      "conv([1 2],[3 4])",
      { language: "matlab" },
    );
    assert.equal(
      matlabConvolution.repr.replace(/\s+/g, ""),
      "array([[3.,10.,8.]])",
    );

    const matlabSweep = await session.evaluate(
      "arrayfun(@(x) x^2,[1 2;3 4])",
      { language: "matlab" },
    );
    assert.equal(
      matlabSweep.repr.replace(/\s+/g, ""),
      "array([[1,4][9,16]])",
    );

    await assert.rejects(
      session.evaluate("conv([1 2;3 4],[1 2])", { language: "matlab" }),
      /must be a vector, not a matrix/,
    );
    await assert.rejects(
      session.evaluate("fminsearch(@(x) x(1)^2,[1 2;3 4])", {
        language: "matlab",
      }),
      /must be a vector, not a matrix/,
    );

    const matlabIntegral = await session.evaluate(
      "integral(@(x) x^2,0,1)",
      { language: "matlab" },
    );
    closeTo(Number(matlabIntegral.repr), 1 / 3);

    const wolframSolve = await session.evaluate(
      "LinearSolve[{{3,1},{1,2}},{9,8}]",
      { language: "wolfram" },
    );
    assert.deepEqual(JSON.parse(wolframSolve.repr), [2, 3]);

    const wolframDescribe = await session.evaluate(
      "SageJSDescribe[{1,2,3,4}]",
      { language: "wolfram" },
    );
    assert.match(wolframDescribe.repr, /'count': 4/);
    assert.match(wolframDescribe.repr, /'mean': 2\.5/);

    const wolframIntegral = await session.evaluate(
      "NIntegrate[x^2,{x,0,1}]",
      { language: "wolfram" },
    );
    closeTo(Number(wolframIntegral.repr), 1 / 3);

  } finally {
    await session.close();
  }
});
