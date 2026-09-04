"use strict";

const {
  emitFmpzForeignCall,
  resourceForFunctionType,
} = require("./ffi-codegen.cjs");
const {
  cOperationComment,
  cSourceDirective,
} = require("./provenance.cjs");
const {
  isUint64Shift,
  uint64COperator,
} = require("./uint64-operations.cjs");

function cName(name) {
  return `sagejs_${name}`;
}

function cString(value) {
  return JSON.stringify(String(value));
}

function statusFailure(kind, message, indent) {
  const code = {
    error: "SAGEJS_NATIVE_ERROR",
    type: "SAGEJS_NATIVE_TYPE_ERROR",
    range: "SAGEJS_NATIVE_RANGE_ERROR",
  }[kind];
  if (code === undefined) throw new Error(`unknown native status kind ${kind}`);
  return `${indent}sagejs_native_status_set(status, ${code}, ${cString(message)});`;
}

function fmpzValue(name, context) {
  const slot = context.storage.slots[name];
  if (slot !== undefined) return `sagejs_fmpz_scratch_${slot}`;
  if ((context.storage.borrowedLocals || []).includes(name)) return cName(name);
  if (context.storage.borrowedParameters.includes(name)) {
    return `sagejs_arg_${name}`;
  }
  if (context.resourceParameters.has(name)) return `sagejs_arg_${name}`;
  return cName(name);
}

function fmpzArgument(fn, param) {
  const name = `sagejs_arg_${param.name}`;
  if (param.type === "Integer") return `const fmpz_t ${name}`;
  if (param.type === "uint64") return `uint64_t ${name}`;
  if (param.type === "bool") return `int ${name}`;
  const resource = resourceForFunctionType(fn, param.type);
  if (resource !== undefined) return `${resource.abi_type} ${name}`;
  throw new Error(`unsupported fmpz native parameter ${param.type}`);
}

function fmpzInternalSignature(fn, prototype = false) {
  if (fn.returnType !== "Integer") {
    throw new Error(`${fn.name}: the first fmpz slice returns only Integer`);
  }
  const parameters = [
    "sagejs_native_status *status",
    "fmpz_t sagejs_native_output",
    ...fn.params.map((param) => fmpzArgument(fn, param)),
  ].join(", ");
  return `static int fmpz_native_${fn.name}(${parameters})` +
    `${prototype ? ";" : ""}`;
}

function fmpzConstant(target, value, indent) {
  let integer;
  try {
    integer = BigInt(String(value));
  } catch (_error) {
    integer = null;
  }
  if (integer !== null &&
      integer >= -2147483647n && integer <= 2147483647n) {
    return `${indent}fmpz_set_si(${target}, ${integer}L);`;
  }
  return [
    `${indent}if (fmpz_set_str(${target}, ${cString(value)}, 10) != 0)`,
    `${indent}{`,
    statusFailure("type", "invalid native integer literal", `${indent}    `),
    `${indent}    goto fail;`,
    `${indent}}`,
  ].join("\n");
}

