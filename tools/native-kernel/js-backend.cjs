"use strict";

const METHOD = {
  add: "_add_",
  sub: "_sub_",
  mul: "_mul_",
  div: "_truediv_",
};

function jsString(value) {
  return JSON.stringify(String(value));
}

function emitStatement(operation, indent) {
  if (operation.kind === "integer.constant") {
    return `${indent}${operation.target} = BigInt(` +
      `${jsString(operation.value)});`;
  }
  if (operation.kind === "real.constant") {
    return `${indent}${operation.target} = ${operation.parent}(` +
      `${jsString(operation.value)});`;
  }
  if (operation.kind === "complex.constant") {
    return `${indent}${operation.target} = ${operation.parent}(` +
      `${jsString(operation.real)}, ${jsString(operation.imag)});`;
  }
  if (
    operation.kind === "real.binary" ||
    operation.kind === "complex.binary"
  ) {
    return `${indent}${operation.target} = ${operation.left}.` +
      `${METHOD[operation.operation]}(${operation.right});`;
  }
  if (operation.kind === "integer.binary") {
    const operator = {
      add: "+",
      sub: "-",
      mul: "*",
    }[operation.operation];
    if (operator === undefined)
      throw new Error(`unsupported integer operation ${operation.operation}`);
    return `${indent}${operation.target} = ${operation.left} ` +
      `${operator} ${operation.right};`;
  }
  if (
    operation.kind === "real.copy" ||
    operation.kind === "complex.copy" ||
    operation.kind === "integer.copy"
  ) {
    return `${indent}${operation.target} = ${operation.source};`;
  }
  if (
    operation.kind === "real.from_uint64" ||
    operation.kind === "complex.from_uint64"
  ) {
    return `${indent}${operation.target} = ` +
      `${operation.parent}(${operation.source});`;
  }
  if (operation.kind === "integer.from_uint64") {
    return `${indent}${operation.target} = BigInt(${operation.source});`;
  }
  if (
    operation.kind === "real.pow_uint" ||
    operation.kind === "complex.pow_uint"
  ) {
    return `${indent}${operation.target} = ` +
      `${operation.base}.__pow__(${operation.exponent});`;
  }
  if (operation.kind === "integer.pow_uint") {
    return `${indent}${operation.target} = ` +
      `${operation.base} ** BigInt(${operation.exponent});`;
  }
  if (operation.kind === "loop.range") {
    const lines = [
      `${indent}for (let ${operation.index} = ${operation.start}; ` +
        `${operation.index} - ${operation.start} < ${operation.count}; ` +
        `${operation.index} += 1) {`,
    ];
    for (const item of operation.body)
      lines.push(emitStatement(item, `${indent}  `));
    lines.push(`${indent}}`);
    return lines.join("\n");
  }
  if (operation.kind === "return")
    return `${indent}return ${operation.value};`;
  throw new Error(`unsupported JavaScript IR statement ${operation.kind}`);
}

function emitFallback(fn) {
  const params = fn.params.map((param) => param.name).join(", ");
  const locals = fn.locals.map((local) => local.name).join(", ");
  return `function javascript_${fn.name}(${params}) {
  let ${locals};
${fn.body.map((item) => emitStatement(item, "  ")).join("\n")}
}`;
}

function emitPublicFunction(fn) {
  if (fn.returnType === "Integer") return emitIntegerPublicFunction(fn);
  const parent = fn.params.find(
    (param) =>
      param.type === "RealField" || param.type === "ComplexField",
  );
  const iterations = fn.params.find((param) => param.type === "uint64");
  const params = fn.params.map((param) => param.name).join(", ");
  const nativeArgs = fn.params
    .map((param) =>
      param.type === "RealField" || param.type === "ComplexField"
        ? `${param.name}.precision()`
        : param.name,
    )
    .join(", ");
  return `${emitFallback(fn)}

function validate_${fn.name}(${params}) {
  if (${parent.name} == null || ${parent.name}._kind !== "${parent.type}" ||
      typeof ${parent.name}._fromNative !== "function") {
    throw new TypeError("${parent.name} must be a Sage.js ${parent.type}");
  }
  if (!(typeof ${iterations.name} === "bigint"
        ? ${iterations.name} >= 0n && ${iterations.name} <= 18446744073709551615n
        : Number.isSafeInteger(${iterations.name}) && ${iterations.name} >= 0)) {
    throw new RangeError("${iterations.name} must be a nonnegative uint64");
  }
}

function ${fn.name}(${params}) {
  validate_${fn.name}(${params});
  if (nativeAddon !== null) {
    const nativeValue = nativeAddon.${fn.name}(${nativeArgs});
    return ${parent.name}._fromNative(nativeValue);
  }
  if (typeof ${iterations.name} === "bigint" &&
      ${iterations.name} > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      "JavaScript fallback cannot iterate beyond Number.MAX_SAFE_INTEGER");
  }
  return javascript_${fn.name}(
    ${fn.params
      .map((param) =>
        param.type === "uint64" ? `Number(${param.name})` : param.name,
      )
      .join(", ")});
}
${fn.name}.javascript = javascript_${fn.name};
${fn.name}.nativeAvailable = nativeAddon !== null;`;
}

