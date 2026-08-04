"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findNativeExecutable,
  nativePackageFor,
} = require("../bin/native-launcher.cjs");

test("native npm package selection follows Node platform names", () => {
  assert.equal(nativePackageFor("linux", "x64"), "@sagemath/sagejs-linux-x64");
  assert.equal(nativePackageFor("linux", "arm64"), "@sagemath/sagejs-linux-arm64");
  assert.equal(nativePackageFor("darwin", "arm64"), "@sagemath/sagejs-darwin-arm64");
  assert.equal(nativePackageFor("win32", "x64"), "@sagemath/sagejs-win32-x64");
  assert.equal(nativePackageFor("darwin", "x64"), undefined);
});

test("native executable resolution is optional and command-specific", () => {
  const resolve = (request) => {
    assert.equal(request, "@sagemath/sagejs-linux-x64/package.json");
    return "/opt/node_modules/@sagemath/sagejs-linux-x64/package.json";
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
    "/opt/node_modules/@sagemath/sagejs-linux-x64/bin/sagepython",
  );
  assert.equal(
    findNativeExecutable({
      platform: "win32",
      arch: "x64",
      executable: "sagejs",
      resolve: () => "/opt/node_modules/sagejs-win32-x64/package.json",
      realpath: (path) => path,
      exists: () => true,
    }),
    "/opt/node_modules/sagejs-win32-x64/bin/sagejs.exe",
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
