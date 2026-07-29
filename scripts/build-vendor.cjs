"use strict";

const { mkdirSync } = require("node:fs");
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

console.log("Bundled NumPy and symbolic backends");
