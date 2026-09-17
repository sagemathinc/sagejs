"use strict";

/*
 * Proof authority for a future private, noncanonical IntegerBuffer region.
 *
 * This module deliberately emits no code.  It defines the fail-closed graph
 * contract that an emitter must possess before it may omit spare-limb clears.
 * Public IntegerBuffer semantics remain canonical until an emitter consumes
 * an authorized plan and inserts the prescribed exit canonicalization.
 */

const {
  createFunctionGraphProofAuthority,
} = require("./structural-proof-authority.cjs");

const authority = createFunctionGraphProofAuthority({
  name: "private noncanonical IntegerBuffer",
});

const SAFE_OPERATIONS = new Set([
  "integer.buffer.get",
  "integer.buffer.set",
  "integer.buffer.length",
  "integer.buffer.copy",
  "integer.buffer.view",
  "native.call",
]);

function visit(value, callback, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (typeof value.kind === "string") callback(value);
  if (Array.isArray(value)) {
    for (const child of value) visit(child, callback, seen);
  } else {
    for (const child of Object.values(value)) visit(child, callback, seen);
  }
}

function referencedNames(operation) {
  const answer = new Set();
  function gather(value, key = "", root = false) {
    // Structured control-flow nodes contain complete child operations. Each
    // child is visited independently; attributing all descendant names to the
    // container would reject an otherwise safe loop/branch as an escape.
    if (!root && value !== null && typeof value === "object" &&
        typeof value.kind === "string") return;
    if (key !== "kind" && typeof value === "string") answer.add(value);
    else if (Array.isArray(value)) value.forEach((child) => gather(child));
    else if (value !== null && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) gather(child, childKey);
    }
  }
  gather(operation, "", true);
  return answer;
}

function privateIntegerBufferClassification(functions, root, requested) {
  if (!Array.isArray(functions) || functions[0] !== root ||
      new Set(functions).size !== functions.length) return undefined;
  const params = new Map(root.params.map((param) => [param.name, param.type]));
  const names = requested === undefined
    ? root.params.filter((param) => param.type === "IntegerBuffer")
      .map((param) => param.name).sort()
    : [...new Set(requested)].sort();
  if (names.length === 0 ||
      names.some((name) => params.get(name) !== "IntegerBuffer")) return undefined;
  const graphNames = new Set(functions.map((fn) => fn.name));
  const byName = new Map(functions.map((fn) => [fn.name, fn]));
  const trackedByFunction = new Map(functions.map((fn) => [fn.name, new Map()]));
  const rootTracked = trackedByFunction.get(root.name);
  for (const name of names) rootTracked.set(name, new Set([name]));
  const rejected = new Map();
  const writes = new Map(names.map((name) => [name, new Set()]));
  function labels(fn, value) {
    const tracked = trackedByFunction.get(fn.name);
    const result = new Set();
    for (const name of referencedNames(value)) {
      for (const label of tracked.get(name) || []) result.add(label);
    }
    return result;
  }
  function reject(found, reason) {
    for (const name of found) if (!rejected.has(name)) rejected.set(name, reason);
  }
  function addLabels(target, found) {
    let answer = target;
    if (answer === undefined) answer = new Set();
    const before = answer.size;
    for (const name of found) answer.add(name);
    return { answer, changed: answer.size !== before };
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of functions) {
      const tracked = trackedByFunction.get(fn.name);
      visit(fn.body, (operation) => {
        const found = labels(fn, operation);
        if (found.size === 0) return;
        if (!SAFE_OPERATIONS.has(operation.kind)) {
          reject(found, `operation:${operation.kind}`);
          return;
        }
        if (operation.kind === "integer.buffer.set") {
          for (const name of labels(fn, operation.buffer)) {
            writes.get(name).add(operation);
          }
        }
        if (operation.kind === "integer.buffer.copy" ||
            operation.kind === "integer.buffer.view") {
          if (typeof operation.target !== "string") {
            reject(found, `${operation.kind}:missing-target`);
            return;
          }
          const added = addLabels(tracked.get(operation.target), found);
          tracked.set(operation.target, added.answer);
          changed ||= added.changed;
        }
        if (operation.kind !== "native.call") return;
        const calleeName = operation.function || operation.callee || operation.name;
        const callee = byName.get(calleeName);
        if (!graphNames.has(calleeName) || callee === undefined) {
          reject(found, `native.call:unknown:${calleeName}`);
          return;
        }
        const args = operation.arguments || operation.args;
        if (!Array.isArray(args) || args.length !== callee.params.length) {
          reject(found, `native.call:signature:${calleeName}`);
          return;
        }
        const calleeTracked = trackedByFunction.get(calleeName);
        for (let index = 0; index < args.length; index += 1) {
          const forwarded = labels(fn, args[index]);
          if (forwarded.size === 0) continue;
          const param = callee.params[index];
          if (param?.type !== "IntegerBuffer") {
            reject(forwarded, `native.call:non-buffer:${calleeName}:${index}`);
            continue;
          }
          const added = addLabels(calleeTracked.get(param.name), forwarded);
          calleeTracked.set(param.name, added.answer);
          changed ||= added.changed;
        }
      });
    }
  }
  for (const fn of functions) {
    visit(fn.body, (operation) => {
      if (operation.kind !== "return") return;
      reject(labels(fn, operation), `return:${fn.name}`);
    });
  }
  return Object.freeze(names.map((name) => Object.freeze({
    name,
    classification: rejected.has(name)
      ? "rejected" : writes.get(name).size === 0 ? "public" : "private",
    writeSites: writes.get(name).size,
    reason: rejected.get(name) || null,
  })));
}

function privateIntegerBufferPlan(functions, root, requested) {
  const classification = privateIntegerBufferClassification(
    functions, root, requested,
  );
  if (classification === undefined ||
      classification.some((entry) => entry.classification === "rejected")) {
    return undefined;
  }
  const names = classification.map((entry) => entry.name);
  const claim = Object.freeze({
    authority: "private-integer-buffer-v1",
    buffers: Object.freeze(names),
    canonicalizeAt: Object.freeze([
      "public-output", "raw-hash", "resume", "ffi", "fallback",
    ]),
    failurePublication: "canonicalize-before-publish",
  });
  authority.authorize(functions, root, root, claim);
  return claim;
}

function privateIntegerBufferPlanAuthorized(functions, root, claim) {
  return authority.isAuthorized(functions, root, root, claim);
}

module.exports = {
  privateIntegerBufferClassification,
  privateIntegerBufferPlan,
  privateIntegerBufferPlanAuthorized,
};
