"use strict";

const {
  tupleElementTypes,
} = require("./integer-ir.cjs");
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
    case "uint64.from_integer_checked":
    case "bool.not":
    case "uint64.truth":
    case "value.discard":
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
    case "integer.vector.borrow":
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
    case "integer.matrix.scope":
      return [operation.rows, operation.columns, operation.memoryLimit];
    case "integer.matrix.length":
      return [operation.matrix];
    case "integer.matrix.get":
    case "integer.matrix.borrow":
      return [operation.matrix, operation.row, operation.column];
    case "integer.matrix.set":
      return [
        operation.matrix,
        operation.row,
        operation.column,
        operation.value,
      ];
    case "integer.matrix.addmul":
    case "integer.matrix.submul":
      return [
        operation.matrix,
        operation.row,
        operation.column,
        operation.left,
        operation.right,
      ];
    case "integer.matrix.swap_rows":
      return [operation.matrix, operation.left, operation.right];
    case "integer.arena.scope":
      return [operation.memoryLimit, operation.temporaryLimit];
    case "integer.arena.vector.allocate":
      return [operation.arena, operation.capacity, operation.maximumBits];
    case "integer.arena.matrix.allocate":
      return [
        operation.arena,
        operation.rows,
        operation.columns,
        operation.maximumBits,
      ];
    case "record.construct":
      return operation.fields.map((field) => field.value);
    case "record.copy":
    case "record.get":
      return [operation.source];
    case "record.vector.length":
      return [operation.vector];
    case "record.vector.get":
      return [operation.vector, operation.index];
    case "record.vector.set":
      return [operation.vector, operation.index, operation.value];
    case "record.arena.vector.allocate":
      return [operation.arena, operation.capacity];
    case "bounded.map.arena.allocate":
    case "bounded.set.arena.allocate":
      return [operation.arena, operation.capacity];
    case "bounded.map.insert":
      return [operation.owner, operation.key, operation.value];
    case "bounded.map.get":
      return [operation.owner, operation.key, operation.value];
    case "bounded.map.contains":
    case "bounded.set.add":
    case "bounded.set.contains":
      return [operation.owner, operation.key];
    case "bounded.map.length":
    case "bounded.set.length":
      return [operation.owner];
    case "sparse.rows.arena.allocate":
      return [
        operation.arena,
        operation.rows,
        operation.columns,
        operation.entryCapacity,
        operation.maximumBits,
      ];
    case "sparse.rows.append":
      return [operation.owner, operation.row, operation.column, operation.value];
    case "sparse.rows.get":
      return [
        operation.owner,
        operation.row,
        operation.column,
        operation.defaultValue,
      ];
    case "sparse.rows.row_length":
      return [operation.owner, operation.row];
    case "sparse.rows.length":
      return [operation.owner];
    case "native.call":
    case "ffi.call":
    case "ffi.arena.resource.allocate":
      return operation.arguments.map((argument) => argument.name);
    case "return":
      return operation.values || [operation.value];
    case "range.validate_step":
      return [operation.step];
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
      handlers.loop("range", statement);
      handlers.enterLoop?.("range");
      if (statement.iterator !== undefined) {
        handlers.read(statement.start);
        handlers.read(statement.stop);
        handlers.read(statement.step);
        handlers.write(statement.iterator);
        handlers.read(statement.iterator);
        handlers.write(statement.index);
      } else if (statement.kind === "loop.range_exact") {
        handlers.read(statement.start);
        handlers.read(statement.stop);
        handlers.write(statement.index);
        handlers.read(statement.index);
      }
      walkStatements(statement.body, handlers);
      if (statement.iterator !== undefined) {
        handlers.read(statement.iterator);
        handlers.read(statement.step);
        handlers.write(statement.iterator);
      } else if (statement.kind === "loop.range_exact") {
        handlers.read(statement.index);
        handlers.write(statement.index);
      }
      handlers.exitLoop?.("range");
      continue;
    }
    if (statement.kind === "integer.vector.scope" ||
        statement.kind === "integer.matrix.scope" ||
        statement.kind === "integer.arena.scope") {
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

function introduceResidentBorrows(fn) {
  const uses = new Map();
  const recordUse = (name) => {
    uses.set(name, (uses.get(name) || 0) + 1);
  };
  walkStatements(fn.body, {
    loop() {},
    operation(operation) {
      for (const name of operationInputs(operation)) recordUse(name);
    },
    read: recordUse,
    write() {},
  });

  const rewrite = (statements) => {
    for (const statement of statements) {
      if (statement.kind === "if") {
        rewrite(statement.condition.operations);
        rewrite(statement.body);
        rewrite(statement.alternative);
      } else if (statement.kind === "while") {
        rewrite(statement.condition.operations);
        rewrite(statement.body);
      } else if (
        statement.kind === "loop.range" ||
        statement.kind === "loop.range_exact"
      ) {
        rewrite(statement.body);
      } else if (
        statement.kind === "integer.vector.scope" ||
        statement.kind === "integer.matrix.scope" ||
        statement.kind === "integer.arena.scope"
      ) {
        rewrite(statement.setup);
        rewrite(statement.body);
      }
    }
    for (let index = 0; index + 1 < statements.length; index += 1) {
      const load = statements[index];
      const consumer = statements[index + 1];
      if (
        !["integer.vector.get", "integer.matrix.get"].includes(load.kind) ||
        uses.get(load.target) !== 1 ||
        ![
          "integer.vector.addmul",
          "integer.vector.submul",
          "integer.matrix.addmul",
          "integer.matrix.submul",
        ].includes(consumer.kind) ||
        !operationInputs(consumer).includes(load.target)
      ) {
        continue;
      }
      load.kind = load.kind.replace(".get", ".borrow");
      load.borrowLifetime = "next-operation";
    }
  };
  rewrite(fn.body);
}

function storageAnalysis(fn) {
  const types = exactTypes(fn);
  const integerParams = new Set(
    fn.params
      .filter((param) => param.type === "Integer")
      .map((param) => param.name),
  );
  const mutatedParams = new Set();
  const borrowedLocals = new Set();
  let position = 0;
  walkStatements(fn.body, {
    loop() {},
    operation(operation) {
      if (
        operation.kind === "integer.vector.borrow" ||
        operation.kind === "integer.matrix.borrow"
      ) {
        borrowedLocals.add(operation.target);
      }
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
      !borrowedLocals.has(interval.name) &&
      (!integerParams.has(interval.name) || mutatedParams.has(interval.name))
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
    ...(borrowedLocals.size > 0
      ? { borrowedLocals: Array.from(borrowedLocals).sort() }
      : {}),
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
      if (operation.kind === "native.call" || operation.kind === "ffi.call" ||
          operation.kind === "ffi.arena.resource.allocate") {
        profile.nativeCalls += 1;
      }
      if (operation.kind === "integer.vector.scope" ||
          operation.kind === "integer.matrix.scope" ||
          operation.kind === "integer.arena.scope") {
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
      if (operation.kind === "uint64.from_integer_checked") {
        mayRaise.add("OverflowError");
      }
      if (operation.kind === "integer.round_sqrt") {
        mayRaise.add("ValueError");
        mayRaise.add("OverflowError");
      }
      if (operation.kind === "range.validate_step") {
        mayRaise.add("ValueError");
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
      if (operation.kind === "integer.vector.scope" ||
          operation.kind === "integer.matrix.scope" ||
          operation.kind === "integer.arena.scope" ||
          operation.kind === "integer.arena.vector.allocate" ||
          operation.kind === "integer.arena.matrix.allocate" ||
          operation.kind === "record.arena.vector.allocate" ||
          operation.kind === "bounded.map.arena.allocate" ||
          operation.kind === "bounded.set.arena.allocate" ||
          operation.kind === "sparse.rows.arena.allocate") {
        foreignMayAllocate = true;
        mayRaise.add("MemoryError");
      }
      if (operation.kind === "bounded.map.insert" ||
          operation.kind === "bounded.set.add" ||
          operation.kind === "sparse.rows.append") {
        mayRaise.add("MemoryError");
      }
      if (operation.kind === "sparse.rows.append") {
        mayRaise.add("ValueError");
        mayRaise.add("IndexError");
      }
      if (operation.kind === "sparse.rows.get" ||
          operation.kind === "sparse.rows.row_length") {
        mayRaise.add("IndexError");
      }
      if (
        operation.kind === "integer.vector.get" ||
        operation.kind === "integer.vector.borrow" ||
        operation.kind === "integer.vector.set" ||
        operation.kind === "integer.vector.addmul" ||
        operation.kind === "integer.vector.submul" ||
        operation.kind === "integer.vector.swap" ||
        operation.kind === "integer.matrix.get" ||
        operation.kind === "integer.matrix.borrow" ||
        operation.kind === "integer.matrix.set" ||
        operation.kind === "integer.matrix.addmul" ||
        operation.kind === "integer.matrix.submul" ||
        operation.kind === "integer.matrix.swap_rows" ||
        operation.kind === "record.vector.get" ||
        operation.kind === "record.vector.set"
      ) {
        mayRaise.add("IndexError");
      }
      if (
        operation.kind === "integer.vector.set" ||
        operation.kind === "integer.vector.addmul" ||
        operation.kind === "integer.vector.submul" ||
        operation.kind === "integer.matrix.set" ||
        operation.kind === "integer.matrix.addmul" ||
        operation.kind === "integer.matrix.submul"
      ) {
        mayRaise.add("MemoryError");
      }
      if (operation.kind === "int64.buffer.set" ||
          operation.kind === "integer.buffer.set") {
        mayRaise.add("OverflowError");
      }
      if (operation.kind === "raise") mayRaise.add(operation.errorType);
      if (operation.kind === "ffi.call" ||
          operation.kind === "ffi.arena.resource.allocate") {
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
    "NativeIntegerVector",
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
      } else if (statement.kind === "integer.vector.set" ||
          statement.kind === "integer.vector.addmul" ||
          statement.kind === "integer.vector.submul" ||
          statement.kind === "integer.vector.swap") {
        for (const root of roots(statement.vector)) writes.add(root);
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
      } else if (statement.kind === "ffi.call" ||
          statement.kind === "ffi.arena.resource.allocate") {
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
          statement.kind === "integer.vector.scope" ||
          statement.kind === "integer.matrix.scope" ||
          statement.kind === "integer.arena.scope") {
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
      if (operation.kind === "uint64.from_integer_checked") {
        operations.add("tagged-to_uint64_checked");
      }
      if (operation.kind === "native.call") operations.add("direct-tagged-call");
      if (operation.kind === "ffi.call" ||
          operation.kind === "ffi.arena.resource.allocate") {
        operations.add("direct-ffi-call");
      }
    },
    read() {},
    write() {},
  });
  const ownsLiveExactWorkspace = [
    "tagged-vector.scope",
    "tagged-matrix.scope",
    "tagged-arena.scope",
  ].some((operation) => operations.has(operation));
  if (ownsLiveExactWorkspace) {
    return {
      eligible: true,
      representation: "gmp-live-exact-workspace",
      smallRepresentation: "tagged entry bridge only",
      largeRepresentation: "lexical-owned-mpz-workspace",
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

function liveExactWorkspaceAnalysis(fn, backend) {
  const scopes = [];
  walkStatements(fn.body, {
    loop() {},
    operation(operation) {
      if (operation.kind === "integer.vector.scope") {
        scopes.push({
          owner: operation.owner,
          capacity: operation.capacity,
          memoryLimit: operation.memoryLimit,
          storage: "lexical-owned-mpz-vector",
          cleanup: "all-exit-idempotent",
          canonicalAuthority: false,
        });
      } else if (operation.kind === "integer.matrix.scope") {
        scopes.push({
          owner: operation.owner,
          rows: operation.rows,
          columns: operation.columns,
          memoryLimit: operation.memoryLimit,
          storage: "lexical-owned-row-major-mpz-matrix",
          cleanup: "all-exit-idempotent",
          canonicalAuthority: false,
        });
      } else if (operation.kind === "integer.arena.scope") {
        scopes.push({
          owner: operation.owner,
          memoryLimit: operation.memoryLimit,
          temporaryLimit: operation.temporaryLimit,
          storage: "shared-budget-lexical-exact-arena",
          children: operation.children.map((child) =>
            child.childKind === "foreign-resource"
              ? {
                  owner: child.owner,
                  storage: "declared-owned-ffi-resource",
                  type: child.type,
                  resourceId: child.resourceId,
                  resourceIdentity: child.resourceIdentity,
                  abiType: child.abiType,
                  clearSymbol: child.clearSymbol,
                  sizeSymbol: child.sizeSymbol,
                  constructorDeclarationId: child.constructorDeclarationId,
                  cleanup: "before-arena-rewind-all-exit-idempotent",
                }
            : child.type === "NativeIntegerMatrix"
              ? {
                  owner: child.owner,
                  storage: "row-major-mpz-matrix",
                  rows: child.rows,
                  columns: child.columns,
                  maximumBits: child.maximumBits,
                }
              : child.type === "NativeIntegerVector"
                ? {
                    owner: child.owner,
                    storage: backend?.kind === "fmpz"
                      ? "inline-promoting-fmpz-vector"
                      : "mpz-vector",
                    capacity: child.capacity,
                    maximumBits: child.maximumBits,
                  }
                : child.collectionKind === "map" ||
                    child.collectionKind === "set"
                  ? {
                      owner: child.owner,
                      storage: child.collectionKind === "map"
                        ? "bounded-open-addressed-map"
                        : "bounded-open-addressed-set",
                      capacity: child.capacity,
                      record: child.record,
                      fields: child.fields,
                      entryCharge: child.entryCharge,
                      probing: "linear",
                      hash: "fnv64-record-fields-v1",
                    }
                  : child.type === "NativeSparseIntegerRows"
                    ? {
                        owner: child.owner,
                        storage: "append-only-row-major-sparse-mpz-rows",
                        rows: child.rows,
                        columns: child.columns,
                        entryCapacity: child.entryCapacity,
                        maximumBits: child.maximumBits,
                        metadataBaseCharge: child.metadataBaseCharge,
                        rowCharge: child.rowCharge,
                        entryCharge: child.entryCharge,
                      }
                  : {
                    owner: child.owner,
                    storage: "fixed-schema-record-vector",
                    capacity: child.capacity,
                    record: child.record,
                    fields: child.fields,
                    entryCharge: child.entryCharge,
                  }
          ),
          cleanup: "reverse-child-order-all-exit-idempotent",
          canonicalAuthority: false,
        });
      }
    },
    read() {},
    write() {},
  });
  const fixedCapacityArena = scopes.some(
    (scope) => scope.storage === "shared-budget-lexical-exact-arena",
  );
  return {
    count: scopes.length,
    scopes,
    ownership: "compiler-owned-lexical",
    allocation: fixedCapacityArena
      ? "fixed-limb-capacity-with-owned-arithmetic-scratch"
      : "bounded-capacity-and-semantic-charge",
    physicalMemory: fixedCapacityArena
      ? "declared-resident-capacity-plus-receipt-audited-library-temporaries"
      : "reported-by-receipt-not-semantic-limit",
    automaticSelection: "receipt-gated",
  };
}

const FMPZ_OPERATION_KINDS = new Set([
  "bool.binary",
  "bool.compare",
  "bool.constant",
  "bool.copy",
  "bool.not",
  "bool.short_circuit",
  "ffi.arena.resource.allocate",
  "ffi.call",
  "integer.abs",
  "integer.arena.vector.allocate",
  "integer.binary",
  "integer.buffer.get",
  "integer.buffer.length",
  "integer.buffer.set",
  "integer.compare",
  "integer.constant",
  "integer.copy",
  "integer.divmod",
  "integer.from_uint64",
  "integer.mod_uint64",
  "integer.neg",
  "integer.pow_uint",
  "integer.truth",
  "integer.vector.addmul",
  "integer.vector.borrow",
  "integer.vector.get",
  "integer.vector.length",
  "integer.vector.set",
  "integer.vector.submul",
  "integer.vector.swap",
  "native.call",
  "range.validate_step",
  "raise",
  "return",
  "uint64.binary",
  "uint64.buffer.copy",
  "uint64.buffer.get",
  "uint64.buffer.length",
  "uint64.buffer.set",
  "uint64.compare",
  "uint64.constant",
  "uint64.copy",
  "uint64.from_integer_checked",
  "uint64.truth",
  "value.discard",
]);

const FMPZ_FFI_DECLARATIONS = new Set([
  "flint:fmpz_matrix",
  "flint:fmpz_matrix_entry",
  "flint:fmpz_matrix_set_entry",
  "flint:fmpz_polynomial",
  "flint:fmpz_polynomial_set_coefficient",
  "flint:fmpz_polynomial_seal",
  "flint:number_field_analyze_resource",
  "flint:number_field_analysis_resource_project",
  "flint:number_field_analysis_resource_project_proof",
  "flint:integer_log_sqrt_balls_resource",
  "flint:positive_rational_log_balls_resource",
  "flint:fmpz_matrix_hnf_into",
  "flint:fmpz_matrix_hnf_transform",
  "flint:fmpz_matrix_lll_transform",
  "flint:fmpz_matrix_snf",
  "flint:fmpz_matrix_snf_into",
]);

const FMPZ_RESOURCE_IDS = new Set([
  "fmpz_matrix",
  "fmpz_polynomial",
  "number_field_analysis_resource",
]);

/**
 * Inspect the deliberately small fmpz representation slice.
 *
 * Semantic Integer values remain exact.  A root owns one closed arena with
 * unbounded exact vectors, borrowed packed IntegerBuffer boundary views, and
 * direct resident FLINT matrix, polynomial, and number-field-analysis
 * declarations.  A root may pass its vectors, foreign resources, and packed
 * boundary views through an acyclic helper graph without transferring ownership
 * or exposing an aggregate host ABI.  Anything outside this list continues
 * through the mature GMP backend.
 */
function fmpzReturnTypeSupported(type) {
  return (tupleElementTypes(type) || [type]).every((element) =>
    ["Integer", "uint64", "bool"].includes(element)
  );
}

function inspectFmpzFunction(fn) {
  if (!fmpzReturnTypeSupported(fn.returnType)) return null;
  const fmpzResourceTypes = new Set(
    (fn.foreignResources || [])
      .filter((resource) => FMPZ_RESOURCE_IDS.has(resource.id))
      .map((resource) => resource.compiler_type || resource.python_name),
  );
  const scalarParameter = (param) =>
    ["Integer", "uint64", "bool", "IntegerBuffer", "UInt64Buffer"]
      .includes(param.type);
  const borrowedAggregateParameter = (param) =>
    param.type === "IntegerBuffer" ||
    param.type === "UInt64Buffer" ||
    param.type === "NativeIntegerVector" || fmpzResourceTypes.has(param.type);
  if (!fn.params.every((param) =>
    scalarParameter(param) || borrowedAggregateParameter(param)
  )) return null;
  if (!fn.locals.every((local) =>
    [
      "Integer", "uint64", "bool", "UInt64Buffer", "NativeExactArena",
      "NativeIntegerVector",
    ].includes(local.type) ||
    (fn.foreignResources || []).some((resource) =>
      (resource.compiler_type || resource.python_name) === local.type &&
      FMPZ_RESOURCE_IDS.has(resource.id)
    )
  )) return null;

  const constants = new Map();
  let arenas = 0;
  let vectors = 0;
  let eligible = true;
  function visit(statements) {
    for (const statement of statements || []) {
      if (statement.kind === "if") {
        visit(statement.condition.operations);
        visit(statement.body);
        visit(statement.alternative);
        continue;
      }
      if (statement.kind === "while") {
        visit(statement.condition.operations);
        visit(statement.body);
        continue;
      }
      if (statement.kind === "loop.range" ||
          statement.kind === "loop.range_exact") {
        visit(statement.body);
        continue;
      }
      if (statement.kind === "integer.arena.scope") {
        arenas += 1;
        if (!statement.children.every((child) =>
          child.type === "NativeIntegerVector" ||
          (child.childKind === "foreign-resource" &&
            FMPZ_RESOURCE_IDS.has(child.resourceId))
        )) eligible = false;
        visit(statement.setup);
        visit(statement.body);
        continue;
      }
      if (!FMPZ_OPERATION_KINDS.has(statement.kind)) eligible = false;
      if (statement.kind === "uint64.constant") {
        constants.set(statement.target, statement.value);
      }
      if (statement.kind === "integer.arena.vector.allocate") {
        vectors += 1;
      }
      if (statement.kind.startsWith("integer.vector.") &&
          statement.kind !== "integer.vector.length") {
        if (statement.indexType !== undefined &&
            !["Integer", "uint64"].includes(statement.indexType)) eligible = false;
        if (statement.leftType !== undefined &&
            !["Integer", "uint64"].includes(statement.leftType)) eligible = false;
        if (statement.rightType !== undefined &&
            !["Integer", "uint64"].includes(statement.rightType)) eligible = false;
      }
      if (statement.kind.startsWith("integer.buffer.")) {
        if (statement.bufferType !== "IntegerBuffer") eligible = false;
        if (statement.kind !== "integer.buffer.length" &&
            !["Integer", "uint64"].includes(statement.indexType)) {
          eligible = false;
        }
      }
      if (statement.kind.startsWith("uint64.buffer.")) {
        if (statement.bufferType !== "UInt64Buffer" &&
            statement.kind !== "uint64.buffer.copy") eligible = false;
        if (["uint64.buffer.get", "uint64.buffer.set"].includes(statement.kind) &&
            !["Integer", "uint64"].includes(statement.indexType)) {
          eligible = false;
        }
      }
      if ((statement.kind === "ffi.call" ||
          statement.kind === "ffi.arena.resource.allocate") &&
          !FMPZ_FFI_DECLARATIONS.has(statement.foreign?.declarationId)) {
        eligible = false;
      }
      if (statement.kind === "bool.short_circuit") {
        visit(statement.right.operations);
      }
    }
  }
  visit(fn.body);
  if (!eligible) return null;

  let zeroBoundedVectors = true;
  walkStatements(fn.body, {
    loop() {},
    operation(operation) {
      if (operation.kind === "integer.arena.vector.allocate" &&
          constants.get(operation.maximumBits) !== "0") {
        zeroBoundedVectors = false;
      }
    },
    read() {},
    write() {},
  });
  if (!zeroBoundedVectors) return null;
  if (
    arenas === 1 && vectors > 0 &&
    fn.params.every(scalarParameter)
  ) return { role: "root" };
  if (
    arenas === 0 && vectors === 0 &&
    fn.params.every((param) =>
      ["Integer", "uint64", "bool"].includes(param.type) ||
      borrowedAggregateParameter(param)
    ) &&
    fn.locals.every((local) =>
      ["Integer", "uint64", "bool", "UInt64Buffer"].includes(local.type)
    )
  ) {
    return {
      role: "helper",
      borrowedAggregates: fn.params.some(borrowedAggregateParameter),
    };
  }
  return null;
}

function fmpzBackendPolicy(fn) {
  const inspection = inspectFmpzFunction(fn);
  if (inspection?.role !== "root" || fn.dependencies.length !== 0) return null;
  const packedBuffers = fn.params.some((param) =>
    param.type === "IntegerBuffer"
  );
  return {
    kind: "fmpz",
    reason: packedBuffers
      ? "a closed unbounded exact arena is qualified for direct packed-limb fmpz ingress and publication"
      : "a closed unbounded exact arena is qualified for inline-promoting FLINT fmpz storage",
    requiresExactWorkspace: true,
    qualification: packedBuffers
      ? "direct-fmpz-packed-buffer-call-graph-v3"
      : "direct-fmpz-vector-matrix-v1",
  };
}

function fmpzClosedCallGraphPolicies(functions, recursive) {
  const exact = new Map(
    functions
      .filter((fn) => fn.kernelKind === "integer")
      .map((fn) => [fn.name, fn]),
  );
  const inspections = new Map(
    Array.from(exact, ([name, fn]) => [name, inspectFmpzFunction(fn)]),
  );
  const policies = new Map();
  for (const [rootName, root] of exact) {
    if (inspections.get(rootName)?.role !== "root" ||
        recursive.has(rootName)) continue;
    const selected = new Set([rootName]);
    const visiting = new Set();
    const qualified = new Set();
    function qualify(name, isRoot = false) {
      if (qualified.has(name)) return true;
      if (visiting.has(name) || recursive.has(name)) return false;
      const fn = exact.get(name);
      const inspection = inspections.get(name);
      if (fn === undefined || inspection === null || inspection === undefined ||
          (!isRoot && inspection.role !== "helper")) return false;
      visiting.add(name);
      for (const dependency of fn.dependencies) {
        if (!qualify(dependency)) {
          visiting.delete(name);
          return false;
        }
      }
      visiting.delete(name);
      qualified.add(name);
      selected.add(name);
      return true;
    }
    if (!qualify(rootName, true)) continue;
    const packedBuffers = root.params.some((param) =>
      param.type === "IntegerBuffer"
    );
    const borrowedAggregates = Array.from(qualified).some((name) =>
      inspections.get(name)?.borrowedAggregates
    );
    policies.set(rootName, root.dependencies.length === 0
      ? fmpzBackendPolicy(root)
      : {
          kind: "fmpz",
          reason: borrowedAggregates
            ? "a closed exact call graph is qualified for borrowed resident fmpz vectors and matrices"
            : packedBuffers
            ? "a closed exact call graph is qualified for direct packed-limb fmpz ingress and publication"
            : "a closed exact call graph is qualified for inline-promoting FLINT fmpz storage",
          requiresExactWorkspace: true,
          qualification: borrowedAggregates
            ? "direct-fmpz-borrowed-aggregate-call-graph-v4"
            : packedBuffers
            ? "direct-fmpz-packed-buffer-call-graph-v3"
            : "direct-fmpz-vector-matrix-call-graph-v2",
        });
    for (const name of selected) {
      if (name === rootName) continue;
      policies.set(name, {
        kind: "fmpz",
        reason:
          "a helper is transitively contained in a qualified closed fmpz exact program",
        requiresExactWorkspace: false,
        qualification: borrowedAggregates
          ? "direct-fmpz-borrowed-aggregate-helper-call-graph-v4"
          : "direct-fmpz-helper-call-graph-v2",
      });
    }
  }
  return policies;
}

function residentCodeQualityAnalysis(fn) {
  const exactBridges = new Set();
  let exactBridgeCalls = 0;
  let exactBridgeLoopCalls = 0;
  let eliminatedFmpzConversions = 0;
  let fusedExactUpdates = 0;
  let allocationFreeLoopCalls = 0;
  let authenticatedBorrows = 0;
  function visit(statements, loopDepth = 0) {
    for (const operation of statements || []) {
      const nextDepth = loopDepth + (operation.kind.startsWith("loop.") ? 1 : 0);
      if (operation.kind === "ffi.arena.resource.allocate" &&
          operation.resource?.resourceId?.includes("workspace_borrow")) {
        authenticatedBorrows += 1;
      }
      if (operation.kind === "ffi.call" &&
          typeof operation.foreign?.function?.native?.exact_symbol === "string") {
        const foreign = operation.foreign.function;
        exactBridgeCalls += 1;
        if (loopDepth > 0) exactBridgeLoopCalls += 1;
        exactBridges.add(foreign.native.exact_symbol);
        eliminatedFmpzConversions += foreign.native.arguments.filter(
          (argument) => argument.abi_type === "fmpz_t",
        ).length;
        if (foreign.effects.writes.length > 0 &&
            foreign.signature.parameters.filter(
              (parameter) => parameter.type === "Integer",
            ).length >= 2) {
          fusedExactUpdates += 1;
        }
        if (loopDepth > 0 && foreign.effects.may_allocate === false) {
          allocationFreeLoopCalls += 1;
        }
      }
      visit(operation.condition?.operations, loopDepth);
      visit(operation.right?.operations, loopDepth);
      visit(operation.body, nextDepth);
      visit(operation.alternative, nextDepth);
    }
  }
  visit(fn.body);
  if (exactBridgeCalls === 0 && authenticatedBorrows === 0) return undefined;
  return {
    authenticatedBorrows,
    authenticationPlacement: authenticatedBorrows === 1
      ? "once-before-resident-operations" : "not-proved-single",
    hoistedInvariants: authenticatedBorrows === 1 ? [
      "exclusive-mutable-borrow",
      "generation",
      "owner-open-state",
      "specification-identity",
    ] : [],
    exactBridgeCalls,
    exactBridgeLoopCalls,
    exactBridgeSymbols: Array.from(exactBridges).sort(),
    eliminatedFmpzConversions,
    fusedExactUpdates,
    allocationFreeLoopCalls,
    scratchPolicy: fusedExactUpdates > 0
      ? "one-owner-preallocated-nonoverlapping-product-and-result"
      : "not-applicable",
    cleanup: authenticatedBorrows > 0
      ? "reverse-owner-order-on-success-error-cancellation-and-publication-failure"
      : "ordinary-generated-cleanup",
  };
}

function backendPolicy(fn, profile, recursive, fmpzPolicies = new Map()) {
  const fmpz = fmpzPolicies.get(fn.name) || fmpzBackendPolicy(fn);
  if (fmpz !== null) return fmpz;
  if (fn.params.some((param) => param.type === "NativeIntegerVector")) {
    return {
      kind: "gmp",
      reason: "a borrowed resident exact vector stays in its owning GMP arena",
      requiresExactWorkspace: true,
    };
  }
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
    fn.params.every((param) =>
      !["Integer", "IntegerBuffer"].includes(param.type)
    )
  ) {
    return {
      kind: "tagged",
      reason: "bounded uint64 operations execute in the isolated native core",
    };
  }
  if (
    profile.uint64ArithmeticOperations > 0 &&
    profile.rangeLoops + profile.whileLoops > 0 &&
    fn.params.every((param) =>
      !["Integer", "IntegerBuffer"].includes(param.type)
    )
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
  for (const fn of functions) {
    if (fn.kernelKind === "integer") introduceResidentBorrows(fn);
  }
  const recursive = recursiveFunctions(functions);
  const fmpzPolicies = fmpzClosedCallGraphPolicies(functions, recursive);
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
    let backend = backendPolicy(
      fn,
      profile,
      recursive.has(fn.name),
      fmpzPolicies,
    );
    if (
      profile.rangeLoops > 0 &&
      !["fmpz", "gmp", "integer-buffer-values"].includes(backend.kind)
    ) {
      backend = {
        kind: "tagged",
        reason: "an exact range loop amortizes tagged native entry",
      };
    }
    const effect = effects.get(fn.name);
    const residentCodeQuality = residentCodeQualityAnalysis(fn);
    const borrowedFmpzAggregates = fn.params.some((param) =>
      (profile.liveExactScopes === 0 &&
        ["IntegerBuffer", "UInt64Buffer"].includes(param.type)) ||
      param.type === "NativeIntegerVector" ||
      (fn.foreignResources || []).some((resource) =>
        FMPZ_RESOURCE_IDS.has(resource.id) &&
        (resource.compiler_type || resource.python_name) === param.type
      )
    );
    fn.analysis = {
      storage: storageAnalysis(fn),
      execution: { ...profile, recursive: recursive.has(fn.name) },
      backend,
      effects: effect,
      taggedInteger: taggedIntegerProof(fn, effect),
      ...(profile.liveExactScopes > 0
        ? { liveExactWorkspace: liveExactWorkspaceAnalysis(fn, backend) }
        : {}),
      ...(backend.kind === "fmpz" ? {
        fmpzExact: {
          semanticType: "Integer",
          representation: "flint-fmpz-inline-word-with-gmp-promotion",
          residentContainers: profile.liveExactScopes > 0
            ? fn.params.some((param) => param.type === "IntegerBuffer")
              ? "inline-promoting-fmpz-vector-and-borrowed-packed-integer-buffer"
              : "inline-promoting-fmpz-vector"
            : borrowedFmpzAggregates
              ? "caller-owned-borrowed-fmpz-aggregates"
            : "caller-owned-fmpz-values",
          promotion: "transparent-and-owning",
          ffiBoundary: "direct-fmpz_t",
          hostBoundary: profile.liveExactScopes > 0
            ? fn.params.some((param) => param.type === "IntegerBuffer")
              ? "borrowed-packed-limb-views-plus-one-mpz-fmpz-scalar-conversion-on-entry-and-exit"
              : "one-mpz-fmpz-conversion-on-entry-and-exit"
            : borrowedFmpzAggregates
              ? "none-internal-borrowed-aggregate-only"
            : "mpz-fmpz-conversion-only-when-the-helper-is-called-from-the-host",
          cleanup: "clear-promoted-values-before-flint-cache-drain-and-arena-rewind",
          qualification: backend.qualification,
        },
      } : {}),
      ...(residentCodeQuality === undefined ? {} : { residentCodeQuality }),
      ...(hasUint64Bitwise(fn.body) ? { uint64: UINT64_SEMANTICS } : {}),
    };
    if (
      backend.kind === "fmpz" &&
      borrowedFmpzAggregates
    ) {
      // These values are borrowed only inside one qualified closed native
      // program.  They deliberately never acquire a public aggregate ABI.
      fn.hostCallable = false;
    }
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
  fmpzBackendPolicy,
  residentCodeQualityAnalysis,
};
