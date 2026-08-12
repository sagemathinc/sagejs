"use strict";

const { generatedHostAdapterSource } = require("./host-adapters.cjs");

function fail(message) {
  throw new Error(`generated Wasm FFI adapter: ${message}`);
}

function cName(value) {
  const result = String(value).replace(/[^A-Za-z0-9_]/g, "_");
  if (!/^[A-Za-z_]/.test(result)) return `_${result}`;
  return result;
}

function jsString(value) {
  return JSON.stringify(String(value));
}

function resourceMaps(declaration) {
  return {
    byId: new Map(declaration.resources.map((item) => [item.id, item])),
    byType: new Map(
      declaration.resources.map((item) => [item.python_name, item]),
    ),
  };
}

function touchedResources(fn, byType) {
  return new Set([
    fn.signature.return_type,
    ...fn.signature.parameters.map((parameter) => parameter.type),
  ].map((type) => byType.get(type)?.id).filter(Boolean));
}

function selectWasmResourceSurface(declaration, options = {}) {
  if (!Array.isArray(options.resourceIds) || options.resourceIds.length === 0) {
    fail("resourceIds must name at least one declared resource");
  }
  const { byId, byType } = resourceMaps(declaration);
  const selectedIds = new Set(options.resourceIds);
  for (const id of selectedIds) {
    const resource = byId.get(id);
    if (resource === undefined) fail(`unknown resource ${id}`);
    if (resource.ownership !== "owned" || resource.owner !== null) {
      fail(`resource ${id} is not an independently owned resource`);
    }
    if (resource.targets.wasm !== true) {
      fail(`resource ${id} is not declared for the Wasm target`);
    }
    if (resource.dynamic.close_export === null ||
        resource.native.clear_symbol === null) {
      fail(`resource ${id} lacks a declared close/clear pair`);
    }
  }

  let requested = null;
  if (options.functionIds !== undefined) {
    if (!Array.isArray(options.functionIds) || options.functionIds.length === 0) {
      fail("functionIds must be a nonempty array when supplied");
    }
    requested = new Set(options.functionIds);
    const known = new Set(declaration.functions.map((fn) => fn.id));
    for (const id of requested) {
      if (!known.has(id)) fail(`unknown function ${id}`);
    }
  }

  const functions = declaration.functions.filter((fn) => {
    if (requested !== null && !requested.has(fn.id)) return false;
    const touched = touchedResources(fn, byType);
    return Array.from(touched).some((id) => selectedIds.has(id));
  });
  if (requested !== null && functions.length !== requested.size) {
    const found = new Set(functions.map((fn) => fn.id));
    const unrelated = Array.from(requested).filter((id) => !found.has(id));
    fail(`selected functions do not use the selected resources: ${unrelated}`);
  }
  for (const fn of functions) {
    if (fn.targets.wasm !== true) {
      fail(`function ${fn.id} is not declared for the Wasm target`);
    }
    for (const id of touchedResources(fn, byType)) {
      if (!selectedIds.has(id)) {
        fail(`function ${fn.id} also uses unselected resource ${id}`);
      }
    }
  }
  if (functions.length === 0) fail("the selected Wasm surface is empty");

  return Object.freeze({
    resources: Object.freeze(
      declaration.resources.filter((item) => selectedIds.has(item.id)),
    ),
    functions: Object.freeze(functions),
  });
}

function scalarKind(type) {
  if (type === "uint64") return "uint64";
  if (type === "bool") return "bool";
  if (type === "Integer") return "integer";
  return null;
}

