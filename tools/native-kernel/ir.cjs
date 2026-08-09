"use strict";

const createCompiler = require("../..");
const { analyzeExactModule } = require("./exact-analysis.cjs");
const {
  canonicalType,
  isIntegerSignature,
  lowerIntegerFunction,
  signatureFromFunction,
} = require("./integer-ir.cjs");
const {
  isFloat64Signature,
  lowerFloat64Function,
} = require("./float64-ir.cjs");
const {
  isPrimeFieldIntrinsicFunction,
  isPrimeFieldSignature,
  lowerPrimeFieldFunction,
} = require("./prime-field-ir.cjs");
const {
  lowerPrimeSourceFunction,
} = require("./prime-source-ir.cjs");
const {
  finalizeFunctionProvenance,
} = require("./provenance.cjs");
const { loadRegistry: loadFfiRegistry } = require("../ffi/declarations.cjs");

const IR_VERSION = 18;
const MAX_SMALL_POWER = 64n;
const MAX_SAFE_START = BigInt(Number.MAX_SAFE_INTEGER);
const PARENT_ELEMENT_TYPES = new Map([
  ["RealField", "RealNumber"],
  ["ComplexField", "ComplexNumber"],
]);
const SUPPORTED_ARGUMENT_TYPES = new Set([
  ...PARENT_ELEMENT_TYPES.keys(),
  "Integer",
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
      nodeType(statement.body) === "AST_Assign",
    `expected ${description} to be a simple assignment`,
  );
  return statement.body;
}

function integerLiteral(node) {
  if (
    nodeType(node) === "AST_UnaryPrefix" &&
    node.operator === "-"
  ) {
    const magnitude = integerLiteral(node.expression);
    return magnitude === undefined ? undefined : -magnitude;
  }
  if (nodeType(node) === "AST_Number") {
    const value = String(node.value);
    return /^[0-9]+$/.test(value) ? BigInt(value) : undefined;
  }
  if (
    nodeType(node) !== "AST_Call" ||
    nodeType(node.expression) !== "AST_SymbolRef" ||
    node.expression.name !== "Integer"
  ) {
    return undefined;
  }
  const args = array(node.args);
  if (
    args.length !== 1 ||
    nodeType(args[0]) !== "AST_String" ||
    !/^[+-]?[0-9]+$/.test(args[0].value)
  ) {
    return undefined;
  }
  return BigInt(args[0].value);
}

function decimalLiteral(node) {
  if (nodeType(node) === "AST_String") return node.value;
  const integer = integerLiteral(node);
  return integer === undefined ? undefined : integer.toString();
}

function annotationName(annotation, description) {
  expect(
    annotation !== undefined && annotation !== null,
    `${description} is missing`,
  );
  if (
    nodeType(annotation) === "AST_SymbolRef" ||
    nodeType(annotation) === "AST_String"
  ) {
    return annotation.name ?? annotation.value;
  }
  fail(`${description} must be a simple type name`);
}

function ensureLocal(context, name) {
  expect(isCIdentifier(name), `native local ${name} must also be a C identifier`);
  expect(
    !context.paramNames.has(name) && !context.scalarTypes.has(name),
    `native local ${name} conflicts with a scalar or argument`,
  );
  if (context.localTypes.has(name)) {
    expect(
      context.localTypes.get(name) === context.elementType,
      `native local ${name} changed type`,
    );
  } else {
    context.localTypes.set(name, context.elementType);
  }
  return name;
}

function temporary(context) {
  let name;
  do {
    name = `sagejs_native_tmp_${context.nextTemporary}`;
    context.nextTemporary += 1;
  } while (
    context.localTypes.has(name) ||
    context.paramNames.has(name) ||
    context.scalarTypes.has(name)
  );
  return ensureLocal(context, name);
}

function elementKind(context, suffix) {
  const prefix =
    context.elementType === "RealNumber"
      ? "real"
      : context.elementType === "ComplexNumber"
        ? "complex"
        : "integer";
  return `${prefix}.${suffix}`;
}

