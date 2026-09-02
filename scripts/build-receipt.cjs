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
const receiptSchema = "sagejs.build-receipt/v1";

const fallbackSourceRoots = [
  ".agents",
  "architecture",
  "bootstrap",
  "ffi",
  "packages",
  "scripts",
  "src",
  "test",
  "tools",
];
const fallbackSourceFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "pyrightconfig.json",
  "tsconfig.json",
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
  for (const filename of fallbackSourceFiles) visit(join(root, filename));
  for (const filename of fallbackSourceRoots) visit(join(root, filename));
  return [...new Set(files)].sort();
}

function workspaceFingerprint(root = repositoryRoot) {
  const hash = createHash("sha256");
  const files = gitWorkspaceFiles(root) ?? fallbackWorkspaceFiles(root);
  for (const name of files) {
    const filename = join(root, name);
    if (!existsSync(filename)) continue;
    const status = lstatSync(filename);
    hash.update(name);
    hash.update("\0");
    if (status.isSymbolicLink()) {
      hash.update("symlink\0");
      hash.update(readlinkSync(filename));
    } else if (status.isFile()) {
      hash.update("file\0");
      hash.update(readFileSync(filename));
    }
    hash.update("\0");
  }
  return hash.digest("hex");
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
      : { available: false, source: "invalid-product" };
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
    "dist/compiler/compiler.js",
    "dist/tools/kernel.js",
    "dist/module-cache",
    "dist/runtime-cache/manifest.json",
  ];
  witnesses.push(...numericalFilesForIdentity(identity)
    .map(([, installedPath]) => installedPath));
  if (existsSync(join(root, "packages/flint/build/generated-ffi/sagejs_flint_ffi.node"))) {
    witnesses.push("dist/native-kernels/index.json");
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

function validateBuildReceipt(receipt, identity, root = repositoryRoot) {
  if (receipt?.schema !== receiptSchema) {
    return { current: false, reason: "no valid successful-build receipt" };
  }
  if (!sameIdentity(receipt.identity, identity)) {
    return { current: false, reason: "build inputs changed" };
  }
  const numericalFailure = validateNumericalOutputBindings(receipt, identity, root);
  if (numericalFailure !== null) {
    return { current: false, reason: numericalFailure };
  }
  for (const witness of receipt.outputs ?? []) {
    if (!existsSync(join(root, witness))) {
      return { current: false, reason: `build output is missing: ${witness}` };
    }
  }
  if (!Array.isArray(receipt.outputs) || receipt.outputs.length === 0) {
    return { current: false, reason: "receipt has no output witnesses" };
  }
  return {
    current: true,
    reason: "exact build inputs and required outputs match",
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
    "workspaceSha256",
    "node",
    "v8",
    "platform",
    "architecture",
  ];
  if (
    receipt?.schema !== receiptSchema ||
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
  if (!Array.isArray(receipt.outputs) || receipt.outputs.length === 0) {
    return { current: false, reason: "receipt has no output witnesses" };
  }
  for (const witness of receipt.outputs) {
    if (!existsSync(join(root, witness))) {
      return { current: false, reason: `build output is missing: ${witness}` };
    }
  }
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
} = {}) {
  const receipt = {
    schema: receiptSchema,
    completedAt: new Date().toISOString(),
    durationMilliseconds,
    identity,
    outputs: outputWitnesses(root, identity),
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
  return writeBuildReceipt({
    root,
    durationMilliseconds: previous.durationMilliseconds,
    identity: currentBuildIdentity(root),
  });
}

module.exports = {
  currentBuildIdentity,
  inspectBuildReceipt,
  inspectSourceBuildReceipt,
  nativeInputIdentity,
  numericalRuntimeProviderIdentity,
  numericalOutputBindings,
  outputWitnesses,
  refreshBuildReceiptAfterNative,
  receiptRelativePath,
  validateBuildReceipt,
  workspaceFingerprint,
  writeBuildReceipt,
};
