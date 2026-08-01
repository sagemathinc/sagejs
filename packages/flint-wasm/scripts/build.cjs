"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");

const packageRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");
const cowasmRoot = path.resolve(
  process.env.SAGEJS_COWASM_ROOT ||
    path.join(repositoryRoot, "..", "cowasm"),
);
const wasiSdkRoot = path.join(
  cowasmRoot,
  "core",
  "build",
  "build",
  "wasi-sdk",
  "dist",
  "wasi-sdk-next",
  "native",
);
const clang = path.join(wasiSdkRoot, "bin", "clang");
const sysroot = path.join(wasiSdkRoot, "share", "wasi-sysroot");
const wasmStrip = path.join(
  cowasmRoot,
  "core",
  "kernel",
  "node_modules",
  ".bin",
  "wasm-strip",
);
const dependencies = ["flint", "mpfr", "gmp"].map((name) => ({
  name,
  prefix: path.join(cowasmRoot, "sagemath", name, "dist", "wasi-sdk"),
}));
const outputDirectory = path.join(packageRoot, "dist");
const rawOutput = path.join(outputDirectory, "flint-factor.unstripped.wasm");
const output = path.join(outputDirectory, "flint-factor.wasm");
const compilerOutput = path.join(outputDirectory, "compiler.js");
const baselibOutput = path.join(outputDirectory, "baselib.js");
const standardLibraryOutput = path.join(outputDirectory, "stdlib.json");
const wasiRuntimeOutput = path.join(outputDirectory, "wasi-runtime.mjs");
const symbolicBackendOutput = path.join(
  outputDirectory,
  "symbolic-backend.mjs",
);
const plotlyOutput = path.join(outputDirectory, "plotly.min.js");
const compilerSource = path.join(
  repositoryRoot,
  "dist",
  "compiler",
  "compiler.js",
);
const baselibSource = path.join(
  repositoryRoot,
  "dist",
  "compiler",
  "baselib-plain-pretty.js",
);
const standardLibrarySourceDirectory = path.join(repositoryRoot, "src", "lib");
const standardLibraryCacheDirectory = path.join(
  repositoryRoot,
  "dist",
  "module-cache",
);

