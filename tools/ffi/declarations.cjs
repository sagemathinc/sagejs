"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  readFileSync,
  readdirSync,
} = require("node:fs");
const { join, resolve } = require("node:path");
const { loadCatalog } = require("./abi-catalog.cjs");

const repositoryRoot = resolve(__dirname, "..", "..");
const schema = "sagejs.ffi/declaration-v6";
const ownership = new Set(["borrowed", "borrowed_mut", "owned", "value"]);
const errorExceptions = new Set([
  "OverflowError", "RuntimeError", "TypeError", "ValueError",
]);

function fail(filename, message) {
  throw new Error(`FFI declaration ${filename}: ${message}`);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value) {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function exactKeys(filename, value, keys, label) {
  if (!object(value)) fail(filename, `${label} must be an object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(filename, `${label} has unknown field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(filename, `${label} is missing ${key}`);
  }
}

function knownKeys(filename, value, required, optional, label) {
  if (!object(value)) fail(filename, `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(filename, `${label} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) fail(filename, `${label} is missing ${key}`);
  }
}

function nullableString(filename, value, label) {
  if (value !== null && (typeof value !== "string" || value.length === 0)) {
    fail(filename, `${label} must be null or a nonempty string`);
  }
}

function strings(filename, value, label) {
  if (!Array.isArray(value) || value.some((item) =>
    typeof item !== "string" || item.length === 0
  )) fail(filename, `${label} must be an array of nonempty strings`);
}

function safeStrings(filename, value, label, pattern) {
  strings(filename, value, label);
  for (const item of value) {
    if (!pattern.test(item)) fail(filename, `${label} contains unsafe value ${item}`);
  }
}

function validateResource(filename, resource, ids, pythonNames, abiNames) {
  exactKeys(filename, resource, [
    "id", "python_name", "abi_type", "ownership", "owner", "dynamic",
    "native", "targets",
  ], `resource ${resource.id || "?"}`);
  if (!identifier(resource.id) || ids.has(resource.id)) {
    fail(filename, `invalid or duplicate resource id ${resource.id}`);
  }
  if (!identifier(resource.python_name) || pythonNames.has(resource.python_name)) {
    fail(filename, `invalid or duplicate resource Python name ${resource.python_name}`);
  }
  if (!identifier(resource.abi_type) || abiNames.has(resource.abi_type)) {
    fail(filename, `unsupported or duplicate resource ABI ${resource.abi_type}`);
  }
  if (!new Set(["owned", "borrowed"]).has(resource.ownership)) {
    fail(filename, `${resource.id} must be an owned resource or borrowed view`);
  }
  nullableString(filename, resource.owner, `${resource.id}.owner`);
  if ((resource.ownership === "owned") !== (resource.owner === null)) {
    fail(filename,
      `${resource.id} owned resources require a null owner and borrowed ` +
      "views require an owner");
  }
  exactKeys(filename, resource.dynamic, ["close_export"],
    `${resource.id}.dynamic`);
  if (resource.dynamic.close_export !== null &&
      !identifier(resource.dynamic.close_export)) {
    fail(filename, `${resource.id}.dynamic.close_export must be an identifier`);
  }
  if ((resource.ownership === "owned") !==
      (resource.dynamic.close_export !== null)) {
    fail(filename,
      `${resource.id} close export is required only for owned resources`);
  }
  exactKeys(filename, resource.native, ["clear_symbol"],
    `${resource.id}.native`);
  if (resource.native.clear_symbol !== null &&
      !identifier(resource.native.clear_symbol)) {
    fail(filename, `${resource.id}.native.clear_symbol must be a C identifier`);
  }
  if ((resource.ownership === "owned") !==
      (resource.native.clear_symbol !== null)) {
    fail(filename,
      `${resource.id} clear symbol is required only for owned resources`);
  }
  exactKeys(filename, resource.targets, ["dynamic", "native", "wasm"],
    `${resource.id}.targets`);
  if (Object.values(resource.targets).some((value) => typeof value !== "boolean") ||
      !resource.targets.dynamic || !resource.targets.native) {
    fail(filename, `${resource.id} requires dynamic and native targets`);
  }
  ids.add(resource.id);
  pythonNames.add(resource.python_name);
  abiNames.add(resource.abi_type);
  return Object.freeze({ ...resource, semantic_type: resource.python_name });
}