function emitFmpzOperation(operation, context, indent) {
  const target = operation.target === undefined
    ? undefined
    : fmpzValue(operation.target, context);
  if (operation.kind === "integer.constant") {
    return fmpzConstant(target, operation.value, indent);
  }
  if (operation.kind === "uint64.constant") {
    return `${indent}${target} = UINT64_C(${operation.value});`;
  }
  if (operation.kind === "bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (operation.kind === "integer.copy") {
    return `${indent}fmpz_set(${target}, ` +
      `${fmpzValue(operation.source, context)});`;
  }
  if (operation.kind === "bool.copy" || operation.kind === "uint64.copy") {
    return `${indent}${target} = ${fmpzValue(operation.source, context)};`;
  }
  if (operation.kind === "value.discard") {
    return `${indent}(void) ${fmpzValue(operation.source, context)};`;
  }
  if (operation.kind === "integer.vector.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${fmpzValue(operation.vector, context)}.length;`;
  }
  if ([
    "integer.vector.get",
    "integer.vector.borrow",
    "integer.vector.set",
    "integer.vector.addmul",
    "integer.vector.submul",
  ].includes(operation.kind)) {
    if (operation.indexType !== "uint64") {
      throw new Error(
        `${context.fn.name}: fmpz vectors initially require uint64 indices`,
      );
    }
    const vector = fmpzValue(operation.vector, context);
    const index = fmpzValue(operation.index, context);
    let action;
    if (operation.kind === "integer.vector.get") {
      action = `fmpz_set(${target}, ${vector}.entries + sagejs_vector_position);`;
    } else if (operation.kind === "integer.vector.borrow") {
      action = `${target} = ${vector}.entries + sagejs_vector_position;`;
    } else if (operation.kind === "integer.vector.set") {
      action = `if (!sagejs_native_fmpz_vector_set(status, &${vector}, ` +
        `sagejs_vector_position, ${fmpzValue(operation.value, context)}))\n` +
        `${indent}        goto fail;`;
    } else {
      action = `if (!sagejs_native_fmpz_vector_addmul(status, &${vector}, ` +
        `sagejs_vector_position, ${fmpzValue(operation.left, context)}, ` +
        `${fmpzValue(operation.right, context)}, ` +
        `${operation.kind === "integer.vector.submul" ? 1 : 0}))\n` +
        `${indent}        goto fail;`;
    }
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_vector_position = (size_t) ${index};`,
      `${indent}    if (${index} >= (uint64_t) ${vector}.length)`,
      `${indent}    {`,
      statusFailure(
        "range",
        "NativeIntegerVector index out of range",
        `${indent}        `,
      ),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    ${action}`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.vector.swap") {
    if (operation.leftType !== "uint64" || operation.rightType !== "uint64") {
      throw new Error(
        `${context.fn.name}: fmpz vector swap initially requires uint64 indices`,
      );
    }
    const vector = fmpzValue(operation.vector, context);
    const left = fmpzValue(operation.left, context);
    const right = fmpzValue(operation.right, context);
    return [
      `${indent}if (${left} >= (uint64_t) ${vector}.length ||`,
      `${indent}    ${right} >= (uint64_t) ${vector}.length)`,
      `${indent}{`,
      statusFailure(
        "range",
        "NativeIntegerVector index out of range",
        `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}fmpz_swap(${vector}.entries + (size_t) ${left},`,
      `${indent}    ${vector}.entries + (size_t) ${right});`,
      `${indent}{`,
      `${indent}    uint64_t sagejs_charge = ` +
        `${vector}.payload_charges[(size_t) ${left}];`,
      `${indent}    ${vector}.payload_charges[(size_t) ${left}] = ` +
        `${vector}.payload_charges[(size_t) ${right}];`,
      `${indent}    ${vector}.payload_charges[(size_t) ${right}] = ` +
        `sagejs_charge;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.arena.vector.allocate") {
    const maximumBits = context.constants.get(operation.maximumBits);
    if (maximumBits !== "0") {
      throw new Error(
        `${context.fn.name}: fmpz vectors require maximum_bits == 0`,
      );
    }
    const arena = fmpzValue(operation.arena, context);
    const owner = fmpzValue(operation.owner, context);
    return [
      `${indent}if (!sagejs_native_fmpz_vector_init_in_budget(status, ` +
        `&${owner}, ${fmpzValue(operation.capacity, context)}, ` +
        `&${arena}.budget, "NativeExactArena memory limit exceeded"))`,
      `${indent}    goto fail;`,
      `${indent}${cName(operation.owner)}_initialized = 1;`,
    ].join("\n");
  }
  if (operation.kind === "integer.from_uint64") {
    return `${indent}fmpz_set_ui(${target}, ` +
      `(ulong) ${fmpzValue(operation.source, context)});`;
  }
  if (operation.kind === "integer.neg" || operation.kind === "integer.abs") {
    return `${indent}fmpz_${operation.kind.slice("integer.".length)}(` +
      `${target}, ${fmpzValue(operation.source, context)});`;
  }
  if (operation.kind === "integer.pow_uint") {
    return `${indent}fmpz_pow_ui(${target}, ` +
      `${fmpzValue(operation.base, context)}, ${operation.exponent});`;
  }
  if (operation.kind === "integer.divmod") {
    const right = fmpzValue(operation.right, context);
    return [
      `${indent}if (fmpz_is_zero(${right}))`,
      `${indent}{`,
      statusFailure(
        "range",
        "integer division or modulo by zero",
        `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}fmpz_fdiv_qr(${fmpzValue(operation.quotient, context)}, ` +
        `${fmpzValue(operation.remainder, context)}, ` +
        `${fmpzValue(operation.left, context)}, ${right});`,
    ].join("\n");
  }
  if (operation.kind === "integer.binary") {
    const left = fmpzValue(operation.left, context);
    const right = fmpzValue(operation.right, context);
    const simple = { add: "add", sub: "sub", mul: "mul" }[
      operation.operation
    ];
    if (simple !== undefined) {
      return `${indent}fmpz_${simple}(${target}, ${left}, ${right});`;
    }
    const division = { floordiv: "fdiv_q", mod: "fdiv_r" }[
      operation.operation
    ];
    if (division === undefined) {
      throw new Error(
        `${context.fn.name}: unsupported fmpz operation ${operation.operation}`,
      );
    }
    return [
      `${indent}if (fmpz_is_zero(${right}))`,
      `${indent}{`,
      statusFailure(
        "range",
        "integer division or modulo by zero",
        `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}fmpz_${division}(${target}, ${left}, ${right});`,
    ].join("\n");
  }
  if (operation.kind === "uint64.binary") {
    const left = fmpzValue(operation.left, context);
    const right = fmpzValue(operation.right, context);
    if (operation.operation === "floordiv" || operation.operation === "mod") {
      const operator = operation.operation === "floordiv" ? "/" : "%";
      return [
        `${indent}if (${right} == 0)`,
        `${indent}{`,
        statusFailure(
          "range",
          "unsigned integer division or modulo by zero",
          `${indent}    `,
        ),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${left} ${operator} ${right};`,
      ].join("\n");
    }
    const operator = uint64COperator(operation.operation);
    if (isUint64Shift(operation.operation)) {
      return [
        `${indent}if (${right} >= UINT64_C(64))`,
        `${indent}{`,
        statusFailure(
          "range",
          "uint64 shift count must be between 0 and 63",
          `${indent}    `,
        ),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${left} ${operator} (unsigned int) ${right};`,
      ].join("\n");
    }
    return `${indent}${target} = ${left} ${operator} ${right};`;
  }
  if (operation.kind === "integer.compare") {
    const comparison = {
      eq: "== 0", ne: "!= 0", lt: "< 0", le: "<= 0", gt: "> 0", ge: ">= 0",
    }[operation.operation];
    return `${indent}${target} = fmpz_cmp(` +
      `${fmpzValue(operation.left, context)}, ` +
      `${fmpzValue(operation.right, context)}) ${comparison};`;
  }
  if (operation.kind === "uint64.compare" || operation.kind === "bool.compare") {
    const operator = {
      eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=",
    }[operation.operation];
    return `${indent}${target} = ${fmpzValue(operation.left, context)} ` +
      `${operator} ${fmpzValue(operation.right, context)};`;
  }
  if (operation.kind === "bool.binary") {
    const operator = operation.operation === "and" ? "&&" : "||";
    return `${indent}${target} = ${fmpzValue(operation.left, context)} ` +
      `${operator} ${fmpzValue(operation.right, context)};`;
  }
  if (operation.kind === "bool.short_circuit") {
    const test = operation.operation === "and" ? target : `!${target}`;
    return [
      `${indent}${target} = ${fmpzValue(operation.left, context)};`,
      `${indent}if (${test})`,
      `${indent}{`,
      emitFmpzStatements(operation.right.operations, context, `${indent}    `),
      `${indent}    ${target} = ` +
        `${fmpzValue(operation.right.value, context)};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "bool.not") {
    return `${indent}${target} = !${fmpzValue(operation.source, context)};`;
  }
  if (operation.kind === "integer.truth") {
    return `${indent}${target} = !fmpz_is_zero(` +
      `${fmpzValue(operation.source, context)});`;
  }
  if (operation.kind === "uint64.truth") {
    return `${indent}${target} = ` +
      `${fmpzValue(operation.source, context)} != 0;`;
  }
  if (operation.kind === "ffi.call" ||
      operation.kind === "ffi.arena.resource.allocate") {
    return emitFmpzForeignCall(operation, {
      value: (name) => fmpzValue(name, context),
      result: (name) => fmpzValue(name, context),
      failure: "goto fail;",
      resourceInitialized: (name) => `${cName(name)}_initialized`,
    }, indent);
  }
  throw new Error(
    `${context.fn.name}: unsupported fmpz C IR operation ${operation.kind}`,
  );
}

function emitFmpzStatements(statements, context, indent) {
  const lines = [];
  for (const statement of statements) {
    const comment = cOperationComment(statement, indent);
    if (comment) lines.push(comment);
    const directive = cSourceDirective(statement);
    if (directive) lines.push(directive);
    if (statement.kind === "if") {
      lines.push(
        emitFmpzStatements(statement.condition.operations, context, indent),
        `${indent}if (${fmpzValue(statement.condition.value, context)})`,
        `${indent}{`,
        emitFmpzStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      if (statement.alternative.length > 0) {
        lines.push(
          `${indent}else`,
          `${indent}{`,
          emitFmpzStatements(statement.alternative, context, `${indent}    `),
          `${indent}}`,
        );
      }
      continue;
    }
    if (statement.kind === "while") {
      lines.push(
        `${indent}for (;;)`,
        `${indent}{`,
        emitFmpzStatements(
          statement.condition.operations,
          context,
          `${indent}    `,
        ),
        `${indent}    if (!${fmpzValue(statement.condition.value, context)})`,
        `${indent}        break;`,
        emitFmpzStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range") {
      const index = fmpzValue(statement.index, context);
      const bound = fmpzValue(statement.count, context);
      const condition = statement.boundIsStop
        ? `${index} < ${bound}`
        : `(${index} - UINT64_C(${statement.start})) < ${bound}`;
      lines.push(
        `${indent}for (${index} = UINT64_C(${statement.start}); ` +
          `${condition}; ${index} += UINT64_C(${statement.step || 1}))`,
        `${indent}{`,
        emitFmpzStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "integer.arena.scope") {
      const owner = fmpzValue(statement.owner, context);
      const lastAllocation = statement.body.findLastIndex((operation) =>
        operation.kind === "integer.arena.vector.allocate" ||
        operation.kind === "ffi.arena.resource.allocate"
      );
      const residentSetup = statement.body.slice(0, lastAllocation + 1);
      const checkpointBody = statement.body.slice(lastAllocation + 1);
      const checkpointContext = {
        ...context,
        checkpointActive: true,
        checkpointOwner: owner,
      };
      const cleanupChildren = [...statement.children].reverse().flatMap(
        (child) => {
          if (child.childKind === "foreign-resource") {
            return [
              `${indent}if (${cName(child.owner)}_initialized)`,
              `${indent}{`,
              `${indent}    ${child.clearSymbol}(` +
                `${fmpzValue(child.owner, context)});`,
              `${indent}    ${cName(child.owner)}_initialized = 0;`,
              `${indent}}`,
            ];
          }
          return [
            `${indent}if (${cName(child.owner)}_initialized)`,
            `${indent}{`,
            `${indent}    sagejs_native_fmpz_vector_clear(&` +
              `${fmpzValue(child.owner, context)});`,
            `${indent}    ${cName(child.owner)}_initialized = 0;`,
            `${indent}}`,
          ];
        },
      );
      lines.push(
        emitFmpzStatements(statement.setup, context, indent),
        `${indent}if (!sagejs_native_exact_arena_init(status, &${owner}, ` +
          `${fmpzValue(statement.memoryLimit, context)}, ` +
          `${fmpzValue(statement.temporaryLimit, context)}))`,
        `${indent}    goto fail;`,
        `${indent}${cName(statement.owner)}_initialized = 1;`,
        emitFmpzStatements(residentSetup, context, indent),
        `${indent}if (${owner}.temporary_limit > (uint64_t) SIZE_MAX ||`,
        `${indent}    !sagejs_native_gmp_checkpoint_begin(` +
          `&${owner}.checkpoint, (size_t) ${owner}.temporary_limit))`,
        `${indent}{`,
        statusFailure(
          "error",
          "NativeExactArena checkpoint allocation failed",
          `${indent}    `,
        ),
        `${indent}    goto fail;`,
        `${indent}}`,
        emitFmpzStatements(checkpointBody, checkpointContext, indent),
        ...cleanupChildren,
        ...context.checkpointCleanupSymbols.map(
          (symbol) => `${indent}${symbol}();`,
        ),
        `${indent}sagejs_native_exact_arena_clear(&${owner});`,
        `${indent}${cName(statement.owner)}_initialized = 0;`,
      );
      continue;
    }
    if (statement.kind === "return") {
      if (statement.type !== "Integer") {
        throw new Error(
          `${context.fn.name}: the first fmpz slice returns only Integer`,
        );
      }
      if (context.checkpointActive) {
        lines.push(
          `${indent}if (` +
            `${context.checkpointOwner}.checkpoint.soft_limit_exhaustions != 0 ||`,
          `${indent}    ` +
            `${context.checkpointOwner}.checkpoint.upstream_allocations != 0)`,
          `${indent}{`,
          `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RETRY,`,
          `${indent}        "NativeExactArena temporary capacity exhausted");`,
          `${indent}    goto fail;`,
          `${indent}}`,
          `${indent}sagejs_native_gmp_checkpoint_suspend();`,
        );
      }
      lines.push(
        `${indent}fmpz_set(sagejs_native_output, ` +
          `${fmpzValue(statement.value, context)});`,
      );
      if (context.checkpointActive) {
        lines.push(
          `${indent}if (!sagejs_native_gmp_checkpoint_resume())`,
          `${indent}{`,
          statusFailure(
            "error",
            "NativeExactArena checkpoint publication failed",
            `${indent}    `,
          ),
          `${indent}    goto fail;`,
          `${indent}}`,
        );
      }
      lines.push(`${indent}goto success;`);
      continue;
    }
    if (statement.kind === "raise") {
      lines.push(
        statusFailure("range", statement.message, indent),
        `${indent}goto fail;`,
      );
      continue;
    }
    lines.push(emitFmpzOperation(statement, context, indent));
  }
  return lines.filter(Boolean).join("\n");
}

function fmpzDeclarations(fn) {
  const storage = fn.analysis.storage;
  const declarations = [];
  const initialization = [];
  const cleanup = [];
  const arenaCleanup = [];
  for (let slot = 0; slot < storage.scratchSlots; slot += 1) {
    declarations.push(`    fmpz_t sagejs_fmpz_scratch_${slot};`);
    initialization.push(`    fmpz_init(sagejs_fmpz_scratch_${slot});`);
    cleanup.unshift(`    fmpz_clear(sagejs_fmpz_scratch_${slot});`);
  }
  for (const name of storage.borrowedLocals || []) {
    declarations.push(`    const fmpz *${cName(name)} = NULL;`);
  }
  for (const param of fn.params) {
    if (param.type === "Integer" ||
        resourceForFunctionType(fn, param.type) !== undefined) continue;
    declarations.push(
      `    ${param.type === "uint64" ? "uint64_t" : "int"} ` +
        `${cName(param.name)} = sagejs_arg_${param.name};`,
    );
  }
  for (const local of fn.locals) {
    if ((fn.resourceAliases || {})[local.name] !== undefined) continue;
    const resource = resourceForFunctionType(fn, local.type);
    if (resource !== undefined) {
      declarations.push(`    ${resource.abi_type} ${cName(local.name)};`);
      if (resource.ownership === "owned") {
        declarations.push(`    int ${cName(local.name)}_initialized = 0;`);
        cleanup.unshift(
          `    if (${cName(local.name)}_initialized)`,
          `        ${resource.native.clear_symbol}(${cName(local.name)});`,
        );
      }
      continue;
    }
    if (local.type === "NativeIntegerVector") {
      declarations.push(
        `    sagejs_native_fmpz_vector ${cName(local.name)} = {0};`,
        `    int ${cName(local.name)}_initialized = 0;`,
      );
      cleanup.unshift(
        `    if (${cName(local.name)}_initialized)`,
        `        sagejs_native_fmpz_vector_clear(&${cName(local.name)});`,
      );
      continue;
    }
    if (local.type === "NativeExactArena") {
      declarations.push(
        `    sagejs_native_exact_arena ${cName(local.name)} = {0};`,
        `    int ${cName(local.name)}_initialized = 0;`,
      );
      arenaCleanup.unshift(
        `    if (${cName(local.name)}_initialized)`,
        `        sagejs_native_exact_arena_clear(&${cName(local.name)});`,
      );
      continue;
    }
    if (local.type === "Integer") continue;
    if (!["uint64", "bool"].includes(local.type)) {
      throw new Error(`${fn.name}: unsupported fmpz local ${local.type}`);
    }
    declarations.push(
      `    ${local.type === "uint64" ? "uint64_t" : "int"} ` +
        `${cName(local.name)} = 0;`,
    );
  }
  const constants = new Map();
  function collect(statements) {
    for (const statement of statements || []) {
      if (statement.kind === "uint64.constant") {
        constants.set(statement.target, statement.value);
      }
      collect(statement.setup);
      collect(statement.condition?.operations);
      collect(statement.body);
      collect(statement.alternative);
      collect(statement.right?.operations);
    }
  }
  collect(fn.body);
  const context = {
    fn,
    storage,
    constants,
    checkpointCleanupSymbols: fn.checkpointCleanupSymbols || [],
    resourceParameters: new Set(
      fn.params
        .filter((param) =>
          resourceForFunctionType(fn, param.type) !== undefined
        )
        .map((param) => param.name),
    ),
  };
  for (const name of storage.mutableParameters) {
    initialization.push(
      `    fmpz_set(${fmpzValue(name, context)}, sagejs_arg_${name});`,
    );
  }
  if (arenaCleanup.length > 0 && context.checkpointCleanupSymbols.length > 0) {
    const liveCheckpoint = fn.locals
      .filter((local) => local.type === "NativeExactArena")
      .map((local) =>
        `(${cName(local.name)}_initialized && ` +
          `${cName(local.name)}.checkpoint.open)`
      )
      .join(" || ");
    cleanup.push(
      `    if (${liveCheckpoint})`,
      "    {",
      ...context.checkpointCleanupSymbols.map(
        (symbol) => `        ${symbol}();`,
      ),
      "    }",
    );
  }
  cleanup.push(...arenaCleanup);
  return { context, declarations, initialization, cleanup };
}

function emitFmpzInternalFunction(fn) {
  const { context, declarations, initialization, cleanup } =
    fmpzDeclarations(fn);
  return `${fmpzInternalSignature(fn)}
{
${declarations.join("\n")}
${initialization.join("\n")}
${emitFmpzStatements(fn.body, context, "    ")}
    sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
        "native function completed without returning");
    goto fail;

success:
${cleanup.join("\n")}
    return 1;

fail:
${cleanup.join("\n")}
    return 0;
}`;
}

function generateFmpzFunctions(functions) {
  const selected = functions.filter((fn) => fn.analysis?.backend?.kind === "fmpz");
  return {
    functions: selected.map(emitFmpzInternalFunction).join("\n\n"),
    prototypes: selected.map((fn) => fmpzInternalSignature(fn, true)).join("\n"),
    selected,
  };
}

module.exports = {
  emitFmpzInternalFunction,
  fmpzInternalSignature,
  generateFmpzFunctions,
};
