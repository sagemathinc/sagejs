"use strict";

const { tupleElementTypes } = require("./portable-identity.cjs");

const SCALAR_TYPES = new Set([
  "Float64",
  "Integer",
  "uint64",
  "PrimeModulusValue",
]);
const BUFFER_TYPES = new Set([
  "Float64Buffer",
  "IntegerBuffer",
  "Int64Buffer",
  "UInt64Buffer",
]);
const RESULT_TYPES = new Set(["Float64", "Integer", "uint64", "bool"]);

function cName(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, "_");
}

function recordByType(ir, type) {
  if (!type.startsWith("Record:")) return null;
  const name = type.slice("Record:".length);
  return (ir.records ?? []).find((record) => record.name === name) ?? null;
}

function supportedRecord(record) {
  return record !== null && record.fields.every((field) =>
    BUFFER_TYPES.has(field.type) ||
    ["uint64", "PrimeModulusValue"].includes(field.type)
  );
}

function resourceForType(fn, type) {
  return (fn.foreignResources ?? []).find((resource) =>
    (resource.compiler_type ?? resource.python_name) === type ||
    resource.python_name === type
  ) ?? null;
}

function resourceHookName(operation, resource) {
  return `sagejs_wasm_resource_${operation}_${cName(resource.id)}`;
}

function resourceDescriptor(resource) {
  return Object.freeze({
    kind: "resource",
    id: resource.id,
    identity: `resource:${resource.declaration_identity}:${resource.id}`,
    declarationIdentity: resource.declaration_identity,
    type: resource.compiler_type ?? resource.python_name,
    pythonName: resource.python_name,
    abiType: resource.abi_type,
    ownership: resource.ownership,
    handleDomain: "same-wasm-instance",
    borrowExport: resourceHookName("borrow", resource),
    adoptExport: resourceHookName("adopt", resource),
    closeExport: resource.dynamic?.close_export === undefined ||
      resource.dynamic.close_export === null
      ? null
      : `sagejs_wasm_${cName(resource.dynamic.close_export)}`,
  });
}

function classifyWasmFunction(fn, ir) {
  if (!["float64", "integer", "prime-field-source"].includes(fn.kernelKind)) {
    return {
      supported: false,
      reason: `kernel-kind-${fn.kernelKind}-bridge-not-generated`,
    };
  }
  const usedResources = new Map();
  for (const type of [
    ...fn.params.map((parameter) => parameter.type),
    ...(tupleElementTypes(fn.returnType) ?? [fn.returnType]),
  ]) {
    const resource = resourceForType(fn, type);
    if (resource !== null) usedResources.set(resource.id, resource);
  }
  if (usedResources.size !== 0) {
    const resources = [...usedResources.values()];
    const missingTarget = fn.foreignResources.find(
      (resource) => usedResources.has(resource.id) &&
        resource.targets?.wasm !== true,
    );
    if (missingTarget !== undefined) {
      return {
        supported: false,
        reason: "foreign-resource-not-declared-for-wasm",
        resources: resources.map((resource) => resource.id).sort(),
      };
    }
    const unsupportedOwnership = resources.find((resource) =>
      resource.ownership !== "owned" || resource.owner !== null ||
      resource.native?.clear_symbol === undefined ||
      resource.native.clear_symbol === null
    );
    if (unsupportedOwnership !== undefined) {
      return {
        supported: false,
        reason: "foreign-resource-ownership-shape-not-bridgeable",
        resources: resources.map((resource) => resource.id).sort(),
      };
    }
  }
  for (const parameter of fn.params) {
    if (resourceForType(fn, parameter.type) !== null) continue;
    if (SCALAR_TYPES.has(parameter.type) || BUFFER_TYPES.has(parameter.type)) {
      continue;
    }
    const record = recordByType(ir, parameter.type);
    if (supportedRecord(record)) continue;
    return {
      supported: false,
      reason: `parameter-type-${parameter.type}-bridge-not-generated`,
    };
  }
  const results = tupleElementTypes(fn.returnType) ?? [fn.returnType];
  const returnedResources = results
    .map((type) => resourceForType(fn, type))
    .filter((resource) => resource !== null);
  if (returnedResources.length !== 0 && results.length !== 1) {
    return {
      supported: false,
      reason: "resource-tuple-result-bridge-not-generated",
      resources: returnedResources.map((resource) => resource.id).sort(),
    };
  }
  const unsupported = results.find((type) =>
    !RESULT_TYPES.has(type) && resourceForType(fn, type) === null
  );
  if (unsupported !== undefined) {
    return {
      supported: false,
      reason: `result-type-${unsupported}-bridge-not-generated`,
    };
  }
  const resultDescriptors = results.map((type) => {
    const resource = resourceForType(fn, type);
    return resource === null ? type : resourceDescriptor(resource);
  });
  return {
    supported: true,
    results: resultDescriptors,
    ...(usedResources.size === 0
      ? {}
      : {
        resources: [...usedResources.values()]
          .map((resource) => resourceDescriptor(resource))
          .sort((left, right) => left.id.localeCompare(right.id)),
      }),
  };
}

