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
  return inputs;
}

function currentBuildIdentity(root = repositoryRoot) {
  return {
    workspaceSha256: workspaceFingerprint(root),
    nativeInputs: nativeInputIdentity(root),
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
  };
}

function outputWitnesses(root = repositoryRoot) {
  const witnesses = [
    "dist/compiler/compiler.js",
    "dist/tools/kernel.js",
    "dist/module-cache",
    "dist/runtime-cache/manifest.json",
  ];
  if (existsSync(join(root, "packages/flint/build/generated-ffi/sagejs_flint_ffi.node"))) {
    witnesses.push("dist/native-kernels/index.json");
  }
  return witnesses;
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
    outputs: outputWitnesses(root),
  };
  writeFileSync(
    join(root, receiptRelativePath),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt;
}

module.exports = {
  currentBuildIdentity,
  inspectBuildReceipt,
  nativeInputIdentity,
  outputWitnesses,
  receiptRelativePath,
  validateBuildReceipt,
  workspaceFingerprint,
  writeBuildReceipt,
};
