"use strict";

// Only for previously authenticated GitHub transport ZIPs. Never extracts the
// inner SEA/npm archives or executes their contents. Output mode is normalized
// to regular 0644 files, with canonical link-free directories.
const fs = require("node:fs"), path = require("node:path"), zlib = require("node:zlib");
const { createHash } = require("node:crypto");
const { Readable } = require("node:stream");
const { finished } = require("node:stream/promises");
const { zipEntries, zipMemberData } = require("../numerical-computing/qualification/scipy-oracle-provisioner.cjs");
const { validateArtifactSet, verifyDownloadedArchive } = require("./artifact-set.cjs");
const { replaceDirectory, realDirectory } = require("./directory-transaction.cjs");
const { supportPaths } = require("./numerical-support.cjs");
const limits = Object.freeze({ entries: 20000, member_bytes: 2 * 1024 ** 3, expanded_bytes: 4 * 1024 ** 3 });
const gateFiles = ["full-runtime.policy.json", "full-runtime.report.json", "full-runtime.report.md", "supplemental.report.json", "release-gate.json"];
const reproductionFiles = ["sagejs-wasm.tar.gz", "sagejs-wasm.tar.gz.sha256", "reproducible-artifact.json", "reproducible-linux-arm64.json", "reproducible-darwin-arm64.json", "reproducible-toolchains.json"];
function layout(key) {
  const platform = key.match(/^native\/sagejs-(linux-x64|linux-arm64|windows-x64|macos-arm64)$/)?.[1];
  if (platform) {
    const archive = `sagejs-${platform}.${platform.startsWith("linux") ? "tar.xz" : "zip"}`;
    const required = [archive, `${archive}.sha256`, `npm/sagejs-${platform}.tgz`];
    if (platform === "linux-x64") required.push("install.sh");
    if (platform === "macos-arm64") required.push("sagejs-macos-arm64.pkg", "sagejs-macos-arm64.pkg.sha256");
    return { required, prefixes: [] };
  }
  switch (key) {
    case "native/sagejs-public-npm-root": return { required: ["build/release/npm/sagejs.tgz", "packages/flint-wasm/dist/production-manifest.json"], prefixes: ["packages/flint-wasm/dist/"] };
    case "native/numerical-release-gate": return { required: gateFiles, prefixes: [] };
    case "native/numerical-release-evidence": return {
      required: ["support/build/sea/sagejs"],
      prefixes: ["platform/", "browser/rows/", "browser/supplemental/",
        ...supportPaths.slice(1).map((name) => `support/${name}/`)],
    };
    case "browser/wasm-clean-build-a": return { required: ["build/wasm-artifact-a.json", "build/toolchain-a.json", "packages/flint-wasm/dist/production-manifest.json"], prefixes: ["packages/flint-wasm/dist/", "build/authenticated-numerical-product/"] };
    case "browser/sagejs-wasm-reproducible": return { required: reproductionFiles, prefixes: [] };
    default: throw new Error("unknown release transport layout");
  }
}
function fileView(fd, length) {
  let cache = Buffer.alloc(0), base = -1;
  function read(offset, size) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || size > 131072 || offset + size > length) throw new Error("ZIP metadata read outside bounds");
    if (base < 0 || offset < base || offset + size > base + cache.length) {
      base = offset; cache = Buffer.alloc(Math.min(length - offset, Math.max(65536, size)));
      let count = 0;
      while (count < cache.length) { const got = fs.readSync(fd, cache, count, cache.length - count, offset + count); if (!got) throw new Error("truncated ZIP metadata"); count += got; }
    }
    return cache.subarray(offset - base, offset - base + size);
  }
  return { length, readUInt16LE: (offset) => read(offset, 2).readUInt16LE(), readUInt32LE: (offset) => read(offset, 4).readUInt32LE(), subarray: (start, end) => read(start, end - start) };
}
function expectedTree(entries, policy) {
  const files = new Set(entries.filter((entry) => !entry.directory).map((entry) => entry.name));
  const directories = new Set(), fileParents = new Set(), spellings = new Map();
  for (const name of files) { const parts = name.split("/"); for (let i = 1; i < parts.length; i++) fileParents.add(parts.slice(0, i).join("/")); }
  for (const entry of entries) {
    const parts = entry.name.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join("/"), folded = prefix.toLowerCase();
      if (spellings.has(folded) && spellings.get(folded) !== prefix) throw new Error("case-colliding ZIP ancestry");
      spellings.set(folded, prefix);
      if (i < parts.length || entry.directory) directories.add(prefix);
    }
    if (entry.directory && entry.size !== 0) throw new Error("nonempty ZIP directory");
    if (!entry.directory && !policy.required.includes(entry.name) && !policy.prefixes.some((prefix) => entry.name.startsWith(prefix))) throw new Error("unexpected file in release transport layout");
  }
  if (!files.size || [...directories].some((name) => files.has(name))) throw new Error("ZIP file/directory collision or empty product");
  for (const name of directories) if (!fileParents.has(name)) throw new Error("unexpected empty ZIP directory");
  for (const name of policy.required) if (!files.has(name)) throw new Error(`missing required release member: ${name}`);
  for (const prefix of policy.prefixes) if (![...files].some((name) => name.startsWith(prefix))) throw new Error(`missing release subtree: ${prefix}`);
  return { files, directories };
}
async function digestStream(stream, signal, write) {
  const hash = createHash("sha256"); let size = 0, crc = 0;
  for await (const bytes of stream) {
    signal?.throwIfAborted(); size += bytes.length; hash.update(bytes); crc = zlib.crc32(bytes, crc);
    write?.(bytes, size);
  }
  return { size, sha256: hash.digest("hex"), crc: crc >>> 0 };
}
async function inspectOrExtract({ manifest, expectedDigest, key, filename, directory, signal, write = false }) {
  validateArtifactSet(manifest, expectedDigest);
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest ?? "")) throw new Error("authenticated manifest digest required");
  const record = manifest.artifacts.find((entry) => entry.key === key);
  if (!record) throw new Error("missing pinned artifact");
  directory = path.resolve(directory); realDirectory(directory);
  if (write && fs.readdirSync(directory).length) throw new Error("extraction destination must be empty");
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== record.sizeInBytes) throw new Error("transport ZIP is not the pinned ordinary file");
  const fd = fs.openSync(filename, "r");
  // Each stream borrows, but never owns/closes, the one descriptor. Destroying
  // an fs.ReadStream explicitly can close its fd even with autoClose:false.
  const input = (start, end) => Readable.from((async function* () {
    let offset = start;
    while (offset <= end) {
      signal?.throwIfAborted();
      const bytes = Buffer.allocUnsafe(Math.min(65536, end - offset + 1));
      const size = await new Promise((resolve, reject) => fs.read(fd, bytes, 0, bytes.length, offset,
        (error, count) => error ? reject(error) : resolve(count)));
      if (!size) throw new Error("truncated artifact ZIP");
      offset += size; yield bytes.subarray(0, size);
    }
  })());
  async function authenticateBytes() {
    const result = await digestStream(input(0, stat.size - 1), signal);
    if (result.size !== record.sizeInBytes || `sha256:${result.sha256}` !== record.archiveDigest) throw new Error("transport ZIP digest mismatch");
  }
  try {
    await authenticateBytes();
    const view = fileView(fd, stat.size), index = zipEntries(view, { limits, wheel: false });
    const tree = expectedTree(index.entries, layout(key));
    const ordered = [...index.entries].sort((a, b) => a.localOffset - b.localOffset);
    // Validate local metadata and reject overlapping members before writing.
    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i];
      if (entry.directory) continue;
      Object.assign(entry, zipMemberData(view, entry, index.centralOffset));
      if (entry.dataEnd > (ordered[i + 1]?.localOffset ?? index.centralOffset)) throw new Error("overlapping ZIP members");
    }
    if (write) {
      const expanded = index.entries.reduce((sum, entry) => sum + entry.size, 0);
      const space = fs.statfsSync(directory, { bigint: true });
      if (space.bavail * space.bsize < BigInt(expanded) + 64n * 1024n ** 2n ||
          (space.files > 0n && space.ffree < BigInt(tree.files.size + tree.directories.size + 64))) throw new Error("insufficient extraction scratch space");
      for (const name of [...tree.directories].sort((a, b) => a.split("/").length - b.split("/").length)) realDirectory(path.join(directory, name), true);
    }
    const files = [];
    for (const entry of ordered.filter((item) => !item.directory)) {
      signal?.throwIfAborted();
      const destination = path.join(directory, entry.name);
      realDirectory(path.dirname(destination));
      if (!write) { const actual = fs.lstatSync(destination); if (!actual.isFile() || actual.isSymbolicLink() || actual.nlink !== 1 || actual.size !== entry.size) throw new Error("extracted member is missing, changed or linked"); }
      const output = write ? fs.openSync(destination, "wx", 0o644) : null;
      let compressed, stream;
      try {
        // Empty stored members have no byte range. Deflate streams still carry
        // bytes for empty files and are checked normally.
        compressed = entry.compressed ? input(entry.dataOffset, entry.dataEnd - 1) : Readable.from([]);
        stream = entry.method === 8 ? compressed.pipe(zlib.createInflateRaw()) : compressed;
        if (stream !== compressed) compressed.on("error", (error) => stream.destroy(error));
        const expected = await digestStream(stream, signal, (bytes, size) => {
          if (size > entry.size) throw new Error("ZIP member exceeds declared size");
          if (write) { let offset = 0; while (offset < bytes.length) offset += fs.writeSync(output, bytes, offset, bytes.length - offset); }
        });
        if (expected.size !== entry.size || expected.crc !== entry.crc) throw new Error("ZIP member size or CRC mismatch");
        if (!write) {
          const actual = await digestStream(fs.createReadStream(destination), signal);
          if (actual.sha256 !== expected.sha256) throw new Error("extracted bytes differ from authenticated ZIP");
        }
        files.push({ path: entry.name, size: expected.size, sha256: expected.sha256 });
      } finally {
        stream?.destroy(); compressed?.destroy();
        await Promise.allSettled([stream, compressed].filter(Boolean).map((item) => finished(item, { cleanup: true })));
        if (output !== null) fs.closeSync(output);
      }
    }
    function visit(name = "") {
      for (const item of fs.readdirSync(path.join(directory, name))) {
        const relative = name ? `${name}/${item}` : item, absolute = path.join(directory, relative);
        const actual = fs.lstatSync(absolute);
        if (actual.isDirectory() && !actual.isSymbolicLink() && tree.directories.has(relative)) { realDirectory(absolute); visit(relative); }
        else if (!actual.isFile() || actual.isSymbolicLink() || !tree.files.has(relative)) throw new Error("unexpected extracted filesystem entry");
      }
    }
    visit(); await authenticateBytes(); signal?.throwIfAborted();
    return { key, archiveDigest: record.archiveDigest, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  } finally { fs.closeSync(fd); }
}
async function prepareArtifact(options) {
  options = { ...options, manifest: structuredClone(validateArtifactSet(options.manifest, options.expectedDigest)) };
  const parent = path.resolve(options.directory); realDirectory(parent);
  const record = options.manifest.artifacts.find((item) => item.key === options.key);
  if (!record) throw new Error("missing pinned artifact");
  let verified;
  async function validate(directory) {
    if (!verified) return verified = await inspectOrExtract({ ...options, directory, write: false });
    // This inventory lives only in this invocation and was derived from the
    // authenticated ZIP, never from a saved self-asserted cache receipt. Avoid
    // inflating a large bundle again at every directory-transaction checkpoint.
    const remaining = new Map(verified.files.map((file) => [file.path, file]));
    const directories = new Set();
    for (const name of remaining.keys()) { const parts = name.split("/"); for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join("/")); }
    async function walk(relative = "") {
      const absolute = path.join(directory, relative); realDirectory(absolute);
      for (const name of fs.readdirSync(absolute)) {
        const child = relative ? `${relative}/${name}` : name, filename = path.join(directory, child);
        const stat = fs.lstatSync(filename);
        if (directories.has(child) && stat.isDirectory() && !stat.isSymbolicLink()) await walk(child);
        else {
          const expected = remaining.get(child);
          if (!expected || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== expected.size) throw new Error("unexpected, changed or linked expanded member");
          const actual = await digestStream(fs.createReadStream(filename), options.signal);
          if (actual.sha256 !== expected.sha256) throw new Error("changed expanded member bytes");
          remaining.delete(child);
        }
      }
    }
    await walk();
    if (remaining.size) throw new Error("missing expanded members");
    return verified;
  }
  const result = await replaceDirectory({ parent, name: `expanded-${record.id}`,
    prepare: async (directory) => { verified = await inspectOrExtract({ ...options, directory, write: true }); },
    validate,
  });
  await verifyDownloadedArchive(options.manifest, options.expectedDigest, options.key, options.filename);
  options.signal?.throwIfAborted();
  return result;
}
module.exports = { layout, fileView, expectedTree, inspectOrExtract, prepareArtifact, limits };
