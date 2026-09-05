// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { copyFileSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { test } = require("node:test");
const { executeAssertion } = require("../tools/python-compat/assertion-runner.cjs");
const { executionBytes } = require("../tools/python-compat/evidence.cjs");
const { isolatedEnvironment } = require("../scripts/run-python-compat.cjs");
const root = join(__dirname, "..");

async function compileStandaloneFixture() {
  const [root, input, outputFile] = process.argv.slice(2);
  const { readFileSync, writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  const { default: createCompiler } = require(join(root, "dist/tools/compiler.js"));
  const { createPythonCompilerFrontend } = require(join(root, "dist/tools/python/compiler-frontend.js"));
  const { standaloneRuntimeRequirePrelude } = require(join(root, "tools/standalone-library.cjs"));
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(readFileSync(input, "utf8"), {
      filename: input, libdir: join(root, "src/lib"), import_dirs: [],
      exact_integer_literals: true, strict_python_scopes: true,
      scoped_flags: { dict_literals: true, overload_getitem: true,
        bound_methods: true, sequential_definitions: true },
    });
    const output = new compiler.OutputStream({
      baselib_plain: standaloneRuntimeRequirePrelude() +
        readFileSync(join(root, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
      beautify: true, private_scope: true, exact_integers: true,
      python_tuples: true, python_truthiness: true, python_attributes: true,
    });
    ast.print(output);
    writeFileSync(outputFile, output.get());
  } finally { frontend.close(); }
}

function clean(result) {
  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.timedOut, false);
  assert.equal(result.outputLimited, false);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(executionBytes(result, "stdout").length, 0, result.stdout);
  assert.equal(executionBytes(result, "stderr").length, 0, result.stderr);
}

for (const fixture of ["python-public-super.py", "python-public-builtins-no-import.py"])
for (const mode of ["node-runtime", "standalone"]) {
  test(`${mode}: ${fixture} publishes ordinary Python builtin lookup`, async () => {
    const scratch = mkdtempSync(join(tmpdir(), "sagejs-public-super-"));
    try {
      const pythonFile = join(scratch, "public_super.py");
      copyFileSync(join(__dirname, "fixtures", fixture), pythonFile);
      const options = { cwd: scratch,
        env: { ...isolatedEnvironment(scratch), NODE_PATH: join(root, "node_modules") },
        timeoutMs: 30000, maxOutputBytes: 1048576 };
      const cli = join(root, "bin/sagejs-source.cjs");
      if (mode === "node-runtime") {
        clean(await executeAssertion(process.execPath,
          ["--max-old-space-size=512", cli, "--python", pythonFile], options));
      } else {
        const javascriptFile = join(scratch, "public_super.js");
        // The full CLI standalone path eagerly includes the advanced Sage
        // mathematics graph even in Python mode. Exercise its real emitter
        // and standalone builtins adapter with the existing base runtime,
        // without compiling unrelated mathematical modules in this test.
        const driver = join(scratch, "compile.cjs");
        writeFileSync(driver, `(${compileStandaloneFixture.toString()})().catch(error => { console.error(error); process.exitCode = 1; });\n`);
        clean(await executeAssertion(process.execPath,
          ["--max-old-space-size=512", driver, root, pythonFile, javascriptFile], options));
        clean(await executeAssertion(process.execPath,
          ["--max-old-space-size=512", javascriptFile], options));
      }
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
}