function lowerFieldCall(node, target, context, operations) {
  expect(
    nodeType(node) === "AST_Call" &&
      nodeType(node.expression) === "AST_SymbolRef" &&
      node.expression.name === context.parentName,
    `expected an expression coercible through field argument ${context.parentName}`,
  );
  const args = array(node.args);
  ensureLocal(context, target);

  if (
    args.length === 1 &&
    nodeType(args[0]) === "AST_SymbolRef" &&
    context.scalarTypes.get(args[0].name) === "uint64"
  ) {
    operations.push({
      kind: elementKind(context, "from_uint64"),
      target,
      parent: context.parentName,
      source: args[0].name,
    });
    return;
  }

  if (context.elementType === "RealNumber") {
    const value = args.length === 1 ? decimalLiteral(args[0]) : undefined;
    expect(
      value !== undefined,
      `expected ${context.parentName}(decimal literal or uint64 value)`,
    );
    operations.push({
      kind: "real.constant",
      target,
      parent: context.parentName,
      value,
    });
    return;
  }

  const real = args.length >= 1 ? decimalLiteral(args[0]) : undefined;
  const imag = args.length === 1 ? "0" : decimalLiteral(args[1]);
  expect(
    (args.length === 1 || args.length === 2) &&
      real !== undefined &&
      imag !== undefined,
    `expected ${context.parentName}(real literal[, imaginary literal])`,
  );
  operations.push({
    kind: "complex.constant",
    target,
    parent: context.parentName,
    real,
    imag,
  });
}

function lowerOperand(node, context, operations) {
  if (
    nodeType(node) === "AST_SymbolRef" &&
    context.localTypes.get(node.name) === context.elementType
  ) {
    return node.name;
  }
  if (
    context.elementType === "Integer" &&
    nodeType(node) === "AST_SymbolRef" &&
    context.scalarTypes.get(node.name) === "uint64"
  ) {
    let target = context.scalarCoercions.get(node.name);
    if (target === undefined) {
      target = temporary(context);
      context.scalarCoercions.set(node.name, target);
      operations.push({
        kind: "integer.from_uint64",
        target,
        source: node.name,
      });
    }
    return target;
  }
  const target = temporary(context);
  lowerExpression(node, target, context, operations);
  return target;
}

function lowerExpression(node, target, context, operations) {
  ensureLocal(context, target);

  if (context.elementType === "Integer") {
    const value = integerLiteral(node);
    if (value !== undefined) {
      operations.push({
        kind: "integer.constant",
        target,
        value: value.toString(),
      });
      return;
    }
    if (
      nodeType(node) === "AST_SymbolRef" &&
      context.scalarTypes.get(node.name) === "uint64"
    ) {
      operations.push({
        kind: "integer.from_uint64",
        target,
        source: node.name,
      });
      return;
    }
  }

  if (
    nodeType(node) === "AST_Call" &&
    nodeType(node.expression) === "AST_SymbolRef" &&
    node.expression.name === context.parentName
  ) {
    lowerFieldCall(node, target, context, operations);
    return;
  }

  if (nodeType(node) === "AST_SymbolRef") {
    expect(
      context.localTypes.get(node.name) === context.elementType,
      `native value ${node.name} is not a ${context.elementType} local`,
    );
    operations.push({
      kind: elementKind(context, "copy"),
      target,
      source: node.name,
    });
    return;
  }

  expect(
    nodeType(node) === "AST_Binary",
    `unsupported ${nodeType(node)} native expression`,
  );
  if (node.operator === "**") {
    const exponent = integerLiteral(node.right);
    expect(
      exponent !== undefined && exponent >= 0n && exponent <= MAX_SMALL_POWER,
      `native powers require a nonnegative integer exponent at most ${MAX_SMALL_POWER}`,
    );
    const base = lowerOperand(node.left, context, operations);
    operations.push({
      kind: elementKind(context, "pow_uint"),
      target,
      base,
      exponent: Number(exponent),
    });
    return;
  }

  const operation = BINARY_OPERATIONS.get(node.operator);
  expect(
    operation !== undefined &&
      !(context.elementType === "Integer" && operation === "div"),
    `unsupported native binary operator ${node.operator}`,
  );
  const left = lowerOperand(node.left, context, operations);
  const right = lowerOperand(node.right, context, operations);
  operations.push({
    kind: elementKind(context, "binary"),
    operation,
    target,
    left,
    right,
  });
}

