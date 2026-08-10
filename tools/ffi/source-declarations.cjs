"use strict";

// The declaration source language is deliberately parsed, never executed.
// It is ordinary CPython syntax whose small accepted grammar lowers into the
// normalized JSON call plan consumed by the synchronous native compiler.

const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { basename, join, resolve } = require("node:path");
const createCompiler = require("../..");
const { loadCatalog } = require("./abi-catalog.cjs");
const { loadDeclarationDocument } = require("./declarations.cjs");

const repositoryRoot = resolve(__dirname, "..", "..");
const sourceSchema = "sagejs.ffi/source-declaration-v1";
const importModule = "sagejs.ffi.declare";
const allowedImports = new Set([
  "CxxToStatus", "Direct", "Effects", "Library", "Min", "Nullable",
  "Status", "Writable", "in_", "out", "packed_fmpz_matrix",
  "packed_nmod_matrix",
  "packed_slice", "record",
]);

function nodeType(node) {
  return node?.constructor?.name;
}

function location(node) {
  const token = node?.start;
  return token === undefined ? null : Object.freeze({
    line: token.line,
    column: token.col + 1,
  });
}

function sourceFail(filename, node, message) {
  const at = location(node);
  const suffix = at === null ? "" : `:${at.line}:${at.column}`;
  throw new Error(`FFI source ${filename}${suffix}: ${message}`);
}

function expect(filename, node, condition, message) {
  if (!condition) sourceFail(filename, node, message);
}

function array(value) {
  return Array.from(value || []);
}

function expressionName(node) {
  if (nodeType(node) === "AST_SymbolRef") return node.name;
  if (nodeType(node) !== "AST_Dot") return undefined;
  const parent = expressionName(node.expression);
  return parent === undefined ? undefined : `${parent}.${node.property}`;
}

function integerLiteral(filename, node) {
  if (
    nodeType(node) === "AST_Call" &&
    expressionName(node.expression) === "Integer" &&
    array(node.args).length === 1 &&
    nodeType(array(node.args)[0]) === "AST_String" &&
    /^-?[0-9]+$/.test(array(node.args)[0].value)
  ) {
    const value = Number(array(node.args)[0].value);
    expect(filename, node, Number.isSafeInteger(value), "integer literal is too large");
    return value;
  }
  if (nodeType(node) === "AST_Number" && Number.isSafeInteger(node.value)) {
    return node.value;
  }
  sourceFail(filename, node, "expected an integer literal");
}

function literal(filename, node, options = {}) {
  switch (nodeType(node)) {
    case "AST_String": return node.value;
    case "AST_True": return true;
    case "AST_False": return false;
    case "AST_Null": return null;
    case "AST_Number": return integerLiteral(filename, node);
    case "AST_Call": {
      if (expressionName(node.expression) === "Integer") {
        return integerLiteral(filename, node);
      }
      break;
    }
    case "AST_Array":
      return array(node.elements).map((item) => literal(filename, item, options));
    case "AST_Object": {
      const result = {};
      for (const property of array(node.properties)) {
        expect(filename, property, nodeType(property) === "AST_ObjectKeyVal",
          "dictionary entries must be key/value pairs");
        const key = literal(filename, property.key, options);
        expect(filename, property.key, typeof key === "string",
          "dictionary keys must be strings");
        expect(filename, property, !(key in result), `duplicate dictionary key ${key}`);
        result[key] = literal(filename, property.value, options);
      }
      return result;
    }
    case "AST_SymbolRef":
      if (options.names) return node.name;
      break;
  }
  sourceFail(filename, node, "expected a static declaration literal");
}