function bufferParameters(type, name) {
  const prefix = `sagejs_arg_${cName(name)}`;
  if (type === "IntegerBuffer") {
    return [
      `uint32_t ${prefix}_sizes`,
      `uint32_t ${prefix}_limbs`,
      `uint32_t ${prefix}_buffer_length`,
      `uint32_t ${prefix}_word_capacity`,
    ];
  }
  return [`uint32_t ${prefix}_data`, `uint32_t ${prefix}_buffer_length`];
}

function bufferDeclaration(type, variable, name, sourceBuffer = false) {
  const prefix = `sagejs_arg_${cName(name)}`;
  if (type === "IntegerBuffer") {
    return `    sagejs_integer_buffer ${variable} = {
        (int32_t *) (uintptr_t) ${prefix}_sizes,
        (uint64_t *) (uintptr_t) ${prefix}_limbs,
        (size_t) ${prefix}_buffer_length,
        (size_t) ${prefix}_word_capacity
    };`;
  }
  const cType = type === "Float64Buffer"
    ? "double"
    : type === "Int64Buffer" ? "int64_t" : "uint64_t";
  const structType = type === "Float64Buffer"
    ? "sagejs_float64_buffer"
    : type === "Int64Buffer"
    ? "sagejs_int64_buffer"
    : sourceBuffer
      ? "sagejs_source_u64_buffer"
      : "sagejs_uint64_buffer";
  return `    ${structType} ${variable} = {
        (${cType} *) (uintptr_t) ${prefix}_data,
        (size_t) ${prefix}_buffer_length
    };`;
}

function parameterBridge(parameter, ir, fn) {
  const name = cName(parameter.name);
  const variable = `sagejs_value_${name}`;
  const resource = resourceForType(fn, parameter.type);
  if (resource !== null) {
    const hook = resourceHookName("borrow", resource);
    return {
      signature: [`uint64_t sagejs_arg_${name}_handle`],
      declaration: `    ${resource.abi_type} *${variable} = NULL;
    if (!${hook}(sagejs_arg_${name}_handle, &${variable}))
    {
        sagejs_wasm_last_message_storage_m_${"$MODULE"} =
            "invalid or closed same-instance Wasm resource handle";
        return SAGEJS_NATIVE_TYPE_ERROR;
    }`,
      argument: `*${variable}`,
      cleanup: "",
      descriptor: {
        name: parameter.name,
        type: parameter.type,
        resource: resourceDescriptor(resource),
      },
    };
  }
  if (parameter.type === "Integer") {
    return {
      signature: [`uint32_t sagejs_arg_${name}_decimal`],
      declaration: `    mpz_t ${variable};
    mpz_init(${variable});
    if (mpz_set_str(${variable},
            (const char *) (uintptr_t) sagejs_arg_${name}_decimal, 10) != 0)
    {
        sagejs_wasm_last_message_storage_m_${"$MODULE"} =
            "invalid exact-integer decimal argument";
        mpz_clear(${variable});
        return SAGEJS_NATIVE_TYPE_ERROR;
    }`,
      argument: variable,
      cleanup: `    mpz_clear(${variable});`,
      descriptor: { name: parameter.name, type: parameter.type },
    };
  }
  if (["uint64", "PrimeModulusValue"].includes(parameter.type)) {
    return {
      signature: [`uint64_t sagejs_arg_${name}`],
      declaration: "",
      argument: `sagejs_arg_${name}`,
      cleanup: "",
      descriptor: { name: parameter.name, type: parameter.type },
    };
  }
  if (parameter.type === "Float64") {
    return {
      signature: [`double sagejs_arg_${name}`],
      declaration: "",
      argument: `sagejs_arg_${name}`,
      cleanup: "",
      descriptor: { name: parameter.name, type: parameter.type },
    };
  }
  if (BUFFER_TYPES.has(parameter.type)) {
    return {
      signature: bufferParameters(parameter.type, parameter.name),
      declaration: bufferDeclaration(
        parameter.type,
        variable,
        parameter.name,
        fn.kernelKind === "prime-field-source",
      ),
      argument: variable,
      cleanup: "",
      descriptor: {
        name: parameter.name,
        type: parameter.type,
        ...(parameter.type === "Float64Buffer"
          ? {
            mutable: (fn.analysis?.effects?.mutates ?? []).includes(
              parameter.name,
            ),
          }
          : {}),
      },
    };
  }
  const record = recordByType(ir, parameter.type);
  if (!supportedRecord(record)) {
    throw new Error(`cannot generate Wasm record argument ${parameter.type}`);
  }
  const signature = [];
  const declarations = [];
  const fields = [];
  for (const field of record.fields) {
    const fieldName = `${parameter.name}_${field.name}`;
    const fieldVariable = `sagejs_value_${cName(fieldName)}`;
    if (BUFFER_TYPES.has(field.type)) {
      signature.push(...bufferParameters(field.type, fieldName));
      declarations.push(bufferDeclaration(
        field.type,
        fieldVariable,
        fieldName,
        field.type === "UInt64Buffer",
      ));
    } else {
      signature.push(`uint64_t sagejs_arg_${cName(fieldName)}`);
    }
    fields.push({ field, fieldName, fieldVariable });
  }
  declarations.push(`    sagejs_native_record_${record.name} ${variable} = {`);
  declarations.push(fields.map(({ field, fieldName, fieldVariable }) =>
    `        .sagejs_field_${field.name} = ${BUFFER_TYPES.has(field.type)
      ? fieldVariable
      : `sagejs_arg_${cName(fieldName)}`}`
  ).join(",\n"));
  declarations.push("    };");
  return {
    signature,
    declaration: declarations.join("\n"),
    argument: variable,
    cleanup: "",
    descriptor: {
      name: parameter.name,
      type: parameter.type,
      fields: record.fields.map((field) => ({
        name: field.name,
        type: field.type,
      })),
    },
  };
}