function lowerAssignment(statement, context, description) {
  const update = assignment(statement, description);
  expect(
    nodeType(update.left) === "AST_SymbolRef",
    "native assignments require a local-name target",
  );
  const target = update.left.name;
  const operations = [];

  if (update.operator === "=") {
    lowerExpression(update.right, target, context, operations);
    return operations;
  }

  const symbol = update.operator.endsWith("=")
    ? update.operator.slice(0, -1)
    : "";
  const operation = BINARY_OPERATIONS.get(symbol);
  expect(
    operation !== undefined,
    `unsupported native augmented operator ${update.operator}`,
  );
  expect(
    context.localTypes.get(target) === context.elementType,
    `native augmented target ${target} is not initialized`,
  );
  const right = lowerOperand(update.right, context, operations);
  operations.push({
    kind: elementKind(context, "binary"),
    operation,
    target,
    left: target,
    right,
  });
  return operations;
}

function lowerRange(node, iterationName) {
  expect(
    nodeType(node) === "AST_Call" &&
      nodeType(node.expression) === "AST_SymbolRef" &&
      node.expression.name === "range",
    "native loop must use range(...) ",
  );
  const args = array(node.args);
  if (
    args.length === 1 &&
    nodeType(args[0]) === "AST_SymbolRef" &&
    args[0].name === iterationName
  ) {
    return { start: 0, count: iterationName };
  }

  const start = args.length === 2 ? integerLiteral(args[0]) : undefined;
  const stop = args[1];
  let stopName;
  let stopOffset;
  if (nodeType(stop) === "AST_Binary" && stop.operator === "+") {
    if (nodeType(stop.left) === "AST_SymbolRef") {
      stopName = stop.left.name;
      stopOffset = integerLiteral(stop.right);
    } else if (nodeType(stop.right) === "AST_SymbolRef") {
      stopName = stop.right.name;
      stopOffset = integerLiteral(stop.left);
    }
  }
  expect(
    start !== undefined &&
      start >= 0n &&
      start <= MAX_SAFE_START &&
      stopName === iterationName &&
      stopOffset === start,
    `native two-argument loop must use range(k, ${iterationName} + k) ` +
      "with a nonnegative safe integer k",
  );
  return { start: Number(start), count: iterationName };
}

function nativeDecorator(fn) {
  const decorators = array(fn.decorators);
  const marked = decorators.filter(
    (decorator) =>
      nodeType(decorator.expression) === "AST_SymbolRef" &&
      decorator.expression.name === "native",
  );
  if (marked.length === 0) return false;
  expect(
    decorators.length === 1,
    "@native cannot currently be combined with other decorators",
  );
  return true;
}

function hoistSyntheticConstants(operations) {
  const writes = new Map();
  for (const operation of operations) {
    if (operation.target !== undefined) {
      writes.set(operation.target, (writes.get(operation.target) || 0) + 1);
    }
  }
  const hoisted = [];
  const body = [];
  for (const operation of operations) {
    if (
      (operation.kind === "real.constant" ||
        operation.kind === "complex.constant" ||
        operation.kind === "integer.constant") &&
      operation.target.startsWith("sagejs_native_tmp_") &&
      writes.get(operation.target) === 1
    ) {
      hoisted.push(operation);
    } else {
      body.push(operation);
    }
  }
  return { body, hoisted };
}

