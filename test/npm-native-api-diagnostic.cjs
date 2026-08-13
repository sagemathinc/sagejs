"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  publishedNativeModuleError,
} = require("../dist/tools/resources.js");

const missing = Object.assign(new Error("fixture dependency missing"), {
  code: "MODULE_NOT_FOUND",
});

test("published native API diagnostic explains the CLI/API distinction", () => {
  const error = publishedNativeModuleError(
    "@sagemath/sagejs-flint",
    missing,
    "/fixture/node_modules/@sagemath/sagejs/dist/tools",
  );
  assert.ok(error);
  assert.match(error.message, /published Sage\.js JavaScript API/);
  assert.match(error.message, /self-contained sagejs and sagepython/);
  assert.match(error.message, /does not yet publish relocatable Node addon assets/);
  assert.match(error.message, /SAGEJS_NATIVE_DISABLE=1/);
  assert.equal(error.cause, missing);
});

test("source checkouts and ordinary missing modules retain original errors", () => {
  assert.equal(
    publishedNativeModuleError(
      "@sagemath/sagejs-flint",
      missing,
      "/fixture/sagejs/dist/tools",
    ),
    undefined,
  );
  assert.equal(
    publishedNativeModuleError(
      "unrelated-fixture-module",
      missing,
      "/fixture/node_modules/@sagemath/sagejs/dist/tools",
    ),
    undefined,
  );
  assert.equal(
    publishedNativeModuleError(
      "@sagemath/sagejs-flint",
      Object.assign(new Error("syntax"), { code: "ERR_DLOPEN_FAILED" }),
      "/fixture/node_modules/@sagemath/sagejs/dist/tools",
    ),
    undefined,
  );
});
