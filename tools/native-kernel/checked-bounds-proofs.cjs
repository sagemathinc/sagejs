"use strict";

/*
 * Checked span proofs are deliberately narrower than general interval
 * analysis. A checked view establishes its length once; either a constant
 * int64 range or an exact `range(view_length)` relationship establishes every
 * value of its iterator. Native backends may omit an element bounds check only
 * when this module has independently reconstructed and verified the complete
 * serialized claim.
 */

const VERIFIED_FIXED_SPAN_ACCESS = Symbol("verified fixed-span access");
const AUTHORITY = "checked-uint64-fixed-span-range-v1";
const DYNAMIC_AUTHORITY = "checked-uint64-span-stop-range-v1";
const REVERSED_DYNAMIC_AUTHORITY = "checked-uint64-reversed-span-range-v1";
const INT64_MINIMUM = -(1n << 63n);
const INT64_MAXIMUM = (1n << 63n) - 1n;
const {
  operationTargets,
  walkStatements,
} = require("./exact-analysis.cjs");

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function constantRange(start, stop, step) {
  if (step === 0n || start < INT64_MINIMUM || start > INT64_MAXIMUM ||
      stop < INT64_MINIMUM || stop > INT64_MAXIMUM ||
      step < INT64_MINIMUM || step > INT64_MAXIMUM) return undefined;
  let iterations = 0n;
  if (step > 0n && start < stop) {
    iterations = (stop - start + step - 1n) / step;
  } else if (step < 0n && start > stop) {
    const magnitude = -step;
    iterations = (start - stop + magnitude - 1n) / magnitude;
  }
  if (iterations === 0n) return undefined;
  const last = start + (iterations - 1n) * step;
  if (last < INT64_MINIMUM || last > INT64_MAXIMUM) return undefined;
  return {
    start,
    stop,
    step,
    iterations,
    minimum: start < last ? start : last,
    maximum: start > last ? start : last,
  };
}

function copiedConstant(operation, constants) {
  if (["integer.constant", "int64.constant", "uint64.constant"].includes(
    operation.kind,
  )) return BigInt(operation.value);
  if (["integer.copy", "int64.copy", "uint64.copy"].includes(operation.kind)) {
    return constants.get(operation.source);
  }
  return undefined;
}

function copiedValue(operation, values) {
  if (["integer.constant", "int64.constant", "uint64.constant"].includes(
    operation.kind,
  )) return `constant:${operation.value}`;
  if ([
    "integer.copy",
    "int64.copy",
    "uint64.copy",
    "integer.from_int64",
    "integer.from_uint64",
    "int64.from_integer_checked",
    "int64.from_uint64_checked",
    "uint64.from_integer_checked",
    "uint64.from_int64_checked",
  ].includes(operation.kind)) return values.get(operation.source);
  return undefined;
}

function copiedExpression(operation, values, expressions) {
  if (["integer.constant", "int64.constant", "uint64.constant"].includes(
    operation.kind,
  )) return { kind: "constant", value: BigInt(operation.value) };
  if ([
    "integer.copy",
    "int64.copy",
    "uint64.copy",
    "integer.from_int64",
    "integer.from_uint64",
    "integer.from_int64_checked",
    "integer.from_uint64_checked",
    "int64.from_integer_checked",
    "int64.from_uint64_checked",
    "uint64.from_integer_checked",
    "uint64.from_int64_checked",
  ].includes(operation.kind)) {
    return expressions.get(operation.source) || (
      values.has(operation.source)
        ? { kind: "value", value: values.get(operation.source) }
        : undefined
    );
  }
  if (operation.kind !== "int64.binary" || operation.operation !== "sub") {
    return undefined;
  }
  const left = expressions.get(operation.left) || (
    values.has(operation.left)
      ? { kind: "value", value: values.get(operation.left) }
      : undefined
  );
  const right = expressions.get(operation.right);
  if (left === undefined || right === undefined) return undefined;
  if (right.kind === "constant" && right.value === 1n &&
      left.kind === "value") {
    return { kind: "minus-one", value: left.value };
  }
  return { kind: "subtract", left, rightName: operation.right };
}

function assignedTargets(statements, targets = new Set()) {
  walkStatements(statements || [], {
    loop() {},
    operation(operation) {
      for (const target of operationTargets(operation)) targets.add(target);
    },
    read() {},
    write(name) {
      targets.add(name);
    },
  });
  return targets;
}

function clearVerifiedMarkers(functions) {
  for (const fn of functions || []) {
    walkStatements(fn.body || [], {
      loop() {},
      operation(operation) {
        delete operation[VERIFIED_FIXED_SPAN_ACCESS];
      },
      read() {},
      write() {},
    });
  }
}

