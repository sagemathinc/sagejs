#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  canonicalJson,
  contentId,
  sha256,
} = require("../../../scripts/numerical-computing/common.cjs");
const {
  CATALOG_PATH,
  CATALOG_SCHEMA,
  ORACLE_ENVIRONMENT,
  POLICY,
  PROVENANCE_SCHEMA,
  SCHEMA,
  createBinding,
  validateBinding,
  validateCatalog,
  _testing: { completePrefixClosure },
} = require("../../../scripts/numerical-computing/qualification/scipy-oracle.cjs");

function identified(core) {
  return { ...core, id: contentId(core) };
}

function input(name, kind, version) {
  return {
    kind,
    name,
    version,
    filename: `${name}-${version}.artifact`,
    source: `https://qualification.invalid/${name}`,
    sha256: "1".repeat(64),
    bytes: 100,
  };
}

function qualifiedCatalog() {
  const inputs = [
    input("cpython", "cpython-standalone", POLICY.python),
    input("numpy", "wheel", POLICY.numpy),
    input("scipy", "wheel", POLICY.scipy),
  ];
  const platform = (name, qualified = false) => qualified ? {
    platform: name,
    status: "qualified",
    reason: null,
    python_executable: name === "windows-x64" ? "python.exe" : "bin/python3",
    site_packages: "lib/site-packages",
    inputs,
    prefix: { sha256: "2".repeat(64), bytes: 1000, files: 10, directories: 5 },
  } : {
    platform: name,
    status: "pending",
    reason: "not provisioned",
    python_executable: null,
    site_packages: null,
    inputs: null,
    prefix: null,
  };
  return identified({
    schema: CATALOG_SCHEMA,
    policy: { ...POLICY },
    platforms: [
      platform("linux-x64", true),
      platform("linux-arm64"),
      platform("macos-arm64"),
      platform("windows-x64"),
    ],
  });
}

function historicalBinding() {
  const catalog = qualifiedCatalog();
  const catalogBytes = Buffer.from(canonicalJson(catalog));
  const row = catalog.platforms[0];
  const prefix = "/qualification/scipy";
  const provenance = identified({
    schema: PROVENANCE_SCHEMA,
    platform: row.platform,
    policy: { ...POLICY },
    python_executable: row.python_executable,
    site_packages: row.site_packages,
    inputs: row.inputs,
    prefix: row.prefix,
  });
  return identified({
    schema: SCHEMA,
    platform: row.platform,
    policy: { ...POLICY },
    catalog: {
      path: CATALOG_PATH,
      sha256: sha256(catalogBytes),
      bytes: catalogBytes.length,
      snapshot: catalog,
    },
    provenance,
    prefix: { path: prefix, ...row.prefix },
    runtime: {
      environment: {
        ...ORACLE_ENVIRONMENT,
        HOME: prefix,
        TMPDIR: `${prefix}/.qualification-tmp`,
      },
      python: {
        version: POLICY.python,
        implementation: "cpython",
        executable_path: row.python_executable,
        executable_sha256: "4".repeat(64),
        executable_bytes: 100,
        site_packages_path: row.site_packages,
        temporary_path: ".qualification-tmp",
        import_paths: [
          { path: row.site_packages, kind: "directory" },
          { path: "lib/python314.zip", kind: "absent" },
          { path: "lib/python3.14", kind: "directory" },
        ],
      },
      numpy: {
        version: POLICY.numpy,
        module_path: `${row.site_packages}/numpy/__init__.py`,
        module_sha256: "5".repeat(64),
        module_bytes: 100,
      },
      scipy: {
        version: POLICY.scipy,
        module_path: `${row.site_packages}/scipy/__init__.py`,
        module_sha256: "6".repeat(64),
        module_bytes: 100,
      },
    },
  });
}

function reidentify(value) {
  const core = Object.fromEntries(Object.entries(value).filter(([name]) => name !== "id"));
  value.id = contentId(core);
  return value;
}

test("checked-in SciPy oracle catalog is fail-closed on every supported platform", () => {
  const catalog = validateCatalog(JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")));
  assert.equal(catalog.platforms.length, 4);
  assert(catalog.platforms.every((row) => row.status === "pending"));
  assert.throws(
    () => createBinding({
      prefixPath: "/qualification/not-consulted",
      provenancePath: "/qualification/not-consulted.json",
      platformId: "linux-x64",
    }),
    /pending; release receipts are forbidden/,
  );
  assert.throws(
    () => createBinding({ platformId: "linux-x64" }),
    /explicit SAGEJS_QUALIFICATION_SCIPY_PREFIX/,
  );
});

test("complete hermetic prefix closure binds files and empty directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-scipy-prefix-"));
  try {
    fs.mkdirSync(path.join(root, "empty"));
    fs.writeFileSync(path.join(root, "python"), "runtime");
    const first = completePrefixClosure(root);
    assert.equal(first.files, 1);
    assert.equal(first.directories, 2);
    fs.mkdirSync(path.join(root, "namespace"));
    const directoryAdded = completePrefixClosure(root);
    assert.notEqual(directoryAdded.sha256, first.sha256);
    fs.writeFileSync(path.join(root, "namespace", "injected.py"), "danger = True\n");
    const fileAdded = completePrefixClosure(root);
    assert.notEqual(fileAdded.sha256, directoryAdded.sha256);
    fs.mkdirSync(path.join(root, "Case"));
    try {
      fs.mkdirSync(path.join(root, "case"));
      assert.throws(() => completePrefixClosure(root), /case-colliding/);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("complete hermetic prefix closure rejects links and junctions", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-scipy-link-"));
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-scipy-external-"));
  try {
    fs.writeFileSync(path.join(root, "python"), "runtime");
    fs.writeFileSync(path.join(external, "outside.py"), "outside = True\n");
    try {
      fs.symlinkSync(
        external,
        path.join(root, "escape"),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      t.skip(`host cannot create a directory link: ${error.message}`);
      return;
    }
    assert.throws(() => completePrefixClosure(root), /link or junction/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

test("historical SciPy oracle binding is strict, portable, and self-consistent", () => {
  const binding = historicalBinding();
  assert.deepEqual(validateBinding(binding, { authenticate: false }), binding);

  const wrongExecutable = structuredClone(binding);
  wrongExecutable.runtime.python.executable_path = "bin/other-python";
  reidentify(wrongExecutable);
  assert.throws(
    () => validateBinding(wrongExecutable, { authenticate: false }),
    /paths differ from the platform catalog/,
  );

  const outsideModule = structuredClone(binding);
  outsideModule.runtime.scipy.module_path = "unbound/scipy.py";
  reidentify(outsideModule);
  assert.throws(
    () => validateBinding(outsideModule, { authenticate: false }),
    /outside authenticated site-packages/,
  );

  const backslashPath = structuredClone(binding);
  backslashPath.runtime.python.site_packages_path = "lib\\site-packages";
  reidentify(backslashPath);
  assert.throws(
    () => validateBinding(backslashPath, { authenticate: false }),
    /canonical relative path/,
  );

  const wrongInput = structuredClone(binding);
  wrongInput.catalog.snapshot.platforms[0].inputs[1].version = "0.0.0";
  reidentify(wrongInput.catalog.snapshot);
  reidentify(wrongInput);
  assert.throws(
    () => validateBinding(wrongInput, { authenticate: false }),
    /wrong numpy input identity/,
  );

  assert.equal(sha256(canonicalJson(binding)).length, 64);
});
