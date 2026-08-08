"use strict";

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
    case "bool.not":
    case "uint64.truth":
      return [operation.source];
    case "integer.pow_uint":
      return [operation.base];
    case "integer.binary":
    case "integer.compare":
    case "bool.compare":
    case "bool.binary":
      return [operation.left, operation.right];
    case "native.call":
      return operation.arguments.map((argument) => argument.name);
    case "return":
      return [operation.value];
    default:
      return [];
  }
}

function operationTarget(operation) {
  return typeof operation.target === "string" ? operation.target : undefined;
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
    if (statement.kind === "loop.range") {
      handlers.loop("range");
      handlers.enterLoop?.("range");
      walkStatements(statement.body, handlers);
      handlers.exitLoop?.("range");
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
      const target = operationTarget(operation);
      if (integerParams.has(target)) mutatedParams.add(target);
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
      const target = operationTarget(operation);
      if (types.get(target) === "Integer") {
        touch(target);
        recordLoopUse(target);
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
  const profile = {
    arithmeticOperations: 0,
    nativeCalls: 0,
    rangeLoops: 0,
    whileLoops: 0,
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
        operation.kind === "integer.pow_uint"
      ) {
        profile.arithmeticOperations += 1;
      }
      if (operation.kind === "native.call") profile.nativeCalls += 1;
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

function backendPolicy(fn, profile, recursive) {
  if (recursive) {
    return {
      kind: "gmp",
      reason: "scratch-coalesced recursive exact frames favor direct GMP calls",
    };
  }
  if (
    profile.rangeLoops > 0 &&
    profile.nativeCalls > 0 &&
    profile.maximumConstantBits >= 128
  ) {
    return {
      kind: "gmp",
      reason: "a range loop repeatedly calls exact kernels on large constants",
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
      kind: "gmp",
      reason: "a complete arithmetic range loop amortizes the GMP boundary",
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
  for (const fn of functions) {
    if (fn.kernelKind !== "integer") continue;
    const profile = executionProfile(fn);
    fn.analysis = {
      storage: storageAnalysis(fn),
      execution: { ...profile, recursive: recursive.has(fn.name) },
      backend: backendPolicy(fn, profile, recursive.has(fn.name)),
    };
  }
  return functions;
}

module.exports = {
  analyzeExactModule,
  backendPolicy,
  executionProfile,
  storageAnalysis,
};
