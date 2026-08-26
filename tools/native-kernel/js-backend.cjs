"use strict";

const NATIVE_PACK_ABI_VERSION = 1;

const {
  isTupleType,
  tupleElementTypes,
} = require("./integer-ir.cjs");
const {
  javascriptForeignCall,
  javascriptRuntime,
  resourceForFunctionType,
} = require("./ffi-codegen.cjs");
const {
  hasUint64Bitwise,
} = require("./uint64-operations.cjs");

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
${uint64Validation(iterations.name)}
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
${uint64Validation(iterations.name)}
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

function emitExactStatement(operation, indent, resourceStack = null) {
  if (operation.kind === "uint64.constant") {
    return `${indent}${operation.target} = ${operation.value}n;`;
  }
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
  if (operation.kind === "integer.mod_uint64") {
    return `${indent}${operation.target} = integerModUInt64(` +
      `${operation.left}, ${operation.right});`;
  }
  if (operation.kind === "uint64.buffer.copy") {
    return `${indent}${operation.target} = ${operation.source};`;
  }
  if (operation.kind === "uint64.buffer.length") {
    return `${indent}${operation.target} = BigInt(${operation.buffer}.length);`;
  }
  if (operation.kind === "uint64.buffer.get") {
    return `${indent}${operation.target} = uint64BufferGet(` +
      `${operation.buffer}, ${operation.index});`;
  }
  if (operation.kind === "uint64.buffer.set") {
    return `${indent}uint64BufferSet(${operation.buffer}, ` +
      `${operation.index}, ${operation.value});`;
  }
  if (operation.kind === "int64.buffer.copy") {
    return `${indent}${operation.target} = ${operation.source};`;
  }
  if (operation.kind === "int64.buffer.length") {
    return `${indent}${operation.target} = BigInt(${operation.buffer}.length);`;
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
    return `${indent}${operation.target} = BigInt(${operation.buffer}.length);`;
  }
  if (operation.kind === "integer.buffer.get") {
    return `${indent}${operation.target} = integerBufferGet(` +
      `${operation.buffer}, ${operation.index});`;
  }
  if (operation.kind === "integer.buffer.set") {
    return `${indent}integerBufferSet(${operation.buffer}, ` +
      `${operation.index}, ${operation.value});`;
  }
  if (operation.kind === "integer.vector.length") {
    return `${indent}${operation.target} = ` +
      `nativeIntegerVectorLength(${operation.vector});`;
  }
  if (operation.kind === "integer.vector.get") {
    return `${indent}${operation.target} = nativeIntegerVectorGet(` +
      `${operation.vector}, ${operation.index});`;
  }
  if (operation.kind === "integer.vector.set") {
    return `${indent}nativeIntegerVectorSet(${operation.vector}, ` +
      `${operation.index}, ${operation.value});`;
  }
  if (operation.kind === "integer.vector.addmul" ||
      operation.kind === "integer.vector.submul") {
    return `${indent}nativeIntegerVectorAddmul(${operation.vector}, ` +
      `${operation.index}, ${operation.left}, ${operation.right}, ` +
      `${operation.kind === "integer.vector.submul"});`;
  }
  if (operation.kind === "integer.vector.swap") {
    return `${indent}nativeIntegerVectorSwap(${operation.vector}, ` +
      `${operation.left}, ${operation.right});`;
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
  if (operation.kind === "uint64.binary") {
    return `${indent}${operation.target} = uint64Binary(` +
      `${jsString(operation.operation)}, ${operation.left}, ` +
      `${operation.right});`;
  }
  if (["integer.compare", "uint64.compare", "bool.compare"].includes(
    operation.kind
  )) {
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
        emitExactStatement(item, `${indent}  `, resourceStack)
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
    return `${indent}${operation.target} = ${operation.source} !== 0n;`;
  }
  if (operation.kind === "native.call") {
    const targets = operation.results === undefined
      ? operation.target
      : `[${operation.results.map((result) => result.name).join(", ")}]`;
    return `${indent}${targets} = javascript_${operation.function}(` +
      `${operation.arguments.map((argument) => argument.name).join(", ")});`;
  }
  if (operation.kind === "ffi.call") {
    return javascriptForeignCall(operation, indent);
  }
  if (operation.kind === "if") {
    const lines = [
      ...operation.condition.operations.map((item) =>
        emitExactStatement(item, indent, resourceStack)
      ),
      `${indent}if (${operation.condition.value}) {`,
      ...operation.body.map((item) =>
        emitExactStatement(item, `${indent}  `, resourceStack)
      ),
      `${indent}}`,
    ];
    if (operation.alternative.length > 0) {
      lines[lines.length - 1] = `${indent}} else {`;
      lines.push(
        ...operation.alternative.map((item) =>
          emitExactStatement(item, `${indent}  `, resourceStack)
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
        emitExactStatement(item, `${indent}  `, resourceStack)
      ),
      `${indent}  if (!${operation.condition.value}) break;`,
      ...operation.body.map((item) =>
        emitExactStatement(item, `${indent}  `, resourceStack)
      ),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "loop.range") {
    const condition = operation.boundIsStop
      ? `${operation.index} < ${operation.count}`
      : `${operation.index} - ${operation.start} < ${operation.count}`;
    return [
      `${indent}for (${operation.index} = ${BigInt(operation.start)}n; ` +
        `${condition}; ` +
        `${operation.index} += ${BigInt(operation.step || 1)}n) {`,
      ...operation.body.map((item) =>
        emitExactStatement(item, `${indent}  `, resourceStack)
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
        emitExactStatement(item, `${indent}  `, resourceStack)
      ),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.vector.scope") {
    return [
      ...operation.setup.map((item) =>
        emitExactStatement(item, indent, resourceStack)
      ),
      `${indent}${operation.owner} = createNativeIntegerVector(` +
        `${operation.capacity}, ${operation.memoryLimit});`,
      `${indent}try {`,
      ...operation.body.map((item) =>
        emitExactStatement(item, `${indent}  `, resourceStack)
      ),
      `${indent}} finally {`,
      `${indent}  nativeIntegerVectorClose(${operation.owner});`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "return") {
    if (isTupleType(operation.type)) {
      return `${indent}return [${operation.values.join(", ")}];`;
    }
    return resourceStack === null
      ? `${indent}return ${operation.value};`
      : `${indent}return sagejsFfiTransferResource(` +
        `${operation.value}, ${resourceStack});`;
  }
  if (operation.kind === "raise") {
    return `${indent}nativeRaise(${jsString(operation.exception)}, ` +
      `${jsString(operation.message)});`;
  }
  throw new Error(`unsupported exact JavaScript IR statement ${operation.kind}`);
}

function emitExactFallback(fn) {
  const params = fn.params.map((param) => param.name).join(", ");
  const aliases = new Set(Object.keys(fn.resourceAliases || {}));
  const locals = fn.locals
    .filter((local) => !aliases.has(local.name))
    .map((local) => local.name);
  const buffers = fn.params
    .filter((param) => param.type === "Int64Buffer" ||
      param.type === "Int64Record" || param.type === "IntegerBuffer" ||
      param.type === "UInt64Buffer")
    .map((param) => `  ${param.name} = ${param.type === "IntegerBuffer"
      ? "integerBufferView" : param.type === "UInt64Buffer"
        ? "uint64BufferView" : "int64BufferView"}(` +
      `${param.name}, ${jsString(param.name)});`)
    .join("\n");
  const resourceStack = fn.foreignResources?.length
    ? "sagejsFfiResources" : null;
  const body = fn.body.map((item) => emitExactStatement(
    item, resourceStack === null ? "  " : "    ", resourceStack,
  )).join("\n");
  const resources = fn.foreignResources?.length
    ? `  const sagejsFfiResources = [];\n  try {\n${body}\n` +
      `  } finally {\n    sagejsFfiCloseResources(sagejsFfiResources);\n  }`
    : body;
  return `function javascript_${fn.name}(${params}) {
${buffers ? buffers + "\n" : ""}${locals.length ? `  let ${locals.join(", ")};\n` : ""}${resources}
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

function exactResourceResultMetadata(fn) {
  const resource = resourceForFunctionType(fn, fn.returnType);
  if (resource === undefined) return null;
  if (resource.ownership !== "owned") {
    throw new Error(
      `native public result ${fn.returnType} must be an owned FFI resource`,
    );
  }
  const pythonModule = resource.library?.python_module;
  if (typeof pythonModule !== "string") {
    throw new Error(
      `native public result ${fn.returnType} lacks its Python FFI module`,
    );
  }
  return Object.freeze({
    identity: `resource:${resource.declaration_identity}:${resource.id}`,
    declarationIdentity: resource.declaration_identity,
    pythonModule,
    pythonName: resource.python_name,
    closeExport: resource.dynamic.close_export,
  });
}

function exactResourceResult(fn, expression, native) {
  const metadata = exactResourceResultMetadata(fn);
  if (metadata === null) return expression;
  const adopt = native
    ? "sagejsFfiAdoptNativeResourceResult"
    : "sagejsFfiPublishResourceResult";
  return `${adopt}(${expression}, ${JSON.stringify(metadata)})`;
}

function exactValidation(param) {
  if (param.resourceIdentity !== undefined) {
    return `  sagejsFfiPublicResource(${param.name}, ` +
      `${jsString(param.resourceIdentity)}, ${jsString(param.name)});`;
  }
  if (param.type === "Integer") {
    return `  if (!(typeof ${param.name} === "bigint" || ` +
      `Number.isSafeInteger(${param.name}))) {\n` +
      `    throw new TypeError("${param.name} must be an exact integer");\n` +
      "  }";
  }
  if (param.type === "uint64") {
    return uint64Validation(param.name);
  }
  if (param.type === "Int64Buffer" || param.type === "Int64Record") {
    return `  int64BufferView(${param.name}, ${jsString(param.name)});`;
  }
  if (param.type === "UInt64Buffer") {
    return `  uint64ValidatedArgument(${param.name}, ${jsString(param.name)});`;
  }
  if (param.type === "IntegerBuffer") {
    return `  integerBufferView(${param.name}, ${jsString(param.name)});`;
  }
  return `  if (typeof ${param.name} !== "boolean") {\n` +
    `    throw new TypeError("${param.name} must be a bool");\n` +
    "  }";
}

function uint64Validation(name) {
  return `  if (!(typeof ${name} === "bigint" || Number.isSafeInteger(${name}))) {\n` +
    `    nativeRaise("TypeError", "${name} must be an exact integer");\n` +
    `  }\n` +
    `  if (${name} < 0 || ${name} > 18446744073709551615n) {\n` +
    `    nativeRaise("OverflowError", "${name} is outside uint64");\n` +
    "  }";
}

function normalizedArgument(param) {
  if (param.resourceIdentity !== undefined) {
    return `sagejsFfiPublicResource(${param.name}, ` +
      `${jsString(param.resourceIdentity)}, ${jsString(param.name)})`;
  }
  if (param.type === "Integer") return `BigInt(${param.name})`;
  if (param.type === "uint64") return `BigInt(${param.name})`;
  if (param.type === "Int64Buffer" || param.type === "Int64Record") {
    return `int64BufferView(${param.name}, ${jsString(param.name)})`;
  }
  if (param.type === "UInt64Buffer") {
    return `uint64ValidatedArgument(${param.name}, ${jsString(param.name)})`;
  }
  if (param.type === "IntegerBuffer") {
    return `integerBufferView(${param.name}, ${jsString(param.name)})`;
  }
  return param.name;
}

function uint64BufferMayBeWritten(fn, name) {
  const externalWrites = fn.analysis?.effects?.externalWrites;
  return !Array.isArray(externalWrites) || externalWrites.includes(name);
}

function declaredFfiErrors(fn) {
  const translations = Object.create(null);
  const visit = (operations) => {
    for (const operation of operations || []) {
      if (operation.kind === "ffi.call") {
        const errors = operation.foreign.function.errors;
        if (errors.exception !== null) {
          const previous = translations[errors.message];
          if (previous !== undefined && previous !== errors.exception) {
            throw new Error(
              `conflicting FFI exception translations for ${errors.message}`,
            );
          }
          translations[errors.message] = errors.exception;
        }
      }
      visit(operation.body);
      visit(operation.alternative);
      visit(operation.condition?.operations);
      visit(operation.right?.operations);
    }
  };
  visit(fn.body);
  return JSON.stringify(translations);
}

function exactNativeExpression(fn, backend) {
  const ffiErrors = declaredFfiErrors(fn);
  const buffers = fn.params.filter((param) =>
    param.type === "Int64Buffer" || param.type === "Int64Record" ||
    param.type === "IntegerBuffer" || param.type === "UInt64Buffer"
  );
  if (buffers.length === 0) {
    const args = fn.params.map((param) =>
      param.resourceIdentity === undefined
        ? `sagejs_native_${param.name}`
        : `sagejs_native_${param.name}.handle`
    ).join(", ");
    return exactResourceResult(
      fn,
      `nativeExactCall(${jsString(fn.name)}, [${args}], ${backend}, ` +
        `${ffiErrors})`,
      true,
    );
  }
  const declarations = buffers.map((param) =>
    `    const sagejs_native_descriptor_${param.name} = ` +
      `${param.type === "IntegerBuffer"
        ? "integerNativeBuffer" : param.type === "UInt64Buffer"
          ? "uint64NativeBuffer" : "int64NativeBuffer"}(` +
      `sagejs_native_${param.name}, ${jsString(param.name)}` +
      `${param.type === "UInt64Buffer"
        ? `, ${uint64BufferMayBeWritten(fn, param.name)}`
        : ""});`
  );
  const args = fn.params.map((param) =>
    param.type === "Int64Buffer" || param.type === "Int64Record"
      ? `sagejs_native_descriptor_${param.name}.typed`
      : param.type === "UInt64Buffer"
        ? `sagejs_native_descriptor_${param.name}.typed`
      : param.type === "IntegerBuffer"
        ? `sagejs_native_descriptor_${param.name}.packed`
      : param.resourceIdentity === undefined
        ? `sagejs_native_${param.name}`
        : `sagejs_native_${param.name}.handle`
  ).join(", ");
  const copies = buffers
    .filter((param) => uint64BufferMayBeWritten(fn, param.name))
    .map((param) => `      sagejs_native_descriptor_${param.name}.copyBack();`);
  const call = `nativeExactCall(${jsString(fn.name)}, [${args}], ${backend}, ` +
    `${ffiErrors})`;
  const expression = [
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
  return exactResourceResult(fn, expression, true);
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
  if (policy.kind === "integer-buffer-values") {
    const conditions = policy.parameters.map((name) =>
      `integerBufferFitsSignedInt64(sagejs_native_${name})`
    );
    return conditions.length === 0
      ? '  return "tagged";'
      : `  return (${conditions.join(" && ")}) ? "tagged" : "gmp";`;
  }
  throw new Error(`unsupported exact backend policy ${policy.kind}`);
}

function automaticSelectionCode(fn, receipt) {
  if (receipt === undefined) {
    return { declaration: "", decision: "", metadata: "null" };
  }
  const parameters = new Set(fn.params.map((param) => param.name));
  const conditions = Object.entries(receipt.workload.arguments).flatMap(
    ([name, bounds]) => {
      if (!parameters.has(name)) {
        throw new Error(`${fn.name} selection names unknown argument ${name}`);
      }
      const value = `sagejs_native_${name}`;
      return [
        `${value} >= ${BigInt(bounds.min)}n`,
        `${value} <= ${BigInt(bounds.max)}n`,
      ];
    },
  );
  const args = fn.params.map((param) => `sagejs_native_${param.name}`).join(", ");
  return {
    declaration: `function automatic_selection_${fn.name}(${args}) {\n` +
      `  return ${conditions.join(" && ")};\n}`,
    decision: `  if (!automatic_selection_${fn.name}(${args})) return "bigint";`,
    metadata: `deepFreezeAutomaticSelection(${JSON.stringify(receipt)})`,
  };
}

function emitExactPublicFunction(fn, automaticSelection) {
  const params = fn.params.map((param) => param.name).join(", ");
  const declaredParams = exactParameters(fn);
  const normalized = fn.params.map((param) =>
    `  const sagejs_native_${param.name} = ${normalizedArgument(param)};`
  );
  const args = fn.params.map((param) => `sagejs_native_${param.name}`).join(", ");
  const fallbackArgs = fn.params.map((param) =>
    param.type === "UInt64Buffer"
      ? `uint64DynamicBufferView(sagejs_native_${param.name}, ` +
        `${jsString(param.name)})`
      : `sagejs_native_${param.name}`
  ).join(", ");
  const fallbackExpression = exactResourceResult(
    fn,
    `javascript_${fn.name}(${fallbackArgs})`,
    false,
  );
  const policy = JSON.stringify(fn.analysis.backend);
  const effects = JSON.stringify(fn.analysis.effects);
  const taggedInteger = JSON.stringify(fn.analysis.taggedInteger);
  const liveExactWorkspace = JSON.stringify(
    fn.analysis.liveExactWorkspace ?? null,
  );
  const selection = automaticSelectionCode(fn, automaticSelection);
  return `${emitExactFallback(fn)}

${selection.declaration}

function validate_${fn.name}(${params}) {
${fn.params.map(exactValidation).join("\n")}
}

function backend_${fn.name}(${args}) {
  if (integerBackendOverride === "gmp" && nativeAddon === null) {
    throw new Error("GMP backend was requested but is not available");
  }
  if (nativeAddon === null) return "bigint";
  if (integerBackendOverride !== "auto") return integerBackendOverride;
${selection.decision}
${backendDecision(fn)}
}

function ${fn.name}(${declaredParams}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  const sagejs_native_backend = backend_${fn.name}(${args});
  if (sagejs_native_backend !== "bigint") {
    return ${exactReturn(fn, exactNativeExpression(fn, "sagejs_native_backend"))};
  }
  return ${exactReturn(fn, fallbackExpression)};
}
${fn.name}.javascript = function (${declaredParams}) {
  validate_${fn.name}(${params});
${normalized.join("\n")}
  return ${exactReturn(fn, fallbackExpression)};
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
${fn.name}.liveExactWorkspace = ${liveExactWorkspace === "null" ? "null" : `Object.freeze(${liveExactWorkspace})`};
${fn.name}.automaticSelection = ${selection.metadata};
${fn.name}.createInt64Buffer = createInt64Buffer;
${fn.name}.createUInt64Buffer = createUInt64Buffer;
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
    if (param.type === "PrimeFieldMatrix") {
      return `  const sagejs_${param.name} = primeFieldMatrix(` +
        `${param.name}, ${jsString(param.name)});`;
    }
    if (param.type === "UInt64Buffer") {
      return `  const sagejs_${param.name} = uint64NativeBuffer(` +
        `${param.name}, ${jsString(param.name)}, ` +
        `${uint64BufferMayBeWritten(fn, param.name)});`;
    }
    if (param.type === "uint64") return uint64Validation(param.name);
    if (param.type === "PrimeModulusValue") {
      return uint64Validation(param.name) + "\n" +
        `  if (${param.name} < 2 || ${param.name} > 4294967295n) {\n` +
        `    nativeRaise("ValueError", ` +
          `${jsString(param.name + " must be a prime between 2 and 2^32 - 1")});\n` +
        "  }";
    }
    if (param.type.startsWith("Record:")) {
      const recordName = param.type.slice(7);
      const record = (fn.records || []).find((candidate) =>
        candidate.name === recordName
      );
      if (record === undefined) {
        throw new Error(`missing compiler-owned record ${recordName}`);
      }
      const lines = [
        `  if (${param.name} === null || (typeof ${param.name} !== "object" && ` +
          `typeof ${param.name} !== "function")) {`,
        `    throw new TypeError(${jsString(param.name + " must be a " + recordName)});`,
        "  }",
      ];
      const nativeFields = [];
      for (const field of record.fields) {
        const local = `sagejs_${param.name}_${field.name}`;
        const access = `Reflect.get(${param.name}, ${jsString(field.name)})`;
        if (field.type === "UInt64Buffer") {
          lines.push(`  const ${local} = uint64NativeBuffer(${access}, ` +
            `${jsString(param.name + "." + field.name)}, ` +
            // Record-field alias effects are not represented independently in
            // the current IR. Fail closed: only direct UInt64Buffer parameters
            // with a proved read-only effect may borrow immutable storage.
            `true);`);
          nativeFields.push(`${field.name}: ${local}.typed`);
        } else {
          lines.push(`  const ${local} = uint64RecordField(${access}, ` +
            `${jsString(param.name + "." + field.name)}, ` +
            `${field.type === "PrimeModulusValue"});`);
          nativeFields.push(`${field.name}: ${local}`);
        }
      }
      lines.push(`  const sagejs_${param.name} = { ` +
        `${nativeFields.join(", ")} };`);
      return lines.join("\n");
    }
    throw new Error(`unsupported source-transparent argument ${param.type}`);
  }).join("\n");
  const nativeArguments = fn.params
    .map((param) => param.type === "PrimeFieldMatrix"
      ? `sagejs_${param.name}.native`
      : param.type === "UInt64Buffer"
        ? `sagejs_${param.name}.typed`
        : param.type.startsWith("Record:")
          ? `sagejs_${param.name}`
        : param.name)
    .join(", ");
  const buffers = fn.params.flatMap((param) => {
    if (param.type === "UInt64Buffer") return [`sagejs_${param.name}`];
    if (!param.type.startsWith("Record:")) return [];
    const recordName = param.type.slice(7);
    const record = (fn.records || []).find((candidate) =>
      candidate.name === recordName
    );
    return record.fields
      .filter((field) => field.type === "UInt64Buffer")
      .map((field) => `sagejs_${param.name}_${field.name}`);
  });
  const nativeCall = `primeFieldNativeCall(${jsString(fn.name)}, ` +
    `[${nativeArguments}])`;
  let result;
  if (["uint64", "bool"].includes(fn.returnType)) {
    result = buffers.length === 0
      ? `return ${nativeCall};`
      : [
          "try {",
          `    return ${nativeCall};`,
          "  } finally {",
          ...buffers.map((buffer) =>
            `    ${buffer}.copyBack();`
          ),
          "  }",
        ].join("\n  ");
  } else if (fn.returnType === "PrimeFieldMatrix") {
    result = `const native = ${nativeCall};\n` +
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
  representation: ${JSON.stringify(
    buffers.length === 0
      ? "owned-row-major-u64-buffer"
      : "borrowed-explicit-row-major-uint64-buffer",
  )},
  arithmetic: "u32-prime"
});
${buffers.length === 0 ? "" : `${fn.name}.createUInt64Buffer = createUInt64Buffer;`}
${fn.name}.nativeAvailable = nativeAddon !== null;`;
}

function generateJavaScript(ir, options = {}) {
  function emitFloat64Statement(operation, indent, uint64BigInt) {
    if (operation.kind === "uint64.constant") {
      return `${indent}${operation.target} = ${operation.value}` +
        `${uint64BigInt ? "n" : ""};`;
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
    if (operation.kind === "float64.negate") {
      return `${indent}${operation.target} = -${operation.source};`;
    }
    if (operation.kind === "float64.compare" ||
        operation.kind === "uint64.compare") {
      const operator = {
        eq: "===", ne: "!==", lt: "<", le: "<=", gt: ">", ge: ">=",
      }[operation.operation];
      return `${indent}${operation.target} = ${operation.left} ${operator} ` +
        `${operation.right};`;
    }
    if (operation.kind === "uint64.binary") {
      const helper = uint64BigInt ? "uint64Binary" : "uint64NumberBinary";
      return `${indent}${operation.target} = ${helper}(` +
        `${jsString(operation.operation)}, ${operation.left}, ` +
        `${operation.right});`;
    }
    if (operation.kind === "float64.buffer.copy") {
      return `${indent}${operation.target} = ${operation.source};`;
    }
    if (operation.kind === "float64.buffer.length") {
      return `${indent}${operation.target} = ` +
        `${uint64BigInt ? "BigInt(" : ""}${operation.buffer}.length` +
        `${uint64BigInt ? ")" : ""};`;
    }
    if (operation.kind === "float64.record.view") {
      return `${indent}${operation.target} = float64RecordView(` +
        `${operation.buffer}, ` +
        `${uint64BigInt ? `Number(${operation.start})` : operation.start}, ` +
        `${uint64BigInt ? `Number(${operation.length})` : operation.length});`;
    }
    if (operation.kind === "float64.buffer.get") {
      return `${indent}${operation.target} = float64BufferGet(` +
        `${operation.buffer}, ` +
        `${uint64BigInt ? `Number(${operation.index})` : operation.index});`;
    }
    if (operation.kind === "float64.buffer.set") {
      return `${indent}float64BufferSet(${operation.buffer}, ` +
        `${uint64BigInt ? `Number(${operation.index})` : operation.index}, ` +
        `${operation.value});`;
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
          `${operation.index} += ${operation.step || 1}` +
          `${uint64BigInt ? "n" : ""}) {`,
        ...operation.body.map((item) =>
          emitFloat64Statement(item, `${indent}  `, uint64BigInt)
        ),
        `${indent}}`,
      ].join("\n");
    }
    if (operation.kind === "if") {
      return [
        ...operation.condition.operations.map((item) =>
          emitFloat64Statement(item, indent, uint64BigInt)
        ),
        `${indent}if (${operation.condition.value}) {`,
        ...operation.body.map((item) =>
          emitFloat64Statement(item, `${indent}  `, uint64BigInt)
        ),
        `${indent}}${operation.alternative.length > 0 ? " else {" : ""}`,
        ...operation.alternative.map((item) =>
          emitFloat64Statement(item, `${indent}  `, uint64BigInt)
        ),
        ...(operation.alternative.length > 0 ? [`${indent}}`] : []),
      ].join("\n");
    }
    if (operation.kind === "return") {
      return `${indent}return ${operation.value};`;
    }
    throw new Error(`unsupported binary64 JavaScript operation ${operation.kind}`);
  }

  function emitFloat64PublicFunction(fn) {
    const uint64BigInt = hasUint64Bitwise(fn.body);
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
        emitFloat64Statement(operation, "  ", uint64BigInt)
      ).join("\n") + "\n}";
    const validation = fn.params.map((param) => param.type === "uint64"
      ? uint64Validation(param.name)
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
      ? uint64BigInt ? `BigInt(${param.name})` : `Number(${param.name})`
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
        `    sagejs_native_result = nativeFloat64Call(` +
          `${jsString(fn.name)}, [${nativeArgs}]);\n` +
        `  } finally {\n${copyBack}\n  }\n` +
        `  return sagejs_native_result;`
      : `  return nativeFloat64Call(${jsString(fn.name)}, [${nativeArgs}]);`;
    return `${fallback}\n\nfunction ${fn.name}(${params}) {\n` +
      `  if (arguments.length !== ${fn.params.length}) {\n` +
      `    throw new TypeError("${fn.name}() expects exactly ` +
        `${fn.params.length} arguments");\n` +
      "  }\n" + validation + "\n" +
      `  if (nativeAddon !== null) {\n${nativeCall}\n  }\n` +
      `  return javascript_${fn.name}(${fallbackArgs});\n` +
      `}\n${fn.name}.javascript = function (${params}) {\n` +
      `  if (arguments.length !== ${fn.params.length}) {\n` +
      `    throw new TypeError("${fn.name}() expects exactly ` +
        `${fn.params.length} arguments");\n` +
      `  }\n${validation}\n` +
      `  return javascript_${fn.name}(${fallbackArgs});\n` +
      `};\n` +
      `${fn.name}.nativeAvailable = nativeAddon !== null;\n` +
      `${fn.name}.backendFor = () => nativeAddon === null ` +
        `? "javascript-number" : "native-double";\n` +
      `${fn.name}.backendPolicy = Object.freeze(` +
        `${JSON.stringify(fn.analysis.backend)});`;
  }

  const exports = ir.functions.map((fn) => fn.name).join(", ");
  return `"use strict";

const requestedNativeMode = process.env.SAGEJS_NATIVE_MODE || "auto";
if (!["auto", "dynamic", "javascript", "native"].includes(
    requestedNativeMode)) {
  throw new RangeError(
    "SAGEJS_NATIVE_MODE must be auto, dynamic, javascript, or native");
}
const nativeAddonDisabled =
  requestedNativeMode === "dynamic" ||
  requestedNativeMode === "javascript" ||
  (requestedNativeMode === "auto" &&
    process.env.SAGEJS_NATIVE_DISABLE === "1");
const nativeAddonRequired =
  requestedNativeMode === "native" ||
  (requestedNativeMode === "auto" &&
    process.env.SAGEJS_NATIVE_REQUIRED === "1");
let nativeAddon = null;
if (!nativeAddonDisabled) {
  let packedAddonError = null;
  try {
    const pack = require("../pack/sagejs_native_kernel_pack.node");
    if (pack.__sagejsPackAbi !== ${NATIVE_PACK_ABI_VERSION}) {
      throw new Error("incompatible Sage.js production native pack ABI");
    }
    nativeAddon = pack[${jsString(options.cacheKey || "")}];
    if (nativeAddon === null || typeof nativeAddon !== "object") {
      throw new Error("production native pack is missing kernel namespace " +
        ${jsString(options.cacheKey || "")});
    }
  } catch (error) {
    packedAddonError = error;
  }
  if (nativeAddon === null) {
    try {
      nativeAddon = require("./build/Release/sagejs_native_kernel.node");
    } catch (error) {
      if (nativeAddonRequired) {
        if (packedAddonError !== null &&
            packedAddonError.code !== "MODULE_NOT_FOUND") {
          throw packedAddonError;
        }
        throw error;
      }
    }
  }
}

const integerBackendOverride =
  process.env.SAGEJS_NATIVE_INTEGER_BACKEND ||
  (requestedNativeMode === "native" ? "tagged" : "auto");
if (!["auto", "bigint", "tagged", "gmp"].includes(integerBackendOverride)) {
  throw new RangeError(
    "SAGEJS_NATIVE_INTEGER_BACKEND must be auto, bigint, tagged, or gmp");
}

let immutableUInt64LeaseBorrow = null;
function configureImmutableUInt64Capsules(borrow) {
  if (typeof borrow !== "function") {
    throw new TypeError("immutable uint64 capsule borrow must be callable");
  }
  if (immutableUInt64LeaseBorrow !== null &&
      immutableUInt64LeaseBorrow !== borrow) {
    throw new Error("immutable uint64 capsule runtime is already configured");
  }
  immutableUInt64LeaseBorrow = borrow;
}

function deepFreezeAutomaticSelection(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreezeAutomaticSelection(nested);
    }
    Object.freeze(value);
  }
  return value;
}

${javascriptRuntime(ir)}

const float64BufferViewTag = Symbol("sagejs.native.Float64BufferView");
const int64BufferViewTag = Symbol("sagejs.native.Int64BufferView");
const integerBufferViewTag = Symbol("sagejs.native.IntegerBufferView");
const immutableUInt64LeaseViewTag =
  Symbol("sagejs.native.ImmutableUInt64LeaseView");

function uint64Binary(operation, left, right) {
  const a = BigInt(left);
  const b = BigInt(right);
  if (operation === "floordiv" || operation === "mod") {
    if (b === 0n) {
      throw new RangeError("unsigned integer division or modulo by zero");
    }
    return operation === "floordiv" ? a / b : a % b;
  }
  if (operation === "lshift") {
    if (b >= 64n) {
      nativeRaise(
        "OverflowError", "uint64 shift count must be between 0 and 63");
    }
    return BigInt.asUintN(64, a << b);
  }
  if (operation === "rshift") {
    if (b >= 64n) {
      nativeRaise(
        "OverflowError", "uint64 shift count must be between 0 and 63");
    }
    return a >> b;
  }
  if (operation === "bitand") return a & b;
  if (operation === "bitor") return a | b;
  if (operation === "bitxor") return a ^ b;
  if (operation === "add" || operation === "+") {
    return BigInt.asUintN(64, a + b);
  }
  if (operation === "sub" || operation === "-") {
    return BigInt.asUintN(64, a - b);
  }
  if (operation === "mul" || operation === "*") {
    return BigInt.asUintN(64, a * b);
  }
  throw new Error("unsupported uint64 operation " + operation);
}

function uint64NumberBinary(operation, left, right) {
  const result = uint64Binary(operation, left, right);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      "JavaScript fallback cannot represent uint64 beyond Number.MAX_SAFE_INTEGER");
  }
  return Number(result);
}

function isTypedArrayKind(value, name) {
  return ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object " + name + "]";
}

function isPackedIntegerBuffer(value) {
  return value !== null && typeof value === "object" &&
    isTypedArrayKind(value.sizes, "Int32Array") &&
    isTypedArrayKind(value.limbs, "BigUint64Array") &&
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

function integerBufferFitsSignedInt64(buffer) {
  const view = integerBufferView(buffer);
  const minimum = -(1n << 63n);
  const maximum = (1n << 63n) - 1n;
  if (view.packed === undefined) {
    for (let index = 0; index < view.length; index += 1) {
      const value = BigInt(Reflect.get(view.data, String(view.offset + index)));
      if (value < minimum || value > maximum) return false;
    }
    return true;
  }
  const packed = view.packed;
  for (let index = 0; index < view.length; index += 1) {
    const position = view.offset + index;
    const signedSize = packed.sizes[position];
    if (signedSize > 1 || signedSize < -1) return false;
    if (signedSize === 0) continue;
    const magnitude = packed.limbs[position * packed.wordCapacity];
    if (signedSize > 0) {
      if (magnitude > 0x7fffffffffffffffn) return false;
    } else if (magnitude > 0x8000000000000000n) {
      return false;
    }
  }
  return true;
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

const nativeIntegerVectorEntryCharge = 32n;

function nativeIntegerPayloadCharge(value) {
  const exact = value < 0n ? -value : value;
  return exact === 0n ? 0n : BigInt(Math.ceil(exact.toString(2).length / 8));
}

function createNativeIntegerVector(capacity, memoryLimit) {
  const exactCapacity = BigInt(capacity);
  const exactLimit = BigInt(memoryLimit);
  if (exactCapacity < 0n || exactCapacity > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("NativeIntegerVector capacity is too large");
  }
  const baseCharge = exactCapacity * nativeIntegerVectorEntryCharge;
  if (baseCharge > exactLimit) {
    nativeRaise("MemoryError", "NativeIntegerVector memory limit exceeded");
  }
  return {
    values: Array(Number(exactCapacity)).fill(0n),
    payloadCharges: Array(Number(exactCapacity)).fill(0n),
    memoryLimit: exactLimit,
    chargedBytes: baseCharge,
    open: true,
  };
}

function nativeIntegerVectorRequireOpen(vector) {
  if (vector === null || typeof vector !== "object" || vector.open !== true) {
    throw new RangeError("NativeIntegerVector is closed");
  }
  return vector.values;
}

function nativeIntegerVectorPosition(vector, index) {
  const values = nativeIntegerVectorRequireOpen(vector);
  const exact = BigInt(index);
  if (exact < 0n || exact >= BigInt(values.length)) {
    nativeRaise("IndexError", "NativeIntegerVector index out of range");
  }
  return Number(exact);
}

function nativeIntegerVectorReserve(vector, position, payload) {
  nativeIntegerVectorRequireOpen(vector);
  const retained = vector.chargedBytes - vector.payloadCharges[position];
  const charge = retained + payload;
  if (charge > vector.memoryLimit) {
    nativeRaise("MemoryError", "NativeIntegerVector memory limit exceeded");
  }
  vector.chargedBytes = charge;
  vector.payloadCharges[position] = payload;
}

function nativeIntegerVectorLength(vector) {
  return BigInt(nativeIntegerVectorRequireOpen(vector).length);
}

function nativeIntegerVectorGet(vector, index) {
  const position = nativeIntegerVectorPosition(vector, index);
  return nativeIntegerVectorRequireOpen(vector)[position];
}

function nativeIntegerVectorSet(vector, index, value) {
  const position = nativeIntegerVectorPosition(vector, index);
  const exact = BigInt(value);
  nativeIntegerVectorReserve(
    vector, position, nativeIntegerPayloadCharge(exact));
  vector.values[position] = exact;
}

function nativeIntegerVectorAddmul(vector, index, left, right, subtract) {
  const position = nativeIntegerVectorPosition(vector, index);
  const exactLeft = BigInt(left);
  const exactRight = BigInt(right);
  const current = vector.values[position];
  const currentBits = current === 0n
    ? 0 : (current < 0n ? -current : current).toString(2).length;
  const leftBits = exactLeft === 0n
    ? 0 : (exactLeft < 0n ? -exactLeft : exactLeft).toString(2).length;
  const rightBits = exactRight === 0n
    ? 0 : (exactRight < 0n ? -exactRight : exactRight).toString(2).length;
  const productBits = leftBits === 0 || rightBits === 0
    ? 0 : leftBits + rightBits;
  const conservativePayload = BigInt(
    Math.ceil((Math.max(currentBits, productBits) + 1) / 8));
  nativeIntegerVectorReserve(vector, position, conservativePayload);
  const result = subtract
    ? current - exactLeft * exactRight
    : current + exactLeft * exactRight;
  vector.values[position] = result;
}

function nativeIntegerVectorSwap(vector, leftIndex, rightIndex) {
  const left = nativeIntegerVectorPosition(vector, leftIndex);
  const right = nativeIntegerVectorPosition(vector, rightIndex);
  const temporary = vector.values[left];
  vector.values[left] = vector.values[right];
  vector.values[right] = temporary;
  const temporaryCharge = vector.payloadCharges[left];
  vector.payloadCharges[left] = vector.payloadCharges[right];
  vector.payloadCharges[right] = temporaryCharge;
}

function nativeIntegerVectorClose(vector) {
  if (vector === null || typeof vector !== "object" || vector.open !== true) {
    return;
  }
  vector.values.fill(0n);
  vector.values.length = 0;
  vector.payloadCharges.fill(0n);
  vector.payloadCharges.length = 0;
  vector.chargedBytes = 0n;
  vector.open = false;
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

function createFloat64Buffer(source) {
  if (Number.isSafeInteger(source) && source >= 0) {
    return new Float64Array(source);
  }
  return Float64Array.from(source, (value) => Number(value));
}

function createUInt64Buffer(source) {
  if (Number.isSafeInteger(source) && source >= 0) {
    return new BigUint64Array(source);
  }
  return BigUint64Array.from(source, (value) => BigInt(value));
}

function asUInt64Buffer(source) {
  return isTypedArrayKind(source, "BigUint64Array")
    ? source : createUInt64Buffer(source);
}

function immutableUInt64Borrow(value) {
  if (immutableUInt64LeaseBorrow === null) return null;
  const typed = immutableUInt64LeaseBorrow(value);
  if (typed === null) return null;
  if (!isTypedArrayKind(typed, "BigUint64Array")) {
    throw new TypeError(
      "immutable uint64 capsule runtime returned an invalid buffer");
  }
  return typed;
}

function uint64ValidatedArgument(value, argument = "buffer") {
  return immutableUInt64Borrow(value) === null
    ? uint64BufferView(value, argument) : value;
}

function uint64DynamicBufferView(value, argument = "buffer") {
  if (immutableUInt64Borrow(value) !== null) {
    throw new TypeError(
      "immutable UInt64Buffer leases require a native read-only kernel; " +
      "dynamic fallback requires an owned copy");
  }
  return uint64BufferView(value, argument);
}

function uint64BufferView(value, argument = "buffer") {
  const immutable = immutableUInt64Borrow(value);
  if (immutable !== null) {
    return Object.freeze({
      [immutableUInt64LeaseViewTag]: true,
      typed: immutable,
      length: immutable.length,
    });
  }
  if (value === null || (typeof value !== "object" &&
      typeof value !== "function")) {
    throw new TypeError(argument + " must be a UInt64Buffer");
  }
  const length = Number(Reflect.get(value, "length"));
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(argument + " must have a nonnegative safe length");
  }
  // BigUint64Array is already a complete representation/range proof.  Do not
  // turn a constant-time packed ABI check into a full matrix scan.
  if (isTypedArrayKind(value, "BigUint64Array")) return value;
  for (let index = 0; index < length; index += 1) {
    const entry = Reflect.get(value, String(index));
    const exact = typeof entry === "bigint"
      ? entry : Number.isSafeInteger(entry) ? BigInt(entry) : -1n;
    if (exact < 0n || exact > 18446744073709551615n) {
      throw new RangeError("UInt64Buffer value is outside unsigned 64-bit");
    }
  }
  return value;
}

function uint64BufferGet(buffer, index) {
  const view = uint64BufferView(buffer);
  const exact = typeof index === "bigint" ? index : BigInt(index);
  if (exact < -BigInt(view.length) || exact >= BigInt(view.length)) {
    throw new RangeError("UInt64Buffer index out of range");
  }
  const position = exact < 0n ? BigInt(view.length) + exact : exact;
  const data = view[immutableUInt64LeaseViewTag] === true ? view.typed : view;
  return BigInt(Reflect.get(data, String(Number(position))));
}

function uint64BufferSet(buffer, index, value) {
  const view = uint64BufferView(buffer);
  if (view[immutableUInt64LeaseViewTag] === true) {
    throw new TypeError("immutable UInt64Buffer lease is read-only");
  }
  const exactIndex = typeof index === "bigint" ? index : BigInt(index);
  if (exactIndex < -BigInt(view.length) ||
      exactIndex >= BigInt(view.length)) {
    throw new RangeError("UInt64Buffer index out of range");
  }
  const exactValue = typeof value === "bigint" ? value : BigInt(value);
  if (exactValue < 0n || exactValue > 18446744073709551615n) {
    throw new RangeError("UInt64Buffer value is outside unsigned 64-bit");
  }
  const position = exactIndex < 0n
    ? BigInt(view.length) + exactIndex : exactIndex;
  if (!Reflect.set(view, String(Number(position)), exactValue)) {
    throw new TypeError("UInt64Buffer is not writable");
  }
}

function uint64NativeBuffer(value, argument, writable = false) {
  const immutable = immutableUInt64Borrow(value);
  if (immutable !== null) {
    if (writable) {
      throw new TypeError("immutable UInt64Buffer lease is read-only");
    }
    return { typed: immutable, copyBack() {} };
  }
  const view = uint64BufferView(value, argument);
  if (isTypedArrayKind(view, "BigUint64Array")) {
    return { typed: view, copyBack() {} };
  }
  const typed = new BigUint64Array(view.length);
  for (let index = 0; index < view.length; index += 1) {
    typed[index] = BigInt(Reflect.get(view, String(index)));
  }
  return {
    typed,
    copyBack() {
      for (let index = 0; index < view.length; index += 1) {
        if (!Reflect.set(view, String(index), typed[index])) {
          throw new TypeError("UInt64Buffer is not writable");
        }
      }
    },
  };
}

function uint64RecordField(value, argument, modulus = false) {
  if (!(typeof value === "bigint" || Number.isSafeInteger(value))) {
    nativeRaise("TypeError", argument + " must be an exact integer");
  }
  if (value < 0 || value > 18446744073709551615n) {
    nativeRaise("OverflowError", argument + " is outside uint64");
  }
  if (modulus && (value < 2 || value > 4294967295n)) {
    nativeRaise("ValueError", argument +
      " must be a prime between 2 and 2^32 - 1");
  }
  return value;
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
    nativeRaise("IndexError", "Float64Record is outside its buffer");
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
    nativeRaise("IndexError", "Float64 buffer index out of range");
  }
  return Number(Reflect.get(view.data, String(view.offset + index)));
}

function float64BufferSet(buffer, index, value) {
  const view = float64BufferView(buffer);
  if (!Number.isSafeInteger(index) || index < 0 || index >= view.length) {
    nativeRaise("IndexError", "Float64 buffer index out of range");
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

function integerModUInt64(left, right) {
  if (right === 0n) throw new RangeError("integer division or modulo by zero");
  const remainder = left % right;
  return remainder < 0n ? remainder + right : remainder;
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

function nativeExactCall(name, args, backend = "tagged", declaredErrors = null) {
  try {
    const property = backend === "gmp" ? name + "$gmp" : name;
    return nativeAddon[property](...args);
  } catch (error) {
    const message = String(error && error.message || error);
    const declaredException = declaredErrors === null
      ? undefined : declaredErrors[message];
    if (declaredException !== undefined) {
      nativeRaise(declaredException, message);
    }
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
    if (message.includes("uint64 shift count")) {
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
    if (message.includes("NativeIntegerVector memory limit") ||
        message.includes("NativeIntegerVector allocation failed")) {
      nativeRaise("MemoryError", message);
    }
    if (message.includes("NativeIntegerVector index")) {
      nativeRaise("IndexError", message);
    }
    if (message.includes("matrix modulus must be at least") ||
        message.includes("buffer length does not match dimensions")) {
      nativeRaise("ValueError", message);
    }
    if (message.includes("nmod matrix is too large to convert") ||
        message.includes("outside unsigned 64-bit")) {
      nativeRaise("OverflowError", message);
    }
    if (message.includes("sequence index")) nativeRaise("IndexError", message);
    throw error;
  }
}

function nativeFloat64Call(name, args) {
  try {
    return nativeAddon[name](...args);
  } catch (error) {
    const message = String(error && error.message || error);
    if (message.includes("Float64Record") ||
        message.includes("Float64 buffer index")) {
      nativeRaise("IndexError", message);
    }
    if (message.includes("division by zero")) {
      nativeRaise("ZeroDivisionError", message);
    }
    if (message.includes("math domain")) nativeRaise("ValueError", message);
    if (message.includes("uint64 shift count")) {
      nativeRaise("OverflowError", message);
    }
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
    if (message.includes("uint64 shift count")) {
      nativeRaise("OverflowError", message);
    }
    throw error;
  }
}

${ir.functions.map((fn) =>
    fn.kernelKind === "integer"
      ? emitExactPublicFunction(fn, options.automaticSelections?.[fn.name])
      : fn.kernelKind === "float64"
        ? emitFloat64PublicFunction(fn)
      : fn.kernelKind === "prime-field-matrix"
        ? emitPrimeFieldPublicFunction(fn)
        : fn.kernelKind === "prime-field-source"
          ? emitPrimeSourcePublicFunction(fn)
        : emitPublicFunction(fn)
  ).join("\n\n")}

const nativeFunctions = { ${exports} };
const nativeCompatibility = Object.freeze({
  cacheKey: ${jsString(options.cacheKey || "")},
  sourceHash: ${jsString(options.sourceHash || "")},
  nativeAbi: ${Number(options.nativeAbi || 0)},
  foreignDeclarations: Object.freeze(${JSON.stringify(
    options.foreignDeclarations || [],
  )}.map((declaration) => Object.freeze(declaration))),
});
const compiledExecutionMode = nativeAddon === null
  ? "javascript"
  : requestedNativeMode === "native"
    ? "native"
    : "native-capable";
const compiledHostBoundary = Object.freeze({
  publicCrossingsPerCall: 1,
  callbacksInsideCore: 0,
  dependenciesStayInsideCore: true,
});
for (const fn of Object.values(nativeFunctions)) {
  fn.__sagejs_native_execution_mode__ = compiledExecutionMode;
  fn.__sagejs_native_boundary__ = compiledHostBoundary;
  fn.createFloat64Buffer = createFloat64Buffer;
  fn.createUInt64Buffer = createUInt64Buffer;
  fn.asUInt64Buffer = asUInt64Buffer;
}
const nativeRegister = globalThis.__sagejs_native_register__;
if (typeof nativeRegister === "function") {
  nativeRegister(
    ${jsString(options.sourcePath || "")},
    ${jsString(options.sourceHash || "")},
    nativeFunctions,
    nativeCompatibility,
  );
}

module.exports = {
  ...nativeFunctions,
  __sagejsConfigureImmutableUInt64Capsules:
    configureImmutableUInt64Capsules,
  createIntegerBuffer,
  createFloat64Buffer,
  createUInt64Buffer,
  cacheKey: nativeCompatibility.cacheKey,
  sourceHash: nativeCompatibility.sourceHash,
  nativeAbi: nativeCompatibility.nativeAbi,
  foreignDeclarations: nativeCompatibility.foreignDeclarations,
  executionMode: compiledExecutionMode,
  nativeAvailable: nativeAddon !== null,
  primeFieldTuning: Object.freeze(${JSON.stringify(
    options.primeFieldTuning || {},
  )}),
  sourceBoundsChecked: ${options.sourceBoundsChecked === true ? "true" : "false"},
};
`;
}

module.exports = {
  NATIVE_PACK_ABI_VERSION,
  generateJavaScript,
};
