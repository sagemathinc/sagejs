"use strict";

const {
  annotateOperations,
  sourceSpan,
} = require("./provenance.cjs");

const UINT64_MAX = 18446744073709551615n;
const BUFFER_TYPES = new Set(["Float64Buffer", "Float64Record"]);

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

function uint64Literal(node) {
  let text;
  if (nodeType(node) === "AST_Number" && /^\d+$/.test(String(node.value))) {
    text = String(node.value);
  } else if (
    nodeType(node) === "AST_Call" &&
    nodeType(node.expression) === "AST_SymbolRef" &&
    node.expression.name === "Integer"
  ) {
    const args = array(node.args);
    if (args.length === 1 && nodeType(args[0]) === "AST_String" &&
        /^\d+$/.test(args[0].value)) text = args[0].value;
  }
  if (text === undefined) return undefined;
  const value = BigInt(text);
  return value <= UINT64_MAX ? value.toString() : undefined;
}

function createContext(fn, signature, filename, decorated) {
  return {
    decorated,
    filename,
    functionName: signature.name,
    initialized: new Set(signature.params.map((param) => param.name)),
    locals: new Map(),
    mutatedBuffers: new Set(),
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
  context.initialized.add(name);
  return name;
}

function emitFloatConstant(context, node, operations, value) {
  const target = temporary(context, node, "Float64");
  operations.push({ kind: "float64.constant", target, value });
  return { name: target, type: "Float64" };
}

function emitUint64Constant(context, node, operations, value) {
  const target = temporary(context, node, "uint64");
  operations.push({ kind: "uint64.constant", target, value });
  return { name: target, type: "uint64" };
}

function staticType(node, context) {
  if (nodeType(node) === "AST_SymbolRef") return context.variables.get(node.name);
  const literal = numericLiteral(node);
  if (literal !== undefined && !/^\d+$/.test(literal)) return "Float64";
  if (nodeType(node) === "AST_ItemAccess") return "Float64";
  if (nodeType(node) === "AST_Call" &&
      nodeType(node.expression) === "AST_SymbolRef") {
    const name = node.expression.name;
    if (["float", "RealNumber", "abs", "sqrt"].includes(name)) {
      return "Float64";
    }
    if (name === "len") return "uint64";
    if (name === "float64_record") return "Float64Record";
  }
  if (nodeType(node) === "AST_Binary") {
    return staticType(node.left, context) || staticType(node.right, context);
  }
  return undefined;
}

function lowerCall(node, context, operations, expectedType) {
  expect(
    context,
    node,
    nodeType(node.expression) === "AST_SymbolRef",
    "binary64 calls require a simple function name",
  );
  const name = node.expression.name;
  const args = array(node.args);
  if (name === "float" || name === "RealNumber") {
    expect(context, node, args.length === 1, name + "() requires one argument");
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
  if (name === "abs" || name === "sqrt") {
    expect(context, node, args.length === 1, name + "() requires one argument");
    const source = lowerExpression(args[0], context, operations, "Float64");
    expect(
      context,
      args[0],
      source.type === "Float64",
      "binary64 " + name + "() requires Float64",
    );
    const target = temporary(context, node, "Float64");
    operations.push({
      kind: name === "abs" ? "float64.abs" : "float64.sqrt",
      target,
      source: source.name,
    });
    return { name: target, type: "Float64" };
  }
  if (name === "len") {
    expect(context, node, args.length === 1, "len() requires one argument");
    const source = lowerExpression(args[0], context, operations);
    expect(
      context,
      args[0],
      BUFFER_TYPES.has(source.type),
      "binary64 len() requires a Float64Buffer or Float64Record",
    );
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: "float64.buffer.length",
      target,
      buffer: source.name,
      bufferType: source.type,
    });
    return { name: target, type: "uint64" };
  }
  if (name === "float64_record") {
    expect(
      context,
      node,
      args.length === 3,
      "float64_record() requires a buffer, start, and length",
    );
    const buffer = lowerExpression(args[0], context, operations);
    expect(
      context,
      args[0],
      buffer.type === "Float64Buffer",
      "float64_record() requires a Float64Buffer",
    );
    const start = lowerExpression(args[1], context, operations, "uint64");
    const length = lowerExpression(args[2], context, operations, "uint64");
    const target = temporary(context, node, "Float64Record");
    operations.push({
      kind: "float64.record.view",
      target,
      buffer: buffer.name,
      start: start.name,
      length: length.name,
    });
    return { name: target, type: "Float64Record" };
  }
  fail(context, node, "unsupported binary64 call to " + name +
    (expectedType ? " while expecting " + expectedType : ""));
}