function callParts(filename, node, expectedName, options = {}) {
  expect(filename, node, nodeType(node) === "AST_Call",
    `expected ${expectedName}(...)`);
  const actualName = expressionName(node.expression);
  expect(filename, node, actualName === expectedName,
    `expected ${expectedName}(...), not ${actualName || nodeType(node.expression)}`);
  const positional = array(node.args);
  const keywords = new Map();
  for (const pair of array(node.args.kwargs)) {
    const [keyNode, valueNode] = pair;
    const key = keyNode?.name;
    expect(filename, keyNode, typeof key === "string", "keyword must be an identifier");
    expect(filename, keyNode, !keywords.has(key), `duplicate keyword ${key}`);
    keywords.set(key, valueNode);
  }
  expect(filename, node, !node.args.starargs && array(node.args.kwarg_items).length === 0,
    "star arguments are not allowed in FFI declarations");
  if (options.positional !== undefined) {
    const [minimum, maximum = minimum] = options.positional;
    expect(filename, node,
      positional.length >= minimum && positional.length <= maximum,
      `${expectedName} expects ${minimum === maximum ? minimum : `${minimum}-${maximum}`} positional argument(s)`);
  }
  const allowed = new Set(options.keywords || []);
  for (const key of keywords.keys()) {
    expect(filename, node, allowed.has(key), `${expectedName} has unknown keyword ${key}`);
  }
  for (const key of options.required || []) {
    expect(filename, node, keywords.has(key), `${expectedName} is missing keyword ${key}`);
  }
  return { node, positional, keywords };
}

function keywordLiteral(filename, call, name, options = {}) {
  const node = call.keywords.get(name);
  return node === undefined ? options.default : literal(filename, node, options);
}

function requiredString(filename, call, name) {
  const value = keywordLiteral(filename, call, name);
  expect(filename, call.node, typeof value === "string" && value.length > 0,
    `${expressionName(call.node.expression)}.${name} must be a nonempty string`);
  return value;
}

function requiredBoolean(filename, call, name, defaultValue) {
  const value = keywordLiteral(filename, call, name, { default: defaultValue });
  expect(filename, call.node, typeof value === "boolean",
    `${expressionName(call.node.expression)}.${name} must be bool`);
  return value;
}

function strings(filename, call, name, defaultValue = undefined) {
  const value = keywordLiteral(filename, call, name, { default: defaultValue });
  expect(filename, call.node,
    Array.isArray(value) && value.every((item) => typeof item === "string"),
    `${expressionName(call.node.expression)}.${name} must be a list of strings`);
  return value;
}

function parseLibrary(filename, callNode) {
  const call = callParts(filename, callNode, "Library", {
    positional: [0],
    required: [
      "id", "python_module", "package", "headers", "link_unix",
      "link_windows", "dependencies", "prefix_environment", "unix_default",
      "windows_default",
    ],
    keywords: [
      "id", "python_module", "package", "headers", "link_unix",
      "link_windows", "dependencies", "prefix_environment", "unix_default",
      "windows_default", "include_dirs", "source_include_dirs",
    ],
  });
  return {
    id: requiredString(filename, call, "id"),
    python_module: requiredString(filename, call, "python_module"),
    dynamic: { package: requiredString(filename, call, "package") },
    native: {
      headers: strings(filename, call, "headers"),
      link: {
        unix: strings(filename, call, "link_unix"),
        windows: strings(filename, call, "link_windows"),
      },
      dependencies: strings(filename, call, "dependencies"),
      toolchain: {
        prefix_environment: requiredString(filename, call, "prefix_environment"),
        unix_default: requiredString(filename, call, "unix_default"),
        windows_default: requiredString(filename, call, "windows_default"),
        include_dirs: strings(filename, call, "include_dirs", []),
        source_include_dirs: strings(filename, call, "source_include_dirs", []),
      },
    },
  };
}

function parseResource(filename, callNode, libraryVariable, pythonName) {
  const call = callParts(filename, callNode, `${libraryVariable}.resource`, {
    positional: [0],
    required: ["id", "abi", "ownership", "wasm"],
    keywords: ["id", "abi", "ownership", "owner", "close", "clear", "wasm"],
  });
  const ownership = requiredString(filename, call, "ownership");
  const owner = keywordLiteral(filename, call, "owner", { default: null });
  const close = keywordLiteral(filename, call, "close", { default: null });
  const clear = keywordLiteral(filename, call, "clear", { default: null });
  const abi = keywordLiteral(filename, call, "abi", { names: true });
  expect(filename, call.node, typeof abi === "string", "resource abi must be a name");
  for (const [label, value] of [["owner", owner], ["close", close], ["clear", clear]]) {
    expect(filename, call.node, value === null || typeof value === "string",
      `resource ${label} must be None or a string`);
  }
  return {
    id: requiredString(filename, call, "id"),
    python_name: pythonName,
    abi_type: abi,
    ownership,
    owner,
    dynamic: { close_export: close },
    native: { clear_symbol: clear },
    targets: {
      dynamic: true,
      native: true,
      wasm: requiredBoolean(filename, call, "wasm"),
    },
  };
}