function classifyFunction(fn, resourcesByType) {
  if (fn.exceptions.policy !== "none") {
    fail(`function ${fn.id} requires an unsupported exception shield`);
  }
  const returnedResource = resourcesByType.get(fn.signature.return_type);
  const nativeBySource = new Map(
    fn.native.arguments.map((argument) => [argument.source, argument]),
  );
  const resourceParameters = [];
  const scalarParameters = [];
  for (const parameter of fn.signature.parameters) {
    const native = nativeBySource.get(parameter.name);
    if (native === undefined || native.direction !== "in" ||
        native.adapter !== null) {
      fail(`function ${fn.id} has unsupported marshalling for ${parameter.name}`);
    }
    const resource = resourcesByType.get(parameter.type);
    if (resource !== undefined) {
      if (native.abi_type !== resource.abi_type) {
        fail(`function ${fn.id} changes the ABI type of ${parameter.name}`);
      }
      if (!["borrowed", "borrowed_mut"].includes(parameter.ownership)) {
        fail(
          `function ${fn.id} uses unsupported resource ownership ` +
            `${parameter.ownership} for ${parameter.name}`,
        );
      }
      resourceParameters.push({ parameter, native, resource });
      continue;
    }
    const kind = scalarKind(parameter.type);
    const validAbi = kind === "uint64"
      ? ["ulong", "uint64_t"].includes(native.abi_type)
      : kind === "bool"
        ? native.abi_type === "int"
        : kind === "integer" && native.abi_type === "fmpz_t";
    if (kind === null || !validAbi) {
      fail(
        `function ${fn.id} uses unsupported Wasm scalar marshalling ` +
          `${parameter.type}/${native.abi_type}`,
      );
    }
    scalarParameters.push({ parameter, native, kind });
  }

  if (returnedResource !== undefined) {
    const outputs = fn.native.arguments.filter(
      (argument) => argument.source === "result",
    );
    if (fn.signature.return_ownership !== "owned" ||
        fn.result.domain !== "status" || outputs.length !== 1 ||
        outputs[0].direction !== "out" || outputs[0].adapter !== null ||
        outputs[0].abi_type !== returnedResource.abi_type) {
      fail(`resource constructor ${fn.id} has an unsupported result protocol`);
    }
    return Object.freeze({
      kind: "constructor",
      fn,
      returnedResource,
      scalarParameters: Object.freeze(scalarParameters),
      resourceParameters: Object.freeze(resourceParameters),
    });
  }

  const resultKind = scalarKind(fn.signature.return_type);
  const outputs = fn.native.arguments.filter(
    (argument) => argument.source === "result",
  );
  const validReturn = resultKind === "uint64"
    ? fn.result.domain === "direct" &&
      ["ulong", "uint64_t"].includes(fn.native.return_type) &&
      outputs.length === 0
    : resultKind === "bool"
      ? fn.native.return_type === "int" && outputs.length === 0 &&
        ["direct", "status"].includes(fn.result.domain)
      : resultKind === "integer" && outputs.length === 1 &&
        outputs[0].direction === "out" && outputs[0].adapter === null &&
        outputs[0].abi_type === "fmpz_t" &&
        (fn.result.domain === "direct"
          ? fn.native.return_type === "void"
          : fn.result.domain === "status" &&
            fn.native.return_type !== "void");
  if (resultKind === null || !validReturn) {
    fail(`function ${fn.id} has an unsupported Wasm resource operation shape`);
  }
  return Object.freeze({
    kind: "operation",
    fn,
    resultKind,
    returnedResource: null,
    scalarParameters: Object.freeze(scalarParameters),
    resourceParameters: Object.freeze(resourceParameters),
  });
}

function resourceNames(resource) {
  const stem = `sagejs_wasm_${cName(resource.id)}`;
  return Object.freeze({
    stem,
    slot: `${stem}_slot`,
    slots: `${stem}_slots`,
    capacity: `${stem}_capacity`,
    live: `${stem}_live`,
    reserve: `${stem}_reserve`,
    lookup: `${stem}_lookup`,
    handle: `${stem}_handle`,
    close: `sagejs_wasm_${cName(resource.dynamic.close_export)}`,
  });
}

function resourceC(resource) {
  const names = resourceNames(resource);
  return `typedef struct
{
    uint32_t generation;
    uint8_t live;
    uint8_t retired;
    ${resource.abi_type} value;
}
${names.slot};

static ${names.slot} **${names.slots} = NULL;
static uint32_t ${names.capacity} = 0;
static uint64_t ${names.live} = 0;

static int
${names.reserve}(uint32_t *index, ${names.slot} **result)
{
    uint32_t position;
    for (position = 0; position < ${names.capacity}; position++)
    {
        ${names.slot} *slot = ${names.slots}[position];
        if (slot == NULL)
        {
            slot = (${names.slot} *) calloc(1, sizeof(${names.slot}));
            if (slot == NULL)
                return 0;
            slot->generation = 1;
            ${names.slots}[position] = slot;
        }
        if (!slot->live && !slot->retired)
        {
            *index = position;
            *result = slot;
            return 1;
        }
    }

    if (${names.capacity} == UINT32_MAX)
        return 0;
    uint32_t next = ${names.capacity} == 0 ? 8 : ${names.capacity} * 2;
    if (next < ${names.capacity} || next > UINT32_MAX)
        next = UINT32_MAX;
    if ((size_t) next > SIZE_MAX / sizeof(${names.slot} *))
        return 0;
    ${names.slot} **grown = (${names.slot} **) realloc(
        ${names.slots}, (size_t) next * sizeof(${names.slot} *));
    if (grown == NULL)
        return 0;
    memset(grown + ${names.capacity}, 0,
        (size_t) (next - ${names.capacity}) * sizeof(${names.slot} *));
    position = ${names.capacity};
    ${names.slots} = grown;
    ${names.capacity} = next;
    ${names.slot} *slot = (${names.slot} *) calloc(1, sizeof(${names.slot}));
    if (slot == NULL)
        return 0;
    slot->generation = 1;
    ${names.slots}[position] = slot;
    *index = position;
    *result = slot;
    return 1;
}

static uint64_t
${names.handle}(uint32_t index, const ${names.slot} *slot)
{
    return ((uint64_t) slot->generation << 32) | ((uint64_t) index + 1);
}

static ${names.slot} *
${names.lookup}(uint64_t handle)
{
    uint32_t encoded_index = (uint32_t) handle;
    uint32_t generation = (uint32_t) (handle >> 32);
    if (encoded_index == 0)
        return NULL;
    uint32_t index = encoded_index - 1;
    if (index >= ${names.capacity})
        return NULL;
    ${names.slot} *slot = ${names.slots}[index];
    if (slot == NULL || !slot->live || slot->generation != generation)
        return NULL;
    return slot;
}

SAGEJS_WASM_EXPORT int
${names.close}(uint64_t handle)
{
    ${names.slot} *slot = ${names.lookup}(handle);
    if (slot == NULL)
        return 0;
    ${resource.native.clear_symbol}(slot->value);
    memset(slot->value, 0, sizeof(slot->value));
    slot->live = 0;
    ${names.live}--;
    if (slot->generation == UINT32_MAX)
        slot->retired = 1;
    else
        slot->generation++;
    return 1;
}`;
}

