"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const { loadRegistry } = require("../../../tools/ffi/declarations.cjs");
const {
  generatedWasmResourceAdapter,
} = require("../../../tools/ffi/wasm-adapters.cjs");

const packageRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");
const cowasmRoot = path.resolve(process.env.SAGEJS_COWASM_ROOT || [
  path.join(repositoryRoot, "..", "cowasm"),
  path.join(os.homedir(), "cowasm"),
].find((candidate) => fs.existsSync(candidate)) ||
  path.join(repositoryRoot, "..", "cowasm"));
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
const m4riDependency = {
  name: "m4ri",
  prefix: path.join(cowasmRoot, "sagemath", "m4ri", "dist", "wasi-sdk"),
};
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
const m4riRawOutput = path.join(
  outputDirectory,
  "m4ri-resource.unstripped.wasm",
);
const m4riOutput = path.join(outputDirectory, "m4ri-resource.wasm");
const m4riAdapterSource = path.join(
  outputDirectory,
  "m4ri-resource-adapter.c",
);
const m4riBackendOutput = path.join(
  outputDirectory,
  "m4ri-resource-backend.mjs",
);
const m4riManifestOutput = path.join(
  outputDirectory,
  "m4ri-resource-manifest.json",
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
const serializationOutput = path.join(
  outputDirectory,
  "serialization.mjs",
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
const browserAdditionalModules = [
  "collections.abc",
  "sagejs.ffi.flint",
  "sagejs.ffi.m4ri",
  "sagejs.kernels.matrix.dense_binary_m4ri",
  "sagejs.kernels.matrix.dense_integer_flint",
  "sagejs.kernels.matrix.dense_rational_flint",
  "sagejs.linear_algebra.matrix_subspaces",
  "sagejs.linear_algebra.matrix_subspaces_public",
];
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
requirePath(
  "m4ri headers",
  path.join(m4riDependency.prefix, "include"),
);
requirePath(
  "m4ri archive",
  path.join(m4riDependency.prefix, "lib", "libm4ri.a"),
);

fs.mkdirSync(outputDirectory, { recursive: true });

const flintDeclaration = loadRegistry({ root: repositoryRoot }).byId.get(
  "flint",
);
if (flintDeclaration === undefined) {
  throw new Error("the generated FLINT FFI declaration is unavailable");
}
const resourceAdapter = generatedWasmResourceAdapter(flintDeclaration, {
  resourceIds: [
    "byte_region",
    "dirichlet_group",
    "fmpz_matrix",
    "fmpq_matrix",
    "fmpq_value",
  ],
  functionIds: [
    "dirichlet_group_init",
    "dirichlet_group_size",
    "dirichlet_group_num_primitive",
    "fmpz_matrix",
    "fmpz_matrix_copy",
    "fmpz_matrix_deserialize",
    "fmpz_matrix_deserialize_entries",
    "fmpz_matrix_det",
    "fmpz_matrix_entry",
    "fmpz_matrix_format",
    "fmpz_matrix_hnf",
    "fmpz_matrix_mul",
    "fmpz_matrix_ncols",
    "fmpz_matrix_nrows",
    "fmpz_matrix_prefix_rows",
    "fmpz_matrix_echelon_pivots",
    "fmpz_matrix_serialize",
    "fmpz_matrix_set_entry",
    "fmpz_matrix_transpose",
    "fmpq_matrix",
    "fmpq_matrix_copy",
    "fmpq_matrix_deserialize",
    "fmpq_matrix_det",
    "fmpq_matrix_entry_denominator",
    "fmpq_matrix_entry_is_zero",
    "fmpq_matrix_entry_numerator",
    "fmpq_matrix_format",
    "fmpq_matrix_mul",
    "fmpq_matrix_ncols",
    "fmpq_matrix_nrows",
    "fmpq_matrix_prefix_rows",
    "fmpq_matrix_echelon_pivots",
    "fmpq_matrix_rank",
    "fmpq_matrix_rref",
    "fmpq_matrix_serialize",
    "fmpq_matrix_set_entry",
    "fmpq_matrix_transpose",
    "fmpq_value_denominator",
    "fmpq_value_numerator",
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

const m4riDeclaration = loadRegistry({ root: repositoryRoot }).byId.get(
  "m4ri",
);
if (m4riDeclaration === undefined) {
  throw new Error("the generated M4RI FFI declaration is unavailable");
}
const m4riAdapter = generatedWasmResourceAdapter(m4riDeclaration, {
  resourceIds: ["matrix", "byte_region"],
  functionIds: [
    "available",
    "matrix",
    "matrix_nrows",
    "matrix_ncols",
    "matrix_set_entry",
    "matrix_entry_code",
    "matrix_copy",
    "matrix_prefix_rows",
    "matrix_equal",
    "matrix_add",
    "matrix_mul",
    "matrix_transpose",
    "matrix_rank",
    "matrix_rref",
    "matrix_determinant_code",
    "matrix_inverse",
    "matrix_solve",
    "matrix_right_kernel",
    "matrix_logical_words",
    "matrix_from_logical_words",
    "matrix_sagepack_bytes",
    "matrix_from_sagepack_bytes",
    "matrix_format",
  ],
});
fs.writeFileSync(m4riAdapterSource, m4riAdapter.cSource);
fs.writeFileSync(
  m4riBackendOutput,
  m4riAdapter.javascriptSource +
    "\nexport const generatedWasmManifest = Object.freeze(" +
    JSON.stringify(m4riAdapter.manifest) +
    ");\n",
);
fs.writeFileSync(m4riManifestOutput, m4riAdapter.manifestSource);

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
run(clang, [
  "--target=wasm32-wasip1",
  `--sysroot=${sysroot}`,
  "-mexec-model=reactor",
  "-O2",
  "-fvisibility=hidden",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-isystem",
  path.join(m4riDependency.prefix, "include"),
  `-I${path.join(repositoryRoot, "packages", "m4ri", "include")}`,
  m4riAdapterSource,
  `-L${path.join(m4riDependency.prefix, "lib")}`,
  "-lm4ri",
  "-lm",
  ...m4riAdapter.manifest.exports.map((name) => `-Wl,--export=${name}`),
  "-Wl,--export-memory",
  "-Wl,--gc-sections",
  "-o",
  m4riRawOutput,
]);
run(wasmStrip, [m4riRawOutput, "-o", m4riOutput]);
fs.rmSync(m4riRawOutput);
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
esbuild.buildSync({
  entryPoints: [path.join(repositoryRoot, "tools", "serialization.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: serializationOutput,
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

function compilerCacheFilename(sourceFilename) {
  return (
    sourceFilename
      .replaceAll("\\", "/")
      .replace(/[<>:"|?*\x00-\x1f]/g, "-")
      .replaceAll("/", "-")
      .replace(/^-+/, "") + ".json"
  );
}

function sourceFilenameForModule(name) {
  const base = path.join(
    standardLibrarySourceDirectory,
    ...name.split("."),
  );
  for (const filename of [`${base}.py`, path.join(base, "__init__.py")]) {
    if (fs.existsSync(filename)) return filename;
  }
  throw new Error(`source for browser module ${name} does not exist`);
}

function compileBrowserModuleCache(name) {
  const output = path.join(standardLibraryCacheDirectory, `${name}.json`);
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-browser-module-"),
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "bin", "sagejs"),
        "compile",
        "--sage",
        "--omit-baselib",
        "--cache-dir",
        temporary,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        input: `import ${name}\n`,
        stdio: ["pipe", "ignore", "inherit"],
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
    const source = sourceFilenameForModule(name);
    const generated = path.join(
      temporary,
      compilerCacheFilename(source),
    );
    requirePath(`compiled browser module ${name}`, generated);
    fs.mkdirSync(standardLibraryCacheDirectory, { recursive: true });
    fs.copyFileSync(generated, output);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

for (const name of browserAdditionalModules) {
  compileBrowserModuleCache(name);
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
  JSON.stringify({
    modules: standardLibraryModules,
    preload: browserAdditionalModules,
  }),
);
fs.copyFileSync(
  require.resolve("plotly.js-dist-min/plotly.min.js"),
  plotlyOutput,
);

const bytes = fs.statSync(output).size;
const m4riBytes = fs.statSync(m4riOutput).size;
console.log(
  `Built ${path.relative(repositoryRoot, output)} ` +
    `(${(bytes / 1024 / 1024).toFixed(2)} MiB)`,
);
console.log(
  `Built ${path.relative(repositoryRoot, m4riOutput)} ` +
    `(${(m4riBytes / 1024 / 1024).toFixed(2)} MiB)`,
);
console.log(
  `Copied browser evaluator assets to ` +
    `${path.relative(repositoryRoot, outputDirectory)}`,
);
void compilerFrontendBuild.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
