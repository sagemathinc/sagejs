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
          { filter: /^\.\.\/(?:resources|utils)$/ },
          () => ({ path: resourceShim }),
        );
      },
    }],
  });
  const browserFrontend = await import(pathToFileURL(bundle));
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
    standardLibrary: { modules: {} },
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
      });
      const output = new compiler.OutputStream({
        omit_baselib: true,
        beautify: true,
      });
      ast.print(output);
      assert.match(output.get(), /ρσ_operator_pow/);
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
});
