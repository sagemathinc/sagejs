"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { join, relative, resolve } = require("node:path");
const { inspectToolchain } = require(
  "../packages/wasm-toolchain/scripts/toolchain.cjs"
);
const {
  inspectNumericalProduct,
  productFiles,
} = require("./numerical-product.cjs");

const repositoryRoot = resolve(__dirname, "..");
const receiptRelativePath = "dist/build-receipt.json";
const receiptSchema = "sagejs.build-receipt/v3";

// This is deliberately a small exclusion list, not a guessed compiler DAG.
// Keep unknown paths, generators, source docstrings, and vendored parsers as
// artifact inputs. Validation still fingerprints every one of these paths.
const validationOnlyRoots = [
  "agents/", "docs/", "test/",
  "upstream-tests/micropython/", "upstream-tests/python-compat/",
];
const validationOnlyFiles = new Set([
  "AGENTS.md", "ARCHITECTURE.md", "README.md", "RELEASE.md", "TODO.md",
  "website/reference-data.json", "website/reference.html",
]);

function isArtifactInput(name, reviewedInputs = new Set()) {
  // These are Node test entry points, not browser build inputs. Keep shared
  // support modules and fixtures conservative; they do not match this suffix.
  const wasmTestEntry = /^packages\/flint-wasm\/test\/[^/]+\.test\.(?:mjs|cjs)$/.test(name);
  return reviewedInputs.has(name) || (!wasmTestEntry && !validationOnlyFiles.has(name) &&
    !validationOnlyRoots.some((prefix) => name.startsWith(prefix)));
}

function reviewedBuildInputs(root) {
  // Numerical publication verifies these source hashes, including selected
  // tests. They are build inputs despite living in validation-only folders.
  const filename = join(root,
    "src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json");
  if (!existsSync(filename)) return new Set();
  const manifest = JSON.parse(readFileSync(filename, "utf8"));
  return new Set([
    ...Object.keys(manifest.reviewed_sagejs_files ?? {}),
    ...Object.keys(manifest.qualification_tooling_files ?? {}),
  ]);
}

const fallbackSourceRoots = [
  ".agents",
  "agents",
  "architecture",
  "bench",
  "bin",
  "bootstrap",
  "docs",
  "ffi",
  "packages",
  "scripts",
  "src",
  "test",
  "tools",
  "upstream-tests",
  "website",
];
const fallbackSourceFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "pyrightconfig.json",
  "tsconfig.json",
  "sagejs-version.json",
];
const ignoredDirectoryNames = new Set([
  ".git",
  ".native",
  "build",
  "dist",
  "node_modules",
]);

function sha256File(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function gitWorkspaceFiles(root) {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-co", "--exclude-standard", "-z"],
      { cwd: root, encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.toString("utf8").split("\0").filter(Boolean).sort();
  } catch {
    return null;
  }
}

function fallbackWorkspaceFiles(root) {
  const files = [];
  function visit(filename) {
    if (!existsSync(filename)) return;
    const status = lstatSync(filename);
    if (!status.isDirectory()) {
      files.push(relative(root, filename).replaceAll("\\", "/"));
      return;
    }
    for (const name of readdirSync(filename).sort()) {
      if (ignoredDirectoryNames.has(name)) continue;
      visit(join(filename, name));
    }
  }
  // Root metadata/configuration must remain visible even without a Git index.
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() && entry.name !== ".git") visit(join(root, entry.name));
  }
  for (const filename of fallbackSourceFiles) visit(join(root, filename));
  for (const filename of fallbackSourceRoots) visit(join(root, filename));
  return [...new Set(files)].sort();
}