function callPlan(library, fn, catalog, resourcesByType) {
  const parameters = new Map(fn.signature.parameters.map((item, index) => [
    item.name, { ...item, index },
  ]));
  const arguments_ = fn.native.arguments.map((argument, position) => {
    const resource = argument.source === "result" ? undefined :
      resourcesByType.get(parameters.get(argument.source)?.type);
    const abi = catalog.abiTypes.get(argument.abi_type);
    const lowering = argument.adapter?.kind === "record"
      ? {
          kind: "record",
          adapter: "record",
          fields: { ...argument.adapter.fields },
          c_type: abi.c_type,
          pass: abi.pass,
          record_fields: abi.fields.map((field) => ({
            ...field,
            c_type: catalog.abiTypes.get(field.abi_type).c_type,
          })),
        }
      : argument.adapter !== null ? {
          kind: "adapter",
          adapter: argument.adapter.kind,
          fields: { ...argument.adapter },
          c_type: abi.c_type,
        }
      : argument.source === "result"
        ? {
            kind: "result",
            c_type: abi?.c_type || argument.abi_type,
          }
        : resource !== undefined
          ? {
              kind: "resource",
              resource: resource.id,
              c_type: argument.abi_type,
            }
          : { kind: abi.kind, c_type: abi.c_type };
    return Object.freeze({
      position, source: argument.source, abi_type: argument.abi_type,
      direction: argument.direction, lowering: Object.freeze(lowering),
    });
  });
  const constraints = [];
  const transactions = [];
  for (const argument of fn.native.arguments) {
    if (argument.adapter === null) continue;
    const spec = catalog.adapters.get(argument.adapter.kind);
    if (spec.kind === "record") continue;
    constraints.push(Object.freeze({
      kind: "buffer_length",
      buffer: argument.adapter.data,
      dimensions: Object.freeze(spec.dimensions.map((field) =>
        argument.adapter[field])),
      parameter_names: Object.freeze(fn.signature.parameters.map(
        (parameter) => parameter.name)),
    }));
    if (argument.adapter[spec.access_field] === "write") {
      transactions.push(Object.freeze({
        buffer: argument.adapter.data,
        commit: "success",
        staging: argument.adapter[spec.transactional_field]
          ? "temporary" : "direct",
      }));
    }
  }
  const resultArgument = fn.native.arguments.find((item) =>
    item.source === "result");
  return Object.freeze({
    schema: "sagejs.ffi/call-plan-v2",
    declaration_id: `${library.id}:${fn.id}`,
    symbol: fn.exceptions.policy === "cxx_to_status"
      ? `sagejs_ffi_shield_${library.id}_${fn.id}` : fn.native.symbol,
    foreign_symbol: fn.native.symbol,
    native_return: fn.native.return_type,
    native_return_c_type: catalog.abiTypes.get(fn.native.return_type).c_type,
    result: Object.freeze({
      transfer: resultArgument !== undefined ? "out" : "direct",
      domain: fn.result.domain,
      success: Object.freeze([...fn.result.success]),
      absence: fn.result.absence,
      semantic_type: fn.signature.return_type,
    }),
    arguments: Object.freeze(arguments_),
    constraints: Object.freeze(constraints),
    transactions: Object.freeze(transactions),
  });
}

