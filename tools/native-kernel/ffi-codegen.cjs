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

function shieldedFunctions(ir) {
  const functions = new Map();
  const seen = new Set();
  function visit(value) {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.kind === "ffi.call" &&
        value.foreign?.function?.exceptions?.policy === "cxx_to_status") {
      const fn = value.foreign.function;
      functions.set(fn.call_plan.declaration_id, fn);
    }
    for (const item of Array.isArray(value) ? value : Object.values(value)) visit(item);
  }
  visit(ir.functions);
  return Array.from(functions.values()).sort((left, right) =>
    left.call_plan.declaration_id.localeCompare(
      right.call_plan.declaration_id,
    ));
}

function shieldParameter(argument) {
  const name = `sagejs_argument_${argument.position}`;
  const lowering = argument.lowering;
  if (lowering.kind === "record" && lowering.pass === "const_pointer") {
    return { declaration: `const ${lowering.c_type} *${name}`, name };
  }
  if (typeof lowering.c_type === "string") {
    return { declaration: `${lowering.c_type} ${name}`, name };
  }
  throw new Error(
    `C++ exception shields do not support ${lowering.kind} arguments yet`,
  );
}

function generateExceptionShims(ir) {
  const functions = shieldedFunctions(ir);
  if (functions.length === 0) return null;
  const declarations = [];
  const definitions = [];
  for (const fn of functions) {
    const parameters = fn.call_plan.arguments.map(shieldParameter);
    const signature = `${fn.call_plan.native_return_c_type} ` +
      `${fn.call_plan.symbol}(` +
      `${parameters.map((item) => item.declaration).join(", ")})`;
    declarations.push(`${signature};`);
    definitions.push(
      `extern "C" ${signature}\n` +
      `{\n` +
      `    try {\n` +
      `        return ${fn.call_plan.foreign_symbol}(` +
        `${parameters.map((item) => item.name).join(", ")});\n` +
      `    } catch (...) {\n` +
      `        return ${fn.exceptions.failure_status};\n` +
      `    }\n` +
      `}`,
    );
  }
  const header = `/* Generated C++ exception-to-status boundary. */\n` +
    `#ifndef SAGEJS_GENERATED_FFI_SHIMS_H\n` +
    `#define SAGEJS_GENERATED_FFI_SHIMS_H\n\n` +
    `${foreignHeaders(ir).map((name) => `#include <${name}>`).join("\n")}\n\n` +
    `#ifdef __cplusplus\nextern "C" {\n#endif\n\n` +
    `${declarations.join("\n")}\n\n` +
    `#ifdef __cplusplus\n}\n#endif\n\n#endif\n`;
  const source = `/* Generated C++ exception-to-status boundary. */\n` +
    `#include "ffi_shims.h"\n\n${definitions.join("\n\n")}\n`;
  return Object.freeze({ header, source, functions: Object.freeze(functions) });
}

function exceptionShimInclude(ir) {
  return shieldedFunctions(ir).length === 0 ? "" : '#include "ffi_shims.h"';
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
    (resource) => (resource.compiler_type || resource.python_name) === type,
  );
}

function resourceForFunctionType(fn, type) {
  return (fn.foreignResources || []).find(
    (resource) => (resource.compiler_type || resource.python_name) === type,
  );
}

function nativeArguments(fn) {
  return fn.call_plan.arguments.map((argument) => ({
    source: argument.source,
    abi_type: argument.abi_type,
    direction: argument.direction,
    adapter: argument.lowering.kind === "adapter"
      ? argument.lowering.fields : null,
    lowering: argument.lowering,
  }));
}

function nativeSymbol(fn) {
  return fn.call_plan.symbol;
}

function nativeReturnType(fn) {
  return fn.call_plan.native_return_c_type;
}

function successCondition(fn, raw) {
  if (fn.result.domain === "status") {
    return fn.result.success.map((value) => `${raw} == ${value}`).join(" || ");
  }
  if (fn.result.domain === "nullable") return `${raw} != NULL`;
  return "1";
}

function failureLines(fn, raw, cleanup, context, indent) {
  if (fn.result.domain === "direct") return [];
  return [
    `${indent}if (!(${successCondition(fn, raw)}))`,
    `${indent}{`,
    ...cleanup,
    `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR, ` +
      `${JSON.stringify(fn.errors.message)});`,
    `${indent}    ${context.failure}`,
    `${indent}}`,
  ];
}

function assignRawResult(fn, raw, target, indent) {
  const semantic = fn.signature.return_type;
  if (fn.result.domain === "nullable") {
    return `${indent}${target} = (uint64_t) *${raw};`;
  }
  if (semantic === "bool") {
    return fn.result.domain === "status"
      ? `${indent}${target} = true;`
      : `${indent}${target} = ${raw} != 0;`;
  }
  if (semantic === "uint64") return `${indent}${target} = (uint64_t) ${raw};`;
  throw new Error(`unsupported declared FFI result ${semantic}`);
}

