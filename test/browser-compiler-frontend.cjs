// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const esbuild = require("esbuild");

const root = join(__dirname, "..");
const packageRoot = join(root, "packages", "flint-wasm");
const resourceShim = join(
  packageRoot,
  "src",
  "compiler-resources.ts",
);

test("the browser worker uses the authoritative Tree-sitter frontend", async () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-browser-"));
  const bundle = join(temporaryDirectory, "compiler-frontend.mjs");
  await esbuild.build({
    entryPoints: [
      join(packageRoot, "src", "compiler-frontend-entry.ts"),
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    outfile: bundle,
    alias: {
      path: require.resolve("path-browserify", { paths: [packageRoot] }),
    },
    external: ["fs/promises", "module"],
    plugins: [{
      name: "sagejs-browser-compiler-resources",
      setup(build) {
        build.onResolve(
          { filter: /^\.\.\/(?:resources|standalone-resources|utils)$/ },
          () => ({ path: resourceShim }),
        );
      },
    }],
  });
  const browserFrontend = await import(pathToFileURL(bundle));
  assert.throws(
    () => browserFrontend.configureBrowserCompilerResources({
      standardLibrary: { modules: {} },
    }),
    /requires coreStandalone dependencies/,
  );
  browserFrontend.configureBrowserCompilerResources({
    treeSitterRuntime: readFileSync(
      join(root, "dist", "vendor", "web-tree-sitter.wasm"),
    ),
    pythonGrammar: readFileSync(
      join(root, "dist", "vendor", "tree-sitter-python.wasm"),
    ),
    sageGrammar: readFileSync(
      join(root, "dist", "vendor", "tree-sitter-sage.wasm"),
    ),
    standardLibrary: {
      coreStandalone: ["implicit_support"],
      modules: {
        implicit_support: {
          source: "support_value = 7\n",
          cache: { signature: "browser-support-fixture" },
        },
      },
    },
  });

  try {
    const compiler = require("../dist/tools/compiler.js").default();
    assert.equal(compiler.parse, undefined);
    const frontend = await browserFrontend.createPythonCompilerFrontend(
      compiler,
      "sage",
    );
    try {
      const ast = frontend.parse("answer = 2^8", {
        filename: "<browser-test>",
        libdir: "__stdlib__",
      });
      assert.ok(ast.imported_module_ids.includes("implicit_support"));
      assert.equal(ast.imports.implicit_support.standalone_lazy, true);
      const output = new compiler.OutputStream({
        omit_baselib: true,
        beautify: true,
      });
      ast.print(output);
      assert.match(output.get(), /ρσ_operator_pow/);
      assert.match(output.get(), /support_value/);
      const dynamicAst = frontend.parse("answer = 2^8", {
        filename: "<browser-dynamic-test>",
        runtime_imports: true,
      });
      assert.ok(!dynamicAst.imported_module_ids.includes("implicit_support"));
    } finally {
      frontend.close();
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  const workerSource = readFileSync(
    join(packageRoot, "compiler-worker.mjs"),
    "utf8",
  );
  assert.doesNotMatch(workerSource, /compiler\.parse\s*\(/);
  assert.match(workerSource, /frontend\.parse\s*\(/);
  assert.match(workerSource, /result = `void 0;\\n\$\{bootstrap\}`/);
});
