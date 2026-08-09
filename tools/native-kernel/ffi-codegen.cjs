"use strict";

function cName(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, "_");
}

function foreignLibraries(ir) {
  return ir.foreignLibraries || [];
}

function foreignHeaders(ir) {
  return Array.from(new Set(
    foreignLibraries(ir).flatMap((library) => library.native.headers),
  )).sort();
}

function foreignDependencies(ir) {
  return Array.from(new Set(
    foreignLibraries(ir).flatMap((library) => [
      library.id,
      ...library.native.dependencies,
    ]),
  )).sort();
}

function argumentBySource(operation, source) {
  const parameters = operation.foreign.function.signature.parameters;
  const index = parameters.findIndex((parameter) => parameter.name === source);
  if (index < 0 || operation.arguments[index] === undefined) {
    throw new Error(
      `${operation.foreign.declarationId} has no semantic argument ${source}`,
    );
  }
  return operation.arguments[index];
}

function emitFmpzCall(operation, value, resultValue, indent, tagged) {
  const native = operation.foreign.function.native;
  const prefix = `sagejs_ffi_${cName(operation.target)}`;
  const declarations = [];
  const setup = [];
  const cleanup = [];
  const callArguments = [];
  let resultVariable;
  for (let index = 0; index < native.arguments.length; index += 1) {
    const argument = native.arguments[index];
    if (argument.abi_type !== "fmpz_t") {
      const source = argumentBySource(operation, argument.source);
      if (argument.abi_type === "ulong") {
        callArguments.push(`(ulong) ${value(source.name)}`);
        continue;
      }
      if (argument.abi_type === "int") {
        callArguments.push(`(int) ${value(source.name)}`);
        continue;
      }
      throw new Error(
        `${operation.foreign.declarationId} uses unsupported mixed ABI ${argument.abi_type}`,
      );
    }
    const variable = `${prefix}_${cName(argument.source)}_${index}`;
    declarations.push(`${indent}    fmpz_t ${variable};`);
    setup.push(`${indent}    fmpz_init(${variable});`);
    cleanup.unshift(`${indent}    fmpz_clear(${variable});`);
    callArguments.push(variable);
    if (argument.source === "result") {
      resultVariable = variable;
      continue;
    }
    const source = argumentBySource(operation, argument.source);
    const sourceValue = value(source.name);
    if (tagged) {
      setup.push(`${indent}    sagejs_tagged_make_big(${sourceValue});`);
      setup.push(`${indent}    fmpz_set_mpz(${variable}, (${sourceValue})->big);`);
    } else {
      setup.push(`${indent}    fmpz_set_mpz(${variable}, ${sourceValue});`);
    }
  }
  if (resultVariable === undefined) {
    throw new Error(`${operation.foreign.declarationId} lacks its result adapter`);
  }
  const output = resultValue(operation.target);
  const resultSetup = tagged
    ? [
      `${indent}    sagejs_tagged_make_big(${output});`,
      `${indent}    fmpz_get_mpz((${output})->big, ${resultVariable});`,
    ]
    : [`${indent}    fmpz_get_mpz(${output}, ${resultVariable});`];
  return [
    `${indent}{`,
    ...declarations,
    ...setup,
    `${indent}    ${native.symbol}(${callArguments.join(", ")});`,
    ...resultSetup,
    ...cleanup,
    `${indent}}`,
  ].join("\n");
}

function emitDirectCall(operation, value, resultValue, indent) {
  const native = operation.foreign.function.native;
  const args = native.arguments.map((argument) => {
    const source = argumentBySource(operation, argument.source);
    if (argument.abi_type === "ulong") return `(ulong) ${value(source.name)}`;
    if (argument.abi_type === "int") return `(int) ${value(source.name)}`;
    throw new Error(
      `${operation.foreign.declarationId} uses unsupported direct ABI ${argument.abi_type}`,
    );
  });
  return `${indent}${resultValue(operation.target)} = ` +
    `${native.symbol}(${args.join(", ")});`;
}

function usesFmpz(operation) {
  return operation.foreign.function.native.arguments.some(
    (argument) => argument.abi_type === "fmpz_t",
  );
}

function emitExactForeignCall(operation, context, indent) {
  return usesFmpz(operation)
    ? emitFmpzCall(operation, context.value, context.result, indent, false)
    : emitDirectCall(operation, context.value, context.result, indent);
}

function emitTaggedForeignCall(operation, context, indent) {
  return usesFmpz(operation)
    ? emitFmpzCall(operation, context.value, context.result, indent, true)
    : emitDirectCall(operation, context.value, context.result, indent);
}

function emitWordForeignCall(operation, context, indent) {
  if (usesFmpz(operation) ||
      operation.foreign.function.signature.return_type === "Integer") {
    return context.promote(operation, indent);
  }
  return emitDirectCall(operation, context.value, context.result, indent);
}

function javascriptForeignCall(operation, indent) {
  const foreign = operation.foreign;
  const signature = foreign.function.signature;
  return `${indent}${operation.target} = sagejsFfiCall(` +
    `${JSON.stringify(foreign.library.dynamic.package)}, ` +
    `${JSON.stringify(foreign.function.dynamic.export)}, ` +
    `[${operation.arguments.map((argument) => argument.name).join(", ")}], ` +
    `${JSON.stringify(signature.parameters.map((parameter) => parameter.type))}, ` +
    `${JSON.stringify(signature.return_type)});`;
}

function javascriptRuntime(ir) {
  if (foreignLibraries(ir).length === 0) return "";
  return `
const sagejsFfiLibraries = new Map();

function sagejsFfiCall(
  packageName, exportName, args, parameterTypes, returnType
) {
  let library = sagejsFfiLibraries.get(packageName);
  if (library === undefined) {
    const runtimeRequire = Reflect.get(
      globalThis, "__sagejs_runtime_require__");
    if (typeof runtimeRequire === "function") {
      library = Reflect.apply(runtimeRequire, undefined, [packageName]);
    } else {
      const search = [process.cwd(), ...(module.parent?.paths || [])];
      library = require(require.resolve(packageName, { paths: search }));
    }
    sagejsFfiLibraries.set(packageName, library);
  }
  const fn = Reflect.get(library, exportName);
  if (typeof fn !== "function") {
    throw new Error("FFI backend " + packageName +
      " does not export " + exportName);
  }
  const marshalled = args.map((value, index) => {
    const type = parameterTypes[index];
    if (type === "Integer") {
      if (typeof value === "bigint") return value;
      if (Number.isSafeInteger(value)) return BigInt(value);
    }
    if (type === "uint64") {
      const exact = typeof value === "bigint"
        ? value
        : Number.isSafeInteger(value) ? BigInt(value) : -1n;
      if (exact >= 0n && exact <= 18446744073709551615n) return exact;
    }
    if (type === "bool" && typeof value === "boolean") return value;
    throw new TypeError("invalid dynamic FFI argument for " + type);
  });
  const result = Reflect.apply(fn, library, marshalled);
  if (returnType === "bool" && typeof result === "boolean") return result;
  if (returnType === "Integer" && typeof result === "bigint") return result;
  if (returnType === "uint64" && typeof result === "bigint" &&
      result >= 0n && result <= 18446744073709551615n) return result;
  throw new TypeError(
    "FFI backend " + packageName + "." + exportName +
    " returned invalid " + returnType);
}
`;
}

module.exports = {
  emitExactForeignCall,
  emitTaggedForeignCall,
  emitWordForeignCall,
  foreignDependencies,
  foreignHeaders,
  foreignLibraries,
  javascriptForeignCall,
  javascriptRuntime,
};