function emitResourceCall(operation, context, indent, tagged) {
  const fn = operation.foreign.function;
  const callArguments = nativeArguments(fn);
  const returned = resourceForType(operation, fn.signature.return_type);
  const prefix = `sagejs_ffi_${cName(operation.target)}`;
  const declarations = [];
  const setup = [];
  const cleanup = [];
  const aggregateValidation = [];
  let exactResult;
  const args = callArguments.map((argument, index) => {
    if (argument.source === "result" && returned !== undefined) {
      return context.result(operation.target);
    }
    if (argument.abi_type === "fmpz_t") {
      const variable = `${prefix}_${cName(argument.source)}_${index}`;
      declarations.push(`${indent}    fmpz_t ${variable};`);
      setup.push(`${indent}    fmpz_init(${variable});`);
      cleanup.unshift(`${indent}    fmpz_clear(${variable});`);
      if (argument.source === "result") {
        exactResult = variable;
      } else {
        const source = argumentBySource(operation, argument.source);
        const sourceValue = context.value(source.name);
        if (tagged) {
          setup.push(`${indent}    sagejs_tagged_make_big(${sourceValue});`);
          setup.push(
            `${indent}    fmpz_set_mpz(${variable}, (${sourceValue})->big);`,
          );
        } else {
          setup.push(`${indent}    fmpz_set_mpz(${variable}, ${sourceValue});`);
        }
      }
      return variable;
    }
    if (argument.adapter?.kind === "packed_slice") {
      if (argument.adapter.access !== "read") {
        throw new Error(
          `${operation.foreign.declarationId} uses a mutable resource slice`,
        );
      }
      const dataSource = argumentBySource(operation, argument.adapter.data);
      const lengthSource = argumentBySource(operation, argument.adapter.length);
      const data = context.value(dataSource.name);
      const length = context.value(lengthSource.name);
      aggregateValidation.push(
        `${indent}    if (${length} > (uint64_t) SIZE_MAX ||`,
        `${indent}        ${data}.length != (size_t) ${length})`,
        `${indent}    {`,
        `${indent}        sagejs_native_status_set(status, ` +
          `SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"packed slice length does not match its declaration");`,
        `${indent}        ${context.failure}`,
        `${indent}    }`,
      );
      return `${data}.data`;
    }
    if (argument.adapter !== null) {
      throw new Error(
        `${operation.foreign.declarationId} uses unsupported resource adapter ` +
        `${argument.adapter.kind}`,
      );
    }
    const source = argumentBySource(operation, argument.source);
    const resource = resourceForType(operation, source.type);
    if (resource !== undefined) return context.value(source.name);
    if (argument.abi_type === "ulong" || argument.abi_type === "uint64_t") {
      return `(${argument.abi_type}) ${context.value(source.name)}`;
    }
    if (argument.abi_type === "int") {
      return `(int) ${context.value(source.name)}`;
    }
    throw new Error(
      `${operation.foreign.declarationId} uses unsupported resource ABI ` +
      `${argument.abi_type}`,
    );
  });
  const validation = fn.signature.parameters.flatMap((parameter, index) => {
    if (parameter.minimum === undefined) return [];
    const source = operation.arguments[index];
    return [
      `${indent}    if (${context.value(source.name)} < ` +
        `UINT64_C(${parameter.minimum}))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, ` +
        `SAGEJS_NATIVE_RANGE_ERROR, "FFI resource argument is below minimum ` +
        `${parameter.minimum}");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
    ];
  });
  const raw = `${prefix}_result`;
  const needsRaw = fn.native.return_type !== "void";
  if (needsRaw) {
    declarations.push(`${indent}    ${nativeReturnType(fn)} ${raw};`);
  }
  const call = `${nativeSymbol(fn)}(${args.join(", ")})`;
  const invoke = needsRaw
    ? `${indent}    ${raw} = ${call};`
    : `${indent}    ${call};`;
  const checked = needsRaw
    ? failureLines(fn, raw, cleanup, context, `${indent}    `)
    : [];
  const result = [];
  if (returned !== undefined) {
    if (returned.ownership === "owned") {
      result.push(
        `${indent}    ${context.resourceInitialized(operation.target)} = 1;`,
      );
    }
  } else if (fn.signature.return_type === "Integer") {
    if (exactResult === undefined) {
      throw new Error(`${operation.foreign.declarationId} lacks its result adapter`);
    }
    const output = context.result(operation.target);
    if (tagged) {
      result.push(
        `${indent}    sagejs_tagged_make_big(${output});`,
        `${indent}    fmpz_get_mpz((${output})->big, ${exactResult});`,
      );
    } else {
      result.push(`${indent}    fmpz_get_mpz(${output}, ${exactResult});`);
    }
  } else if (needsRaw) {
    result.push(assignRawResult(
      fn,
      raw,
      context.result(operation.target),
      `${indent}    `,
    ));
  }
  return [
    `${indent}{`,
    ...declarations,
    ...validation,
    ...aggregateValidation,
    ...setup,
    invoke,
    ...checked,
    ...result,
    ...cleanup,
    `${indent}}`,
  ].join("\n");
}

function usesResource(operation) {
  const signature = operation.foreign.function.signature;
  return resourceForType(operation, signature.return_type) !== undefined ||
    signature.parameters.some((parameter) =>
      resourceForType(operation, parameter.type) !== undefined
    );
}

function emitFmpzCall(operation, value, resultValue, indent, tagged) {
  const fn = operation.foreign.function;
  const native = fn.native;
  const prefix = `sagejs_ffi_${cName(operation.target)}`;
  const declarations = [];
  const setup = [];
  const cleanup = [];
  const callArguments = [];
  let resultVariable;
  const arguments_ = nativeArguments(fn);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument.abi_type !== "fmpz_t") {
      const source = argumentBySource(operation, argument.source);
      if (argument.abi_type === "ulong" || argument.abi_type === "uint64_t") {
        callArguments.push(`(${argument.abi_type}) ${value(source.name)}`);
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
    `${indent}    ${nativeSymbol(fn)}(${callArguments.join(", ")});`,
    ...resultSetup,
    ...cleanup,
    `${indent}}`,
  ].join("\n");
}

function emitDirectCall(operation, context, indent) {
  const fn = operation.foreign.function;
  const native = fn.native;
  const args = nativeArguments(fn).map((argument) => {
    const source = argumentBySource(operation, argument.source);
    if (argument.abi_type === "ulong" || argument.abi_type === "uint64_t") {
      return `(${argument.abi_type}) ${context.value(source.name)}`;
    }
    if (argument.abi_type === "int") return `(int) ${context.value(source.name)}`;
    throw new Error(
      `${operation.foreign.declarationId} uses unsupported direct ABI ${argument.abi_type}`,
    );
  });
  const raw = `sagejs_ffi_${cName(operation.target)}_result`;
  const target = context.result(operation.target);
  return [
    `${indent}{`,
    `${indent}    ${nativeReturnType(fn)} ${raw};`,
    `${indent}    ${raw} = ${nativeSymbol(fn)}(${args.join(", ")});`,
    ...failureLines(fn, raw, [], context, `${indent}    `),
    assignRawResult(fn, raw, target, `${indent}    `),
    `${indent}}`,
  ].join("\n");
}

function emitPackedNmodCall(operation, context, indent) {
  const fn = operation.foreign.function;
  const native = fn.native;
  const arguments_ = nativeArguments(fn);
  const adapters = arguments_.filter((argument) =>
    argument.adapter?.kind === "packed_nmod_matrix"
  );
  if (adapters.length !== arguments_.length) {
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
  declarations.push(`${indent}    ${nativeReturnType(fn)} ${raw};`);
  const call = `${indent}    ${raw} = ${nativeSymbol(fn)}(` +
    `${callArguments.join(", ")});`;
  const checked = failureLines(fn, raw, cleanup, context, `${indent}    `);
  const result = assignRawResult(
    fn, raw, context.result(operation.target), `${indent}    `,
  );
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

function emitPackedFmpzCall(operation, context, indent) {
  const fn = operation.foreign.function;
  const arguments_ = nativeArguments(fn);
  const declarations = [];
  const validation = [];
  const initialization = [];
  const copyInput = [];
  const outputAdapters = [];
  const sliceStages = [];
  const sliceOutputs = [];
  const cleanup = [];
  const callArguments = [];
  const parameter = (name) => context.value(argumentBySource(operation, name).name);
  declarations.push(`${indent}    mpz_t sagejs_ffi_integer_scratch;`);
  initialization.push(`${indent}    mpz_init(sagejs_ffi_integer_scratch);`);
  cleanup.unshift(`${indent}    mpz_clear(sagejs_ffi_integer_scratch);`);
  for (const [index, argument] of arguments_.entries()) {
    if (argument.adapter?.kind === "packed_slice") {
      const adapter = argument.adapter;
      const data = parameter(adapter.data);
      const length = parameter(adapter.length);
      validation.push(
        `${indent}    if (${length} > (uint64_t) SIZE_MAX ||`,
        `${indent}        ${data}.length != (size_t) ${length})`,
        `${indent}    {`,
        `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"packed slice length does not match its declaration");`,
        `${indent}        ${context.failure}`,
        `${indent}    }`,
      );
      if (adapter.access === "read") {
        callArguments.push(`${data}.data`);
      } else {
        const stage = `sagejs_ffi_${cName(operation.target)}_${index}_stage`;
        declarations.push(`${indent}    uint64_t *${stage} = NULL;`);
        sliceStages.push({ stage, length });
        sliceOutputs.push({ stage, length, data });
        cleanup.unshift(`${indent}    free(${stage});`);
        callArguments.push(stage);
      }
      continue;
    }
    if (argument.lowering.kind === "record") {
      const record = `sagejs_ffi_${cName(operation.target)}_${index}_record`;
      declarations.push(`${indent}    ${argument.lowering.c_type} ${record};`);
      for (const field of argument.lowering.record_fields) {
        const sourceName = argument.lowering.fields[field.name];
        const source = argumentBySource(operation, sourceName);
        validation.push(
          `${indent}    ${record}.${field.name} = ` +
            `(${field.c_type}) ${context.value(source.name)};`,
        );
      }
      callArguments.push(`&${record}`);
      continue;
    }
    if (argument.adapter === null) {
      const source = argumentBySource(operation, argument.source);
      if (argument.abi_type === "ulong" || argument.abi_type === "uint64_t") {
        callArguments.push(`(${argument.abi_type}) ${context.value(source.name)}`);
      } else if (argument.abi_type === "int") {
        callArguments.push(`(int) ${context.value(source.name)}`);
      } else {
        throw new Error(
          `${operation.foreign.declarationId} uses unsupported mixed fmpz ABI ` +
          `${argument.abi_type}`,
        );
      }
      continue;
    }
    if (argument.adapter?.kind !== "packed_fmpz_matrix") {
      throw new Error(
        `${operation.foreign.declarationId} mixes incompatible ABI adapters`,
      );
    }
    const adapter = argument.adapter;
    const prefix = `sagejs_ffi_${cName(operation.target)}_${index}`;
    const matrix = `${prefix}_matrix`;
    const data = parameter(adapter.data);
    const rows = parameter(adapter.rows);
    const columns = parameter(adapter.columns);
    const count = `${prefix}_count`;
    declarations.push(
      `${indent}    fmpz_mat_t ${matrix};`,
      `${indent}    size_t ${count};`,
    );
    validation.push(
      `${indent}    if (${rows} > (uint64_t) WORD_MAX || ` +
        `${columns} > (uint64_t) WORD_MAX ||`,
      `${indent}        (${rows} != 0 && ${columns} > ` +
        `(uint64_t) SIZE_MAX / ${rows}))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"integer matrix is too large to convert");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
      `${indent}    ${count} = (size_t) ${rows} * (size_t) ${columns};`,
      `${indent}    if (${data}.length != ${count})`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"integer matrix buffer length does not match dimensions");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
    );
    initialization.push(
      `${indent}    fmpz_mat_init(${matrix}, (slong) ${rows}, ` +
        `(slong) ${columns});`,
    );
    if (adapter.access === "read") {
      copyInput.push(
        `${indent}    for (size_t sagejs_index = 0; ` +
          `sagejs_index < ${count}; sagejs_index++)`,
        `${indent}    {`,
        `${indent}        sagejs_integer_buffer_get_mpz(` +
          `&${data}, sagejs_index, sagejs_ffi_integer_scratch);`,
        `${indent}        fmpz_set_mpz(fmpz_mat_entry(${matrix},`,
        `${indent}            (slong) (sagejs_index / (size_t) ${columns}),`,
        `${indent}            (slong) (sagejs_index % (size_t) ${columns})),`,
        `${indent}            sagejs_ffi_integer_scratch);`,
        `${indent}    }`,
      );
    } else {
      outputAdapters.push({ matrix, data, columns, count });
    }
    cleanup.unshift(`${indent}    fmpz_mat_clear(${matrix});`);
    callArguments.push(matrix);
  }
  const raw = `sagejs_ffi_${cName(operation.target)}_result`;
  declarations.push(`${indent}    ${nativeReturnType(fn)} ${raw};`);
  const allocation = sliceStages.flatMap(({ stage, length }) => [
    `${indent}    if (${length} != 0)`,
    `${indent}    {`,
    `${indent}        ${stage} = (uint64_t *) calloc(` +
      `(size_t) ${length}, sizeof(uint64_t));`,
    `${indent}        if (${stage} == NULL)`,
    `${indent}        {`,
    ...cleanup.map((line) => line.replace(`${indent}    `, `${indent}            `)),
    `${indent}            sagejs_native_status_set(status, ` +
      `SAGEJS_NATIVE_ERROR, "unable to stage FFI output");`,
    `${indent}            ${context.failure}`,
    `${indent}        }`,
    `${indent}    }`,
  ]);
  const checked = failureLines(fn, raw, cleanup, context, `${indent}    `);
  const preflight = outputAdapters.flatMap(({ matrix, data, columns, count }) => [
    `${indent}    for (size_t sagejs_index = 0; sagejs_index < ${count}; ` +
      `sagejs_index++)`,
    `${indent}    {`,
    `${indent}        fmpz_get_mpz(sagejs_ffi_integer_scratch,`,
    `${indent}            fmpz_mat_entry(${matrix},`,
    `${indent}                (slong) (sagejs_index / (size_t) ${columns}),`,
    `${indent}                (slong) (sagejs_index % (size_t) ${columns})));`,
    `${indent}        size_t sagejs_words = ` +
      `mpz_sgn(sagejs_ffi_integer_scratch) == 0 ? 0 :`,
    `${indent}            (mpz_sizeinbase(sagejs_ffi_integer_scratch, 2) + 63) / 64;`,
    `${indent}        if (sagejs_words > ${data}.word_capacity)`,
    `${indent}        {`,
    ...cleanup.map((line) => line.replace(`${indent}    `, `${indent}        `)),
    `${indent}            sagejs_native_status_set(status, ` +
      `SAGEJS_NATIVE_RANGE_ERROR, "IntegerBuffer word capacity exceeded");`,
    `${indent}            ${context.failure}`,
    `${indent}        }`,
    `${indent}    }`,
  ]);
  const copyOutput = outputAdapters.flatMap(({ matrix, data, columns, count }) => [
    `${indent}    for (size_t sagejs_index = 0; sagejs_index < ${count}; ` +
      `sagejs_index++)`,
    `${indent}    {`,
    `${indent}        fmpz_get_mpz(sagejs_ffi_integer_scratch,`,
    `${indent}            fmpz_mat_entry(${matrix},`,
    `${indent}                (slong) (sagejs_index / (size_t) ${columns}),`,
    `${indent}                (slong) (sagejs_index % (size_t) ${columns})));`,
    `${indent}        sagejs_integer_buffer_set_mpz(status, &${data}, ` +
      `sagejs_index, sagejs_ffi_integer_scratch);`,
    `${indent}    }`,
  ]);
  const copySliceOutput = sliceOutputs.flatMap(({ stage, length, data }) => [
    `${indent}    if (${length} != 0)`,
    `${indent}        memcpy(${data}.data, ${stage}, ` +
      `(size_t) ${length} * sizeof(uint64_t));`,
  ]);
  const result = assignRawResult(
    fn, raw, context.result(operation.target), `${indent}    `,
  );
  return [
    `${indent}{`,
    ...declarations,
    ...validation,
    ...initialization,
    ...copyInput,
    ...allocation,
    `${indent}    ${raw} = ${nativeSymbol(fn)}(${callArguments.join(", ")});`,
    ...checked,
    ...preflight,
    ...copyOutput,
    ...copySliceOutput,
    ...cleanup,
    result,
    `${indent}}`,
  ].join("\n");
}