function sequenceItems(node) {
  if (nodeType(node) !== "AST_Seq") return [node];
  return [...sequenceItems(node.car), ...sequenceItems(node.cdr)];
}

function annotation(filename, node) {
  if (nodeType(node) === "AST_SymbolRef") {
    return { type: node.name, writable: false, minimum: undefined };
  }
  expect(filename, node, nodeType(node) === "AST_ItemAccess" &&
    nodeType(node.expression) === "AST_SymbolRef",
  "annotations must be Type, Writable[Type], or Min[Type, integer]");
  const wrapper = node.expression.name;
  const items = sequenceItems(node.property);
  if (wrapper === "Writable") {
    expect(filename, node, items.length === 1 && nodeType(items[0]) === "AST_SymbolRef",
      "Writable expects one semantic type");
    return { type: items[0].name, writable: true, minimum: undefined };
  }
  if (wrapper === "Min") {
    expect(filename, node, items.length === 2 && nodeType(items[0]) === "AST_SymbolRef",
      "Min expects a semantic type and integer lower bound");
    const minimum = integerLiteral(filename, items[1]);
    expect(filename, items[1], minimum >= 0, "Min lower bound must be nonnegative");
    return { type: items[0].name, writable: false, minimum: String(minimum) };
  }
  sourceFail(filename, node, `unsupported annotation wrapper ${wrapper}`);
}

function parseEffects(filename, node) {
  const call = callParts(filename, node, "Effects", {
    positional: [0],
    required: ["pure"],
    keywords: [
      "pure", "deterministic", "thread_safe", "allocates", "raises", "writes",
    ],
  });
  const raises = keywordLiteral(filename, call, "raises", { default: [], names: true });
  expect(filename, call.node, Array.isArray(raises) &&
    raises.every((item) => typeof item === "string"),
  "Effects.raises must be a list of exception names");
  return {
    pure: requiredBoolean(filename, call, "pure"),
    deterministic: requiredBoolean(filename, call, "deterministic", true),
    thread_safe: requiredBoolean(filename, call, "thread_safe", true),
    may_allocate: requiredBoolean(filename, call, "allocates", false),
    may_raise: raises,
    writes: strings(filename, call, "writes", []),
  };
}

function parseResult(filename, node) {
  const name = expressionName(node?.expression);
  if (name === "Direct") {
    callParts(filename, node, "Direct", { positional: [0], keywords: [] });
    return {
      result: { domain: "direct", success: [], absence: null },
      errors: { exception: null, message: null },
    };
  }
  if (name === "Status") {
    const call = callParts(filename, node, "Status", {
      positional: [1, Number.MAX_SAFE_INTEGER],
      required: ["exception", "message"],
      keywords: ["exception", "message"],
    });
    const exception = keywordLiteral(filename, call, "exception", { names: true });
    expect(filename, call.node, typeof exception === "string",
      "Status.exception must be an exception name");
    return {
      result: {
        domain: "status",
        success: call.positional.map((item) => integerLiteral(filename, item)),
        absence: null,
      },
      errors: { exception, message: requiredString(filename, call, "message") },
    };
  }
  if (name === "Nullable") {
    const call = callParts(filename, node, "Nullable", {
      positional: [0],
      required: ["exception", "message"],
      keywords: ["exception", "message"],
    });
    const exception = keywordLiteral(filename, call, "exception", { names: true });
    expect(filename, call.node, typeof exception === "string",
      "Nullable.exception must be an exception name");
    return {
      result: { domain: "nullable", success: [], absence: "error" },
      errors: { exception, message: requiredString(filename, call, "message") },
    };
  }
  sourceFail(filename, node, "result must be Direct(), Status(...), or Nullable(...)");
}

