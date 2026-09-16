"use strict";

/*
 * Compiler-owned structural proof authority.
 *
 * Optimizing analyses may prove facts about one operation only from facts
 * established elsewhere in its containing function.  An operation-local
 * marker therefore is not enough: changing an earlier definition must revoke
 * the proof at emission time.  This utility keeps authority outside portable
 * IR in a private WeakMap and binds it to a canonical snapshot of the complete
 * analyzed function plus a caller-supplied claim.
 *
 * The encoder is deliberately not JSON.  It preserves cycles, shared object
 * identity, sparse arrays, `undefined`, bigint values, and integer edge cases,
 * and length-prefixes every variable-size component.  Unsupported executable
 * values and accessors fail closed.
 */

function fail(message) {
  throw new Error(`invalid structural proof authority: ${message}`);
}

function framed(tag, value) {
  const text = String(value);
  return `${tag}${text.length}:${text}`;
}

function primitive(value) {
  if (value === undefined) return "u;";
  if (value === null) return "n;";
  if (typeof value === "boolean") return value ? "b1;" : "b0;";
  if (typeof value === "string") return framed("s", value);
  if (typeof value === "bigint") return framed("i", value.toString());
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "dnan;";
    if (value === Infinity) return "d+inf;";
    if (value === -Infinity) return "d-inf;";
    if (Object.is(value, -0)) return "d-0;";
    return framed("d", value.toString());
  }
  if (["function", "symbol"].includes(typeof value)) {
    fail(`unsupported ${typeof value} in proof scope`);
  }
  return undefined;
}

function canonicalStructuralEncoding(value, options = {}) {
  const ignoredKeys = new Set(options.ignoredKeys || []);
  const seen = new Map();

  function encode(current) {
    const scalar = primitive(current);
    if (scalar !== undefined) return scalar;
    if (typeof current !== "object") fail("unsupported proof value");
    if (seen.has(current)) return `r${seen.get(current)};`;
    const identity = seen.size;
    seen.set(current, identity);

    if (Array.isArray(current)) {
      const entries = [];
      for (let index = 0; index < current.length; index += 1) {
        entries.push(Object.hasOwn(current, index)
          ? framed("e", encode(current[index]))
          : "h;");
      }
      const extra = Object.keys(current)
        .filter((key) => !/^(0|[1-9][0-9]*)$/.test(key))
        .filter((key) => !ignoredKeys.has(key))
        .sort()
        .map((key) => framed("k", key) + framed("v", property(current, key)));
      return `a${identity};${current.length};${entries.join("")}` +
        `x${extra.length};${extra.join("")}`;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("proof scope must contain only plain objects and arrays");
    }
    const keys = Object.keys(current)
      .filter((key) => !ignoredKeys.has(key))
      .sort();
    const entries = keys.map((key) =>
      framed("k", key) + framed("v", property(current, key))
    );
    return `o${identity};${prototype === null ? "0" : "1"};` +
      `${entries.length};${entries.join("")}`;
  }

  function property(owner, key) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      fail("proof scope must not contain accessors");
    }
    return encode(descriptor.value);
  }

  return encode(value);
}

function containsIdentity(root, target, seen = new Set()) {
  if (root === target) return true;
  if (root === null || typeof root !== "object" || seen.has(root)) return false;
  seen.add(root);
  for (const key of Object.keys(root)) {
    const descriptor = Object.getOwnPropertyDescriptor(root, key);
    if (descriptor !== undefined && "value" in descriptor &&
        containsIdentity(descriptor.value, target, seen)) return true;
  }
  return false;
}

function validateFunction(fn) {
  if (fn === null || typeof fn !== "object" ||
      typeof fn.name !== "string" || !Array.isArray(fn.params) ||
      !Array.isArray(fn.body)) fail("scope must be a lowered function");
}

function createFunctionProofAuthority(options = {}) {
  const name = String(options.name || "unnamed proof");
  const ignoredKeys = Object.freeze([...(options.ignoredKeys || [])]);
  const records = new WeakMap();

  function snapshot(value) {
    return canonicalStructuralEncoding(value, { ignoredKeys });
  }

  return Object.freeze({
    authorize(fn, subject, claim) {
      validateFunction(fn);
      if (subject === null || typeof subject !== "object" ||
          !containsIdentity(fn, subject)) {
        fail(`${name} subject is outside its function`);
      }
      records.set(subject, Object.freeze({
        fn,
        functionSnapshot: snapshot(fn),
        claimSnapshot: snapshot(claim),
      }));
      return subject;
    },

    isAuthorized(fn, subject, claim) {
      if (fn === null || typeof fn !== "object" ||
          subject === null || typeof subject !== "object") return false;
      const record = records.get(subject);
      if (record === undefined || record.fn !== fn) return false;
      try {
        return containsIdentity(fn, subject) &&
          snapshot(fn) === record.functionSnapshot &&
          snapshot(claim) === record.claimSnapshot;
      } catch (_error) {
        return false;
      }
    },

    emissionVerifier(fn) {
      validateFunction(fn);
      let functionSnapshot;
      try {
        functionSnapshot = snapshot(fn);
      } catch (_error) {
        return Object.freeze({ isAuthorized() { return false; } });
      }
      // Generated-code emission is a synchronous, read-only traversal.  Take
      // its complete function snapshot once rather than re-encoding a large
      // body for every proved operation in that traversal.
      return Object.freeze({
        isAuthorized(subject, claim) {
          if (subject === null || typeof subject !== "object") return false;
          const record = records.get(subject);
          if (record === undefined || record.fn !== fn ||
              record.functionSnapshot !== functionSnapshot) return false;
          try {
            return containsIdentity(fn, subject) &&
              snapshot(claim) === record.claimSnapshot;
          } catch (_error) {
            return false;
          }
        },
      });
    },

    revoke(subject) {
      if (subject !== null && typeof subject === "object") {
        records.delete(subject);
      }
    },
  });
}

module.exports = {
  canonicalStructuralEncoding,
  createFunctionProofAuthority,
};
