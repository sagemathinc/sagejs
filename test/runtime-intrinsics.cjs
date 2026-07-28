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
const runtimeManifestBlock = parserSource.match(
  /SAGEJS_RUNTIME_INTRINSICS = \{([\s\S]*?)\n\}/,
);
const publicManifestBlock = parserSource.match(
  /SAGEJS_PUBLIC_INTRINSICS = \{([\s\S]*?)\n\}/,
);
assert.notEqual(runtimeManifestBlock, null);
assert.notEqual(publicManifestBlock, null);

function parseManifest(block) {
  return Array.from(
    block[1].matchAll(/^\s*'([^']+)': '([^']+)',?$/gm),
    (match) => [match[1], match[2]],
  );
}

const runtimeManifest = parseManifest(runtimeManifestBlock);
const publicManifest = parseManifest(publicManifestBlock);
const bootstrapFunctions = Array.from(
  runtimeSource.matchAll(/^def ([a-z_]+)\(/gm),
  (match) => match[1],
);
const bootstrapAssignments = Array.from(
  runtimeSource.matchAll(/^([a-z_]+) = ([A-Za-z0-9_ρσ]+)$/gm),
  (match) => [match[1], match[2]],
);
const bootstrapNames = [
  ...bootstrapFunctions,
  ...bootstrapAssignments.map(([name]) => name),
  "undefined",
].sort();
assert.deepEqual(
  bootstrapNames,
  runtimeManifest.map(([name]) => name).sort(),
  "the bootstrap runtime exports and compiler manifest must stay synchronized",
);
assert.deepEqual(
  bootstrapAssignments,
  runtimeManifest.filter(
    ([name]) =>
      name !== "undefined" && !bootstrapFunctions.includes(name),
  ),
  "ordinary bootstrap aliases must lower to the matching runtime globals",
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const [name, lowered] of runtimeManifest) {
  const oneAttribute = compile(
    `import sagejs.runtime as runtime\nvalue = runtime.${name}\n`,
  );
  assert.match(
    oneAttribute,
    new RegExp(`value = ${escapeRegExp(lowered)}`),
  );
  assert.doesNotMatch(oneAttribute, /\bruntime\b/);
}

for (const [name, lowered] of publicManifest) {
  const oneAttribute = compile(
    `import sagejs as sage\nvalue = sage.${name}\n`,
  );
  assert.match(
    oneAttribute,
    new RegExp(`value = ${escapeRegExp(lowered)}`),
  );
  assert.doesNotMatch(oneAttribute, /\bsage\b/);
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