function emitPackedSliceCall(operation, context, indent) {
  const fn = operation.foreign.function;
  const native = fn.native;
  const arguments_ = nativeArguments(fn);
  const declarations = [];
  const validation = [];
  const stages = [];
  const copyOutput = [];
  const cleanup = [];
  const callArguments = [];
  const parameter = (name) => context.value(argumentBySource(operation, name).name);

  for (const [index, argument] of arguments_.entries()) {
    if (argument.adapter?.kind === "packed_slice") {
      const adapter = argument.adapter;
      const data = parameter(adapter.data);
      const length = parameter(adapter.length);
      validation.push(
        `${indent}    if (${length} > (uint64_t) SIZE_MAX ||`,
        `${indent}        ${data}.length != (size_t) ${length})`,
        `${indent}    {`,
        `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"packed slice length does not match its declaration");`,
        `${indent}        ${context.failure}`,
        `${indent}    }`,
      );
      if (adapter.access === "read") {
        callArguments.push(`${data}.data`);
      } else {
        const stage = `sagejs_ffi_${cName(operation.target)}_${index}_stage`;
        declarations.push(`${indent}    uint64_t *${stage} = NULL;`);
        stages.push({ stage, length });
        callArguments.push(stage);
        copyOutput.push(
          `${indent}    if (${length} != 0)`,
          `${indent}        memcpy(${data}.data, ${stage}, ` +
            `(size_t) ${length} * sizeof(uint64_t));`,
        );
        cleanup.unshift(`${indent}    free(${stage});`);
      }
      continue;
    }
    if (argument.lowering.kind === "record") {
      const record = `sagejs_ffi_${cName(operation.target)}_${index}_record`;
      declarations.push(`${indent}    ${argument.lowering.c_type} ${record};`);
      for (const field of argument.lowering.record_fields) {
        const sourceName = argument.lowering.fields[field.name];
        const source = argumentBySource(operation, sourceName);
        validation.push(
          `${indent}    ${record}.${field.name} = ` +
            `(${field.c_type}) ${context.value(source.name)};`,
        );
      }
      callArguments.push(`&${record}`);
      continue;
    }
    if (argument.adapter !== null) {
      throw new Error(
        `${operation.foreign.declarationId} mixes incompatible ABI adapters`,
      );
    }
    const source = argumentBySource(operation, argument.source);
    if (argument.abi_type === "ulong" || argument.abi_type === "uint64_t") {
      callArguments.push(`(${argument.abi_type}) ${context.value(source.name)}`);
    } else if (argument.abi_type === "int") {
      callArguments.push(`(int) ${context.value(source.name)}`);
    } else {
      throw new Error(
        `${operation.foreign.declarationId} uses unsupported mixed slice ABI ` +
        `${argument.abi_type}`,
      );
    }
  }
  const raw = `sagejs_ffi_${cName(operation.target)}_result`;
  declarations.push(`${indent}    ${nativeReturnType(fn)} ${raw};`);
  const allocation = stages.flatMap(({ stage, length }) => [
    `${indent}    if (${length} != 0)`,
    `${indent}    {`,
    `${indent}        ${stage} = (uint64_t *) calloc(` +
      `(size_t) ${length}, sizeof(uint64_t));`,
    `${indent}        if (${stage} == NULL)`,
    `${indent}        {`,
    ...stages.map((item) => `${indent}            free(${item.stage});`),
    `${indent}            sagejs_native_status_set(status, ` +
      `SAGEJS_NATIVE_ERROR, "unable to stage FFI output");`,
    `${indent}            ${context.failure}`,
    `${indent}        }`,
    `${indent}    }`,
  ]);
  const checked = failureLines(fn, raw, cleanup, context, `${indent}    `);
  const result = assignRawResult(
    fn, raw, context.result(operation.target), `${indent}    `,
  );
  return [
    `${indent}{`,
    ...declarations,
    ...validation,
    ...allocation,
    `${indent}    ${raw} = ${nativeSymbol(fn)}(${callArguments.join(", ")});`,
    ...checked,
    ...copyOutput,
    ...cleanup,
    result,
    `${indent}}`,
  ].join("\n");
}

