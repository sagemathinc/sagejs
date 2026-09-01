#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  POLICY,
  createBinding,
  validateBinding,
  _testing: { distributionIdentity, parseCsv },
} = require("../../../scripts/numerical-computing/qualification/scipy-oracle.cjs");

function wheelHash(bytes) {
  return `sha256=${createHash("sha256").update(bytes).digest("base64url")}`;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-scipy-oracle-"));
  const site = path.join(root, "lib", "site-packages");
  const moduleRoot = path.join(site, "example");
  const metadata = path.join(site, "example-1.0.dist-info");
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.mkdirSync(metadata, { recursive: true });
  const moduleFile = path.join(moduleRoot, "__init__.py");
  const unlisted = path.join(moduleRoot, "extension.so");
  const recordPath = path.join(metadata, "RECORD");
  const source = Buffer.from("answer = 42\n");
  fs.writeFileSync(moduleFile, source);
  fs.writeFileSync(unlisted, "native bytes");
  fs.writeFileSync(
    recordPath,
    [
      `example/__init__.py,${wheelHash(source)},${source.length}`,
      "example-1.0.dist-info/RECORD,,",
      "",
    ].join("\n"),
  );
  return {
    root,
    moduleFile,
    unlisted,
    record: {
      version: "1.0",
      module_file: moduleFile,
      distribution_path: metadata,
      record_path: recordPath,
      record_root: site,
    },
  };
}

test("strict wheel CSV parsing preserves quoted fields and rejects malformed rows", () => {
  assert.deepEqual(parseCsv('"a,b",sha256=abc,3\r\nRECORD,,\r\n', "fixture"), [
    ["a,b", "sha256=abc", "3"],
    ["RECORD", "", ""],
  ]);
  assert.throws(() => parseCsv("a,b\n", "fixture"), /exactly three fields/);
  assert.throws(() => parseCsv('"a,b,c\n', "fixture"), /unterminated/);
});

test("distribution closure verifies RECORD and includes unlisted importable bytes", () => {
  const value = fixture();
  try {
    const first = distributionIdentity(value.root, value.record);
    assert.equal(first.record.rows, 2);
    assert.equal(first.record.declared_hashes_verified, 1);
    assert.equal(first.record.unhashed_members_bound_by_closure, 1);
    assert.equal(first.closure.files, 3);
    fs.writeFileSync(path.join(path.dirname(value.unlisted), "injected.py"), "danger = True\n");
    const injected = distributionIdentity(value.root, value.record);
    assert.equal(injected.closure.files, 4);
    assert.notEqual(injected.closure.sha256, first.closure.sha256);
    fs.writeFileSync(value.moduleFile, "answer = 43\n");
    assert.throws(
      () => distributionIdentity(value.root, value.record),
      /wrong declared hash/,
    );
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test("pinned local SciPy oracle binds complete closures when the release oracle exists", (t) => {
  let binding;
  try {
    binding = createBinding();
  } catch (error) {
    t.skip(`pinned oracle is not installed on this development host: ${error.message}`);
    return;
  }
  assert.deepEqual(binding.identity.policy, POLICY);
  assert(binding.identity.numpy.closure.files > 100);
  assert(binding.identity.scipy.closure.files > 100);
  assert(binding.identity.numpy.record.declared_hashes_verified > 0);
  assert(binding.identity.scipy.record.declared_hashes_verified > 0);
  assert.deepEqual(validateBinding(binding), binding);
});
