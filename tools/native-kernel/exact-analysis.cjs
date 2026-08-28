"use strict";

const {
  UINT64_SEMANTICS,
  hasUint64Bitwise,
  isUint64Bitwise,
  isUint64Shift,
} = require("./uint64-operations.cjs");

function exactTypes(fn) {
  return new Map(
    [...fn.params, ...fn.locals].map((value) => [value.name, value.type]),
  );
}

function integerNames(values, types) {
  return values.filter((name) => types.get(name) === "Integer");
}

function operationInputs(operation) {
  switch (operation.kind) {
    case "integer.copy":
    case "integer.neg":
    case "integer.abs":
    case "integer.truth":
    case "integer.round_sqrt":
    case "bool.not":
    case "uint64.truth":
      return [operation.source];
    case "integer.pow_uint":
      return [operation.base];
    case "integer.mod_uint64":
      return [operation.left, operation.right];
    case "integer.binary":
    case "uint64.binary":
    case "integer.divmod":
    case "integer.compare":
    case "uint64.compare":
    case "bool.compare":
    case "bool.binary":
      return [operation.left, operation.right];
    case "integer.sequence.get":
      return [operation.index];
    case "int64.buffer.copy":
      return [operation.source];
    case "int64.buffer.length":
      return [operation.buffer];
    case "int64.record.view":
      return [operation.buffer, operation.start, operation.length];
    case "int64.buffer.get":
      return [operation.buffer, operation.index];
    case "int64.buffer.set":
      return [operation.buffer, operation.index, operation.value];
    case "integer.buffer.copy":
      return [operation.source];
    case "integer.buffer.length":
      return [operation.buffer];
    case "integer.buffer.get":
      return [operation.buffer, operation.index];
    case "integer.buffer.set":
      return [operation.buffer, operation.index, operation.value];
    case "uint64.buffer.copy":
      return [operation.source];
    case "uint64.buffer.length":
      return [operation.buffer];
    case "uint64.buffer.get":
      return [operation.buffer, operation.index];
    case "uint64.buffer.set":
      return [operation.buffer, operation.index, operation.value];
    case "integer.vector.scope":
      return [operation.capacity, operation.memoryLimit];
    case "integer.vector.length":
      return [operation.vector];
    case "integer.vector.get":
      return [operation.vector, operation.index];
    case "integer.vector.set":
      return [operation.vector, operation.index, operation.value];
    case "integer.vector.addmul":
    case "integer.vector.submul":
      return [
        operation.vector,
        operation.index,
        operation.left,
        operation.right,
      ];
    case "integer.vector.swap":
      return [operation.vector, operation.left, operation.right];
    case "native.call":
    case "ffi.call":
      return operation.arguments.map((argument) => argument.name);
    case "return":
      return operation.values || [operation.value];
    default:
      return [];
  }
}

function operationTargets(operation) {
  if (operation.kind === "integer.divmod") {
    return [operation.quotient, operation.remainder];
  }
  if (Array.isArray(operation.results)) {
    return operation.results.map((result) => result.name);
  }
  return typeof operation.target === "string" ? [operation.target] : [];
}

function walkStatements(statements, handlers) {
  for (const statement of statements) {
    if (statement.kind === "if") {
      walkStatements(statement.condition.operations, handlers);
      handlers.read(statement.condition.value);
      walkStatements(statement.body, handlers);
      walkStatements(statement.alternative, handlers);
      continue;
    }
    if (statement.kind === "while") {
      handlers.loop("while");
      handlers.enterLoop?.("while");
      walkStatements(statement.condition.operations, handlers);
      handlers.read(statement.condition.value);
      walkStatements(statement.body, handlers);
      handlers.exitLoop?.("while");
      continue;
    }
    if (statement.kind === "loop.range" ||
        statement.kind === "loop.range_exact") {
      handlers.loop("range");
      handlers.enterLoop?.("range");
      if (statement.kind === "loop.range_exact") {
        handlers.read(statement.start);
        handlers.read(statement.stop);
        handlers.write(statement.index);
        handlers.read(statement.index);
      }
      walkStatements(statement.body, handlers);
      if (statement.kind === "loop.range_exact") {
        handlers.read(statement.index);
        handlers.write(statement.index);
      }
      handlers.exitLoop?.("range");
      continue;
    }
    if (statement.kind === "integer.vector.scope") {
      handlers.operation(statement);
      walkStatements(statement.setup, handlers);
      walkStatements(statement.body, handlers);
      continue;
    }
    handlers.operation(statement);
    if (statement.kind === "bool.short_circuit") {
      handlers.read(statement.left);
      handlers.write(statement.target);
      walkStatements(statement.right.operations, handlers);
      handlers.read(statement.right.value);
      handlers.write(statement.target);
    }
  }
}

