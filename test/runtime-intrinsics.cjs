"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const createCompiler = require("..");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  SAGEJS_PUBLIC_INTRINSICS,
  SAGEJS_RUNTIME_INTRINSICS,
} = require("../dist/tools/python/contract.js");

const root = join(__dirname, "..");
(async () => {
const compiler = createCompiler();
const frontend = await createPythonCompilerFrontend(compiler, "python");

const runtimeSource = readFileSync(
  join(root, "src", "baselib", "sagejs", "runtime.py"),
  "utf8",
);
const runtimeManifest = Object.entries(SAGEJS_RUNTIME_INTRINSICS);
const publicManifest = Object.entries(SAGEJS_PUBLIC_INTRINSICS);
const bootstrapFunctions = Array.from(
  runtimeSource.matchAll(/^def ([a-z_]+)\(/gm),
  (match) => match[1],
);
const bootstrapAssignments = Array.from(
  runtimeSource.matchAll(
    /^([a-z_]+) = (?:([A-Za-z0-9_ρσ]+)|r'%js ([A-Za-z0-9_ρσ]+)')$/gm,
  ),
  (match) => [match[1], match[2] ?? match[3]],
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
const expectedBootstrapAssignments = runtimeManifest
  .filter(
    ([name]) =>
      name !== "undefined" && !bootstrapFunctions.includes(name),
  )
  .map(([name, value]) =>
    // The source bootstrap runs before builtins initializes these stable
    // aliases. The converged compiler uses the aliases so user variables
    // cannot capture low-level runtime operations.
    name === "number"
      ? [name, "Number"]
      : name === "polynomial_ring"
        ? [name, "PolynomialRing"]
        : [name, value],
  );
assert.deepEqual(
  bootstrapAssignments.toSorted(([left], [right]) => left.localeCompare(right)),
  expectedBootstrapAssignments.toSorted(
    ([left], [right]) => left.localeCompare(right),
  ),
  "ordinary bootstrap aliases must lower to the matching runtime globals",
);

function compile(source) {
  const ast = frontend.parse(source, {
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
assert.doesNotMatch(generated, /(?:\bvar\s+runtime\b|\bruntime\s*[.(])/);

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
  assert.doesNotMatch(
    oneAttribute,
    /(?:\bvar\s+runtime\b|\bruntime\s*[.(])/,
  );
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
frontend.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