function usesFmpz(operation) {
  return nativeArguments(operation.foreign.function).some(
    (argument) => argument.abi_type === "fmpz_t",
  );
}

function emitExactForeignCall(operation, context, indent) {
  if (usesResource(operation)) {
    return emitResourceCall(operation, context, indent, false);
  }
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_fmpz_matrix"
  )) return emitPackedFmpzCall(operation, context, indent);
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_nmod_matrix"
  )) return emitPackedNmodCall(operation, context, indent);
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_slice" || argument.lowering.kind === "record"
  )) return emitPackedSliceCall(operation, context, indent);
  return usesFmpz(operation)
    ? emitFmpzCall(operation, context.value, context.result, indent, false)
    : emitDirectCall(operation, context, indent);
}

function emitTaggedForeignCall(operation, context, indent) {
  if (usesResource(operation)) {
    return emitResourceCall(operation, context, indent, true);
  }
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_fmpz_matrix"
  )) return emitPackedFmpzCall(operation, context, indent);
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_nmod_matrix"
  )) return emitPackedNmodCall(operation, context, indent);
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_slice" || argument.lowering.kind === "record"
  )) return emitPackedSliceCall(operation, context, indent);
  return usesFmpz(operation)
    ? emitFmpzCall(operation, context.value, context.result, indent, true)
    : emitDirectCall(operation, context, indent);
}