function storageAnalysis(fn) {
  const types = exactTypes(fn);
  const integerParams = new Set(
    fn.params
      .filter((param) => param.type === "Integer")
      .map((param) => param.name),
  );
  const mutatedParams = new Set();
  let position = 0;
  walkStatements(fn.body, {
    loop() {},
    operation(operation) {
      for (const target of operationTargets(operation)) {
        if (integerParams.has(target)) mutatedParams.add(target);
      }
    },
    read() {},
    write(name) {
      if (integerParams.has(name)) mutatedParams.add(name);
    },
  });

  const intervals = new Map();
  const touch = (name) => {
    if (types.get(name) !== "Integer") return;
    const current = intervals.get(name);
    if (current === undefined) {
      intervals.set(name, { name, start: position, end: position });
    } else {
      current.end = position;
    }
  };
  for (const name of mutatedParams) {
    intervals.set(name, { name, start: 0, end: 0 });
  }
  const loopStack = [];
  const recordLoopUse = (name) => {
    if (types.get(name) !== "Integer") return;
    for (const loop of loopStack) loop.names.add(name);
  };
  walkStatements(fn.body, {
    loop() {
      position += 1;
    },
    operation(operation) {
      position += 1;
      for (const name of integerNames(operationInputs(operation), types)) {
        touch(name);
        recordLoopUse(name);
      }
      for (const target of operationTargets(operation)) {
        if (types.get(target) === "Integer") {
          touch(target);
          recordLoopUse(target);
        }
      }
    },
    read(name) {
      position += 1;
      touch(name);
      recordLoopUse(name);
    },
    write(name) {
      touch(name);
      recordLoopUse(name);
    },
    enterLoop() {
      loopStack.push({ start: position, names: new Set() });
    },
    exitLoop() {
      const loop = loopStack.pop();
      for (const name of loop.names) {
        const interval = intervals.get(name);
        if (interval !== undefined && interval.start < loop.start) {
          interval.end = Math.max(interval.end, position);
        }
      }
    },
  });

  for (const local of fn.locals) {
    if (local.type !== "Integer" || intervals.has(local.name)) continue;
    intervals.set(local.name, {
      name: local.name,
      start: position,
      end: position,
    });
    position += 1;
  }

  const candidates = Array.from(intervals.values())
    .filter((interval) =>
      !integerParams.has(interval.name) || mutatedParams.has(interval.name)
    )
    .sort((left, right) =>
      left.start - right.start || left.end - right.end ||
      left.name.localeCompare(right.name)
    );
  const slots = [];
  const assignments = {};
  for (const interval of candidates) {
    let slot = slots.findIndex((end) => end < interval.start);
    if (slot === -1) {
      slot = slots.length;
      slots.push(interval.end);
    } else {
      slots[slot] = interval.end;
    }
    assignments[interval.name] = slot;
  }

  return {
    borrowedParameters: fn.params
      .filter(
        (param) =>
          param.type === "Integer" && !mutatedParams.has(param.name),
      )
      .map((param) => param.name),
    mutableParameters: Array.from(mutatedParams).sort(),
    scratchSlots: slots.length,
    slots: assignments,
    escapedValues: [],
  };
}

function constantBits(value) {
  const integer = BigInt(value);
  const magnitude = integer < 0n ? -integer : integer;
  return magnitude === 0n ? 0 : magnitude.toString(2).length;
}