function workspaceFingerprint(root = repositoryRoot, { artifactOnly = false } = {}) {
  const hash = createHash("sha256");
  const reviewedInputs = artifactOnly ? reviewedBuildInputs(root) : new Set();
  const files = gitWorkspaceFiles(root) ?? fallbackWorkspaceFiles(root);
  function append(name) {
    if (artifactOnly && !isArtifactInput(name, reviewedInputs)) return;
    const filename = join(root, name);
    let status;
    try { status = lstatSync(filename); } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    hash.update(name);
    hash.update("\0");
    if (status.isSymbolicLink()) {
      hash.update("symlink\0");
      hash.update(readlinkSync(filename));
    } else if (status.isFile()) {
      hash.update("file\0");
      hash.update(readFileSync(filename));
    } else if (status.isDirectory()) {
      // Git lists submodules as directories, not their source files. Bind the
      // checked-out revision AND tracked/untracked contents, including dirty
      // grammar edits; a gitlink pathname alone is not an input identity.
      hash.update("directory\0");
      const nested = existsSync(join(filename, ".git"));
      if (nested) {
        hash.update(execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: filename, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
        }).trim());
        hash.update("\0");
      }
      const children = nested ? gitWorkspaceFiles(filename) : null;
      for (const child of children ?? readdirSync(filename).sort()) {
        if (ignoredDirectoryNames.has(child)) continue;
        append(`${name}/${child}`);
      }
    }
    hash.update("\0");
  }
  for (const name of files) append(name);
  return hash.digest("hex");
}

function artifactInputsFingerprint(root = repositoryRoot) {
  return workspaceFingerprint(root, { artifactOnly: true });
}

function artifactBuildIdentity(identity) {
  const { workspaceSha256, ...inputs } = identity ?? {};
  return inputs;
}

function nativeInputIdentity(root = repositoryRoot) {
  const inputs = [];
  for (const packageName of ["fflas", "flint", "graph", "m4ri"]) {
    const directory = join(root, "packages", packageName, "build", "generated-ffi");
    if (!existsSync(directory)) {
      inputs.push({ package: packageName, status: "absent" });
      continue;
    }
    const files = readdirSync(directory)
      .filter((name) => name === "manifest.json" || name.endsWith(".node"))
      .sort()
      .map((name) => {
        const filename = join(directory, name);
        return {
          path: relative(root, filename).replaceAll("\\", "/"),
          bytes: lstatSync(filename).size,
          sha256: sha256File(filename),
        };
      });
    inputs.push({ package: packageName, status: "installed", files });
  }
  for (const [packageName, names] of Object.entries({
    flint: ["sagejs_flint.node", "sagejs_flint.manifest.json"],
    graph: ["sagejs_graph.node"],
  })) {
    const directory = join(root, "packages", packageName, "build", "Release");
    const files = names
      .map((name) => join(directory, name))
      .filter((filename) => existsSync(filename))
      .map((filename) => ({
        path: relative(root, filename).replaceAll("\\", "/"),
        bytes: lstatSync(filename).size,
        sha256: sha256File(filename),
      }));
    inputs.push({
      package: packageName,
      kind: "direct-addon",
      status: files.length === 0 ? "absent" : "installed",
      files,
    });
  }
  return inputs;
}

function numericalRuntimeProviderIdentity(
  root = repositoryRoot,
  environment = process.env,
) {
  const productRoot = environment.SAGEJS_NUMERICAL_PRODUCT_ROOT;
  if (productRoot) {
    const product = inspectNumericalProduct({ root, inputDirectory: productRoot });
    return product.valid
      ? { available: true, source: "authenticated-product", identity: product.identity }
      : { available: false, source: "unavailable", reason: "invalid-product" };
  }
  try {
    const toolchain = inspectToolchain({ root, environment });
    return {
      available: toolchain.ready,
      source: toolchain.source,
      identity: toolchain.lockDigest,
      platform: toolchain.platform,
    };
  } catch {
    return { available: false, source: "unavailable" };
  }
}

function currentBuildIdentity(root = repositoryRoot) {
  return {
    workspaceSha256: workspaceFingerprint(root),
    artifactInputsSha256: artifactInputsFingerprint(root),
    nativeInputs: nativeInputIdentity(root),
    numericalRuntimeProvider: numericalRuntimeProviderIdentity(root),
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
  };
}

function outputWitnesses(root = repositoryRoot, identity = currentBuildIdentity(root)) {
  const witnesses = [
    "dist/compiler",
    "dist/compiler/compiler.js",
    "dist/tools",
    "dist/tools/kernel.js",
    "dist/vendor",
    "dist/module-cache",
    "dist/runtime-cache",
    "dist/runtime-cache/manifest.json",
    "dist/sagejs-version.json",
  ];
  witnesses.push(...numericalFilesForIdentity(identity)
    .map(([, installedPath]) => installedPath));
  if (existsSync(join(root, "packages/flint/build/generated-ffi/sagejs_flint_ffi.node"))) {
    witnesses.push("dist/native-kernels", "dist/native-kernels/index.json");
  }
  return witnesses;
}

