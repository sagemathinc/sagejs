"use strict";
const fs = require("node:fs"), path = require("node:path");
const { zipSync } = require("fflate");
const { execFileSync } = require("node:child_process");
const { tar } = require("./release-tar.cjs");
const { decoderEnvironment } = require("../../scripts/release/linux-tar-contents.cjs");
function sourceDocumentation(root) {
  const docs = new Map([...["LICENSE", "README.md", "DISTRIBUTION.md"].map((name) => [name, Buffer.from(`source ${name}`)]),
    ["licenses/notice.txt", Buffer.from("third-party source notice")]]);
  for (const [name, bytes] of docs) {
    const filename = path.join(root, name); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, bytes);
  }
  return docs;
}
function archiveFiles(platform, product, docs) {
  const prefix = platform === "windows-x64" ? "" : `sagejs-${platform}/`, extension = platform === "windows-x64" ? ".exe" : "";
  const entries = { [prefix + "sagejs" + extension]: [product.sea, { os: 3, attrs: (0o100755 << 16) >>> 0 }],
    [prefix + "sagepython" + extension]: [product.python, { os: 3, attrs: (0o100755 << 16) >>> 0 }] };
  for (const [name, data] of docs) entries[prefix + name] = [data, { os: 3, attrs: (0o100644 << 16) >>> 0 }];
  return entries;
}
function encodeArchive(platform, files) {
  if (!platform.startsWith("linux")) return Buffer.from(zipSync(files));
  const bytes = tar(Object.entries(files).map(([name, value]) => {
    const [data, attributes] = Array.isArray(value) ? value : [value, {}];
    const mode = attributes.attrs === undefined ? 0o644 : (attributes.attrs >>> 16) & 0o7777;
    return { name, data, mutate: (header) => header.write(`${mode.toString(8).padStart(7, "0")}\0`, 100, 8) };
  }));
  return execFileSync("xz", ["--compress", "--stdout", "--threads=1", "-0"], { input: bytes, timeout: 5000, maxBuffer: 1024 * 1024,
    env: decoderEnvironment(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
}
function platformArchive(platform, product, docs) { return encodeArchive(platform, archiveFiles(platform, product, docs)); }
module.exports = { sourceDocumentation, archiveFiles, platformArchive, encodeArchive };
