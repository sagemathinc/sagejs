"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { dirname, join } = require("node:path");
const {
  findNativeExecutable,
  inspectNativeExecutable,
  isPublishedInstallation,
  missingNativeMessage,
  nativePackageFor,
} = require("../bin/native-launcher.cjs");

test("native npm package selection follows Node platform names", () => {
  assert.equal(nativePackageFor("linux", "x64"), "@sagemath/sagejs-linux-x64");
  assert.equal(nativePackageFor("linux", "arm64"), "@sagemath/sagejs-linux-arm64");
  assert.equal(nativePackageFor("darwin", "arm64"), "@sagemath/sagejs-darwin-arm64");
  assert.equal(nativePackageFor("win32", "x64"), "@sagemath/sagejs-win32-x64");
  assert.equal(nativePackageFor("darwin", "x64"), undefined);
});

test("published installation detection follows node_modules boundaries", () => {
  assert.equal(isPublishedInstallation(join("fixture", "source")), false);
  assert.equal(
    isPublishedInstallation(join("fixture", "node_modules", "@sagemath", "sagejs")),
    true,
  );
  assert.equal(
    isPublishedInstallation(join("fixture", "not_node_modules", "sagejs")),
    false,
  );
});

test("native executable inspection distinguishes unsupported and corrupt installs", () => {
  assert.deepEqual(
    inspectNativeExecutable({ platform: "darwin", arch: "x64" }),
    { status: "unsupported" },
  );
  const missing = inspectNativeExecutable({
    platform: "linux",
    arch: "x64",
    resolve: () => {
      throw Object.assign(
        new Error(
          "Cannot find module '@sagemath/sagejs-linux-x64/package.json'",
        ),
        { code: "MODULE_NOT_FOUND" },
      );
    },
  });
  assert.equal(missing.status, "missing-package");
  assert.equal(missing.packageName, "@sagemath/sagejs-linux-x64");
  assert.match(missingNativeMessage(missing), /optional dependencies enabled/);

  assert.throws(
    () => inspectNativeExecutable({
      platform: "linux",
      arch: "x64",
      resolve: () => {
        throw Object.assign(new Error("Cannot find module 'transitive-package'"), {
          code: "MODULE_NOT_FOUND",
        });
      },
    }),
    /transitive-package/,
  );

  const incomplete = inspectNativeExecutable({
    platform: "linux",
    arch: "x64",
    resolve: () => join("fixture", "package.json"),
    realpath: (path) => path,
    exists: () => false,
  });
  assert.equal(incomplete.status, "missing-executable");
  assert.match(missingNativeMessage(incomplete), /is incomplete/);
});

test("native executable resolution is optional and command-specific", () => {
  const linuxPackageJson = join(
    "fixture",
    "node_modules",
    "@sagemath",
    "sagejs-linux-x64",
    "package.json",
  );
  const resolve = (request) => {
    assert.equal(request, "@sagemath/sagejs-linux-x64/package.json");
    return linuxPackageJson;
  };
  assert.equal(
    findNativeExecutable({
      platform: "linux",
      arch: "x64",
      executable: "sagepython",
      resolve,
      realpath: (path) => path,
      exists: () => true,
    }),
    join(dirname(linuxPackageJson), "bin", "sagepython"),
  );
  const windowsPackageJson = join(
    "fixture",
    "node_modules",
    "sagejs-win32-x64",
    "package.json",
  );
  assert.equal(
    findNativeExecutable({
      platform: "win32",
      arch: "x64",
      executable: "sagejs",
      resolve: () => windowsPackageJson,
      realpath: (path) => path,
      exists: () => true,
    }),
    join(dirname(windowsPackageJson), "bin", "sagejs.exe"),
  );
  assert.equal(
    findNativeExecutable({
      platform: "linux",
      arch: "x64",
      resolve,
      realpath: (path) => path,
      exists: () => false,
    }),
    undefined,
  );
});
