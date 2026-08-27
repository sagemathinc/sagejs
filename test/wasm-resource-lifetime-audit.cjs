// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const audit = path.join(root, "scripts/audit-wasm-resource-lifetimes.cjs");

function runAudit(overrides = {}) {
  return spawnSync(
    process.execPath,
    [audit],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...overrides },
    },
  );
}

test("the complete owned-resource and finalizer inventory is reviewed", () => {
  const result = spawnSync(process.execPath, [audit], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /resource lifetime audit passed/);
});

test("the audit fails closed for a newly declared owned resource", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-resource-audit-"));
  try {
    fs.cpSync(path.join(root, "ffi"), path.join(temporary, "ffi"), {
      recursive: true,
    });
    const declarationPath = path.join(temporary, "ffi/flint.ffi.json");
    const declaration = JSON.parse(fs.readFileSync(declarationPath, "utf8"));
    declaration.resources.push({ id: "mutation_only_resource", ownership: "owned" });
    fs.writeFileSync(declarationPath, `${JSON.stringify(declaration)}\n`);
    const result = runAudit({
      SAGEJS_RESOURCE_AUDIT_DECLARATION_ROOT: temporary,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /owned resource family is not reviewed: flint:mutation_only_resource/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the audit discovers a newly added FFI declaration file", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-resource-audit-"));
  try {
    fs.cpSync(path.join(root, "ffi"), path.join(temporary, "ffi"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(temporary, "ffi/mutation.ffi.json"),
      `${JSON.stringify({
        library: { id: "mutation" },
        resources: [{ id: "new_owned_family", ownership: "owned" }],
      })}\n`,
    );
    const result = runAudit({
      SAGEJS_RESOURCE_AUDIT_DECLARATION_ROOT: temporary,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /owned resource family is not reviewed: mutation:new_owned_family/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

for (const mutation of [
  {
    name: "a direct finalizer review is removed",
    field: "direct_finalizer_sites",
    id: "packages/flint-wasm/numeric-backend.mjs",
    expected: /direct FinalizationRegistry site is not reviewed/,
  },
  {
    name: "a stateful reactor review is removed",
    field: "stateful_reactor_scopes",
    id: "sagejs_nf_zeta_residue_begin",
    expected: /stateful reactor scope is not reviewed/,
  },
]) {
  test(`the audit fails closed when ${mutation.name}`, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-resource-audit-"));
    try {
      const manifestPath = path.join(temporary, "wasm-resource-lifetimes.json");
      fs.copyFileSync(
        path.join(root, "architecture/wasm-resource-lifetimes.json"),
        manifestPath,
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest[mutation.field] = manifest[mutation.field].filter(
        (record) => record.path !== mutation.id && record.begin !== mutation.id,
      );
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
      const result = runAudit({ SAGEJS_RESOURCE_AUDIT_MANIFEST: manifestPath });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, mutation.expected);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
}