function expectedProof(operation, views, expressions, activeRange) {
  if (!["uint64.buffer.get", "uint64.buffer.set"].includes(operation.kind) ||
      operation.indexType !== "int64" || activeRange === undefined) {
    return undefined;
  }
  const view = views.get(operation.buffer);
  if (view === undefined) return undefined;
  const reverse = expressions.get(operation.index);
  if (activeRange.kind === "span-stop" &&
      activeRange.start === 0n && activeRange.step === 1n &&
      activeRange.stopValue !== undefined &&
      activeRange.stopValue === view.lengthValue &&
      reverse?.kind === "subtract" &&
      reverse.left?.kind === "minus-one" &&
      reverse.left.value === activeRange.stopValue &&
      reverse.rightName === activeRange.index) {
    return {
      authority: REVERSED_DYNAMIC_AUTHORITY,
      accessOperation: operation.id,
      viewOperation: view.operation,
      rangeOperation: activeRange.operation,
      buffer: operation.buffer,
      index: operation.index,
      indexType: "int64",
      viewLengthValue: view.lengthValue,
      rangeStopValue: activeRange.stopValue,
      rangeIndex: activeRange.index,
      start: "0",
      step: "1",
      relation: "index = checked-view-length - 1 - range-index",
    };
  }
  if (operation.index !== activeRange.index) return undefined;
  if (activeRange.kind === "span-stop" &&
      activeRange.start === 0n && activeRange.step === 1n &&
      activeRange.stopValue !== undefined &&
      activeRange.stopValue === view.lengthValue) {
    return {
      authority: DYNAMIC_AUTHORITY,
      accessOperation: operation.id,
      viewOperation: view.operation,
      rangeOperation: activeRange.operation,
      buffer: operation.buffer,
      index: operation.index,
      indexType: "int64",
      viewLengthValue: view.lengthValue,
      rangeStopValue: activeRange.stopValue,
      start: "0",
      step: "1",
      relation: "0 <= index < checked-view-length",
    };
  }
  if (activeRange.kind !== "constant" || view.length === undefined ||
      activeRange.minimum < 0n || activeRange.maximum >= view.length) {
    return undefined;
  }
  return {
    authority: AUTHORITY,
    accessOperation: operation.id,
    viewOperation: view.operation,
    rangeOperation: activeRange.operation,
    buffer: operation.buffer,
    index: operation.index,
    indexType: "int64",
    viewLength: view.length.toString(),
    start: activeRange.start.toString(),
    stop: activeRange.stop.toString(),
    step: activeRange.step.toString(),
    iterations: activeRange.iterations.toString(),
    minimum: activeRange.minimum.toString(),
    maximum: activeRange.maximum.toString(),
  };
}