function executionProfile(fn) {
  const integerBufferParameters = new Set(
    fn.params
      .filter((param) => param.type === "IntegerBuffer")
      .map((param) => param.name),
  );
  const integerBufferLoadParameters = new Set();
  const profile = {
    arithmeticOperations: 0,
    integerGrowthOperations: 0,
    integerBufferLoads: 0,
    uint64ArithmeticOperations: 0,
    uint64BitwiseOperations: 0,
    nativeCalls: 0,
    rangeLoops: 0,
    whileLoops: 0,
    liveExactScopes: 0,
    maximumConstantBits: 0,
  };
  walkStatements(fn.body, {
    loop(kind) {
      if (kind === "range") profile.rangeLoops += 1;
      else profile.whileLoops += 1;
    },
    operation(operation) {
      if (
        operation.kind === "integer.binary" ||
        operation.kind === "integer.pow_uint" ||
        operation.kind === "integer.divmod" ||
        operation.kind === "integer.mod_uint64" ||
        operation.kind === "integer.round_sqrt"
      ) {
        profile.arithmeticOperations += 1;
      }
      if (
        (operation.kind === "integer.binary" &&
          ["mul", "floordiv", "mod"].includes(operation.operation)) ||
        operation.kind === "integer.pow_uint" ||
        operation.kind === "integer.divmod" ||
        operation.kind === "integer.mod_uint64" ||
        operation.kind === "integer.round_sqrt"
      ) {
        profile.integerGrowthOperations += 1;
      }
      if (operation.kind === "integer.buffer.get") {
        profile.integerBufferLoads += 1;
        if (integerBufferParameters.has(operation.buffer)) {
          integerBufferLoadParameters.add(operation.buffer);
        }
      }
      if (
        operation.kind === "uint64.binary" &&
        isUint64Bitwise(operation.operation)
      ) {
        profile.uint64BitwiseOperations += 1;
      }
      if (operation.kind === "uint64.binary") {
        profile.uint64ArithmeticOperations += 1;
      }
      if (operation.kind === "native.call" || operation.kind === "ffi.call") {
        profile.nativeCalls += 1;
      }
      if (operation.kind === "integer.vector.scope") {
        profile.liveExactScopes += 1;
      }
      if (operation.kind === "integer.constant") {
        profile.maximumConstantBits = Math.max(
          profile.maximumConstantBits,
          constantBits(operation.value),
        );
      }
    },
    read() {},
    write() {},
  });
  profile.integerBufferLoadParameters = Array.from(
    integerBufferLoadParameters,
  ).sort();
  return profile;
}

function recursiveFunctions(functions) {
  const exact = new Map(
    functions
      .filter((fn) => fn.kernelKind === "integer")
      .map((fn) => [fn.name, fn]),
  );
  const recursive = new Set();
  const reachesSelf = (start) => {
    const pending = [...(exact.get(start)?.dependencies || [])];
    const visited = new Set();
    while (pending.length > 0) {
      const name = pending.pop();
      if (name === start) return true;
      if (visited.has(name)) continue;
      visited.add(name);
      pending.push(...(exact.get(name)?.dependencies || []));
    }
    return false;
  };
  for (const name of exact.keys()) {
    if (reachesSelf(name)) recursive.add(name);
  }
  return recursive;
}

