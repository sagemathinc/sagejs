"use strict";

const { resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "../../../..");
const {
  loadCatalog,
  toolchainDigest,
} = require(resolve(
  repositoryRoot,
  "packages/wasm-toolchain/scripts/toolchain.cjs",
));

function productionToolchainIdentity(toolchain) {
  if (
    toolchain?.lock?.canonicalBuilder === undefined ||
    typeof toolchain.lockDigest !== "string" ||
    typeof toolchain.platform !== "string"
  ) {
    throw new Error("a resolved Wasm toolchain is required");
  }
  return {
    // Production manifests bind the canonical build recipe. The prepared
    // toolchain digest additionally includes the host platform and therefore
    // intentionally differs on reproducibility builders such as macOS.
    identity: toolchainDigest(
      toolchain.lock,
      loadCatalog(toolchain.lock),
      toolchain.lock.canonicalBuilder,
    ),
    builder: {
      identity: toolchain.lockDigest,
      platform: toolchain.platform,
    },
  };
}

module.exports = { productionToolchainIdentity };