function lowerLegacyFunction(fn, decorated = false) {
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
  const integerParams = params.filter((param) => param.type === "Integer");
  const iterationParams = params.filter((param) => param.type === "uint64");
  const returnType = annotationName(
    fn.return_annotation,
    `native function ${fn.name.name} return annotation`,
  );
  let elementType;
  let parent;
  if (returnType === "Integer") {
    expect(
      parentParams.length === 0 &&
        integerParams.length === 0 &&
        iterationParams.length === 1 &&
        params.length === 1,
      "an Integer native kernel currently requires exactly one uint64 argument",
    );
    elementType = "Integer";
  } else {
    expect(
      parentParams.length === 1 &&
        integerParams.length === 0 &&
        iterationParams.length === 1 &&
        params.length === 2,
      "a real or complex native kernel requires one supported field and one uint64 argument",
    );
    parent = parentParams[0];
    elementType = PARENT_ELEMENT_TYPES.get(parent.type);
    expect(
      returnType === elementType,
      `${fn.name.name} with ${parent.type} must return ${elementType}`,
    );
  }
  const iterationName = iterationParams[0].name;
  const context = {
    elementType,
    localTypes: new Map(),
    nextTemporary: 0,
    paramNames: new Set(params.map((param) => param.name)),
    parentName: parent?.name,
    scalarCoercions: new Map(),
    scalarTypes: new Map(
      params
        .filter((param) => param.type === "uint64")
        .map((param) => [param.name, param.type]),
    ),
  };
  const body = [];
  let returned;

  for (const statement of array(fn.body)) {
    if (nodeType(statement) === "AST_SimpleStatement") {
      body.push(
        ...lowerAssignment(statement, context, "native assignment"),
      );
      continue;
    }

    if (nodeType(statement) === "AST_ForIn") {
      expect(
        nodeType(statement.init) === "AST_SymbolRef",
        "native range loop needs a local index",
      );
      const index = statement.init.name;
      expect(
        isCIdentifier(index),
        `native loop index ${index} must be a C identifier`,
      );
      expect(
        !context.localTypes.has(index) &&
          !context.paramNames.has(index) &&
          !context.scalarTypes.has(index),
        `native loop index ${index} conflicts with a value`,
      );
      const range = lowerRange(statement.object, iterationName);
      context.scalarTypes.set(index, "uint64");
      context.scalarCoercions = new Map();
      const loopBody = [];
      for (const item of array(statement.body?.body)) {
        loopBody.push(
          ...lowerAssignment(item, context, "native loop operation"),
        );
      }
      expect(loopBody.length > 0, "native loop body cannot be empty");
      const optimized = hoistSyntheticConstants(loopBody);
      body.push(...optimized.hoisted);
      body.push({
        kind: "loop.range",
        index,
        ...range,
        body: optimized.body,
      });
      continue;
    }

    if (nodeType(statement) === "AST_Return") {
      expect(returned === undefined, "native function has multiple returns");
      expect(
        nodeType(statement.value) === "AST_SymbolRef" &&
          context.localTypes.get(statement.value.name) === elementType,
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
  const locals = Array.from(context.localTypes, ([name, type]) => ({
    name,
    type,
    storage: name === returned ? "return" : "local",
  }));
  return {
    name: fn.name.name,
    decorated,
    kernelKind: elementType === "RealNumber"
      ? "real-field"
      : elementType === "ComplexNumber"
        ? "complex-field"
        : "integer",
    sourceTransparent: true,
    params,
    returnType: elementType,
    locals,
    body,
  };
}

function isEmptyDecoratorStatement(statement) {
  return (
    nodeType(statement) === "AST_SimpleStatement" &&
    nodeType(statement.body) === "AST_EmptyStatement"
  );
}

function supportedModulePreamble(statement) {
  if (isEmptyDecoratorStatement(statement) ||
      nodeType(statement) === "AST_EmptyStatement") return true;
  if (nodeType(statement) !== "AST_Imports") return false;
  return array(statement.imports).every((item) => {
    const moduleName = item.module?.name;
    const names = array(item.argnames).map((arg) => arg.name);
    return (
      moduleName === "math" && names.every((name) => name === "sqrt")
    ) || (
      moduleName === "typing" && names.every((name) => name === "Tuple")
    ) || (
      typeof item.key === "string" && item.key.startsWith("sagejs.ffi.")
    );
  });
}

function ffiImports(topLevel, filename) {
  const registry = loadFfiRegistry();
  const imports = new Map();
  for (const statement of topLevel) {
    if (nodeType(statement) !== "AST_Imports") continue;
    for (const item of array(statement.imports)) {
      const moduleName = item.key;
      if (typeof moduleName !== "string" ||
          !moduleName.startsWith("sagejs.ffi.")) continue;
      const library = registry.byModule.get(moduleName);
      expect(
        library !== undefined,
        `${filename} imports undeclared FFI module ${moduleName}`,
      );
      expect(!item.star, "native FFI imports may not use star imports");
      for (const imported of array(item.argnames)) {
        const declaration = library.byPythonName.get(imported.name);
        expect(
          declaration !== undefined,
          `${moduleName} has no declared FFI function ${imported.name}`,
        );
        const localName = imported.alias?.name || imported.name;
        expect(
          !imports.has(localName),
          `duplicate native FFI import name ${localName}`,
        );
        imports.set(localName, Object.freeze({
          declarationId: declaration.declaration_id,
          declarationIdentity: declaration.declaration_identity,
          declarationHash: declaration.declaration_hash,
          library: declaration.library,
          function: {
            id: declaration.id,
            pythonName: declaration.python_name,
            signature: declaration.signature,
            dynamic: declaration.dynamic,
            native: declaration.native,
            effects: declaration.effects,
            errors: declaration.errors,
            targets: declaration.targets,
          },
          import: {
            module: moduleName,
            name: imported.name,
            localName,
          },
        }));
      }
    }
  }
  return imports;
}

async function lowerSource(source, filename, options = {}) {
  const compiler = createCompiler();
  const { createPythonCompilerFrontend } = require(
    "../../dist/tools/python/compiler-frontend.js"
  );
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  let toplevel;
  try {
    toplevel = frontend.parse(source, { filename, jsage: true });
  } finally {
    frontend.close();
  }

  const topLevel = array(toplevel.body);
  const foreignFunctions = ffiImports(topLevel, filename);
  const definitions = topLevel.filter(
    (statement) => nodeType(statement) === "AST_Function",
  );
  const decorated = definitions.filter(nativeDecorator);
  let selectedDefinitions;
  if (Array.isArray(options.functions) && options.functions.length > 0) {
    const requested = new Set(options.functions);
    selectedDefinitions = definitions.filter((fn) =>
      requested.has(fn.name.name)
    );
    const found = new Set(selectedDefinitions.map((fn) => fn.name.name));
    const missing = Array.from(requested).filter((name) => !found.has(name));
    expect(
      missing.length === 0,
      `requested native functions are not defined: ${missing.join(", ")}`,
    );
  } else if (decorated.length > 0) {
    selectedDefinitions = decorated;
  } else {
    selectedDefinitions = topLevel
      .filter((statement) => !supportedModulePreamble(statement))
      .map((statement) => {
        expect(
          nodeType(statement) === "AST_Function",
          "native kernel source without @native may only contain " +
            "function definitions",
        );
        return statement;
      });
  }
  expect(
    selectedDefinitions.length > 0,
    "native kernel source defines no functions",
  );
  const decoratedMode = decorated.length > 0 &&
    !(Array.isArray(options.functions) && options.functions.length > 0);
  const signatures = new Map();
  const initiallySelected = new Set(
    selectedDefinitions.map((fn) => fn.name.name),
  );
  // Record every supported signature before lowering a selected subset.  A
  // requested function may call an unrequested helper, and that helper must
  // be compiled into the same native dependency graph rather than becoming
  // an unresolved call or a name-based intrinsic.
  for (const fn of definitions) {
    const returnType = canonicalType(fn.return_annotation);
    const paramTypes = array(fn.argnames).map((arg) =>
      canonicalType(arg.annotation)
    );
    const completeSignature = returnType !== undefined &&
      paramTypes.every((type) => type !== undefined);
    const partiallyTypedSelected = initiallySelected.has(fn.name.name) && (
      returnType !== undefined ||
      paramTypes.some((type) =>
        type === "Integer" || type === "bool" || type === "Float64" ||
        type === "Float64Buffer" || type === "Int64Buffer" ||
        type === "Int64Record" || type === "IntegerBuffer" ||
        type === "UInt64Buffer"
      )
    );
    if (completeSignature || partiallyTypedSelected) {
      const signature = signatureFromFunction(fn, filename);
      expect(
        isIntegerSignature(signature) || isFloat64Signature(signature) ||
          isPrimeFieldSignature(signature),
        `${fn.name.name} is not a supported native signature`,
      );
      signatures.set(signature.name, signature);
    }
  }
  for (const name of foreignFunctions.keys()) {
    expect(
      !signatures.has(name),
      `native function ${name} conflicts with an imported FFI function`,
    );
  }
  function lowerDefinition(fn) {
    const signature = signatures.get(fn.name.name);
    return signature === undefined
      ? lowerLegacyFunction(fn, decoratedMode)
      : isFloat64Signature(signature)
        ? lowerFloat64Function(
            fn,
            signature,
            filename,
            decoratedMode,
          )
        : isPrimeFieldSignature(signature)
        ? isPrimeFieldIntrinsicFunction(fn)
          ? lowerPrimeFieldFunction(
              fn,
              signature,
              filename,
              decoratedMode,
            )
          : lowerPrimeSourceFunction(
              fn,
              signature,
              filename,
              decoratedMode,
            )
        : lowerIntegerFunction(
            fn,
            signature,
            signatures,
            foreignFunctions,
            filename,
            decoratedMode,
          );
  }
  const loweredDefinitions = [...selectedDefinitions];
  const lowered = [];
  const included = new Set(loweredDefinitions.map((fn) => fn.name.name));
  const definitionsByName = new Map(
    definitions.map((fn) => [fn.name.name, fn]),
  );
  for (let index = 0; index < loweredDefinitions.length; index += 1) {
    const result = lowerDefinition(loweredDefinitions[index]);
    lowered.push(result);
    for (const dependency of result.dependencies || []) {
      if (included.has(dependency)) continue;
      const definition = definitionsByName.get(dependency);
      expect(
        definition !== undefined,
        `${result.name} calls missing native function ${dependency}`,
      );
      included.add(dependency);
      loweredDefinitions.push(definition);
    }
  }
  const selected = analyzeExactModule(lowered).map((fn, index) => finalizeFunctionProvenance(
    fn,
    loweredDefinitions[index],
    filename,
  ));
  return {
    version: IR_VERSION,
    functions: selected,
    foreignLibraries: Array.from(new Map(
      Array.from(foreignFunctions.values(), (foreign) => [
        foreign.library.id,
        {
          id: foreign.library.id,
          declarationHash: foreign.declarationHash,
          declarationIdentity: `${foreign.library.id}@${foreign.declarationHash}`,
          pythonModule: foreign.library.python_module,
          dynamic: foreign.library.dynamic,
          native: foreign.library.native,
        },
      ]),
    ).values()).sort((left, right) => left.id.localeCompare(right.id)),
    callGraph: Object.fromEntries(
      selected.map((fn) => [fn.name, fn.dependencies || []]),
    ),
  };
}

module.exports = {
  IR_VERSION,
  lowerSource,
};