function localEffects(fn) {
  const mayRaise = new Set();
  let localWrites = 0;
  let foreignPure = true;
  let foreignDeterministic = true;
  let foreignReplaySafe = true;
  let foreignThreadSafe = true;
  let foreignMayAllocate = false;
  walkStatements(fn.body, {
    loop() {},
    operation(operation) {
      localWrites += operationTargets(operation).length;
      if (
        operation.kind === "integer.divmod" ||
        operation.kind === "integer.mod_uint64" ||
        (operation.kind === "integer.binary" &&
          ["floordiv", "mod"].includes(operation.operation)) ||
        (operation.kind === "uint64.binary" &&
          ["floordiv", "mod"].includes(operation.operation))
      ) {
        mayRaise.add("ZeroDivisionError");
      }
      if (operation.kind === "uint64.binary" &&
          isUint64Shift(operation.operation)) {
        mayRaise.add("OverflowError");
      }
      if (operation.kind === "integer.round_sqrt") {
        mayRaise.add("ValueError");
        mayRaise.add("OverflowError");
      }
      if (operation.kind === "integer.sequence.get") {
        mayRaise.add("IndexError");
      }
      if (
        operation.kind === "int64.buffer.get" ||
        operation.kind === "int64.buffer.set" ||
        operation.kind === "int64.record.view" ||
        operation.kind === "integer.buffer.get" ||
        operation.kind === "integer.buffer.set" ||
        operation.kind === "uint64.buffer.get" ||
        operation.kind === "uint64.buffer.set"
      ) {
        mayRaise.add("IndexError");
      }
      if (operation.kind === "integer.vector.scope") {
        foreignMayAllocate = true;
        mayRaise.add("MemoryError");
      }
      if (
        operation.kind === "integer.vector.get" ||
        operation.kind === "integer.vector.set" ||
        operation.kind === "integer.vector.addmul" ||
        operation.kind === "integer.vector.submul" ||
        operation.kind === "integer.vector.swap"
      ) {
        mayRaise.add("IndexError");
      }
      if (
        operation.kind === "integer.vector.set" ||
        operation.kind === "integer.vector.addmul" ||
        operation.kind === "integer.vector.submul"
      ) {
        mayRaise.add("MemoryError");
      }
      if (operation.kind === "int64.buffer.set" ||
          operation.kind === "integer.buffer.set") {
        mayRaise.add("OverflowError");
      }
      if (operation.kind === "raise") mayRaise.add(operation.errorType);
      if (operation.kind === "ffi.call") {
        const effects = operation.foreign.function.effects;
        foreignPure = foreignPure && effects.pure;
        foreignDeterministic = foreignDeterministic && effects.deterministic;
        foreignReplaySafe = foreignReplaySafe && effects.pure &&
          effects.deterministic;
        foreignThreadSafe = foreignThreadSafe && effects.thread_safe;
        foreignMayAllocate = foreignMayAllocate || effects.may_allocate;
        for (const error of effects.may_raise) mayRaise.add(error);
      }
    },
    read() {},
    write() {
      localWrites += 1;
    },
  });
  const externalWrites = bufferWrites(fn, new Map());
  const result = {
    pure: foreignPure && externalWrites.length === 0,
    deterministic: foreignDeterministic,
    threadSafe: foreignThreadSafe,
    mayAllocate: foreignMayAllocate,
    localWrites,
    externalWrites,
    calls: [...fn.dependencies, ...(fn.foreignDependencies || [])],
    mayRaise: Array.from(mayRaise).filter(Boolean).sort(),
    replaySafe: foreignReplaySafe && externalWrites.length === 0,
  };
  result.directPure = result.pure;
  result.directDeterministic = result.deterministic;
  result.directThreadSafe = result.threadSafe;
  result.directMayAllocate = result.mayAllocate;
  result.directReplaySafe = result.replaySafe;
  return result;
}

function bufferWrites(fn, dependencyEffects) {
  const bufferTypes = new Set([
    "IntegerBuffer", "Int64Buffer", "Int64Record", "UInt64Buffer",
  ]);
  const aliases = new Map(
    fn.params
      .filter((param) => bufferTypes.has(param.type))
      .map((param) => [param.name, new Set([param.name])]),
  );
  const writes = new Set();
  function addAlias(target, roots) {
    const current = aliases.get(target) || new Set();
    const before = current.size;
    for (const root of roots) current.add(root);
    aliases.set(target, current);
    return current.size !== before;
  }
  function roots(name) {
    return aliases.get(name) || new Set([name]);
  }
  function visit(statements) {
    let changed = false;
    for (const statement of statements) {
      if (statement.kind === "int64.buffer.copy" ||
          statement.kind === "integer.buffer.copy" ||
          statement.kind === "uint64.buffer.copy") {
        changed = addAlias(statement.target, roots(statement.source)) || changed;
      } else if (statement.kind === "int64.record.view") {
        changed = addAlias(statement.target, roots(statement.buffer)) || changed;
      } else if (statement.kind === "int64.buffer.set" ||
          statement.kind === "integer.buffer.set" ||
          statement.kind === "uint64.buffer.set") {
        for (const root of roots(statement.buffer)) writes.add(root);
      } else if (statement.kind === "native.call") {
        const effect = dependencyEffects.get(statement.function);
        const callee = effect?.params || [];
        for (const written of effect?.externalWrites || []) {
          const position = callee.indexOf(written);
          if (position < 0) continue;
          const argument = statement.arguments[position];
          if (argument !== undefined) {
            for (const root of roots(argument.name)) writes.add(root);
          }
        }
      } else if (statement.kind === "ffi.call") {
        const parameters = statement.foreign.function.signature.parameters;
        for (const written of statement.foreign.function.effects.writes || []) {
          const position = parameters.findIndex((param) => param.name === written);
          if (position < 0) continue;
          const argument = statement.arguments[position];
          if (argument !== undefined) {
            for (const root of roots(argument.name)) writes.add(root);
          }
        }
      } else if (statement.kind === "if") {
        changed = visit(statement.condition.operations) || changed;
        changed = visit(statement.body) || changed;
        changed = visit(statement.alternative) || changed;
      } else if (statement.kind === "while" ||
          statement.kind === "loop.range" ||
          statement.kind === "loop.range_exact" ||
          statement.kind === "integer.vector.scope") {
        if (statement.setup) {
          changed = visit(statement.setup) || changed;
        }
        if (statement.condition?.operations) {
          changed = visit(statement.condition.operations) || changed;
        }
        changed = visit(statement.body) || changed;
      } else if (statement.kind === "bool.short_circuit") {
        changed = visit(statement.right.operations) || changed;
      }
    }
    return changed;
  }
  let changed;
  do changed = visit(fn.body); while (changed);
  return Array.from(writes)
    .filter((name) => fn.params.some((param) => param.name === name))
    .sort();
}