function validateFunction(
  filename, library, fn, ids, pythonNames, resourcesByType, catalog,
) {
  const semanticTypes = new Set([
    ...catalog.semanticTypes.keys(), ...resourcesByType.keys(),
  ]);
  exactKeys(filename, fn, [
    "id", "python_name", "signature", "dynamic", "native", "effects",
    "result", "errors", "exceptions", "targets",
  ], `function ${fn.id || "?"}`);
  if (!identifier(fn.id)) fail(filename, "function id must be a C identifier");
  if (!identifier(fn.python_name)) {
    fail(filename, `${fn.id}.python_name must be a Python identifier`);
  }
  if (ids.has(fn.id)) fail(filename, `duplicate function id ${fn.id}`);
  if (pythonNames.has(fn.python_name)) {
    fail(filename, `duplicate Python name ${fn.python_name}`);
  }
  ids.add(fn.id);
  pythonNames.add(fn.python_name);

  exactKeys(filename, fn.signature, [
    "parameters", "return_type", "return_ownership", "borrow_from",
  ], `${fn.id}.signature`);
  if (!Array.isArray(fn.signature.parameters)) {
    fail(filename, `${fn.id}.signature.parameters must be an array`);
  }
  const parameterNames = new Set();
  const parametersByName = new Map();
  for (const parameter of fn.signature.parameters) {
    knownKeys(filename, parameter, [
      "name", "type", "ownership", "mutability", "aliasing",
    ], ["minimum"],
      `${fn.id} parameter`);
    if (!identifier(parameter.name) || parameterNames.has(parameter.name)) {
      fail(filename, `${fn.id} has an invalid or duplicate parameter name`);
    }
    if (!semanticTypes.has(parameter.type)) {
      fail(filename, `${fn.id}.${parameter.name} has unsupported type ${parameter.type}`);
    }
    if (parameter.minimum !== undefined &&
        (parameter.type !== "uint64" ||
         typeof parameter.minimum !== "string" ||
         !/^[0-9]+$/.test(parameter.minimum))) {
      fail(filename, `${fn.id}.${parameter.name} has invalid minimum`);
    }
    if (!ownership.has(parameter.ownership)) {
      fail(filename, `${fn.id}.${parameter.name} has invalid ownership`);
    }
    const resourceType = resourcesByType.get(parameter.type);
    const semanticType = catalog.semanticTypes.get(parameter.type);
    const expectedOwnership = resourceType !== undefined
      ? parameter.mutability === "write" ? "borrowed_mut" : "borrowed"
      : semanticType.kind === "buffer" && parameter.mutability === "write"
        ? "borrowed_mut" : semanticType.input_ownership;
    if (parameter.ownership !== expectedOwnership) {
      fail(filename,
        `${fn.id}.${parameter.name} ${parameter.type} inputs must use ` +
        `${expectedOwnership} ownership`);
    }
    const expectedMutability = resourceType !== undefined
      ? parameter.ownership === "borrowed_mut" ? "write" : "read"
      : semanticType.kind === "buffer" && parameter.ownership === "borrowed_mut"
        ? "write" : semanticType.input_mutability;
    if (parameter.mutability !== expectedMutability) {
      fail(filename,
        `${fn.id}.${parameter.name} ${parameter.type} requires ` +
        `${expectedMutability} mutability`);
    }
    const expectedAliasing = resourceType !== undefined
      ? "allowed" : semanticType.input_aliasing;
    if (parameter.aliasing !== expectedAliasing) {
      fail(filename,
        `${fn.id}.${parameter.name} ${parameter.type} requires ` +
        `${expectedAliasing} aliasing`);
    }
    parameterNames.add(parameter.name);
    parametersByName.set(parameter.name, parameter);
  }
  if (!semanticTypes.has(fn.signature.return_type)) {
    fail(filename, `${fn.id} has unsupported return type ${fn.signature.return_type}`);
  }
  if (!ownership.has(fn.signature.return_ownership)) {
    fail(filename, `${fn.id} has invalid return ownership`);
  }
  const returnResource = resourcesByType.get(fn.signature.return_type);
  const expectedReturnOwnership = returnResource !== undefined
    ? returnResource.ownership
    : catalog.semanticTypes.get(fn.signature.return_type).return_ownership;
  if (fn.signature.return_ownership !== expectedReturnOwnership) {
    fail(filename,
      `${fn.id} ${fn.signature.return_type} results must use ` +
      `${expectedReturnOwnership} ownership`);
  }
  nullableString(filename, fn.signature.borrow_from,
    `${fn.id}.signature.borrow_from`);
  if (returnResource?.ownership === "borrowed") {
    const ownerParameter = parametersByName.get(fn.signature.borrow_from);
    const ownerResource = ownerParameter === undefined
      ? undefined : resourcesByType.get(ownerParameter.type);
    if (ownerResource?.id !== returnResource.owner) {
      fail(filename,
        `${fn.id} borrowed ${returnResource.id} result must borrow_from a ` +
        `${returnResource.owner} parameter`);
    }
  } else if (fn.signature.borrow_from !== null) {
    fail(filename, `${fn.id} borrow_from is only valid for borrowed-view results`);
  }

  exactKeys(filename, fn.dynamic, ["export"], `${fn.id}.dynamic`);
  if (!identifier(fn.dynamic.export)) {
    fail(filename, `${fn.id}.dynamic.export must be an identifier`);
  }
  exactKeys(filename, fn.native,
    ["symbol", "return_type", "arguments"], `${fn.id}.native`);
  if (!identifier(fn.native.symbol)) {
    fail(filename, `${fn.id}.native.symbol must be a C identifier`);
  }
  if (!catalog.abiTypes.get(fn.native.return_type)?.return) {
    fail(filename, `${fn.id}.native.return_type is unsupported`);
  }
  if (!Array.isArray(fn.native.arguments)) {
    fail(filename, `${fn.id}.native.arguments must be an array`);
  }
  let resultArguments = 0;
  const nativeInputSources = new Set();
  for (const argument of fn.native.arguments) {
    exactKeys(filename, argument, ["source", "abi_type", "direction", "adapter"],
      `${fn.id} native argument`);
    if (!identifier(argument.source)) {
      fail(filename, `${fn.id} native argument source must be an identifier`);
    }
    const resourceAbi = Array.from(resourcesByType.values()).find(
      (resource) => resource.abi_type === argument.abi_type,
    );
    if (!catalog.abiTypes.has(argument.abi_type) && resourceAbi === undefined) {
      fail(filename, `${fn.id} has unsupported ABI type ${argument.abi_type}`);
    }
    if (!new Set(["in", "out"]).has(argument.direction)) {
      fail(filename, `${fn.id} has invalid native argument direction`);
    }
    if (argument.adapter === null) {
      if (argument.source === "result") resultArguments += 1;
      else if (!parameterNames.has(argument.source)) {
        fail(filename, `${fn.id} native argument has unknown source ${argument.source}`);
      }
      if ((argument.source === "result") !== (argument.direction === "out")) {
        fail(filename, `${fn.id} only result may be a direct out argument`);
      }
    } else {
      const adapter = argument.adapter;
      const adapterSpec = catalog.adapters.get(adapter.kind);
      if (adapterSpec === undefined) {
        fail(filename, `${fn.id} has unsupported adapter ${adapter.kind}`);
      }
      if (adapterSpec.kind === "record") {
        const recordAbi = catalog.abiTypes.get(argument.abi_type);
        if (recordAbi?.kind !== "record") {
          fail(filename,
            `${fn.id}.${argument.source} record adapter requires a record ABI`);
        }
        exactKeys(filename, adapter, ["kind", "fields"],
          `${fn.id}.${argument.source} adapter`);
        exactKeys(filename, adapter.fields,
          recordAbi.fields.map((field) => field.name),
          `${fn.id}.${argument.source} record fields`);
        if (argument.direction !== "in") {
          fail(filename, `${fn.id}.${argument.source} records are input-only`);
        }
        for (const field of recordAbi.fields) {
          const parameterName = adapter.fields[field.name];
          const parameter = parametersByName.get(parameterName);
          if (!identifier(parameterName) || parameter === undefined) {
            fail(filename,
              `${fn.id}.${argument.source}.${field.name} names an unknown parameter`);
          }
          const accepted = catalog.semanticTypes.get(parameter.type)?.input_abis || [];
          if (!accepted.includes(field.abi_type)) {
            fail(filename,
              `${fn.id}.${argument.source}.${field.name} ${parameter.type} cannot ` +
              `lower to ${field.abi_type}`);
          }
          if (nativeInputSources.has(parameterName)) {
            fail(filename, `${fn.id} repeats native source ${parameterName}`);
          }
          nativeInputSources.add(parameterName);
        }
        continue;
      }
      if (argument.abi_type !== adapterSpec.abi_type) {
        fail(filename, `${fn.id}.${argument.source} ${adapter.kind} requires ` +
          `${adapterSpec.abi_type}, not ${argument.abi_type}`);
      }
      const policyFields = [
        adapterSpec.access_field, adapterSpec.aliasing_field,
        adapterSpec.transactional_field,
      ];
      exactKeys(filename, adapter,
        ["kind", ...Object.keys(adapterSpec.parameter_fields), ...policyFields],
        `${fn.id}.${argument.source} adapter`);
      for (const [field, type] of Object.entries(adapterSpec.parameter_fields)) {
        if (!parameterNames.has(adapter[field])) {
          fail(filename,
            `${fn.id}.${argument.source} adapter has unknown ${field} ${adapter[field]}`);
        }
        if (parametersByName.get(adapter[field]).type !== type) {
          fail(filename, `${fn.id}.${argument.source} adapter ${field} must be ${type}`);
        }
      }
      for (const field of adapterSpec.consumes) {
        nativeInputSources.add(adapter[field]);
      }
      const access = adapter[adapterSpec.access_field];
      if (!new Set(["read", "write"]).has(access) ||
          access !== parametersByName.get(adapter.data).mutability) {
        fail(filename, `${fn.id}.${argument.source} adapter access is inconsistent`);
      }
      if (adapter[adapterSpec.aliasing_field] !==
          parametersByName.get(adapter.data).aliasing) {
        fail(filename, `${fn.id}.${argument.source} adapter aliasing is inconsistent`);
      }
      if ((access === "write") !== (argument.direction === "out")) {
        fail(filename, `${fn.id}.${argument.source} adapter direction is inconsistent`);
      }
      const transactional = adapter[adapterSpec.transactional_field];
      if (typeof transactional !== "boolean" ||
          (access === "write" && adapterSpec.transactional_writes && !transactional) ||
          (access === "read" && transactional)) {
        fail(filename, `${fn.id}.${argument.source} adapter has invalid transaction policy`);
      }
    }
    if (argument.adapter === null && argument.source !== "result") {
      if (nativeInputSources.has(argument.source)) {
        fail(filename, `${fn.id} repeats native source ${argument.source}`);
      }
      nativeInputSources.add(argument.source);
      const semantic = parametersByName.get(argument.source);
      const resource = resourcesByType.get(semantic.type);
      const accepted = resource === undefined
        ? catalog.semanticTypes.get(semantic.type).input_abis
        : [resource.abi_type];
      if (!accepted.includes(argument.abi_type)) {
        fail(filename,
          `${fn.id}.${argument.source} ${semantic.type} requires ` +
          `${accepted.join(" or ")}, not ${argument.abi_type}`);
      }
    }
  }
  for (const parameterName of parameterNames) {
    if (!nativeInputSources.has(parameterName)) {
      fail(filename, `${fn.id} omits native source ${parameterName}`);
    }
  }
  const result = fn.native.arguments.find((argument) =>
    argument.source === "result"
  );
  const usesForeignResource = returnResource !== undefined ||
    fn.signature.parameters.some((parameter) =>
      resourcesByType.has(parameter.type));
  if (usesForeignResource && fn.native.arguments.some((argument) =>
    argument.adapter !== null)) {
    fail(filename, `${fn.id} cannot yet mix resource and aggregate adapters`);
  }
  if (returnResource !== undefined) {
    if (fn.native.return_type !== "int" || resultArguments !== 1 ||
        result?.abi_type !== returnResource.abi_type) {
      fail(filename,
        `${fn.id} resource constructors require int status and one ` +
        `${returnResource.abi_type} result`);
    }
  } else if (fn.native.return_type === "void") {
    if (resultArguments !== 1 || fn.signature.return_type !== "Integer" ||
        result?.abi_type !== "fmpz_t") {
      fail(filename,
        `${fn.id} void/out ABI currently requires an Integer/fmpz_t result`);
    }
  } else {
    const returnedAbi = catalog.abiTypes.get(fn.native.return_type);
    const nullableWord = returnedAbi?.kind === "pointer" &&
      returnedAbi.pointee === "uint64_t" && fn.signature.return_type === "uint64";
    const checkedInteger = fn.result.domain === "status" &&
      fn.native.return_type === "int" && resultArguments === 1 &&
      fn.signature.return_type === "Integer" && result?.abi_type === "fmpz_t";
    if (!checkedInteger && (resultArguments !== 0 || !(nullableWord ||
      (fn.native.return_type === "int" && fn.signature.return_type === "bool") ||
      (new Set(["slong", "ulong", "uint64_t"]).has(fn.native.return_type) &&
        fn.signature.return_type === "uint64")))) {
      fail(filename,
        `${fn.id} ABI requires int/bool, word/uint64, nullable uint64 ` +
        `pointer, or checked Integer/fmpz_t output`);
    }
  }

  exactKeys(filename, fn.effects, [
    "pure", "deterministic", "thread_safe", "may_allocate", "may_raise",
    "writes",
  ], `${fn.id}.effects`);
  for (const key of ["pure", "deterministic", "thread_safe", "may_allocate"]) {
    if (typeof fn.effects[key] !== "boolean") {
      fail(filename, `${fn.id}.effects.${key} must be boolean`);
    }
  }
  strings(filename, fn.effects.may_raise, `${fn.id}.effects.may_raise`);
  strings(filename, fn.effects.writes, `${fn.id}.effects.writes`);
  for (const name of fn.effects.writes) {
    const parameter = parametersByName.get(name);
    if (parameter === undefined || parameter.ownership !== "borrowed_mut") {
      fail(filename, `${fn.id}.effects.writes contains non-mutable ${name}`);
    }
  }
  if (fn.effects.pure && fn.effects.writes.length !== 0) {
    fail(filename, `${fn.id}.effects.pure functions may not declare writes`);
  }
  if (returnResource?.ownership === "owned" &&
      (fn.effects.pure || !fn.effects.may_allocate)) {
    fail(filename, `${fn.id} resource construction must allocate and be impure`);
  }
  exactKeys(filename, fn.result, ["domain", "success", "absence"],
    `${fn.id}.result`);
  if (!new Set(["direct", "nullable", "status"]).has(fn.result.domain) ||
      !Array.isArray(fn.result.success) ||
      fn.result.success.some((value) => !Number.isSafeInteger(value)) ||
      !new Set([null, "error"]).has(fn.result.absence)) {
    fail(filename, `${fn.id} has an invalid result domain`);
  }
  exactKeys(filename, fn.errors, ["exception", "message"],
    `${fn.id}.errors`);
  nullableString(filename, fn.errors.exception, `${fn.id}.errors.exception`);
  nullableString(filename, fn.errors.message, `${fn.id}.errors.message`);
  if (fn.errors.exception !== null &&
      !errorExceptions.has(fn.errors.exception)) {
    fail(filename, `${fn.id} uses unsupported error exception ` +
      `${fn.errors.exception}`);
  }
  const returnedAbi = catalog.abiTypes.get(fn.native.return_type);
  const hasError = fn.errors.exception !== null || fn.errors.message !== null;
  if ((fn.errors.exception === null) !== (fn.errors.message === null) ||
      (fn.errors.exception !== null &&
       !fn.effects.may_raise.includes(fn.errors.exception))) {
    fail(filename, `${fn.id} errors must match effects.may_raise`);
  }
  if (fn.result.domain === "direct" &&
      (fn.result.success.length !== 0 || fn.result.absence !== null || hasError)) {
    fail(filename, `${fn.id} direct result cannot declare failures`);
  }
  if (fn.result.domain === "status" &&
      (returnedAbi?.kind !== "scalar" || fn.result.success.length === 0 ||
       fn.result.absence !== null || !hasError)) {
    fail(filename,
      `${fn.id} status result needs scalar success values and a declared error`);
  }
  if (fn.result.domain === "nullable" &&
      (returnedAbi?.kind !== "pointer" || fn.result.success.length !== 0 ||
       fn.result.absence !== "error" || !hasError)) {
    fail(filename,
      `${fn.id} nullable result needs a pointer ABI and declared absence error`);
  }
  exactKeys(filename, fn.exceptions, ["policy", "failure_status"],
    `${fn.id}.exceptions`);
  if (!new Set(["none", "cxx_to_status"]).has(fn.exceptions.policy) ||
      (fn.exceptions.failure_status !== null &&
       !Number.isSafeInteger(fn.exceptions.failure_status))) {
    fail(filename, `${fn.id} has an invalid exception shield policy`);
  }
  if (fn.exceptions.policy === "none" &&
      fn.exceptions.failure_status !== null) {
    fail(filename, `${fn.id} unshielded calls require null failure_status`);
  }
  if (fn.exceptions.policy === "cxx_to_status" &&
      (fn.result.domain !== "status" || fn.exceptions.failure_status === null ||
       fn.result.success.includes(fn.exceptions.failure_status) ||
       fn.targets?.wasm !== false)) {
    fail(filename,
      `${fn.id} C++ shields require a distinct failure status and no wasm target`);
  }
  exactKeys(filename, fn.targets, ["dynamic", "native", "wasm"],
    `${fn.id}.targets`);
  if (Object.values(fn.targets).some((value) => typeof value !== "boolean")) {
    fail(filename, `${fn.id}.targets values must be boolean`);
  }
  if (!fn.targets.dynamic || !fn.targets.native) {
    fail(filename, `${fn.id} must provide dynamic and native implementations`);
  }

  const enriched = {
    ...fn,
    declaration_id: `${library.id}:${fn.id}`,
  };
  enriched.call_plan = callPlan(library, enriched, catalog, resourcesByType);
  return Object.freeze(enriched);
}