function numericalFilesForIdentity(identity) {
  if (identity.numericalRuntimeProvider?.available) return productFiles;
  if (identity.numericalRuntimeProvider !== undefined &&
      identity.numericalRuntimeProvider.source !== "unavailable") {
    return productFiles.filter(([path]) => !path.endsWith(".wasm"));
  }
  return [];
}

function numericalOutputBindings(root, identity) {
  return numericalFilesForIdentity(identity).map(([, installedPath]) => {
    const filename = join(root, installedPath);
    const status = lstatSync(filename);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`numerical build output is not a regular file: ${installedPath}`);
    }
    return {
      path: installedPath,
      bytes: status.size,
      sha256: sha256File(filename),
    };
  });
}

function validateNumericalOutputBindings(receipt, identity, root) {
  const actual = receipt?.numericalOutputs ?? [];
  let expected;
  try {
    expected = numericalOutputBindings(root, identity);
  } catch (error) {
    return error.message;
  }
  return sameIdentity(actual, expected)
    ? null
    : "numerical output digest or inventory differs";
}

function sameIdentity(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// Bind complete directory inventories, not just manifests or file existence.
// In particular, a module-cache entry can change without its directory or
// runtime-cache manifest changing. Reject links instead of hashing only their
// names and accidentally trusting a mutable target outside the build tree.
function outputBindings(root, outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    throw new Error("receipt has no output witnesses");
  }
  const entries = new Map();
  function visit(name, checkAncestors = false) {
    const filename = resolve(root, name);
    const local = relative(resolve(root), filename).replaceAll("\\", "/");
    if (!local || local === ".." || local.startsWith("../") ||
        local !== name) {
      throw new Error(`invalid build output path: ${name}`);
    }
    if (checkAncestors) {
      const parts = name.split("/");
      for (let count = 1; count < parts.length; count++) {
        const ancestor = parts.slice(0, count).join("/");
        const status = lstatSync(join(root, ancestor));
        if (!status.isDirectory() || status.isSymbolicLink()) {
          throw new Error(`build output ancestor is not a regular directory: ${ancestor}`);
        }
      }
    }
    let status;
    try {
      status = lstatSync(filename);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      throw new Error(`build output is missing: ${name}`);
    }
    if (status.isSymbolicLink() || (!status.isFile() && !status.isDirectory())) {
      throw new Error(`build output is not a regular file or directory: ${name}`);
    }
    if (status.isDirectory()) {
      entries.set(name, { path: name, kind: "directory" });
      for (const child of readdirSync(filename).sort()) visit(`${name}/${child}`);
    } else {
      entries.set(name, {
        path: name, kind: "file", bytes: status.size, sha256: sha256File(filename),
      });
    }
  }
  for (const name of outputs) visit(name, true);
  return [...entries.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function validateOutputBindings(receipt, root, { afterNative = false } = {}) {
  // Native reconciliation deliberately republishes this product. Everything
  // else must still match the *previous* successful source build before a new
  // receipt may bind the replacement native pack.
  const stable = (name) => !afterNative ||
    (name !== "dist/native-kernels" && !name.startsWith("dist/native-kernels/"));
  try {
    if (!sameIdentity(receipt.outputs?.filter(stable),
      outputWitnesses(root, receipt.identity).filter(stable))) {
      return "build output witness contract differs";
    }
    const actual = outputBindings(root, receipt.outputs?.filter(stable));
    const expected = receipt.outputBindings?.filter((entry) => stable(entry.path));
    return sameIdentity(actual, expected)
      ? null : "build output digest or inventory differs";
  } catch (error) {
    return error.message;
  }
}

function validateBuildReceipt(receipt, identity, root = repositoryRoot) {
  if (receipt?.schema !== receiptSchema) {
    return { current: false, reason: "no valid successful-build receipt" };
  }
  if (!/^[0-9a-f]{64}$/.test(receipt.identity?.artifactInputsSha256 ?? "") ||
      !sameIdentity(artifactBuildIdentity(receipt.identity), artifactBuildIdentity(identity))) {
    return { current: false, reason: "build inputs changed" };
  }
  const numericalFailure = validateNumericalOutputBindings(receipt, identity, root);
  if (numericalFailure !== null) {
    return { current: false, reason: numericalFailure };
  }
  const outputFailure = validateOutputBindings(receipt, root);
  if (outputFailure !== null) return { current: false, reason: outputFailure };
  return {
    current: true,
    reason: "artifact inputs and required outputs match; validation is separate",
    buildWorkspaceSha256: receipt.identity.workspaceSha256,
    validationWorkspaceSha256: identity.workspaceSha256,
    completedAt: receipt.completedAt,
    durationMilliseconds: receipt.durationMilliseconds,
  };
}

function inspectBuildReceipt(root = repositoryRoot) {
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(join(root, receiptRelativePath), "utf8"));
  } catch {
    receipt = null;
  }
  return validateBuildReceipt(receipt, currentBuildIdentity(root), root);
}

