"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  readFileSync,
  readdirSync,
} = require("node:fs");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..", "..");
const schema = "sagejs.ffi/declaration-v1";
const semanticTypes = new Set(["Integer", "bool", "uint64"]);
const abiTypes = new Set(["fmpz_t", "int", "ulong"]);
const ownership = new Set(["borrowed", "owned", "value"]);
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

function validateFunction(filename, library, fn, ids, pythonNames) {
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
    exactKeys(filename, parameter, ["name", "type", "ownership"],
      `${fn.id} parameter`);
    if (!identifier(parameter.name) || parameterNames.has(parameter.name)) {
      fail(filename, `${fn.id} has an invalid or duplicate parameter name`);
    }
    if (!semanticTypes.has(parameter.type)) {
      fail(filename, `${fn.id}.${parameter.name} has unsupported type ${parameter.type}`);
    }
    if (!ownership.has(parameter.ownership)) {
      fail(filename, `${fn.id}.${parameter.name} has invalid ownership`);
    }
    const expectedOwnership = parameter.type === "Integer" ? "borrowed" : "value";
    if (parameter.ownership !== expectedOwnership) {
      fail(filename,
        `${fn.id}.${parameter.name} ${parameter.type} inputs must use ` +
        `${expectedOwnership} ownership`);
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
  const expectedReturnOwnership = fn.signature.return_type === "Integer"
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
  if (!new Set(["int", "void"]).has(fn.native.return_type)) {
    fail(filename, `${fn.id}.native.return_type is unsupported`);
  }
  if (!Array.isArray(fn.native.arguments)) {
    fail(filename, `${fn.id}.native.arguments must be an array`);
  }
  let resultArguments = 0;
  const nativeInputSources = new Set();
  for (const argument of fn.native.arguments) {
    exactKeys(filename, argument, ["source", "abi_type", "direction"],
      `${fn.id} native argument`);
    if (argument.source === "result") resultArguments += 1;
    else if (!parameterNames.has(argument.source)) {
      fail(filename, `${fn.id} native argument has unknown source ${argument.source}`);
    }
    if (!abiTypes.has(argument.abi_type)) {
      fail(filename, `${fn.id} has unsupported ABI type ${argument.abi_type}`);
    }
    if (!new Set(["in", "out"]).has(argument.direction)) {
      fail(filename, `${fn.id} has invalid native argument direction`);
    }
    if ((argument.source === "result") !== (argument.direction === "out")) {
      fail(filename, `${fn.id} only result may be an out argument`);
    }
    if (argument.source !== "result") {
      if (nativeInputSources.has(argument.source)) {
        fail(filename, `${fn.id} repeats native source ${argument.source}`);
      }
      nativeInputSources.add(argument.source);
      const semantic = parametersByName.get(argument.source);
      const expectedAbi = inputAbiBySemanticType[semantic.type];
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
  if ((fn.native.return_type === "void") !== (resultArguments === 1)) {
    fail(filename, `${fn.id} must have exactly one result out-argument for void return`);
  }
  if (fn.native.return_type === "void") {
    const result = fn.native.arguments.find((argument) =>
      argument.source === "result"
    );
    if (fn.signature.return_type !== "Integer" || result.abi_type !== "fmpz_t") {
      fail(filename, `${fn.id} void/out ABI currently requires an Integer/fmpz_t result`);
    }
  } else if (
    fn.native.return_type !== "int" ||
    fn.signature.return_type !== "bool"
  ) {
    fail(filename, `${fn.id} direct ABI currently requires an int/bool result`);
  }

  exactKeys(filename, fn.effects, [
    "pure", "deterministic", "thread_safe", "may_allocate", "may_raise",
  ], `${fn.id}.effects`);
  for (const key of ["pure", "deterministic", "thread_safe", "may_allocate"]) {
    if (typeof fn.effects[key] !== "boolean") {
      fail(filename, `${fn.id}.effects.${key} must be boolean`);
    }
  }
  strings(filename, fn.effects.may_raise, `${fn.id}.effects.may_raise`);
  exactKeys(filename, fn.errors, ["policy"], `${fn.id}.errors`);
  if (fn.errors.policy !== "none") {
    fail(filename, `${fn.id} uses unsupported error policy ${fn.errors.policy}`);
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
  exactKeys(filename, document, ["schema_version", "library", "functions"],
    "document");
  if (document.schema_version !== 1) fail(filename, "unsupported schema_version");
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
  const ids = new Set();
  const pythonNames = new Set();
  const digest = createHash("sha256").update(source).digest("hex");
  const functions = document.functions.map((fn) =>
    validateFunction(filename, library, fn, ids, pythonNames)
  );
  return Object.freeze({
    schema,
    schemaVersion: document.schema_version,
    filename: resolve(filename),
    hash: digest,
    identity: `${library.id}@${digest}`,
    library: Object.freeze(library),
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
    const entry = Object.freeze({ ...declaration, byPythonName });
    byId.set(id, entry);
    byModule.set(moduleName, entry);
  }
  return Object.freeze({ schema, root, libraries, byId, byModule });
}

function generatePythonModule(declaration) {
  const library = declaration.library;
  const functions = declaration.functions.map((fn) => {
    const pythonType = (type) => type === "bool" ? "bool" : "int";
    const params = fn.signature.parameters.map((param) =>
      `${param.name}: ${pythonType(param.type)}`
    );
    const names = fn.signature.parameters.map((param) => param.name);
    const types = fn.signature.parameters.map((param) => param.type);
    return `def ${fn.python_name}(${params.join(", ")}) -> ` +
      `${pythonType(fn.signature.return_type)}:\n` +
      `    \"\"\"Call declared ${library.id}:${fn.id}.\"\"\"\n` +
      `    return _runtime.ffi_call(\n` +
      `        __sagejs_ffi_declaration__ + ${JSON.stringify(`:${fn.id}`)},\n` +
      `        ${JSON.stringify(library.dynamic.package)},\n` +
      `        ${JSON.stringify(fn.dynamic.export)},\n` +
      `        [${names.join(", ")}],\n` +
      `        [${types.map((type) => JSON.stringify(type)).join(", ")}],\n` +
      `        ${JSON.stringify(fn.signature.return_type)},\n` +
      `    )\n`;
  }).join("\n\n");
  return `\"\"\"Generated safe FFI surface for ${library.id}; do not edit by hand.\"\"\"\n\n` +
    `import sagejs.runtime as _runtime\n\n` +
    `__sagejs_ffi_declaration__ = ${JSON.stringify(declaration.identity)}\n\n\n` +
    functions;
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
