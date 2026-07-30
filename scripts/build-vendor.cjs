"use strict";

const { copyFileSync, mkdirSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const { buildSync } = require("esbuild");

const root = join(__dirname, "..");
const outputDirectory = join(root, "dist", "vendor");
mkdirSync(outputDirectory, { recursive: true });

buildSync({
  entryPoints: [require.resolve("numpy-ts")],
  outfile: join(outputDirectory, "numpy-ts.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  minify: false,
});

buildSync({
  entryPoints: [join(root, "src", "runtime", "symbolic-backend.mjs")],
  outfile: join(outputDirectory, "symbolic-backend.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  minify: false,
});

copyFileSync(
  require.resolve("web-tree-sitter/web-tree-sitter.wasm"),
  join(outputDirectory, "web-tree-sitter.wasm"),
);

execFileSync(
  join(root, "node_modules", ".bin", "tree-sitter"),
  [
    "build",
    "--wasm",
    "--output",
    join(outputDirectory, "tree-sitter-magma.wasm"),
    join(root, "upstream-tests", "tree-sitter-magma"),
  ],
  { cwd: root, stdio: "inherit" },
);

console.log("Bundled NumPy, symbolic, and Magma parser backends");
