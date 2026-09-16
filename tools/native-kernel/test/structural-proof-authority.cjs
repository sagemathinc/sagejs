"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canonicalStructuralEncoding,
  createFunctionProofAuthority,
} = require("../structural-proof-authority.cjs");

function fixture() {
  const prefix = { kind: "int64.copy", target: "step", source: "guarded" };
  const operation = {
    kind: "loop.range_int64",
    start: "start",
    stop: "stop",
    step: "step",
    index: "index",
    iterator: "iterator",
    body: [{ kind: "int64.binary", operation: "add", target: "total" }],
  };
  return {
    fn: {
      name: "witness",
      params: [
        { name: "guarded", type: "int64" },
        { name: "unguarded", type: "int64" },
      ],
      body: [prefix, operation],
    },
    operation,
    prefix,
  };
}

test("canonical structural encoding is framed, identity-aware, and cyclic", () => {
  assert.notEqual(
    canonicalStructuralEncoding(["a", "b"]),
    canonicalStructuralEncoding(["a,string:b"]),
  );
  assert.notEqual(
    canonicalStructuralEncoding([, 1]),
    canonicalStructuralEncoding([undefined, 1]),
  );
  assert.notEqual(
    canonicalStructuralEncoding({ value: -0 }),
    canonicalStructuralEncoding({ value: 0 }),
  );
  const shared = {};
  assert.notEqual(
    canonicalStructuralEncoding({ left: shared, right: shared }),
    canonicalStructuralEncoding({ left: {}, right: {} }),
  );
  const cycle = { name: "cycle" };
  cycle.self = cycle;
  assert.match(canonicalStructuralEncoding(cycle), /r0;/);
  assert.throws(
    () => canonicalStructuralEncoding({ get value() { return 1; } }),
    /must not contain accessors/,
  );
});

test("function proof authority fails closed under every structural mutation", () => {
  const authority = createFunctionProofAuthority({ name: "range latch" });
  const { fn, operation, prefix } = fixture();
  const claim = { theorem: "no signed latch overflow", maximum: "17" };
  const keysBefore = Reflect.ownKeys(operation);
  authority.authorize(fn, operation, claim);
  assert.deepEqual(Reflect.ownKeys(operation), keysBefore);
  assert.equal(authority.isAuthorized(fn, operation, claim), true);
  assert.doesNotThrow(() => JSON.stringify(fn));

  prefix.source = "unguarded";
  assert.equal(authority.isAuthorized(fn, operation, claim), false);
  prefix.source = "guarded";
  assert.equal(authority.isAuthorized(fn, operation, claim), true);

  operation.body[0].target = "step";
  assert.equal(authority.isAuthorized(fn, operation, claim), false);
  operation.body[0].target = "total";
  operation.iterator = "step";
  assert.equal(authority.isAuthorized(fn, operation, claim), false);
  operation.iterator = "iterator";
  fn.params[0].type = "uint64";
  assert.equal(authority.isAuthorized(fn, operation, claim), false);
});

test("claims, function identity, serialization, and reachability are bound", () => {
  const authority = createFunctionProofAuthority({ name: "range latch" });
  const { fn, operation } = fixture();
  const claim = { minimum: "0", maximum: "8" };
  authority.authorize(fn, operation, claim);
  assert.equal(authority.isAuthorized(fn, operation, { ...claim }), true);
  assert.equal(authority.isAuthorized(
    fn, operation, { minimum: "0", maximum: "9" },
  ), false);
  assert.equal(authority.isAuthorized({ ...fn }, operation, claim), false);

  const portable = JSON.parse(JSON.stringify(fn));
  const portableOperation = portable.body[1];
  assert.equal(authority.isAuthorized(portable, portableOperation, claim), false);
  assert.throws(
    () => authority.authorize(fn, { kind: "detached" }, claim),
    /outside its function/,
  );

  fn.body.pop();
  assert.equal(authority.isAuthorized(fn, operation, claim), false);
  authority.revoke(operation);
  fn.body.push(operation);
  assert.equal(authority.isAuthorized(fn, operation, claim), false);
});

test("one emission-time function snapshot verifies all operation claims", () => {
  const authority = createFunctionProofAuthority({ name: "emission proof" });
  const { fn, operation, prefix } = fixture();
  const second = operation.body[0];
  authority.authorize(fn, operation, { role: "loop" });
  authority.authorize(fn, second, { role: "arithmetic" });
  const emission = authority.emissionVerifier(fn);
  assert.equal(emission.isAuthorized(operation, { role: "loop" }), true);
  assert.equal(emission.isAuthorized(second, { role: "arithmetic" }), true);

  prefix.source = "unguarded";
  const changedEmission = authority.emissionVerifier(fn);
  assert.equal(changedEmission.isAuthorized(operation, { role: "loop" }), false);
  assert.equal(changedEmission.isAuthorized(second, { role: "arithmetic" }), false);
  // The original verifier represents one already-started synchronous,
  // mutation-free emission traversal; callers must not reuse it after edits.
  assert.equal(emission.isAuthorized(operation, { role: "loop" }), true);
});

test("diagnostic fields may be explicitly excluded without adding cycles", () => {
  const authority = createFunctionProofAuthority({
    name: "constant int64 range",
    ignoredKeys: ["incrementProof", "provenance"],
  });
  const { fn, operation } = fixture();
  operation.incrementProof = {
    authority: "constant-int64-range-v1",
    iterations: "4",
  };
  authority.authorize(fn, operation, { start: "0", stop: "4", step: "1" });
  operation.incrementProof = {
    authority: "display-only",
    note: "diagnostic changes are not semantic authority",
  };
  assert.equal(authority.isAuthorized(
    fn, operation, { start: "0", stop: "4", step: "1" },
  ), true);
  assert.doesNotThrow(() => JSON.stringify(fn));
});
