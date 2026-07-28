"use strict";

const createCompiler = require("../..");

const IR_VERSION = 0;
const PARENT_ELEMENT_TYPES = new Map([
  ["RealField", "RealNumber"],
  ["ComplexField", "ComplexNumber"],
]);
const SUPPORTED_ARGUMENT_TYPES = new Set([
  ...PARENT_ELEMENT_TYPES.keys(),
  "uint64",
]);
const BINARY_OPERATIONS = new Map([
  ["+", "add"],
  ["-", "sub"],
  ["*", "mul"],
  ["/", "div"],
]);

function fail(message) {
  throw new Error(`native kernel: ${message}`);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function nodeType(node) {
  return node?.constructor?.name;
}

function isCIdentifier(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function array(value) {
  return Array.from(value || []);
}

function assignment(statement, description) {
  expect(
    nodeType(statement) === "AST_SimpleStatement" &&
      nodeType(statement.body) === "AST_Assign" &&
      statement.body.operator === "=",
    `expected ${description} to be a simple assignment`,
  );
  return statement.body;
}

function lowerConstant(node, parentName, elementType, description) {
  expect(
    nodeType(node) === "AST_Call" &&
      nodeType(node.expression) === "AST_SymbolRef" &&
      node.expression.name === parentName,
    `expected ${description} to call field argument ${parentName}`,
  );
  const args = array(node.args);
  if (elementType === "RealNumber") {
    expect(
      args.length === 1 && nodeType(args[0]) === "AST_String",
      `expected ${description} to contain one decimal string literal`,
    );
    return { value: args[0].value };
  }
  expect(
    args.length === 2 &&
      nodeType(args[0]) === "AST_String" &&
      nodeType(args[1]) === "AST_String",
    `expected ${description} to contain two decimal string literals`,
  );
  return { real: args[0].value, imag: args[1].value };
}

function lowerBinary(statement, localTypes, elementType) {
  const update = assignment(statement, "native loop operation");
  expect(
    nodeType(update.left) === "AST_SymbolRef" &&
      nodeType(update.right) === "AST_Binary",
    "expected local = left <op> right in native loop",
  );
  const operation = BINARY_OPERATIONS.get(update.right.operator);
  expect(
    operation !== undefined,
    `unsupported native binary operator ${update.right.operator}`,
  );
  expect(
    nodeType(update.right.left) === "AST_SymbolRef" &&
      nodeType(update.right.right) === "AST_SymbolRef",
    "native arithmetic operands must be local names",
  );
  const target = update.left.name;
  const left = update.right.left.name;
  const right = update.right.right.name;
  expect(
    localTypes.get(left) === elementType &&
      localTypes.get(right) === elementType,
    `native arithmetic currently requires ${elementType} operands`,
  );
  if (localTypes.has(target)) {
    expect(
      localTypes.get(target) === elementType,
      `native local ${target} changed type`,
    );
  } else {
    localTypes.set(target, elementType);
  }
  return {
    kind:
      elementType === "RealNumber" ? "real.binary" : "complex.binary",
    operation,
    target,
    left,
    right,
  };
}

function annotationName(annotation, description) {
  expect(annotation !== undefined && annotation !== null, `${description} is missing`);
  if (
    nodeType(annotation) === "AST_SymbolRef" ||
    nodeType(annotation) === "AST_String"
  ) {
    return annotation.name ?? annotation.value;
  }
  fail(`${description} must be a simple type name`);
}

function lowerFunction(fn) {
  expect(
    isCIdentifier(fn.name.name),
    "native function names must also be C identifiers",
  );
  const args = array(fn.argnames);
  const params = args.map((arg) => {
    const type = annotationName(
      arg.annotation,
      `native argument ${fn.name.name}.${arg.name} annotation`,
    );
    expect(
      isCIdentifier(arg.name),
      `native argument ${arg.name} must also be a C identifier`,
    );
    expect(
      SUPPORTED_ARGUMENT_TYPES.has(type),
      `unsupported native argument type ${type}`,
    );
    return { name: arg.name, type };
  });
  const parentParams = params.filter((param) =>
    PARENT_ELEMENT_TYPES.has(param.type),
  );
  const iterationParams = params.filter((param) => param.type === "uint64");
  expect(
    parentParams.length === 1 && iterationParams.length === 1,
    "Native Kernel v0 requires one supported field and one uint64 argument",
  );
  const parent = parentParams[0];
  const elementType = PARENT_ELEMENT_TYPES.get(parent.type);
  const returnType = annotationName(
    fn.return_annotation,
    `native function ${fn.name.name} return annotation`,
  );
  expect(
    returnType === elementType,
    `${fn.name.name} with ${parent.type} must return ${elementType}`,
  );
  const parentName = parent.name;
  const iterationName = iterationParams[0].name;
  const localTypes = new Map();
  const body = [];
  let returned;

  for (const statement of array(fn.body)) {
    if (nodeType(statement) === "AST_SimpleStatement") {
      const init = assignment(statement, "native local initializer");
      expect(
        nodeType(init.left) === "AST_SymbolRef",
        "native local initializer needs a local name",
      );
      const target = init.left.name;
      expect(
        isCIdentifier(target),
        `native local ${target} must also be a C identifier`,
      );
      expect(!localTypes.has(target), `native local ${target} is redefined`);
      const value = lowerConstant(
        init.right,
        parentName,
        elementType,
        `initializer for ${target}`,
      );
      localTypes.set(target, elementType);
      body.push({
        kind:
          elementType === "RealNumber"
            ? "real.constant"
            : "complex.constant",
        target,
        parent: parentName,
        ...value,
      });
      continue;
    }

    if (nodeType(statement) === "AST_ForIn") {
      expect(
        nodeType(statement.init) === "AST_SymbolRef",
        "native range loop needs a local index",
      );
      expect(
        isCIdentifier(statement.init.name),
        `native loop index ${statement.init.name} must be a C identifier`,
      );
      expect(
        !localTypes.has(statement.init.name) &&
          !params.some((param) => param.name === statement.init.name),
        `native loop index ${statement.init.name} conflicts with a value`,
      );
      expect(
        nodeType(statement.object) === "AST_Call" &&
          nodeType(statement.object.expression) === "AST_SymbolRef" &&
          statement.object.expression.name === "range",
        "native loop must use range(iterations)",
      );
      const rangeArgs = array(statement.object.args);
      expect(
        rangeArgs.length === 1 &&
          nodeType(rangeArgs[0]) === "AST_SymbolRef" &&
          rangeArgs[0].name === iterationName,
        `native loop must use range(${iterationName})`,
      );
      const loopBody = array(statement.body?.body).map((item) =>
        lowerBinary(item, localTypes, elementType),
      );
      expect(loopBody.length > 0, "native loop body cannot be empty");
      body.push({
        kind: "loop.range",
        index: statement.init.name,
        count: iterationName,
        body: loopBody,
      });
      continue;
    }

    if (nodeType(statement) === "AST_Return") {
      expect(returned === undefined, "native function has multiple returns");
      expect(
        nodeType(statement.value) === "AST_SymbolRef" &&
          localTypes.get(statement.value.name) === elementType,
        `native function must return a ${elementType} local`,
      );
      returned = statement.value.name;
      body.push({ kind: "return", value: returned });
      continue;
    }

    fail(
      `unsupported ${nodeType(statement)} in native function ${fn.name.name}`,
    );
  }

  expect(returned !== undefined, `${fn.name.name} has no return`);
  expect(
    body[body.length - 1]?.kind === "return",
    "native return must be the final statement",
  );
  const locals = Array.from(localTypes, ([name, type]) => ({
    name,
    type,
    storage: name === returned ? "return" : "local",
  }));
  return {
    name: fn.name.name,
    params,
    returnType: elementType,
    locals,
    body,
  };
}

function lowerSource(source, filename) {
  const compiler = createCompiler();
  const toplevel = compiler.parse(source, {
    filename,
    jsage: true,
  });
  const functions = array(toplevel.body).map((statement) => {
    expect(
      nodeType(statement) === "AST_Function",
      "native kernel source may only contain function definitions",
    );
    return lowerFunction(statement);
  });
  expect(functions.length > 0, "native kernel source defines no functions");
  return {
    version: IR_VERSION,
    functions,
  };
}

module.exports = {
  IR_VERSION,
  lowerSource,
};
