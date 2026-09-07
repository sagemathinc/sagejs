"use strict";
const { createHash } = require("node:crypto");
const { tarGzip } = require("./release-tar.cjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function platformPackage(platform) {
  const extension = platform === "windows-x64" ? ".exe" : "";
  const sea = Buffer.from(`qualified sagejs ${platform}`), python = Buffer.from(`qualified sagepython ${platform}`);
  const entries = [{ name: `package/bin/sagejs${extension}`, data: sea, gnu: false },
    { name: `package/bin/sagepython${extension}`, data: python, gnu: false }];
  const bytes = tarGzip(entries);
  const manifests = new Map([
    ["npm", { bindings: { artifacts: [{ name: "npm-platform-tarball", path: `original/${platform}.tgz`, content_sha256: hash(bytes), bytes: bytes.length, files: 1 }] } }],
    ["sea", { bindings: { artifacts: [{ name: "sea-executable", path: `original/${platform}/sagejs${extension}`, content_sha256: hash(sea), bytes: sea.length, files: 1 }] } }],
  ]);
  return { bytes, sea, python, entries, manifests };
}
module.exports = { platformPackage };
