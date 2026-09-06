// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("fresh cubic retries distinguish bounded materialization from fatal state", () => {
  const sourcePath = resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native_runtime.py");
  const result = spawnSync(pythonExecutable(), ["-c", `
import ast, pathlib, sys
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
helper = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_retryable_native_decline")
namespace = {"Any": object, "_CUBIC_OUTPUT_LENGTH": 64}
exec(compile(ast.Module(body=[helper], type_ignores=[]), sys.argv[1], "exec"), namespace)
retry = namespace["_retryable_native_decline"]
for phase in (0, 8, 31, 41, 42, 43, 44, 99):
    for diagnostic in (0, 44, 436, 437, 438, 439, 999):
        values = [0] * 64
        values[63], values[59] = phase, diagnostic
        assert retry(values) == (phase in (8, 41, 42, 43) or (phase == 44 and diagnostic in (437, 438)))
assert not retry([])
print("classified-fresh-retries-ok")
`, sourcePath], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /classified-fresh-retries-ok/);
});