function lowerBinary(node, context, operations, expectedType) {
  let type = expectedType || staticType(node.left, context) ||
    staticType(node.right, context) || "Float64";
  if (type === "Float64Record" || type === "Float64Buffer") type = "Float64";
  expect(
    context,
    node,
    type === "Float64" || type === "uint64",
    "cannot use " + type + " in binary64 arithmetic",
  );
  const allowed = type === "Float64" ? ["+", "-", "*", "/"] : ["+", "-", "*"];
  expect(
    context,
    node,
    allowed.includes(node.operator),
    "unsupported " + type + " operator " + node.operator,
  );
  const left = lowerExpression(node.left, context, operations, type);
  const right = lowerExpression(node.right, context, operations, type);
  expect(
    context,
    node,
    left.type === type && right.type === type,
    type + " arithmetic requires matching operands",
  );
  const target = temporary(context, node, type);
  operations.push({
    kind: type === "Float64" ? "float64.binary" : "uint64.binary",
    operation: type === "Float64"
      ? { "+": "add", "-": "sub", "*": "mul", "/": "div" }[node.operator]
      : node.operator,
    target,
    left: left.name,
    right: right.name,
  });
  return { name: target, type };
}

function lowerExpression(node, context, operations, expectedType) {
  if (expectedType === "uint64") {
    const integer = uint64Literal(node);
    if (integer !== undefined) {
      return emitUint64Constant(context, node, operations, integer);
    }
  }
  const literal = numericLiteral(node);
  if (literal !== undefined) {
    if (expectedType === "uint64") {
      fail(context, node, "uint64 expression requires a nonnegative integer literal");
    }
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
    if (expectedType !== undefined) {
      expect(
        context,
        node,
        type === expectedType,
        "expected " + expectedType + ", got " + type,
      );
    }
    return { name: node.name, type };
  }
  if (nodeType(node) === "AST_Call") {
    return lowerCall(node, context, operations, expectedType);
  }
  if (nodeType(node) === "AST_ItemAccess") {
    const buffer = lowerExpression(node.expression, context, operations);
    expect(
      context,
      node.expression,
      BUFFER_TYPES.has(buffer.type),
      "binary64 indexing requires a Float64Buffer or Float64Record",
    );
    const index = lowerExpression(node.property, context, operations, "uint64");
    const target = temporary(context, node, "Float64");
    operations.push({
      kind: "float64.buffer.get",
      target,
      buffer: buffer.name,
      bufferType: buffer.type,
      index: index.name,
    });
    return { name: target, type: "Float64" };
  }
  expect(
    context,
    node,
    nodeType(node) === "AST_Binary",
    "unsupported " + nodeType(node) + " binary64 expression",
  );
  return lowerBinary(node, context, operations, expectedType);
}

function bufferSet(assign, context, operator = "=") {
  const operations = [];
  const buffer = lowerExpression(assign.expression, context, operations);
  expect(
    context,
    assign.expression,
    BUFFER_TYPES.has(buffer.type),
    "binary64 buffer assignment requires a Float64Buffer or Float64Record",
  );
  const index = lowerExpression(assign.property, context, operations, "uint64");
  let value = lowerExpression(assign.assignment, context, operations, "Float64");
  if (operator !== "=") {
    const current = temporary(context, assign, "Float64");
    operations.push({
      kind: "float64.buffer.get",
      target: current,
      buffer: buffer.name,
      bufferType: buffer.type,
      index: index.name,
    });
    const target = temporary(context, assign, "Float64");
    operations.push({
      kind: "float64.binary",
      operation: { "+=": "add", "-=": "sub", "*=": "mul", "/=": "div" }[
        operator
      ],
      target,
      left: current,
      right: value.name,
    });
    value = { name: target, type: "Float64" };
  }
  operations.push({
    kind: "float64.buffer.set",
    buffer: buffer.name,
    bufferType: buffer.type,
    index: index.name,
    value: value.name,
  });
  context.mutatedBuffers.add(buffer.name);
  return operations;
}

