/*
 * Narrow Cortex Compute Engine adapter for Sage.js symbolic expressions.
 *
 * The Python-visible symbolic object model lives in baselib/symbolic.py.
 * Keeping this adapter tree-oriented prevents Cortex objects from leaking into
 * that public API and gives us one replaceable boundary for symbolic backends.
 */

import {
  ComputeEngine,
  compile as compileExpression,
} from "@cortex-js/compute-engine";

let computeEngine;

function engine() {
  computeEngine ??= new ComputeEngine();
  return computeEngine;
}

function boxed(expression) {
  return engine().box(expression);
}

function checkedCompilation(expression, variables) {
  const lambda = ["Function", expression, ...variables];
  const result = compileExpression(engine().box(lambda));
  if (!result.success || typeof result.code !== "string") {
    const unsupported = result.unsupported?.length
      ? `: ${result.unsupported.join(", ")}`
      : "";
    throw new TypeError(`unable to compile symbolic expression${unsupported}`);
  }
  return result;
}

export function createSymbolicBackend() {
  return Object.freeze({
    canonical(expression) {
      return boxed(expression).json;
    },

    substitute(expression, substitutions) {
      return boxed(expression).subs(substitutions).json;
    },

    derivative(expression, variable) {
      return boxed(["D", expression, variable]).evaluate().json;
    },

    integrate(expression, variable, lower, upper) {
      const range =
        lower === undefined
          ? variable
          : ["Tuple", variable, lower, upper];
      return boxed(["Integrate", expression, range]).evaluate().json;
    },

    simplify(expression) {
      return boxed(expression).simplify().json;
    },

    numeric(expression) {
      const result = boxed(expression).N();
      const value = result.valueOf();
      if (typeof value === "number") return value;
      if (typeof result.re === "number" && typeof result.im === "number") {
        return Object.freeze({ re: result.re, im: result.im });
      }
      throw new TypeError(
        `symbolic expression has no machine numerical value: ${result}`,
      );
    },

    variables(expression) {
      return boxed(expression).unknowns;
    },

    compile(expression, variables) {
      const result = checkedCompilation(expression, variables);
      // Cortex's run() proxy is intentionally general. Reconstructing its
      // emitted lambda gives hot numeric loops the same shape as handwritten
      // JavaScript, which matters for adaptive plotting. Some expressions
      // (notably noninteger powers) use Cortex's generated runtime helpers.
      return Function(
        "_SYS",
        `"use strict"; return (${result.code});`,
      )(result.run.SYS);
    },
  });
}

export default createSymbolicBackend;