function hostIngressC(resource) {
  const ingress = resource.host_ingress;
  if (ingress?.kind !== "copied_bytes" || ingress.targets.wasm !== true) {
    return "";
  }
  const names = resourceNames(resource);
  const wrapper = `sagejs_wasm_${cName(ingress.dynamic.export)}`;
  return `SAGEJS_WASM_EXPORT int
${wrapper}(uint32_t length)
{
    if (length > sagejs_wasm_stage_length)
        return 0;
    uint32_t sagejs_index;
    ${names.slot} *sagejs_slot;
    if (!${names.reserve}(&sagejs_index, &sagejs_slot))
        return 0;
    memset(sagejs_slot->value, 0, sizeof(sagejs_slot->value));
    if (!${ingress.native.init_symbol}(
            sagejs_slot->value, sagejs_wasm_stage_data, (uint64_t) length))
        return 0;
    sagejs_slot->live = 1;
    ${names.live}++;
    sagejs_wasm_last_u64_value = ${names.handle}(sagejs_index, sagejs_slot);
    return 1;
}`;
}

function hostTransferC(resource) {
  const transfer = resource.host_transfer;
  if (transfer?.kind !== "copied_bytes" || transfer.targets.wasm !== true) {
    return "";
  }
  const names = resourceNames(resource);
  const wrapper = `sagejs_wasm_${cName(transfer.dynamic.export)}`;
  return `SAGEJS_WASM_EXPORT int
${wrapper}(uint64_t handle)
{
    ${names.slot} *sagejs_resource = ${names.lookup}(handle);
    if (sagejs_resource == NULL)
        return 0;
    const uint64_t length = ${transfer.native.length_symbol}(
        sagejs_resource->value);
    const unsigned char *data = ${transfer.native.data_symbol}(
        sagejs_resource->value);
    if (length > UINT32_MAX || (length != 0 && data == NULL))
        return 0;
    sagejs_wasm_last_bytes_value = data;
    sagejs_wasm_last_bytes_length_value = (uint32_t) length;
    return 1;
}`;
}

function cScalarValidation(item, variable, indent) {
  const lines = [];
  if (item.native.abi_type === "ulong") {
    lines.push(`${indent}if (${variable} > (uint64_t) UWORD_MAX)`,
      `${indent}    return 0;`);
  }
  if (item.parameter.minimum !== undefined) {
    lines.push(
      `${indent}if (${variable} < UINT64_C(${item.parameter.minimum}))`,
      `${indent}    return 0;`,
    );
  }
  return lines;
}

function cArgument(item, variable) {
  if (item.resource !== undefined) return `${variable}->value`;
  if (item.kind === "integer") return variable;
  return `(${item.native.abi_type}) ${variable}`;
}