function loadDeclarationDocument(document, options = {}) {
  const filename = options.filename || "<FFI declaration>";
  const catalog = options.catalog || loadCatalog(options.root || repositoryRoot);
  const canonicalSource = `${JSON.stringify(document, null, 2)}\n`;
  exactKeys(filename, document, [
    "schema_version", "library", "resources", "functions",
  ],
    "document");
  if (document.schema_version !== 6) fail(filename, "unsupported schema_version");
  exactKeys(filename, document.library,
    ["id", "python_module", "dynamic", "native"], "library");
  const library = document.library;
  if (!identifier(library.id)) fail(filename, "library.id must be an identifier");
  if (typeof library.python_module !== "string" ||
      !/^sagejs\.ffi\.[a-z_][a-z0-9_]*$/.test(library.python_module)) {
    fail(filename, "library.python_module must be under sagejs.ffi");
  }
  exactKeys(filename, library.dynamic, ["package"], "library.dynamic");
  if (typeof library.dynamic.package !== "string" ||
      !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(library.dynamic.package)) {
    fail(filename, "library.dynamic.package must be a package name");
  }
  exactKeys(filename, library.native,
    ["headers", "link", "dependencies", "toolchain"], "library.native");
  safeStrings(filename, library.native.headers, "library.native.headers",
    /^[A-Za-z0-9_+./-]+$/);
  safeStrings(filename, library.native.dependencies,
    "library.native.dependencies", /^[A-Za-z][A-Za-z0-9_+.-]*$/);
  exactKeys(filename, library.native.link, ["unix", "windows"],
    "library.native.link");
  safeStrings(filename, library.native.link.unix, "library.native.link.unix",
    /^[A-Za-z0-9_+.-]+$/);
  safeStrings(filename, library.native.link.windows,
    "library.native.link.windows", /^[A-Za-z0-9_+.-]+$/);
  exactKeys(filename, library.native.toolchain,
    ["prefix_environment", "unix_default", "windows_default", "include_dirs",
      "source_include_dirs"],
    "library.native.toolchain");
  if (!/^[A-Z][A-Z0-9_]*$/.test(library.native.toolchain.prefix_environment)) {
    fail(filename, "library.native.toolchain.prefix_environment is invalid");
  }
  for (const key of ["unix_default", "windows_default"]) {
    if (typeof library.native.toolchain[key] !== "string" ||
        library.native.toolchain[key].startsWith("/") ||
        library.native.toolchain[key].includes("..")) {
      fail(filename,
        `library.native.toolchain.${key} must be a repository-relative path`);
    }
  }
  safeStrings(filename, library.native.toolchain.include_dirs,
    "library.native.toolchain.include_dirs", /^[A-Za-z0-9_+./-]+$/);
  safeStrings(filename, library.native.toolchain.source_include_dirs,
    "library.native.toolchain.source_include_dirs", /^[A-Za-z0-9_+./-]+$/);
  for (const directory of library.native.toolchain.source_include_dirs) {
    if (directory.startsWith("/") || directory.split("/").includes("..")) {
      fail(filename, "library.native.toolchain.source_include_dirs must be repository-relative");
    }
  }
  if (!Array.isArray(document.functions) || document.functions.length === 0) {
    fail(filename, "functions must be a nonempty array");
  }
  if (!Array.isArray(document.resources)) {
    fail(filename, "resources must be an array");
  }
  const resourceIds = new Set();
  const resourceNames = new Set();
  const resourceAbis = new Set();
  const resources = document.resources.map((resource) =>
    validateResource(
      filename, resource, resourceIds, resourceNames, resourceAbis,
    )
  );
  const resourcesById = new Map(
    resources.map((resource) => [resource.id, resource]),
  );
  for (const resource of resources) {
    if (resource.owner !== null && !resourcesById.has(resource.owner)) {
      fail(filename, `${resource.id} has unknown owner ${resource.owner}`);
    }
    const seen = new Set([resource.id]);
    let current = resource;
    while (current.owner !== null) {
      if (seen.has(current.owner)) {
        fail(filename, `ownership graph contains a cycle through ${current.owner}`);
      }
      seen.add(current.owner);
      current = resourcesById.get(current.owner);
    }
  }
  const resourcesByType = new Map(
    resources.map((resource) => [resource.python_name, resource]),
  );
  const ids = new Set();
  const pythonNames = new Set(resourceNames);
  const digest = createHash("sha256")
    .update(canonicalSource).update("\0").update(catalog.hash).digest("hex");
  const functions = document.functions.map((fn) =>
    validateFunction(
      filename, library, fn, ids, pythonNames, resourcesByType, catalog,
    )
  );
  const enrichedResources = resources.map((resource) => {
    let root = resource;
    while (root.owner !== null) root = resourcesById.get(root.owner);
    return Object.freeze({ ...resource, root_owner: root.id });
  });
  const ownershipGraph = Object.freeze(enrichedResources.map((resource) =>
    Object.freeze({
      resource: resource.id,
      ownership: resource.ownership,
      owner: resource.owner,
      root: resource.root_owner,
    })
  ));
  return Object.freeze({
    schema,
    schemaVersion: document.schema_version,
    filename: resolve(filename),
    sourceFilename: options.sourceFilename === undefined
      ? null : resolve(options.sourceFilename),
    hash: digest,
    identity: `${library.id}@${digest}`,
    library: Object.freeze(library),
    resources: Object.freeze(enrichedResources),
    ownershipGraph,
    functions: Object.freeze(functions),
    abiCatalog: catalog,
  });
}

