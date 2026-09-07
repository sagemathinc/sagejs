"use strict";
const fs = require("node:fs"), path = require("node:path");
const { zipSync } = require("fflate");
function sourceDocumentation(root) {
  const docs = new Map([...["LICENSE", "README.md", "DISTRIBUTION.md"].map((name) => [name, Buffer.from(`source ${name}`)]),
    ["licenses/notice.txt", Buffer.from("third-party source notice")]]);
  for (const [name, bytes] of docs) {
    const filename = path.join(root, name); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, bytes);
  }
  return docs;
}
function zipFiles(platform, product, docs) {
  const prefix = platform === "macos-arm64" ? "sagejs-macos-arm64/" : "", extension = platform === "windows-x64" ? ".exe" : "";
  const entries = { [prefix + "sagejs" + extension]: [product.sea, { os: 3, attrs: (0o100755 << 16) >>> 0 }],
    [prefix + "sagepython" + extension]: [product.python, { os: 3, attrs: (0o100755 << 16) >>> 0 }] };
  for (const [name, data] of docs) entries[prefix + name] = [data, { os: 3, attrs: (0o100644 << 16) >>> 0 }];
  return entries;
}
function platformZip(platform, product, docs) { return Buffer.from(zipSync(zipFiles(platform, product, docs))); }
module.exports = { sourceDocumentation, zipFiles, platformZip };