function parseAdapter(filename, node) {
  expect(filename, node, nodeType(node) === "AST_Call", "adapter must be a call");
  const name = expressionName(node.expression);
  if (name === "record") {
    const call = callParts(filename, node, "record", {
      positional: [0],
      keywords: array(node.args.kwargs).map(([key]) => key.name),
    });
    const fields = {};
    for (const [key, valueNode] of call.keywords) {
      const value = literal(filename, valueNode);
      expect(filename, valueNode, typeof value === "string",
        `record field ${key} must name a semantic parameter`);
      fields[key] = value;
    }
    return { kind: "record", fields };
  }
  const specs = {
    packed_fmpz_matrix: [
      "data", "rows", "columns", "access", "aliasing", "transactional",
    ],
    packed_nmod_matrix: [
      "data", "rows", "columns", "modulus", "access", "aliasing", "transactional",
    ],
    packed_slice: ["data", "length", "access", "aliasing", "transactional"],
  };
  const keys = specs[name];
  expect(filename, node, keys !== undefined, `unsupported adapter ${name}`);
  const call = callParts(filename, node, name, {
    positional: [0], required: keys, keywords: keys,
  });
  const result = { kind: name };
  for (const key of keys) result[key] = literal(filename, call.keywords.get(key));
  return result;
}

function parseAbiArgument(filename, node) {
  expect(filename, node, nodeType(node) === "AST_Call", "ABI argument must be in_(...) or out(...)");
  const name = expressionName(node.expression);
  expect(filename, node, name === "in_" || name === "out",
    "ABI argument must be in_(...) or out(...)");
  const call = callParts(filename, node, name, { positional: [2, 3], keywords: [] });
  const source = literal(filename, call.positional[0]);
  const abiType = literal(filename, call.positional[1], { names: true });
  expect(filename, call.positional[0], typeof source === "string",
    `${name} source must be a string`);
  expect(filename, call.positional[1], typeof abiType === "string",
    `${name} ABI type must be a name`);
  return {
    source,
    abi_type: abiType,
    direction: name === "in_" ? "in" : "out",
    adapter: call.positional.length === 3
      ? parseAdapter(filename, call.positional[2]) : null,
  };
}

function parseExceptionPolicy(filename, node) {
  if (node === undefined) return { policy: "none", failure_status: null };
  const call = callParts(filename, node, "CxxToStatus", {
    positional: [1], keywords: [],
  });
  return {
    policy: "cxx_to_status",
    failure_status: integerLiteral(filename, call.positional[0]),
  };
}

function semanticParameter(filename, argument, resourcesByType, catalog) {
  expect(filename, argument, argument.annotation !== undefined && argument.annotation !== null,
    `parameter ${argument.name} requires a semantic type annotation`);
  const declared = annotation(filename, argument.annotation);
  const resource = resourcesByType.get(declared.type);
  const semantic = catalog.semanticTypes.get(declared.type);
  expect(filename, argument, resource !== undefined || semantic !== undefined,
    `unknown semantic type ${declared.type}`);
  expect(filename, argument, !(declared.writable && resource !== undefined),
    "foreign resources cannot use Writable");
  expect(filename, argument,
    !(declared.writable && semantic?.kind !== "buffer"),
    "Writable is only valid for a buffer type");
  const parameter = resource !== undefined ? {
    name: argument.name,
    type: declared.type,
    ownership: "borrowed",
    mutability: "read",
    aliasing: "allowed",
  } : {
    name: argument.name,
    type: declared.type,
    ownership: declared.writable ? "borrowed_mut" : semantic.input_ownership,
    mutability: declared.writable ? "write" : semantic.input_mutability,
    aliasing: semantic.input_aliasing,
  };
  if (declared.minimum !== undefined) parameter.minimum = declared.minimum;
  return parameter;
}

