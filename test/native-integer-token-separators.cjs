// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { Script } = require("node:vm");
const { createCompiler } = require("..");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

test("exact integer tokens normalize separators without rounding or losing source spans", async () => {
  for (const mode of ["python", "sage"]) {
    const compiler = createCompiler();
    const frontend = await createPythonCompilerFrontend(compiler, mode);
    try {
      for (const [token, canonical, expected] of [
        ["2_146_689", "2146689", 2146689n],
        ["9_007_199_254_740_993", "9007199254740993", 9007199254740993n],
        ["18_446_744_073_709_551_615", "18446744073709551615", 18446744073709551615n],
        ["0_0", "00", 0n],
        ["0x_FF_FF", "0xFFFF", 65535n],
        ["0b_1010_0101", "0b10100101", 165n],
        ["0o_7_7", "0o77", 63n],
      ]) {
        const source = `answer = ${token}`;
        const ast = frontend.parse(source, {
          filename: "integer-token.py",
          exact_integer_literals: true,
        });
        const literal = ast.body[0].body.right;
        assert.equal(literal.expression.name, "Integer");
        assert.equal(literal.args[0].value, canonical);
        assert.equal(literal.start.raw, token);
        assert.equal(source.slice(literal.start.pos, literal.end.pos), token);
        assert.equal(literal.start.file, "integer-token.py");
        const output = new compiler.OutputStream({
          omit_baselib: true,
          write_name: false,
          private_scope: false,
          exact_integers: true,
        });
        ast.print(output);
        const sandbox = {
          Integer: (value) => BigInt(value),
          ρσ_resolve_callable: (value) => value,
        };
        new Script(output.get()).runInNewContext(sandbox);
        assert.equal(sandbox.ρσ_modules.__main__.answer, expected);
      }
    } finally {
      frontend.close();
    }
  }
});

test("normalization does not rewrite explicit constructor strings or float tokens", async () => {
  for (const mode of ["python", "sage"]) {
    const frontend = await createPythonCompilerFrontend(createCompiler(), mode);
    try {
      for (const text of ["2_146_689", "1__0", "not_a_number"]) {
        const ast = frontend.parse(`answer = Integer(${JSON.stringify(text)})`, {
          exact_integer_literals: true,
        });
        assert.equal(ast.body[0].body.right.args[0].value, text);
      }
      const float = frontend.parse("answer = 1_000.25", {
        exact_integer_literals: true,
      });
      assert.equal(float.body[0].body.right.args[0].value, "1_000.25");
      if (mode === "python") {
        const approximate = frontend.parse("answer = 2_146_689", {
          exact_integer_literals: false,
        });
        assert.equal(approximate.body[0].body.right.value, 2146689);
      }
    } finally {
      frontend.close();
    }
  }
});

test("invalid integer token separators still fail before normalization", async () => {
  for (const mode of ["python", "sage"]) {
    const frontend = await createPythonCompilerFrontend(createCompiler(), mode);
    try {
      for (const token of ["1__000", "1_", "0_1", "0x__f", "0x_"]) {
        assert.throws(() => frontend.parse(`answer = ${token}`, {
          filename: "invalid-token.py",
          exact_integer_literals: true,
        }), /SyntaxError|syntax|leading zeros/i, `${mode}: ${token}`);
      }
    } finally {
      frontend.close();
    }
  }
});

test("native integer constants, defaults, annotations and negatives accept separators", async () => {
  const source = [
    "from sagejs.native import native, uint64",
    "LIMIT = 2_146_689",
    "@native",
    "def budget(extra: uint64 = 1_000) -> uint64:",
    "    bound: uint64 = LIMIT",
    "    return bound + extra",
    "@native",
    "def exact() -> int:",
    "    n: int = -9_007_199_254_740_993",
    "    return n",
    "@native",
    "def maximum() -> uint64:",
    "    return 18_446_744_073_709_551_615",
    "",
  ].join("\n");
  const ir = await lowerSource(source, "native-tokens.py");
  const byName = new Map(ir.functions.map((fn) => [fn.name, fn]));
  assert.equal(byName.get("budget").params[0].default, "1000");
  for (const [name, value] of [
    ["budget", "2146689"],
    ["exact", "-9007199254740993"],
    ["maximum", "18446744073709551615"],
  ]) {
    assert(byName.get(name).body.some((op) => op.value === value), name);
  }
  const constant = byName.get("maximum").body.find((op) => op.kind === "uint64.constant");
  assert.equal(constant.provenance.file, "native-tokens.py");
  assert(source.slice(constant.provenance.start.offset, constant.provenance.end.offset)
    .includes("18_446_744_073_709_551_615"));
});

test("separated uint64 overflow remains rejected", async () => {
  for (const value of ["18_446_744_073_709_551_616", "-1_000"]) {
    await assert.rejects(lowerSource([
      "from sagejs.native import native, uint64",
      "@native",
      "def overflow() -> uint64:",
      `    return ${value}`,
      "",
    ].join("\n"), "overflow.py"), /uint64 literal is outside unsigned 64-bit/);
  }
});
