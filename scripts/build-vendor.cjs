"use strict";

const { copyFileSync, mkdirSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { dirname, join } = require("node:path");
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
function buildParser(name, sourceDirectory, { generate = false } = {}) {
  if (generate) {
    execFileSync(
      process.execPath,
      [require.resolve("tree-sitter-cli/cli.js"), "generate"],
      { cwd: sourceDirectory, stdio: "inherit" },
    );
  }
  execFileSync(
    process.execPath,
    [
      require.resolve("tree-sitter-cli/cli.js"),
      "build",
      "--wasm",
      "--output",
      join(outputDirectory, `tree-sitter-${name}.wasm`),
      sourceDirectory,
    ],
    { cwd: root, stdio: "inherit" },
  );
}

// Build Python from our tiny, reviewable grammar overlay instead of copying
// the package's prebuilt WASM.  This keeps the pinned upstream scanner and
// grammar as the foundation while allowing correctness fixes to live in this
// repository and apply identically on every platform.
buildParser("python", join(root, "tools", "tree-sitter-python"), {
  generate: true,
});
buildParser("magma", join(root, "upstream-tests", "tree-sitter-magma"));
buildParser("sage", join(root, "tools", "tree-sitter-sage"), {
  generate: true,
});
buildParser("wolfram", join(root, "upstream-tests", "tree-sitter-wolfram"));
buildParser("matlab", join(root, "upstream-tests", "tree-sitter-matlab"));
buildParser("maple", join(root, "tools", "maple"));
buildParser(
  "macaulay2",
  dirname(require.resolve("tree-sitter-macaulay2/package.json")),
);

console.log("Bundled NumPy, symbolic, and foreign-language parser backends");
