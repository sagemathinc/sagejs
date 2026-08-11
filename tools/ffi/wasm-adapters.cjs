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
      if (parameter.ownership !== "borrowed") {
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
      : kind === "bool" && native.abi_type === "int";
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
        outputs[0].abi_type !== returnedResource.abi_type ||
        resourceParameters.length !== 0) {
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
  const validReturn = resultKind === "uint64"
    ? ["ulong", "uint64_t"].includes(fn.native.return_type)
    : resultKind === "bool" && fn.native.return_type === "int";
  if (fn.result.domain !== "direct" || resultKind === null || !validReturn ||
      resourceParameters.length === 0) {
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
    slot->live = 0;
    ${names.live}--;
    if (slot->generation == UINT32_MAX)
        slot->retired = 1;
    else
        slot->generation++;
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
  return `(${item.native.abi_type}) ${variable}`;
}

function functionC(classified) {
  const { fn } = classified;
  const wrapper = `sagejs_wasm_${cName(fn.dynamic.export)}`;
  const declarations = fn.signature.parameters.map((parameter) => {
    const type = parameter.type === "bool" ? "int32_t" : "uint64_t";
    return `${type} sagejs_argument_${cName(parameter.name)}`;
  });
  const parameterByName = new Map(
    fn.signature.parameters.map((parameter) => [parameter.name, parameter]),
  );
  const classifiedByName = new Map([
    ...classified.resourceParameters,
    ...classified.scalarParameters,
  ].map((item) => [item.parameter.name, item]));
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
  const nativeArguments = fn.native.arguments.map((argument) => {
    if (argument.source === "result" && classified.returnedResource !== null) {
      return "sagejs_slot->value";
    }
    const parameter = parameterByName.get(argument.source);
    const item = classifiedByName.get(argument.source);
    if (parameter === undefined || item === undefined) {
      fail(`function ${fn.id} has an unmapped native argument ${argument.source}`);
    }
    const variable = item.resource === undefined
      ? `sagejs_argument_${cName(parameter.name)}`
      : `sagejs_resource_${cName(parameter.name)}`;
    return cArgument(item, variable);
  });

  if (classified.kind === "constructor") {
    const names = resourceNames(classified.returnedResource);
    const success = fn.result.success.map((value) =>
      `sagejs_raw == ${value}`
    ).join(" || ");
    return `SAGEJS_WASM_EXPORT int
${wrapper}(${declarations.length === 0 ? "void" : declarations.join(", ")})
{
${setup.join("\n")}
    uint32_t sagejs_index;
    ${names.slot} *sagejs_slot;
    if (!${names.reserve}(&sagejs_index, &sagejs_slot))
        return 0;
    ${fn.native.return_type} sagejs_raw = ${fn.native.symbol}(
        ${nativeArguments.join(", ")});
    if (!(${success}))
        return 0;
    sagejs_slot->live = 1;
    ${names.live}++;
    sagejs_wasm_last_u64_value = ${names.handle}(sagejs_index, sagejs_slot);
    return 1;
}`;
  }

  return `SAGEJS_WASM_EXPORT int
${wrapper}(${declarations.length === 0 ? "void" : declarations.join(", ")})
{
${setup.join("\n")}
    ${fn.native.return_type} sagejs_raw = ${fn.native.symbol}(
        ${nativeArguments.join(", ")});
    sagejs_wasm_last_u64_value = ` +
      (classified.resultKind === "bool"
        ? "sagejs_raw != 0;"
        : "(uint64_t) sagejs_raw;") + `
    return 1;
}`;
}

function generatedCSource(declaration, surface, classified) {
  const headers = Array.from(new Set(declaration.library.native.headers)).sort();
  const liveSum = surface.resources.map((resource) =>
    resourceNames(resource).live
  ).join(" + ") || "0";
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

SAGEJS_WASM_EXPORT uint64_t
sagejs_wasm_last_u64(void)
{
    return sagejs_wasm_last_u64_value;
}

${surface.resources.map(resourceC).join("\n\n")}

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
    "function makeResource(brand, identity, raw) {",
    "  const value = Object.freeze(Object.create(null));",
    "  sagejsResourceStates.set(value, { brand, identity, raw, closed: false });",
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
    "  const resourceBrand = Object.freeze(Object.create(null));",
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
      "    return undefined;",
      "  };",
    );
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
        )}, raw);`,
      );
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
    "sagejs_wasm_resource_live_count",
    ...surface.resources.map((resource) => resourceNames(resource).close),
    ...surface.functions.map((fn) =>
      `sagejs_wasm_${cName(fn.dynamic.export)}`
    ),
  ];
  const manifest = Object.freeze({
    schema: "sagejs.ffi/wasm-resource-adapter-v1",
    declaration: declaration.identity,
    resources: Object.freeze(surface.resources.map((resource) => resource.id)),
    functions: Object.freeze(surface.functions.map((fn) => fn.id)),
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
