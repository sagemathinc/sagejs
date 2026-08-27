// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const rootPackage = require("../package.json");
const product = require("../sagejs-version.json");
const {
  SAGEJS_VERSION_INFO,
  createSagejsVersionInfo,
} = require("../dist/tools/version-info.js");

test("the host version record is immutable and agrees with the release", () => {
  assert.equal(product.version, rootPackage.version);
  assert.deepEqual(SAGEJS_VERSION_INFO, {
    ...product,
    platform: `${
      process.platform === "darwin"
        ? "macos"
        : process.platform === "win32"
          ? "windows"
          : process.platform
    }-${process.arch}`,
  });
  assert.ok(Object.isFrozen(SAGEJS_VERSION_INFO));
});

test("browser version records use an explicit execution target", () => {
  assert.deepEqual(createSagejsVersionInfo("browser", "wasm32"), {
    ...product,
    platform: "browser-wasm32",
  });
});
