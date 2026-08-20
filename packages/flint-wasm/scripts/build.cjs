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
const {
  resolveToolchain,
} = require("./wasm-toolchain.cjs");
const {
  runtimeHostAssets,
  verifyWasmMemoryContract,
  writeProductionReceipt,
} = require("./production-receipt.cjs");

const packageRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");
const toolchain = resolveToolchain({ root: repositoryRoot });
const clang = toolchain.paths.clang;
const sysroot = toolchain.paths.sysroot;
const wasmStrip = toolchain.paths.llvmStrip;
const dependencies = ["flint", "mpfr", "gmp"].map((name) => ({
  name,
  prefix: toolchain.paths.libraries[name].prefix,
}));
const m4riDependency = {
  name: "m4ri",
  prefix: toolchain.paths.libraries.m4ri.prefix,
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
const adapterInputsFilename = path.join(
  packageRoot,
  "toolchain",
  "adapter-inputs.json",
);
const adapterInputs = JSON.parse(fs.readFileSync(adapterInputsFilename, "utf8"));
if (adapterInputs.schema !== "sagejs.wasm-adapter-inputs/v1") {
  throw new Error(`unsupported generated-adapter input contract: ${adapterInputsFilename}`);
}
const productionLayout = JSON.parse(fs.readFileSync(
  path.join(packageRoot, "release", "production-layout.json"),
  "utf8",
));
const productionModules = new Map(
  productionLayout.modules.map((module) => [module.id, module]),
);

function requirePath(description, filename) {
  if (!fs.existsSync(filename)) {
    throw new Error(
      `missing ${description}: ${filename}\n` +
        "Prepare the pinned toolchain with `node " +
        "packages/flint-wasm/scripts/wasm-toolchain.cjs prepare`.",
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
requirePath("WASI SDK llvm-strip", wasmStrip);
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
const flintAdapterInputs = adapterInputs.modules.flint;
if (flintAdapterInputs?.declaration !== "flint") {
  throw new Error("the FLINT production adapter input contract is missing");
}
const resourceAdapter = generatedWasmResourceAdapter(flintDeclaration, {
  resourceIds: flintAdapterInputs.resources,
  functionIds: flintAdapterInputs.functions,
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
const m4riAdapterInputs = adapterInputs.modules.m4ri;
if (m4riAdapterInputs?.declaration !== "m4ri") {
  throw new Error("the M4RI production adapter input contract is missing");
}
const m4riAdapter = generatedWasmResourceAdapter(m4riDeclaration, {
  resourceIds: m4riAdapterInputs.resources,
  functionIds: m4riAdapterInputs.functions,
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
const flintLocalIncludeArguments = [
  `-I${path.join(repositoryRoot, "packages", "flint", "src")}`,
  `-I${path.join(repositoryRoot, "packages", "flint", "include")}`,
];
const flintLinkedSources = [
  path.join(packageRoot, "src", "factor.c"),
  path.join(packageRoot, "src", "modsym.c"),
  resourceAdapterSource,
  path.join(repositoryRoot, "packages", "flint", "src", "charpoly.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "p1_core.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "modsym_core.c"),
  path.join(packageRoot, "src", "wasi-stubs.c"),
];
const m4riLocalIncludeArguments = [
  `-I${path.join(repositoryRoot, "packages", "m4ri", "include")}`,
];
const m4riLinkedSources = [m4riAdapterSource];
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
  ...toolchain.lock.build.cFlags,
  `--sysroot=${sysroot}`,
  "-Oz",
  ...includeArguments,
  ...flintLocalIncludeArguments,
  ...flintLinkedSources,
  ...libraryArguments,
  "-lflint",
  "-lmpfr",
  "-lgmp",
  "-lm",
  "-lwasi-emulated-signal",
  ...exportNames.map((name) => `-Wl,--export=${name}`),
  ...toolchain.lock.build.linkFlags,
  "-o",
  rawOutput,
]);
run(wasmStrip, ["--strip-all", rawOutput, "-o", output]);
fs.rmSync(rawOutput);
verifyWasmMemoryContract(output, productionModules.get("flint").memory);
run(clang, [
  ...toolchain.lock.build.cFlags,
  `--sysroot=${sysroot}`,
  "-O2",
  "-isystem",
  path.join(m4riDependency.prefix, "include"),
  ...m4riLocalIncludeArguments,
  ...m4riLinkedSources,
  `-L${path.join(m4riDependency.prefix, "lib")}`,
  "-lm4ri",
  "-lm",
  ...m4riAdapter.manifest.exports.map((name) => `-Wl,--export=${name}`),
  ...toolchain.lock.build.linkFlags,
  "-o",
  m4riRawOutput,
]);
run(wasmStrip, ["--strip-all", m4riRawOutput, "-o", m4riOutput]);
fs.rmSync(m4riRawOutput);
verifyWasmMemoryContract(m4riOutput, productionModules.get("m4ri").memory);
const wasiRuntimeBuild = esbuild.buildSync({
  absWorkingDir: repositoryRoot,
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
  metafile: true,
});
const symbolicBackendBuild = esbuild.buildSync({
  absWorkingDir: repositoryRoot,
  entryPoints: [
    path.join(repositoryRoot, "src", "runtime", "symbolic-backend.mjs"),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: symbolicBackendOutput,
  minify: true,
  metafile: true,
});
const serializationBuild = esbuild.buildSync({
  absWorkingDir: repositoryRoot,
  entryPoints: [path.join(repositoryRoot, "tools", "serialization.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: serializationOutput,
  minify: true,
  metafile: true,
});
const compilerFrontendBuild = esbuild.buildSync({
  absWorkingDir: repositoryRoot,
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
  metafile: true,
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
const standardLibraryReceiptInputs = [];
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
  standardLibraryReceiptInputs.push(filename, cacheFilename);
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
const plotlySource = require.resolve("plotly.js-dist-min/plotly.min.js");
const runtimeHostClosure = runtimeHostAssets(productionLayout, packageRoot);
for (const asset of runtimeHostClosure) {
  const destination = path.join(outputDirectory, asset.path);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(asset.source, destination);
}

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
const receipt = writeProductionReceipt({
  repositoryRoot,
  packageRoot,
  outputDirectory,
  toolchain,
  sourceInputs: [
    ...compilerDependencyClosure(flintLinkedSources, [
      ...includeArguments,
      ...flintLocalIncludeArguments,
    ]),
    ...compilerDependencyClosure(m4riLinkedSources, [
      "-isystem",
      path.join(m4riDependency.prefix, "include"),
      ...m4riLocalIncludeArguments,
    ]),
    ...esbuildInputClosure([
      wasiRuntimeBuild,
      symbolicBackendBuild,
      serializationBuild,
      compilerFrontendBuild,
    ]),
    compilerSource,
    baselibSource,
    ...["web-tree-sitter.wasm", "tree-sitter-python.wasm", "tree-sitter-sage.wasm"]
      .map((name) => path.join(vendorDirectory, name)),
    ...runtimeHostClosure.map(({ source }) => source),
    ...standardLibraryReceiptInputs,
    plotlySource,
    flintDeclaration.filename,
    flintDeclaration.sourceFilename,
    m4riDeclaration.filename,
    m4riDeclaration.sourceFilename,
    ...Object.keys(require.cache).filter((filename) =>
      filename.startsWith(path.join(repositoryRoot, "tools", "ffi") + path.sep)
    ),
  ],
});
console.log(`Production artifact ${receipt.artifact.identity}`);

function compilerDependencyClosure(sources, arguments_) {
  const files = new Set();
  for (const source of sources) {
    const result = spawnSync(clang, [
      ...toolchain.lock.build.cFlags,
      `--sysroot=${sysroot}`,
      ...arguments_,
      "-MM",
      source,
    ], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`failed to enumerate compiler inputs for ${source}: ${result.stderr}`);
    }
    const dependencies = result.stdout.replace(/\\\r?\n/g, " ");
    const separator = dependencies.indexOf(":");
    if (separator < 0) throw new Error(`invalid compiler dependency output for ${source}`);
    for (const name of dependencies.slice(separator + 1).trim().split(/\s+/)) {
      if (name) files.add(path.resolve(repositoryRoot, name.replaceAll("\\ ", " ")));
    }
  }
  return [...files].sort();
}

function esbuildInputClosure(results) {
  const files = new Set();
  for (const result of results) {
    for (const name of Object.keys(result.metafile.inputs)) {
      files.add(path.resolve(repositoryRoot, name));
    }
  }
  return [...files].sort();
}
