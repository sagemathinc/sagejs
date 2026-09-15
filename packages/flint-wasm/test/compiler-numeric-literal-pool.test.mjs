// sagejs-test-tier: unit
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("browser compiler uses distinct pools and leaves bootstrap unpooled", () => {
  const source = readFileSync(
    new URL("../compiler-worker.mjs", import.meta.url),
    "utf8",
  );
  // Exercise the worker's actual output function without initializing Wasm.
  const context = vm.createContext({});
  vm.runInContext(
    source.slice(
      source.indexOf("let numericLiteralPoolCounter"),
      source.indexOf("function serializeError"),
    ),
    context,
  );
  const options = [];
  const compiler = {
    OutputStream: class {
      constructor(value) {
        this.options = value;
        options.push(value);
      }
      get() {
        return "compiled";
      }
    },
  };
  const ast = { print() {} };
  for (const includeBaselib of [true, false, false, true, false]) {
    assert.equal(
      context.outputJavaScript(
        compiler,
        ast,
        "baselib",
        includeBaselib,
        "python",
      ),
      "compiled",
    );
  }
  assert.deepEqual(
    options.map((item) => item.pool_numeric_literals),
    [false, true, true, false, true],
  );
  assert.deepEqual(
    options.map((item) => item.reuse_main_module),
    [false, true, true, false, true],
  );
  assert.equal(
    new Set(options.map((item) => item.numeric_literal_pool_prefix)).size,
    options.length,
  );
});
