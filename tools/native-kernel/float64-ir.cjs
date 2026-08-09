"use strict";

const {
  annotateOperations,
  sourceSpan,
} = require("./provenance.cjs");

function nodeType(node) {
  return node?.constructor?.name;
}

function array(value) {
  return Array.from(value || []);
}

function location(node, filename) {
  const token = node?.start;
  return Number.isInteger(token?.line)
    ? filename + ":" + token.line + ":" + ((token.col || 0) + 1)
    : filename;
}

function fail(context, node, message) {
  throw new Error(
    "native kernel: " + location(node, context.filename) + ": " +
    context.functionName + ": " + message,
  );
}

function expect(context, node, condition, message) {
  if (!condition) fail(context, node, message);
}

function numericLiteral(node) {
  let sign = "";
  if (nodeType(node) === "AST_UnaryPrefix" && node.operator === "-") {
    sign = "-";
    node = node.expression;
  }
  if (nodeType(node) !== "AST_Number") return undefined;
  const value = sign + String(node.value);
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
    ? value
    : undefined;
}

function numericString(node) {
  if (nodeType(node) !== "AST_String") return undefined;
  const value = String(node.value);
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
    ? value
    : undefined;
}

function createContext(fn, signature, filename, decorated) {
  return {
    decorated,
    filename,
    functionName: signature.name,
    initialized: new Set(signature.params.map((param) => param.name)),
    locals: new Map(),
    nextTemporary: 0,
    params: signature.params,
    returnType: signature.returnType,
    variables: new Map(
      signature.params.map((param) => [param.name, param.type]),
    ),
    fn,
  };
}

function ensureVariable(context, node, name, type) {
  const current = context.variables.get(name);
  if (current !== undefined) {
    expect(
      context,
      node,
      current === type,
      "local " + name + " changes type from " + current + " to " + type,
    );
  } else {
    context.variables.set(name, type);
    context.locals.set(name, type);
  }
  return name;
}

function temporary(context, node, type) {
  let name;
  do {
    name = "sagejs_native_float_tmp_" + context.nextTemporary++;
  } while (context.variables.has(name));
  ensureVariable(context, node, name, type);
  return name;
}

function emitFloatConstant(context, node, operations, value) {
  const target = temporary(context, node, "Float64");
  operations.push({ kind: "float64.constant", target, value });
  return { name: target, type: "Float64" };
}

function lowerCall(node, context, operations) {
  expect(
    context,
    node,
    nodeType(node.expression) === "AST_SymbolRef",
    "binary64 calls require a simple function name",
  );
  const name = node.expression.name;
  const args = array(node.args);
  expect(context, node, args.length === 1, name + "() requires one argument");
  if (name === "float" || name === "RealNumber") {
    // The ordinary Sage.js frontend preserves a decimal source literal as
    // RealNumber("...").  Keep the spelling in the native IR instead of
    // routing it through the dynamic RealNumber constructor.
    const literal = name === "RealNumber" ? numericString(args[0]) : undefined;
    if (literal !== undefined) {
      return emitFloatConstant(context, node, operations, literal);
    }
    const source = lowerExpression(args[0], context, operations);
    if (source.type === "Float64") return source;
    expect(
      context,
      args[0],
      source.type === "uint64",
      "float() currently accepts uint64 or Float64",
    );
    const target = temporary(context, node, "Float64");
    operations.push({
      kind: "float64.from_uint64",
      target,
      source: source.name,
    });
    return { name: target, type: "Float64" };
  }
  if (name === "abs") {
    const source = lowerExpression(args[0], context, operations);
    expect(
      context,
      args[0],
      source.type === "Float64",
      "binary64 abs() requires Float64",
    );
    const target = temporary(context, node, "Float64");
    operations.push({ kind: "float64.abs", target, source: source.name });
    return { name: target, type: "Float64" };
  }
  fail(context, node, "unsupported binary64 call to " + name);
}

function lowerExpression(node, context, operations) {
  const literal = numericLiteral(node);
  if (literal !== undefined) {
    return emitFloatConstant(context, node, operations, literal);
  }
  if (nodeType(node) === "AST_SymbolRef") {
    const type = context.variables.get(node.name);
    expect(context, node, type !== undefined, "unknown value " + node.name);
    expect(
      context,
      node,
      context.initialized.has(node.name),
      "value " + node.name + " may be uninitialized",
    );
    return { name: node.name, type };
  }
  if (nodeType(node) === "AST_Call") {
    return lowerCall(node, context, operations);
  }
  expect(
    context,
    node,
    nodeType(node) === "AST_Binary" &&
      ["+", "-", "*", "/"].includes(node.operator),
    "unsupported " + nodeType(node) + " binary64 expression",
  );
  const left = lowerExpression(node.left, context, operations);
  const right = lowerExpression(node.right, context, operations);
  expect(
    context,
    node,
    left.type === "Float64" && right.type === "Float64",
    "binary64 arithmetic requires Float64 operands",
  );
  const target = temporary(context, node, "Float64");
  operations.push({
    kind: "float64.binary",
    operation: { "+": "add", "-": "sub", "*": "mul", "/": "div" }[
      node.operator
    ],
    target,
    left: left.name,
    right: right.name,
  });
  return { name: target, type: "Float64" };
}

