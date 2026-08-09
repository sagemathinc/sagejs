"use strict";

/*
 * Source provenance shared by every Native Kernel frontend and backend.
 *
 * The compiler deliberately keeps this information in its serializable IR.
 * It is therefore available to command-line tools, cache manifests, coding
 * agents, and generated-C diagnostics without depending on parser objects.
 */

function position(value, fallbackColumn = 0) {
  if (value === null || typeof value !== "object") return null;
  const line = Number.isInteger(value.line) ? value.line : null;
  if (line === null) return null;
  const column = Number.isInteger(value.col)
    ? value.col + 1
    : Number.isInteger(value.column)
      ? value.column
      : fallbackColumn + 1;
  const result = { line, column };
  if (Number.isInteger(value.pos)) result.offset = value.pos;
  return result;
}

function sourceSpan(node, filename) {
  const start = position(node?.start);
  if (start === null) return { file: filename };
  const end = position(node?.end, start.column - 1) || start;
  return { file: filename, start, end };
}

function operationChildren(operation) {
  const children = [];
  if (Array.isArray(operation?.body)) children.push(operation.body);
  if (Array.isArray(operation?.alternative)) children.push(operation.alternative);
  if (Array.isArray(operation?.condition?.operations)) {
    children.push(operation.condition.operations);
  }
  if (Array.isArray(operation?.right?.operations)) {
    children.push(operation.right.operations);
  }
  return children;
}

function annotateOperations(operations, provenance) {
  for (const operation of operations || []) {
    if (operation.provenance === undefined) operation.provenance = provenance;
    for (const children of operationChildren(operation)) {
      annotateOperations(children, provenance);
    }
  }
  return operations;
}

function assignOperationIds(fn) {
  let next = 1;
  let hasExisting = false;
  function inspect(operations) {
    for (const operation of operations || []) {
      if (operation.id !== undefined) hasExisting = true;
      for (const children of operationChildren(operation)) inspect(children);
    }
  }
  inspect(fn.body);
  const prefix = hasExisting ? `${fn.name}:optimized:` : `${fn.name}:`;
  function visit(operations) {
    for (const operation of operations || []) {
      if (operation.id === undefined) {
        operation.id = `${prefix}${next}`;
        next += 1;
      }
      if (operation.origins === undefined) operation.origins = [operation.id];
      for (const children of operationChildren(operation)) visit(children);
    }
  }
  visit(fn.body);
  return fn;
}

function finalizeFunctionProvenance(fn, node, filename) {
  const provenance = fn.provenance || sourceSpan(node, filename);
  fn.provenance = provenance;
  annotateOperations(fn.body, provenance);
  return assignOperationIds(fn);
}

function collectOperationIds(operation) {
  const ids = [];
  function visit(current) {
    if (current?.id !== undefined) ids.push(current.id);
    for (const children of operationChildren(current)) {
      for (const child of children) visit(child);
    }
  }
  visit(operation);
  return ids;
}

function generatedOperation(operation, properties) {
  return {
    ...properties,
    provenance: operation.provenance,
    origins: collectOperationIds(operation),
  };
}

function displayLocation(provenance) {
  if (provenance === null || typeof provenance !== "object") return "unknown";
  if (provenance.start === undefined) return provenance.file || "unknown";
  return `${provenance.file || "<source>"}:` +
    `${provenance.start.line}:${provenance.start.column}`;
}

function cOperationComment(operation, indent = "") {
  if (operation?.id === undefined) return "";
  const location = displayLocation(operation.provenance)
    .replaceAll("*/", "* /");
  const origins = Array.isArray(operation.origins) &&
      !(operation.origins.length === 1 && operation.origins[0] === operation.id)
    ? ` origins=${operation.origins.join(",")}`
    : "";
  return `${indent}/* sagejs-ir ${operation.id} ${location}${origins} */`;
}

function cSourceDirective(operation) {
  const provenance = operation?.provenance;
  if (!Number.isInteger(provenance?.start?.line) ||
      typeof provenance?.file !== "string") return "";
  return `#line ${provenance.start.line} ${JSON.stringify(provenance.file)}`;
}

function generatedCSourceMap(source) {
  const entries = [];
  const lines = source.split("\n");
  const pattern = /^\s*\/\* sagejs-ir (\S+) (.*?)(?: origins=(.*?))? \*\/$/;
  for (let index = 0; index < lines.length; index += 1) {
    const match = pattern.exec(lines[index]);
    if (match === null) continue;
    const previous = entries.at(-1);
    if (previous !== undefined) previous.generated.endLine = index;
    entries.push({
      id: match[1],
      location: match[2],
      origins: match[3] === undefined ? [match[1]] : match[3].split(","),
      generated: { startLine: index + 1, endLine: lines.length },
    });
  }
  return entries;
}

module.exports = {
  annotateOperations,
  assignOperationIds,
  cOperationComment,
  cSourceDirective,
  collectOperationIds,
  displayLocation,
  finalizeFunctionProvenance,
  generatedCSourceMap,
  generatedOperation,
  sourceSpan,
};
