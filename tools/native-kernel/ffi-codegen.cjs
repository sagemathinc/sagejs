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

function resourceForType(operation, type) {
  return (operation.foreign.resources || []).find(
    (resource) => resource.python_name === type,
  );
}

function isForeignResourceType(fn, type) {
  return (fn.foreignResources || []).some(
    (resource) => resource.python_name === type,
  );
}

function resourceForFunctionType(fn, type) {
  return (fn.foreignResources || []).find(
    (resource) => resource.python_name === type,
  );
}

function emitResourceCall(operation, context, indent) {
  const fn = operation.foreign.function;
  const native = fn.native;
  const returned = resourceForType(operation, fn.signature.return_type);
  const args = native.arguments.map((argument) => {
    if (argument.source === "result") return context.result(operation.target);
    const source = argumentBySource(operation, argument.source);
    const resource = resourceForType(operation, source.type);
    if (resource !== undefined) return context.value(source.name);
    if (argument.abi_type === "ulong") {
      return `(ulong) ${context.value(source.name)}`;
    }
    if (argument.abi_type === "int") {
      return `(int) ${context.value(source.name)}`;
    }
    throw new Error(
      `${operation.foreign.declarationId} uses unsupported resource ABI ` +
      `${argument.abi_type}`,
    );
  });
  if (returned !== undefined) {
    const validation = fn.signature.parameters.flatMap((parameter, index) => {
      if (parameter.minimum === undefined) return [];
      const source = operation.arguments[index];
      return [
        `${indent}if (${context.value(source.name)} < ` +
          `UINT64_C(${parameter.minimum}))`,
        `${indent}{`,
        `${indent}    sagejs_native_status_set(status, ` +
          `SAGEJS_NATIVE_RANGE_ERROR, "FFI resource argument is below minimum ` +
          `${parameter.minimum}");`,
        `${indent}    ${context.failure}`,
        `${indent}}`,
      ];
    });
    return [
      ...validation,
      `${indent}if (!${native.symbol}(${args.join(", ")}))`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR, ` +
        `${JSON.stringify(fn.errors.message)});`,
      `${indent}    ${context.failure}`,
      `${indent}}`,
      `${indent}${context.resourceInitialized(operation.target)} = 1;`,
    ].join("\n");
  }
  return `${indent}${context.result(operation.target)} = ` +
    `${native.symbol}(${args.join(", ")});`;
}

function usesResource(operation) {
  const signature = operation.foreign.function.signature;
  return resourceForType(operation, signature.return_type) !== undefined ||
    signature.parameters.some((parameter) =>
      resourceForType(operation, parameter.type) !== undefined
    );
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

function emitPackedNmodCall(operation, context, indent) {
  const native = operation.foreign.function.native;
  const adapters = native.arguments.filter((argument) =>
    argument.adapter?.kind === "packed_nmod_matrix"
  );
  if (adapters.length !== native.arguments.length) {
    throw new Error(
      `${operation.foreign.declarationId} mixes packed matrices and direct arguments`,
    );
  }
  const declarations = [];
  const validation = [];
  const initialization = [];
  const copyInput = [];
  const copyOutput = [];
  const cleanup = [];
  const callArguments = [];
  const parameter = (name) => context.value(argumentBySource(operation, name).name);
  for (const [index, argument] of adapters.entries()) {
    const adapter = argument.adapter;
    const prefix = `sagejs_ffi_${cName(operation.target)}_${index}`;
    const matrix = `${prefix}_matrix`;
    const data = parameter(adapter.data);
    const rows = parameter(adapter.rows);
    const columns = parameter(adapter.columns);
    const modulus = parameter(adapter.modulus);
    const count = `${prefix}_count`;
    declarations.push(
      `${indent}    nmod_mat_t ${matrix};`,
      `${indent}    size_t ${count};`,
    );
    validation.push(
      `${indent}    if (${modulus} < UINT64_C(2))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"nmod matrix modulus must be at least 2");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
      `${indent}    if (${rows} > (uint64_t) WORD_MAX || ` +
        `${columns} > (uint64_t) WORD_MAX ||`,
      `${indent}        (${rows} != 0 && ${columns} > ` +
        `(uint64_t) SIZE_MAX / ${rows}))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"nmod matrix is too large to convert");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
      `${indent}    ${count} = (size_t) ${rows} * (size_t) ${columns};`,
      `${indent}    if (${data}.length != ${count})`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"nmod matrix buffer length does not match dimensions");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
    );
    initialization.push(
      `${indent}    nmod_mat_init(${matrix}, (slong) ${rows}, ` +
        `(slong) ${columns}, (ulong) ${modulus});`,
    );
    if (adapter.access === "read") {
      copyInput.push(
        `${indent}    for (size_t sagejs_index = 0; ` +
          `sagejs_index < ${count}; sagejs_index++)`,
        `${indent}        nmod_mat_entry(${matrix},`,
        `${indent}            (slong) (sagejs_index / (size_t) ${columns}),`,
        `${indent}            (slong) (sagejs_index % (size_t) ${columns})) =`,
        `${indent}            (ulong) (${data}.data[sagejs_index] % ${modulus});`,
      );
    } else {
      copyOutput.push(
        `${indent}    for (size_t sagejs_index = 0; ` +
          `sagejs_index < ${count}; sagejs_index++)`,
        `${indent}        ${data}.data[sagejs_index] = (uint64_t) nmod_mat_entry(`,
        `${indent}            ${matrix},`,
        `${indent}            (slong) (sagejs_index / (size_t) ${columns}),`,
        `${indent}            (slong) (sagejs_index % (size_t) ${columns}));`,
      );
    }
    cleanup.unshift(`${indent}    nmod_mat_clear(${matrix});`);
    callArguments.push(matrix);
  }
  const raw = `sagejs_ffi_${cName(operation.target)}_result`;
  declarations.push(`${indent}    ${native.return_type} ${raw};`);
  const call = `${indent}    ${raw} = ${native.symbol}(` +
    `${callArguments.join(", ")});`;
  const checked = operation.foreign.function.errors.policy === "zero_is_error"
    ? [
        `${indent}    if (${raw} == 0)`,
        `${indent}    {`,
        ...cleanup,
        `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR, ` +
          `${JSON.stringify(operation.foreign.function.errors.message)});`,
        `${indent}        ${context.failure}`,
        `${indent}    }`,
      ]
    : [];
  const result = native.return_type === "slong"
    ? `${indent}    ${context.result(operation.target)} = (uint64_t) ${raw};`
    : `${indent}    ${context.result(operation.target)} = ${raw} != 0;`;
  return [
    `${indent}{`,
    ...declarations,
    ...validation,
    ...initialization,
    ...copyInput,
    call,
    ...checked,
    ...copyOutput,
    ...cleanup,
    result,
    `${indent}}`,
  ].join("\n");
}

function usesFmpz(operation) {
  return operation.foreign.function.native.arguments.some(
    (argument) => argument.abi_type === "fmpz_t",
  );
}

function emitExactForeignCall(operation, context, indent) {
  if (usesResource(operation)) return emitResourceCall(operation, context, indent);
  if (operation.foreign.function.native.arguments.some((argument) =>
    argument.adapter?.kind === "packed_nmod_matrix"
  )) return emitPackedNmodCall(operation, context, indent);
  return usesFmpz(operation)
    ? emitFmpzCall(operation, context.value, context.result, indent, false)
    : emitDirectCall(operation, context.value, context.result, indent);
}

function emitTaggedForeignCall(operation, context, indent) {
  if (usesResource(operation)) return emitResourceCall(operation, context, indent);
  if (operation.foreign.function.native.arguments.some((argument) =>
    argument.adapter?.kind === "packed_nmod_matrix"
  )) return emitPackedNmodCall(operation, context, indent);
  return usesFmpz(operation)
    ? emitFmpzCall(operation, context.value, context.result, indent, true)
    : emitDirectCall(operation, context.value, context.result, indent);
}

function emitWordForeignCall(operation, context, indent) {
  if (usesResource(operation)) return context.promote(operation, indent);
  if (operation.foreign.function.native.arguments.some((argument) =>
    argument.adapter?.kind === "packed_nmod_matrix"
  )) return emitPackedNmodCall(operation, context, indent);
  if (usesFmpz(operation) ||
      operation.foreign.function.signature.return_type === "Integer") {
    return context.promote(operation, indent);
  }
  return emitDirectCall(operation, context.value, context.result, indent);
}

function javascriptForeignCall(operation, indent) {
  const foreign = operation.foreign;
  const signature = foreign.function.signature;
  const returned = resourceForType(operation, signature.return_type);
  const metadata = {
    returned: returned === undefined ? null : {
      identity: `resource:${foreign.declarationIdentity.split(":")[0]}:${returned.id}`,
      closeExport: returned.dynamic.close_export,
    },
    parameters: signature.parameters.map((parameter) => {
      const resource = resourceForType(operation, parameter.type);
      return resource === undefined ? null :
        `resource:${foreign.declarationIdentity.split(":")[0]}:${resource.id}`;
    }),
    minimums: signature.parameters.map((parameter) => parameter.minimum ?? null),
  };
  const resourceStack = metadata.returned !== null ||
    metadata.parameters.some((identity) => identity !== null)
    ? "sagejsFfiResources" : "null";
  return `${indent}${operation.target} = sagejsFfiCall(` +
    `${JSON.stringify(foreign.library.dynamic.package)}, ` +
    `${JSON.stringify(foreign.function.dynamic.export)}, ` +
    `[${operation.arguments.map((argument) => argument.name).join(", ")}], ` +
    `${JSON.stringify(signature.parameters.map((parameter) => parameter.type))}, ` +
    `${JSON.stringify(signature.return_type)}, ` +
    `${JSON.stringify(foreign.function.errors)}, ` +
    `${JSON.stringify(metadata)}, ${resourceStack});`;
}

function javascriptRuntime(ir) {
  if (foreignLibraries(ir).length === 0) return "";
  return `