function functionC(classified) {
  const { fn } = classified;
  const wrapper = `sagejs_wasm_${cName(fn.dynamic.export)}`;
  const classifiedByName = new Map([
    ...classified.resourceParameters,
    ...classified.scalarParameters,
  ].map((item) => [item.parameter.name, item]));
  const declarations = fn.signature.parameters.flatMap((parameter) => {
    const item = classifiedByName.get(parameter.name);
    if (item?.kind === "integer") {
      return [
        `uint32_t sagejs_argument_${cName(parameter.name)}_offset`,
        `uint32_t sagejs_argument_${cName(parameter.name)}_length`,
      ];
    }
    const type = parameter.type === "bool" ? "int32_t" : "uint64_t";
    return [`${type} sagejs_argument_${cName(parameter.name)}`];
  });
  const parameterByName = new Map(
    fn.signature.parameters.map((parameter) => [parameter.name, parameter]),
  );
  const setup = [];
  for (const item of classified.resourceParameters) {
    const variable = `sagejs_resource_${cName(item.parameter.name)}`;
    const names = resourceNames(item.resource);
    setup.push(
      `    ${names.slot} *${variable} = ${names.lookup}(` +
        `sagejs_argument_${cName(item.parameter.name)});`,
      `    if (${variable} == NULL)`,
      "        return 0;",
    );
  }
  for (const item of classified.scalarParameters) {
    setup.push(...cScalarValidation(
      item, `sagejs_argument_${cName(item.parameter.name)}`, "    ",
    ));
  }
  const exactParameters = classified.scalarParameters.filter(
    (item) => item.kind === "integer",
  );
  const exactLocals = exactParameters.map(
    (item) => `sagejs_exact_${cName(item.parameter.name)}`,
  );
  const exactParse = [];
  for (const [index, item] of exactParameters.entries()) {
    const name = cName(item.parameter.name);
    const local = exactLocals[index];
    exactParse.push(
      `    if (!sagejs_wasm_staged_integer(` +
        `sagejs_argument_${name}_offset, sagejs_argument_${name}_length) ||`,
      `        fmpz_set_str(${local}, (const char *) (` +
        `sagejs_wasm_stage_data + sagejs_argument_${name}_offset), 10) != 0)`,
      "        goto sagejs_cleanup;",
    );
  }
  const exactResult = classified.resultKind === "integer"
    ? "sagejs_exact_result" : null;
  if (exactResult !== null) {
    exactLocals.push(exactResult);
  }
  const exactSetup = [
    ...exactLocals.map((local) => `    fmpz_init(${local});`),
    ...exactParse,
  ];
  const exactDeclarations = exactLocals.map(
    (local) => `    fmpz_t ${local};`,
  );
  const nativeArguments = fn.native.arguments.map((argument) => {
    if (argument.source === "result" && classified.returnedResource !== null) {
      return "sagejs_slot->value";
    }
    if (argument.source === "result" && exactResult !== null) {
      return exactResult;
    }
    const parameter = parameterByName.get(argument.source);
    const item = classifiedByName.get(argument.source);
    if (parameter === undefined || item === undefined) {
      fail(`function ${fn.id} has an unmapped native argument ${argument.source}`);
    }
    const variable = item.resource !== undefined
      ? `sagejs_resource_${cName(parameter.name)}`
      : item.kind === "integer"
        ? `sagejs_exact_${cName(parameter.name)}`
        : `sagejs_argument_${cName(parameter.name)}`;
    return cArgument(item, variable);
  });
  const cleanup = exactLocals.toReversed().map(
    (local) => `    fmpz_clear(${local});`,
  );
  const hasRaw = fn.native.return_type !== "void";
  const rawDeclaration = hasRaw
    ? `    ${fn.native.return_type} sagejs_raw;` : "";
  const invoke = hasRaw
    ? `    sagejs_raw = ${fn.native.symbol}(` +
      `${nativeArguments.join(", ")});`
    : `    ${fn.native.symbol}(${nativeArguments.join(", ")});`;
  const success = fn.result.success.map((value) =>
    `sagejs_raw == ${value}`
  ).join(" || ");
  const statusCheck = fn.result.domain === "status"
    ? `    if (!(${success}))\n        goto sagejs_cleanup;` : "";

  if (classified.kind === "constructor") {
    const names = resourceNames(classified.returnedResource);
    return `SAGEJS_WASM_EXPORT int
${wrapper}(${declarations.length === 0 ? "void" : declarations.join(", ")})
{
${setup.join("\n")}
${rawDeclaration}
${exactDeclarations.join("\n")}
    int sagejs_success = 0;
${exactSetup.join("\n")}
    uint32_t sagejs_index;
    ${names.slot} *sagejs_slot;
    if (!${names.reserve}(&sagejs_index, &sagejs_slot))
        goto sagejs_cleanup;
    /* Status-returning resource functions are declaration-level
       transactions: failure owns no initialized result.  Clear stale slot
       bytes before every attempt so a failed reservation remains reusable. */
    memset(sagejs_slot->value, 0, sizeof(sagejs_slot->value));
${invoke}
${statusCheck}
    sagejs_slot->live = 1;
    ${names.live}++;
    sagejs_wasm_last_u64_value = ${names.handle}(sagejs_index, sagejs_slot);
    sagejs_success = 1;
    goto sagejs_cleanup;
sagejs_cleanup:
${cleanup.join("\n")}
    return sagejs_success;
}`;
  }

  return `SAGEJS_WASM_EXPORT int
${wrapper}(${declarations.length === 0 ? "void" : declarations.join(", ")})
{
${setup.join("\n")}
${rawDeclaration}
${exactDeclarations.join("\n")}
    int sagejs_success = 0;
${exactSetup.join("\n")}
${invoke}
${statusCheck}
` + (classified.resultKind === "integer"
    ? `    if (!sagejs_wasm_publish_fmpz(${exactResult}))
        goto sagejs_cleanup;`
    : `    sagejs_wasm_last_u64_value = ` +
      (classified.resultKind === "bool"
        ? fn.result.domain === "status" ? "1;" : "sagejs_raw != 0;"
        : "(uint64_t) sagejs_raw;")) + `
    sagejs_success = 1;
    goto sagejs_cleanup;
sagejs_cleanup:
${cleanup.join("\n")}
    return sagejs_success;
}`;
}

