"use strict";

// Dispatch declarations are parsed as a deliberately tiny CPython-compatible
// data language. The file is never imported or executed.

const { readFileSync } = require("node:fs");
const { relative, resolve, sep } = require("node:path");
const createCompiler = require("../..");
const { canonicalJson } = require("./common.cjs");
const {
  FAMILY_SCHEMA,
  PROFILE_SCHEMA,
  validateFamilyDocument,
  validateProfileDocument,
} = require("./schema.cjs");

const IMPORT_MODULE = "sagejs.dispatch";
const ALLOWED_IMPORTS = new Set([
  "Algorithm", "Capability", "Conversion", "DispatchFamily", "DispatchProfile",
  "Operation", "ProfileOperation", "Representation", "Rule", "all_of",
  "any_of", "available", "feature", "maximum", "minimum", "not_",
]);

function nodeType(node) {
  return node?.constructor?.name;
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

function location(node, logicalFilename) {
  const token = node?.start;
  return {
    path: logicalFilename,
    line: token?.line || 1,
    column: (token?.col || 0) + 1,
  };
}

function sourceFail(filename, node, message) {
  const token = node?.start;
  const suffix = token ? `:${token.line}:${token.col + 1}` : "";
  throw new Error(`math dispatch source ${filename}${suffix}: ${message}`);
}

function expect(filename, node, condition, message) {
  if (!condition) sourceFail(filename, node, message);
}

function integerLiteral(filename, node) {
  if (nodeType(node) === "AST_Number" && Number.isSafeInteger(node.value)) {
    return node.value;
  }
  if (nodeType(node) === "AST_Call" && expressionName(node.expression) === "Integer" &&
      array(node.args).length === 1 && nodeType(array(node.args)[0]) === "AST_String" &&
      /^-?[0-9]+$/.test(array(node.args)[0].value)) {
    const value = Number(array(node.args)[0].value);
    expect(filename, node, Number.isSafeInteger(value), "integer literal is too large");
    return value;
  }
  sourceFail(filename, node, "expected a safe integer literal");
}

function integerText(filename, node) {
  if (nodeType(node) === "AST_Number" && Number.isSafeInteger(node.value)) {
    return String(node.value);
  }
  if (nodeType(node) === "AST_Call" && expressionName(node.expression) === "Integer" &&
      array(node.args).length === 1 && nodeType(array(node.args)[0]) === "AST_String" &&
      /^-?(?:0|[1-9][0-9]*)$/.test(array(node.args)[0].value)) {
    return array(node.args)[0].value;
  }
  sourceFail(filename, node, "expected an integer literal");
}

function literal(filename, node) {
  switch (nodeType(node)) {
    case "AST_String": return node.value;
    case "AST_True": return true;
    case "AST_False": return false;
    case "AST_Null": return null;
    case "AST_Number": return integerLiteral(filename, node);
    case "AST_Call":
      if (expressionName(node.expression) === "Integer") return integerLiteral(filename, node);
      break;
    case "AST_Array": return array(node.elements).map((item) => literal(filename, item));
    case "AST_Object": {
      const result = Object.create(null);
      for (const property of array(node.properties)) {
        expect(filename, property, nodeType(property) === "AST_ObjectKeyVal",
          "dictionary entries must be key/value pairs");
        const key = literal(filename, property.key);
        expect(filename, property.key, typeof key === "string", "dictionary keys must be strings");
        expect(filename, property, !Object.prototype.hasOwnProperty.call(result, key),
          `duplicate dictionary key ${key}`);
        Object.defineProperty(result, key, {
          value: literal(filename, property.value),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    }
  }
  sourceFail(filename, node, "expected a static declaration literal");
}

function callParts(filename, node, expectedName, options = {}) {
  expect(filename, node, nodeType(node) === "AST_Call", `expected ${expectedName}(...)`);
  const actual = expressionName(node.expression);
  expect(filename, node, actual === expectedName,
    `expected ${expectedName}(...), not ${actual || nodeType(node.expression)}`);
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
    "star arguments are not allowed in dispatch declarations");
  const [minimum = 0, maximum = minimum] = options.positional || [];
  expect(filename, node, positional.length >= minimum && positional.length <= maximum,
    `${expectedName} expects ${minimum === maximum ? minimum : `${minimum}-${maximum}`} positional argument(s)`);
  const allowed = new Set(options.keywords || []);
  for (const key of keywords.keys()) {
    expect(filename, node, allowed.has(key), `${expectedName} has unknown keyword ${key}`);
  }
  for (const key of options.required || []) {
    expect(filename, node, keywords.has(key), `${expectedName} is missing keyword ${key}`);
  }
  return { node, positional, keywords };
}

function keywordLiteral(filename, call, name, defaultValue) {
  const node = call.keywords.get(name);
  return node === undefined ? defaultValue : literal(filename, node);
}

function requiredString(filename, call, name) {
  const value = keywordLiteral(filename, call, name);
  expect(filename, call.node, typeof value === "string" && value.length > 0,
    `${expressionName(call.node.expression)}.${name} must be a nonempty string`);
  return value;
}

function sourceExpression(filename, node, logicalFilename) {
  if (nodeType(node) === "AST_Number" ||
      (nodeType(node) === "AST_Call" && expressionName(node.expression) === "Integer")) {
    return { op: "integer", value: integerText(filename, node), source: location(node, logicalFilename) };
  }
  if (["AST_True", "AST_False", "AST_String"].includes(nodeType(node))) {
    return literal(filename, node);
  }
  const source = location(node, logicalFilename);
  if (nodeType(node) === "AST_Call") {
    const name = expressionName(node.expression);
    if (name === "feature" || name === "available") {
      const call = callParts(filename, node, name, { positional: [1], keywords: [] });
      const value = literal(filename, call.positional[0]);
      expect(filename, node, typeof value === "string", `${name} expects a string`);
      return { op: name, name: value, source };
    }
    const variadic = { all_of: "all", any_of: "any", maximum: "maximum", minimum: "minimum" };
    if (variadic[name]) {
      const call = callParts(filename, node, name, { positional: [2, Number.MAX_SAFE_INTEGER], keywords: [] });
      return {
        op: variadic[name],
        arguments: call.positional.map((item) => sourceExpression(filename, item, logicalFilename)),
        source,
      };
    }
    if (name === "not_") {
      const call = callParts(filename, node, name, { positional: [1], keywords: [] });
      return { op: "not", arguments: [sourceExpression(filename, call.positional[0], logicalFilename)], source };
    }
  }
  if (nodeType(node) === "AST_Binary") {
    const comparisons = { "==": "eq", "!=": "ne", "<": "lt", "<=": "le", ">": "gt", ">=": "ge" };
    if (comparisons[node.operator]) {
      return {
        op: "compare",
        operator: comparisons[node.operator],
        left: sourceExpression(filename, node.left, logicalFilename),
        right: sourceExpression(filename, node.right, logicalFilename),
        source,
      };
    }
    const arithmetic = { "+": "add", "-": "subtract", "*": "multiply" };
    expect(filename, node, arithmetic[node.operator] !== undefined,
      `unsupported expression operator ${node.operator}`);
    return {
      op: arithmetic[node.operator],
      left: sourceExpression(filename, node.left, logicalFilename),
      right: sourceExpression(filename, node.right, logicalFilename),
      source,
    };
  }
  sourceFail(filename, node, "unsupported dispatch predicate expression");
}

function staticListOfCalls(filename, node, parser) {
  expect(filename, node, nodeType(node) === "AST_Array", "expected a declaration list");
  return array(node.elements).map(parser);
}

function parseCapability(filename, node, logicalFilename) {
  const call = callParts(filename, node, "Capability", {
    positional: [0], required: ["id", "requires", "reason"],
    keywords: ["id", "requires", "reason"],
  });
  return {
    id: requiredString(filename, call, "id"),
    requires: sourceExpression(filename, call.keywords.get("requires"), logicalFilename),
    reason: requiredString(filename, call, "reason"),
    source: location(node, logicalFilename),
  };
}

function parseRepresentation(filename, node, logicalFilename) {
  const call = callParts(filename, node, "Representation", {
    positional: [0], required: ["id", "when", "policy", "reason"],
    keywords: ["id", "when", "policy", "reason"],
  });
  return {
    id: requiredString(filename, call, "id"),
    when: sourceExpression(filename, call.keywords.get("when"), logicalFilename),
    policy: requiredString(filename, call, "policy"),
    reason: requiredString(filename, call, "reason"),
    source: location(node, logicalFilename),
  };
}

function parseAlgorithm(filename, node, logicalFilename) {
  const call = callParts(filename, node, "Algorithm", {
    positional: [0], required: ["id", "reason"],
    keywords: ["id", "requires", "when", "fallback", "conversions", "reason"],
  });
  return {
    id: requiredString(filename, call, "id"),
    requires: keywordLiteral(filename, call, "requires", []),
    when: call.keywords.has("when")
      ? sourceExpression(filename, call.keywords.get("when"), logicalFilename) : true,
    fallback: keywordLiteral(filename, call, "fallback", []),
    conversions: keywordLiteral(filename, call, "conversions", []),
    reason: requiredString(filename, call, "reason"),
    source: location(node, logicalFilename),
  };
}

function parseConversion(filename, node, logicalFilename) {
  const call = callParts(filename, node, "Conversion", {
    positional: [0],
    required: ["id", "source_representation", "target_layout", "allocation", "reason"],
    keywords: ["id", "source_representation", "target_layout", "allocation", "reason"],
  });
  return {
    id: requiredString(filename, call, "id"),
    source_representation: requiredString(filename, call, "source_representation"),
    target_layout: requiredString(filename, call, "target_layout"),
    allocation: requiredString(filename, call, "allocation"),
    reason: requiredString(filename, call, "reason"),
    source: location(node, logicalFilename),
  };
}

function parseOperation(filename, node, logicalFilename) {
  const call = callParts(filename, node, "Operation", {
    positional: [0], required: ["id", "features", "algorithms"],
    keywords: ["id", "features", "algorithms"],
  });
  return {
    id: requiredString(filename, call, "id"),
    features: keywordLiteral(filename, call, "features"),
    algorithms: staticListOfCalls(filename, call.keywords.get("algorithms"),
      (item) => parseAlgorithm(filename, item, logicalFilename)),
    source: location(node, logicalFilename),
  };
}

function parseFamily(filename, node, logicalFilename) {
  const call = callParts(filename, node, "DispatchFamily", {
    positional: [0], required: [
      "id", "schema", "generation", "features", "capabilities", "conversions",
      "representations", "operations",
    ],
    keywords: [
      "id", "schema", "generation", "features", "capabilities", "conversions",
      "representations", "operations",
    ],
  });
  return {
    schema: FAMILY_SCHEMA,
    schema_version: keywordLiteral(filename, call, "schema"),
    kind: "family",
    id: requiredString(filename, call, "id"),
    generation: keywordLiteral(filename, call, "generation"),
    features: keywordLiteral(filename, call, "features"),
    capabilities: staticListOfCalls(filename, call.keywords.get("capabilities"),
      (item) => parseCapability(filename, item, logicalFilename)),
    conversions: staticListOfCalls(filename, call.keywords.get("conversions"),
      (item) => parseConversion(filename, item, logicalFilename)),
    representations: staticListOfCalls(filename, call.keywords.get("representations"),
      (item) => parseRepresentation(filename, item, logicalFilename)),
    operations: staticListOfCalls(filename, call.keywords.get("operations"),
      (item) => parseOperation(filename, item, logicalFilename)),
    source: location(node, logicalFilename),
  };
}

function parseRule(filename, node, logicalFilename) {
  const call = callParts(filename, node, "Rule", {
    positional: [0], required: ["id", "choose", "when", "reason"],
    keywords: ["id", "choose", "when", "evidence", "reason"],
  });
  return {
    id: requiredString(filename, call, "id"),
    choose: requiredString(filename, call, "choose"),
    when: sourceExpression(filename, call.keywords.get("when"), logicalFilename),
    evidence: keywordLiteral(filename, call, "evidence", null),
    reason: requiredString(filename, call, "reason"),
    source: location(node, logicalFilename),
  };
}

function parseProfileOperation(filename, node, logicalFilename) {
  const call = callParts(filename, node, "ProfileOperation", {
    positional: [0], required: ["family", "operation", "rules"],
    keywords: ["family", "operation", "rules"],
  });
  return {
    family: requiredString(filename, call, "family"),
    operation: requiredString(filename, call, "operation"),
    rules: staticListOfCalls(filename, call.keywords.get("rules"),
      (item) => parseRule(filename, item, logicalFilename)),
    source: location(node, logicalFilename),
  };
}

function parseProfile(filename, node, logicalFilename) {
  const call = callParts(filename, node, "DispatchProfile", {
    positional: [0], required: [
      "id", "schema", "generation", "kind", "match", "declarations",
      "evidence", "operations",
    ],
    keywords: [
      "id", "schema", "generation", "kind", "match", "declarations",
      "evidence", "operations",
    ],
  });
  return {
    schema: PROFILE_SCHEMA,
    schema_version: keywordLiteral(filename, call, "schema"),
    id: requiredString(filename, call, "id"),
    generation: keywordLiteral(filename, call, "generation"),
    kind: requiredString(filename, call, "kind"),
    match: keywordLiteral(filename, call, "match"),
    declarations: keywordLiteral(filename, call, "declarations"),
    evidence: keywordLiteral(filename, call, "evidence"),
    operations: staticListOfCalls(filename, call.keywords.get("operations"),
      (item) => parseProfileOperation(filename, item, logicalFilename)),
    source: location(node, logicalFilename),
  };
}

function validateImports(filename, topLevel) {
  const imports = topLevel.filter((statement) => nodeType(statement) === "AST_Imports");
  expect(filename, imports[0], imports.length === 1,
    `declaration must contain exactly one import from ${IMPORT_MODULE}`);
  const entries = array(imports[0].imports);
  expect(filename, imports[0], entries.length === 1 && entries[0].key === IMPORT_MODULE,
    `declaration may import only from ${IMPORT_MODULE}`);
  for (const imported of array(entries[0].argnames)) {
    expect(filename, imported, imported.alias === undefined || imported.alias === null,
      "declaration imports may not be aliased");
    expect(filename, imported, ALLOWED_IMPORTS.has(imported.name),
      `unsupported dispatch helper ${imported.name}`);
  }
}

function assignment(filename, statement) {
  expect(filename, statement,
    nodeType(statement) === "AST_SimpleStatement" &&
    nodeType(statement.body) === "AST_Assign" && statement.body.operator === "=" &&
    nodeType(statement.body.left) === "AST_SymbolRef",
  "declaration must contain one simple assignment");
  return statement.body;
}

function logicalPath(root, filename) {
  const path = relative(resolve(root), resolve(filename)).split(sep).join("/");
  if (path.startsWith("../") || path === "..") {
    throw new Error(`dispatch declaration ${filename} is outside ${root}`);
  }
  return path;
}

async function parseDispatchSource(filename, options = {}) {
  const resolved = resolve(filename);
  const root = resolve(options.root || process.cwd());
  const logicalFilename = options.logicalFilename || logicalPath(root, resolved);
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
    throw new Error(`math dispatch source ${resolved}: ${error.message}`);
  } finally {
    frontend.close();
  }
  const topLevel = array(toplevel.body);
  validateImports(resolved, topLevel);
  const declarations = topLevel.filter((statement) =>
    nodeType(statement) !== "AST_Imports" &&
    !(nodeType(statement) === "AST_SimpleStatement" &&
      ["AST_EmptyStatement", "AST_String"].includes(nodeType(statement.body))));
  expect(resolved, declarations[0], declarations.length === 1,
    "declaration must contain exactly one authority assignment");
  const declared = assignment(resolved, declarations[0]);
  const constructor = expressionName(declared.right?.expression);
  const document = constructor === "DispatchFamily"
    ? parseFamily(resolved, declared.right, logicalFilename)
    : constructor === "DispatchProfile"
      ? parseProfile(resolved, declared.right, logicalFilename)
      : sourceFail(resolved, declared.right, "authority must be DispatchFamily or DispatchProfile");
  return Object.freeze({
    filename: resolved,
    logicalFilename,
    source,
    document,
    text: canonicalJson(document),
    kind: document.kind === "family" ? "family" : "profile",
  });
}

function validateParsedFamily(parsed) {
  return validateFamilyDocument(parsed.document, { filename: parsed.logicalFilename });
}

function validateParsedProfile(parsed, families) {
  return validateProfileDocument(parsed.document, families, { filename: parsed.logicalFilename });
}

module.exports = {
  ALLOWED_IMPORTS,
  IMPORT_MODULE,
  parseDispatchSource,
  validateParsedFamily,
  validateParsedProfile,
};
