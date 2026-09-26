// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(root, "bench/native_closed_mapping.py");

test("TypedDict lowers to a copied fixed-layout mapping ABI", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  assert.deepEqual(ir.records, [{
    name: "ClassUnitEvidence",
    type: "Mapping:ClassUnitEvidence",
    layout: "compiler-owned-closed-mapping",
    ownership: "copied-scalar-fields",
    access: "literal-string-keys",
    fields: [
      { name: "classNumber", type: "uint64" },
      { name: "signature", type: "int64" },
      { name: "complete", type: "bool" },
    ],
  }]);
  assert.deepEqual(ir.callGraph, {
    _closed_mapping_score: [],
    closed_mapping_score: ["_closed_mapping_score"],
  });
  const rootFunction = ir.functions.find(candidate =>
    candidate.name === "closed_mapping_score");
  assert.equal(rootFunction.params[0].type, "Mapping:ClassUnitEvidence");
  const helper = ir.functions.find(candidate =>
    candidate.name === "_closed_mapping_score");
  const accesses = [];
  const visit = operations => {
    for (const operation of operations || []) {
      if (operation.kind === "record.get") {
        accesses.push([operation.field, operation.access]);
      }
      visit(operation.condition?.operations);
      visit(operation.body);
      visit(operation.alternative);
    }
  };
  visit(helper.body);
  assert.deepEqual(accesses, [
    ["classNumber", "literal-string-key"],
    ["complete", "literal-string-key"],
    ["signature", "literal-string-key"],
  ]);

  const core = generateHostCore(ir);
  assert.match(core.header,
    /typedef struct\s*\{\s*uint64_t sagejs_field_classNumber;\s*int64_t sagejs_field_signature;\s*int sagejs_field_complete;\s*\} sagejs_native_record_ClassUnitEvidence;/s);
  assert.match(core.source,
    /sagejs_local_tagged_owner\.sagejs_field_classNumber/);
  assert.doesNotMatch(core.source, /napi_get_named_property|PyObject|host callback/);
});

test("closed mapping agrees across dynamic JavaScript, tagged, and GMP", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-native-mapping-"));
  const built = await compileKernel({ sourcePath, cacheRoot });
  const run = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const fn = module.closed_mapping_score;
const rows = [
  [{ classNumber: 7n, signature: 2n, complete: false }, 7n],
  [{ classNumber: 7, signature: -2, complete: true }, 35n],
  [{ classNumber: 18446744073709551580n, signature: 0n, complete: true },
    18446744073709551591n],
];
for (const implementation of [fn, fn.javascript, fn.tagged, fn.gmp]) {
  for (const [owner, expected] of rows) assert.equal(implementation(owner), expected);
}
for (const owner of [{}, null, { classNumber: 1n, signature: 0n, complete: 1 }]) {
  assert.throws(() => fn.gmp(owner), TypeError);
}
for (const owner of [
  { classNumber: -1n, signature: 0n, complete: true },
  { classNumber: 1n << 64n, signature: 0n, complete: true },
  { classNumber: 1n, signature: 1n << 63n, complete: true },
]) assert.throws(() => fn.gmp(owner), RangeError);
` , built.modulePath], { cwd: root, encoding: "utf8", timeout: 120_000 });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr || run.stdout);

});

test("closed mapping language fails closed outside its finite scalar contract", async () => {
  const prefix = "from typing import TypedDict\n" +
    "from sagejs.native import native, uint64\n";
  await assert.rejects(() => lowerSource(prefix +
    "@native\ndef f(owner: dict[str, int]) -> int:\n" +
    "    return owner['classNumber']\n", "arbitrary-dict.py"),
  /unsupported argument annotation AST_ItemAccess/);
  await assert.rejects(() => lowerSource(prefix +
    "class Owner(TypedDict):\n    classNumber: uint64\n" +
    "@native\ndef f(owner: Owner, key: uint64) -> int:\n" +
    "    return owner[key]\n", "dynamic-key.py"),
  /mapping access requires a literal string key/);
  await assert.rejects(() => lowerSource(prefix +
    "class Owner(TypedDict):\n    classNumber: uint64\n" +
    "@native\ndef f(owner: Owner) -> int:\n" +
    "    return owner['regulator']\n", "unknown-key.py"),
  /Owner has no key regulator/);
  await assert.rejects(() => lowerSource(prefix +
    "class Owner(TypedDict):\n    values: list[int]\n" +
    "@native\ndef f(owner: Owner) -> int:\n    return 0\n",
  "dynamic-value.py"), /unsupported native mapping field Owner.values/);
  await assert.rejects(() => lowerSource(prefix +
    "class Owner(TypedDict):\n    classNumber: uint64\n" +
    "@native\ndef f(owner: Owner) -> int:\n" +
    "    owner['classNumber'] = 2\n    return owner['classNumber']\n",
  "mapping-mutation.py"), /closed mappings are read-only/);
  await assert.rejects(() => lowerSource(prefix +
    "class Owner(TypedDict):\n    classNumber: uint64\n" +
    "@native\ndef f(owner: Owner) -> Owner:\n    return owner\n",
  "mapping-escape.py"), /closed mappings are borrowed values and may not be returned/);
});
