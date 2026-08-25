"use strict";

const AUTOMATIC_SELECTION_SCHEMA = "sagejs.native-selection-receipt/v1";

function checkedName(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError(`${label} must be a Python identifier`);
  }
  return value;
}

function checkedBound(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function descriptorSelectionReceipts(descriptor) {
  const receipt = descriptor?.automatic_selection;
  if (receipt === undefined) return {};
  if (receipt?.schema !== AUTOMATIC_SELECTION_SCHEMA) {
    throw new TypeError(
      `${descriptor.id}.automatic_selection has an unsupported schema`,
    );
  }
  if (
    typeof receipt.receipt_id !== "string" ||
    !/^[a-z][a-z0-9-]*$/.test(receipt.receipt_id)
  ) {
    throw new TypeError(`${descriptor.id} has an invalid selection receipt id`);
  }
  if (typeof receipt.domain !== "string" || receipt.domain.length < 12) {
    throw new TypeError(`${descriptor.id} selection receipt needs a domain`);
  }
  if (
    !Array.isArray(receipt.evidence) || receipt.evidence.length === 0 ||
    receipt.evidence.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new TypeError(`${descriptor.id} selection receipt needs evidence`);
  }
  if (
    receipt.functions === null || typeof receipt.functions !== "object" ||
    Array.isArray(receipt.functions) ||
    Object.keys(receipt.functions).length === 0
  ) {
    throw new TypeError(`${descriptor.id} selection receipt needs functions`);
  }
  const declared = new Set(descriptor.functions ?? []);
  const result = {};
  for (const [rawName, workload] of Object.entries(receipt.functions)) {
    const name = checkedName(rawName, "selection function");
    if (!declared.has(name)) {
      throw new TypeError(`${descriptor.id} does not declare ${name}`);
    }
    const arguments_ = workload?.arguments;
    if (
      arguments_ === null || typeof arguments_ !== "object" ||
      Array.isArray(arguments_) || Object.keys(arguments_).length === 0
    ) {
      throw new TypeError(`${descriptor.id}:${name} needs argument bounds`);
    }
    const normalizedArguments = {};
    for (const [rawArgument, bounds] of Object.entries(arguments_)) {
      const argument = checkedName(rawArgument, "selection argument");
      const minimum = checkedBound(bounds?.min, `${name}.${argument}.min`);
      const maximum = checkedBound(bounds?.max, `${name}.${argument}.max`);
      if (maximum < minimum) {
        throw new RangeError(`${name}.${argument} has an empty selection range`);
      }
      normalizedArguments[argument] = { min: minimum, max: maximum };
    }
    result[name] = {
      schema: AUTOMATIC_SELECTION_SCHEMA,
      receiptId: receipt.receipt_id,
      domain: receipt.domain,
      operation: name,
      evidence: [...receipt.evidence],
      workload: { arguments: normalizedArguments },
    };
  }
  return result;
}

function normalizeAutomaticSelections(selections, ir) {
  if (
    selections === null || typeof selections !== "object" ||
    Array.isArray(selections)
  ) {
    throw new TypeError("automatic selections must be an object");
  }
  const functions = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const result = {};
  for (const [name, receipt] of Object.entries(selections)) {
    const fn = functions.get(name);
    if (fn === undefined) {
      throw new TypeError(`automatic selection names unknown function ${name}`);
    }
    if (
      receipt?.schema !== AUTOMATIC_SELECTION_SCHEMA ||
      receipt.operation !== name
    ) {
      throw new TypeError(`${name} has an invalid automatic selection receipt`);
    }
    const parameters = new Map(fn.params.map((param) => [param.name, param]));
    for (const [argument, bounds] of Object.entries(
      receipt.workload?.arguments ?? {},
    )) {
      const parameter = parameters.get(argument);
      if (parameter?.type !== "uint64") {
        throw new TypeError(
          `${name} selection argument ${argument} is not a uint64 parameter`,
        );
      }
      checkedBound(bounds?.min, `${name}.${argument}.min`);
      checkedBound(bounds?.max, `${name}.${argument}.max`);
    }
    result[name] = structuredClone(receipt);
  }
  return result;
}

function mergeAutomaticSelections(target, additions, label) {
  for (const [name, receipt] of Object.entries(additions)) {
    if (Object.hasOwn(target, name)) {
      throw new TypeError(`duplicate automatic selection ${label}:${name}`);
    }
    target[name] = receipt;
  }
  return target;
}

module.exports = {
  AUTOMATIC_SELECTION_SCHEMA,
  descriptorSelectionReceipts,
  mergeAutomaticSelections,
  normalizeAutomaticSelections,
};
