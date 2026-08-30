// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function run(command, args, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => stdout += data);
    child.stderr.on("data", (data) => stderr += data);
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(source);
  });
}

const differentialSource = String.raw`
import ast

def canonical(value):
    if value is Ellipsis:
        return "ellipsis"
    if value is None:
        return "none"
    if isinstance(value, bool):
        return "bool(" + repr(value) + ")"
    if isinstance(value, dict):
        return "dict(" + ",".join(sorted(canonical(k) + ":" + canonical(v) for k, v in value.items())) + ")"
    if isinstance(value, set):
        return "set(" + ",".join(sorted(canonical(item) for item in value)) + ")"
    if isinstance(value, tuple):
        return "tuple(" + ",".join(canonical(item) for item in value) + ")"
    if isinstance(value, list):
        return "list(" + ",".join(canonical(item) for item in value) + ")"
    if isinstance(value, bytes):
        return "bytes(" + repr(value) + ")"
    if isinstance(value, str):
        return "str(" + repr(value) + ")"
    if isinstance(value, complex):
        return "complex(" + repr(value) + ")"
    if isinstance(value, float):
        return "float(" + repr(value) + ")"
    if isinstance(value, int):
        return "int(" + repr(value) + ")"
    raise AssertionError("unexpected literal type")

def exception_name(error):
    if isinstance(error, SyntaxError):
        return "SyntaxError"
    if isinstance(error, ValueError):
        return "ValueError"
    if isinstance(error, TypeError):
        return "TypeError"
    if isinstance(error, MemoryError):
        return "MemoryError"
    raise error

accepted = [
    "None",
    "True",
    "False",
    "...",
    "42",
    "0xCA_FE",
    "0b1010_0101",
    "1_000.25",
    "3.5e-2",
    "2j",
    "-3",
    "+4.5",
    "1+2j",
    "-1-2j",
    "'plain'",
    "r'raw\\ntext'",
    "b'bytes\\x21'",
    "'adjacent' ' strings'",
    "[]",
    "[1, 'two', None,]",
    "()",
    "(1,)",
    "(1, 2, 3)",
    "{'answer': 42, 3: [1, 2]}",
    "{3, 1, 2}",
    "set()",
    "[1, # retained comment\n 2]",
]

rejected = [
    "unknown_name",
    "unknown_call()",
    "1 + 2",
    "[x for x in ()]",
    "{'x': object()}",
    "lambda: 1",
    "f'{1}'",
    "--1",
    "{**{}}",
    "1 .real",
    "b'x' 'y'",
]

for source in accepted:
    print(source, "=>", canonical(ast.literal_eval(source)))
for source in rejected:
    try:
        ast.literal_eval(source)
    except (SyntaxError, ValueError, TypeError, MemoryError) as error:
        print(source, "=>", exception_name(error))
    else:
        raise AssertionError("unsafe literal accepted: " + source)
`;

test("ast.literal_eval agrees with CPython on literal source", async () => {
  const [cpython, sagejs] = await Promise.all([
    run("python3", ["-"], differentialSource),
    run(process.execPath, [join(root, "bin", "sagejs-source.cjs"), "--python"], differentialSource),
  ]);
  assert.equal(cpython.status, 0, cpython.stderr);
  assert.equal(sagejs.status, 0, sagejs.stderr);
  assert.equal(sagejs.stdout.trimEnd(), cpython.stdout.trimEnd());
});

test("ast.literal_eval supports public AST node inputs", async () => {
  const source = String.raw`
import ast

value = ast.Expression(ast.Dict(
    [ast.Constant('values')],
    [ast.List([ast.Constant(1), ast.UnaryOp(ast.USub(), ast.Constant(2))], ast.Load())],
))
assert ast.literal_eval(value) == {'values': [1, -2]}
assert ast.literal_eval(ast.Set([ast.Constant(3), ast.Constant(5)])) == {3, 5}
assert ast.literal_eval(ast.Call(ast.Name('set', ast.Load()), [], [])) == set()
complex_node = ast.BinOp(ast.Constant(1), ast.Add(), ast.Constant(2j))
assert ast.literal_eval(complex_node) == 1 + 2j
try:
    ast.literal_eval(ast.Name('unsafe', ast.Load()))
except ValueError:
    pass
else:
    raise AssertionError('name AST must be rejected')
print('ast nodes accepted safely')
`;
  const result = await run(
    process.execPath,
    [join(root, "bin", "sagejs-source.cjs"), "--python"],
    source,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "ast nodes accepted safely");
});