function assign(statement, context) {
  const node = statement.body;
  let declaredType;
  let targetNode;
  let rightNode;
  let operator;
  if (nodeType(node) === "AST_AnnotatedAssignment") {
    expect(
      context,
      node.target,
      nodeType(node.target) === "AST_SymbolRef",
      "binary64 local annotations require a local-name target",
    );
    expect(
      context,
      node,
      node.value !== null && node.value !== undefined,
      "binary64 local annotations require an initializer",
    );
    const annotation = node.annotation;
    const raw = nodeType(annotation) === "AST_SymbolRef" ||
      nodeType(annotation) === "AST_String"
      ? annotation.name ?? annotation.value
      : undefined;
    declaredType = raw === "float" || raw === "Float64"
      ? "Float64"
      : raw === "uint64"
        ? "uint64"
        : raw === "Float64Buffer"
          ? "Float64Buffer"
          : raw === "Float64Record"
            ? "Float64Record"
            : undefined;
    expect(
      context,
      annotation,
      declaredType !== undefined,
      "binary64 local annotation must be float, Float64, uint64, " +
        "Float64Buffer, or Float64Record",
    );
    targetNode = node.target;
    rightNode = node.value;
    operator = "=";
  } else if (
    nodeType(node) === "AST_ItemAccess" && node.assignment !== undefined
  ) {
    return bufferSet(node, context, node.operator || "=");
  } else {
    expect(
      context,
      statement,
      nodeType(statement) === "AST_SimpleStatement" &&
        nodeType(node) === "AST_Assign",
      "binary64 assignment expected",
    );
    if (nodeType(node.left) === "AST_ItemAccess") {
      const item = node.left;
      item.assignment = node.right;
      return bufferSet(item, context, node.operator);
    }
    targetNode = node.left;
    rightNode = node.right;
    operator = node.operator;
  }
  expect(
    context,
    targetNode,
    nodeType(targetNode) === "AST_SymbolRef",
    "binary64 assignments require a local-name or indexed target",
  );
  const operations = [];
  const target = targetNode.name;
  if (operator === "=") {
    const desired = context.variables.get(target);
    const value = lowerExpression(
      rightNode,
      context,
      operations,
      declaredType ?? desired,
    );
    expect(
      context,
      rightNode,
      declaredType === undefined || value.type === declaredType,
      "local " + target + " declares " + declaredType +
        ", got " + value.type,
    );
    ensureVariable(context, targetNode, target, value.type);
    operations.push({
      kind: value.type === "Float64"
        ? "float64.copy"
        : value.type === "uint64"
          ? "uint64.copy"
          : "float64.buffer.copy",
      target,
      source: value.name,
      type: value.type,
    });
  } else {
    expect(
      context,
      node,
      ["+=", "-=", "*=", "/="].includes(operator) &&
        context.variables.get(target) === "Float64" &&
        context.initialized.has(target),
      "unsupported binary64 augmented assignment " + operator,
    );
    const value = lowerExpression(rightNode, context, operations, "Float64");
    operations.push({
      kind: "float64.binary",
      operation: { "+=": "add", "-=": "sub", "*=": "mul", "/=": "div" }[
        operator
      ],
      target,
      left: target,
      right: value.name,
    });
  }
  context.initialized.add(target);
  return operations;
}

