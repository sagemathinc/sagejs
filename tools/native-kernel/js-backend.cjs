"use strict";

const {
  isTupleType,
  tupleElementTypes,
} = require("./integer-ir.cjs");

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
        `${operation.index} += ${operation.step || 1}) {`,
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
  if (operation.kind === "int64.buffer.copy") {
    return `${indent}${operation.target} = ${operation.source};`;
  }
  if (operation.kind === "int64.buffer.length") {
    return `${indent}${operation.target} = ${operation.buffer}.length;`;
  }
  if (operation.kind === "int64.record.view") {
    return `${indent}${operation.target} = int64RecordView(` +
      `${operation.buffer}, ${operation.start}, ${operation.length});`;
  }
  if (operation.kind === "int64.buffer.get") {
    return `${indent}${operation.target} = int64BufferGet(` +
      `${operation.buffer}, ${operation.index});`;
  }
  if (operation.kind === "int64.buffer.set") {
    return `${indent}int64BufferSet(${operation.buffer}, ` +
      `${operation.index}, ${operation.value});`;
  }
  if (operation.kind === "integer.buffer.copy") {
    return `${indent}${operation.target} = ${operation.source};`;
  }
  if (operation.kind === "integer.buffer.length") {
    return `${indent}${operation.target} = ${operation.buffer}.length;`;
  }
  if (operation.kind === "integer.buffer.get") {
    return `${indent}${operation.target} = integerBufferGet(` +
      `${operation.buffer}, ${operation.index});`;
  }
  if (operation.kind === "integer.buffer.set") {
    return `${indent}integerBufferSet(${operation.buffer}, ` +
      `${operation.index}, ${operation.value});`;
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
  if (operation.kind === "integer.divmod") {
    return `${indent}[${operation.quotient}, ${operation.remainder}] = ` +
      `integerDivmod(${operation.left}, ${operation.right});`;
  }
  if (operation.kind === "integer.round_sqrt") {
    return `${indent}${operation.target} = ` +
      `integerRoundSqrt(${operation.source});`;
  }
  if (operation.kind === "integer.sequence.get") {
    return `${indent}${operation.target} = integerSequenceGet(` +
      `${JSON.stringify(operation.values.map(String))}, ${operation.index});`;
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
    const targets = operation.results === undefined
      ? operation.target
      : `[${operation.results.map((result) => result.name).join(", ")}]`;
    return `${indent}${targets} = javascript_${operation.function}(` +
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
    const condition = operation.boundIsStop
      ? `${operation.index} < ${operation.count}`
      : `${operation.index} - ${operation.start} < ${operation.count}`;
    return [
      `${indent}for (${operation.index} = ${operation.start}; ` +
        `${condition}; ` +
        `${operation.index} += ${operation.step || 1}) {`,
      ...operation.body.map((item) =>
        emitExactStatement(item, `${indent}  `)
      ),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "loop.range_exact") {
    return [
      `${indent}for (${operation.index} = ${operation.start}; ` +
        `${operation.index} < ${operation.stop}; ` +
        `${operation.index} += 1n) {`,
      ...operation.body.map((item) =>
        emitExactStatement(item, `${indent}  `)
      ),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "return") {
    if (isTupleType(operation.type)) {
      return `${indent}return [${operation.values.join(", ")}];`;
    }
    return `${indent}return ${operation.value};`;
  }
  if (operation.kind === "raise") {
    return `${indent}nativeRaise(${jsString(operation.exception)}, ` +
      `${jsString(operation.message)});`;
  }
  throw new Error(`unsupported exact JavaScript IR statement ${operation.kind}`);
}

function emitExactFallback(fn) {
  const params = fn.params.map((param) => param.name).join(", ");
  const locals = fn.locals.map((local) => local.name);
  const buffers = fn.params
    .filter((param) => param.type === "Int64Buffer" ||
      param.type === "Int64Record" || param.type === "IntegerBuffer")
    .map((param) => `  ${param.name} = ${param.type === "IntegerBuffer"
      ? "integerBufferView" : "int64BufferView"}(` +
      `${param.name}, ${jsString(param.name)});`)
    .join("\n");
  return `function javascript_${fn.name}(${params}) {
${buffers ? buffers + "\n" : ""}${locals.length ? `  let ${locals.join(", ")};\n` : ""}${
    fn.body.map((item) => emitExactStatement(item, "  ")).join("\n")
  }
}`;
}

function exactDefault(param) {
  if (param.default === undefined) return param.name;
  const value = param.type === "bool"
    ? String(param.default)
    : `${BigInt(param.default)}n`;
  return `${param.name} = ${value}`;
}

function exactParameters(fn) {
  return fn.params.map(exactDefault).join(", ");
}

function exactReturn(fn, expression) {
  return tupleElementTypes(fn.returnType) === undefined
    ? expression
    : `nativeTuple(${expression})`;
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
  if (param.type === "Int64Buffer" || param.type === "Int64Record") {
    return `  int64BufferView(${param.name}, ${jsString(param.name)});`;
  }
  if (param.type === "IntegerBuffer") {
    return `  integerBufferView(${param.name}, ${jsString(param.name)});`;
  }
  return `  if (typeof ${param.name} !== "boolean") {\n` +
    `    throw new TypeError("${param.name} must be a bool");\n` +
    "  }";
}

function normalizedArgument(param) {
  if (param.type === "Integer") return `BigInt(${param.name})`;
  if (param.type === "Int64Buffer" || param.type === "Int64Record") {
    return `int64BufferView(${param.name}, ${jsString(param.name)})`;
  }
  if (param.type === "IntegerBuffer") {
    return `integerBufferView(${param.name}, ${jsString(param.name)})`;
  }
  return param.name;
}

function exactNativeExpression(fn, backend) {
  const buffers = fn.params.filter((param) =>
    param.type === "Int64Buffer" || param.type === "Int64Record" ||
    param.type === "IntegerBuffer"
  );
  if (buffers.length === 0) {
    const args = fn.params.map((param) =>
      `sagejs_native_${param.name}`
    ).join(", ");
    return `nativeExactCall(${jsString(fn.name)}, [${args}], ${backend})`;
  }
  const declarations = buffers.map((param) =>
    `    const sagejs_native_descriptor_${param.name} = ` +
      `${param.type === "IntegerBuffer"
        ? "integerNativeBuffer" : "int64NativeBuffer"}(` +
      `sagejs_native_${param.name}, ${jsString(param.name)});`
  );
  const args = fn.params.map((param) =>
    param.type === "Int64Buffer" || param.type === "Int64Record"
      ? `sagejs_native_descriptor_${param.name}.typed`
      : param.type === "IntegerBuffer"
        ? `sagejs_native_descriptor_${param.name}.packed`
      : `sagejs_native_${param.name}`
  ).join(", ");
  const copies = buffers
    .filter((param) => fn.analysis.effects.externalWrites.includes(param.name))
    .map((param) => `      sagejs_native_descriptor_${param.name}.copyBack();`);
  const call = `nativeExactCall(${jsString(fn.name)}, [${args}], ${backend})`;
  return [
    "(() => {",
    ...declarations,
    ...(copies.length === 0
      ? [`    return ${call};`]
      : [
          "    try {",
          `      return ${call};`,
          "    } finally {",
          ...copies,
          "    }",
        ]),
    "  })()",
  ].join("\n");
}

function backendDecision(fn) {
  const policy = fn.analysis.backend;
  if (["tagged", "gmp", "bigint"].includes(policy.kind)) {
    return `  return ${jsString(policy.kind)};`;
  }
  if (policy.kind === "iterations") {
    const value = `sagejs_native_${policy.parameter}`;
    const minimum = BigInt(policy.minimumIterations);
    return `  return (typeof ${value} === "bigint" ` +
      `? ${value} >= ${minimum}n : ${value} >= ${minimum}) ` +
      `? "tagged" : "bigint";`;
  }
  if (policy.kind === "operand-bits") {
    const threshold = 1n << BigInt(policy.minimumBits - 1);
    const conditions = policy.parameters.map((name) => {
      const value = `sagejs_native_${name}`;
      return `${value} >= ${threshold}n || ${value} <= -${threshold}n`;
    });
    return conditions.length === 0
      ? "  return \"bigint\";"
      : `  return (${conditions.join(" || ")}) ? "tagged" : "bigint";`;
  }
  throw new Error(`unsupported exact backend policy ${policy.kind}`);
}

function emitExactPublicFunction(fn) {
  const params = fn.params.map((param) => param.name).join(", ");
  const declaredParams = exactParameters(fn);
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
  const effects = JSON.stringify(fn.analysis.effects);
  const taggedInteger = JSON.stringify(fn.analysis.taggedInteger);
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

function ${fn.name}(${declaredParams}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  const sagejs_native_backend = backend_${fn.name}(${args});
  if (sagejs_native_backend !== "bigint") {
    return ${exactReturn(fn, exactNativeExpression(fn, "sagejs_native_backend"))};
  }
${fallbackGuards.join("\n")}
  return ${exactReturn(fn, `javascript_${fn.name}(${fallbackArgs})`)};
}
${fn.name}.javascript = function (${declaredParams}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
${fallbackGuards.join("\n")}
  return ${exactReturn(fn, `javascript_${fn.name}(${fallbackArgs})`)};
};
${fn.name}.bigint = ${fn.name}.javascript;
${fn.name}.tagged = function (${declaredParams}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  if (nativeAddon === null) {
    throw new Error("tagged native backend is not available");
  }
  return ${exactReturn(fn, exactNativeExpression(fn, '"tagged"'))};
};
${fn.name}.gmp = function (${declaredParams}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  if (nativeAddon === null) {
    throw new Error("GMP backend is not available");
  }
  return ${exactReturn(fn, exactNativeExpression(fn, '"gmp"'))};
};
${fn.name}.backendFor = function (${declaredParams}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  return backend_${fn.name}(${args});
};
${fn.name}.backendPolicy = Object.freeze(${policy});
${fn.name}.effects = Object.freeze(${effects});
${fn.name}.taggedInteger = Object.freeze(${taggedInteger});
${fn.name}.createInt64Buffer = createInt64Buffer;
${fn.name}.createIntegerBuffer = createIntegerBuffer;
${fn.name}.packIntegerBuffer = packIntegerBuffer;
${fn.name}.nativeAvailable = nativeAddon !== null;`;
}

function emitPrimeFieldPublicFunction(fn) {
  const declaredParams = fn.params.map((param) => param.name).join(", ");
  const descriptors = fn.params.map((param) => {
    const helper = param.type === "PrimeFieldDecomposition"
      ? "primeFieldDecomposition"
      : "primeFieldMatrix";
    return `  const sagejs_${param.name} = ${helper}(` +
      `${param.name}, ${jsString(param.name)});`;
  }).join("\n");
  const nativeArguments = fn.params
    .map((param) => `sagejs_${param.name}.native`)
    .join(", ");
  const first = `sagejs_${fn.params[0].name}`;
  let fallback;
  let nativeResult;
  if (fn.operation === "rank") {
    fallback = `return primeFieldMethod(${first}.value, "rank");`;
    nativeResult = `return primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);`;
  } else if (fn.operation === "determinant") {
    fallback = `return primeFieldMethod(${first}.value, "determinant");`;
    nativeResult =
      `const residue = primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);\n` +
      `  return primeFieldMethod(${first}.base, "__call__", [residue]);`;
  } else if (fn.operation === "echelon") {
    fallback = `return primeFieldMethod(${first}.value, "echelon_form");`;
    nativeResult =
      `const native = primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);\n` +
      `  return primeFieldMethod(${first}.value, "_new", [native]);`;
  } else if (fn.operation === "solve") {
    const second = `sagejs_${fn.params[1].name}`;
    fallback = `return primeFieldMethod(${first}.value, "solve_right", ` +
      `[${second}.value]);`;
    nativeResult =
      `const native = primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);\n` +
      `  return primeFieldMethod(${second}.value, "_new", [native]);`;
  } else if (fn.operation === "factor") {
    fallback = `return makePrimeFieldDecomposition(null, ${first});`;
    nativeResult =
      `const native = primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);\n` +
      `  return makePrimeFieldDecomposition(native, ${first});`;
  } else if (fn.operation === "factor-rank") {
    fallback = `return primeFieldMethod(${first}.source, "rank");`;
    nativeResult = `return primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);`;
  } else if (fn.operation === "factor-determinant") {
    fallback = `return primeFieldMethod(${first}.source, "determinant");`;
    nativeResult =
      `const residue = primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);\n` +
      `  return primeFieldMethod(${first}.base, "__call__", [residue]);`;
  } else if (fn.operation === "factor-echelon") {
    fallback = `return primeFieldMethod(${first}.source, "echelon_form");`;
    nativeResult =
      `const native = primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);\n` +
      `  return primeFieldMethod(${first}.source, "_new", [native]);`;
  } else if (fn.operation === "factor-solve") {
    const second = `sagejs_${fn.params[1].name}`;
    fallback = `return primeFieldMethod(${first}.source, "solve_right", ` +
      `[${second}.value]);`;
    nativeResult =
      `const native = primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);\n` +
      `  return primeFieldMethod(${second}.value, "_new", [native]);`;
  } else {
    throw new Error(`unsupported prime-field operation ${fn.operation}`);
  }
  const policy = JSON.stringify({
    u32: "uint64 scalar products and Shoup-specialized row updates",
    u64: "FLINT preinverse products and Shoup-specialized row updates",
    factorization: "blocked dense square LU; classical general PLE",
    reuse: "one immutable decomposition supports many operations and solves",
    mutation: "private elimination workspace; inputs remain immutable",
  });
  return `function ${fn.name}(${declaredParams}) {
  if (arguments.length !== ${fn.params.length}) {
    throw new TypeError(${jsString(fn.name)} + "() expects exactly " +
      ${fn.params.length} + " argument(s)");
  }
${descriptors}
  if (nativeAddon === null) {
    ${fallback}
  }
  ${nativeResult}
}
${fn.name}.operation = ${jsString(fn.operation)};
primeFieldOperations[${jsString(fn.operation)}] = ${fn.name};
${fn.name}.backendFor = function (${fn.params[0].name}) {
  const descriptor = ${fn.params[0].type === "PrimeFieldDecomposition"
    ? "primeFieldDecomposition"
    : "primeFieldMatrix"}(
    ${fn.params[0].name}, ${jsString(fn.params[0].name)});
  const modulus = BigInt(Reflect.get(descriptor.base, "_modulus"));
  return modulus <= 0xffffffffn ? "u32" : "u64";
};
${fn.name}.backendPolicy = Object.freeze(${policy});
${fn.name}.nativeAvailable = nativeAddon !== null;`;
}

function emitPrimeSourcePublicFunction(fn) {
  const declaredParams = fn.params.map((param) => param.name).join(", ");
  const descriptors = fn.params.map((param) => {
    if (param.type !== "PrimeFieldMatrix") {
      throw new Error(`unsupported source-transparent argument ${param.type}`);
    }
    return `  const sagejs_${param.name} = primeFieldMatrix(` +
      `${param.name}, ${jsString(param.name)});`;
  }).join("\n");
  const nativeArguments = fn.params
    .map((param) => `sagejs_${param.name}.native`)
    .join(", ");
  let result;
  if (fn.returnType === "uint64") {
    result = `return primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);`;
  } else if (fn.returnType === "PrimeFieldMatrix") {
    result = `const native = primeFieldNativeCall(${jsString(fn.name)}, ` +
      `[${nativeArguments}]);\n` +
      `  return primeFieldMethod(sagejs_${fn.params[0].name}.value, ` +
      `"_new_shape", [native, ` +
      `Reflect.get(native, "__sagejs_native_rows__"), ` +
      `Reflect.get(native, "__sagejs_native_columns__")]);`;
  } else {
    throw new Error(`unsupported source-transparent result ${fn.returnType}`);
  }
  return `function ${fn.name}(${declaredParams}) {
  if (arguments.length !== ${fn.params.length}) {
    throw new TypeError(${jsString(fn.name)} + "() expects exactly " +
      ${fn.params.length} + " argument(s)");
  }
${descriptors}
  if (nativeAddon === null) {
    throw new Error("source-transparent native artifact is unavailable");
  }
  ${result}
}
${fn.name}.sourceTransparent = true;
${fn.name}.backendPolicy = Object.freeze({
  kind: "compiled-python-body",
  representation: "owned-row-major-u64-buffer",
  arithmetic: "u32-prime"
});
${fn.name}.nativeAvailable = nativeAddon !== null;`;
}

function generateJavaScript(ir, options = {}) {
  function emitFloat64Statement(operation, indent) {
    if (operation.kind === "uint64.constant") {
      return `${indent}${operation.target} = ${operation.value};`;
    }
    if (operation.kind === "float64.constant") {
      return `${indent}${operation.target} = ${operation.value};`;
    }
    if (operation.kind === "float64.copy" || operation.kind === "uint64.copy") {
      return `${indent}${operation.target} = ${operation.source};`;
    }
    if (operation.kind === "float64.from_uint64") {
      return `${indent}${operation.target} = Number(${operation.source});`;
    }
    if (operation.kind === "float64.abs") {
      return `${indent}${operation.target} = Math.abs(${operation.source});`;
    }
    if (operation.kind === "float64.sqrt") {
      return `${indent}if (${operation.source} < 0) ` +
        `throw new RangeError("math domain error");\n` +
        `${indent}${operation.target} = Math.sqrt(${operation.source});`;
    }
    if (operation.kind === "uint64.binary") {
      return `${indent}${operation.target} = ${operation.left} ` +
        `${operation.operation} ${operation.right};`;
    }
    if (operation.kind === "float64.buffer.copy") {
      return `${indent}${operation.target} = ${operation.source};`;
    }
    if (operation.kind === "float64.buffer.length") {
      return `${indent}${operation.target} = ${operation.buffer}.length;`;
    }
    if (operation.kind === "float64.record.view") {
      return `${indent}${operation.target} = float64RecordView(` +
        `${operation.buffer}, ${operation.start}, ${operation.length});`;
    }
    if (operation.kind === "float64.buffer.get") {
      return `${indent}${operation.target} = float64BufferGet(` +
        `${operation.buffer}, ${operation.index});`;
    }
    if (operation.kind === "float64.buffer.set") {
      return `${indent}float64BufferSet(${operation.buffer}, ` +
        `${operation.index}, ${operation.value});`;
    }
    if (operation.kind === "float64.binary") {
      const operator = { add: "+", sub: "-", mul: "*", div: "/" }[
        operation.operation
      ];
      const guard = operation.operation === "div"
        ? `${indent}if (${operation.right} === 0) ` +
          `throw new RangeError("float division by zero");\n`
        : "";
      return guard + `${indent}${operation.target} = ${operation.left} ` +
        `${operator} ${operation.right};`;
    }
    if (operation.kind === "loop.range") {
      const stop = operation.stop ?? operation.count;
      return [
        `${indent}for (${operation.index} = ${operation.start}; ` +
          `${operation.index} < ${stop}; ` +
          `${operation.index} += ${operation.step || 1}) {`,
        ...operation.body.map((item) =>
          emitFloat64Statement(item, `${indent}  `)
        ),
        `${indent}}`,
      ].join("\n");
    }
    if (operation.kind === "return") {
      return `${indent}return ${operation.value};`;
    }
    throw new Error(`unsupported binary64 JavaScript operation ${operation.kind}`);
  }

  function emitFloat64PublicFunction(fn) {
    const params = fn.params.map((param) => param.name).join(", ");
    const locals = fn.locals.map((local) => local.name);
    const declaration = locals.length === 0 ? "" : `  let ${locals.join(", ")};\n`;
    const bufferNormalization = fn.params
      .filter((param) => param.type === "Float64Buffer")
      .map((param) => `  ${param.name} = float64BufferView(${param.name}, ` +
        `${jsString(param.name)});`)
      .join("\n");
    const fallback = `function javascript_${fn.name}(${params}) {\n` +
      (bufferNormalization ? bufferNormalization + "\n" : "") +
      declaration + fn.body.map((operation) =>
        emitFloat64Statement(operation, "  ")
      ).join("\n") + "\n}";
    const validation = fn.params.map((param) => param.type === "uint64"
      ? `  if (!(typeof ${param.name} === "bigint"\n` +
        `        ? ${param.name} >= 0n && ${param.name} <= 18446744073709551615n\n` +
        `        : Number.isSafeInteger(${param.name}) && ${param.name} >= 0)) {\n` +
        `    throw new RangeError("${param.name} must be a nonnegative uint64");\n` +
        "  }"
      : param.type === "Float64"
      ? `  if (typeof ${param.name} !== "number") {\n` +
        `    throw new TypeError("${param.name} must be a binary64 float");\n` +
        "  }"
      : `  const sagejs_native_buffer_${param.name} = ` +
        `float64NativeBuffer(${param.name}, ${jsString(param.name)});`
    ).join("\n");
    const nativeArgs = fn.params.map((param) => param.type === "Float64Buffer"
      ? `sagejs_native_buffer_${param.name}.typed`
      : param.name
    ).join(", ");
    const fallbackArgs = fn.params.map((param) => param.type === "uint64"
      ? `Number(${param.name})`
      : param.name
    ).join(", ");
    const copyBack = fn.params
      .filter((param) => param.type === "Float64Buffer" &&
        fn.analysis.effects.mutates.includes(param.name))
      .map((param) => `    sagejs_native_buffer_${param.name}.copyBack();`)
      .join("\n");
    const nativeCall = copyBack
      ? `  let sagejs_native_result;\n` +
        `  try {\n` +
        `    sagejs_native_result = nativeAddon.${fn.name}(${nativeArgs});\n` +
        `  } finally {\n${copyBack}\n  }\n` +
        `  return sagejs_native_result;`
      : `  return nativeAddon.${fn.name}(${nativeArgs});`;
    return `${fallback}\n\nfunction ${fn.name}(${params}) {\n` +
      `  if (arguments.length !== ${fn.params.length}) {\n` +
      `    throw new TypeError("${fn.name}() expects exactly ` +
        `${fn.params.length} arguments");\n` +
      "  }\n" + validation + "\n" +
      `  if (nativeAddon !== null) {\n${nativeCall}\n  }\n` +
      `  return javascript_${fn.name}(${fallbackArgs});\n` +
      `}\n${fn.name}.javascript = javascript_${fn.name};\n` +
      `${fn.name}.nativeAvailable = nativeAddon !== null;\n` +
      `${fn.name}.backendFor = () => nativeAddon === null ` +
        `? "javascript-number" : "native-double";\n` +
      `${fn.name}.backendPolicy = Object.freeze(` +
        `${JSON.stringify(fn.analysis.backend)});`;
  }

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

const float64BufferViewTag = Symbol("sagejs.native.Float64BufferView");
const int64BufferViewTag = Symbol("sagejs.native.Int64BufferView");
const integerBufferViewTag = Symbol("sagejs.native.IntegerBufferView");

function isPackedIntegerBuffer(value) {
  return value !== null && typeof value === "object" &&
    value.sizes instanceof Int32Array &&
    value.limbs instanceof BigUint64Array &&
    Number.isSafeInteger(value.length) && value.length >= 0 &&
    Number.isSafeInteger(value.wordCapacity) && value.wordCapacity > 0 &&
    value.sizes.length >= value.length &&
    value.limbs.length >= value.length * value.wordCapacity;
}

function integerBufferView(value, argument = "buffer") {
  if (value !== null && typeof value === "object" &&
      value[integerBufferViewTag] === true) return value;
  if (isPackedIntegerBuffer(value)) {
    return {
      [integerBufferViewTag]: true,
      packed: value,
      offset: 0,
      length: value.length,
    };
  }
  if (value === null || (typeof value !== "object" &&
      typeof value !== "function")) {
    throw new TypeError(argument + " must be an IntegerBuffer");
  }
  const length = Number(Reflect.get(value, "length"));
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(argument + " must have a nonnegative safe length");
  }
  return {
    [integerBufferViewTag]: true, data: value, offset: 0, length,
  };
}

function integerBufferGet(buffer, index) {
  const view = integerBufferView(buffer);
  const position = int64SafeIndex(
    index, view.length, "IntegerBuffer index out of range");
  const absolute = view.offset + position;
  if (view.packed === undefined) {
    return BigInt(Reflect.get(view.data, String(absolute)));
  }
  const packed = view.packed;
  const signedSize = packed.sizes[absolute];
  const size = Math.abs(signedSize);
  if (size > packed.wordCapacity) {
    throw new RangeError("IntegerBuffer slot exceeds its word capacity");
  }
  let answer = 0n;
  const start = absolute * packed.wordCapacity;
  for (let limb = size - 1; limb >= 0; limb -= 1) {
    answer = (answer << 64n) + packed.limbs[start + limb];
  }
  return signedSize < 0 ? -answer : answer;
}

function integerBufferSet(buffer, index, value) {
  const view = integerBufferView(buffer);
  const position = int64SafeIndex(
    index, view.length, "IntegerBuffer index out of range");
  const absolute = view.offset + position;
  let exact = BigInt(value);
  if (view.packed === undefined) {
    if (!Reflect.set(view.data, String(absolute), exact)) {
      throw new TypeError("IntegerBuffer is not writable");
    }
    return;
  }
  const packed = view.packed;
  const negative = exact < 0n;
  if (negative) exact = -exact;
  const words = exact === 0n
    ? 0 : Math.ceil(exact.toString(2).length / 64);
  if (words > packed.wordCapacity) {
    throw new RangeError("IntegerBuffer word capacity exceeded");
  }
  const start = absolute * packed.wordCapacity;
  packed.limbs.fill(0n, start, start + packed.wordCapacity);
  for (let limb = 0; limb < words; limb += 1) {
    packed.limbs[start + limb] = BigInt.asUintN(64, exact);
    exact >>= 64n;
  }
  packed.sizes[absolute] = negative ? -words : words;
}

function createIntegerBuffer(length, wordCapacity = 8, source = undefined) {
  if (!Number.isSafeInteger(length) || length < 0 ||
      !Number.isSafeInteger(wordCapacity) || wordCapacity <= 0 ||
      length !== 0 && wordCapacity > Math.floor(Number.MAX_SAFE_INTEGER / length)) {
    throw new RangeError("invalid packed IntegerBuffer dimensions");
  }
  const packed = {
    sizes: new Int32Array(length),
    limbs: new BigUint64Array(length * wordCapacity),
    length,
    wordCapacity,
  };
  if (source !== undefined) {
    const view = integerBufferView(source, "source");
    if (view.length !== length) {
      throw new RangeError("IntegerBuffer source length differs");
    }
    for (let index = 0; index < length; index += 1) {
      integerBufferSet(packed, index, integerBufferGet(view, index));
    }
  }
  packed.toArray = () => {
    const answer = [];
    for (let index = 0; index < length; index += 1) {
      answer.push(integerBufferGet(packed, index));
    }
    return answer;
  };
  return packed;
}

function packIntegerBuffer(source, minimumWordCapacity = 8) {
  if (!Number.isSafeInteger(minimumWordCapacity) ||
      minimumWordCapacity <= 0) {
    throw new RangeError("invalid minimum IntegerBuffer word capacity");
  }
  const values = Array.from(source, (value) => BigInt(value));
  let wordCapacity = minimumWordCapacity;
  for (const value of values) {
    const magnitude = value < 0n ? -value : value;
    const words = magnitude === 0n
      ? 0 : Math.ceil(magnitude.toString(2).length / 64);
    wordCapacity = Math.max(wordCapacity, words);
  }
  return createIntegerBuffer(values.length, wordCapacity, values);
}

function createInt64Buffer(source) {
  if (Number.isSafeInteger(source) && source >= 0) {
    return new BigInt64Array(source);
  }
  return BigInt64Array.from(source, (value) => BigInt(value));
}

function integerNativeBuffer(value, argument) {
  const view = integerBufferView(value, argument);
  if (view.offset === 0 && view.packed !== undefined &&
      view.length === view.packed.length) {
    return { packed: view.packed, copyBack() {} };
  }
  let wordCapacity = 8;
  for (let index = 0; index < view.length; index += 1) {
    const value = integerBufferGet(view, index);
    const bits = (value < 0n ? -value : value).toString(2).length;
    wordCapacity = Math.max(wordCapacity, Math.ceil(bits / 64));
  }
  const packed = createIntegerBuffer(view.length, wordCapacity);
  for (let index = 0; index < view.length; index += 1) {
    integerBufferSet(packed, index, integerBufferGet(view, index));
  }
  return {
    packed,
    copyBack() {
      for (let index = 0; index < view.length; index += 1) {
        integerBufferSet(view, index, integerBufferGet(packed, index));
      }
    },
  };
}

function int64BufferView(value, argument = "buffer") {
  if (value !== null && typeof value === "object" &&
      value[int64BufferViewTag] === true) return value;
  if (value === null || (typeof value !== "object" &&
      typeof value !== "function")) {
    throw new TypeError(argument + " must be an Int64Buffer");
  }
  const length = Number(Reflect.get(value, "length"));
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(argument + " must have a nonnegative safe length");
  }
  return { [int64BufferViewTag]: true, data: value, offset: 0, length };
}

function int64SafeIndex(index, length, message) {
  const exact = typeof index === "bigint" ? index : BigInt(index);
  if (exact < BigInt(-length) || exact >= BigInt(length)) {
    throw new RangeError(message);
  }
  const position = Number(exact < 0n ? BigInt(length) + exact : exact);
  if (!Number.isSafeInteger(position)) throw new RangeError(message);
  return position;
}

function int64RecordView(buffer, start, length) {
  const view = int64BufferView(buffer);
  const exactStart = typeof start === "bigint" ? start : BigInt(start);
  const exactLength = typeof length === "bigint" ? length : BigInt(length);
  if (exactStart < 0n || exactLength < 0n ||
      exactStart > BigInt(view.length) ||
      exactLength > BigInt(view.length) - exactStart) {
    throw new RangeError("Int64Record is outside its buffer");
  }
  return {
    [int64BufferViewTag]: true,
    data: view.data,
    offset: view.offset + Number(exactStart),
    length: Number(exactLength),
  };
}

function int64BufferGet(buffer, index) {
  const view = int64BufferView(buffer);
  const position = int64SafeIndex(
    index, view.length, "Int64 buffer index out of range");
  const value = BigInt(Reflect.get(view.data, String(view.offset + position)));
  if (value < -9223372036854775808n || value > 9223372036854775807n) {
    throw new RangeError("Int64Buffer value is outside signed 64-bit");
  }
  return value;
}

function int64BufferSet(buffer, index, value) {
  const view = int64BufferView(buffer);
  const position = int64SafeIndex(
    index, view.length, "Int64 buffer index out of range");
  const exact = BigInt(value);
  if (exact < -9223372036854775808n || exact > 9223372036854775807n) {
    throw new RangeError("Int64Buffer value is outside signed 64-bit");
  }
  if (!Reflect.set(view.data, String(view.offset + position), exact)) {
    throw new TypeError("Int64 buffer is not writable");
  }
}

function int64NativeBuffer(value, argument) {
  const view = int64BufferView(value, argument);
  if (view.offset === 0 && view.data instanceof BigInt64Array &&
      view.length === view.data.length) {
    return { typed: view.data, copyBack() {} };
  }
  const typed = new BigInt64Array(view.length);
  for (let index = 0; index < view.length; index += 1) {
    typed[index] = int64BufferGet(view, index);
  }
  return {
    typed,
    copyBack() {
      for (let index = 0; index < view.length; index += 1) {
        int64BufferSet(view, index, typed[index]);
      }
    },
  };
}

function float64BufferView(value, argument = "buffer") {
  if (value !== null && typeof value === "object" &&
      value[float64BufferViewTag] === true) return value;
  if (value === null || (typeof value !== "object" &&
      typeof value !== "function")) {
    throw new TypeError(argument + " must be a Float64Buffer");
  }
  const length = Number(Reflect.get(value, "length"));
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(argument + " must have a nonnegative safe length");
  }
  return { [float64BufferViewTag]: true, data: value, offset: 0, length };
}

function float64RecordView(buffer, start, length) {
  const view = float64BufferView(buffer);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) ||
      start < 0 || length < 0 || start > view.length ||
      length > view.length - start) {
    throw new RangeError("Float64Record is outside its buffer");
  }
  return {
    [float64BufferViewTag]: true,
    data: view.data,
    offset: view.offset + start,
    length,
  };
}