/**
 * Prove which caller-owned UInt64Buffer parameters a prime-source function
 * may mutate. Prime-source helpers remain in the same lowered module, so the
 * proof follows positional calls to a fixed point instead of trusting names or
 * declarations supplied by a consumer.
 *
 * Unknown callees fail closed: every buffer argument is treated as writable.
 * Compiler-owned records are also conservative at call boundaries because the
 * public ABI does not yet represent effects for individual record fields.
 */
function primeSourceBufferWrites(fn, dependencyEffects) {
  const aliases = new Map(
    fn.params
      .filter((param) => param.type === "UInt64Buffer")
      .map((param) => [param.name, new Set([param.name])]),
  );
  const recordAliases = new Map();
  const writes = new Set();
  function roots(name) {
    return aliases.get(name) || new Set();
  }
  function addAlias(target, sourceRoots) {
    const current = aliases.get(target) || new Set();
    const before = current.size;
    for (const root of sourceRoots) current.add(root);
    aliases.set(target, current);
    return current.size !== before;
  }
  function addRecordAliases(target, fields) {
    const current = recordAliases.get(target) || new Map();
    let changed = false;
    for (const [field, sourceRoots] of fields) {
      const previous = current.get(field) || new Set();
      const before = previous.size;
      for (const root of sourceRoots) previous.add(root);
      current.set(field, previous);
      changed = previous.size !== before || changed;
    }
    recordAliases.set(target, current);
    return changed;
  }
  function markRoots(sourceRoots) {
    for (const root of sourceRoots) writes.add(root);
  }
  function markArgument(argument) {
    markRoots(roots(argument.name));
    for (const sourceRoots of recordAliases.get(argument.name)?.values() || []) {
      markRoots(sourceRoots);
    }
  }
  function visit(statements) {
    let changed = false;
    for (const statement of statements || []) {
      if (
        statement.kind === "source.copy" &&
        statement.type === "UInt64Buffer"
      ) {
        changed = addAlias(statement.target, roots(statement.source)) || changed;
      } else if (
        statement.kind === "source.copy" &&
        statement.type?.startsWith("Record:")
      ) {
        changed = addRecordAliases(
          statement.target,
          recordAliases.get(statement.source) || new Map(),
        ) || changed;
      } else if (statement.kind === "source.record.construct") {
        changed = addRecordAliases(
          statement.target,
          new Map(
            statement.fields
              .filter((field) => field.type === "UInt64Buffer")
              .map((field) => [field.name, roots(field.value)]),
          ),
        ) || changed;
      } else if (
        statement.kind === "source.record.get" &&
        statement.type === "UInt64Buffer"
      ) {
        changed = addAlias(
          statement.target,
          recordAliases.get(statement.source)?.get(statement.field) || new Set(),
        ) || changed;
      } else if (statement.kind === "source.buffer.set") {
        markRoots(roots(statement.buffer));
      } else if (statement.kind === "source.call") {
        const effect = dependencyEffects.get(statement.function);
        if (effect === undefined) {
          for (const argument of statement.arguments) markArgument(argument);
        } else {
          for (const written of effect.externalWrites) {
            const position = effect.params.indexOf(written);
            if (position >= 0 && statement.arguments[position] !== undefined) {
              markArgument(statement.arguments[position]);
            }
          }
          // Record-field effects are deliberately not represented yet.
          for (const argument of statement.arguments) {
            if (argument.type?.startsWith("Record:")) markArgument(argument);
          }
        }
      } else if (statement.kind === "source.if") {
        changed = visit(statement.condition.operations) || changed;
        changed = visit(statement.body) || changed;
        changed = visit(statement.alternative) || changed;
      } else if (statement.kind === "source.while") {
        changed = visit(statement.condition.operations) || changed;
        changed = visit(statement.body) || changed;
      } else if (statement.kind === "source.loop.range") {
        changed = visit(statement.body) || changed;
      } else if (statement.kind === "source.bool.short_circuit") {
        changed = visit(statement.right.operations) || changed;
      }
    }
    return changed;
  }
  let changed;
  do changed = visit(fn.body); while (changed);
  return Array.from(writes)
    .filter((name) => fn.params.some((param) => param.name === name))
    .sort();
}