function inspectSourceBuildReceipt(root = repositoryRoot) {
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(join(root, receiptRelativePath), "utf8"));
  } catch {
    return { current: false, reason: "no valid successful-build receipt" };
  }
  const current = currentBuildIdentity(root);
  const stableIdentityKeys = [
    "artifactInputsSha256",
    "node",
    "v8",
    "platform",
    "architecture",
  ];
  if (
    receipt?.schema !== receiptSchema ||
    !/^[0-9a-f]{64}$/.test(receipt.identity?.artifactInputsSha256 ?? "") ||
    stableIdentityKeys.some((key) => receipt.identity?.[key] !== current[key])
  ) {
    return { current: false, reason: "source or runtime inputs changed" };
  }
  if (receipt.identity?.numericalRuntimeProvider !== undefined &&
      !sameIdentity(receipt.identity.numericalRuntimeProvider,
        current.numericalRuntimeProvider)) {
    return { current: false, reason: "numerical runtime provider changed" };
  }
  const numericalFailure = validateNumericalOutputBindings(
    receipt,
    receipt.identity ?? {},
    root,
  );
  if (numericalFailure !== null) {
    return { current: false, reason: numericalFailure };
  }
  const outputFailure = validateOutputBindings(receipt, root, { afterNative: true });
  if (outputFailure !== null) return { current: false, reason: outputFailure };
  return {
    current: true,
    reason: "source inputs and required outputs match",
    receipt,
  };
}

function writeBuildReceipt({
  root = repositoryRoot,
  durationMilliseconds,
  identity = currentBuildIdentity(root),
  refreshWorkspaceSha256,
} = {}) {
  const outputs = outputWitnesses(root, identity);
  const receipt = {
    schema: receiptSchema,
    completedAt: new Date().toISOString(),
    durationMilliseconds,
    identity,
    ...(refreshWorkspaceSha256 === undefined ? {} : { refreshWorkspaceSha256 }),
    outputs,
    outputBindings: outputBindings(root, outputs),
    numericalOutputs: numericalOutputBindings(root, identity),
  };
  writeFileSync(
    join(root, receiptRelativePath),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt;
}

function refreshBuildReceiptAfterNative(root = repositoryRoot) {
  const sourceStatus = inspectSourceBuildReceipt(root);
  if (!sourceStatus.current) {
    throw new Error(
      `cannot refresh the build receipt: ${sourceStatus.reason}`,
    );
  }
  const previous = sourceStatus.receipt;
  const current = currentBuildIdentity(root);
  return writeBuildReceipt({
    root,
    durationMilliseconds: previous.durationMilliseconds,
    // A native refresh does not rebuild the compiler. Keep its original full
    // workspace lineage when only validation inputs have changed since then.
    identity: { ...current, workspaceSha256: previous.identity.workspaceSha256 },
    refreshWorkspaceSha256: current.workspaceSha256,
  });
}

module.exports = {
  artifactInputsFingerprint,
  isArtifactInput,
  currentBuildIdentity,
  inspectBuildReceipt,
  inspectSourceBuildReceipt,
  nativeInputIdentity,
  numericalRuntimeProviderIdentity,
  numericalOutputBindings,
  outputBindings,
  outputWitnesses,
  refreshBuildReceiptAfterNative,
  receiptRelativePath,
  validateBuildReceipt,
  workspaceFingerprint,
  writeBuildReceipt,
};