function loadDeclaration(filename, catalog = loadCatalog(repositoryRoot)) {
  const source = readFileSync(filename, "utf8");
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    fail(filename, `invalid JSON: ${error.message}`);
  }
  const sourceFilename = filename.replace(/\.ffi\.json$/, ".ffi.py");
  return loadDeclarationDocument(document, {
    filename,
    catalog,
    sourceFilename: existsSync(sourceFilename) ? sourceFilename : undefined,
  });
}

function declarationFiles(root = repositoryRoot) {
  const directory = join(root, "ffi");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ffi.json"))
    .sort()
    .map((name) => join(directory, name));
}

function loadRegistry(options = {}) {
  const root = resolve(options.root || repositoryRoot);
  const catalog = loadCatalog(root);
  const libraries = declarationFiles(root).map((filename) =>
    loadDeclaration(filename, catalog));
  const byId = new Map();
  const byModule = new Map();
  for (const declaration of libraries) {
    const { id, python_module: moduleName } = declaration.library;
    if (byId.has(id)) throw new Error(`duplicate FFI library id ${id}`);
    if (byModule.has(moduleName)) {
      throw new Error(`duplicate FFI Python module ${moduleName}`);
    }
    const byPythonName = new Map();
    for (const fn of declaration.functions) {
      byPythonName.set(fn.python_name, Object.freeze({
        ...fn,
        library: declaration.library,
        declaration_hash: declaration.hash,
        declaration_identity: `${declaration.identity}:${fn.id}`,
      }));
    }
    const byResourceType = new Map(
      declaration.resources.map((resource) => [resource.python_name, resource]),
    );
    const entry = Object.freeze({
      ...declaration, byPythonName, byResourceType,
    });
    byId.set(id, entry);
    byModule.set(moduleName, entry);
  }
  return Object.freeze({ schema, root, catalog, libraries, byId, byModule });
}

