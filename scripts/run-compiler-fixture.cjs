#!/usr/bin/env node
"use strict";

const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { Script } = require("node:vm");

const [filename, compilerDirectory, testPath] = process.argv.slice(2);
if (!filename || !compilerDirectory || !testPath) {
  throw new Error(
    "usage: run-compiler-fixture.cjs FILE COMPILER_DIRECTORY TEST_PATH",
  );
}

const { runtimeRequire } = require("../dist/tools/resources.js");
const compilerModule = require("../dist/tools/compiler.js");
const createCompiler = compilerModule.default || compilerModule;

function pythonDeepEqual(actual, expected, message) {
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual === expected) return;
    assert.equal(actual.length, expected.length, message);
    for (let index = 0; index < actual.length; index += 1) {
      pythonDeepEqual(actual[index], expected[index], message);
    }
    return;
  }
  if (typeof actual?.__eq__ === "function") {
    assert.ok(actual.__eq__(expected), message);
    return;
  }
  if (message === undefined) assert.deepEqual(actual, expected);
  else assert.deepEqual(actual, expected, message);
}

Object.assign(globalThis, {
  assrt: { ...assert, deepEqual: pythonDeepEqual },
  __name__: filename,
  require,
  __sagejs_runtime_require__: runtimeRequire,
  fs: require("node:fs"),
  PyLang: createCompiler(),
  compiler_dir: compilerDirectory,
  test_path: testPath,
  Buffer,
  outerRealmError: new RangeError("outside the test VM"),
});

new Script(readFileSync(filename, "utf8"), { filename }).runInThisContext();
