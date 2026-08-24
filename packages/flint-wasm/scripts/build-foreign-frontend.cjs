"use strict";

const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const [entry, outfile, resourceShim, magmaEnvironmentShim, pathPolyfill, metafile] =
    process.argv.slice(2);
  if ([entry, outfile, resourceShim, magmaEnvironmentShim, pathPolyfill, metafile]
    .some((value) => typeof value !== "string")) {
    throw new Error("foreign frontend build requires six path arguments");
  }
  const result = await esbuild.build({
    absWorkingDir: path.resolve(__dirname, "..", "..", ".."),
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    outfile,
    alias: { path: pathPolyfill, "node:path": pathPolyfill },
    external: ["fs/promises", "module"],
    plugins: [{
      name: "sagejs-browser-foreign-resources",
      setup(build) {
        build.onResolve(
          { filter: /^\.\.\/(?:resources|utils)$/ },
          () => ({ path: resourceShim }),
        );
        build.onResolve(
          { filter: /^\.\/environment$/ },
          (args) => args.importer.endsWith("/tools/magma/frontend.ts")
            ? { path: magmaEnvironmentShim }
            : undefined,
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