function emitWordForeignCall(operation, context, indent) {
  if (usesResource(operation)) return context.promote(operation, indent);
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_fmpz_matrix"
  )) return emitPackedFmpzCall(operation, context, indent);
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_nmod_matrix"
  )) return emitPackedNmodCall(operation, context, indent);
  if (nativeArguments(operation.foreign.function).some((argument) =>
    argument.adapter?.kind === "packed_slice" || argument.lowering.kind === "record"
  )) return emitPackedSliceCall(operation, context, indent);
  if (usesFmpz(operation) ||
      operation.foreign.function.signature.return_type === "Integer") {
    return context.promote(operation, indent);
  }
  return emitDirectCall(operation, context, indent);
}

function javascriptForeignCall(operation, indent) {
  const foreign = operation.foreign;
  const signature = foreign.function.signature;
  const returned = resourceForType(operation, signature.return_type);
  const metadata = {
    returned: returned === undefined ? null : {
      identity: `resource:${foreign.declarationIdentity.split(":")[0]}:${returned.id}`,
      closeExport: returned.dynamic.close_export,
      ownership: returned.ownership,
      borrowFrom: signature.borrow_from === null ? null :
        signature.parameters.findIndex((parameter) =>
          parameter.name === signature.borrow_from
        ),
    },
    parameters: signature.parameters.map((parameter) => {
      const resource = resourceForType(operation, parameter.type);
      return resource === undefined ? null :
        `resource:${foreign.declarationIdentity.split(":")[0]}:${resource.id}`;
    }),
    minimums: signature.parameters.map((parameter) => parameter.minimum ?? null),
    constraints: foreign.function.call_plan.constraints.map((constraint) => ({
      kind: constraint.kind,
      buffer: constraint.parameter_names.indexOf(constraint.buffer),
      dimensions: constraint.dimensions.map((name) =>
        constraint.parameter_names.indexOf(name)),
    })),
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
    `${JSON.stringify(foreign.function.result)}, ` +
    `${JSON.stringify(foreign.function.errors)}, ` +
    `${JSON.stringify(metadata)}, ${resourceStack});`;
}

function javascriptRuntime(ir) {
  if (foreignLibraries(ir).length === 0) return "";
  return `
const sagejsFfiLibraries = (
  globalThis.__sagejs_ffi_library_cache__ ??= new Map()
);

function sagejsFfiPublicResource(value, identity, argument) {
  const borrow = value === null || value === undefined
    ? undefined : Reflect.get(value, "_ffi_borrow");
  if (typeof borrow !== "function") {
    throw new TypeError(argument + " must be a declared FFI resource");
  }
  const token = Reflect.apply(borrow, value, []);
  const tag = globalThis.__sagejs_ffi_resource_tag__;
  const state = tag === undefined ? undefined : token?.[tag];
  if (state === undefined || state.identity !== identity) {
    throw new TypeError(argument + " has the wrong FFI resource type");
  }
  if ((state.root || state).closed) {
    nativeRaise("ValueError", "FFI resource is closed");
  }
  return state;
}

const sagejsFfiResourceFactories = new Map();

function sagejsFfiResourceFactory(metadata) {
  const key = metadata.declarationIdentity + ":" + metadata.pythonModule +
    ":" + metadata.pythonName;
  let factory = sagejsFfiResourceFactories.get(key);
  if (factory !== undefined) return factory;
  const loader = Reflect.get(globalThis, "__sagejs_load_module__");
  if (typeof loader !== "function") {
    throw new Error("the generated FFI module loader is unavailable");
  }
  const module = Reflect.apply(loader, undefined, [metadata.pythonModule]);
  factory = Reflect.get(module, metadata.pythonName);
  if (typeof factory !== "function") {
    throw new Error(
      metadata.pythonModule + " does not export " + metadata.pythonName
    );
  }
  sagejsFfiResourceFactories.set(key, factory);
  return factory;
}

function sagejsFfiBackendSelfFinalizes(backend, declarationIdentity) {
  const manifest = Reflect.get(backend, "__sagejs_ffi_manifest__");
  const lifecycle = manifest?.resource_lifecycle;
  return manifest?.schema === "sagejs.ffi/generated-host-adapter-v1" &&
    typeof manifest?.library === "string" &&
    declarationIdentity === manifest.library &&
    lifecycle?.model === "node-api-basic-post-finalizer-v1" &&
    lifecycle?.self_finalizing === true;
}

function sagejsFfiResourceRegistry() {
  if (typeof FinalizationRegistry !== "function") return null;
  return globalThis.__sagejs_ffi_resource_registry__ ??=
    new FinalizationRegistry((state) => {
      if (state.closed) return;
      try {
        Reflect.apply(state.close, state.backend, [state.handle]);
      } catch (_error) {
        // Finalizers cannot report recoverable errors to user code.
      } finally {
        state.closed = true;
        state.handle = null;
      }
    });
}

function sagejsFfiClosePublishedResource(state, token) {
  if (state.closed) return;
  try {
    Reflect.apply(state.close, state.backend, [state.handle]);
  } finally {
    state.closed = true;
    state.handle = null;
    state.registry?.unregister(token);
  }
}

function sagejsFfiPublishResourceResult(state, metadata, selfFinalizing = false) {
  if (state === null || (typeof state !== "object" &&
      typeof state !== "function") || state.identity !== metadata.identity ||
      state.ownership !== "owned" || state.closed ||
      (state.root !== null && state.root !== undefined && state.root !== state) ||
      (typeof state.handle !== "object" && typeof state.handle !== "function") ||
      typeof state.close !== "function") {
    throw new TypeError("native kernel returned an invalid owned FFI resource");
  }
  const tag = globalThis.__sagejs_ffi_resource_tag__ ??=
    Symbol("Sage.js declared FFI resource");
  state.declaration = metadata.declarationIdentity;
  state.root = state;
  state.borrowed = false;
  state.registry = selfFinalizing || sagejsFfiBackendSelfFinalizes(
    state.backend, metadata.declarationIdentity
  ) ? null : sagejsFfiResourceRegistry();
  const token = Object.create(null);
  Object.defineProperty(token, tag, { value: state });
  state.registry?.register(token, state, token);
  try {
    return Reflect.apply(sagejsFfiResourceFactory(metadata), undefined, [token]);
  } catch (error) {
    try {
      sagejsFfiClosePublishedResource(state, token);
    } catch (_closeError) {
      // Preserve the public-factory failure after deterministically releasing
      // the newly owned foreign value.
    }
    throw error;
  }
}

function sagejsFfiAdoptNativeResourceResult(handle, metadata) {
  if (handle === null || (typeof handle !== "object" &&
      typeof handle !== "function")) {
    throw new TypeError("native kernel returned an invalid FFI resource holder");
  }
  const close = Reflect.get(nativeAddon, metadata.closeExport);
  if (typeof close !== "function") {
    throw new Error(
      "native kernel lacks declared resource close export " +
      metadata.closeExport
    );
  }
  return sagejsFfiPublishResourceResult({
    identity: metadata.identity,
    declaration: metadata.declarationIdentity,
    backend: nativeAddon,
    close,
    handle,
    closed: false,
    ownership: "owned",
    owner: null,
    root: null,
  }, metadata, true);
}

function sagejsFfiCall(
  packageName, exportName, args, parameterTypes, returnType, resultDomain, errors,
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
      if ((value.root || value).closed) throw new Error("FFI resource is closed");
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
    if (type === "IntegerBuffer" && value !== null &&
        (typeof value === "object" || typeof value === "function")) {
      // Exact-kernel JavaScript lowering normalizes an IntegerBuffer to a
      // checked view before it reaches a direct FFI call.  A whole-buffer view
      // can cross the declared host boundary without repacking; preserve the
      // original packed object so transactional output writes remain visible
      // to the caller.
      const packedView = Reflect.get(value, "packed");
      const viewOffset = Reflect.get(value, "offset");
      const viewLength = Reflect.get(value, "length");
      if (packedView !== undefined && viewOffset === 0 &&
          viewLength === Reflect.get(packedView, "length")) {
        value = packedView;
      }
      const length = Number(Reflect.get(value, "length"));
      if (Number.isSafeInteger(length) && length >= 0) {
        const sizes = Reflect.get(value, "sizes");
        const limbs = Reflect.get(value, "limbs");
        const capacity = Number(Reflect.get(value, "wordCapacity"));
        // Compiled kernel modules and an embedded Sage.js runtime can inhabit
        // different V8 realms. An instanceof check rejects genuine typed arrays from
        // the other realm, whereas the intrinsic view test and builtin tag are
        // realm-independent. The generated N-API shell validates them again.
        const sizesTag = Object.prototype.toString.call(sizes);
        const limbsTag = Object.prototype.toString.call(limbs);
        if (ArrayBuffer.isView(sizes) && ArrayBuffer.isView(limbs) &&
            sizesTag === "[object Int32Array]" &&
            limbsTag === "[object BigUint64Array]" &&
            Number.isSafeInteger(capacity) && capacity > 0 &&
            sizes.length === length && limbs.length === length * capacity) {
          return value;
        }
        for (let position = 0; position < length; position += 1) {
          const entry = Reflect.get(value, String(position));
          if (typeof entry !== "bigint" && !Number.isSafeInteger(entry)) {
            throw new TypeError("invalid IntegerBuffer entry");
          }
        }
        return value;
      }
    }
    throw new TypeError("invalid dynamic FFI argument for " + type);
  });
  for (const constraint of resourceMetadata.constraints) {
    if (constraint.kind !== "buffer_length" || constraint.buffer < 0 ||
        constraint.dimensions.some((index) => index < 0)) {
      throw new TypeError("invalid FFI call-plan constraint");
    }
    let expected = 1n;
    for (const index of constraint.dimensions) {
      if (typeof marshalled[index] !== "bigint") {
        throw new TypeError("FFI call-plan dimension is not an integer");
      }
      expected *= marshalled[index];
    }
    if (BigInt(marshalled[constraint.buffer].length) !== expected) {
      nativeRaise("ValueError",
        "packed buffer length does not match its declared dimensions");
    }
  }
  let result;
  try {
    result = Reflect.apply(fn, library, marshalled);
  } catch (error) {
    if (typeof errors.exception === "string") {
      nativeRaise(
        errors.exception,
        typeof error?.message === "string" ? error.message : errors.message,
      );
    }
    throw error;
  }
  if (resultDomain.domain === "status" && result === false) {
    nativeRaise(errors.exception, errors.message);
  }
  if (resultDomain.domain === "nullable" && result == null) {
    nativeRaise(errors.exception, errors.message);
  }
  if (resourceMetadata.returned !== null) {
    if (result === null || (typeof result !== "object" &&
        typeof result !== "function")) {
      throw new TypeError("FFI backend returned invalid resource");
    }
    const close = resourceMetadata.returned.closeExport === null ? null :
      Reflect.get(library, resourceMetadata.returned.closeExport);
    if (resourceMetadata.returned.ownership === "owned" &&
        typeof close !== "function") {
      throw new Error("FFI backend lacks declared resource close export");
    }
    const owner = resourceMetadata.returned.borrowFrom === null
      ? null : args[resourceMetadata.returned.borrowFrom];
    const root = owner === null ? null : (owner.root || owner);
    const resource = {
      identity: resourceMetadata.returned.identity,
      handle: result,
      backend: library,
      close,
      closed: false,
      ownership: resourceMetadata.returned.ownership,
      owner,
      root: root || null,
    };
    if (resource.ownership === "owned") {
      resource.root = resource;
      resourceStack.push(resource);
    }
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
    if (resource.ownership !== "owned" || resource.closed) continue;
    Reflect.apply(resource.close, resource.backend, [resource.handle]);
    resource.closed = true;
    resource.handle = null;
  }
}

function sagejsFfiTransferResource(value, resources) {
  if (value === null || (typeof value !== "object" &&
      typeof value !== "function")) return value;
  const root = value.root || value;
  const index = resources.lastIndexOf(root);
  if (index >= 0) resources.splice(index, 1);
  return value;
}
`;
}

module.exports = {
  emitExactForeignCall,
  emitTaggedForeignCall,
  emitWordForeignCall,
  exceptionShimInclude,
  foreignDependencies,
  foreignHeaders,
  foreignLibraries,
  generateExceptionShims,
  isForeignResourceType,
  javascriptForeignCall,
  javascriptRuntime,
  resourceForFunctionType,
};
