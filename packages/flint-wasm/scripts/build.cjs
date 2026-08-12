"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const { loadRegistry } = require("../../../tools/ffi/declarations.cjs");
const {
  generatedWasmResourceAdapter,
} = require("../../../tools/ffi/wasm-adapters.cjs");

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
const resourceAdapterSource = path.join(
  outputDirectory,
  "ffi-resource-adapter.c",
);
const resourceBackendOutput = path.join(
  outputDirectory,
  "ffi-resource-backend.mjs",
);
const resourceManifestOutput = path.join(
  outputDirectory,
  "ffi-resource-manifest.json",
);
const compilerOutput = path.join(outputDirectory, "compiler.js");
const compilerFrontendOutput = path.join(
  outputDirectory,
  "compiler-frontend.mjs",
);
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
const vendorDirectory = path.join(repositoryRoot, "dist", "vendor");
const compilerResourceShim = path.join(
  packageRoot,
  "src",
  "compiler-resources.ts",
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
for (const filename of [
  "web-tree-sitter.wasm",
  "tree-sitter-python.wasm",
  "tree-sitter-sage.wasm",
]) {
  requirePath(
    `built ${filename} (run \`pnpm build\` first)`,
    path.join(vendorDirectory, filename),
  );
}
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

const flintDeclaration = loadRegistry({ root: repositoryRoot }).byId.get(
  "flint",
);
if (flintDeclaration === undefined) {
  throw new Error("the generated FLINT FFI declaration is unavailable");
}
const resourceAdapter = generatedWasmResourceAdapter(flintDeclaration, {
  resourceIds: ["dirichlet_group"],
  functionIds: [
    "dirichlet_group_init",
    "dirichlet_group_size",
    "dirichlet_group_num_primitive",
  ],
});
fs.writeFileSync(resourceAdapterSource, resourceAdapter.cSource);
fs.writeFileSync(
  resourceBackendOutput,
  resourceAdapter.javascriptSource +
    "\nexport const generatedWasmManifest = Object.freeze(" +
    JSON.stringify(resourceAdapter.manifest) +
    ");\n",
);
fs.writeFileSync(resourceManifestOutput, resourceAdapter.manifestSource);

const includeArguments = dependencies.flatMap(({ prefix }) => [
  "-isystem",
  path.join(prefix, "include"),
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
  ...resourceAdapter.manifest.exports,
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
  `-I${path.join(repositoryRoot, "packages", "flint", "include")}`,
  path.join(packageRoot, "src", "factor.c"),
  path.join(packageRoot, "src", "modsym.c"),
  resourceAdapterSource,
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
const compilerFrontendBuild = esbuild.build({
  entryPoints: [
    path.join(packageRoot, "src", "compiler-frontend-entry.ts"),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: compilerFrontendOutput,
  alias: {
    path: require.resolve("path-browserify", { paths: [packageRoot] }),
  },
  // web-tree-sitter contains guarded Node fallbacks. They are unreachable in
  // a browser worker but must remain unresolved dynamic imports in the bundle.
  external: ["fs/promises", "module"],
  plugins: [{
    name: "sagejs-browser-compiler-resources",
    setup(build) {
      build.onResolve(
        { filter: /^\.\.\/(?:resources|utils)$/ },
        () => ({ path: compilerResourceShim }),
      );
    },
  }],
});
fs.copyFileSync(compilerSource, compilerOutput);
fs.copyFileSync(baselibSource, baselibOutput);
for (const filename of [
  "web-tree-sitter.wasm",
  "tree-sitter-python.wasm",
  "tree-sitter-sage.wasm",
]) {
  fs.copyFileSync(
    path.join(vendorDirectory, filename),
    path.join(outputDirectory, filename),
  );
}
function pythonSources(directory) {
  const sources = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...pythonSources(filename));
    } else if (entry.isFile() && entry.name.endsWith(".py")) {
      sources.push(filename);
    }
  }
  return sources.sort();
}

const standardLibraryModules = {};
for (const filename of pythonSources(standardLibrarySourceDirectory)) {
  const relative = path.relative(standardLibrarySourceDirectory, filename);
  const components = relative.slice(0, -3).split(path.sep);
  if (components.at(-1) === "__init__") components.pop();
  const name = components.join(".");
  if (!name) continue;
  const cacheFilename = path.join(
    standardLibraryCacheDirectory,
    `${name}.json`,
  );
  if (!fs.existsSync(cacheFilename)) continue;
  standardLibraryModules[name] = {
    package: path.basename(filename) === "__init__.py",
    source: fs.readFileSync(filename, "utf8"),
    cache: JSON.parse(
      fs.readFileSync(
        cacheFilename,
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
void compilerFrontendBuild.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
