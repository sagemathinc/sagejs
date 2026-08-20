"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const {
  LAZY_MODULE_BUNDLE_SCHEMA,
  PRECOMPILED_MODULE_FILENAME,
  PRECOMPILED_PACKAGE_PATH,
  canonicalModuleFilename,
  canonicalPackagePath,
  canonicalizeJavascriptTemplate,
  provenanceRecord,
  sha256,
  validLazyModuleName,
  validateLazyModuleBundle,
} = require("../scripts/lazy-module-provenance.cjs");

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

function write(filename, contents) {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, contents);
}

function checkoutFixture(label) {
  const root = mkdtempSync(join(tmpdir(), `sagejs-lazy-${label}-`));
  const generator = join(root, "scripts/build-lazy-module-cache.cjs");
  const config = join(root, "scripts/precompiled-python-packages.json");
  const source = join(root, "src/lib/example/package/__init__.py");
  write(generator, "// deterministic generator\n");
  write(config, '{"imports":["example.package"]}\n');
  write(source, "value = 17\n");
  const sourceDirectory = dirname(source).replaceAll("\\", "/");
  const sourceFilename = source.replaceAll("\\", "/");
  const javascript = [
    `var __file__ = ${JSON.stringify(sourceFilename)};`,
    `var __path__ = [${JSON.stringify(sourceDirectory)}];`,
    `var __spec__ = {origin:${JSON.stringify(sourceFilename)},` +
      `submodule_search_locations:${JSON.stringify(sourceDirectory)}};`,
  ].join("\n");
  const canonical = canonicalizeJavascriptTemplate({
    name: "example.package",
    sourceFilename,
    javascript,
    repositoryRoot: root,
  });
  const sourceContents = readFileSync(source);
  const moduleRecord = {
    resource: "example-package.json",
    resourceSha256: sha256("resource bytes"),
    source: "example/package/__init__.py",
    sourceSha256: sha256(sourceContents),
    signature: sha1(sourceContents),
    version: "compiler-test-v1",
    mode: "python",
    package: true,
    filename: canonical.filename,
    packagePath: canonical.packagePath,
    javascriptTemplate: canonical.javascriptTemplate,
  };
  const bundle = {
    schema: LAZY_MODULE_BUNDLE_SCHEMA,
    generator: provenanceRecord(root, generator),
    config: provenanceRecord(root, config),
    roots: { package: ["example.package"], taskRuntime: [] },
    modules: { "example.package": moduleRecord },
  };
  return { root, generator, config, source, canonical, bundle };
}

test("lazy templates and package paths are checkout-independent", () => {
  const left = checkoutFixture("left");
  const right = checkoutFixture("right");
  try {
    assert.deepEqual(left.canonical, right.canonical);
    assert.equal(
      left.canonical.filename,
      "/__sagejs_lazy_modules__/example/package/__init__.py",
    );
    assert.equal(
      left.canonical.packagePath,
      "/__sagejs_lazy_modules__/example/package",
    );
    assert.match(
      left.canonical.javascriptTemplate,
      new RegExp(PRECOMPILED_MODULE_FILENAME),
    );
    assert.match(
      left.canonical.javascriptTemplate,
      new RegExp(PRECOMPILED_PACKAGE_PATH),
    );
    assert.doesNotMatch(left.canonical.javascriptTemplate, /sagejs-lazy-left/);
    assert.doesNotMatch(left.canonical.javascriptTemplate, /sagejs-lazy-right/);
    assert.deepEqual(
      validateLazyModuleBundle(left.bundle, { repositoryRoot: left.root }),
      left.bundle,
    );
    assert.deepEqual(
      validateLazyModuleBundle(right.bundle, { repositoryRoot: right.root }),
      right.bundle,
    );
    assert.equal(JSON.stringify(left.bundle), JSON.stringify(right.bundle));
  } finally {
    rmSync(left.root, { recursive: true, force: true });
    rmSync(right.root, { recursive: true, force: true });
  }
});

test("lazy names, canonical paths, and records fail closed", () => {
  for (const name of [
    "", ".bad", "bad.", "bad-name", "a..b", "__proto__",
    "safe.constructor", "prototype.child", "a/b", "a\\b",
  ]) {
    assert.equal(validLazyModuleName(name), false, name);
  }
  assert.equal(validLazyModuleName("sagejs.number_fields.units"), true);
  assert.equal(
    canonicalModuleFilename("sagejs.number_fields", true),
    "/__sagejs_lazy_modules__/sagejs/number_fields/__init__.py",
  );
  assert.equal(canonicalPackagePath("sagejs.number_fields", false), null);

  const value = checkoutFixture("malformed");
  try {
    const extra = structuredClone(value.bundle);
    extra.modules["example.package"].unexpected = true;
    assert.throws(
      () => validateLazyModuleBundle(extra, { repositoryRoot: value.root }),
      /invalid lazy-module bundle record/,
    );
    const path = structuredClone(value.bundle);
    path.modules["example.package"].packagePath = "/tmp/checkout/package";
    assert.throws(
      () => validateLazyModuleBundle(path, { repositoryRoot: value.root }),
      /invalid lazy-module bundle record/,
    );
    const reserved = structuredClone(value.bundle);
    reserved.roots.package = ["constructor"];
    assert.throws(
      () => validateLazyModuleBundle(reserved, { repositoryRoot: value.root }),
      /invalid lazy-module bundle root list/,
    );
    assert.throws(
      () => canonicalizeJavascriptTemplate({
        name: "example.package",
        sourceFilename: value.source,
        javascript: `var value = ${JSON.stringify(value.source)};`,
        repositoryRoot: value.root,
      }),
      /does not contain its __path__/,
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