const sagejsFfiLibraries = new Map();

function sagejsFfiCall(
  packageName, exportName, args, parameterTypes, returnType, errors,
  resourceMetadata, resourceStack
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
    const resourceIdentity = resourceMetadata.parameters[index];
    if (resourceIdentity !== null) {
      if (value === null || value.identity !== resourceIdentity) {
        throw new TypeError("invalid declared FFI resource");
      }
      if (value.closed) throw new Error("FFI resource is closed");
      return value.handle;
    }
    if (type === "Integer") {
      if (typeof value === "bigint") return value;
      if (Number.isSafeInteger(value)) return BigInt(value);
    }
    if (type === "uint64") {
      const exact = typeof value === "bigint"
        ? value
        : Number.isSafeInteger(value) ? BigInt(value) : -1n;
      if (exact >= 0n && exact <= 18446744073709551615n) {
        const minimum = resourceMetadata.minimums[index];
        if (minimum !== null && exact < BigInt(minimum)) {
          nativeRaise("ValueError", "FFI resource argument is below minimum " +
            minimum);
        }
        return exact;
      }
    }
    if (type === "bool" && typeof value === "boolean") return value;
    if (type === "UInt64Buffer" && value !== null &&
        (typeof value === "object" || typeof value === "function")) {
      const length = Number(Reflect.get(value, "length"));
      if (Number.isSafeInteger(length) && length >= 0) {
        for (let position = 0; position < length; position += 1) {
          const entry = Reflect.get(value, String(position));
          const exact = typeof entry === "bigint"
            ? entry : Number.isSafeInteger(entry) ? BigInt(entry) : -1n;
          if (exact < 0n || exact > 18446744073709551615n) {
            throw new TypeError("invalid UInt64Buffer entry");
          }
        }
        return value;
      }
    }
    throw new TypeError("invalid dynamic FFI argument for " + type);
  });
  const result = Reflect.apply(fn, library, marshalled);
  if (errors.policy === "zero_is_error" && result === false) {
    nativeRaise(errors.exception, errors.message);
  }
  if (resourceMetadata.returned !== null) {
    if (result === null || (typeof result !== "object" &&
        typeof result !== "function")) {
      throw new TypeError("FFI backend returned invalid resource");
    }
    const close = Reflect.get(library, resourceMetadata.returned.closeExport);
    if (typeof close !== "function") {
      throw new Error("FFI backend lacks declared resource close export");
    }
    const resource = {
      identity: resourceMetadata.returned.identity,
      handle: result,
      backend: library,
      close,
      closed: false,
    };
    resourceStack.push(resource);
    return resource;
  }
  if (returnType === "bool" && typeof result === "boolean") return result;
  if (returnType === "Integer" && typeof result === "bigint") return result;
  if (returnType === "uint64" && typeof result === "bigint" &&
      result >= 0n && result <= 18446744073709551615n) return result;
  throw new TypeError(
    "FFI backend " + packageName + "." + exportName +
    " returned invalid " + returnType);
}

function sagejsFfiCloseResources(resources) {
  for (let index = resources.length - 1; index >= 0; index -= 1) {
    const resource = resources[index];
    if (resource.closed) continue;
    Reflect.apply(resource.close, resource.backend, [resource.handle]);
    resource.closed = true;
    resource.handle = null;
  }
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
  isForeignResourceType,
  javascriptForeignCall,
  javascriptRuntime,
  resourceForFunctionType,
};
