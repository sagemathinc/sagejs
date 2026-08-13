"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const {
  corruptArchive,
  hostPlatform,
  isWithin,
  isolatedEnvironment,
  parseArguments,
} = require("../scripts/test-npm-package.cjs");

test("release npm host selection uses public platform packages", () => {
  assert.deepEqual(hostPlatform("linux", "x64"), {
    id: "linux-x64",
    packageName: "@sagemath/sagejs-linux-x64",
    archive: "sagejs-linux-x64.tgz",
    executableSuffix: "",
  });
  assert.deepEqual(hostPlatform("darwin", "arm64"), {
    id: "darwin-arm64",
    packageName: "@sagemath/sagejs-darwin-arm64",
    archive: "sagejs-macos-arm64.tgz",
    executableSuffix: "",
  });
  assert.deepEqual(hostPlatform("win32", "x64"), {
    id: "win32-x64",
    packageName: "@sagemath/sagejs-win32-x64",
    archive: "sagejs-windows-x64.tgz",
    executableSuffix: ".exe",
  });
  assert.throws(() => hostPlatform("darwin", "x64"), /no native npm release/);
});

test("release path containment does not confuse sibling prefixes", () => {
  assert.equal(isWithin("/tmp/install", "/tmp/install/node_modules"), true);
  assert.equal(isWithin("/tmp/install", "/tmp/installation-escape"), false);
  assert.equal(isWithin("/tmp/install", "/tmp/install"), true);
});

test("release test environment isolates mutable state and can hide compilers", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-release-env-"));
  try {
    const environment = isolatedEnvironment(temporary, {
      withoutCompiler: true,
    });
    assert.ok(isWithin(temporary, environment.HOME));
    assert.ok(isWithin(temporary, environment.XDG_CACHE_HOME));
    assert.ok(isWithin(temporary, environment.SAGEJS_NATIVE_CACHE_DIR));
    assert.ok(isWithin(temporary, environment.TMPDIR));
    assert.ok(isWithin(temporary, environment.PATH));
    assert.ok(isWithin(temporary, environment.CC));
    assert.equal(environment.NODE_PATH, "");
    assert.equal(environment.NPM_CONFIG_REGISTRY, "http://127.0.0.1:9");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("release dependency graph overrides reproduce the installed graph", () => {
  const { installedDependencyOverrides } = require("../scripts/test-npm-package.cjs");
  const overrides = installedDependencyOverrides();
  assert.equal(overrides.zeromq, "6.5.0");
  assert.equal(overrides["node-addon-api"], "8.9.0");
  assert.equal(overrides["@sagemath/sagejs-flint"], undefined);
});

test("release argument defaults follow the current platform", () => {
  const options = parseArguments([]);
  assert.equal(options.rootArchive, resolve("build/release/npm/sagejs.tgz"));
  assert.equal(
    options.nativeArchive,
    resolve("build/release/npm", hostPlatform().archive),
  );
  assert.equal(options.keep, false);
});

test("corruptArchive changes a copy without modifying its source", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-release-corrupt-"));
  try {
    const source = join(temporary, "source.tgz");
    const target = join(temporary, "target.tgz");
    const content = Buffer.from("0123456789abcdef0123456789abcdef");
    writeFileSync(source, content);
    corruptArchive(source, target);
    assert.deepEqual(readFileSync(source), content);
    assert.notDeepEqual(readFileSync(target), content);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
