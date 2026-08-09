"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..", "..");
const schema = "sagejs.ffi/abi-catalog-v1";

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value) {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function fail(filename, message) {
  throw new Error(`FFI ABI catalog ${filename}: ${message}`);
}

function keys(filename, value, expected, label) {
  if (!object(value)) fail(filename, `${label} must be an object`);
  const wanted = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!wanted.has(key)) fail(filename, `${label} has unknown field ${key}`);
  }
  for (const key of expected) {
    if (!(key in value)) fail(filename, `${label} is missing ${key}`);
  }
}

function strings(filename, value, label) {
  if (!Array.isArray(value) || value.some((item) => !identifier(item))) {
    fail(filename, `${label} must be an array of identifiers`);
  }
}

function catalogPath(root = repositoryRoot) {
  const local = join(resolve(root), "ffi", "abi-types.json");
  return existsSync(local) ? local : join(repositoryRoot, "ffi", "abi-types.json");
}

function loadCatalog(root = repositoryRoot) {
  const filename = catalogPath(root);
  const source = readFileSync(filename, "utf8");
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    fail(filename, `invalid JSON: ${error.message}`);
  }
  keys(filename, document,
    ["schema_version", "semantic_types", "abi_types", "adapters"], "document");
  if (document.schema_version !== 1) fail(filename, "unsupported schema_version");
  if (!object(document.semantic_types) || !object(document.abi_types) ||
      !object(document.adapters)) fail(filename, "catalog maps must be objects");

  const semanticTypes = new Map();
  for (const [name, item] of Object.entries(document.semantic_types)) {
    if (!identifier(name)) fail(filename, `invalid semantic type ${name}`);
    keys(filename, item, [
      "kind", "python_type", "input_abis", "input_ownership",
      "input_mutability", "input_aliasing", "return_ownership",
      ...(item.kind === "buffer" ? ["element_abi"] : []),
    ], `semantic type ${name}`);
    strings(filename, item.input_abis, `${name}.input_abis`);
    if (!new Set(["buffer", "exact_integer", "scalar"]).has(item.kind) ||
        !new Set(["int", "bool", "UInt64Buffer"]).has(item.python_type)) {
      fail(filename, `${name} has unsupported semantic representation`);
    }
    semanticTypes.set(name, Object.freeze({ id: name, ...item }));
  }

  const abiTypes = new Map();
  for (const [name, item] of Object.entries(document.abi_types)) {
    if (!identifier(name)) fail(filename, `invalid ABI type ${name}`);
    keys(filename, item, ["kind", "c_type", "return"], `ABI type ${name}`);
    if (!new Set(["aggregate", "exact_integer", "pointer", "scalar", "void"])
      .has(item.kind) || typeof item.c_type !== "string" ||
      !/^[A-Za-z0-9_ *]+$/.test(item.c_type) || typeof item.return !== "boolean") {
      fail(filename, `${name} has unsupported ABI representation`);
    }
    abiTypes.set(name, Object.freeze({ id: name, ...item }));
  }
  for (const semantic of semanticTypes.values()) {
    for (const abi of semantic.input_abis) {
      if (!abiTypes.has(abi)) fail(filename, `${semantic.id} names unknown ABI ${abi}`);
    }
    if (semantic.element_abi !== undefined && !abiTypes.has(semantic.element_abi)) {
      fail(filename, `${semantic.id} names unknown element ABI ${semantic.element_abi}`);
    }
  }

  const adapters = new Map();
  for (const [name, item] of Object.entries(document.adapters)) {
    if (!identifier(name)) fail(filename, `invalid adapter ${name}`);
    keys(filename, item, [
      "abi_type", "parameter_fields", "consumes", "dimensions",
      "access_field", "aliasing_field", "transactional_field",
      "transactional_writes",
    ], `adapter ${name}`);
    if (!abiTypes.has(item.abi_type) || !object(item.parameter_fields)) {
      fail(filename, `${name} names an unknown ABI or invalid parameter_fields`);
    }
    for (const [field, type] of Object.entries(item.parameter_fields)) {
      if (!identifier(field) || !semanticTypes.has(type)) {
        fail(filename, `${name} has invalid parameter field ${field}:${type}`);
      }
    }
    strings(filename, item.consumes, `${name}.consumes`);
    strings(filename, item.dimensions, `${name}.dimensions`);
    for (const field of [...item.consumes, ...item.dimensions]) {
      if (!(field in item.parameter_fields)) {
        fail(filename, `${name} refers to unknown parameter field ${field}`);
      }
    }
    for (const field of [
      item.access_field, item.aliasing_field, item.transactional_field,
    ]) {
      if (!identifier(field)) fail(filename, `${name} has invalid policy field`);
    }
    if (typeof item.transactional_writes !== "boolean") {
      fail(filename, `${name}.transactional_writes must be boolean`);
    }
    adapters.set(name, Object.freeze({ id: name, ...item }));
  }
  return Object.freeze({
    schema,
    filename,
    hash: createHash("sha256").update(source).digest("hex"),
    semanticTypes,
    abiTypes,
    adapters,
  });
}

module.exports = { catalogPath, loadCatalog, schema };