function assign(statement, context) {
  const node = statement.body;
  expect(
    context,
    statement,
    nodeType(statement) === "AST_SimpleStatement" &&
      nodeType(node) === "AST_Assign" &&
      nodeType(node.left) === "AST_SymbolRef",
    "binary64 assignments require a local-name target",
  );
  const operations = [];
  const target = node.left.name;
  if (node.operator === "=") {
    const value = lowerExpression(node.right, context, operations);
    ensureVariable(context, node.left, target, value.type);
    operations.push({
      kind: value.type === "Float64" ? "float64.copy" : "uint64.copy",
      target,
      source: value.name,
    });
  } else {
    expect(
      context,
      node,
      ["+=", "-=", "*=", "/="].includes(node.operator) &&
        context.variables.get(target) === "Float64" &&
        context.initialized.has(target),
      "unsupported binary64 augmented assignment " + node.operator,
    );
    const value = lowerExpression(node.right, context, operations);
    expect(context, node.right, value.type === "Float64", "expected Float64");
    operations.push({
      kind: "float64.binary",
      operation: { "+=": "add", "-=": "sub", "*=": "mul", "/=": "div" }[
        node.operator
      ],
      target,
      left: target,
      right: value.name,
    });
  }
  context.initialized.add(target);
  return operations;
}

function lowerBlock(block, context) {
  const statements = nodeType(block) === "AST_BlockStatement"
    ? array(block.body)
    : Array.isArray(block) ? block : [block];
  const result = [];
  for (const statement of statements) {
    if (nodeType(statement) === "AST_SimpleStatement") {
      const operations = assign(statement, context);
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
      continue;
    }
    if (nodeType(statement) === "AST_ForIn") {
      expect(
        context,
        statement,
        nodeType(statement.init) === "AST_SymbolRef" &&
          nodeType(statement.object) === "AST_Call" &&
          nodeType(statement.object.expression) === "AST_SymbolRef" &&
          statement.object.expression.name === "range",
        "binary64 for loops require a local index and range(...)",
      );
      const args = array(statement.object.args);
      expect(
        context,
        statement.object,
        args.length === 1 &&
          nodeType(args[0]) === "AST_SymbolRef" &&
          context.variables.get(args[0].name) === "uint64",
        "binary64 range currently requires one uint64 stop",
      );
      const index = statement.init.name;
      ensureVariable(context, statement.init, index, "uint64");
      const before = new Set(context.initialized);
      context.initialized.add(index);
      const body = lowerBlock(statement.body, context);
      context.initialized = before;
      const operation = {
        kind: "loop.range",
        index,
        start: 0,
        count: args[0].name,
        step: 1,
        boundIsStop: true,
        body,
      };
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(operation);
      continue;
    }
    if (nodeType(statement) === "AST_Return") {
      const operations = [];
      const value = lowerExpression(statement.value, context, operations);
      expect(
        context,
        statement.value,
        value.type === context.returnType,
        "return expects " + context.returnType + ", got " + value.type,
      );
      operations.push({
        kind: "return",
        value: value.name,
        type: value.type,
      });
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
      continue;
    }
    fail(context, statement, "unsupported " + nodeType(statement) + " statement");
  }
  return result;
}

function lowerFloat64Function(fn, signature, filename, decorated) {
  const context = createContext(fn, signature, filename, decorated);
  const body = lowerBlock(fn.body, context);
  expect(
    context,
    fn,
    body.some((operation) => operation.kind === "return"),
    "binary64 function has no return",
  );
  return {
    name: signature.name,
    decorated,
    kernelKind: "float64",
    sourceTransparent: true,
    params: signature.params,
    returnType: signature.returnType,
    locals: Array.from(context.locals, ([name, type]) => ({
      name,
      type,
      storage: "local",
    })),
    dependencies: [],
    optimizations: {},
    analysis: {
      representation: "IEEE-754 binary64",
      backend: { kind: "native-double" },
      effects: { pure: true, mayRaise: [] },
    },
    body,
  };
}

function isFloat64Signature(signature) {
  return signature.returnType === "Float64" &&
    signature.params.every((param) =>
      param.type === "Float64" || param.type === "uint64"
    );
}

module.exports = {
  isFloat64Signature,
  lowerFloat64Function,
  numericLiteral,
};