function resultLocals(results, fn) {
  const declarations = [];
  const initializations = [];
  const cleanups = [];
  const arguments_ = [];
  const stores = [];
  results.forEach((type, index) => {
    const name = `sagejs_result_${index}`;
    if (type !== null && typeof type === "object" && type.kind === "resource") {
      const resource = resourceForType(fn, type.type);
      if (resource === null) {
        throw new Error(`missing resource result metadata for ${type.type}`);
      }
      const handle = `${name}_handle`;
      declarations.push(`    ${resource.abi_type} ${name};`);
      declarations.push(`    uint64_t ${handle} = 0;`);
      arguments_.push(name);
      stores.push(
        `    if (!${resourceHookName("adopt", resource)}(${name}, &${handle}))`,
        "    {",
        `        ${resource.native.clear_symbol}(${name});`,
        `        sagejs_wasm_last_message_storage_m_$MODULE =`,
        `            "unable to adopt returned Wasm resource";`,
        "        sagejs_wasm_ok = 0;",
        "    }",
        "    else",
        `        sagejs_wasm_result_u64_storage_m_$MODULE[${index}] = ${handle};`,
      );
    } else if (type === "Integer") {
      declarations.push(`    mpz_t ${name};`);
      initializations.push(`    mpz_init(${name});`);
      cleanups.unshift(`    mpz_clear(${name});`);
      arguments_.push(name);
      stores.push(
        `    if (!sagejs_wasm_store_integer_m_$MODULE(${index}, ${name}))`,
        "    {",
        `        sagejs_wasm_last_message_storage_m_$MODULE = "Wasm result allocation failed";`,
        "        sagejs_wasm_ok = 0;",
        "    }",
      );
    } else if (type === "Float64") {
      declarations.push(`    double ${name} = 0.0;`);
      arguments_.push(`&${name}`);
      stores.push(
        `    sagejs_wasm_result_f64_storage_m_$MODULE[${index}] = ${name};`,
      );
    } else {
      const cType = type === "bool" ? "int" : "uint64_t";
      declarations.push(`    ${cType} ${name} = 0;`);
      arguments_.push(`&${name}`);
      stores.push(
        `    sagejs_wasm_result_u64_storage_m_$MODULE[${index}] = ` +
          `(uint64_t) ${name};`,
      );
    }
  });
  return { declarations, initializations, cleanups, arguments_, stores };
}