function primeSourceEffectAnalyses(functions) {
  const primeSource = new Map(
    functions
      .filter((fn) => fn.kernelKind === "prime-field-source")
      .map((fn) => [fn.name, fn]),
  );
  const effects = new Map(
    Array.from(primeSource, ([name, fn]) => [name, {
      params: fn.params.map((param) => param.name),
      externalWrites: [],
    }]),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, fn] of primeSource) {
      const effect = effects.get(name);
      const externalWrites = primeSourceBufferWrites(fn, effects);
      if (externalWrites.join("\0") !== effect.externalWrites.join("\0")) {
        effect.externalWrites = externalWrites;
        changed = true;
      }
    }
  }
  for (const effect of effects.values()) delete effect.params;
  return effects;
}

function effectAnalyses(functions) {
  const exact = new Map(
    functions
      .filter((fn) => fn.kernelKind === "integer")
      .map((fn) => [fn.name, fn]),
  );
  const effects = new Map(
    Array.from(exact, ([name, fn]) => {
      const effect = localEffects(fn);
      effect.params = fn.params.map((param) => param.name);
      return [name, effect];
    }),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, fn] of exact) {
      const effect = effects.get(name);
      const transitiveRaises = new Set(effect.mayRaise);
      for (const dependency of fn.dependencies) {
        for (const error of effects.get(dependency)?.mayRaise || []) {
          transitiveRaises.add(error);
        }
      }
      const next = Array.from(transitiveRaises).sort();
      if (next.join("\0") !== effect.mayRaise.join("\0")) {
        effect.mayRaise = next;
        changed = true;
      }
      const externalWrites = bufferWrites(fn, effects);
      if (externalWrites.join("\0") !== effect.externalWrites.join("\0")) {
        effect.externalWrites = externalWrites;
        effect.pure = effect.pure && externalWrites.length === 0;
        effect.replaySafe = effect.replaySafe && externalWrites.length === 0;
        changed = true;
      }
      const dependencies = fn.dependencies
        .map((dependency) => effects.get(dependency))
        .filter(Boolean);
      const nextFlags = {
        pure: effect.directPure && effect.externalWrites.length === 0 &&
          dependencies.every((dependency) => dependency.pure),
        deterministic: effect.directDeterministic &&
          dependencies.every((dependency) => dependency.deterministic),
        threadSafe: effect.directThreadSafe &&
          dependencies.every((dependency) => dependency.threadSafe),
        mayAllocate: effect.directMayAllocate ||
          dependencies.some((dependency) => dependency.mayAllocate),
        replaySafe: effect.directReplaySafe && effect.externalWrites.length === 0 &&
          dependencies.every((dependency) => dependency.replaySafe),
      };
      for (const [key, value] of Object.entries(nextFlags)) {
        if (effect[key] !== value) {
          effect[key] = value;
          changed = true;
        }
      }
    }
  }
  for (const effect of effects.values()) {
    for (const key of [
      "params", "directPure", "directDeterministic", "directThreadSafe",
      "directMayAllocate", "directReplaySafe",
    ]) delete effect[key];
  }
  return effects;
}

