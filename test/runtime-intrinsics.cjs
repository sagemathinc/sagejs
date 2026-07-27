"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const createCompiler = require("..");

const root = join(__dirname, "..");
const compiler = createCompiler();

const parserSource = readFileSync(join(root, "src", "parse.py"), "utf8");
const runtimeSource = readFileSync(
  join(root, "src", "baselib", "sagejs", "runtime.py"),
  "utf8",
);
const manifestBlock = parserSource.match(
  /SAGEJS_RUNTIME_INTRINSICS = \{([\s\S]*?)\n\}/,
);
assert.notEqual(manifestBlock, null);
const manifest = Array.from(
  manifestBlock[1].matchAll(/^\s*'([^']+)': '(ρσ_[^']+)',?$/gm),
  (match) => [match[1], match[2]],
);
const bootstrapAliases = Array.from(
  runtimeSource.matchAll(/^([a-z_]+) = (ρσ_[A-Za-z0-9_]+)$/gm),
  (match) => [match[1], match[2]],
);
assert.deepEqual(
  bootstrapAliases,
  manifest,
  "the bootstrap runtime module and compiler manifest must stay synchronized",
);

function compile(source) {
  const ast = compiler.parse(source, {
    filename: "runtime-intrinsics.py",
  });
  const output = new compiler.OutputStream({
    beautify: true,
    omit_baselib: true,
  });
  ast.print(output);
  return output.get();
}

const source = [
  "import sagejs.runtime as runtime",
  "left = runtime.integer_bigint(6)",
  "right = runtime.integer_bigint(7)",
  "answer = runtime.operator_mul_exact(left, right)",
  "",
].join("\n");
const generated = compile(source);

assert.match(generated, /ρσ_integer_bigint\(6\)/);
assert.match(generated, /ρσ_operator_mul_exact/);
assert.doesNotMatch(generated, /sagejs\.runtime/);
assert.doesNotMatch(generated, /ρσ_modules\["sagejs\.runtime"\]/);
assert.doesNotMatch(generated, /\bruntime\b/);

for (const [name, lowered] of manifest) {
  const oneAttribute = compile(
    `import sagejs.runtime as runtime\nvalue = runtime.${name}\n`,
  );
  assert.match(oneAttribute, new RegExp(`value = ${lowered}`));
  assert.doesNotMatch(oneAttribute, /\bruntime\b/);
}

assert.throws(
  () =>
    compile(
      "import sagejs.runtime as runtime\n" +
        "runtime.this_intrinsic_does_not_exist()\n",
    ),
  /sagejs\.runtime has no compiler intrinsic named/,
);
assert.throws(
  () => compile("import sagejs.runtime\n"),
  /Compiler intrinsic modules require an explicit alias/,
);

const lint = spawnSync(
  process.execPath,
  [join(root, "bin", "sagejs"), "lint", "-"],
  {
    cwd: root,
    encoding: "utf8",
    input: source,
  },
);
assert.equal(lint.status, 0, lint.stderr);
assert.equal(lint.stdout, "");

console.log("Sage.js runtime intrinsic lowering passed.");
