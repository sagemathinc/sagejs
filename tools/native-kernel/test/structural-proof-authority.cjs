"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canonicalStructuralEncoding,
  createFunctionGraphProofAuthority,
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

function graphFixture() {
  const { fn: owner, operation, prefix } = fixture();
  const callee = {
    name: "callee",
    params: [{ name: "value", type: "int64" }],
    body: [{ kind: "return", value: "value", type: "int64" }],
  };
  return {
    functions: [owner, callee],
    owner,
    operation,
    inner: operation.body[0],
    prefix,
    callee,
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

test("function graph authority binds every transitive dependency", () => {
  const authority = createFunctionGraphProofAuthority({ name: "summary edge" });
  const { owner: fn, operation, callee } = graphFixture();
  const claim = { theorem: "successful result preserves value" };
  authority.authorize([fn, callee], fn, operation, claim);
  assert.equal(authority.isAuthorized(
    [fn, callee], fn, operation, claim,
  ), true);
  callee.body[0].value = "other";
  assert.equal(authority.isAuthorized(
    [fn, callee], fn, operation, claim,
  ), false);
  callee.body[0].value = "value";
  assert.equal(authority.isAuthorized(
    [fn, callee], fn, operation, claim,
  ), true);
  assert.equal(authority.isAuthorized(
    [callee, fn], fn, operation, claim,
  ), false);
  assert.throws(
    () => authority.authorize([callee, fn], fn, operation, claim),
    /outside its owner/,
  );
});

test("one emission-time graph snapshot verifies multiple claims", () => {
  const authority = createFunctionGraphProofAuthority({ name: "summary edge" });
  const { functions, owner, operation, inner, callee } = graphFixture();
  let snapshotVisits = 0;
  callee.body[0] = new Proxy(callee.body[0], {
    ownKeys(target) {
      snapshotVisits += 1;
      return Reflect.ownKeys(target);
    },
  });
  authority.authorize(functions, owner, operation, { role: "loop" });
  authority.authorize(functions, owner, inner, { role: "arithmetic" });

  snapshotVisits = 0;
  const emission = authority.emissionVerifier(functions, owner);
  assert.equal(snapshotVisits, 1);
  assert.equal(emission.isAuthorized(operation, { role: "loop" }), true);
  assert.equal(emission.isAuthorized(inner, { role: "arithmetic" }), true);
  assert.equal(snapshotVisits, 1);

  callee.body[0].value = "changed during emission";
  assert.equal(emission.isAuthorized(operation, { role: "loop" }), true);
  assert.equal(snapshotVisits, 1);
});

test("graph emission binds ordered identities and their structural snapshots", () => {
  const authority = createFunctionGraphProofAuthority({ name: "summary edge" });
  const { functions, owner, operation, prefix, callee } = graphFixture();
  const claim = { theorem: "successful result preserves value" };
  authority.authorize(functions, owner, operation, claim);

  const replacementOwner = { ...owner };
  assert.equal(authority.emissionVerifier(
    [replacementOwner, callee], replacementOwner,
  ).isAuthorized(operation, claim), false);
  const replacementCallee = { ...callee };
  assert.equal(authority.emissionVerifier(
    [owner, replacementCallee], owner,
  ).isAuthorized(operation, claim), false);
  assert.equal(authority.emissionVerifier(
    [owner], owner,
  ).isAuthorized(operation, claim), false);
  assert.equal(authority.emissionVerifier(
    [callee, owner], callee,
  ).isAuthorized(operation, claim), false);
  assert.throws(
    () => authority.emissionVerifier([callee, owner], owner),
    /outside its owner/,
  );

  prefix.source = "changed owner";
  assert.equal(authority.emissionVerifier(
    functions, owner,
  ).isAuthorized(operation, claim), false);
  prefix.source = "guarded";
  callee.body[0].value = "changed callee";
  assert.equal(authority.emissionVerifier(
    functions, owner,
  ).isAuthorized(operation, claim), false);
});

test("graph emission binds claims and live owner reachability", () => {
  const authority = createFunctionGraphProofAuthority({ name: "summary edge" });
  const { functions, owner, operation } = graphFixture();
  const claim = { minimum: "0", maximum: "8" };
  authority.authorize(functions, owner, operation, claim);
  const emission = authority.emissionVerifier(functions, owner);

  assert.equal(emission.isAuthorized(operation, { ...claim }), true);
  claim.maximum = "9";
  assert.equal(emission.isAuthorized(operation, claim), false);
  owner.body.pop();
  assert.equal(emission.isAuthorized(operation, { minimum: "0", maximum: "8" }), false);
  owner.body.push(operation);
  assert.equal(emission.isAuthorized(operation, { minimum: "0", maximum: "8" }), true);
});

test("graph emission fails closed for unsupported structures", () => {
  const authority = createFunctionGraphProofAuthority({ name: "summary edge" });
  const { functions, owner, operation, callee } = graphFixture();
  const claim = { theorem: "successful result preserves value" };
  authority.authorize(functions, owner, operation, claim);

  callee.body[0].callback = () => {};
  const unsupportedGraph = authority.emissionVerifier(functions, owner);
  delete callee.body[0].callback;
  assert.equal(unsupportedGraph.isAuthorized(operation, claim), false);

  const emission = authority.emissionVerifier(functions, owner);
  const unsupportedClaim = {};
  Object.defineProperty(unsupportedClaim, "theorem", { get() { return claim.theorem; } });
  assert.equal(emission.isAuthorized(operation, unsupportedClaim), false);
  assert.equal(emission.isAuthorized(null, claim), false);
  assert.throws(
    () => authority.emissionVerifier([owner, owner], owner),
    /requires distinct functions/,
  );
  assert.throws(
    () => authority.emissionVerifier([owner, {}], owner),
    /must be a lowered function/,
  );
});