function bridgeFunction(fn, ir, moduleIdentity) {
  const classification = classifyWasmFunction(fn, ir);
  if (!classification.supported) {
    throw new Error(`cannot bridge ${fn.name}: ${classification.reason}`);
  }
  const parameters = fn.params.map((parameter) =>
    parameterBridge(parameter, ir, fn)
  );
  const result = resultLocals(classification.results, fn);
  const signature = parameters.flatMap((parameter) => parameter.signature);
  const substitutions = (value) => value.replaceAll("$MODULE", moduleIdentity);
  const callName = `sagejs_wasm_call_m_${moduleIdentity}_${fn.name}`;
  const outputArguments = result.arguments_;
  const inputArguments = parameters.map((parameter) => parameter.argument);
  const callArguments = [
    `&sagejs_wasm_status`,
    ...outputArguments,
    ...inputArguments,
  ].join(", ");
  const source = `int ${callName}(${signature.length === 0
    ? "void"
    : `\n    ${signature.join(",\n    ")}`})
{
    sagejs_native_status sagejs_wasm_status = {SAGEJS_NATIVE_OK, NULL};
    int sagejs_wasm_ok;
${result.declarations.join("\n")}
${parameters.map((parameter) => parameter.declaration).filter(Boolean).join("\n")}
${result.initializations.join("\n")}
    sagejs_wasm_last_message_storage_m_${moduleIdentity} = NULL;
    sagejs_wasm_ok = sagejs_kernel_m_${moduleIdentity}_${fn.name}(
        ${callArguments});
    if (!sagejs_wasm_ok)
        sagejs_wasm_last_message_storage_m_${moduleIdentity} =
            sagejs_wasm_status.message == NULL
                ? "source-transparent Wasm kernel failed"
                : sagejs_wasm_status.message;
    if (sagejs_wasm_ok)
    {
${result.stores.map(substitutions).join("\n")}
    }
${result.cleanups.join("\n")}
${parameters.map((parameter) => parameter.cleanup).filter(Boolean).join("\n")}
    if (!sagejs_wasm_ok)
        return sagejs_wasm_status.code == SAGEJS_NATIVE_OK
            ? SAGEJS_NATIVE_ERROR : sagejs_wasm_status.code;
    return SAGEJS_NATIVE_OK;
}`;
  return {
    source: source.replaceAll("$MODULE", moduleIdentity),
    descriptor: {
      name: fn.name,
      export: callName,
      parameters: parameters.map((parameter) => parameter.descriptor),
      results: classification.results,
    },
    exports: [callName],
  };
}

