"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
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
  runtimeSource.matchAll(/^def ([a-z0-9_]+)\(/gm),
  (match) => match[1],
);
const bootstrapAssignments = Array.from(
  runtimeSource.matchAll(
    /^([a-z_]+) = (?:([A-Za-z0-9_ρσ]+)|r["']%js ([A-Za-z0-9_ρσ]+)["'])$/gm,
  ),
  (match) => [match[1], match[2] ?? match[3]],
);
const bootstrapNames = [
  ...new Set([
    ...bootstrapFunctions,
    ...bootstrapAssignments.map(([name]) => name),
    "undefined",
  ]),
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
  bootstrapAssignments
    .filter(([name]) => name !== "undefined")
    .toSorted(([left], [right]) => left.localeCompare(right)),
  expectedBootstrapAssignments.toSorted(
    ([left], [right]) => left.localeCompare(right),
  ),
  "ordinary bootstrap aliases must lower to the matching runtime globals",
);

function compile(source, outputOptions = {}) {
  const ast = frontend.parse(source, {
    filename: "runtime-intrinsics.py",
  });
  const output = new compiler.OutputStream({
    beautify: true,
    omit_baselib: true,
    ...outputOptions,
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

const nativeArgumentVectors = compile(
  "import sagejs.runtime as runtime\n" +
    "applied = runtime.reflect.apply(target_function, receiver, [1, 2])\n" +
    "constructed = runtime.reflect.construct(constructor, [3, 4])\n" +
    "ordinary = [5, 6]\n",
);
assert.match(
  nativeArgumentVectors,
  /Reflect\.apply\(target_function, receiver, \[1, 2\]\)/,
);
assert.match(
  nativeArgumentVectors,
  /Reflect\.construct\(constructor, \[3, 4\]\)/,
);
assert.match(nativeArgumentVectors, /ordinary = ρσ_list_decorate\(\[ 5, 6 \]\)/);
assert.doesNotMatch(
  nativeArgumentVectors,
  /Reflect\.(?:apply|construct)\([^;]*ρσ_list_decorate/,
);

const nativePropertyRead = compile(
  "import sagejs.runtime as runtime\n" +
    "value = runtime.native_get(target, property_name)\n" +
    "frozen = runtime.native_freeze_tuple(values, prototype)\n",
);
assert.match(nativePropertyRead, /value = target\[property_name\]/);
assert.doesNotMatch(nativePropertyRead, /ρσ_getitem|Reflect\.get/);
assert.match(
  nativePropertyRead,
  /frozen = ρσ_native_freeze_tuple\(values, prototype\)/,
);

const exactValueCodec = compile(
  "import sagejs.runtime as runtime\n" +
    "packed = runtime.exact_integer_values_to_packed_bytes(values)\n" +
    "restored = runtime.exact_integer_values_from_packed_bytes(packed, count)\n",
);
assert.match(
  exactValueCodec,
  /\$ρσ\$py\$packed = ρσ_exact_integer_values_to_packed_bytes\(values\)/,
);
assert.match(
  exactValueCodec,
  /\$ρσ\$py\$restored = ρσ_exact_integer_values_from_packed_bytes\(\$ρσ\$py\$packed, count\)/,
);

const exactRangeMaterialization = compile(
  "import sagejs.runtime as runtime\n" +
    "values = runtime.exact_integer_range_values(start, step, length)\n" +
    "iterator = runtime.exact_integer_range_iterator(start, step, length)\n",
);
assert.match(
  exactRangeMaterialization,
  /values = ρσ_exact_integer_range_values\(start, step, length\)/,
);
assert.match(
  exactRangeMaterialization,
  /iterator = ρσ_exact_integer_range_iterator\(start, step, length\)/,
);

const instanceChecks = compile(
  "one = isinstance(value, candidate)\n" +
    "many = isinstance(value, (first_type, second_type))\n",
);
assert.match(instanceChecks, /one = ρσ_instanceof_one\(value, candidate\)/);
assert.match(instanceChecks, /many = ρσ_instanceof\.apply/);

const tupleLiteral = compile("value = (1, 2)\n", { python_tuples: true });
assert.match(tupleLiteral, /value = ρσ_math_tuple\(\[1, 2\]\)/);
assert.doesNotMatch(tupleLiteral, /ρσ_math_tuple\(ρσ_list_decorate/);

const privateRuntimeVectors = compile(
  "_builtins_call_member(value, '__add__', [other])\n" +
    "_internal_call_member(value, '__iter__', [])\n" +
    "tuple_value = ρσ_math_tuple([1, 2])\n",
  { python_tuples: true },
);
assert.doesNotMatch(privateRuntimeVectors, /ρσ_list_decorate/);
assert.match(privateRuntimeVectors, /_builtins_call_member[^;]*\[other\]\)/);
assert.match(privateRuntimeVectors, /tuple_value = [^;]*ρσ_math_tuple[^;]*\(\[1, 2\]\)/);

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

const codecDirectory = mkdtempSync(join(tmpdir(), "sagejs-exact-codec-"));
const codecPath = join(codecDirectory, "codec.py");
let codecExecution;
try {
  writeFileSync(
    codecPath,
    [
      "import sagejs.runtime as runtime",
      "values = [0, 1, -1, 2**53 + 1, -(2**65537 + 17)]",
      "packed = runtime.exact_integer_values_to_packed_bytes(values)",
      "restored = runtime.list_constructor(",
      "    runtime.exact_integer_values_from_packed_bytes(packed, len(values))",
      ")",
      "negative_zero = runtime.exact_integer_values_to_packed_bytes([0])",
      "negative_zero[3] = 128",
      "noncanonical = runtime.exact_integer_values_to_packed_bytes([1])",
      "noncanonical[4] = 0",
      "failures = 0",
      "for count in [len(values) - 1, len(values) + 1]:",
      "    try:",
      "        runtime.exact_integer_values_from_packed_bytes(packed, count)",
      "    except:",
      "        failures += 1",
      "for malformed in [negative_zero, noncanonical]:",
      "    try:",
      "        runtime.exact_integer_values_from_packed_bytes(malformed, 1)",
      "    except:",
      "        failures += 1",
      "try:",
      "    runtime.exact_integer_values_to_packed_bytes([1.5])",
      "except:",
      "    failures += 1",
      "print(restored == values, failures, len(packed))",
      "",
    ].join("\n"),
  );
  codecExecution = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), codecPath],
    { cwd: root, encoding: "utf8" },
  );
} finally {
  rmSync(codecDirectory, { recursive: true, force: true });
}
assert.equal(codecExecution.status, 0, codecExecution.stderr);
assert.equal(codecExecution.stderr, "");
assert.match(codecExecution.stdout, /True 5 [1-9][0-9]*/);

const rationalCodecDirectory = mkdtempSync(
  join(tmpdir(), "sagejs-rational-codec-"),
);
const rationalCodecPath = join(rationalCodecDirectory, "codec.py");
let rationalCodecExecution;
try {
  writeFileSync(
    rationalCodecPath,
    [
      "import sagejs.runtime as runtime",
      "values = [0, -1, QQ(2, 3), QQ(-(2**521 + 1), 2**257 + 9)]",
      "packed = runtime.canonical_rational_values_to_packed_bytes(",
      "    values, runtime.rational_class, QQ",
      ")",
      "parts = runtime.exact_integer_values_from_packed_bytes(",
      "    packed, 2 * len(values)",
      ")",
      "class Candidate:",
      "    calls = 0",
      "    def _rational_(self):",
      "        Candidate.calls += 1",
      "        return QQ(5, 7)",
      "candidate = Candidate()",
      "rejected = runtime.canonical_rational_values_to_packed_bytes(",
      "    [candidate], runtime.rational_class, QQ",
      ")",
      "print(parts[:6], rejected is runtime.undefined, Candidate.calls)",
      "",
    ].join("\n"),
  );
  rationalCodecExecution = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), rationalCodecPath],
    { cwd: root, encoding: "utf8" },
  );
} finally {
  rmSync(rationalCodecDirectory, { recursive: true, force: true });
}
assert.equal(rationalCodecExecution.status, 0, rationalCodecExecution.stderr);
assert.equal(rationalCodecExecution.stderr, "");
assert.match(rationalCodecExecution.stdout, /\[0, 1, -1, 1, 2, 3\] True 0/);

console.log("Sage.js runtime intrinsic lowering passed.");
frontend.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
