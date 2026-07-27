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
  if (operation.kind === "real.constant") {
    return `${indent}let ${operation.target} = ${operation.parent}(` +
      `${jsString(operation.value)});`;
  }
  if (operation.kind === "complex.constant") {
    return `${indent}let ${operation.target} = ${operation.parent}(` +
      `${jsString(operation.real)}, ${jsString(operation.imag)});`;
  }
  if (
    operation.kind === "real.binary" ||
    operation.kind === "complex.binary"
  ) {
    return `${indent}${operation.target} = ${operation.left}.` +
      `${METHOD[operation.operation]}(${operation.right});`;
  }
  if (operation.kind === "loop.range") {
    const lines = [
      `${indent}for (let ${operation.index} = 0; ` +
        `${operation.index} < ${operation.count}; ${operation.index} += 1) {`,
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
  return `function javascript_${fn.name}(${params}) {
${fn.body.map((item) => emitStatement(item, "  ")).join("\n")}
}`;
}

function emitPublicFunction(fn) {
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

${ir.functions.map(emitPublicFunction).join("\n\n")}

module.exports = {
  ${exports},
  cacheKey: ${jsString(options.cacheKey || "")},
  nativeAvailable: nativeAddon !== null,
};
`;
}

module.exports = {
  generateJavaScript,
};