function taggedIntegerProof(fn, effects) {
  const operations = new Set();
  walkStatements(fn.body, {
    loop(kind) {
      operations.add(kind === "range" ? "tagged-range" : "tagged-while");
    },
    operation(operation) {
      if (operation.kind.startsWith("integer.")) {
        operations.add(operation.kind.replace("integer.", "tagged-"));
      }
      if (operation.kind === "native.call") operations.add("direct-tagged-call");
      if (operation.kind === "ffi.call") operations.add("direct-ffi-call");
    },
    read() {},
    write() {},
  });
  const ownsLiveExactWorkspace = operations.has("tagged-vector.scope");
  if (ownsLiveExactWorkspace) {
    return {
      eligible: true,
      representation: "gmp-live-exact-workspace",
      smallRepresentation: "tagged entry bridge only",
      largeRepresentation: "lexical-owned-mpz-vector",
      entry: "lossless-tagged-to-gmp",
      operations: Array.from(operations).sort(),
      promotion: "before lexical workspace entry",
      deoptimization: "none inside owned scope",
      publicReplay: "never",
      calleeSpeculation: "word entry promotes before workspace allocation",
      directCalls: [...fn.dependencies, ...(fn.foreignDependencies || [])],
      effectsChecked: effects.pure && effects.deterministic &&
        effects.externalWrites.length === 0,
      proof:
        "the tagged bridge converts once and the isolated GMP body owns and clears every live exact entry",
    };
  }
  return {
    eligible: true,
    representation: "tagged-int64-gmp",
    smallRepresentation: "signed-int64",
    largeRepresentation: "lazy-owned-mpz",
    entry: "lossless-int64-or-gmp",
    operations: Array.from(operations).sort(),
    promotion: "in-place-at-current-instruction",
    deoptimization: "resume-at-failing-instruction",
    publicReplay: "never",
    calleeSpeculation: effects.replaySafe
      ? "word-prefix-may-retry-at-direct-call-boundary"
      : "disabled",
    directCalls: [...fn.dependencies, ...(fn.foreignDependencies || [])],
    effectsChecked: effects.pure && effects.deterministic &&
      effects.externalWrites.length === 0,
    proof:
      "every exact value is tagged; checked int64 failure promotes live values before the operation continues",
  };
}

function liveExactWorkspaceAnalysis(fn) {
  const scopes = [];
  walkStatements(fn.body, {
    loop() {},
    operation(operation) {
      if (operation.kind !== "integer.vector.scope") return;
      scopes.push({
        owner: operation.owner,
        capacity: operation.capacity,
        memoryLimit: operation.memoryLimit,
        storage: "lexical-owned-mpz-vector",
        cleanup: "all-exit-idempotent",
        canonicalAuthority: false,
      });
    },
    read() {},
    write() {},
  });
  return {
    count: scopes.length,
    scopes,
    ownership: "compiler-owned-lexical",
    allocation: "bounded-capacity-and-semantic-charge",
    physicalMemory: "reported-by-receipt-not-semantic-limit",
    automaticSelection: "receipt-gated",
  };
}