function parseFunction(
  filename, fn, libraryVariable, resourcesByType, catalog,
) {
  expect(filename, fn, fn.decorators.length === 1,
    `function ${fn.name.name} requires exactly one @${libraryVariable}.function decorator`);
  const decorator = fn.decorators[0].expression;
  const call = callParts(filename, decorator, `${libraryVariable}.function`, {
    positional: [0],
    required: ["dynamic", "symbol", "returns", "abi", "effects", "result", "wasm"],
    keywords: [
      "id", "dynamic", "symbol", "returns", "abi", "effects", "result",
      "exceptions", "borrow_from", "wasm",
    ],
  });
  expect(filename, fn, fn.return_annotation !== undefined && fn.return_annotation !== null,
    `function ${fn.name.name} requires a return annotation`);
  const returned = annotation(filename, fn.return_annotation);
  expect(filename, fn.return_annotation, !returned.writable && returned.minimum === undefined,
    "return annotations must be a simple semantic type");
  const returnResource = resourcesByType.get(returned.type);
  const returnSemantic = catalog.semanticTypes.get(returned.type);
  expect(filename, fn.return_annotation,
    returnResource !== undefined || returnSemantic !== undefined,
    `unknown return semantic type ${returned.type}`);
  const returnOwnership = returnResource?.ownership ?? returnSemantic.return_ownership;
  // Static literals deliberately reject calls. Parse the original array here.
  const abiNode = call.keywords.get("abi");
  expect(filename, abiNode, nodeType(abiNode) === "AST_Array",
    "function abi must be a list of in_/out calls");
  const returns = keywordLiteral(filename, call, "returns", { names: true });
  expect(filename, call.node, typeof returns === "string",
    "function returns must be an ABI type name");
  const effectsNode = call.keywords.get("effects");
  const resultNode = call.keywords.get("result");
  const result = parseResult(filename, resultNode);
  const id = keywordLiteral(filename, call, "id", { default: fn.name.name });
  expect(filename, call.node, typeof id === "string", "function id must be a string");
  const borrowFrom = keywordLiteral(filename, call, "borrow_from", { default: null });
  expect(filename, call.node, borrowFrom === null || typeof borrowFrom === "string",
    "borrow_from must be None or a parameter name");
  const body = array(fn.body).filter((statement) =>
    !(nodeType(statement) === "AST_SimpleStatement" &&
      nodeType(statement.body) === "AST_String"));
  expect(filename, fn, body.length === 1 &&
    nodeType(body[0]) === "AST_SimpleStatement" &&
    nodeType(body[0].body) === "AST_SymbolRef" && body[0].body.name === "Ellipsis",
  "FFI declaration functions must have an ellipsis body");
  return {
    id,
    python_name: fn.name.name,
    signature: {
      parameters: array(fn.argnames).map((argument) =>
        semanticParameter(filename, argument, resourcesByType, catalog)),
      return_type: returned.type,
      return_ownership: returnOwnership,
      borrow_from: borrowFrom,
    },
    dynamic: { export: requiredString(filename, call, "dynamic") },
    native: {
      symbol: requiredString(filename, call, "symbol"),
      return_type: returns,
      arguments: array(abiNode.elements).map((argument) =>
        parseAbiArgument(filename, argument)),
    },
    effects: parseEffects(filename, effectsNode),
    result: result.result,
    errors: result.errors,
    exceptions: parseExceptionPolicy(filename, call.keywords.get("exceptions")),
    targets: {
      dynamic: true,
      native: true,
      wasm: requiredBoolean(filename, call, "wasm"),
    },
  };
}

function assignment(filename, statement) {
  expect(filename, statement,
    nodeType(statement) === "AST_SimpleStatement" &&
    nodeType(statement.body) === "AST_Assign" &&
    statement.body.operator === "=" &&
    nodeType(statement.body.left) === "AST_SymbolRef",
  "expected a simple declaration assignment");
  return statement.body;
}

function validateImports(filename, topLevel) {
  const imports = topLevel.filter((statement) => nodeType(statement) === "AST_Imports");
  expect(filename, imports[0], imports.length === 1,
    `declaration must contain exactly one import from ${importModule}`);
  const entries = array(imports[0].imports);
  expect(filename, imports[0], entries.length === 1 && entries[0].key === importModule,
    `declaration may import only from ${importModule}`);
  for (const imported of array(entries[0].argnames)) {
    expect(filename, imported, imported.alias === undefined || imported.alias === null,
      "declaration imports may not be aliased");
    expect(filename, imported, allowedImports.has(imported.name),
      `unsupported declaration helper ${imported.name}`);
  }
}

