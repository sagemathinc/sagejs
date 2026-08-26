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

function symbolicTruth(expression) {
  const candidate = boxed(expression);
  const evaluated = candidate.evaluate().valueOf();
  if (typeof evaluated === "boolean") return evaluated;

  const canonical = candidate.json;
  if (
    Array.isArray(canonical) &&
    canonical.length === 3 &&
    ["Equal", "Less", "LessEqual", "Greater", "GreaterEqual"].includes(
      canonical[0],
    )
  ) {
    const difference = boxed([
      "Subtract",
      canonical[1],
      canonical[2],
    ]).simplify();
    const sign = difference.sgn;
    const isZero = sign === "zero" || difference.isSame(boxed(0));
    if (canonical[0] === "Equal") return isZero;
    if (sign === undefined) return false;
    if (canonical[0] === "Less") return sign === "negative";
    if (canonical[0] === "LessEqual") return sign === "negative" || isZero;
    if (canonical[0] === "Greater") return sign === "positive";
    return sign === "positive" || isZero;
  }

  const simplified = candidate.simplify();
  return !(simplified.sgn === "zero" || simplified.isSame(boxed(0)));
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

function complexAdd(left, right) {
  return [left[0] + right[0], left[1] + right[1]];
}

function complexSubtract(left, right) {
  return [left[0] - right[0], left[1] - right[1]];
}

function complexMultiply(left, right) {
  return [
    left[0] * right[0] - left[1] * right[1],
    left[0] * right[1] + left[1] * right[0],
  ];
}

function complexDivide(left, right) {
  const denominator = right[0] * right[0] + right[1] * right[1];
  return [
    (left[0] * right[0] + left[1] * right[1]) / denominator,
    (left[1] * right[0] - left[0] * right[1]) / denominator,
  ];
}

function complexPowerInteger(value, exponent) {
  let power = Math.trunc(Number(exponent));
  if (power === 0) return [1, 0];
  let base = value;
  let result = [1, 0];
  const negative = power < 0;
  if (negative) power = -power;
  while (power > 0) {
    if (power % 2 === 1) result = complexMultiply(result, base);
    power = Math.floor(power / 2);
    if (power > 0) base = complexMultiply(base, base);
  }
  return negative ? complexDivide([1, 0], result) : result;
}

function complexExp(value) {
  const scale = Math.exp(value[0]);
  return [scale * Math.cos(value[1]), scale * Math.sin(value[1])];
}

function complexLog(value) {
  return [Math.log(Math.hypot(value[0], value[1])), Math.atan2(value[1], value[0])];
}

function complexPower(left, right) {
  return complexExp(complexMultiply(right, complexLog(left)));
}

function complexSqrt(value) {
  const magnitude = Math.hypot(value[0], value[1]);
  const real = Math.sqrt(Math.max(0, (magnitude + value[0]) / 2));
  let imaginary = Math.sqrt(Math.max(0, (magnitude - value[0]) / 2));
  if (value[1] < 0) imaginary = -imaginary;
  return [real, imaginary];
}

function complexSin(value) {
  return [
    Math.sin(value[0]) * Math.cosh(value[1]),
    Math.cos(value[0]) * Math.sinh(value[1]),
  ];
}

function complexCos(value) {
  return [
    Math.cos(value[0]) * Math.cosh(value[1]),
    -Math.sin(value[0]) * Math.sinh(value[1]),
  ];
}

function compileComplexNode(tree, variableIndices) {
  if (typeof tree === "number" || typeof tree === "bigint") {
    const value = Number(tree);
    return () => [value, 0];
  }
  if (typeof tree === "string") {
    if (variableIndices.has(tree)) {
      const index = variableIndices.get(tree);
      return (variables) => variables[index];
    }
    if (tree === "Pi") return () => [Math.PI, 0];
    if (tree === "ExponentialE") return () => [Math.E, 0];
    if (tree === "ImaginaryUnit") return () => [0, 1];
    throw new TypeError(`unknown symbolic variable ${tree}`);
  }
  if (!Array.isArray(tree) || tree.length === 0) {
    throw new TypeError("invalid symbolic expression tree");
  }
  const [head, ...operandTrees] = tree;
  if (head === "Rational" && tree.length === 3) {
    const value = Number(tree[1]) / Number(tree[2]);
    return () => [value, 0];
  }
  const operands = operandTrees.map((operand) =>
    compileComplexNode(operand, variableIndices));
  if (head === "Complex" && tree.length === 3) {
    return (variables) => {
      const real = operands[0](variables);
      const imaginary = operands[1](variables);
      if (real[1] !== 0 || imaginary[1] !== 0) {
        throw new TypeError("Complex parts must be real");
      }
      return [real[0], imaginary[0]];
    };
  }
  if (head === "Add") {
    return (variables) => {
      let result = [0, 0];
      for (const operand of operands) result = complexAdd(result, operand(variables));
      return result;
    };
  }
  if (head === "Multiply") {
    return (variables) => {
      let result = [1, 0];
      for (const operand of operands) result = complexMultiply(result, operand(variables));
      return result;
    };
  }
  if (head === "Negate") return (variables) => {
    const value = operands[0](variables);
    return [-value[0], -value[1]];
  };
  if (head === "Subtract") return (variables) =>
    complexSubtract(operands[0](variables), operands[1](variables));
  if (head === "Divide") return (variables) =>
    complexDivide(operands[0](variables), operands[1](variables));
  if (head === "Power") {
    const exponent = operandTrees[1];
    if (typeof exponent === "number" || typeof exponent === "bigint") {
      return (variables) =>
        complexPowerInteger(operands[0](variables), exponent);
    }
    return (variables) =>
      complexPower(operands[0](variables), operands[1](variables));
  }
  if (head === "Exp") return (variables) => complexExp(operands[0](variables));
  if (head === "Ln" || head === "Log") {
    return (variables) => complexLog(operands[0](variables));
  }
  if (head === "Sqrt") return (variables) => complexSqrt(operands[0](variables));
  if (head === "Sin") return (variables) => complexSin(operands[0](variables));
  if (head === "Cos") return (variables) => complexCos(operands[0](variables));
  if (head === "Tan") return (variables) =>
    complexDivide(complexSin(operands[0](variables)), complexCos(operands[0](variables)));
  if (head === "Abs") return (variables) => {
    const value = operands[0](variables);
    return [Math.hypot(value[0], value[1]), 0];
  };
  throw new TypeError(`complex compilation does not support ${head}`);
}

function compileComplexExpression(expression, variables) {
  const indices = new Map(variables.map((name, index) => [String(name), index]));
  const evaluate = compileComplexNode(expression, indices);
  return (...coordinates) => {
    const values = [];
    for (let index = 0; index < variables.length; index += 1) {
      values.push([Number(coordinates[2 * index]), Number(coordinates[2 * index + 1])]);
    }
    const result = evaluate(values);
    return Object.freeze({ real: result[0], imag: result[1] });
  };
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

    truth(expression) {
      return symbolicTruth(expression);
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

    limit(expression, variable, point, direction) {
      const operands = ["Limit", expression, variable, point];
      if (direction !== undefined) operands.push(direction);
      return boxed(operands).evaluate().json;
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

    compileComplex(expression, variables) {
      return compileComplexExpression(expression, variables);
    },
  });
}

export default createSymbolicBackend;
