import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLCHAIN_DIGEST =
  "1e306620de0571d34f6fc1bf0010aaf164e9b328d304bcd3cfd0d86f945634ba";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const sourceRoots = [
  "bench/pari-class-group-rust/Cargo.toml",
  "bench/pari-class-group-rust/Cargo.lock",
  "bench/pari-class-group-rust/build.rs",
  "bench/pari-class-group-rust/src",
  "bench/pari-class-group-rust/qualification/public-cubic-e2e/Cargo.toml",
  "bench/pari-class-group-rust/qualification/public-cubic-e2e/Cargo.lock",
  "bench/pari-class-group-rust/qualification/public-cubic-e2e/src",
  "bench/pari-class-group-rust/qualification/browser/class-group-route.html",
  "bench/pari-class-group-rust/qualification/browser/class-group-route.mjs",
  "bench/pari-class-group-rust/qualification/browser/browser-loader.mjs",
  "bench/pari-class-group-rust/qualification/wasm-public-cubic-e2e",
  "packages/flint-wasm/src/wasi-constants.mjs",
  "packages/flint-wasm/src/wasi-filesystem.mjs",
  "packages/flint-wasm/src/wasi-runtime.mjs",
  "packages/flint-wasm/src/wasi-stubs.c",
  "packages/flint-wasm/test/browser-wasm-support.mjs",
];

export async function sourceClosure(repositoryRoot) {
  const files = [];
  async function visit(relative) {
    const absolute = path.join(repositoryRoot, relative);
    const entries = await readdir(absolute, { withFileTypes: true }).catch(() => null);
    if (entries === null) {
      if (!relative.endsWith("-receipt.json")) files.push(relative);
      return;
    }
    for (const entry of entries) {
      if (["target", "build"].includes(entry.name) ||
          entry.name.endsWith("-receipt.json")) {
        continue;
      }
      await visit(path.join(relative, entry.name));
    }
  }
  for (const root of sourceRoots) await visit(root);
  files.sort();
  const digests = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(repositoryRoot, relative));
    digests.push({ path: relative, sha256: sha256(bytes) });
  }
  return {
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    fileCount: digests.length,
    sha256: sha256(Buffer.from(digests.map(
      (item) => `${item.path}\0${item.sha256}\n`,
    ).join(""))),
    files: digests,
  };
}

// `gitHead` is execution provenance: it intentionally remains the revision at
// which a receipt was produced, even after that receipt is integrated by a
// later commit. Exact reproducibility is therefore decided by the sorted file
// closure rather than by requiring the current checkout to have the same HEAD.
export function assertSameClosureContent(actual, expected) {
  if (actual.fileCount !== expected.fileCount ||
      actual.sha256 !== expected.sha256 ||
      JSON.stringify(actual.files) !== JSON.stringify(expected.files)) {
    throw new Error("source-closure content does not match the recorded receipt");
  }
}

function version(command, args = ["--version"]) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

export async function toolchainIdentity(repositoryRoot) {
  const gitCommon = version("git", ["rev-parse", "--git-common-dir"]);
  const common = path.isAbsolute(gitCommon)
    ? gitCommon
    : path.resolve(repositoryRoot, gitCommon);
  const toolchain = path.join(
    common,
    "sagejs-wasm-toolchains/v2",
    TOOLCHAIN_DIGEST,
  );
  const receiptBytes = await readFile(path.join(toolchain, "receipt.json"));
  const receipt = JSON.parse(receiptBytes);
  return {
    identity: TOOLCHAIN_DIGEST,
    receiptSha256: sha256(receiptBytes),
    receipt,
    target: "wasm32-wasip1",
    rustc: version("rustc", ["--version", "--verbose"]),
    cargo: version("cargo", ["--version", "--verbose"]),
    clang: version(path.join(toolchain, "sdk/bin/clang")),
    wasmLd: version(path.join(toolchain, "sdk/bin/wasm-ld")),
  };
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(directory, "../../../..");
  const [nodeSource, browserSource, artifact, vectorSource] = await Promise.all([
    readFile(path.join(directory, "node-receipt.json"), "utf8"),
    readFile(path.join(directory, "browser-receipt.json"), "utf8"),
    readFile(path.join(directory, "build/public-cubic-e2e.wasm")),
    readFile(path.join(directory, "row6.vector.json"), "utf8"),
  ]);
  const nodeReceipt = JSON.parse(nodeSource);
  const browserReceipt = JSON.parse(browserSource);
  const currentClosure = await sourceClosure(repositoryRoot);
  const currentToolchain = await toolchainIdentity(repositoryRoot);
  assertSameClosureContent(currentClosure, nodeReceipt.sourceClosure);
  assertSameClosureContent(currentClosure, browserReceipt.sourceClosure);
  if (JSON.stringify(nodeReceipt.toolchain) !== JSON.stringify(currentToolchain) ||
      JSON.stringify(browserReceipt.toolchain) !== JSON.stringify(currentToolchain)) {
    throw new Error("toolchain identity does not match the recorded receipts");
  }
  if (nodeReceipt.artifact.bytes !== artifact.byteLength ||
      nodeReceipt.artifact.sha256 !== sha256(artifact) ||
      browserReceipt.artifact.bytes !== artifact.byteLength ||
      browserReceipt.artifact.sha256 !== sha256(artifact)) {
    throw new Error("artifact identity does not match the recorded receipts");
  }
  if (nodeReceipt.vectorSha256 !== sha256(Buffer.from(vectorSource)) ||
      browserReceipt.vector.sha256 !== sha256(Buffer.from(vectorSource))) {
    throw new Error("request-vector identity does not match the recorded receipts");
  }
  process.stdout.write(`${JSON.stringify({
    outcome: "pass",
    artifactSha256: sha256(artifact),
    sourceClosureSha256: currentClosure.sha256,
    executionGitHeads: [...new Set([
      nodeReceipt.sourceClosure.gitHead,
      browserReceipt.sourceClosure.gitHead,
    ])],
  })}\n`);
}
