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
        assert.equal(error.diagnostic.code, "unsupported_operation");
        assert.equal(error.diagnostic.language, "matlab");
        assert.equal(error.diagnostic.details.source_name, name);
        assert.equal(error.diagnostic.details.surface, "natural-vendor-alias");
        return true;
      },
    );
  }

  const unresolvedCall = frontend.lower("mystery([1 2 3])", {
    captureResult: true,
  });
  assert.match(
    unresolvedCall.source,
    /_matlab\.call_or_index_named\("mystery", globals\(\)/,
  );
  assert.doesNotMatch(unresolvedCall.source, /call_or_index\(mystery/);

  const unresolvedHandle = frontend.lower("@mystery", {
    captureResult: true,
  });
  assert.match(
    unresolvedHandle.source,
    /_matlab\.named_handle\("mystery", globals\(\)\)/,
  );

  const unresolvedCallback = frontend.lower(
    "fzero(@(x) mystery(x),[0 1])",
    { captureResult: true },
  );
  assert.match(
    unresolvedCallback.source,
    /_matlab\.validate_callback_names\(\(lambda x: .*\), \["mystery"\], globals\(\)\)/,
  );
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
      "NIntegrate expressions require unary Sin",
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
        if (/numerical syntax is not supported/.test(diagnostic)) {
          assert.equal(error.diagnostic.code, "unsupported_operation");
          assert.equal(error.diagnostic.language, "wolfram");
          assert.equal(
            error.diagnostic.details.surface,
            "natural-vendor-alias",
          );
        }
        return true;
      },
      source,
    );
  }
  const unresolved = frontend.lower("Mystery[1]", { captureResult: true });
  assert.match(
    unresolved.source,
    /_wolfram\.call_named\("Mystery", "Mystery", globals\(\), 1\)/,
  );
  const unresolvedRoot = frontend.lower(
    "FindRoot[Mystery[x],{x,0,1}]",
    { captureResult: true },
  );
  assert.match(
    unresolvedRoot.source,
    /_wolfram\.validate_callback_names\(\(lambda x:/,
  );
  assert.match(unresolvedRoot.source, /Mystery/);
});

test("representative multilingual programs reach canonical runtime operations", {
  timeout: 120_000,
}, async () => {
  const session = await createSage();
  try {
    const sageRoot = await session.evaluate("(x^2-2).find_root(1,2)");
    closeTo(Number(sageRoot.repr), Math.sqrt(2));

    const pythonRoot = await session.evaluate(
      [
        "from sagejs.numerics.roots import find_root",
        "find_root(lambda x: x*x - 2.0, 1.0, 2.0).value",
      ].join("\n"),
      { language: "python" },
    );
    closeTo(Number(pythonRoot.repr), Math.sqrt(2));

    const matlabUserFunction = await session.evaluate(
      "square = @(x) x^2; square(3)",
      { language: "matlab" },
    );
    closeTo(Number(matlabUserFunction.repr), 9);

    const wolframUserFunction = await session.evaluate(
      "SageJSSquare[x_] := x^2\nSageJSSquare[3]",
      { language: "wolfram" },
    );
    closeTo(Number(wolframUserFunction.repr), 9);

    await assert.rejects(
      session.evaluate("mystery([1 2 3])", { language: "matlab" }),
      /unknown MATLAB call or index target 'mystery'.*unsupported_operation/,
    );
    await assert.rejects(
      session.evaluate("fzero(@(x) mystery(x),[0 1])", {
        language: "matlab",
      }),
      /unknown MATLAB callback function 'mystery'.*unsupported_operation/,
    );
    await assert.rejects(
      session.evaluate("Mystery[1]", { language: "wolfram" }),
      /unknown Wolfram function 'Mystery'.*unsupported_operation/,
    );
    await assert.rejects(
      session.evaluate("FindRoot[Mystery[x],{x,0,1}]", {
        language: "wolfram",
      }),
      /unknown Wolfram function 'Mystery'.*unsupported_operation/,
    );

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
      "array([[1.,4.][9.,16.]])",
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

    const matlabRoot = await session.evaluate(
      "fzero(@(x) x^2-2,[1 2])",
      { language: "matlab" },
    );
    closeTo(Number(matlabRoot.repr), Math.sqrt(2));

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

    const wolframRoot = await session.evaluate(
      "FindRoot[Cos[x]-x,{x,0,1}]",
      { language: "wolfram" },
    );
    const rootMatch = wolframRoot.repr.match(/-> ([^}]+)/);
    assert.ok(rootMatch, wolframRoot.repr);
    closeTo(Number(rootMatch[1]), 0.7390851332151607);

    const wolframDefinedRoot = await session.evaluate(
      "SageJSObjective[x_] := Cos[x]-x\nFindRoot[SageJSObjective[x],{x,0,1}]",
      { language: "wolfram" },
    );
    const definedRootMatch = wolframDefinedRoot.repr.match(/-> ([^}]+)/);
    assert.ok(definedRootMatch, wolframDefinedRoot.repr);
    closeTo(Number(definedRootMatch[1]), 0.7390851332151607);

  } finally {
    await session.close();
  }
});
