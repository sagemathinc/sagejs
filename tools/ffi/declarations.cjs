"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  readFileSync,
  readdirSync,
} = require("node:fs");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..", "..");
const schema = "sagejs.ffi/declaration-v3";
const scalarSemanticTypes = new Set([
  "Integer", "UInt64Buffer", "bool", "uint64",
]);
const abiTypes = new Set([
  "dirichlet_group_t", "fmpz_t", "int", "nmod_mat_t", "slong", "ulong",
]);
const ownership = new Set(["borrowed", "borrowed_mut", "owned", "value"]);
const errorExceptions = new Set([
  "OverflowError", "RuntimeError", "TypeError", "ValueError",
]);
const inputAbiBySemanticType = Object.freeze({
  Integer: "fmpz_t",
  bool: "int",
  uint64: "ulong",
});

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
    "id", "python_name", "abi_type", "ownership", "dynamic", "native",
    "targets",
  ], `resource ${resource.id || "?"}`);
  if (!identifier(resource.id) || ids.has(resource.id)) {
    fail(filename, `invalid or duplicate resource id ${resource.id}`);
  }
  if (!identifier(resource.python_name) || pythonNames.has(resource.python_name)) {
    fail(filename, `invalid or duplicate resource Python name ${resource.python_name}`);
  }
  if (!abiTypes.has(resource.abi_type) || abiNames.has(resource.abi_type)) {
    fail(filename, `unsupported or duplicate resource ABI ${resource.abi_type}`);
  }
  if (resource.ownership !== "owned") {
    fail(filename, `${resource.id} resources must use owned lifetime`);
  }
  exactKeys(filename, resource.dynamic, ["close_export"],
    `${resource.id}.dynamic`);
  if (!identifier(resource.dynamic.close_export)) {
    fail(filename, `${resource.id}.dynamic.close_export must be an identifier`);
  }
  exactKeys(filename, resource.native, ["clear_symbol"],
    `${resource.id}.native`);
  if (!identifier(resource.native.clear_symbol)) {
    fail(filename, `${resource.id}.native.clear_symbol must be a C identifier`);
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

function validateFunction(
  filename, library, fn, ids, pythonNames, resourcesByType,
) {
  const semanticTypes = new Set([
    ...scalarSemanticTypes, ...resourcesByType.keys(),
  ]);
  exactKeys(filename, fn, [
    "id", "python_name", "signature", "dynamic", "native", "effects",
    "errors", "targets",
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
    "parameters", "return_type", "return_ownership",
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
    const expectedOwnership = resourceType !== undefined ||
        parameter.type === "Integer"
      ? "borrowed"
      : parameter.type === "UInt64Buffer"
        ? parameter.mutability === "write" ? "borrowed_mut" : "borrowed"
        : "value";
    if (parameter.ownership !== expectedOwnership) {
      fail(filename,
        `${fn.id}.${parameter.name} ${parameter.type} inputs must use ` +
        `${expectedOwnership} ownership`);
    }
    const expectedMutability = resourceType !== undefined
      ? "read"
      : parameter.type === "UInt64Buffer"
      ? parameter.ownership === "borrowed_mut" ? "write" : "read"
      : parameter.type === "Integer" ? "read" : "value";
    if (parameter.mutability !== expectedMutability) {
      fail(filename,
        `${fn.id}.${parameter.name} ${parameter.type} requires ` +
        `${expectedMutability} mutability`);
    }
    const expectedAliasing = resourceType !== undefined ||
      new Set(["Integer", "UInt64Buffer"]).has(parameter.type)
      ? "allowed" : "not_applicable";
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
  const expectedReturnOwnership = returnResource !== undefined ||
      fn.signature.return_type === "Integer"
    ? "owned"
    : "value";
  if (fn.signature.return_ownership !== expectedReturnOwnership) {
    fail(filename,
      `${fn.id} ${fn.signature.return_type} results must use ` +
      `${expectedReturnOwnership} ownership`);
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
  if (!new Set(["int", "slong", "ulong", "void"])
    .has(fn.native.return_type)) {
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
    if (!abiTypes.has(argument.abi_type)) {
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
      if (argument.abi_type === "nmod_mat_t") {
        fail(filename, `${fn.id} nmod_mat_t requires a packed matrix adapter`);
      }
    } else {
      if (argument.abi_type !== "nmod_mat_t") {
        fail(filename, `${fn.id} only nmod_mat_t currently accepts an adapter`);
      }
      exactKeys(filename, argument.adapter, [
        "kind", "data", "rows", "columns", "modulus", "access", "aliasing",
      ], `${fn.id}.${argument.source} adapter`);
      const adapter = argument.adapter;
      if (adapter.kind !== "packed_nmod_matrix") {
        fail(filename, `${fn.id} has unsupported adapter ${adapter.kind}`);
      }
      for (const field of ["data", "rows", "columns", "modulus"]) {
        if (!parameterNames.has(adapter[field])) {
          fail(filename,
            `${fn.id}.${argument.source} adapter has unknown ${field} ${adapter[field]}`);
        }
        nativeInputSources.add(adapter[field]);
      }
      if (parametersByName.get(adapter.data).type !== "UInt64Buffer") {
        fail(filename, `${fn.id}.${argument.source} adapter data must be UInt64Buffer`);
      }
      for (const field of ["rows", "columns", "modulus"]) {
        if (parametersByName.get(adapter[field]).type !== "uint64") {
          fail(filename, `${fn.id}.${argument.source} adapter ${field} must be uint64`);
        }
      }
      if (!new Set(["read", "write"]).has(adapter.access) ||
          adapter.access !== parametersByName.get(adapter.data).mutability) {
        fail(filename, `${fn.id}.${argument.source} adapter access is inconsistent`);
      }
      if (adapter.aliasing !== parametersByName.get(adapter.data).aliasing) {
        fail(filename, `${fn.id}.${argument.source} adapter aliasing is inconsistent`);
      }
      if ((adapter.access === "write") !== (argument.direction === "out")) {
        fail(filename, `${fn.id}.${argument.source} adapter direction is inconsistent`);
      }
    }
    if (argument.adapter === null && argument.source !== "result") {
      if (nativeInputSources.has(argument.source)) {
        fail(filename, `${fn.id} repeats native source ${argument.source}`);
      }
      nativeInputSources.add(argument.source);
      const semantic = parametersByName.get(argument.source);
      const expectedAbi = resourcesByType.get(semantic.type)?.abi_type ||
        inputAbiBySemanticType[semantic.type];
      if (argument.abi_type !== expectedAbi) {
        fail(filename,
          `${fn.id}.${argument.source} ${semantic.type} requires ${expectedAbi}, ` +
          `not ${argument.abi_type}`);
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
    if (resultArguments !== 0 || !(
      (fn.native.return_type === "int" && fn.signature.return_type === "bool") ||
      (new Set(["slong", "ulong"]).has(fn.native.return_type) &&
        fn.signature.return_type === "uint64")
    )) {
      fail(filename,
        `${fn.id} direct ABI requires int/bool or word/uint64 result`);
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
  if (returnResource !== undefined &&
      (fn.effects.pure || !fn.effects.may_allocate)) {
    fail(filename, `${fn.id} resource construction must allocate and be impure`);
  }
  exactKeys(filename, fn.errors, ["policy", "exception", "message"],
    `${fn.id}.errors`);
  nullableString(filename, fn.errors.exception, `${fn.id}.errors.exception`);
  nullableString(filename, fn.errors.message, `${fn.id}.errors.message`);
  if (fn.errors.exception !== null &&
      !errorExceptions.has(fn.errors.exception)) {
    fail(filename, `${fn.id} uses unsupported error exception ` +
      `${fn.errors.exception}`);
  }
  if (!new Set(["none", "zero_is_error"]).has(fn.errors.policy)) {
    fail(filename, `${fn.id} uses unsupported error policy ${fn.errors.policy}`);
  }
  if (fn.errors.policy === "none" &&
      (fn.errors.exception !== null || fn.errors.message !== null)) {
    fail(filename, `${fn.id} no-error policy requires null exception and message`);
  }
  if (fn.errors.policy === "zero_is_error" &&
      (fn.native.return_type !== "int" ||
       (fn.signature.return_type !== "bool" && returnResource === undefined) ||
       fn.errors.exception === null || fn.errors.message === null ||
       !fn.effects.may_raise.includes(fn.errors.exception))) {
    fail(filename,
      `${fn.id} zero_is_error needs int status and a declared exception`);
  }
  exactKeys(filename, fn.targets, ["dynamic", "native", "wasm"],
    `${fn.id}.targets`);
  if (Object.values(fn.targets).some((value) => typeof value !== "boolean")) {
    fail(filename, `${fn.id}.targets values must be boolean`);
  }
  if (!fn.targets.dynamic || !fn.targets.native) {
    fail(filename, `${fn.id} must provide dynamic and native implementations`);
  }

  return Object.freeze({
    ...fn,
    declaration_id: `${library.id}:${fn.id}`,
  });
}

function loadDeclaration(filename) {
  const source = readFileSync(filename, "utf8");
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    fail(filename, `invalid JSON: ${error.message}`);
  }
  exactKeys(filename, document, [
    "schema_version", "library", "resources", "functions",
  ],
    "document");
  if (document.schema_version !== 3) fail(filename, "unsupported schema_version");
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
    ["headers", "link", "dependencies"], "library.native");
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
  const resourcesByType = new Map(
    resources.map((resource) => [resource.python_name, resource]),
  );
  const ids = new Set();
  const pythonNames = new Set(resourceNames);
  const digest = createHash("sha256").update(source).digest("hex");
  const functions = document.functions.map((fn) =>
    validateFunction(
      filename, library, fn, ids, pythonNames, resourcesByType,
    )
  );
  return Object.freeze({
    schema,
    schemaVersion: document.schema_version,
    filename: resolve(filename),
    hash: digest,
    identity: `${library.id}@${digest}`,
    library: Object.freeze(library),
    resources: Object.freeze(resources),
    functions: Object.freeze(functions),
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
  const libraries = declarationFiles(root).map(loadDeclaration);
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
  return Object.freeze({ schema, root, libraries, byId, byModule });
}

function generatePythonModule(declaration) {
  const library = declaration.library;
  const resourcesByType = new Map(
    declaration.resources.map((resource) => [resource.python_name, resource]),
  );
  const resourceIdentity = (resource) =>
    `resource:${declaration.identity}:${resource.id}`;
  const pythonType = (type) => type === "bool"
    ? "bool" : type === "UInt64Buffer" ? "UInt64Buffer"
      : resourcesByType.has(type) ? type : "int";
  const resourceClasses = declaration.resources.map((resource) => {
    const identity = resourceIdentity(resource);
    return `class ${resource.python_name}:\n` +
      `    \"\"\"Opaque owned ${library.id}:${resource.id} resource.\"\"\"\n\n` +
      `    def __init__(self, token):\n` +
      `        self._token = token\n\n` +
      `    @property\n` +
      `    def closed(self) -> bool:\n` +
      `        return _runtime.ffi_resource_closed(self._token)\n\n` +
      `    def close(self) -> None:\n` +
      `        _runtime.ffi_resource_close(self._token)\n\n` +
      `    def _ffi_borrow(self):\n` +
      `        return _runtime.ffi_resource_borrow(\n` +
      `            self._token, ${JSON.stringify(identity)}\n` +
      `        )\n\n` +
      `    def __enter__(self):\n` +
      `        self._ffi_borrow()\n` +
      `        return self\n\n` +
      `    def __exit__(self, exception_type, exception, traceback) -> bool:\n` +
      `        self.close()\n` +
      `        return False\n`;
  }).join("\n\n");
  const functions = declaration.functions.map((fn) => {
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
    const call = returnedResource === undefined
      ? `_runtime.ffi_call(\n` +
        `        __sagejs_ffi_declaration__ + ${JSON.stringify(`:${fn.id}`)},\n` +
        `        ${JSON.stringify(library.dynamic.package)},\n` +
        `        ${JSON.stringify(fn.dynamic.export)},\n` +
        `        [${names.join(", ")}],\n` +
        `        [${types.map((type) => JSON.stringify(type)).join(", ")}],\n` +
        `        ${JSON.stringify(fn.signature.return_type)},\n` +
        `        ${JSON.stringify(fn.errors.policy)},\n` +
        `        ${fn.errors.exception === null
          ? "None" : JSON.stringify(fn.errors.exception)},\n` +
        `        ${fn.errors.message === null
          ? "None" : JSON.stringify(fn.errors.message)},\n` +
        `    )`
      : `${returnedResource.python_name}(_runtime.ffi_resource_create(\n` +
        `        __sagejs_ffi_declaration__ + ${JSON.stringify(`:${fn.id}`)},\n` +
        `        ${JSON.stringify(resourceIdentity(returnedResource))},\n` +
        `        ${JSON.stringify(library.dynamic.package)},\n` +
        `        ${JSON.stringify(fn.dynamic.export)},\n` +
        `        ${JSON.stringify(returnedResource.dynamic.close_export)},\n` +
        `        [${names.join(", ")}],\n` +
        `        [${types.map((type) => JSON.stringify(type)).join(", ")}],\n` +
        `        ${JSON.stringify(fn.signature.parameters.map(
          (param) => param.minimum ?? null,
        ))},\n` +
        `        ${JSON.stringify(fn.errors.policy)},\n` +
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
  const usesUInt64Buffer = declaration.functions.some((fn) =>
    fn.signature.parameters.some((param) => param.type === "UInt64Buffer")
  );
  return `\"\"\"Generated safe FFI surface for ${library.id}; do not edit by hand.\"\"\"\n\n` +
    `from __future__ import annotations\n\n` +
    `import sagejs.runtime as _runtime\n` +
    `${usesUInt64Buffer ? "from sagejs.native import UInt64Buffer\n" : ""}\n` +
    `__sagejs_ffi_declaration__ = ${JSON.stringify(declaration.identity)}\n\n\n` +
    `${resourceClasses}${resourceClasses ? "\n\n\n" : ""}${functions}`;
}

function generatedModulePath(root, declaration) {
  const moduleParts = declaration.library.python_module.split(".");
  return join(root, "src", "lib", ...moduleParts) + ".py";
}

module.exports = {
  declarationFiles,
  generatePythonModule,
  generatedModulePath,
  loadDeclaration,
  loadRegistry,
  repositoryRoot,
  schema,
};
