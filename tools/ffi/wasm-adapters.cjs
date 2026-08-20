"use strict";

const {
  generatedHostAdapterSource,
  generatedHostFunctions,
} = require("./host-adapters.cjs");

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
  if (options.resourceIds !== undefined &&
      !Array.isArray(options.resourceIds)) {
    fail("resourceIds must be an array when supplied");
  }
  const { byId, byType } = resourceMaps(declaration);
  const selectedIds = new Set(options.resourceIds || []);
  const requestedFunctions = options.functionIds === undefined
    ? null : new Set(options.functionIds);
  if (selectedIds.size === 0 && requestedFunctions === null) {
    fail("resourceIds or functionIds must select a declared Wasm surface");
  }

  /* A borrowed view is never independently selected: its owned root is part
     of the same allocator/lifetime closure.  Conversely, selecting a root
     does not pull in every view unless a selected function uses it. */
  if (requestedFunctions !== null) {
    for (const fn of declaration.functions) {
      if (!requestedFunctions.has(fn.id)) continue;
      for (const id of touchedResources(fn, byType)) selectedIds.add(id);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Array.from(selectedIds)) {
      const resource = byId.get(id);
      if (resource?.owner !== null && resource?.owner !== undefined &&
          !selectedIds.has(resource.owner)) {
        selectedIds.add(resource.owner);
        changed = true;
      }
    }
  }
  for (const id of selectedIds) {
    const resource = byId.get(id);
    if (resource === undefined) fail(`unknown resource ${id}`);
    if (resource.targets.wasm !== true) {
      fail(`resource ${id} is not declared for the Wasm target`);
    }
    if (resource.ownership === "owned") {
      if (resource.owner !== null || resource.dynamic.close_export === null ||
          resource.native.clear_symbol === null) {
        fail(`resource ${id} lacks an independent owned close/clear protocol`);
      }
    } else if (resource.ownership === "borrowed") {
      const owner = byId.get(resource.owner);
      if (owner === undefined || owner.ownership !== "owned" ||
          owner.owner !== null) {
        fail(`resource view ${id} lacks an independently owned root`);
      }
    } else {
      fail(`resource ${id} has unsupported ownership ${resource.ownership}`);
    }
  }

  let requested = null;
  if (options.functionIds !== undefined) {
    if (!Array.isArray(options.functionIds) || options.functionIds.length === 0) {
      fail("functionIds must be a nonempty array when supplied");
    }
    requested = requestedFunctions;
    const known = new Set(declaration.functions.map((fn) => fn.id));
    for (const id of requested) {
      if (!known.has(id)) fail(`unknown function ${id}`);
    }
  }

  const functions = declaration.functions.filter((fn) => {
    if (requested !== null) return requested.has(fn.id);
    const touched = touchedResources(fn, byType);
    return Array.from(touched).some((id) => selectedIds.has(id));
  });
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

/* The old exported name remains accurate enough for callers that select a
   resource family, while the production closure uses this less restrictive
   spelling for scalar-only and packed-buffer surfaces. */
const selectWasmSurface = selectWasmResourceSurface;

function scalarKind(type) {
  if (type === "uint64") return "uint64";
  if (type === "bool") return "bool";
  if (type === "Integer") return "integer";
  return null;
}

function bufferKind(type) {
  if (type === "UInt64Buffer") return "uint64_buffer";
  if (type === "IntegerBuffer") return "integer_buffer";
  return null;
}

function adapterSources(adapter) {
  if (adapter === null || adapter === undefined) return [];
  if (adapter.kind === "packed_slice") {
    return [adapter.data, adapter.length];
  }
  if (adapter.kind === "packed_fmpz_matrix") {
    return [adapter.data, adapter.rows, adapter.columns];
  }
  if (adapter.kind === "packed_nmod_matrix") {
    return [adapter.data, adapter.rows, adapter.columns, adapter.modulus];
  }
  if (adapter.kind === "record") return Object.values(adapter.fields);
  fail(`unsupported packed adapter ${adapter.kind}`);
}