function generateWasmBridge({ ir, moduleIdentity, functionNames }) {
  if (!/^[a-f0-9]{16}$/.test(moduleIdentity)) {
    throw new TypeError(`invalid portable module identity ${moduleIdentity}`);
  }
  const requested = functionNames.map((name) => {
    const fn = ir.functions.find((candidate) => candidate.name === name);
    if (fn === undefined) throw new Error(`missing lowered function ${name}`);
    return fn;
  });
  const generated = requested.map((fn) => bridgeFunction(fn, ir, moduleIdentity));
  const needsIntegerResult = generated.some((item) =>
    item.descriptor.results.includes("Integer")
  );
  const resources = new Map();
  for (const fn of requested) {
    for (const resource of fn.foreignResources ?? []) {
      const used = [
        ...fn.params.map((parameter) => parameter.type),
        ...(tupleElementTypes(fn.returnType) ?? [fn.returnType]),
      ].some((type) => resourceForType(fn, type)?.id === resource.id);
      if (used) resources.set(resource.id, resource);
    }
  }
  const allocate = `sagejs_wasm_allocate_m_${moduleIdentity}`;
  const deallocate = `sagejs_wasm_deallocate_m_${moduleIdentity}`;
  const resultU64 = `sagejs_wasm_result_u64_at_m_${moduleIdentity}`;
  const resultFloat64 = `sagejs_wasm_result_f64_at_m_${moduleIdentity}`;
  const resultLimbs = `sagejs_wasm_result_limbs_m_${moduleIdentity}`;
  const resultLength = `sagejs_wasm_result_length_m_${moduleIdentity}`;
  const resultSign = `sagejs_wasm_result_sign_m_${moduleIdentity}`;
  const lastMessage = `sagejs_wasm_last_message_m_${moduleIdentity}`;
  const integerStore = needsIntegerResult ? `
static int sagejs_wasm_store_integer_m_${moduleIdentity}(
    uint32_t slot, const mpz_t value)
{
    size_t count = 0;
    size_t capacity = value->_mp_size == 0 ? 1 :
        (mpz_sizeinbase(value, 2) + 63) / 64;
    uint64_t *limbs;
    if (slot >= SAGEJS_WASM_RESULT_SLOTS || capacity > UINT32_MAX)
        return 0;
    limbs = (uint64_t *) realloc(
        sagejs_wasm_result_limbs_storage_m_${moduleIdentity}[slot],
        capacity * sizeof(uint64_t));
    if (limbs == NULL)
        return 0;
    sagejs_wasm_result_limbs_storage_m_${moduleIdentity}[slot] = limbs;
    if (value->_mp_size != 0)
        mpz_export(limbs, &count, -1, sizeof(uint64_t), 0, 0, value);
    sagejs_wasm_result_length_storage_m_${moduleIdentity}[slot] = (uint32_t) count;
    sagejs_wasm_result_sign_storage_m_${moduleIdentity}[slot] = mpz_sgn(value);
    return 1;
}
` : "";
  const source = `/* Generated source-transparent WebAssembly bridge.
 * Mathematical execution remains in the canonical emitted kernel core.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "kernel_core.h"

/* These hooks are emitted by the declaration-derived FFI resource adapter
 * and must be linked into this exact Wasm instance. Handles are never foreign
 * pointers and are invalid across instances or allocator domains. */
${[...resources.values()].sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((resource) => [
      `int ${resourceHookName("borrow", resource)}(uint64_t handle, ` +
        `${resource.abi_type} **value);`,
      `int ${resourceHookName("adopt", resource)}(${resource.abi_type} value, ` +
        "uint64_t *handle);",
    ]).join("\n")}

#define SAGEJS_WASM_RESULT_SLOTS 8
static uint64_t sagejs_wasm_result_u64_storage_m_${moduleIdentity}[
    SAGEJS_WASM_RESULT_SLOTS];
static double sagejs_wasm_result_f64_storage_m_${moduleIdentity}[
    SAGEJS_WASM_RESULT_SLOTS];
static uint64_t *sagejs_wasm_result_limbs_storage_m_${moduleIdentity}[
    SAGEJS_WASM_RESULT_SLOTS];
static uint32_t sagejs_wasm_result_length_storage_m_${moduleIdentity}[
    SAGEJS_WASM_RESULT_SLOTS];
static int32_t sagejs_wasm_result_sign_storage_m_${moduleIdentity}[
    SAGEJS_WASM_RESULT_SLOTS];
static const char *sagejs_wasm_last_message_storage_m_${moduleIdentity};
${integerStore}

uint32_t ${allocate}(uint32_t bytes)
{
    void *result = malloc(bytes == 0 ? 1 : bytes);
    return (uint32_t) (uintptr_t) result;
}

void ${deallocate}(uint32_t address)
{
    free((void *) (uintptr_t) address);
}

uint64_t ${resultU64}(uint32_t slot)
{
    return slot < SAGEJS_WASM_RESULT_SLOTS
        ? sagejs_wasm_result_u64_storage_m_${moduleIdentity}[slot] : 0;
}

double ${resultFloat64}(uint32_t slot)
{
    return slot < SAGEJS_WASM_RESULT_SLOTS
        ? sagejs_wasm_result_f64_storage_m_${moduleIdentity}[slot] : 0.0;
}

uint32_t ${resultLimbs}(uint32_t slot)
{
    return slot < SAGEJS_WASM_RESULT_SLOTS
        ? (uint32_t) (uintptr_t)
            sagejs_wasm_result_limbs_storage_m_${moduleIdentity}[slot] : 0;
}

uint32_t ${resultLength}(uint32_t slot)
{
    return slot < SAGEJS_WASM_RESULT_SLOTS
        ? sagejs_wasm_result_length_storage_m_${moduleIdentity}[slot] : 0;
}

int32_t ${resultSign}(uint32_t slot)
{
    return slot < SAGEJS_WASM_RESULT_SLOTS
        ? sagejs_wasm_result_sign_storage_m_${moduleIdentity}[slot] : 0;
}

uint32_t ${lastMessage}(void)
{
    return (uint32_t) (uintptr_t)
        sagejs_wasm_last_message_storage_m_${moduleIdentity};
}

${generated.map((item) => item.source).join("\n\n")}
`;
  return {
    source,
    functions: generated.map((item) => item.descriptor),
    runtime: { allocate, deallocate, resultU64, resultFloat64, resultLimbs,
      resultLength, resultSign, lastMessage },
    exports: [
      allocate,
      deallocate,
      resultU64,
      resultFloat64,
      resultLimbs,
      resultLength,
      resultSign,
      lastMessage,
      ...generated.flatMap((item) => item.exports),
    ],
  };
}

module.exports = {
  BUFFER_TYPES,
  RESULT_TYPES,
  classifyWasmFunction,
  generateWasmBridge,
  resourceDescriptor,
  resourceHookName,
};
