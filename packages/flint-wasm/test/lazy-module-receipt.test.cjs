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
  lazyModuleSourceInputs,
  sourceClosure,
} = require("../scripts/production-receipt.cjs");
const {
  LAZY_MODULE_BUNDLE_SCHEMA,
  PRECOMPILED_MODULE_FILENAME,
  provenanceRecord,
  sha256,
} = require("../../../scripts/lazy-module-provenance.cjs");

function digest(algorithm, value) {
  return createHash(algorithm).update(value).digest("hex");
}

function write(filename, contents) {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, contents);
}

function fixture(label) {
  const root = mkdtempSync(join(tmpdir(), `sagejs-lazy-receipt-${label}-`));
  const packageRoot = join(root, "packages/flint-wasm");
  const generator = join(root, "scripts/build-lazy-module-cache.cjs");
  const config = join(root, "scripts/precompiled-python-packages.json");
  const source = join(root, "src/lib/example.py");
  const bundleFilename = join(packageRoot, "dist/lazy-modules.json");
  write(generator, "// generator v1\n");
  write(config, '{"imports":["example"]}\n');
  write(source, "value = 17\n");

  function writeBundle() {
    const sourceBytes = readFileSync(source);
    const template = `var __file__ = ${JSON.stringify(PRECOMPILED_MODULE_FILENAME)};`;
    const bundle = {
      schema: LAZY_MODULE_BUNDLE_SCHEMA,
      generator: provenanceRecord(root, generator),
      config: provenanceRecord(root, config),
      roots: { package: ["example"], taskRuntime: [] },
      modules: {
        example: {
          resource: "example.json",
          resourceSha256: sha256("template resource"),
          source: "example.py",
          sourceSha256: sha256(sourceBytes),
          signature: digest("sha1", sourceBytes),
          version: "compiler-test-v1",
          mode: "python",
          package: false,
          filename: "/__sagejs_lazy_modules__/example.py",
          packagePath: null,
          javascriptTemplate: template,
        },
      },
    };
    write(bundleFilename, `${JSON.stringify(bundle)}\n`);
    return bundle;
  }
  writeBundle();
  return {
    root, packageRoot, generator, config, source, bundleFilename, writeBundle,
  };
}

test("production receipt closure is reproducible and binds every lazy input", () => {
  const left = fixture("left");
  const right = fixture("right");
  try {
    const leftInputs = lazyModuleSourceInputs(left.root, left.packageRoot);
    assert.deepEqual(
      leftInputs.map((filename) => filename.slice(left.root.length + 1)),
      [
        "scripts/build-lazy-module-cache.cjs",
        "scripts/precompiled-python-packages.json",
        "src/lib/example.py",
      ],
    );
    const initial = sourceClosure(left.root, left.packageRoot);
    assert.deepEqual(initial, sourceClosure(right.root, right.packageRoot));
    assert.equal(initial.files, 3);

    write(left.source, "value = 18\n");
    assert.throws(
      () => sourceClosure(left.root, left.packageRoot),
      /stale lazy-module source/,
    );
    left.writeBundle();
    const sourceMutation = sourceClosure(left.root, left.packageRoot);
    assert.notEqual(sourceMutation.sha256, initial.sha256);

    write(left.generator, "// generator v2\n");
    assert.throws(
      () => sourceClosure(left.root, left.packageRoot),
      /stale lazy-module provenance/,
    );
    left.writeBundle();
    const generatorMutation = sourceClosure(left.root, left.packageRoot);
    assert.notEqual(generatorMutation.sha256, sourceMutation.sha256);

    write(left.config, '{"imports":["example"],"changed":true}\n');
    assert.throws(
      () => sourceClosure(left.root, left.packageRoot),
      /stale lazy-module provenance/,
    );
    left.writeBundle();
    const configMutation = sourceClosure(left.root, left.packageRoot);
    assert.notEqual(configMutation.sha256, generatorMutation.sha256);

    write(left.bundleFilename, "{malformed\n");
    assert.throws(
      () => sourceClosure(left.root, left.packageRoot),
      /invalid production lazy-module bundle/,
    );
  } finally {
    rmSync(left.root, { recursive: true, force: true });
    rmSync(right.root, { recursive: true, force: true });
  }
});