function requirePath(description, filename) {
  if (!fs.existsSync(filename)) {
    throw new Error(
      `missing ${description}: ${filename}\n` +
        "Build the CoWasm FLINT stack first, or set SAGEJS_COWASM_ROOT " +
        "to an existing CoWasm checkout.",
    );
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

requirePath("WASI SDK clang", clang);
requirePath("WASI SDK sysroot", sysroot);
requirePath("wasm-strip", wasmStrip);
requirePath(
  "built Sage.js compiler (run `pnpm build` first)",
  compilerSource,
);
requirePath(
  "built Sage.js baselib (run `pnpm build` first)",
  baselibSource,
);
for (const dependency of dependencies) {
  requirePath(
    `${dependency.name} headers`,
    path.join(dependency.prefix, "include"),
  );
  requirePath(
    `${dependency.name} archive`,
    path.join(dependency.prefix, "lib", `lib${dependency.name}.a`),
  );
}

fs.mkdirSync(outputDirectory, { recursive: true });

const includeArguments = dependencies.flatMap(({ prefix }) => [
  `-I${path.join(prefix, "include")}`,
]);
const libraryArguments = dependencies.flatMap(({ prefix }) => [
  `-L${path.join(prefix, "lib")}`,
]);
const exportNames = [
  "sagejs_factor_input",
  "sagejs_factor_input_capacity",
  "sagejs_factor_output",
  "sagejs_factor_output_capacity",
  "sagejs_factor",
  "sagejs_is_prime",
  "sagejs_next_prime",
  "sagejs_integer_charpoly_begin",
  "sagejs_integer_charpoly_set",
  "sagejs_integer_charpoly_compute",
  "sagejs_integer_charpoly_coefficient",
  "sagejs_integer_charpoly_clear",
  "sagejs_rational_charpoly_begin",
  "sagejs_rational_charpoly_set",
  "sagejs_rational_charpoly_compute",
  "sagejs_rational_charpoly_coefficient",
  "sagejs_rational_charpoly_clear",
  "sagejs_modsym_weight2_init",
  "sagejs_modsym_clear",
  "sagejs_modsym_p1_count",
  "sagejs_modsym_dimension",
  "sagejs_modsym_farey_cusps",
  "sagejs_modsym_p1_checksum",
  "sagejs_p1_create",
  "sagejs_p1_destroy",
  "sagejs_p1_level",
  "sagejs_p1_count",
  "sagejs_p1_entry",
  "sagejs_p1_normalize",
  "sagejs_p1_normalized_u",
  "sagejs_p1_normalized_v",
  "sagejs_p1_normalized_scalar",
  "sagejs_p1_index",
  "sagejs_p1_apply",
  "sagejs_p1_presentation_field",
  "sagejs_p1_hecke_matrix",
  "sagejs_p1_boundary_data",
  "sagejs_p1_cuspidal_basis",
  "sagejs_p1_star_matrix",
  "sagejs_p1_reduce_path",
  "sagejs_p1_matrix_data",
  "sagejs_p1_matrix_rows",
  "sagejs_p1_matrix_columns",
  "sagejs_p1_cusp_count",
  "sagejs_p1_cusp_numerator",
  "sagejs_p1_cusp_denominator",
];

run(clang, [
  "--target=wasm32-wasip1",
  `--sysroot=${sysroot}`,
  "-mexec-model=reactor",
  "-Oz",
  "-fvisibility=hidden",
  "-Wall",
  "-Wextra",
  "-Werror",
  ...includeArguments,
  `-I${path.join(repositoryRoot, "packages", "flint", "src")}`,
  path.join(packageRoot, "src", "factor.c"),
  path.join(packageRoot, "src", "modsym.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "charpoly.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "p1_core.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "modsym_core.c"),
  path.join(packageRoot, "src", "wasi-stubs.c"),
  ...libraryArguments,
  "-lflint",
  "-lmpfr",
  "-lgmp",
  "-lm",
  "-lwasi-emulated-signal",
  ...exportNames.map((name) => `-Wl,--export=${name}`),
  "-Wl,--export-memory",
  "-Wl,--gc-sections",
  "-o",
  rawOutput,
]);
run(wasmStrip, [rawOutput, "-o", output]);
fs.rmSync(rawOutput);
esbuild.buildSync({
  entryPoints: [path.join(packageRoot, "src", "wasi-runtime.mjs")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: wasiRuntimeOutput,
  inject: [path.join(packageRoot, "src", "node-globals.mjs")],
  alias: {
    assert: "assert",
    buffer: "buffer",
    events: "events",
    path: "path-browserify",
    process: "process",
    stream: "stream-browserify",
    util: "util",
  },
});
esbuild.buildSync({
  entryPoints: [
    path.join(repositoryRoot, "src", "runtime", "symbolic-backend.mjs"),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: symbolicBackendOutput,
  minify: true,
});
fs.copyFileSync(compilerSource, compilerOutput);
fs.copyFileSync(baselibSource, baselibOutput);
const standardLibraryModules = {};
for (const filename of fs.readdirSync(standardLibrarySourceDirectory).sort()) {
  if (!filename.endsWith(".py")) {
    continue;
  }
  const name = filename.slice(0, -3);
  standardLibraryModules[name] = {
    source: fs.readFileSync(
      path.join(standardLibrarySourceDirectory, filename),
      "utf8",
    ),
    cache: JSON.parse(
      fs.readFileSync(
        path.join(standardLibraryCacheDirectory, `${name}.json`),
        "utf8",
      ),
    ),
  };
}
fs.writeFileSync(
  standardLibraryOutput,
  JSON.stringify({ modules: standardLibraryModules }),
);
fs.copyFileSync(
  require.resolve("plotly.js-dist-min/plotly.min.js"),
  plotlyOutput,
);

const bytes = fs.statSync(output).size;
console.log(
  `Built ${path.relative(repositoryRoot, output)} ` +
    `(${(bytes / 1024 / 1024).toFixed(2)} MiB)`,
);
console.log(
  `Copied browser evaluator assets to ` +
    `${path.relative(repositoryRoot, outputDirectory)}`,
);