function backendPolicy(fn, profile, recursive) {
  if (profile.liveExactScopes > 0) {
    return {
      kind: "gmp",
      reason: "a lexical live-exact workspace has one GMP ownership backend",
      requiresExactWorkspace: true,
    };
  }
  if ((fn.foreignDependencies || []).length > 0) {
    return {
      kind: "tagged",
      reason: "an explicitly declared FFI call executes in the isolated native core",
    };
  }
  if (recursive) {
    return {
      kind: "tagged",
      reason: "lazy tagged recursive frames avoid allocating GMP values",
    };
  }
  if (
    profile.uint64BitwiseOperations > 0 &&
    fn.params.every((param) => param.type !== "Integer")
  ) {
    return {
      kind: "tagged",
      reason: "bounded uint64 operations execute in the isolated native core",
    };
  }
  if (
    profile.uint64ArithmeticOperations > 0 &&
    profile.rangeLoops + profile.whileLoops > 0 &&
    fn.params.every((param) => param.type !== "Integer")
  ) {
    return {
      kind: "tagged",
      reason:
        "a bounded uint64 arithmetic loop amortizes one isolated native entry",
    };
  }
  if (
    profile.integerBufferLoads > 0 &&
    profile.rangeLoops + profile.whileLoops > 0 &&
    profile.integerBufferLoadParameters.length > 0 &&
    ((profile.nativeCalls > 0 && profile.dependencyDepth >= 2) ||
      profile.integerGrowthOperations >= 16)
  ) {
    return {
      kind: "integer-buffer-values",
      parameters: profile.integerBufferLoadParameters,
      reason:
        "an amortizable exact loop selects tagged or GMP from packed input bounds",
    };
  }
  if (
    profile.rangeLoops > 0 &&
    profile.nativeCalls > 0 &&
    profile.dependencyDepth >= 2
  ) {
    return {
      kind: "tagged",
      reason: "a range loop drives a direct tagged native call graph",
    };
  }
  if (
    profile.rangeLoops > 0 &&
    profile.nativeCalls > 0 &&
    profile.maximumConstantBits >= 128
  ) {
    return {
      kind: "gmp",
      reason: "a range loop whose constants are already large stays in GMP",
    };
  }
  if (
    profile.rangeLoops > 0 &&
    profile.nativeCalls > 0 &&
    profile.maximumConstantBits <= 64
  ) {
    return {
      kind: "bigint",
      reason: "a range loop repeatedly calls exact kernels on small integers",
    };
  }
  if (profile.rangeLoops > 0) {
    return {
      kind: "tagged",
      reason: "a complete arithmetic range loop amortizes native entry",
    };
  }
  if (
    profile.maximumConstantBits <= 64 &&
    (profile.arithmeticOperations >= 16 || profile.nativeCalls >= 4)
  ) {
    return {
      kind: "tagged",
      reason:
        "a substantial small-integer call graph amortizes checked native entry",
    };
  }
  if (
    profile.arithmeticOperations === 0 &&
    profile.nativeCalls === 0 &&
    profile.whileLoops === 0
  ) {
    return {
      kind: "bigint",
      reason: "copy and comparison-only functions do not amortize a GMP boundary",
    };
  }
  let minimumBits;
  if (profile.whileLoops > 0) {
    minimumBits = 64;
  } else if (profile.nativeCalls > 0) {
    minimumBits = profile.arithmeticOperations === 0 ? 64 : 128;
  } else {
    minimumBits = profile.arithmeticOperations <= 1 ? 512 : 256;
  }
  return {
    kind: "operand-bits",
    minimumBits,
    parameters: fn.params
      .filter((param) => param.type === "Integer")
      .map((param) => param.name),
    reason: profile.whileLoops > 0
      ? "dynamic exact loops cross over near machine-word-sized operands"
      : profile.nativeCalls > 0
        ? "multi-operation exact calls amortize GMP on medium operands"
        : "short scalar operations favor BigInt until operands are large",
  };
}

function analyzeExactModule(functions) {
  const recursive = recursiveFunctions(functions);
  const effects = effectAnalyses(functions);
  const exact = new Map(
    functions
      .filter((fn) => fn.kernelKind === "integer")
      .map((fn) => [fn.name, fn]),
  );
  const dependencyDepth = (name, path = new Set()) => {
    if (path.has(name)) return 0;
    const fn = exact.get(name);
    if (fn === undefined || fn.dependencies.length === 0) return 0;
    const next = new Set(path);
    next.add(name);
    return 1 + Math.max(
      ...fn.dependencies.map((dependency) =>
        dependencyDepth(dependency, next)
      ),
    );
  };
  for (const fn of functions) {
    if (fn.kernelKind !== "integer") continue;
    const profile = {
      ...executionProfile(fn),
      dependencyDepth: dependencyDepth(fn.name),
    };
    let backend = backendPolicy(fn, profile, recursive.has(fn.name));
    if (
      profile.rangeLoops > 0 &&
      !["gmp", "integer-buffer-values"].includes(backend.kind)
    ) {
      backend = {
        kind: "tagged",
        reason: "an exact range loop amortizes tagged native entry",
      };
    }
    const effect = effects.get(fn.name);
    fn.analysis = {
      storage: storageAnalysis(fn),
      execution: { ...profile, recursive: recursive.has(fn.name) },
      backend,
      effects: effect,
      taggedInteger: taggedIntegerProof(fn, effect),
      ...(profile.liveExactScopes > 0
        ? { liveExactWorkspace: liveExactWorkspaceAnalysis(fn) }
        : {}),
      ...(hasUint64Bitwise(fn.body) ? { uint64: UINT64_SEMANTICS } : {}),
    };
  }
  const primeSourceEffects = primeSourceEffectAnalyses(functions);
  for (const fn of functions) {
    const effects = primeSourceEffects.get(fn.name);
    if (effects !== undefined) {
      fn.analysis = { ...fn.analysis, effects };
    }
  }
  return functions;
}

module.exports = {
  analyzeExactModule,
  backendPolicy,
  effectAnalyses,
  executionProfile,
  localEffects,
  primeSourceEffectAnalyses,
  storageAnalysis,
  taggedIntegerProof,
};