async function parseDeclarationSource(filename, options = {}) {
  const resolved = resolve(filename);
  const source = readFileSync(resolved, "utf8");
  const compiler = createCompiler();
  const { createPythonCompilerFrontend } = require(
    "../../dist/tools/python/compiler-frontend.js"
  );
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  let toplevel;
  try {
    toplevel = frontend.parse(source, { filename: resolved, jsage: true });
  } catch (error) {
    throw new Error(`FFI source ${resolved}: ${error.message}`);
  } finally {
    frontend.close();
  }
  const topLevel = array(toplevel.body);
  validateImports(resolved, topLevel);
  const declarations = topLevel.filter((statement) =>
    nodeType(statement) !== "AST_Imports" &&
    !(nodeType(statement) === "AST_SimpleStatement" &&
      (nodeType(statement.body) === "AST_EmptyStatement" ||
       nodeType(statement.body) === "AST_String")));
  const first = assignment(resolved, declarations[0]);
  expect(resolved, first.right,
    nodeType(first.right) === "AST_Call" && expressionName(first.right.expression) === "Library",
    "first declaration must assign Library(...) to a name");
  const libraryVariable = first.left.name;
  const library = parseLibrary(resolved, first.right);
  const catalog = options.catalog || loadCatalog(options.root || repositoryRoot);
  const resources = [];
  const resourceLocations = {};
  let index = 1;
  while (index < declarations.length && nodeType(declarations[index]) !== "AST_Function") {
    const declared = assignment(resolved, declarations[index]);
    const resource = parseResource(
      resolved, declared.right, libraryVariable, declared.left.name,
    );
    resources.push(resource);
    resourceLocations[resource.id] = location(declarations[index]);
    index += 1;
  }
  const resourcesByType = new Map(resources.map((resource) =>
    [resource.python_name, resource]));
  const functions = [];
  const functionLocations = {};
  for (; index < declarations.length; index += 1) {
    const fn = declarations[index];
    expect(resolved, fn, nodeType(fn) === "AST_Function",
      "only resource assignments and decorated function declarations are allowed");
    const declared = parseFunction(
      resolved, fn, libraryVariable, resourcesByType, catalog,
    );
    functions.push(declared);
    functionLocations[declared.id] = location(fn);
  }
  const document = {
    schema_version: 6,
    library,
    resources,
    functions,
  };
  const text = `${JSON.stringify(document, null, 2)}\n`;
  const normalizedFilename = resolved.replace(/\.ffi\.py$/, ".ffi.json");
  let declaration;
  try {
    declaration = loadDeclarationDocument(document, {
      filename: normalizedFilename,
      sourceFilename: resolved,
      catalog,
    });
  } catch (error) {
    throw new Error(`${error.message}\n  lowered from ${resolved}`);
  }
  return Object.freeze({
    schema: sourceSchema,
    filename: resolved,
    normalizedFilename,
    source,
    text,
    document: Object.freeze(document),
    declaration,
    locations: Object.freeze({
      library: location(declarations[0]),
      resources: Object.freeze(resourceLocations),
      functions: Object.freeze(functionLocations),
    }),
  });
}

function sourceDeclarationFiles(root = repositoryRoot) {
  const directory = join(root, "ffi");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ffi.py"))
    .sort()
    .map((name) => join(directory, name));
}

async function loadSourceRegistry(options = {}) {
  const root = resolve(options.root || repositoryRoot);
  const catalog = loadCatalog(root);
  const sources = [];
  for (const filename of sourceDeclarationFiles(root)) {
    sources.push(await parseDeclarationSource(filename, { root, catalog }));
  }
  const byId = new Map();
  const byFilename = new Map();
  const sourceByLoweredFilename = new Set(
    sources.map((source) => source.normalizedFilename),
  );
  const ffiDirectory = join(root, "ffi");
  for (const name of existsSync(ffiDirectory) ? readdirSync(ffiDirectory) : []) {
    if (!name.endsWith(".ffi.json")) continue;
    const filename = join(ffiDirectory, name);
    if (!sourceByLoweredFilename.has(filename)) {
      throw new Error(
        `lowered FFI declaration ${filename} has no CPython source declaration`,
      );
    }
  }
  for (const source of sources) {
    const id = source.document.library.id;
    if (byId.has(id)) sourceFail(source.filename, null, `duplicate FFI library id ${id}`);
    byId.set(id, source);
    for (const key of [
      source.filename,
      source.normalizedFilename,
      basename(source.filename),
      basename(source.normalizedFilename),
    ]) byFilename.set(key, source);
  }
  return Object.freeze({
    schema: sourceSchema,
    root,
    catalog,
    sources: Object.freeze(sources),
    byId,
    byFilename,
  });
}

function selectSource(registry, selector) {
  if (selector === undefined) return registry.sources;
  const direct = registry.byId.get(selector) || registry.byFilename.get(selector) ||
    registry.byFilename.get(resolve(registry.root, selector));
  if (direct === undefined) {
    throw new Error(`unknown FFI declaration ${selector}`);
  }
  return [direct];
}

module.exports = {
  loadSourceRegistry,
  parseDeclarationSource,
  selectSource,
  sourceDeclarationFiles,
  sourceSchema,
};