function emitIntegerPublicFunction(fn) {
  const iterations = fn.params.find((param) => param.type === "uint64");
  const params = fn.params.map((param) => param.name).join(", ");
  return `${emitFallback(fn)}

function validate_${fn.name}(${params}) {
  if (!(typeof ${iterations.name} === "bigint"
        ? ${iterations.name} >= 0n && ${iterations.name} <= 18446744073709551615n
        : Number.isSafeInteger(${iterations.name}) && ${iterations.name} >= 0)) {
    throw new RangeError("${iterations.name} must be a nonnegative uint64");
  }
}

function ${fn.name}(${params}) {
  validate_${fn.name}(${params});
  if (nativeAddon !== null) {
    return nativeAddon.${fn.name}(${params});
  }
  if (typeof ${iterations.name} === "bigint" &&
      ${iterations.name} > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      "JavaScript fallback cannot iterate beyond Number.MAX_SAFE_INTEGER");
  }
  return javascript_${fn.name}(Number(${iterations.name}));
}
${fn.name}.javascript = javascript_${fn.name};
${fn.name}.nativeAvailable = nativeAddon !== null;`;
}

function emitExactStatement(operation, indent) {
  if (operation.kind === "integer.constant") {
    return `${indent}${operation.target} = BigInt(${jsString(operation.value)});`;
  }
  if (operation.kind === "bool.constant") {
    return `${indent}${operation.target} = ${operation.value};`;
  }
  if (
    operation.kind === "integer.copy" ||
    operation.kind === "bool.copy" ||
    operation.kind === "uint64.copy"
  ) {
    return `${indent}${operation.target} = ${operation.source};`;
  }
  if (operation.kind === "integer.from_uint64") {
    return `${indent}${operation.target} = BigInt(${operation.source});`;
  }
  if (operation.kind === "integer.neg") {
    return `${indent}${operation.target} = -${operation.source};`;
  }
  if (operation.kind === "integer.abs") {
    return `${indent}${operation.target} = ${operation.source} < 0n ` +
      `? -${operation.source} : ${operation.source};`;
  }
  if (operation.kind === "integer.pow_uint") {
    return `${indent}${operation.target} = ${operation.base} ** ` +
      `${BigInt(operation.exponent)}n;`;
  }
  if (operation.kind === "integer.binary") {
    const operator = { add: "+", sub: "-", mul: "*" }[
      operation.operation
    ];
    if (operator !== undefined) {
      return `${indent}${operation.target} = ${operation.left} ${operator} ` +
        `${operation.right};`;
    }
    const helper = operation.operation === "floordiv"
      ? "integerFloorDiv"
      : operation.operation === "mod"
        ? "integerMod"
        : undefined;
    if (helper !== undefined) {
      return `${indent}${operation.target} = ${helper}(${operation.left}, ` +
        `${operation.right});`;
    }
    throw new Error(`unsupported exact integer operation ${operation.operation}`);
  }
  if (operation.kind === "integer.compare" || operation.kind === "bool.compare") {
    const operator = {
      eq: "===",
      ne: "!==",
      lt: "<",
      le: "<=",
      gt: ">",
      ge: ">=",
    }[operation.operation];
    return `${indent}${operation.target} = ${operation.left} ${operator} ` +
      `${operation.right};`;
  }
  if (operation.kind === "bool.binary") {
    const operator = operation.operation === "and" ? "&&" : "||";
    return `${indent}${operation.target} = ${operation.left} ${operator} ` +
      `${operation.right};`;
  }
  if (operation.kind === "bool.short_circuit") {
    const test = operation.operation === "and"
      ? operation.target
      : `!${operation.target}`;
    return [
      `${indent}${operation.target} = ${operation.left};`,
      `${indent}if (${test}) {`,
      ...operation.right.operations.map((item) =>
        emitExactStatement(item, `${indent}  `)
      ),
      `${indent}  ${operation.target} = ${operation.right.value};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "bool.not") {
    return `${indent}${operation.target} = !${operation.source};`;
  }
  if (operation.kind === "integer.truth") {
    return `${indent}${operation.target} = ${operation.source} !== 0n;`;
  }
  if (operation.kind === "uint64.truth") {
    return `${indent}${operation.target} = ${operation.source} !== 0;`;
  }
  if (operation.kind === "native.call") {
    return `${indent}${operation.target} = javascript_${operation.function}(` +
      `${operation.arguments.map((argument) => argument.name).join(", ")});`;
  }
  if (operation.kind === "if") {
    const lines = [
      ...operation.condition.operations.map((item) =>
        emitExactStatement(item, indent)
      ),
      `${indent}if (${operation.condition.value}) {`,
      ...operation.body.map((item) => emitExactStatement(item, `${indent}  `)),
      `${indent}}`,
    ];
    if (operation.alternative.length > 0) {
      lines[lines.length - 1] = `${indent}} else {`;
      lines.push(
        ...operation.alternative.map((item) =>
          emitExactStatement(item, `${indent}  `)
        ),
        `${indent}}`,
      );
    }
    return lines.join("\n");
  }
  if (operation.kind === "while") {
    return [
      `${indent}while (true) {`,
      ...operation.condition.operations.map((item) =>
        emitExactStatement(item, `${indent}  `)
      ),
      `${indent}  if (!${operation.condition.value}) break;`,
      ...operation.body.map((item) =>
        emitExactStatement(item, `${indent}  `)
      ),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "loop.range") {
    return [
      `${indent}for (${operation.index} = ${operation.start}; ` +
        `${operation.index} - ${operation.start} < ${operation.count}; ` +
        `${operation.index} += 1) {`,
      ...operation.body.map((item) =>
        emitExactStatement(item, `${indent}  `)
      ),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "return") {
    return `${indent}return ${operation.value};`;
  }
  throw new Error(`unsupported exact JavaScript IR statement ${operation.kind}`);
}

function emitExactFallback(fn) {
  const params = fn.params.map((param) => param.name).join(", ");
  const locals = fn.locals.map((local) => local.name);
  return `function javascript_${fn.name}(${params}) {
${locals.length ? `  let ${locals.join(", ")};\n` : ""}${
    fn.body.map((item) => emitExactStatement(item, "  ")).join("\n")
  }
}`;
}

function exactValidation(param) {
  if (param.type === "Integer") {
    return `  if (!(typeof ${param.name} === "bigint" || ` +
      `Number.isSafeInteger(${param.name}))) {\n` +
      `    throw new TypeError("${param.name} must be an exact integer");\n` +
      "  }";
  }
  if (param.type === "uint64") {
    return `  if (!(typeof ${param.name} === "bigint"\n` +
      `        ? ${param.name} >= 0n && ${param.name} <= 18446744073709551615n\n` +
      `        : Number.isSafeInteger(${param.name}) && ${param.name} >= 0)) {\n` +
      `    throw new RangeError("${param.name} must be a nonnegative uint64");\n` +
      "  }";
  }
  return `  if (typeof ${param.name} !== "boolean") {\n` +
    `    throw new TypeError("${param.name} must be a bool");\n` +
    "  }";
}

function normalizedArgument(param) {
  if (param.type === "Integer") return `BigInt(${param.name})`;
  return param.name;
}

function backendDecision(fn) {
  const policy = fn.analysis.backend;
  if (policy.kind === "gmp" || policy.kind === "bigint") {
    return `  return ${jsString(policy.kind)};`;
  }
  if (policy.kind === "iterations") {
    const value = `sagejs_native_${policy.parameter}`;
    const minimum = BigInt(policy.minimumIterations);
    return `  return (typeof ${value} === "bigint" ` +
      `? ${value} >= ${minimum}n : ${value} >= ${minimum}) ` +
      `? "gmp" : "bigint";`;
  }
  if (policy.kind === "operand-bits") {
    const threshold = 1n << BigInt(policy.minimumBits - 1);
    const conditions = policy.parameters.map((name) => {
      const value = `sagejs_native_${name}`;
      return `${value} >= ${threshold}n || ${value} <= -${threshold}n`;
    });
    return conditions.length === 0
      ? "  return \"bigint\";"
      : `  return (${conditions.join(" || ")}) ? "gmp" : "bigint";`;
  }
  throw new Error(`unsupported exact backend policy ${policy.kind}`);
}

function emitExactPublicFunction(fn) {
  const params = fn.params.map((param) => param.name).join(", ");
  const normalized = fn.params.map((param) =>
    `  const sagejs_native_${param.name} = ${normalizedArgument(param)};`
  );
  const args = fn.params.map((param) => `sagejs_native_${param.name}`).join(", ");
  const fallbackGuards = fn.params
    .filter((param) => param.type === "uint64")
    .map((param) =>
      `  if (typeof sagejs_native_${param.name} === "bigint" &&\n` +
      `      sagejs_native_${param.name} > BigInt(Number.MAX_SAFE_INTEGER)) {\n` +
      `    throw new RangeError("JavaScript fallback cannot iterate beyond Number.MAX_SAFE_INTEGER");\n` +
      "  }"
    );
  const fallbackArgs = fn.params.map((param) =>
    param.type === "uint64"
      ? `Number(sagejs_native_${param.name})`
      : `sagejs_native_${param.name}`
  ).join(", ");
  const policy = JSON.stringify(fn.analysis.backend);
  return `${emitExactFallback(fn)}

function validate_${fn.name}(${params}) {
${fn.params.map(exactValidation).join("\n")}
}

function backend_${fn.name}(${args}) {
  if (integerBackendOverride === "gmp" && nativeAddon === null) {
    throw new Error("GMP backend was requested but is not available");
  }
  if (nativeAddon === null) return "bigint";
  if (integerBackendOverride !== "auto") return integerBackendOverride;
${backendDecision(fn)}
}

function ${fn.name}(${params}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  if (backend_${fn.name}(${args}) === "gmp") {
    return nativeAddon.${fn.name}(${args});
  }
${fallbackGuards.join("\n")}
  return javascript_${fn.name}(${fallbackArgs});
}
${fn.name}.javascript = function (${params}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
${fallbackGuards.join("\n")}
  return javascript_${fn.name}(${fallbackArgs});
};
${fn.name}.bigint = ${fn.name}.javascript;
${fn.name}.gmp = function (${params}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  if (nativeAddon === null) {
    throw new Error("GMP backend is not available");
  }
  return nativeAddon.${fn.name}(${args});
};
${fn.name}.backendFor = function (${params}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  return backend_${fn.name}(${args});
};
${fn.name}.backendPolicy = Object.freeze(${policy});
${fn.name}.nativeAvailable = nativeAddon !== null;`;
}

function generateJavaScript(ir, options = {}) {
  const exports = ir.functions.map((fn) => fn.name).join(", ");
  return `"use strict";

let nativeAddon = null;
if (process.env.SAGEJS_NATIVE_DISABLE !== "1") {
  try {
    nativeAddon = require("./build/Release/sagejs_native_kernel.node");
  } catch (error) {
    if (process.env.SAGEJS_NATIVE_REQUIRED === "1") throw error;
  }
}

const integerBackendOverride =
  process.env.SAGEJS_NATIVE_INTEGER_BACKEND || "auto";
if (!["auto", "bigint", "gmp"].includes(integerBackendOverride)) {
  throw new RangeError(
    "SAGEJS_NATIVE_INTEGER_BACKEND must be auto, bigint, or gmp");
}

function integerFloorDiv(left, right) {
  if (right === 0n) throw new RangeError("integer division or modulo by zero");
  let quotient = left / right;
  const remainder = left % right;
  if (remainder !== 0n && (remainder < 0n) !== (right < 0n)) quotient -= 1n;
  return quotient;
}

function integerMod(left, right) {
  return left - integerFloorDiv(left, right) * right;
}

${ir.functions.map((fn) =>
    fn.kernelKind === "integer"
      ? emitExactPublicFunction(fn)
      : emitPublicFunction(fn)
  ).join("\n\n")}

const nativeFunctions = { ${exports} };
const nativeRegister = globalThis.__sagejs_native_register__;
if (typeof nativeRegister === "function") {
  nativeRegister(
    ${jsString(options.sourcePath || "")},
    ${jsString(options.sourceHash || "")},
    nativeFunctions,
  );
}

module.exports = {
  ...nativeFunctions,
  cacheKey: ${jsString(options.cacheKey || "")},
  nativeAvailable: nativeAddon !== null,
};
`;
}

module.exports = {
  generateJavaScript,
};