function processFunction(fn, attach, verified) {
  function visit(
    statements,
    inheritedConstants,
    inheritedValues,
    inheritedExpressions,
    inheritedViews,
    activeRange,
  ) {
    const constants = new Map(inheritedConstants);
    const values = new Map(inheritedValues);
    const expressions = new Map(inheritedExpressions);
    const views = new Map(inheritedViews);
    for (const operation of statements || []) {
      const expected = expectedProof(operation, views, expressions, activeRange);
      if (operation.boundsProof !== undefined) {
        if (expected === undefined || !same(operation.boundsProof, expected)) {
          throw new Error(
            `${fn.name}: invalid checked bounds proof at ${operation.id || "unknown operation"}`,
          );
        }
      } else if (attach && expected !== undefined) {
        operation.boundsProof = expected;
      }
      if (!attach && operation.boundsProof !== undefined) verified.push(operation);

      const constant = copiedConstant(operation, constants);
      const copied = copiedValue(operation, values);
      const expression = copiedExpression(
        operation,
        values,
        expressions,
      );
      const inheritedView = operation.kind === "uint64.buffer.copy"
        ? views.get(operation.source) : undefined;
      const viewLength = operation.kind === "uint64.buffer.view"
        ? constants.get(operation.length) : undefined;
      const viewLengthValue = operation.kind === "uint64.buffer.view"
        ? values.get(operation.length) : undefined;
      for (const target of operationTargets(operation)) {
        constants.delete(target);
        values.delete(target);
        expressions.delete(target);
        views.delete(target);
      }
      if (constant !== undefined) constants.set(operation.target, constant);
      if (copied !== undefined) values.set(operation.target, copied);
      if (expression !== undefined) expressions.set(operation.target, expression);
      for (const target of operationTargets(operation)) {
        if (!values.has(target)) values.set(target, `operation:${operation.id}:${target}`);
      }
      if (inheritedView !== undefined) views.set(operation.target, inheritedView);
      if ((viewLength !== undefined && viewLength >= 0n) ||
          viewLengthValue !== undefined) {
        views.set(operation.target, {
          length: viewLength,
          lengthValue: viewLengthValue,
          operation: operation.id,
        });
      }

      if (operation.kind === "loop.range_int64") {
        const start = constants.get(operation.start);
        const stop = constants.get(operation.stop);
        const step = constants.get(operation.step);
        const stopValue = values.get(operation.stop);
        const constant = start === undefined || stop === undefined || step === undefined
          ? undefined : constantRange(start, stop, step);
        const range = constant !== undefined
          ? { ...constant, kind: "constant" }
          : start !== undefined && step !== undefined && stopValue !== undefined
            ? { kind: "span-stop", start, step, stopValue }
            : undefined;
        const assigned = assignedTargets(operation.body);
        const loopValues = new Map(
          Array.from(values).filter(([name]) => !assigned.has(name)),
        );
        const loopExpressions = new Map(
          Array.from(expressions).filter(([name]) => !assigned.has(name)),
        );
        const loopViews = new Map(
          Array.from(views).filter(([name]) => !assigned.has(name)),
        );
        const loopRange = range === undefined || assigned.has(operation.index)
          ? undefined : {
          ...range,
          index: operation.index,
          operation: operation.id,
        };
        visit(
          operation.body,
          constants,
          loopValues,
          loopExpressions,
          loopViews,
          loopRange,
        );
        assigned.add(operation.index);
        if (operation.iterator !== undefined) assigned.add(operation.iterator);
        for (const name of assigned) {
          constants.delete(name);
          values.delete(name);
          expressions.delete(name);
          views.delete(name);
        }
      } else if (operation.kind === "if") {
        visit(
          operation.condition?.operations,
          constants,
          values,
          expressions,
          views,
          activeRange,
        );
        visit(operation.body, constants, values, expressions, views, activeRange);
        visit(
          operation.alternative,
          constants,
          values,
          expressions,
          views,
          activeRange,
        );
        constants.clear();
        values.clear();
        expressions.clear();
        views.clear();
      } else if (operation.kind === "while" ||
          operation.kind === "loop.range" ||
          operation.kind === "loop.range_exact") {
        visit(
          operation.condition?.operations,
          constants,
          values,
          expressions,
          views,
          undefined,
        );
        visit(operation.body, constants, values, expressions, views, undefined);
        constants.clear();
        values.clear();
        expressions.clear();
        views.clear();
      } else if (operation.kind === "bool.short_circuit") {
        visit(
          operation.right?.operations,
          constants,
          values,
          expressions,
          views,
          activeRange,
        );
        constants.clear();
        values.clear();
        expressions.clear();
        views.clear();
      } else if (operation.kind === "integer.vector.scope" ||
          operation.kind === "integer.matrix.scope" ||
          operation.kind === "integer.arena.scope") {
        const assigned = assignedTargets([
          ...(operation.setup || []),
          ...(operation.body || []),
        ]);
        const scopeViews = new Map(
          Array.from(views).filter(([name]) => !assigned.has(name)),
        );
        const scopeValues = new Map(
          Array.from(values).filter(([name]) => !assigned.has(name)),
        );
        const scopeExpressions = new Map(
          Array.from(expressions).filter(([name]) => !assigned.has(name)),
        );
        visit(
          operation.setup,
          constants,
          scopeValues,
          scopeExpressions,
          scopeViews,
          undefined,
        );
        visit(
          operation.body,
          constants,
          scopeValues,
          scopeExpressions,
          scopeViews,
          undefined,
        );
        constants.clear();
        values.clear();
        expressions.clear();
        views.clear();
      }
    }
  }
  const parameterValues = new Map(
    (fn.params || []).map((parameter) => [
      parameter.name,
      `parameter:${parameter.name}`,
    ]),
  );
  const parameterExpressions = new Map(
    Array.from(parameterValues, ([name, value]) => [
      name,
      { kind: "value", value },
    ]),
  );
  visit(
    fn.body,
    new Map(),
    parameterValues,
    parameterExpressions,
    new Map(),
    undefined,
  );
}

function attachAndVerifyCheckedBoundsProofs(functions) {
  for (const fn of functions || []) processFunction(fn, true, []);
  return verifyCheckedBoundsProofs(functions);
}

function verifyCheckedBoundsProofs(functions) {
  clearVerifiedMarkers(functions);
  const verified = [];
  for (const fn of functions || []) processFunction(fn, false, verified);
  for (const operation of verified) {
    Object.defineProperty(operation, VERIFIED_FIXED_SPAN_ACCESS, {
      configurable: true,
      value: true,
    });
  }
  return functions;
}

function isVerifiedFixedSpanAccess(operation) {
  return operation?.[VERIFIED_FIXED_SPAN_ACCESS] === true;
}

module.exports = {
  attachAndVerifyCheckedBoundsProofs,
  isVerifiedFixedSpanAccess,
  verifyCheckedBoundsProofs,
};
