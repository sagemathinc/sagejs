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
    case "integer.round_sqrt":
    case "bool.not":
    case "uint64.truth":
      return [operation.source];
    case "integer.pow_uint":
      return [operation.base];
    case "integer.binary":
    case "integer.divmod":
    case "integer.compare":
    case "bool.compare":
    case "bool.binary":
      return [operation.left, operation.right];
    case "integer.sequence.get":
      return [operation.index];
    case "native.call":
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
        operation.kind === "integer.pow_uint" ||
        operation.kind === "integer.divmod" ||
        operation.kind === "integer.round_sqrt"
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

function localEffects(fn) {
  const mayRaise = new Set();
  let localWrites = 0;
  walkStatements(fn.body, {
    loop() {},
    operation(operation) {
      localWrites += operationTargets(operation).length;
      if (
        operation.kind === "integer.divmod" ||
        (operation.kind === "integer.binary" &&
          ["floordiv", "mod"].includes(operation.operation))
      ) {
        mayRaise.add("ZeroDivisionError");
      }
      if (operation.kind === "integer.round_sqrt") {
        mayRaise.add("ValueError");
        mayRaise.add("OverflowError");
      }
      if (operation.kind === "integer.sequence.get") {
        mayRaise.add("IndexError");
      }
      if (operation.kind === "raise") mayRaise.add(operation.errorType);
    },
    read() {},
    write() {
      localWrites += 1;
    },
  });
  return {
    pure: true,
    deterministic: true,
    localWrites,
    externalWrites: [],
    calls: [...fn.dependencies],
    mayRaise: Array.from(mayRaise).filter(Boolean).sort(),
    replaySafe: true,
  };
}

function effectAnalyses(functions) {
  const exact = new Map(
    functions
      .filter((fn) => fn.kernelKind === "integer")
      .map((fn) => [fn.name, fn]),
  );
  const effects = new Map(
    Array.from(exact, ([name, fn]) => [name, localEffects(fn)]),
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
    }
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
    },
    read() {},
    write() {},
  });
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
    directCalls: [...fn.dependencies],
    effectsChecked: effects.pure && effects.deterministic &&
      effects.externalWrites.length === 0,
    proof:
      "every exact value is tagged; checked int64 failure promotes live values before the operation continues",
  };
}

function backendPolicy(fn, profile, recursive) {
  if (recursive) {
    return {
      kind: "tagged",
      reason: "lazy tagged recursive frames avoid allocating GMP values",
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
    if (profile.rangeLoops > 0 && backend.kind !== "gmp") {
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
    };
  }
  return functions;
}

module.exports = {
  analyzeExactModule,
  backendPolicy,
  effectAnalyses,
  executionProfile,
  localEffects,
  storageAnalysis,
  taggedIntegerProof,
};
