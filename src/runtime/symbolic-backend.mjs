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

function machineText(value, digits) {
  if (!Number.isFinite(value)) return String(value);
  let text = value.toPrecision(digits);
  if (text.includes("e")) {
    const [mantissa, exponent] = text.split("e");
    text = `${mantissa.replace(/(\.[0-9]*?)0+$/, "$1").replace(/\.$/, "")}e${exponent}`;
  } else {
    text = text.replace(/(\.[0-9]*?)0+$/, "$1").replace(/\.$/, "");
  }
  return text;
}

export function createSymbolicBackend() {
  return Object.freeze({
    parse(expression) {
      return engine().parse(expression).json;
    },

    canonical(expression) {
      return boxed(expression).json;
    },

    same(left, right) {
      return boxed(left).isSame(boxed(right));
    },

    evaluate(expression) {
      return boxed(expression).evaluate().json;
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

    numeric(expression, digits = 15) {
      const requestedDigits = Math.max(1, Math.trunc(Number(digits)));
      const previousPrecision = engine().precision;
      try {
        engine().precision =
          requestedDigits <= 15 ? "machine" : requestedDigits;
        const result = boxed(expression).N();
        const value = result.valueOf();
        if (typeof value === "number") {
          return Object.freeze({
            value,
            text:
              requestedDigits <= 15
                ? machineText(value, requestedDigits)
                : result.toString(),
          });
        }
        if (typeof result.re === "number" && typeof result.im === "number") {
          return Object.freeze({
            re: result.re,
            im: result.im,
            text: result.toString(),
          });
        }
        const text = result.toString();
        const numeric = Number(text);
        if (Number.isFinite(numeric)) {
          return Object.freeze({ value: numeric, text });
        }
        throw new TypeError(
          `symbolic expression has no numerical value: ${result}`,
        );
      } finally {
        engine().precision = previousPrecision;
      }
    },

    variables(expression) {
      return boxed(expression).unknowns;
    },

    solve(expression, variables) {
      const result = boxed(expression).solve(variables);
      if (Array.isArray(result)) {
        return Object.freeze({
          kind: "roots",
          values: Object.freeze(
            result.map((value) => value.json).reverse(),
          ),
        });
      }
      if (result && typeof result === "object") {
        const values = Object.create(null);
        for (const [name, value] of Object.entries(result)) {
          values[name] = value.json;
        }
        return Object.freeze({
          kind: "mapping",
          values: Object.freeze(values),
        });
      }
      return Object.freeze({ kind: "none" });
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