function float64BufferGet(buffer, index) {
  const view = float64BufferView(buffer);
  if (!Number.isSafeInteger(index) || index < 0 || index >= view.length) {
    throw new RangeError("Float64 buffer index out of range");
  }
  return Number(Reflect.get(view.data, String(view.offset + index)));
}

function float64BufferSet(buffer, index, value) {
  const view = float64BufferView(buffer);
  if (!Number.isSafeInteger(index) || index < 0 || index >= view.length) {
    throw new RangeError("Float64 buffer index out of range");
  }
  if (!Reflect.set(view.data, String(view.offset + index), Number(value))) {
    throw new TypeError("Float64 buffer is not writable");
  }
}

function float64NativeBuffer(value, argument) {
  const view = float64BufferView(value, argument);
  if (view.offset === 0 && view.data instanceof Float64Array &&
      view.length === view.data.length) {
    return { typed: view.data, copyBack() {} };
  }
  const typed = new Float64Array(view.length);
  for (let index = 0; index < view.length; index += 1) {
    typed[index] = float64BufferGet(view, index);
  }
  return {
    typed,
    copyBack() {
      for (let index = 0; index < view.length; index += 1) {
        float64BufferSet(view, index, typed[index]);
      }
    },
  };
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

function integerDivmod(left, right) {
  const quotient = integerFloorDiv(left, right);
  return [quotient, left - quotient * right];
}

function integerRoundSqrt(value) {
  if (value < 0n) throw new RangeError("math domain error");
  const input = Number(value);
  if (!Number.isFinite(input)) {
    throw new RangeError("int too large to convert to float");
  }
  const root = Math.sqrt(input);
  const floor = Math.floor(root);
  const fraction = root - floor;
  const rounded = fraction < 0.5
    ? floor
    : fraction > 0.5
      ? floor + 1
      : floor % 2 === 0 ? floor : floor + 1;
  return BigInt(rounded);
}

function integerSequenceGet(values, index) {
  let position = Number(index);
  if (!Number.isSafeInteger(position)) {
    throw new RangeError("native sequence index is too large");
  }
  if (position < 0) position += values.length;
  if (position < 0 || position >= values.length) {
    throw new RangeError("native sequence index out of range");
  }
  return BigInt(values[position]);
}

function nativeTuple(values) {
  const factory = globalThis.__sagejs_native_tuple__ || globalThis.tuple;
  return typeof factory === "function"
    ? factory(values)
    : Object.freeze(Array.from(values));
}

function nativeRaise(name, message) {
  const factory = globalThis[name];
  if (typeof factory === "function") throw new factory(message);
  throw new RangeError(message);
}

function nativeExactCall(name, args, backend = "tagged") {
  try {
    const property = backend === "gmp" ? name + "$gmp" : name;
    return nativeAddon[property](...args);
  } catch (error) {
    const message = String(error && error.message || error);
    if (message.includes("division") || message.includes("modulo")) {
      nativeRaise("ZeroDivisionError", message);
    }
    if (message.includes("math domain")) nativeRaise("ValueError", message);
    if (message.includes("too large to convert")) {
      nativeRaise("OverflowError", message);
    }
    if (message.includes("outside signed 64-bit")) {
      nativeRaise("OverflowError", message);
    }
    if (message.includes("IntegerBuffer word capacity") ||
        message.includes("IntegerBuffer slot exceeds")) {
      nativeRaise("OverflowError", message);
    }
    if (message.includes("IntegerBuffer index") ||
        message.includes("Int64 buffer index") ||
        message.includes("Int64Record")) {
      nativeRaise("IndexError", message);
    }
    if (message.includes("sequence index")) nativeRaise("IndexError", message);
    throw error;
  }
}

function primeFieldMatrix(value, argument) {
  if (value === null || (typeof value !== "object" &&
      typeof value !== "function")) {
    throw new TypeError(argument + " must be a dense prime-field matrix");
  }
  const native = Reflect.get(value, "_native");
  const baseMethod = Reflect.get(value, "base_ring");
  if (native === undefined || typeof baseMethod !== "function") {
    throw new TypeError(argument + " must be a dense prime-field matrix");
  }
  const base = Reflect.apply(baseMethod, value, []);
  if (Reflect.get(base, "_kind") !== "GF") {
    throw new TypeError(argument + " must be a dense matrix over GF(p)");
  }
  return { value, native, base };
}

const primeFieldDecompositionTag = Symbol("sagejs.prime-field-decomposition");
const primeFieldOperations = Object.create(null);

function makePrimeFieldDecomposition(native, matrix) {
  const algorithm = native === null
    ? "fallback"
    : String(Reflect.get(native, "algorithm"));
  const decomposition = {
    [primeFieldDecompositionTag]: true,
    native,
    source: matrix.value,
    base: matrix.base,
    algorithm,
    rank() {
      return primeFieldOperations["factor-rank"](decomposition);
    },
    determinant() {
      return primeFieldOperations["factor-determinant"](decomposition);
    },
    echelon() {
      return primeFieldOperations["factor-echelon"](decomposition);
    },
    solve(right) {
      return primeFieldOperations["factor-solve"](decomposition, right);
    },
  };
  return Object.freeze(decomposition);
}

function primeFieldDecomposition(value, argument) {
  if (value === null || (typeof value !== "object" &&
      typeof value !== "function") ||
      Reflect.get(value, primeFieldDecompositionTag) !== true) {
    throw new TypeError(argument + " must be a prime-field decomposition");
  }
  return value;
}

function primeFieldMethod(value, name, args = []) {
  const method = Reflect.get(value, name);
  if (typeof method !== "function") {
    throw new TypeError("prime-field matrix does not implement " + name);
  }
  return Reflect.apply(method, value, args);
}

function primeFieldNativeCall(name, args) {
  try {
    return nativeAddon[name](...args);
  } catch (error) {
    const message = String(error && error.message || error);
    if (message.includes("singular") || message.includes("dimensions") ||
        message.includes("square") || message.includes("compatible") ||
        message.includes("base rings differ")) {
      nativeRaise("ValueError", message);
    }
    throw error;
  }
}

${ir.functions.map((fn) =>
    fn.kernelKind === "integer"
      ? emitExactPublicFunction(fn)
      : fn.kernelKind === "float64"
        ? emitFloat64PublicFunction(fn)
      : fn.kernelKind === "prime-field-matrix"
        ? emitPrimeFieldPublicFunction(fn)
        : fn.kernelKind === "prime-field-source"
          ? emitPrimeSourcePublicFunction(fn)
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
  createIntegerBuffer,
  cacheKey: ${jsString(options.cacheKey || "")},
  nativeAvailable: nativeAddon !== null,
  primeFieldTuning: Object.freeze(${JSON.stringify(
    options.primeFieldTuning || {},
  )}),
  sourceBoundsChecked: ${options.sourceBoundsChecked === true ? "true" : "false"},
};
`;
}

module.exports = {
  generateJavaScript,
};