function lowerRange(node, context) {
  expect(
    context,
    node,
    nodeType(node) === "AST_Call" &&
      nodeType(node.expression) === "AST_SymbolRef" &&
      node.expression.name === "range",
    "binary64 for loops require range(...)" ,
  );
  const args = array(node.args);
  expect(
    context,
    node,
    args.length === 1 || args.length === 2,
    "binary64 range accepts one or two arguments",
  );
  const operations = [];
  const start = args.length === 1
    ? emitUint64Constant(context, node, operations, "0")
    : lowerExpression(args[0], context, operations, "uint64");
  const stop = lowerExpression(args[args.length - 1], context, operations, "uint64");
  return { operations, start: start.name, stop: stop.name };
}

function lowerBlock(block, context) {
  const statements = nodeType(block) === "AST_BlockStatement"
    ? array(block.body)
    : Array.isArray(block) ? block : [block];
  const result = [];
  for (const statement of statements) {
    if (nodeType(statement) === "AST_EmptyStatement") continue;
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
        nodeType(statement.init) === "AST_SymbolRef",
        "binary64 range index must be a local name",
      );
      const range = lowerRange(statement.object, context);
      const index = statement.init.name;
      ensureVariable(context, statement.init, index, "uint64");
      const before = new Set(context.initialized);
      context.initialized.add(index);
      const body = lowerBlock(statement.body, context);
      context.initialized = before;
      const operation = {
        kind: "loop.range",
        index,
        start: range.start,
        stop: range.stop,
        step: 1,
        body,
      };
      annotateOperations(range.operations, sourceSpan(statement, context.filename));
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(...range.operations, operation);
      continue;
    }
    if (nodeType(statement) === "AST_Return") {
      const operations = [];
      const value = lowerExpression(
        statement.value,
        context,
        operations,
        context.returnType,
      );
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

function mutationRoots(statements, aliases, result) {
  function addAliases(target, sources) {
    const current = aliases.get(target) || new Set();
    const before = current.size;
    for (const source of sources) current.add(source);
    aliases.set(target, current);
    return current.size !== before;
  }
  let changed = false;
  for (const statement of statements) {
    if (statement.kind === "float64.buffer.copy") {
      changed = addAliases(
        statement.target,
        aliases.get(statement.source) || new Set([statement.source]),
      ) || changed;
    } else if (statement.kind === "float64.record.view") {
      changed = addAliases(
        statement.target,
        aliases.get(statement.buffer) || new Set([statement.buffer]),
      ) || changed;
    } else if (statement.kind === "float64.buffer.set") {
      const roots = aliases.get(statement.buffer) || new Set([statement.buffer]);
      for (const root of roots) result.add(root);
    } else if (statement.kind === "loop.range") {
      // A buffer variable may rotate through several borrowed parameters in a
      // loop (double buffering). Iterate the finite alias lattice to a fixed
      // point before reporting externally visible writes.
      let nestedChanged;
      do {
        nestedChanged = mutationRoots(statement.body, aliases, result);
        changed = nestedChanged || changed;
      } while (nestedChanged);
    }
  }
  return changed;
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
  const aliases = new Map(
    signature.params
      .filter((param) => param.type === "Float64Buffer")
      .map((param) => [param.name, new Set([param.name])]),
  );
  const mutated = new Set();
  mutationRoots(body, aliases, mutated);
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
      storage: BUFFER_TYPES.has(type) ? "borrowed-view" : "local",
    })),
    dependencies: [],
    optimizations: {},
    analysis: {
      representation: "IEEE-754 binary64 with borrowed packed buffers",
      backend: { kind: "native-double-buffer" },
      effects: {
        pure: mutated.size === 0,
        mutates: Array.from(mutated).sort(),
        mayRaise: ["IndexError", "ZeroDivisionError", "ValueError"],
      },
    },
    body,
  };
}

function isFloat64Signature(signature) {
  return signature.returnType === "Float64" &&
    signature.params.every((param) =>
      ["Float64", "uint64", "Float64Buffer"].includes(param.type)
    );
}

module.exports = {
  isFloat64Signature,
  lowerFloat64Function,
  numericLiteral,
};
