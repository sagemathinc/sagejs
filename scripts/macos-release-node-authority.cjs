"use strict";

const OFFICIAL_MACOS_ARM64_NODE = Object.freeze({
  filename: "node-v26.7.0-darwin-arm64.tar.xz",
  sha256: "595d2f934e081b82961d1a5fd41c6dbd0c5a952d9e8be5b4566ab754426968d2",
  url: "https://nodejs.org/dist/v26.7.0/node-v26.7.0-darwin-arm64.tar.xz",
  version: "26.7.0",
});

function validateMacosArm64SeaNode(buildReceipt) {
  const node = buildReceipt?.toolchain?.seaNode;
  if (
    node?.version !== OFFICIAL_MACOS_ARM64_NODE.version ||
    !/^[0-9a-f]{64}$/.test(node?.executableSha256 || "") ||
    JSON.stringify(node?.source) !== JSON.stringify(OFFICIAL_MACOS_ARM64_NODE)
  ) {
    throw new Error(
      "the authenticated SEA build manifest does not bind the exact official " +
        "Node 26.7.0 darwin-arm64 distribution",
    );
  }
  return { node, source: node.source };
}

module.exports = {
  OFFICIAL_MACOS_ARM64_NODE,
  validateMacosArm64SeaNode,
};