function generatedCSource(declaration, surface, classified) {
  const headers = Array.from(new Set(declaration.library.native.headers)).sort();
  const liveSum = surface.resources.map((resource) =>
    resourceNames(resource).live
  ).join(" + ") || "0";
  const hasIntegerInput = classified.some((item) =>
    item.scalarParameters.some((parameter) => parameter.kind === "integer")
  );
  const hasIntegerOutput = classified.some(
    (item) => item.resultKind === "integer",
  );
  return `/* Generated from ${declaration.identity}; do not edit. */
#include <limits.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
${headers.map((header) => `#include <${header}>`).join("\n")}

#if defined(__GNUC__) || defined(__clang__)
#define SAGEJS_WASM_EXPORT __attribute__((visibility("default")))
#else
#define SAGEJS_WASM_EXPORT
#endif

static uint64_t sagejs_wasm_last_u64_value = 0;
static unsigned char *sagejs_wasm_stage_data = NULL;
static uint32_t sagejs_wasm_stage_length = 0;
static uint32_t sagejs_wasm_stage_capacity = 0;
${hasIntegerOutput
    ? "static char *sagejs_wasm_owned_last_bytes = NULL;\n" +
      "static uint32_t sagejs_wasm_owned_last_bytes_capacity = 0;"
    : ""}
static const unsigned char *sagejs_wasm_last_bytes_value = NULL;
static uint32_t sagejs_wasm_last_bytes_length_value = 0;

SAGEJS_WASM_EXPORT uint64_t
sagejs_wasm_last_u64(void)
{
    return sagejs_wasm_last_u64_value;
}

SAGEJS_WASM_EXPORT int
sagejs_wasm_stage_bytes(uint32_t length)
{
    const uint32_t required = length == 0 ? 1 : length;
    if (required > sagejs_wasm_stage_capacity)
    {
        unsigned char *grown = (unsigned char *) realloc(
            sagejs_wasm_stage_data, (size_t) required);
        if (grown == NULL)
            return 0;
        sagejs_wasm_stage_data = grown;
        sagejs_wasm_stage_capacity = required;
    }
    sagejs_wasm_stage_length = length;
    return 1;
}

SAGEJS_WASM_EXPORT uint32_t
sagejs_wasm_stage_pointer(void)
{
    return (uint32_t) (uintptr_t) sagejs_wasm_stage_data;
}

${hasIntegerInput ? `static int
sagejs_wasm_staged_integer(uint32_t offset, uint32_t length)
{
    return offset <= sagejs_wasm_stage_length &&
        length < sagejs_wasm_stage_length - offset &&
        sagejs_wasm_stage_data[offset + length] == 0;
}` : ""}

${hasIntegerOutput ? `static int
sagejs_wasm_publish_fmpz(const fmpz_t value)
{
    const size_t digits = fmpz_sizeinbase(value, 10);
    if (digits > (size_t) UINT32_MAX - 2)
        return 0;
    const uint32_t required = (uint32_t) digits + 2;
    if (required > sagejs_wasm_owned_last_bytes_capacity)
    {
        char *grown = (char *) realloc(
            sagejs_wasm_owned_last_bytes, (size_t) required);
        if (grown == NULL)
            return 0;
        sagejs_wasm_owned_last_bytes = grown;
        sagejs_wasm_owned_last_bytes_capacity = required;
    }
    if (fmpz_get_str(sagejs_wasm_owned_last_bytes, 10, value) == NULL)
        return 0;
    const size_t length = strlen(sagejs_wasm_owned_last_bytes);
    if (length > UINT32_MAX)
        return 0;
    sagejs_wasm_last_bytes_value =
        (const unsigned char *) sagejs_wasm_owned_last_bytes;
    sagejs_wasm_last_bytes_length_value = (uint32_t) length;
    return 1;
}` : ""}

SAGEJS_WASM_EXPORT uint32_t
sagejs_wasm_last_bytes_pointer(void)
{
    return (uint32_t) (uintptr_t) sagejs_wasm_last_bytes_value;
}

SAGEJS_WASM_EXPORT uint32_t
sagejs_wasm_last_bytes_length(void)
{
    return sagejs_wasm_last_bytes_length_value;
}

${surface.resources.map(resourceC).join("\n\n")}

${surface.resources.flatMap((resource) => [
    hostIngressC(resource), hostTransferC(resource),
  ]).filter(Boolean).join("\n\n")}

SAGEJS_WASM_EXPORT uint64_t
sagejs_wasm_resource_live_count(void)
{
    return ${liveSum};
}

${classified.map(functionC).join("\n\n")}
`;
}

function jsUint64(parameter, variable, indent) {
  const minimum = parameter.minimum === undefined
    ? "" : ` || ${variable} < ${BigInt(parameter.minimum)}n`;
  return `${indent}if (typeof ${variable} !== "bigint" || ${variable} < 0n || ` +
    `${variable} > 18446744073709551615n${minimum}) {\n` +
    `${indent}  throw new TypeError(${jsString(parameter.name +
      " must be a declared uint64 value")});\n${indent}}`;
}

function generatedJavaScriptSource(declaration, surface, classified) {
  const resourceIdentities = new Map(surface.resources.map((resource) => [
    resource.id, `${declaration.identity}:${resource.id}`,
  ]));
  const lines = [
    `/* Generated from ${declaration.identity}; do not edit. */`,
    "const sagejsResourceStates = new WeakMap();",
    "",
    "function makeResource(brand, identity, raw, closeExport, finalizer) {",
    "  const value = Object.freeze(Object.create(null));",
    "  const unregisterToken = Object.create(null);",
    "  sagejsResourceStates.set(value, {",
    "    brand, identity, raw, closed: false, unregisterToken,",
    "  });",
    "  finalizer?.register(value, { raw, closeExport }, unregisterToken);",
    "  return value;",
    "}",
    "",
    "function resourceState(value, brand, identity, allowClosed = false) {",
    "  const state = sagejsResourceStates.get(value);",
    "  if (state === undefined || state.brand !== brand || " +
      "state.identity !== identity) {",
    '    throw new TypeError("invalid generated Wasm FFI resource");',
    "  }",
    "  if (!allowClosed && state.closed) {",
    '    throw new Error("generated Wasm FFI resource is closed");',
    "  }",
    "  return state;",
    "}",
    "",
    "export function createGeneratedWasmBackend(instance) {",
    "  const wasm = instance?.exports;",
    "  if (wasm === undefined) {",
    '    throw new TypeError("expected an instantiated WebAssembly module");',
    "  }",
    "  if (!(wasm.memory instanceof WebAssembly.Memory)) {",
    '    throw new TypeError("generated Wasm FFI module must export memory");',
    "  }",
    "  const resourceBrand = Object.freeze(Object.create(null));",
    "  const finalizer = typeof FinalizationRegistry === \"function\"",
    "    ? new FinalizationRegistry(({ raw, closeExport }) => {",
    "      try { wasm[closeExport](raw); } catch (_) {}",
    "    })",
    "    : null;",
    "  function inputBytes(source) {",
    "    let view;",
    "    if (source instanceof Uint8Array) view = source;",
    "    else if (source instanceof ArrayBuffer) view = new Uint8Array(source);",
    "    else if (ArrayBuffer.isView(source)) {",
    "      view = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);",
    "    } else {",
    '      throw new TypeError("copied-byte ingress requires byte storage");',
    "    }",
    "    return view.slice();",
    "  }",
    "  function stageChunks(chunks) {",
    "    let length = 0;",
    "    const offsets = [];",
    "    for (const chunk of chunks) {",
    "      offsets.push(length);",
    "      length += chunk.length;",
    "      if (!Number.isSafeInteger(length) || length > 0xffffffff) {",
    '        throw new RangeError("Wasm copied input is too large");',
    "      }",
    "    }",
    "    if (wasm.sagejs_wasm_stage_bytes(length) !== 1) {",
    '      throw new Error("unable to allocate Wasm copied-input staging");',
    "    }",
    "    const pointer = wasm.sagejs_wasm_stage_pointer() >>> 0;",
    "    if (pointer + length > wasm.memory.buffer.byteLength) {",
    '      throw new Error("Wasm returned an invalid copied-input range");',
    "    }",
    "    const target = new Uint8Array(wasm.memory.buffer, pointer, length);",
    "    for (let index = 0; index < chunks.length; index += 1) {",
    "      target.set(chunks[index], offsets[index]);",
    "    }",
    "    return offsets;",
    "  }",
    "  function copiedLastBytes() {",
    "    const pointer = wasm.sagejs_wasm_last_bytes_pointer() >>> 0;",
    "    const length = wasm.sagejs_wasm_last_bytes_length() >>> 0;",
    "    if (pointer + length > wasm.memory.buffer.byteLength ||",
    "        (length !== 0 && pointer === 0)) {",
    '      throw new Error("Wasm returned an invalid copied-output range");',
    "    }",
    "    return new Uint8Array(wasm.memory.buffer, pointer, length).slice();",
    "  }",
    "  function exactIntegerBytes(value, name) {",
    "    const exact = typeof value === \"bigint\"",
    "      ? value",
    "      : Number.isSafeInteger(value) ? BigInt(value) : null;",
    "    if (exact === null) {",
    "      throw new TypeError(name + \" must be an exact Integer\");",
    "    }",
    "    const text = exact.toString();",
    "    const bytes = new Uint8Array(text.length + 1);",
    "    for (let index = 0; index < text.length; index += 1) {",
    "      bytes[index] = text.charCodeAt(index);",
    "    }",
    "    return bytes;",
    "  }",
    "  function lastInteger() {",
    "    const bytes = copiedLastBytes();",
    "    let text = \"\";",
    "    for (const byte of bytes) text += String.fromCharCode(byte);",
    "    if (!/^-?(?:0|[1-9][0-9]*)$/.test(text)) {",
    '      throw new Error("Wasm returned an invalid exact Integer");',
    "    }",
    "    return BigInt(text);",
    "  }",
    "  const backend = Object.create(null);",
  ];

  for (const resource of surface.resources) {
    const names = resourceNames(resource);
    const identity = resourceIdentities.get(resource.id);
    lines.push(
      `  backend[${jsString(resource.dynamic.close_export)}] = function (value) {`,
      `    const state = resourceState(value, resourceBrand, ` +
        `${jsString(identity)}, true);`,
      "    if (state.closed) return undefined;",
      `    if (wasm[${jsString(names.close)}](state.raw) !== 1) {`,
      '      throw new Error("Wasm rejected a live resource handle");',
      "    }",
      "    state.closed = true;",
      "    state.raw = 0n;",
      "    finalizer?.unregister(state.unregisterToken);",
      "    return undefined;",
      "  };",
    );
    const ingress = resource.host_ingress;
    if (ingress?.kind === "copied_bytes" && ingress.targets.wasm === true) {
      const wrapper = `sagejs_wasm_${cName(ingress.dynamic.export)}`;
      lines.push(
        `  backend[${jsString(ingress.dynamic.export)}] = function (source) {`,
        "    const bytes = inputBytes(source);",
        "    stageChunks([bytes]);",
        `    if (wasm[${jsString(wrapper)}](bytes.length) !== 1) {`,
        '      throw new Error("unable to copy bytes into Wasm FFI resource");',
        "    }",
        "    const raw = wasm.sagejs_wasm_last_u64();",
        `    return makeResource(resourceBrand, ${jsString(identity)}, raw, ` +
          `${jsString(names.close)}, finalizer);`,
        "  };",
      );
    }
    const transfer = resource.host_transfer;
    if (transfer?.kind === "copied_bytes" && transfer.targets.wasm === true) {
      const wrapper = `sagejs_wasm_${cName(transfer.dynamic.export)}`;
      lines.push(
        `  backend[${jsString(transfer.dynamic.export)}] = function (value) {`,
        `    const state = resourceState(value, resourceBrand, ` +
          `${jsString(identity)});`,
        `    if (wasm[${jsString(wrapper)}](state.raw) !== 1) {`,
        '      throw new Error("unable to copy bytes from Wasm FFI resource");',
        "    }",
        "    return copiedLastBytes();",
        "  };",
      );
    }
  }

  for (const item of classified) {
    const { fn } = item;
    const wrapper = `sagejs_wasm_${cName(fn.dynamic.export)}`;
    const params = fn.signature.parameters.map((parameter) => parameter.name);
    lines.push(
      `  backend[${jsString(fn.dynamic.export)}] = function (` +
        `${params.join(", ")}) {`,
    );
    const calls = [];
    const exactParameters = fn.signature.parameters.filter(
      (parameter) => parameter.type === "Integer",
    );
    const exactIndex = new Map(
      exactParameters.map((parameter, index) => [parameter.name, index]),
    );
    if (exactParameters.length !== 0) {
      lines.push(
        "    const sagejsIntegerChunks = [",
        ...exactParameters.map((parameter) =>
          `      exactIntegerBytes(${parameter.name}, ` +
          `${jsString(parameter.name)}),`
        ),
        "    ];",
        "    const sagejsIntegerOffsets = stageChunks(sagejsIntegerChunks);",
      );
    }
    for (const parameter of fn.signature.parameters) {
      const resource = surface.resources.find(
        (candidate) => candidate.python_name === parameter.type,
      );
      if (resource !== undefined) {
        const variable = `sagejs_${cName(parameter.name)}`;
        lines.push(
          `    const ${variable} = resourceState(${parameter.name}, ` +
            `resourceBrand, ` +
            `${jsString(resourceIdentities.get(resource.id))});`,
        );
        calls.push(`${variable}.raw`);
      } else {
        if (parameter.type === "uint64") {
          lines.push(jsUint64(parameter, parameter.name, "    "));
        } else if (parameter.type === "bool") {
          lines.push(
            `    if (typeof ${parameter.name} !== "boolean") {`,
            `      throw new TypeError(${jsString(parameter.name +
              " must be a bool")});`,
            "    }",
          );
        } else if (parameter.type === "Integer") {
          const index = exactIndex.get(parameter.name);
          calls.push(
            `sagejsIntegerOffsets[${index}], ` +
              `sagejsIntegerChunks[${index}].length - 1`,
          );
          continue;
        }
        calls.push(parameter.type === "bool"
          ? `${parameter.name} ? 1 : 0`
          : parameter.name);
      }
    }
    lines.push(
      `    if (wasm[${jsString(wrapper)}](${calls.join(", ")}) !== 1) {`,
      `      throw new Error(${jsString(fn.errors.message ||
        `Wasm FFI call ${fn.id} failed`)});`,
      "    }",
    );
    if (item.kind === "constructor") {
      lines.push(
        "    const raw = wasm.sagejs_wasm_last_u64();",
        `    return makeResource(resourceBrand, ${jsString(
          resourceIdentities.get(item.returnedResource.id),
        )}, raw, ${jsString(resourceNames(item.returnedResource).close)}, ` +
          "finalizer);",
      );
    } else if (item.resultKind === "integer") {
      lines.push("    return lastInteger();");
    } else if (item.resultKind === "bool") {
      lines.push("    return wasm.sagejs_wasm_last_u64() !== 0n;");
    } else {
      lines.push("    return wasm.sagejs_wasm_last_u64();");
    }
    lines.push("  };");
  }
  lines.push("  return Object.freeze(backend);", "}", "");
  return lines.join("\n");
}

function generatedWasmResourceAdapter(declaration, options = {}) {
  const surface = selectWasmResourceSurface(declaration, options);
  const selectedTypes = new Map(
    surface.resources.map((resource) => [resource.python_name, resource]),
  );
  const classified = surface.functions.map((fn) =>
    classifyFunction(fn, selectedTypes));
  const exportNames = [
    "sagejs_wasm_last_u64",
    "sagejs_wasm_stage_bytes",
    "sagejs_wasm_stage_pointer",
    "sagejs_wasm_last_bytes_pointer",
    "sagejs_wasm_last_bytes_length",
    "sagejs_wasm_resource_live_count",
    ...surface.resources.map((resource) => resourceNames(resource).close),
    ...surface.resources.flatMap((resource) => [
      resource.host_ingress?.targets.wasm === true
        ? `sagejs_wasm_${cName(resource.host_ingress.dynamic.export)}` : null,
      resource.host_transfer?.targets.wasm === true
        ? `sagejs_wasm_${cName(resource.host_transfer.dynamic.export)}` : null,
    ]).filter(Boolean),
    ...surface.functions.map((fn) =>
      `sagejs_wasm_${cName(fn.dynamic.export)}`
    ),
  ];
  const ingress = surface.resources.flatMap((resource) =>
    resource.host_ingress?.targets.wasm === true
      ? [Object.freeze({
        resource: resource.id,
        kind: resource.host_ingress.kind,
        export: resource.host_ingress.dynamic.export,
      })]
      : []
  );
  const transfer = surface.resources.flatMap((resource) =>
    resource.host_transfer?.targets.wasm === true
      ? [Object.freeze({
        resource: resource.id,
        kind: resource.host_transfer.kind,
        export: resource.host_transfer.dynamic.export,
      })]
      : []
  );
  const manifest = Object.freeze({
    schema: "sagejs.ffi/wasm-resource-adapter-v2",
    declaration: declaration.identity,
    resources: Object.freeze(surface.resources.map((resource) => resource.id)),
    functions: Object.freeze(surface.functions.map((fn) => fn.id)),
    host_ingress: Object.freeze(ingress),
    host_transfer: Object.freeze(transfer),
    integer_transfer: "copied-decimal-bytes",
    exports: Object.freeze(exportNames),
  });
  const functionIds = surface.functions.map((fn) => fn.id);
  return Object.freeze({
    cSource: generatedCSource(declaration, surface, classified),
    javascriptSource: generatedJavaScriptSource(
      declaration, surface, classified,
    ),
    hostSource: generatedHostAdapterSource(declaration, { functionIds }),
    manifest,
    manifestSource: `${JSON.stringify(manifest, null, 2)}\n`,
  });
}

module.exports = {
  generatedWasmResourceAdapter,
  selectWasmResourceSurface,
};