function validatePackedAdapter(fn, argument, parametersByName) {
  const adapter = argument.adapter;
  const fields = adapterSources(adapter);
  for (const field of fields) {
    if (!parametersByName.has(field)) {
      fail(`function ${fn.id} packed adapter names unknown parameter ${field}`);
    }
  }
  if (adapter.kind === "record") {
    return Object.freeze({ argument, kind: "record", adapter });
  }
  const data = parametersByName.get(adapter.data);
  const expected = adapter.kind === "packed_fmpz_matrix"
    ? "IntegerBuffer" : "UInt64Buffer";
  if (data.type !== expected) {
    fail(`function ${fn.id} ${adapter.kind} requires ${expected} data`);
  }
  if (adapter.access === "write" && data.ownership !== "borrowed_mut") {
    fail(`function ${fn.id} writes non-mutable packed data ${adapter.data}`);
  }
  if (!new Set(["read", "write"]).has(adapter.access)) {
    fail(`function ${fn.id} has invalid packed access ${adapter.access}`);
  }
  return Object.freeze({ argument, kind: adapter.kind, adapter });
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
  const bufferParameters = [];
  const parametersByName = new Map(
    fn.signature.parameters.map((parameter) => [parameter.name, parameter]),
  );
  const adaptedSources = new Set(fn.native.arguments.flatMap((argument) =>
    adapterSources(argument.adapter)));
  for (const parameter of fn.signature.parameters) {
    const native = nativeBySource.get(parameter.name);
    const packedKind = bufferKind(parameter.type);
    if (packedKind !== null) {
      if (!adaptedSources.has(parameter.name)) {
        fail(`function ${fn.id} does not consume packed buffer ${parameter.name}`);
      }
      bufferParameters.push({ parameter, kind: packedKind });
      continue;
    }
    /* Dimensions and record fields are consumed through an aggregate adapter
       and may deliberately have no one-to-one ABI argument. */
    if (native === undefined && adaptedSources.has(parameter.name)) {
      const kind = scalarKind(parameter.type);
      if (kind === null || kind === "integer") {
        fail(`function ${fn.id} has unsupported packed field ${parameter.name}`);
      }
      scalarParameters.push({ parameter, native: null, kind });
      continue;
    }
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

  const packedArguments = fn.native.arguments
    .filter((argument) => argument.adapter !== null)
    .map((argument) => validatePackedAdapter(fn, argument, parametersByName));

  if (returnedResource !== undefined) {
    const outputs = fn.native.arguments.filter(
      (argument) => argument.source === "result",
    );
    const expectedOwnership = returnedResource.ownership;
    if (fn.signature.return_ownership !== expectedOwnership ||
        fn.result.domain !== "status" || outputs.length !== 1 ||
        outputs[0].direction !== "out" || outputs[0].adapter !== null ||
        outputs[0].abi_type !== returnedResource.abi_type) {
      fail(`resource constructor ${fn.id} has an unsupported result protocol`);
    }
    if (expectedOwnership === "borrowed") {
      const borrowedFrom = parametersByName.get(fn.signature.borrow_from);
      const owner = borrowedFrom === undefined
        ? undefined : resourcesByType.get(borrowedFrom.type);
      if (owner === undefined || owner.id !== returnedResource.owner) {
        fail(`resource view ${fn.id} has an invalid borrowed root`);
      }
    }
    return Object.freeze({
      kind: expectedOwnership === "owned" ? "constructor" : "view",
      fn,
      returnedResource,
      scalarParameters: Object.freeze(scalarParameters),
      resourceParameters: Object.freeze(resourceParameters),
      bufferParameters: Object.freeze(bufferParameters),
      packedArguments: Object.freeze(packedArguments),
    });
  }

  const resultKind = scalarKind(fn.signature.return_type);
  const outputs = fn.native.arguments.filter(
    (argument) => argument.source === "result",
  );
  const validReturn = resultKind === "uint64"
    ? fn.result.domain === "direct" &&
      ["slong", "ulong", "uint64_t"].includes(fn.native.return_type) &&
      outputs.length === 0
    : resultKind === "bool"
      ? fn.native.return_type === "int" &&
        outputs.every((output) => output.adapter !== null) &&
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
    bufferParameters: Object.freeze(bufferParameters),
    packedArguments: Object.freeze(packedArguments),
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
    close: resource.dynamic?.close_export === undefined ||
      resource.dynamic.close_export === null
      ? null : `sagejs_wasm_${cName(resource.dynamic.close_export)}`,
    invalidateRoot: `${stem}_invalidate_root`,
  });
}

function resourceC(resource, childViews = []) {
  const names = resourceNames(resource);
  if (resource.ownership === "borrowed") return viewResourceC(resource);
  const invalidate = childViews.map((view) =>
    `    ${resourceNames(view).invalidateRoot}(handle);`).join("\n");
  return `typedef struct ${names.slot}
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
    sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_OK;
    ${names.slot} *slot = ${names.lookup}(handle);
    if (slot == NULL)
    {
        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_INVALID_HANDLE;
        return 0;
    }
${invalidate}
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

function viewResourceC(resource) {
  const names = resourceNames(resource);
  const ownerNames = resourceNames({ id: resource.owner });
  return `typedef struct ${names.slot}
{
    uint32_t generation;
    uint8_t live;
    uint8_t retired;
    uint64_t root_handle;
    ${resource.abi_type} value;
}
${names.slot};

static ${names.slot} **${names.slots} = NULL;
static uint32_t ${names.capacity} = 0;

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
    if (next < ${names.capacity})
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
    const uint32_t encoded_index = (uint32_t) handle;
    const uint32_t generation = (uint32_t) (handle >> 32);
    if (encoded_index == 0)
        return NULL;
    const uint32_t index = encoded_index - 1;
    if (index >= ${names.capacity})
        return NULL;
    ${names.slot} *slot = ${names.slots}[index];
    if (slot == NULL || !slot->live || slot->generation != generation ||
        ${ownerNames.lookup}(slot->root_handle) == NULL)
        return NULL;
    return slot;
}

