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
  function gather(value, key = "") {
    if (key !== "kind" && typeof value === "string") answer.add(value);
    else if (Array.isArray(value)) value.forEach((child) => gather(child));
    else if (value !== null && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) gather(child, childKey);
    }
  }
  gather(operation);
  return answer;
}

function privateIntegerBufferPlan(functions, root, requested) {
  if (!Array.isArray(functions) || functions[0] !== root ||
      new Set(functions).size !== functions.length) return undefined;
  const names = [...new Set(requested)].sort();
  if (names.length === 0) return undefined;
  const params = new Map(root.params.map((param) => [param.name, param.type]));
  if (names.some((name) => params.get(name) !== "IntegerBuffer")) return undefined;
  const graphNames = new Set(functions.map((fn) => fn.name));
  const tracked = new Set(names);
  let rejected = false;
  for (const fn of functions) {
    visit(fn.body, (operation) => {
      if (rejected) return;
      const references = referencedNames(operation);
      if (![...references].some((name) => tracked.has(name))) return;
      if (!SAFE_OPERATIONS.has(operation.kind)) { rejected = true; return; }
      if (operation.kind === "integer.buffer.copy" ||
          operation.kind === "integer.buffer.view") {
        if (typeof operation.target !== "string") { rejected = true; return; }
        tracked.add(operation.target);
      }
      if (operation.kind === "native.call") {
        const callee = operation.function || operation.callee || operation.name;
        if (!graphNames.has(callee)) rejected = true;
      }
    });
    visit(fn.body, (operation) => {
      if (operation.kind !== "return") return;
      if ([...referencedNames(operation)].some((name) => tracked.has(name))) {
        rejected = true;
      }
    });
  }
  if (rejected) return undefined;
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
  privateIntegerBufferPlan,
  privateIntegerBufferPlanAuthorized,
};
