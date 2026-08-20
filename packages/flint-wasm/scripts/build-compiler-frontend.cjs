"use strict";

const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const [entry, outfile, resourceShim, pathPolyfill, metafile] =
    process.argv.slice(2);
  if ([entry, outfile, resourceShim, pathPolyfill, metafile]
    .some((value) => typeof value !== "string")) {
    throw new Error("compiler frontend build requires five path arguments");
  }
  const result = await esbuild.build({
    absWorkingDir: path.resolve(__dirname, "..", "..", ".."),
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    outfile,
    alias: { path: pathPolyfill },
    // web-tree-sitter contains guarded Node fallbacks. They are unreachable in
    // a browser worker but must remain unresolved dynamic imports in the bundle.
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
    metafile: true,
  });
  fs.writeFileSync(metafile, JSON.stringify(result.metafile));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