static void
${names.invalidateRoot}(uint64_t root_handle)
{
    for (uint32_t index = 0; index < ${names.capacity}; index++)
    {
        ${names.slot} *slot = ${names.slots}[index];
        if (slot == NULL || !slot->live || slot->root_handle != root_handle)
            continue;
        slot->live = 0;
        if (slot->generation == UINT32_MAX)
            slot->retired = 1;
        else
            slot->generation++;
    }
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
    sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_OK;
    if (length > sagejs_wasm_stage_length)
    {
        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_INVALID_ARGUMENT;
        return 0;
    }
    uint32_t sagejs_index;
    ${names.slot} *sagejs_slot;
    if (!${names.reserve}(&sagejs_index, &sagejs_slot))
    {
        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_ALLOCATION;
        return 0;
    }
    memset(sagejs_slot->value, 0, sizeof(sagejs_slot->value));
    if (!${ingress.native.init_symbol}(
            sagejs_slot->value, sagejs_wasm_stage_data, (uint64_t) length))
    {
        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_LIBRARY;
        return 0;
    }
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
    sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_OK;
    ${names.slot} *sagejs_resource = ${names.lookup}(handle);
    if (sagejs_resource == NULL)
    {
        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_INVALID_HANDLE;
        return 0;
    }
    const uint64_t length = ${transfer.native.length_symbol}(
        sagejs_resource->value);
    const unsigned char *data = ${transfer.native.data_symbol}(
        sagejs_resource->value);
    if (length > UINT32_MAX || (length != 0 && data == NULL))
    {
        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_RANGE;
        return 0;
    }
    sagejs_wasm_last_bytes_value = data;
    sagejs_wasm_last_bytes_length_value = (uint32_t) length;
    return 1;
}`;
}

function cScalarValidation(item, variable, indent) {
  const lines = [];
  if (item.native?.abi_type === "ulong") {
    lines.push(`${indent}if (${variable} > (uint64_t) UWORD_MAX)`,
      `${indent}    SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_RANGE);`);
  }
  if (item.parameter.minimum !== undefined) {
    lines.push(
      `${indent}if (${variable} < UINT64_C(${item.parameter.minimum}))`,
      `${indent}    SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_RANGE);`,
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
    ...classified.bufferParameters,
  ].map((item) => [item.parameter.name, item]));
  const declarations = fn.signature.parameters.flatMap((parameter) => {
    const item = classifiedByName.get(parameter.name);
    if (item?.kind === "integer") {
      return [
        `uint32_t sagejs_argument_${cName(parameter.name)}_offset`,
        `uint32_t sagejs_argument_${cName(parameter.name)}_length`,
      ];
    }
    if (item?.kind === "uint64_buffer") {
      return [
        `uint32_t sagejs_argument_${cName(parameter.name)}_offset`,
        `uint32_t sagejs_argument_${cName(parameter.name)}_buffer_length`,
      ];
    }
    if (item?.kind === "integer_buffer") {
      return [
        `uint32_t sagejs_argument_${cName(parameter.name)}_sizes_offset`,
        `uint32_t sagejs_argument_${cName(parameter.name)}_limbs_offset`,
        `uint32_t sagejs_argument_${cName(parameter.name)}_buffer_length`,
        `uint32_t sagejs_argument_${cName(parameter.name)}_word_capacity`,
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
      "        SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_INVALID_HANDLE);",
    );
  }
  for (const item of classified.scalarParameters) {
    setup.push(...cScalarValidation(
      item, `sagejs_argument_${cName(item.parameter.name)}`, "    ",
    ));
  }
  for (const item of classified.bufferParameters) {
    const name = cName(item.parameter.name);
    if (item.kind === "uint64_buffer") {
      setup.push(
        `    if (!sagejs_wasm_stage_range(sagejs_argument_${name}_offset,`,
        `            sagejs_argument_${name}_buffer_length, sizeof(uint64_t), 8))`,
        "        SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_INVALID_ARGUMENT);",
        `    uint64_t *sagejs_buffer_${name} = (uint64_t *)` +
          ` (sagejs_wasm_stage_data + sagejs_argument_${name}_offset);`,
      );
    } else {
      setup.push(
        `    if (sagejs_argument_${name}_word_capacity == 0 ||`,
        `        !sagejs_wasm_stage_range(sagejs_argument_${name}_sizes_offset,`,
        `            sagejs_argument_${name}_buffer_length, sizeof(int32_t), 4) ||`,
        `        (sagejs_argument_${name}_buffer_length != 0 &&`,
        `            sagejs_argument_${name}_word_capacity > UINT32_MAX /`,
        `                sagejs_argument_${name}_buffer_length) ||`,
        `        !sagejs_wasm_stage_range(sagejs_argument_${name}_limbs_offset,`,
        `            sagejs_argument_${name}_buffer_length *`,
        `                sagejs_argument_${name}_word_capacity,`,
        `            sizeof(uint64_t), 8))`,
        "        SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_INVALID_ARGUMENT);",
        `    int32_t *sagejs_buffer_${name}_sizes = (int32_t *)` +
          ` (sagejs_wasm_stage_data + sagejs_argument_${name}_sizes_offset);`,
        `    uint64_t *sagejs_buffer_${name}_limbs = (uint64_t *)` +
          ` (sagejs_wasm_stage_data + sagejs_argument_${name}_limbs_offset);`,
        `    for (uint32_t sagejs_index = 0;` +
          ` sagejs_index < sagejs_argument_${name}_buffer_length; sagejs_index++)`,
        "    {",
        `        const int64_t sagejs_size = sagejs_buffer_${name}_sizes[` +
          "sagejs_index];",
        "        const uint64_t sagejs_magnitude = sagejs_size < 0 ?" +
          " (uint64_t) -sagejs_size : (uint64_t) sagejs_size;",
        `        if (sagejs_magnitude >` +
          ` sagejs_argument_${name}_word_capacity)`,
        "            SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_INVALID_ARGUMENT);",
        "    }",
      );
    }
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
      "    {",
      "        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_INVALID_ARGUMENT;",
      "        goto sagejs_cleanup;",
      "    }",
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
  const adapterDeclarations = [];
  const adapterValidation = [];
  const adapterInitialization = [];
  const adapterInput = [];
  const adapterOutput = [];
  const adapterCleanup = [];
  const hasFmpzAdapter = classified.packedArguments.some(
    (item) => item.kind === "packed_fmpz_matrix",
  );
  if (hasFmpzAdapter) {
    adapterDeclarations.push("    mpz_t sagejs_integer_scratch;");
    adapterInitialization.push("    mpz_init(sagejs_integer_scratch);");
    adapterCleanup.unshift("    mpz_clear(sagejs_integer_scratch);");
  }
  const nativeArguments = fn.native.arguments.map((argument, index) => {
    if (argument.source === "result" && classified.returnedResource !== null) {
      return "sagejs_slot->value";
    }
    if (argument.source === "result" && exactResult !== null) {
      return exactResult;
    }
    if (argument.adapter !== null) {
      const adapter = argument.adapter;
      if (adapter.kind === "packed_slice") {
        const data = cName(adapter.data);
        const length = cName(adapter.length);
        adapterValidation.push(
          `    if ((uint64_t) sagejs_argument_${data}_buffer_length !=` +
            ` sagejs_argument_${length})`,
          "        SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_RANGE);",
        );
        return `sagejs_buffer_${cName(adapter.data)}`;
      }
      if (adapter.kind === "record") {
        const local = `sagejs_record_${index}`;
        adapterDeclarations.push(`    ${argument.abi_type} ${local};`);
        for (const [field, source] of Object.entries(adapter.fields)) {
          const sourceItem = classifiedByName.get(source);
          const value = `sagejs_argument_${cName(source)}`;
          adapterInput.push(
            `    ${local}.${field} = (${sourceItem?.native?.abi_type ||
              (sourceItem?.kind === "bool" ? "int" : "uint64_t")}) ${value};`,
          );
        }
        return `&${local}`;
      }
      const local = `sagejs_aggregate_${index}`;
      const data = cName(adapter.data);
      const rows = `sagejs_argument_${cName(adapter.rows)}`;
      const columns = `sagejs_argument_${cName(adapter.columns)}`;
      const count = `sagejs_count_${index}`;
      adapterDeclarations.push(`    size_t ${count};`);
      adapterValidation.push(
        `    if (${rows} > (uint64_t) WORD_MAX ||` +
          ` ${columns} > (uint64_t) WORD_MAX ||`,
        `        (${rows} != 0 && ${columns} > (uint64_t) SIZE_MAX / ${rows}))`,
        "        SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_RANGE);",
        `    ${count} = (size_t) ${rows} * (size_t) ${columns};`,
        `    if (${count} != (size_t) sagejs_argument_${data}_buffer_length)`,
        "        SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_RANGE);",
      );
      if (adapter.kind === "packed_nmod_matrix") {
        const modulus = `sagejs_argument_${cName(adapter.modulus)}`;
        adapterDeclarations.push(`    nmod_mat_t ${local};`);
        adapterValidation.push(
          `    if (${modulus} < UINT64_C(2) || ${modulus} > (uint64_t) UWORD_MAX)`,
          "        SAGEJS_WASM_REJECT(SAGEJS_WASM_STATUS_RANGE);",
        );
        adapterInitialization.push(
          `    nmod_mat_init(${local}, (slong) ${rows}, (slong) ${columns},`,
          `        (ulong) ${modulus});`,
        );
        adapterCleanup.unshift(`    nmod_mat_clear(${local});`);
        if (adapter.access === "read") {
          adapterInput.push(
            `    for (size_t sagejs_index = 0; sagejs_index < ${count};` +
              " sagejs_index++)",
            `        nmod_mat_entry(${local}, (slong) (sagejs_index /` +
              ` (size_t) ${columns}),`,
            `            (slong) (sagejs_index % (size_t) ${columns})) =`,
            `            (ulong) (sagejs_buffer_${data}[sagejs_index] %` +
              ` ${modulus});`,
          );
        } else {
          adapterOutput.push(
            `    for (size_t sagejs_index = 0; sagejs_index < ${count};` +
              " sagejs_index++)",
            `        sagejs_buffer_${data}[sagejs_index] = (uint64_t)` +
              ` nmod_mat_entry(${local},`,
            `            (slong) (sagejs_index / (size_t) ${columns}),`,
            `            (slong) (sagejs_index % (size_t) ${columns}));`,
          );
        }
      } else if (adapter.kind === "packed_fmpz_matrix") {
        adapterDeclarations.push(`    fmpz_mat_t ${local};`);
        adapterInitialization.push(
          `    fmpz_mat_init(${local}, (slong) ${rows}, (slong) ${columns});`,
        );
        adapterCleanup.unshift(`    fmpz_mat_clear(${local});`);
        if (adapter.access === "read") {
          adapterInput.push(
            `    for (size_t sagejs_index = 0; sagejs_index < ${count};` +
              " sagejs_index++)",
            "    {",
            `        sagejs_wasm_integer_get(sagejs_buffer_${data}_sizes,`,
            `            sagejs_buffer_${data}_limbs,` +
              ` sagejs_argument_${data}_word_capacity,`,
            "            sagejs_index, sagejs_integer_scratch);",
            `        fmpz_set_mpz(fmpz_mat_entry(${local},`,
            `            (slong) (sagejs_index / (size_t) ${columns}),`,
            `            (slong) (sagejs_index % (size_t) ${columns})),`,
            "            sagejs_integer_scratch);",
            "    }",
          );
        } else {
          adapterOutput.push(
            `    for (size_t sagejs_index = 0; sagejs_index < ${count};` +
              " sagejs_index++)",
            "    {",
            "        fmpz_get_mpz(sagejs_integer_scratch,",
            `            fmpz_mat_entry(${local},`,
            `                (slong) (sagejs_index / (size_t) ${columns}),`,
            `                (slong) (sagejs_index % (size_t) ${columns})));`,
            `        if (!sagejs_wasm_integer_set(sagejs_buffer_${data}_sizes,`,
            `                sagejs_buffer_${data}_limbs,` +
              ` sagejs_argument_${data}_word_capacity,`,
            "                sagejs_index, sagejs_integer_scratch))",
            "            SAGEJS_WASM_FAIL(SAGEJS_WASM_STATUS_RANGE);",
            "    }",
          );
        }
      }
      return local;
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
  cleanup.unshift(...adapterCleanup);
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
    ? `    if (!(${success}))\n    {\n` +
      `        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_LIBRARY;\n` +
      `        goto sagejs_cleanup;\n    }` : "";

  if (classified.kind === "constructor" || classified.kind === "view") {
    const names = resourceNames(classified.returnedResource);
    const rootParameter = classified.kind === "view"
      ? fn.signature.borrow_from : null;
    return `SAGEJS_WASM_EXPORT int
${wrapper}(${declarations.length === 0 ? "void" : declarations.join(", ")})
{
    sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_OK;
${setup.join("\n")}
${rawDeclaration}
${exactDeclarations.join("\n")}
${adapterDeclarations.join("\n")}
    int sagejs_success = 0;
${adapterValidation.join("\n")}
${adapterInitialization.join("\n")}
${exactSetup.join("\n")}
${adapterInput.join("\n")}
    uint32_t sagejs_index;
    ${names.slot} *sagejs_slot;
    if (!${names.reserve}(&sagejs_index, &sagejs_slot))
    {
        sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_ALLOCATION;
        goto sagejs_cleanup;
    }
    /* Status-returning resource functions are declaration-level
       transactions: failure owns no initialized result.  Clear stale slot
       bytes before every attempt so a failed reservation remains reusable. */
    memset(sagejs_slot->value, 0, sizeof(sagejs_slot->value));
${invoke}
${statusCheck}
${adapterOutput.join("\n")}
    sagejs_slot->live = 1;
${classified.kind === "constructor" ? `    ${names.live}++;` :
      `    sagejs_slot->root_handle = ` +
        `sagejs_argument_${cName(rootParameter)};`}
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
    sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_OK;
${setup.join("\n")}
${rawDeclaration}
${exactDeclarations.join("\n")}
${adapterDeclarations.join("\n")}
    int sagejs_success = 0;
${adapterValidation.join("\n")}
${adapterInitialization.join("\n")}
${exactSetup.join("\n")}
${adapterInput.join("\n")}
${invoke}
${statusCheck}
${adapterOutput.join("\n")}
` + (classified.resultKind === "integer"
    ? `    if (!sagejs_wasm_publish_fmpz(${exactResult}))
        goto sagejs_cleanup;`
    : (classified.resultKind === "uint64" && fn.native.return_type === "slong"
      ? `    if (sagejs_raw < 0)\n` +
        `        SAGEJS_WASM_FAIL(SAGEJS_WASM_STATUS_RANGE);\n`
      : "") + `    sagejs_wasm_last_u64_value = ` +
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
  const liveSum = surface.resources.filter(
    (resource) => resource.ownership === "owned",
  ).map((resource) =>
    resourceNames(resource).live
  ).join(" + ") || "0";
  const hasIntegerInput = classified.some((item) =>
    item.scalarParameters.some((parameter) => parameter.kind === "integer")
  );
  const hasIntegerOutput = classified.some(
    (item) => item.resultKind === "integer",
  );
  const hasIntegerBuffer = classified.some(
    (item) => item.bufferParameters.some(
      (parameter) => parameter.kind === "integer_buffer",
    ),
  );
  const hasBuffer = classified.some(
    (item) => item.bufferParameters.length !== 0,
  );
  const orderedResources = [
    ...surface.resources.filter((resource) => resource.ownership === "owned"),
    ...surface.resources.filter((resource) => resource.ownership === "borrowed"),
  ];
  const resourceSources = orderedResources.toReversed().map((resource) => {
    const childViews = surface.resources.filter(
      (candidate) => candidate.owner === resource.id,
    );
    return resourceC(resource, childViews);
  }).toReversed();
  const resourcePrototypes = orderedResources.flatMap((resource) => {
    const names = resourceNames(resource);
    const lines = [
      `typedef struct ${names.slot} ${names.slot};`,
      `static ${names.slot} *${names.lookup}(uint64_t handle);`,
    ];
    if (resource.ownership === "borrowed") {
      lines.push(`static void ${names.invalidateRoot}(uint64_t root_handle);`);
    }
    return lines;
  });
  return `/* Generated from ${declaration.identity}; do not edit. */
#include <limits.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <gmp.h>
${headers.map((header) => `#include <${header}>`).join("\n")}

#if defined(__GNUC__) || defined(__clang__)
#define SAGEJS_WASM_EXPORT __attribute__((visibility("default")))
#else
#define SAGEJS_WASM_EXPORT
#endif

enum
{
    SAGEJS_WASM_STATUS_OK = 0,
    SAGEJS_WASM_STATUS_INVALID_ARGUMENT = 1,
    SAGEJS_WASM_STATUS_INVALID_HANDLE = 2,
    SAGEJS_WASM_STATUS_RANGE = 3,
    SAGEJS_WASM_STATUS_ALLOCATION = 4,
    SAGEJS_WASM_STATUS_LIBRARY = 5
};

static uint32_t sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_OK;
#define SAGEJS_WASM_FAIL(code) do { \
    sagejs_wasm_last_status_value = (code); \
    goto sagejs_cleanup; \
} while (0)
#define SAGEJS_WASM_REJECT(code) do { \
    sagejs_wasm_last_status_value = (code); \
    return 0; \
} while (0)

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

SAGEJS_WASM_EXPORT uint32_t
sagejs_wasm_last_status(void)
{
    return sagejs_wasm_last_status_value;
}

SAGEJS_WASM_EXPORT uint64_t
sagejs_wasm_last_u64(void)
{
    return sagejs_wasm_last_u64_value;
}

SAGEJS_WASM_EXPORT int
sagejs_wasm_stage_bytes(uint32_t length)
{
    sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_OK;
    const uint32_t required = length == 0 ? 1 : length;
    if (required > sagejs_wasm_stage_capacity)
    {
        unsigned char *grown = (unsigned char *) realloc(
            sagejs_wasm_stage_data, (size_t) required);
        if (grown == NULL)
        {
            sagejs_wasm_last_status_value = SAGEJS_WASM_STATUS_ALLOCATION;
            return 0;
        }
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

${hasBuffer ? `static int
sagejs_wasm_stage_range(
    uint32_t offset, uint32_t count, uint32_t width, uint32_t alignment)
{
    if (alignment == 0 || offset % alignment != 0 ||
        (count != 0 && width > UINT32_MAX / count))
        return 0;
    const uint32_t length = count * width;
    return offset <= sagejs_wasm_stage_length &&
        length <= sagejs_wasm_stage_length - offset;
}` : ""}

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

${hasIntegerBuffer ? `static void
sagejs_wasm_integer_get(
    const int32_t *sizes, const uint64_t *limbs, uint32_t word_capacity,
    size_t position, mpz_t result)
{
    const int32_t signed_size = sizes[position];
    const size_t count = signed_size < 0
        ? (size_t) (-(int64_t) signed_size) : (size_t) signed_size;
    if (count == 0)
        mpz_set_ui(result, 0);
    else
    {
        mpz_import(result, count, -1, sizeof(uint64_t), 0, 0,
            limbs + position * (size_t) word_capacity);
        if (signed_size < 0)
            mpz_neg(result, result);
    }
}

static int
sagejs_wasm_integer_set(
    int32_t *sizes, uint64_t *limbs, uint32_t word_capacity,
    size_t position, const mpz_t value)
{
    const int sign = mpz_sgn(value);
    const size_t count = sign == 0 ? 0 :
        (mpz_sizeinbase(value, 2) + 63) / 64;
    if (count > (size_t) word_capacity || count > (size_t) INT32_MAX)
        return 0;
    uint64_t *slot = limbs + position * (size_t) word_capacity;
    memset(slot, 0, (size_t) word_capacity * sizeof(uint64_t));
    size_t actual = 0;
    if (count != 0)
        mpz_export(slot, &actual, -1, sizeof(uint64_t), 0, 0, value);
    sizes[position] = sign < 0 ? -(int32_t) actual : (int32_t) actual;
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

${resourcePrototypes.join("\n")}

${resourceSources.join("\n\n")}

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
    "const sagejsStatusNames = Object.freeze([",
    '  "ok", "invalid-argument", "invalid-handle", "range",',
    '  "allocation", "library-failure",',
    "]);",
    "",
    "export class WasmFfiError extends Error {",
    "  constructor(message, status) {",
    "    super(message);",
    '    this.name = "WasmFfiError";',
    "    this.status = status;",
    '    this.code = sagejsStatusNames[status] || "unknown";',
    "  }",
    "}",
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
    "function makeView(brand, identity, raw, root) {",
    "  const value = Object.freeze(Object.create(null));",
    "  sagejsResourceStates.set(value, {",
    "    brand, identity, raw, closed: false, root, unregisterToken: null,",
    "  });",
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
    "  if (!allowClosed && state.root !== undefined &&",
    "      sagejsResourceStates.get(state.root)?.closed) {",
    '    throw new Error("generated Wasm FFI resource root is closed");',
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
    "  function callFailure(message) {",
    "    const status = wasm.sagejs_wasm_last_status() >>> 0;",
    "    return new WasmFfiError(message, status);",
    "  }",
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
    "      const alignment = chunk.alignment || 1;",
    "      length = Math.ceil(length / alignment) * alignment;",
    "      offsets.push(length);",
    "      length += chunk.bytes.length;",
    "      if (!Number.isSafeInteger(length) || length > 0xffffffff) {",
    '        throw new RangeError("Wasm copied input is too large");',
    "      }",
    "    }",
    "    if (wasm.sagejs_wasm_stage_bytes(length) !== 1) {",
    '      throw callFailure("unable to allocate Wasm copied-input staging");',
    "    }",
    "    const pointer = wasm.sagejs_wasm_stage_pointer() >>> 0;",
    "    if (pointer + length > wasm.memory.buffer.byteLength) {",
    '      throw new Error("Wasm returned an invalid copied-input range");',
    "    }",
    "    const target = new Uint8Array(wasm.memory.buffer, pointer, length);",
    "    for (let index = 0; index < chunks.length; index += 1) {",
    "      target.set(chunks[index].bytes, offsets[index]);",
    "    }",
    "    return offsets;",
    "  }",
    "  function copiedStageBytes(offset, length) {",
    "    const pointer = (wasm.sagejs_wasm_stage_pointer() >>> 0) + offset;",
    "    const end = pointer + length;",
    "    if (!Number.isSafeInteger(end) || end > wasm.memory.buffer.byteLength) {",
    '      throw new Error("Wasm returned an invalid staged-output range");',
    "    }",
    "    return new Uint8Array(wasm.memory.buffer, pointer, length).slice();",
    "  }",
    "  function uint64Bytes(storage) {",
    "    const bytes = new Uint8Array(storage.length * 8);",
    "    const view = new DataView(bytes.buffer);",
    "    for (let index = 0; index < storage.length; index += 1) {",
    "      view.setBigUint64(index * 8, storage[index], true);",
    "    }",
    "    return bytes;",
    "  }",
    "  function decodeUint64Bytes(bytes, storage) {",
    "    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);",
    "    for (let index = 0; index < storage.length; index += 1) {",
    "      storage[index] = view.getBigUint64(index * 8, true);",
    "    }",
    "  }",
    "  function normalizeUInt64Buffer(source, mutable, name) {",
    "    const isPacked = ArrayBuffer.isView(source) &&",
    '      Object.prototype.toString.call(source) === "[object BigUint64Array]";',
    "    let storage;",
    "    if (isPacked) storage = new BigUint64Array(source);",
    "    else if (source !== null && source !== undefined &&",
    "        Number.isSafeInteger(Number(source.length)) &&",
    "        Number(source.length) >= 0) {",
    "      storage = new BigUint64Array(Number(source.length));",
    "      for (let index = 0; index < storage.length; index += 1) {",
    "        const value = source[index];",
    "        if (typeof value !== \"bigint\" || value < 0n ||",
    "            value > 18446744073709551615n) {",
    "          throw new TypeError(name + \" has an invalid uint64 entry\");",
    "        }",
    "        storage[index] = value;",
    "      }",
    "    } else {",
    "      throw new TypeError(name + \" must be a UInt64Buffer\");",
    "    }",
    "    const commit = mutable ? () => {",
    "      if (isPacked) source.set(storage);",
    "      else for (let index = 0; index < storage.length; index += 1) {",
    "        source[index] = storage[index];",
    "      }",
    "    } : () => {};",
    "    return { storage, commit };",
    "  }",
    "  function int32Bytes(storage) {",
    "    const bytes = new Uint8Array(storage.length * 4);",
    "    const view = new DataView(bytes.buffer);",
    "    for (let index = 0; index < storage.length; index += 1) {",
    "      view.setInt32(index * 4, storage[index], true);",
    "    }",
    "    return bytes;",
    "  }",
    "  function decodeInt32Bytes(bytes, storage) {",
    "    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);",
    "    for (let index = 0; index < storage.length; index += 1) {",
    "      storage[index] = view.getInt32(index * 4, true);",
    "    }",
    "  }",
    "  function normalizeIntegerBuffer(source, mutable, name) {",
    "    if (source === null || typeof source !== \"object\") {",
    "      throw new TypeError(name + \" must be a packed IntegerBuffer\");",
    "    }",
    "    const length = Number(source.length);",
    "    const wordCapacity = Number(source.wordCapacity);",
    "    const sizes = source.sizes;",
    "    const limbs = source.limbs;",
    "    const limbLength = length * wordCapacity;",
    "    if (!Number.isSafeInteger(length) || length < 0 ||",
    "        !Number.isSafeInteger(wordCapacity) || wordCapacity <= 0 ||",
    "        !Number.isSafeInteger(limbLength) ||",
    "        !ArrayBuffer.isView(sizes) || !ArrayBuffer.isView(limbs) ||",
    '        Object.prototype.toString.call(sizes) !== "[object Int32Array]" ||',
    '        Object.prototype.toString.call(limbs) !== "[object BigUint64Array]" ||',
    "        sizes.length !== length || limbs.length !== limbLength) {",
    "      throw new TypeError(name + \" must be a packed IntegerBuffer\");",
    "    }",
    "    const copiedSizes = new Int32Array(sizes);",
    "    const copiedLimbs = new BigUint64Array(limbs);",
    "    for (const size of copiedSizes) {",
    "      if (Math.abs(size) > wordCapacity) {",
    "        throw new RangeError(name + \" slot exceeds its word capacity\");",
    "      }",
    "    }",
    "    const commit = mutable ? () => {",
    "      sizes.set(copiedSizes);",
    "      limbs.set(copiedLimbs);",
    "    } : () => {};",
    "    return { length, wordCapacity, sizes: copiedSizes,",
    "      limbs: copiedLimbs, commit };",
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
    if (resource.ownership === "owned") {
      lines.push(
        `  backend[${jsString(resource.dynamic.close_export)}] = function (value) {`,
        `    const state = resourceState(value, resourceBrand, ` +
          `${jsString(identity)}, true);`,
        "    if (state.closed) return undefined;",
        `    if (wasm[${jsString(names.close)}](state.raw) !== 1) {`,
        '      throw callFailure("Wasm rejected a live resource handle");',
        "    }",
        "    state.closed = true;",
        "    state.raw = 0n;",
        "    finalizer?.unregister(state.unregisterToken);",
        "    return undefined;",
        "  };",
      );
    }
    const ingress = resource.host_ingress;
    if (ingress?.kind === "copied_bytes" && ingress.targets.wasm === true) {
      const wrapper = `sagejs_wasm_${cName(ingress.dynamic.export)}`;
      lines.push(
        `  backend[${jsString(ingress.dynamic.export)}] = function (source) {`,
        "    const bytes = inputBytes(source);",
        "    stageChunks([{ bytes, alignment: 1 }]);",
        `    if (wasm[${jsString(wrapper)}](bytes.length) !== 1) {`,
        '      throw callFailure("unable to copy bytes into Wasm FFI resource");',
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
        '      throw callFailure("unable to copy bytes from Wasm FFI resource");',
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
    const chunks = new Map();
    let chunkCount = 0;
    lines.push("    const sagejsChunks = [];");
    for (const parameter of fn.signature.parameters) {
      const name = cName(parameter.name);
      if (parameter.type === "Integer") {
        const index = chunkCount++;
        chunks.set(parameter.name, { kind: "integer", index });
        lines.push(
          `    const sagejsExact_${name} = exactIntegerBytes(` +
            `${parameter.name}, ${jsString(parameter.name)});`,
          `    sagejsChunks.push({ bytes: sagejsExact_${name}, alignment: 1 });`,
        );
      } else if (parameter.type === "UInt64Buffer") {
        const index = chunkCount++;
        const mutable = parameter.ownership === "borrowed_mut" ||
          parameter.mutability === "write";
        chunks.set(parameter.name, { kind: "uint64", index, mutable });
        lines.push(
          `    const sagejsBuffer_${name} = normalizeUInt64Buffer(` +
            `${parameter.name}, ${mutable}, ${jsString(parameter.name)});`,
          `    sagejsChunks.push({ bytes: uint64Bytes(` +
            `sagejsBuffer_${name}.storage), alignment: 8 });`,
        );
      } else if (parameter.type === "IntegerBuffer") {
        const sizesIndex = chunkCount++;
        const limbsIndex = chunkCount++;
        const mutable = parameter.ownership === "borrowed_mut" ||
          parameter.mutability === "write";
        chunks.set(parameter.name, {
          kind: "integer_buffer", sizesIndex, limbsIndex, mutable,
        });
        lines.push(
          `    const sagejsBuffer_${name} = normalizeIntegerBuffer(` +
            `${parameter.name}, ${mutable}, ${jsString(parameter.name)});`,
          `    sagejsChunks.push({ bytes: int32Bytes(` +
            `sagejsBuffer_${name}.sizes), alignment: 4 });`,
          `    sagejsChunks.push({ bytes: uint64Bytes(` +
            `sagejsBuffer_${name}.limbs), alignment: 8 });`,
        );
      }
    }
    if (chunkCount !== 0) {
      lines.push("    const sagejsOffsets = stageChunks(sagejsChunks);");
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
          const { index } = chunks.get(parameter.name);
          const name = cName(parameter.name);
          calls.push(
            `sagejsOffsets[${index}], sagejsExact_${name}.length - 1`,
          );
          continue;
        } else if (parameter.type === "UInt64Buffer") {
          const { index } = chunks.get(parameter.name);
          const name = cName(parameter.name);
          calls.push(
            `sagejsOffsets[${index}], sagejsBuffer_${name}.storage.length`,
          );
          continue;
        } else if (parameter.type === "IntegerBuffer") {
          const { sizesIndex, limbsIndex } = chunks.get(parameter.name);
          const name = cName(parameter.name);
          calls.push(
            `sagejsOffsets[${sizesIndex}], sagejsOffsets[${limbsIndex}], ` +
              `sagejsBuffer_${name}.length, ` +
              `sagejsBuffer_${name}.wordCapacity`,
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
      `      throw callFailure(${jsString(fn.errors.message ||
        `Wasm FFI call ${fn.id} failed`)});`,
      "    }",
    );
    for (const parameter of fn.signature.parameters) {
      const chunk = chunks.get(parameter.name);
      if (chunk?.mutable !== true) continue;
      const name = cName(parameter.name);
      if (chunk.kind === "uint64") {
        lines.push(
          `    decodeUint64Bytes(copiedStageBytes(sagejsOffsets[` +
            `${chunk.index}], sagejsBuffer_${name}.storage.length * 8),`,
          `      sagejsBuffer_${name}.storage);`,
          `    sagejsBuffer_${name}.commit();`,
        );
      } else {
        lines.push(
          `    decodeInt32Bytes(copiedStageBytes(sagejsOffsets[` +
            `${chunk.sizesIndex}], sagejsBuffer_${name}.sizes.length * 4),`,
          `      sagejsBuffer_${name}.sizes);`,
          `    decodeUint64Bytes(copiedStageBytes(sagejsOffsets[` +
            `${chunk.limbsIndex}], sagejsBuffer_${name}.limbs.length * 8),`,
          `      sagejsBuffer_${name}.limbs);`,
          `    sagejsBuffer_${name}.commit();`,
        );
      }
    }
    if (item.kind === "constructor") {
      lines.push(
        "    const raw = wasm.sagejs_wasm_last_u64();",
        `    return makeResource(resourceBrand, ${jsString(
          resourceIdentities.get(item.returnedResource.id),
        )}, raw, ${jsString(resourceNames(item.returnedResource).close)}, ` +
          "finalizer);",
      );
    } else if (item.kind === "view") {
      lines.push(
        "    const raw = wasm.sagejs_wasm_last_u64();",
        `    return makeView(resourceBrand, ${jsString(
          resourceIdentities.get(item.returnedResource.id),
        )}, raw, ${fn.signature.borrow_from});`,
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
    "sagejs_wasm_last_status",
    "sagejs_wasm_last_u64",
    "sagejs_wasm_stage_bytes",
    "sagejs_wasm_stage_pointer",
    "sagejs_wasm_last_bytes_pointer",
    "sagejs_wasm_last_bytes_length",
    "sagejs_wasm_resource_live_count",
    ...surface.resources.map((resource) => resourceNames(resource).close)
      .filter(Boolean),
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
    resource_protocol: Object.freeze(surface.resources.map((resource) =>
      Object.freeze({
        id: resource.id,
        ownership: resource.ownership,
        owner: resource.owner,
        abi_type: resource.abi_type,
      }))),
    function_protocol: Object.freeze(surface.functions.map((fn) =>
      Object.freeze({
        id: fn.id,
        export: fn.dynamic.export,
        result_domain: fn.result.domain,
        packed_buffers: Object.freeze(fn.signature.parameters
          .filter((parameter) => bufferKind(parameter.type) !== null)
          .map((parameter) => Object.freeze({
            name: parameter.name,
            type: parameter.type,
            mutable: parameter.ownership === "borrowed_mut" ||
              parameter.mutability === "write",
          }))),
      }))),
    host_ingress: Object.freeze(ingress),
    host_transfer: Object.freeze(transfer),
    integer_transfer: "copied-decimal-bytes",
    packed_transfer: Object.freeze({
      byte_order: "little-endian",
      mode: "copy-in-transactional-copy-out",
      memory_growth: "reacquire-memory-buffer-before-every-copy",
      integer_buffer: "signed-size-and-uint64-limbs",
    }),
    handles: "generation-tagged-module-local-u64",
    statuses: Object.freeze([
      "ok", "invalid-argument", "invalid-handle", "range", "allocation",
      "library-failure",
    ]),
    exports: Object.freeze(exportNames),
  });
  const functionIds = surface.functions.map((fn) => fn.id);
  const hostEligible = new Set(
    generatedHostFunctions(declaration).map((fn) => fn.id),
  );
  const hostFunctionIds = functionIds.filter((id) => hostEligible.has(id));
  return Object.freeze({
    cSource: generatedCSource(declaration, surface, classified),
    javascriptSource: generatedJavaScriptSource(
      declaration, surface, classified,
    ),
    hostSource: hostFunctionIds.length === 0
      ? `# No selected Wasm functions have a generated Node host adapter.\n`
      : generatedHostAdapterSource(declaration, {
        functionIds: hostFunctionIds,
      }),
    manifest,
    manifestSource: `${JSON.stringify(manifest, null, 2)}\n`,
  });
}

module.exports = {
  generatedWasmResourceAdapter,
  selectWasmSurface,
  selectWasmResourceSurface,
};
