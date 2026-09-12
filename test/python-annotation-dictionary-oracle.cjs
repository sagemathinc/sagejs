// sagejs-test-tier: specialized
"use strict";

// Standalone proposal oracle: no implicit import of a possibly changing dist.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const python = process.env.SAGEJS_ANNOTATION_PYTHON || "python3";
const fixture = kind => readFileSync(join(__dirname,
  `fixtures/python-annotation-dictionary-${kind}.py`), "utf8");

for (const kind of ["future", "evaluated"]) {
  test(`CPython 3.14 annotation oracle: ${kind}`, () => {
    const result = spawnSync(python, ["-c",
      "import sys\nassert sys.version_info[:2] == (3, 14)\nexec(" +
        JSON.stringify(fixture(kind)) + ")"],
    { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(result.stdout.trim(), `annotation-${kind}-ok`);
  });
}

// Run only against a private copy of an explicitly identified frozen artifact.
// These assertions intentionally FAIL for the known baseline defects.
const root = process.env.SAGEJS_ANNOTATION_ARTIFACT;
test("baselib annotations preserve the exact raw metadata boundary",
  { skip: root ? false : "candidate artifact not supplied" }, async () => {
    const artifact = resolve(root);
    const compiler = require(join(artifact, "dist/tools/compiler.js")).default();
    const { createPythonCompilerFrontend } = require(
      join(artifact, "dist/tools/python/compiler-frontend.js"));
    const frontend = await createPythonCompilerFrontend(compiler, "python");
    try {
      for (const directive of [
        "from __future__ import annotations", "from __python__ import annotations",
      ]) {
        const ast = frontend.parse(directive +
          "\ndef tagged(value: 7) -> 11:\n    pass\ndef empty():\n    pass\n",
          { filename: "<annotation-raw-metadata>", import_dirs: [],
            scoped_flags: { dict_literals: true, bound_methods: true } });
        const output = new compiler.OutputStream({
          omit_baselib: true, private_scope: false, write_name: false,
          python_attributes: false, beautify: false,
        });
        ast.print(output);
        const code = output.get();
        const annotations = [...code.matchAll(/\.__annotations__\s*=\s*([^;]+);/g)]
          .map(match => match[1].replace(/\s+/g, ""));
        const values = directive.includes("__future__")
          ? '{"value":"7","return":"11"}' : '{"value":7,return:11}';
        assert.deepEqual(annotations, [values, "{}"], code);
      }
    } finally { frontend.close(); }
  });

for (const mode of ["python", "sage"]) {
  for (const kind of ["future", "evaluated"]) {
    test(`candidate annotation contract: ${mode}/${kind}`,
      { skip: root ? false : "candidate artifact not supplied; NOT compatibility qualification" },
      async t => {
        const { createSage } = require(join(resolve(root), "dist/tools/kernel.js"));
        const session = await createSage({ mode });
        t.after(() => session.close());
        const source = kind === "evaluated"
          ? "from __python__ import annotations\n" +
            fixture(kind).replace("LEGACY_EVALUATED = False", "LEGACY_EVALUATED = True")
          : fixture(kind);
        const result = await session.evaluate(source);
        assert.equal(result.stdout.trim(), `annotation-${kind}-ok`);
      });
  }
}
