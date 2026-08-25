"use strict";

const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const { loadRegistry } = require("../../../tools/ffi/declarations.cjs");
const {
  generatedWasmResourceAdapter,
} = require("../../../tools/ffi/wasm-adapters.cjs");
const { generatedWasmClosure } = require("../../../tools/ffi/wasm-closure.cjs");
const {
  ellipticLseriesCoreSource,
} = require("../src/curves/core-source.cjs");
const {
  resolveToolchain,
} = require("../../wasm-toolchain/scripts/toolchain.cjs");
const {
  runtimeHostAssets,
  verifyWasmMemoryContract,
  writeProductionReceipt,
} = require("./production-receipt.cjs");
const autoReceiptPolicyApi = require(
  "../../../tools/math-dispatch/hyperelliptic-auto-receipt-policy.cjs"
);
const { kernelPackExports } = require("./kernel-pack-exports.cjs");
const wasmAbiAllowlist = path.join(__dirname, "wasm-abi-allowlist.cjs");

const packageRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");
const toolchain = resolveToolchain({ root: repositoryRoot });
const clang = toolchain.paths.clang;
const sysroot = toolchain.paths.sysroot;
function pathRemappingFlags(source, destination) {
  return ["file", "debug", "macro"].map(
    (kind) => `-f${kind}-prefix-map=${source}=${destination}`,
  );
}
const targetCompileFlags = [
  `--target=${toolchain.lock.build.target}`,
  ...toolchain.lock.build.cFlags,
  // The last matching map wins. The prepared toolchain can live below the Git
  // common directory, so put its more specific mapping after the source root.
  ...pathRemappingFlags(repositoryRoot, "/sagejs/source"),
  ...pathRemappingFlags(toolchain.root, "/sagejs/toolchain"),
];
const wasmStrip = toolchain.paths.llvmStrip;
const dependencies = ["flint", "mpfr", "gmp"].map((name) => ({
  name,
  prefix: toolchain.paths.libraries[name].prefix,
}));
const smalljacDependencies = ["smalljac", "ffpoly"].map((name) => ({
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
const ffiClosureOutput = path.join(
  outputDirectory,
  "ffi-production-closure.json",
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
const algebraicRawOutput = path.join(
  outputDirectory,
  "flint-algebraic.unstripped.wasm",
);
const algebraicOutput = path.join(outputDirectory, "flint-algebraic.wasm");
const curveCoreOutput = path.join(
  outputDirectory,
  "elliptic-lseries-core.c",
);
const kernelBuildDirectory = path.join(outputDirectory, "kernel-pack-build");
const kernelManifestOutput = path.join(
  outputDirectory,
  "native-kernels",
  "index.json",
);
const wasmPackLoaderOutput = path.join(outputDirectory, "wasm-pack-loader.mjs");
const kernelFlintResourceAdapterSource = path.join(
  outputDirectory,
  "kernel-flint-resource-adapter.c",
);
const kernelFlintResourceBackendOutput = path.join(
  outputDirectory,
  "kernel-flint-resource-backend.mjs",
);
const compilerOutput = path.join(outputDirectory, "compiler.js");
const compilerFrontendOutput = path.join(
  outputDirectory,
  "compiler-frontend.mjs",
);
const compilerFrontendBuildHelper = path.join(
  packageRoot,
  "scripts",
  "build-compiler-frontend.cjs",
);
const compilerFrontendMetafile = path.join(
  outputDirectory,
  "compiler-frontend.metafile.json",
);
const foreignFrontendOutput = path.join(outputDirectory, "foreign-frontend.mjs");
const foreignFrontendBuildHelper = path.join(
  packageRoot,
  "scripts",
  "build-foreign-frontend.cjs",
);
const foreignFrontendMetafile = path.join(
  outputDirectory,
  "foreign-frontend.metafile.json",
);
const baselibOutput = path.join(outputDirectory, "baselib.js");
const standardLibraryOutput = path.join(outputDirectory, "stdlib.json");
const lazyModulesOutput = path.join(outputDirectory, "lazy-modules.json");
const conwayDataOutput = path.join(outputDirectory, "conway-polynomials.json");
const dynamicProgramsOutput = path.join(outputDirectory, "dynamic-programs.json");
const kernelCoverageOutput = path.join(
  outputDirectory,
  "production-kernel-coverage.json",
);
const wasiRuntimeOutput = path.join(outputDirectory, "wasi-runtime.mjs");
const symbolicBackendOutput = path.join(
  outputDirectory,
  "symbolic-backend.mjs",
);
const numpyBackendOutput = path.join(outputDirectory, "numpy-ts.mjs");
const numpyBackendSource = path.resolve(
  path.dirname(require.resolve("numpy-ts")),
  "..",
  "numpy-ts.browser.js",
);
const serializationOutput = path.join(
  outputDirectory,
  "serialization.mjs",
);
const plotlyOutput = path.join(outputDirectory, "plotly.min.js");
const capabilityApiOutput = path.join(outputDirectory, "wasm-capability-api.mjs");
const capabilityReportOutput = path.join(outputDirectory, "wasm-capabilities-report.json");
const autoReceiptPolicySource = path.join(
  repositoryRoot,
  "architecture",
  "hyperelliptic-auto-receipt-policy.json",
);
const autoReceiptPolicyOutput = path.join(
  outputDirectory,
  "hyperelliptic-auto-receipt-policy.json",
);
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
const lazyModulesSource = path.join(repositoryRoot, "dist", "lazy-modules.json");
const conwayDataSource = path.join(
  repositoryRoot,
  "src",
  "lib",
  "conway_polynomials",
  "conway_polynomials.json",
);
const kernelCoverageSource = path.join(
  packageRoot,
  "release",
  "production-kernel-coverage.json",
);
const dynamicProgramCacheDirectory = path.join(
  repositoryRoot,
  "dist",
  "dynamic-cache",
);
const lazyModuleGenerator = path.join(
  repositoryRoot,
  "scripts",
  "build-lazy-module-cache.cjs",
);
const lazyModuleConfig = path.join(
  repositoryRoot,
  "scripts",
  "precompiled-python-packages.json",
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
  "sagejs.polynomial_algorithms.arbitrary_prime_public",
];
const vendorDirectory = path.join(repositoryRoot, "dist", "vendor");
const compilerResourceShim = path.join(
  packageRoot,
  "src",
  "compiler-resources.ts",
);
const browserMagmaEnvironmentShim = path.join(
  packageRoot,
  "src",
  "browser-magma-environment.ts",
);
const treeSitterAssets = [
  "web-tree-sitter.wasm",
  "tree-sitter-python.wasm",
  "tree-sitter-sage.wasm",
  "tree-sitter-magma.wasm",
  "tree-sitter-macaulay2.wasm",
  "tree-sitter-maple.wasm",
  "tree-sitter-matlab.wasm",
  "tree-sitter-wolfram.wasm",
];
const adapterInputsFilename = path.join(
  packageRoot,
  "release",
  "adapter-inputs.json",
);
const adapterInputs = JSON.parse(fs.readFileSync(adapterInputsFilename, "utf8"));
if (adapterInputs.schema !== "sagejs.wasm-adapter-inputs/v2" ||
    adapterInputs.policy !== "all-declared-wasm" ||
    adapterInputs.modules === null ||
    typeof adapterInputs.modules !== "object") {
  throw new Error(`unsupported generated-adapter input contract: ${adapterInputsFilename}`);
}
const adapterSelections = Object.entries(adapterInputs.modules).map(
  ([module, entry]) => {
    if (entry?.declaration !== module ||
        typeof entry.ownershipDomain !== "string") {
      throw new Error(`invalid generated-adapter selection ${module}`);
    }
    return {
      library: entry.declaration,
      ownershipDomain: entry.ownershipDomain,
    };
  },
);
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
        "packages/wasm-toolchain/scripts/toolchain.cjs prepare`.",
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
run(process.execPath, [
  lazyModuleGenerator,
]);
requirePath("receipt-authenticated lazy module bundle", lazyModulesSource);
requirePath(
  "built Sage.js baselib (run `pnpm build` first)",
  baselibSource,
);
requirePath("pinned numpy-ts browser bundle", numpyBackendSource);
for (const filename of treeSitterAssets) {
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
// Earlier builds copied these source modules beside the bundled runtime. They
// are no longer served or receipted; remove them explicitly when resuming a
// package build so the physical dist directory is as clean as its manifest.
for (const filename of ["wasi-constants.mjs", "wasi-filesystem.mjs"]) {
  fs.rmSync(path.join(outputDirectory, filename), { force: true });
}
fs.copyFileSync(
  path.join(repositoryRoot, "architecture", "wasm-capability-api.mjs"),
  capabilityApiOutput,
);
fs.copyFileSync(
  path.join(repositoryRoot, "architecture", "wasm-capabilities-report.json"),
  capabilityReportOutput,
);

const registry = loadRegistry({ root: repositoryRoot });
const generatedClosure = generatedWasmClosure(registry, {
  selections: adapterSelections,
  strict: true,
});
fs.writeFileSync(ffiClosureOutput, generatedClosure.manifestSource);

const flintDeclaration = registry.byId.get(
  "flint",
);
if (flintDeclaration === undefined) {
  throw new Error("the generated FLINT FFI declaration is unavailable");
}
const resourceAdapter = generatedClosure.artifacts.get("flint");
if (resourceAdapter === undefined) {
  throw new Error("the generated FLINT production closure is empty");
}
fs.writeFileSync(resourceAdapterSource, resourceAdapter.cSource);
fs.writeFileSync(
  resourceBackendOutput,
  resourceAdapter.javascriptSource +
    "\nexport const generatedWasmManifest = Object.freeze(" +
    JSON.stringify(resourceAdapter.manifest) +
    ");\n",
);
fs.writeFileSync(resourceManifestOutput, resourceAdapter.manifestSource);

const m4riDeclaration = registry.byId.get(
  "m4ri",
);
if (m4riDeclaration === undefined) {
  throw new Error("the generated M4RI FFI declaration is unavailable");
}
const m4riAdapter = generatedClosure.artifacts.get("m4ri");
if (m4riAdapter === undefined) {
  throw new Error("the generated M4RI production closure is empty");
}
fs.writeFileSync(m4riAdapterSource, m4riAdapter.cSource);
fs.writeFileSync(
  m4riBackendOutput,
  m4riAdapter.javascriptSource +
    "\nexport const generatedWasmManifest = Object.freeze(" +
    JSON.stringify(m4riAdapter.manifest) +
    ");\n",
);
fs.writeFileSync(m4riManifestOutput, m4riAdapter.manifestSource);

const ellipticLseriesSource = path.join(
  repositoryRoot,
  "packages",
  "flint",
  "src",
  "elliptic_lfunction.c",
);
fs.writeFileSync(
  curveCoreOutput,
  ellipticLseriesCoreSource(fs.readFileSync(ellipticLseriesSource, "utf8")),
);

const includeArguments = dependencies.flatMap(({ prefix }) => [
  "-isystem",
  path.join(prefix, "include"),
]);
const smalljacIncludeArguments = smalljacDependencies.flatMap(({ prefix }) => [
  "-isystem",
  path.join(prefix, "include"),
]);
const libraryArguments = dependencies.flatMap(({ prefix }) => [
  `-L${path.join(prefix, "lib")}`,
]);
const smalljacLibraryArguments = smalljacDependencies.flatMap(({ prefix }) => [
  `-L${path.join(prefix, "lib")}`,
]);
const flintLocalIncludeArguments = [
  `-I${path.join(repositoryRoot, "packages", "flint", "src")}`,
  `-I${path.join(repositoryRoot, "packages", "flint", "include")}`,
];
const flintLinkedSources = [
  path.join(packageRoot, "src", "factor.c"),
  path.join(packageRoot, "src", "multivariate.c"),
  path.join(packageRoot, "src", "numeric.c"),
  path.join(packageRoot, "src", "modsym.c"),
  path.join(packageRoot, "src", "analytic.c"),
  path.join(packageRoot, "src", "dirichlet-group.c"),
  path.join(packageRoot, "src", "number-field-zeta.c"),
  path.join(packageRoot, "src", "curves", "elliptic-lseries-adapter.c"),
  path.join(packageRoot, "src", "curves", "smalljac-coefficients.c"),
  curveCoreOutput,
  resourceAdapterSource,
  path.join(repositoryRoot, "packages", "flint", "src", "analytic_batch_core.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "charpoly.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "number_field_zeta_core.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "p1_core.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "modsym_core.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "multivariate_wasm_core.c"),
  path.join(packageRoot, "src", "wasi-stubs.c"),
];
const m4riLocalIncludeArguments = [
  `-I${path.join(repositoryRoot, "packages", "m4ri", "include")}`,
];
const m4riLinkedSources = [m4riAdapterSource];
const analyticExports = [
  "sagejs_analytic_input",
  "sagejs_analytic_input_capacity",
  "sagejs_analytic_max_input_capacity",
  "sagejs_analytic_output",
  "sagejs_analytic_output_capacity",
  "sagejs_analytic_max_output_capacity",
  "sagejs_analytic_output_length",
  "sagejs_analytic_reserve",
  "sagejs_analytic_release",
  "sagejs_analytic_execute_request",
];
const numberFieldExports = [
  "sagejs_nf_zeta_residue_begin",
  "sagejs_nf_zeta_residue_input",
  "sagejs_nf_zeta_residue_input_words",
  "sagejs_nf_zeta_residue_output",
  "sagejs_nf_zeta_residue_output_words",
  "sagejs_nf_zeta_residue_compute",
  "sagejs_nf_zeta_residue_clear",
];
const numericSource = path.join(packageRoot, "src", "numeric.c");
const numericExports = [...fs.readFileSync(numericSource, "utf8")
  .matchAll(/EXPORT\s+[\w\s*]+\s+(sagejs_numeric_\w+)\s*\(/g)]
  .map((match) => match[1]);
if (numericExports.length !== 34 || new Set(numericExports).size !== 34) {
  throw new Error("the reviewed 34-function numeric Wasm export closure drifted");
}
const dirichletGroupHostSource = path.join(packageRoot, "dirichlet-group.mjs");
const dirichletGroupExports = [...new Set(
  [...fs.readFileSync(dirichletGroupHostSource, "utf8")
    .matchAll(/"(sagejs_wasm_dirichlet_(?:group|character)_\w+)"/g)]
    .map((match) => match[1]),
)];
if (dirichletGroupExports.length !== 23) {
  throw new Error(
    "the reviewed 23-function public Dirichlet Wasm export closure drifted",
  );
}
const curveExports = [
  "sagejs_wasm_ec_lseries_begin",
  "sagejs_wasm_ec_lseries_direct_begin",
  "sagejs_wasm_ec_lseries_clear",
  "sagejs_wasm_ec_lseries_coefficients",
  "sagejs_wasm_ec_lseries_point_text",
  "sagejs_wasm_ec_lseries_point_offsets",
  "sagejs_wasm_ec_lseries_conductor_text",
  "sagejs_wasm_ec_lseries_direct_cutoffs",
  "sagejs_wasm_ec_lseries_compute",
  "sagejs_wasm_ec_lseries_direct_compute",
  "sagejs_wasm_ec_lseries_decimal_bytes",
  "sagejs_wasm_ec_lseries_decimal_byte_count",
  "sagejs_wasm_ec_lseries_decimal_offsets",
  "sagejs_wasm_ec_lseries_decimal_offset_count",
  "sagejs_wasm_ec_lseries_decimal_field_count",
  "sagejs_wasm_ec_lseries_plot_values",
  "sagejs_wasm_ec_lseries_plot_value_count",
  "sagejs_wasm_ec_lseries_plot_stride",
  "sagejs_wasm_ec_lseries_diagnostic",
  "sagejs_wasm_ec_lseries_diagnostic_double",
  "sagejs_wasm_smalljac_begin",
  "sagejs_wasm_smalljac_curve_text",
  "sagejs_wasm_smalljac_output",
  "sagejs_wasm_smalljac_output_words",
  "sagejs_wasm_smalljac_compute",
  "sagejs_wasm_smalljac_clear",
  "sagejs_wasm_smalljac_lpoly_begin",
  "sagejs_wasm_smalljac_lpoly_curve_text",
  "sagejs_wasm_smalljac_lpoly_primes",
  "sagejs_wasm_smalljac_lpoly_good",
  "sagejs_wasm_smalljac_lpoly_coefficient_counts",
  "sagejs_wasm_smalljac_lpoly_coefficients",
  "sagejs_wasm_smalljac_lpoly_row_status",
  "sagejs_wasm_smalljac_lpoly_row_count",
  "sagejs_wasm_smalljac_lpoly_required_rows",
  "sagejs_wasm_smalljac_lpoly_genus",
  "sagejs_wasm_smalljac_lpoly_truncated",
  "sagejs_wasm_smalljac_lpoly_upstream_status",
  "sagejs_wasm_smalljac_lpoly_backend_version",
  "sagejs_wasm_smalljac_lpoly_backend_version_bytes",
  "sagejs_wasm_smalljac_lpoly_compute",
  "sagejs_wasm_smalljac_lpoly_clear",
];
const algebraicExports = [
  "sagejs_wasm_algebraic_input",
  "sagejs_wasm_algebraic_input_capacity",
  "sagejs_wasm_algebraic_output",
  "sagejs_wasm_algebraic_output_capacity",
  "sagejs_wasm_algebraic_output_length",
  "sagejs_wasm_algebraic_root_handles",
  "sagejs_wasm_algebraic_root_multiplicities",
  "sagejs_wasm_algebraic_matrix_entry_handles",
  "sagejs_wasm_algebraic_result_count",
  "sagejs_wasm_algebraic_result_handle",
  "sagejs_wasm_algebraic_result_value",
  "sagejs_wasm_algebraic_last_status",
  "sagejs_wasm_algebraic_live_count",
  "sagejs_wasm_algebraic_initialize",
  "sagejs_wasm_algebraic_clear",
  "sagejs_wasm_algebraic_close",
  "sagejs_wasm_algebraic_from_rational",
  "sagejs_wasm_algebraic_i",
  "sagejs_wasm_algebraic_root_of_unity",
  "sagejs_wasm_algebraic_unary",
  "sagejs_wasm_algebraic_binary",
  "sagejs_wasm_algebraic_pow",
  "sagejs_wasm_algebraic_pow_rational",
  "sagejs_wasm_algebraic_equal",
  "sagejs_wasm_algebraic_compare_real",
  "sagejs_wasm_algebraic_property",
  "sagejs_wasm_algebraic_polynomial_roots",
  "sagejs_wasm_algebraic_minpoly",
  "sagejs_wasm_algebraic_enclosure",
  "sagejs_wasm_algebraic_format",
  "sagejs_wasm_algebraic_serialize",
  "sagejs_wasm_algebraic_deserialize",
  "sagejs_wasm_algebraic_matrix_live_count",
  "sagejs_wasm_algebraic_matrix_close",
  "sagejs_wasm_algebraic_matrix_create",
  "sagejs_wasm_algebraic_matrix_binary",
  "sagejs_wasm_algebraic_matrix_unary",
  "sagejs_wasm_algebraic_matrix_scalar_mul",
  "sagejs_wasm_algebraic_matrix_entry",
  "sagejs_wasm_algebraic_matrix_det",
  "sagejs_wasm_algebraic_matrix_rank",
  "sagejs_wasm_algebraic_matrix_equal",
  "sagejs_wasm_algebraic_matrix_charpoly",
];
const algebraicLinkedSources = [
  path.join(packageRoot, "src", "algebraic.c"),
  path.join(repositoryRoot, "packages", "flint", "src", "algebraic_core.c"),
  path.join(packageRoot, "src", "wasi-stubs.c"),
];
const declaredAlgebraicExports = [...fs.readFileSync(
  algebraicLinkedSources[0],
  "utf8",
).matchAll(/EXPORT\s+[\w\s*]+\s+(sagejs_wasm_algebraic_\w+)\s*\(/g)]
  .map((match) => match[1]);
if (declaredAlgebraicExports.length !== 43 ||
    declaredAlgebraicExports.some((name, index) => name !== algebraicExports[index])) {
  throw new Error("the reviewed 43-function algebraic Wasm export closure drifted");
}
const exportNames = [
  "sagejs_factor_input",
  "sagejs_factor_input_capacity",
  "sagejs_factor_output",
  "sagejs_factor_output_capacity",
  "sagejs_factor",
  "sagejs_is_prime",
  "sagejs_next_prime",
  "sagejs_wasm_mpoly_input",
  "sagejs_wasm_mpoly_input_capacity",
  "sagejs_wasm_mpoly_output",
  "sagejs_wasm_mpoly_output_capacity",
  "sagejs_wasm_mpoly_output_length",
  "sagejs_wasm_mpoly_resultant",
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
  ...analyticExports,
  ...numericExports,
  ...dirichletGroupExports,
  ...numberFieldExports,
  ...curveExports,
  ...resourceAdapter.manifest.exports,
];

const reuseLinkedArtifacts =
  process.env.SAGEJS_WASM_REUSE_LINKED_ARTIFACTS === "1";
let kernelPackReceiptInputs;
if (reuseLinkedArtifacts) {
  console.log("Reusing previously linked Wasm artifacts for packaging resume");
  for (const [module, filename] of [
    ["flint", output],
    ["m4ri", m4riOutput],
    ["algebraic", algebraicOutput],
  ]) {
    requirePath(`previously linked ${module} artifact`, filename);
    verifyWasmMemoryContract(filename, productionModules.get(module).memory);
  }
  kernelPackReceiptInputs = buildKernelPacks({ reuseLinkedArtifacts: true });
} else {
run(clang, [
  ...targetCompileFlags,
  `--sysroot=${sysroot}`,
  "-Oz",
  ...includeArguments,
  ...smalljacIncludeArguments,
  ...flintLocalIncludeArguments,
  ...flintLinkedSources,
  ...libraryArguments,
  ...smalljacLibraryArguments,
  "-lsmalljac",
  "-lff_poly",
  "-lflint",
  "-lmpfr",
  "-lgmp",
  "-lm",
  "-lwasi-emulated-signal",
  ...exportNames.map((name) => `-Wl,--export=${name}`),
  "-Wl,-z,stack-size=1048576",
  ...toolchain.lock.build.linkFlags.filter(
    (flag) => !flag.startsWith("-Wl,--initial-memory="),
  ),
  "-Wl,--initial-memory=33554432",
  "-o",
  rawOutput,
]);
run(wasmStrip, ["--strip-all", rawOutput, "-o", output]);
fs.rmSync(rawOutput);
verifyWasmMemoryContract(output, productionModules.get("flint").memory);
run(clang, [
  ...targetCompileFlags,
  `--sysroot=${sysroot}`,
  "-O2",
  "-isystem",
  path.join(m4riDependency.prefix, "include"),
  "-isystem",
  path.join(toolchain.paths.libraries.gmp.prefix, "include"),
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
run(clang, [
  ...targetCompileFlags,
  `--sysroot=${sysroot}`,
  "-Oz",
  ...includeArguments,
  ...flintLocalIncludeArguments,
  ...algebraicLinkedSources,
  ...libraryArguments,
  "-lflint",
  "-lmpfr",
  "-lgmp",
  "-lm",
  "-lwasi-emulated-signal",
  ...algebraicExports.map((name) => `-Wl,--export=${name}`),
  ...toolchain.lock.build.linkFlags,
  "-o",
  algebraicRawOutput,
]);
run(wasmStrip, ["--strip-all", algebraicRawOutput, "-o", algebraicOutput]);
fs.rmSync(algebraicRawOutput);
verifyWasmMemoryContract(
  algebraicOutput,
  productionModules.get("algebraic").memory,
);
kernelPackReceiptInputs = buildKernelPacks();
}
const wasiRuntimeBuild = esbuild.buildSync({
  absWorkingDir: repositoryRoot,
  entryPoints: [path.join(packageRoot, "src", "wasi-runtime.mjs")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: wasiRuntimeOutput,
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
run(process.execPath, [
  compilerFrontendBuildHelper,
  path.join(packageRoot, "src", "compiler-frontend-entry.ts"),
  compilerFrontendOutput,
  compilerResourceShim,
  require.resolve("path-browserify", { paths: [packageRoot] }),
  compilerFrontendMetafile,
]);
const compilerFrontendBuild = {
  metafile: JSON.parse(fs.readFileSync(compilerFrontendMetafile, "utf8")),
};
run(process.execPath, [
  foreignFrontendBuildHelper,
  path.join(packageRoot, "src", "foreign-frontend-entry.ts"),
  foreignFrontendOutput,
  compilerResourceShim,
  browserMagmaEnvironmentShim,
  require.resolve("path-browserify", { paths: [packageRoot] }),
  foreignFrontendMetafile,
]);
const foreignFrontendBuild = {
  metafile: JSON.parse(fs.readFileSync(foreignFrontendMetafile, "utf8")),
};
fs.copyFileSync(compilerSource, compilerOutput);
fs.copyFileSync(baselibSource, baselibOutput);
fs.copyFileSync(numpyBackendSource, numpyBackendOutput);
for (const filename of treeSitterAssets) {
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

function requireBrowserModuleCache(name) {
  const generated = path.join(
    standardLibraryCacheDirectory,
    `${name.replaceAll(".", "-")}.json`,
  );
  requirePath(
    `compiled browser module ${name} (run \`pnpm build\` first)`,
    generated,
  );
}

for (const name of browserAdditionalModules) {
  requireBrowserModuleCache(name);
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
    `${name.replaceAll(".", "-")}.json`,
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
fs.copyFileSync(lazyModulesSource, lazyModulesOutput);
fs.copyFileSync(conwayDataSource, conwayDataOutput);
fs.copyFileSync(kernelCoverageSource, kernelCoverageOutput);
const dynamicProgramInputs = fs.readdirSync(dynamicProgramCacheDirectory)
  .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
  .sort()
  .map((name) => path.join(dynamicProgramCacheDirectory, name));
const dynamicPrograms = dynamicProgramInputs.map((filename) => {
  const record = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (
    !/^[a-f0-9]{64}$/.test(record.sourceHash) ||
    typeof record.filename !== "string" ||
    !["exec", "eval", "single"].includes(record.mode) ||
    record.outputs === null ||
    typeof record.outputs !== "object"
  ) {
    throw new TypeError(`invalid precompiled dynamic program ${filename}`);
  }
  return {
    identity: path.basename(filename, ".json"),
    sourceHash: record.sourceHash,
    filename: record.filename,
    mode: record.mode,
    outputs: record.outputs,
  };
});
fs.writeFileSync(
  dynamicProgramsOutput,
  JSON.stringify({
    schema: "sagejs.browser-dynamic-programs/v1",
    programs: dynamicPrograms,
  }),
);
const rawAutoReceiptPolicy = JSON.parse(
  fs.readFileSync(autoReceiptPolicySource, "utf8"),
);
const verifiedAutoReceiptPolicy = autoReceiptPolicyApi.verifyPolicy(
  rawAutoReceiptPolicy,
  {
    root: repositoryRoot,
    sourceCommit: rawAutoReceiptPolicy.enabled
      ? rawAutoReceiptPolicy.source_bundle.source_commit
      : null,
  },
);
fs.writeFileSync(
  autoReceiptPolicyOutput,
  JSON.stringify({
    schema: verifiedAutoReceiptPolicy.schema,
    enabled: verifiedAutoReceiptPolicy.enabled,
    required_platforms: verifiedAutoReceiptPolicy.required_platforms,
    source_bundle_contract: verifiedAutoReceiptPolicy.source_bundle_contract,
    source_bundle: verifiedAutoReceiptPolicy.source_bundle,
    entries: verifiedAutoReceiptPolicy.entries,
  }),
);
fs.copyFileSync(
  require.resolve("plotly.js-dist-min/plotly.min.js"),
  plotlyOutput,
);
const plotlySource = require.resolve("plotly.js-dist-min/plotly.min.js");
const wasmPackLoaderSource = path.join(
  repositoryRoot,
  "tools",
  "native-kernel",
  "wasm-pack-loader.mjs",
);
fs.copyFileSync(wasmPackLoaderSource, wasmPackLoaderOutput);
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
console.log(
  `Separated lazy modules: stdlib ` +
    `${(fs.statSync(standardLibraryOutput).size / 1024 / 1024).toFixed(2)} MiB, ` +
    `lazy ${(fs.statSync(lazyModulesOutput).size / 1024 / 1024).toFixed(2)} MiB`,
);
run(process.execPath, [
  wasmAbiAllowlist,
  "--check",
  "--dist",
  outputDirectory,
]);
const receipt = writeProductionReceipt({
  repositoryRoot,
  packageRoot,
  outputDirectory,
  toolchain,
  sourceInputs: [
    ...compilerDependencyClosure(flintLinkedSources, [
      ...includeArguments,
      ...smalljacIncludeArguments,
      ...flintLocalIncludeArguments,
    ]),
    ...compilerDependencyClosure(m4riLinkedSources, [
      "-isystem",
      path.join(m4riDependency.prefix, "include"),
      "-isystem",
      path.join(toolchain.paths.libraries.gmp.prefix, "include"),
      ...m4riLocalIncludeArguments,
    ]),
    ...compilerDependencyClosure(algebraicLinkedSources, [
      ...includeArguments,
      ...flintLocalIncludeArguments,
    ]),
    ...kernelPackReceiptInputs,
    ...esbuildInputClosure([
      wasiRuntimeBuild,
      symbolicBackendBuild,
      serializationBuild,
      compilerFrontendBuild,
      foreignFrontendBuild,
    ]),
    compilerSource,
    baselibSource,
    numpyBackendSource,
    compilerFrontendBuildHelper,
    foreignFrontendBuildHelper,
    browserMagmaEnvironmentShim,
    ...treeSitterAssets.map((name) => path.join(vendorDirectory, name)),
    ...runtimeHostClosure.map(({ source }) => source),
    autoReceiptPolicySource,
    path.join(
      repositoryRoot,
      "tools",
      "math-dispatch",
      "hyperelliptic-auto-receipt-policy.cjs",
    ),
    ...standardLibraryReceiptInputs,
    ...dynamicProgramInputs,
    lazyModuleGenerator,
    lazyModuleConfig,
    conwayDataSource,
    kernelCoverageSource,
    plotlySource,
    wasmPackLoaderSource,
    flintDeclaration.filename,
    flintDeclaration.sourceFilename,
    m4riDeclaration.filename,
    m4riDeclaration.sourceFilename,
    ellipticLseriesSource,
    require.resolve("../src/curves/core-source.cjs"),
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
      ...targetCompileFlags.filter(
        (flag) => !flag.startsWith("-mexec-model="),
      ),
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

function sha256File(filename) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function buildKernelPacks({ reuseLinkedArtifacts = false } = {}) {
  fs.rmSync(kernelBuildDirectory, { recursive: true, force: true });
  if (!reuseLinkedArtifacts) {
    fs.rmSync(path.dirname(kernelManifestOutput), {
      recursive: true,
      force: true,
    });
  }
  const builder = path.join(
    repositoryRoot,
    "tools",
    "native-kernel",
    "wasm-production-pack.cjs",
  );
  run(process.execPath, [
    builder,
    "--emit-only",
    "--output",
    kernelBuildDirectory,
    "--manifest",
    path.join(repositoryRoot, "architecture", "native-kernels.json"),
  ]);
  const generatedIndex = path.join(kernelBuildDirectory, "index.json");
  const manifest = JSON.parse(fs.readFileSync(generatedIndex, "utf8"));
  const reviewedCapabilities = JSON.parse(fs.readFileSync(
    path.join(packageRoot, "release", "production-capabilities.json"),
    "utf8",
  ));
  const generatedSources = [];
  const compatibilitySource = path.join(
    kernelBuildDirectory,
    "wasi-compat.c",
  );
  fs.writeFileSync(compatibilitySource, [
    "#include <stdlib.h>",
    "__attribute__((weak)) int kill(int pid, int signal)",
    "{",
    "    (void) pid;",
    "    (void) signal;",
    "    abort();",
    "}",
    "",
  ].join("\n"));
  generatedSources.push(compatibilitySource);
  for (const pack of manifest.packs) {
    if (!new Set(["flint", "gmp"]).has(pack.domain)) {
      throw new Error(`unsupported production kernel domain ${pack.domain}`);
    }
    const kernels = manifest.kernels.filter((kernel) => kernel.domain === pack.domain);
    const sources = kernels.flatMap((kernel) => {
      const directory = path.join(
        kernelBuildDirectory,
        "sources",
        kernel.moduleIdentity,
      );
      return [
        path.join(directory, "kernel_core.c"),
        path.join(directory, "wasm_bridge.c"),
      ];
    });
    let ownershipAdapter = null;
    if ((pack.requiredResourceAdapters?.length ?? 0) !== 0) {
      if (pack.domain !== "flint") {
        throw new Error(
          `unsupported ${pack.domain} kernel resource ownership adapter`,
        );
      }
      const resourceIds = pack.requiredResourceAdapters.map((item) => item.id);
      const artifact = generatedWasmResourceAdapter(flintDeclaration, {
        resourceIds,
        resourceOnly: true,
      });
      fs.writeFileSync(kernelFlintResourceAdapterSource, artifact.cSource);
      fs.writeFileSync(
        kernelFlintResourceBackendOutput,
        artifact.javascriptSource +
          "\nexport const generatedWasmManifest = Object.freeze(" +
          JSON.stringify(artifact.manifest) +
          ");\n",
      );
      const identity = `generated-ownership:${flintDeclaration.identity}:` +
        createHash("sha256")
          .update(JSON.stringify(artifact.manifest))
          .digest("hex");
      ownershipAdapter = {
        identity,
        sources: [kernelFlintResourceAdapterSource],
        exports: artifact.manifest.exports,
        backend: "../kernel-flint-resource-backend.mjs",
      };
      pack.identity.ownershipAdapter = { identity };
      pack.ownershipAdapter = { identity, backend: ownershipAdapter.backend };
      pack.packKey = createHash("sha256")
        .update(JSON.stringify(pack.identity))
        .digest("hex");
    }
    const compatibilitySources = pack.domain === "flint"
      ? [path.join(packageRoot, "src", "wasi-stubs.c")]
      : [];
    generatedSources.push(
      ...sources,
      ...(ownershipAdapter?.sources ?? []),
      ...compatibilitySources,
      ...kernels.map((kernel) => path.join(
        kernelBuildDirectory,
        "sources",
        kernel.moduleIdentity,
        "kernel_core.h",
      )),
    );
    const exports = kernelPackExports(
      kernels,
      ownershipAdapter?.exports ?? [],
    );
    const module = productionModules.get(`kernel-${pack.domain}`);
    const raw = path.join(outputDirectory, `kernel-${pack.domain}.unstripped.wasm`);
    const output = path.join(outputDirectory, module.artifact);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const prefixes = pack.domain === "flint"
      ? dependencies.map(({ prefix }) => prefix)
      : [toolchain.paths.libraries.gmp.prefix];
    const libraries = pack.domain === "flint"
      ? ["flint", "mpfr", "gmp", "m", "wasi-emulated-signal"]
      : ["gmp", "m", "wasi-emulated-signal"];
    if (!reuseLinkedArtifacts) {
      run(clang, [
      ...targetCompileFlags,
      // Whole generated cores intentionally retain alternate lowering helpers
      // which are not reachable from the reviewed bridge export subset.
      "-Wno-unused-function",
      "-Wno-unused-variable",
      "-Wno-unused-but-set-variable",
      "-Wno-unused-label",
      "-Wno-unused-parameter",
      `--sysroot=${sysroot}`,
      "-O2",
      "-D_WASI_EMULATED_SIGNAL",
      ...prefixes.flatMap((prefix) => ["-isystem", path.join(prefix, "include")]),
      `-I${path.join(repositoryRoot, "packages", "flint", "include")}`,
      ...sources,
      ...(ownershipAdapter?.sources ?? []),
      ...compatibilitySources,
      compatibilitySource,
      ...prefixes.map((prefix) => `-L${path.join(prefix, "lib")}`),
      ...libraries.map((library) => `-l${library}`),
      ...exports.map((name) => `-Wl,--export=${name}`),
      ...toolchain.lock.build.linkFlags,
      "-o",
      raw,
      ]);
      run(wasmStrip, ["--strip-all", raw, "-o", output]);
      fs.rmSync(raw);
    } else {
      requirePath(`previously linked kernel-${pack.domain} artifact`, output);
    }
    verifyWasmMemoryContract(output, module.memory);
    Object.assign(pack, {
      status: "built",
      asset: path.basename(module.artifact),
      bytes: fs.statSync(output).size,
      sha256: sha256File(output),
      exports,
    });

    const fullyCompiled = kernels
      .filter((kernel) =>
        kernel.functions.length > 0 &&
        kernel.functions.every((fn) => fn.status === "compiled-source")
      )
      .map((kernel) => `kernel:${kernel.id}`)
      .sort();
    const receipted = [
      ...(reviewedCapabilities.modules[`kernel-${pack.domain}`]
        ?.additionalCapabilities ?? []),
    ].sort();
    if (JSON.stringify(fullyCompiled) !== JSON.stringify(receipted)) {
      throw new Error(
        `reviewed kernel-${pack.domain} receipt capabilities do not match ` +
        `the complete compiled pack kernels: expected ${fullyCompiled.join(", ")}; ` +
        `received ${receipted.join(", ")}`,
      );
    }
  }
  fs.mkdirSync(path.dirname(kernelManifestOutput), { recursive: true });
  fs.writeFileSync(kernelManifestOutput, `${JSON.stringify(manifest, null, 2)}\n`);
  const dependencyProbe = spawnSync(process.execPath, [
    "-e",
    `require(${JSON.stringify(builder)});process.stdout.write(JSON.stringify(Object.keys(require.cache)))`,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  if (dependencyProbe.error) throw dependencyProbe.error;
  if (dependencyProbe.status !== 0) {
    throw new Error(`unable to enumerate kernel generator inputs: ${dependencyProbe.stderr}`);
  }
  const generatorInputs = JSON.parse(dependencyProbe.stdout)
    .filter((filename) => filename.startsWith(`${repositoryRoot}${path.sep}`));
  return [
    ...generatedSources,
    ...generatorInputs,
    path.join(repositoryRoot, "architecture", "native-kernels.json"),
    ...manifest.kernels.map((kernel) => path.join(repositoryRoot, kernel.source)),
  ];
}