function generatePythonModule(declaration) {
  const library = declaration.library;
  const resourcesByType = new Map(
    declaration.resources.map((resource) => [resource.python_name, resource]),
  );
  const resourcesById = new Map(
    declaration.resources.map((resource) => [resource.id, resource]),
  );
  const resourceIdentity = (resource) =>
    `resource:${declaration.identity}:${resource.id}`;
  const pythonNullableStrings = (values) => `[${values.map((value) =>
    value === null ? "None" : JSON.stringify(value)
  ).join(", ")}]`;
  const pythonWire = (value) => value === null ? "None"
    : Array.isArray(value) ? `[${value.map(pythonWire).join(", ")}]`
      : JSON.stringify(value);
  const pythonType = (type) => type === "bool"
    ? "bool" : (type === "UInt64Buffer" || type === "IntegerBuffer") ? "list[int]"
      : resourcesByType.has(type) ? type : "int";
  const resourceClasses = declaration.resources.map((resource) => {
    const identity = resourceIdentity(resource);
    const lifetime = resource.ownership === "owned"
      ? `    @property\n` +
        `    def closed(self) -> bool:\n` +
        `        return _runtime.ffi_resource_closed(self._token)\n\n` +
        `    def close(self) -> None:\n` +
        `        _runtime.ffi_resource_close(self._token)\n\n`
      : `    @property\n` +
        `    def valid(self) -> bool:\n` +
        `        return _runtime.ffi_view_valid(self._token)\n\n`;
    const contextManager = resource.ownership === "owned"
      ? `\n    def __enter__(self) -> ${resource.python_name}:\n` +
        `        self._ffi_borrow()\n` +
        `        return self\n\n` +
        `    def __exit__(self, exception_type: Any, exception: Any, ` +
        `traceback: Any) -> bool:\n` +
        `        self.close()\n` +
        `        return False\n`
      : "";
    return `class ${resource.python_name}:\n` +
      `    \"\"\"Opaque ${resource.ownership} ${library.id}:` +
      `${resource.id} ${resource.ownership === "owned" ? "resource" : "view"}.` +
      `\"\"\"\n\n` +
      `    def __init__(self, token: Any) -> None:\n` +
      `        self._token = token\n\n` +
      lifetime +
      `    def _ffi_borrow(self) -> Any:\n` +
      `        return _runtime.ffi_resource_borrow(\n` +
      `            self._token, ${JSON.stringify(identity)}\n` +
      `        )\n` + contextManager;
  }).join("\n\n");
  const functions = declaration.functions.map((fn) => {
    const resultWire = [fn.result.domain, [...fn.result.success], fn.result.absence];
    const legacyResourcePolicy = fn.result.domain === "status"
      ? "zero_is_error" : fn.result.domain === "nullable"
        ? "null_is_error" : "none";
    const params = fn.signature.parameters.map((param) =>
      `${param.name}: ${pythonType(param.type)}`
    );
    const names = fn.signature.parameters.map((param) =>
      resourcesByType.has(param.type)
        ? `${param.name}._ffi_borrow()` : param.name
    );
    const types = fn.signature.parameters.map((param) => {
      const resource = resourcesByType.get(param.type);
      return resource === undefined ? param.type : resourceIdentity(resource);
    });
    const returnedResource = resourcesByType.get(fn.signature.return_type);
    // Python dictionaries lower to runtime mapping objects rather than plain
    // JavaScript objects.  Keep the generated dynamic-call wire format to
    // lists and scalars so the bootstrap boundary remains representation
    // independent.
    const dynamicConstraints = fn.call_plan.constraints.map((constraint) => [
      constraint.kind,
      constraint.buffer,
      [...constraint.dimensions],
      [...constraint.parameter_names],
    ]);
    const call = returnedResource === undefined
      ? `_runtime.ffi_call(\n` +
        `        __sagejs_ffi_declaration__ + ${JSON.stringify(`:${fn.id}`)},\n` +
        `        ${JSON.stringify(library.dynamic.package)},\n` +
        `        ${JSON.stringify(fn.dynamic.export)},\n` +
        `        [${names.join(", ")}],\n` +
        `        [${types.map((type) => JSON.stringify(type)).join(", ")}],\n` +
        `        ${JSON.stringify(fn.signature.return_type)},\n` +
        `        ${pythonWire(resultWire)},\n` +
        `        ${fn.errors.exception === null
          ? "None" : JSON.stringify(fn.errors.exception)},\n` +
        `        ${fn.errors.message === null
          ? "None" : JSON.stringify(fn.errors.message)},\n` +
        `        ${JSON.stringify(dynamicConstraints)},\n` +
        `    )`
      : returnedResource.ownership === "owned"
      ? `${returnedResource.python_name}(_runtime.ffi_resource_create(\n` +
        `        __sagejs_ffi_declaration__ + ${JSON.stringify(`:${fn.id}`)},\n` +
        `        ${JSON.stringify(resourceIdentity(returnedResource))},\n` +
        `        ${JSON.stringify(library.dynamic.package)},\n` +
        `        ${JSON.stringify(fn.dynamic.export)},\n` +
        `        ${JSON.stringify(returnedResource.dynamic.close_export)},\n` +
        `        [${names.join(", ")}],\n` +
        `        [${types.map((type) => JSON.stringify(type)).join(", ")}],\n` +
        `        ${pythonNullableStrings(fn.signature.parameters.map(
          (param) => param.minimum ?? null,
        ))},\n` +
        `        ${JSON.stringify(legacyResourcePolicy)},\n` +
        `        ${fn.errors.exception === null
          ? "None" : JSON.stringify(fn.errors.exception)},\n` +
        `        ${fn.errors.message === null
          ? "None" : JSON.stringify(fn.errors.message)},\n` +
        `    ))`
      : `${returnedResource.python_name}(_runtime.ffi_view_create(\n` +
        `        __sagejs_ffi_declaration__ + ${JSON.stringify(`:${fn.id}`)},\n` +
        `        ${JSON.stringify(resourceIdentity(returnedResource))},\n` +
        `        ${JSON.stringify(resourceIdentity(resourcesById.get(returnedResource.owner)))},\n` +
        `        ${fn.signature.borrow_from}._ffi_borrow(),\n` +
        `        ${JSON.stringify(library.dynamic.package)},\n` +
        `        ${JSON.stringify(fn.dynamic.export)},\n` +
        `        [${names.join(", ")}],\n` +
        `        [${types.map((type) => JSON.stringify(type)).join(", ")}],\n` +
        `        ${JSON.stringify(legacyResourcePolicy)},\n` +
        `        ${fn.errors.exception === null
          ? "None" : JSON.stringify(fn.errors.exception)},\n` +
        `        ${fn.errors.message === null
          ? "None" : JSON.stringify(fn.errors.message)},\n` +
        `    ))`;
    return `def ${fn.python_name}(${params.join(", ")}) -> ` +
      `${pythonType(fn.signature.return_type)}:\n` +
      `    \"\"\"Call declared ${library.id}:${fn.id}.\"\"\"\n` +
      `    return ${call}\n`;
  }).join("\n\n");
  const source = `\"\"\"Generated safe FFI surface for ${library.id}; do not edit by hand.\"\"\"\n\n` +
    `from __future__ import annotations\n\n` +
    `from typing import Any\n\n` +
    `import sagejs.runtime as _runtime\n` +
    `\n` +
    `__sagejs_ffi_declaration__ = ${JSON.stringify(declaration.identity)}\n\n\n` +
    `${resourceClasses}${resourceClasses ? "\n\n\n" : ""}${functions}`;
  // Generated modules are committed first-party Python. Use the same pinned
  // formatter as handwritten source so regeneration cannot introduce style
  // drift or unreadable declaration wire data.
  return require("../python-format.cjs").formatPythonSource(source);
}

function generatedModulePath(root, declaration) {
  const moduleParts = declaration.library.python_module.split(".");
  return join(root, "src", "lib", ...moduleParts) + ".py";
}

function generatedBootstrapModulePath(root, declaration) {
  const moduleParts = declaration.library.python_module.split(".");
  return join(root, "src", "baselib", ...moduleParts) + ".py";
}

function generatedModulePaths(root, declaration) {
  return [
    generatedModulePath(root, declaration),
    generatedBootstrapModulePath(root, declaration),
  ];
}

module.exports = {
  declarationFiles,
  generatePythonModule,
  generatedBootstrapModulePath,
  generatedModulePath,
  generatedModulePaths,
  loadDeclaration,
  loadDeclarationDocument,
  loadRegistry,
  repositoryRoot,
  schema,
};
