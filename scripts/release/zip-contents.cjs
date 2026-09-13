"use strict";

// Inspect ordinary release ZIPs without extracting files or executing payloads.
// Reuse the bounded metadata reader; this is content inspection, not provenance.
const fs = require("node:fs"), zlib = require("node:zlib");
const { createHash } = require("node:crypto");
const { Readable } = require("node:stream");
const { finished } = require("node:stream/promises");
const { fileView, expectedTree } = require("./extract-artifact.cjs");
const { zipEntries, zipMemberData } = require("../numerical-computing/qualification/scipy-oracle-provisioner.cjs");
const limits = Object.freeze({ entries: 10000, member_bytes: 2 * 1024 ** 3, expanded_bytes: 2 * 1024 ** 3 });

function checkExtras(view, start, length, local) {
  // Do not let an extractor use an alternate Unicode pathname, link/ACL or
  // ZIP64 layout that this reader did not inspect. The actual ditto producer
  // uses only original Info-ZIP Unix timestamps/IDs (0x5855); Windows uses none.
  // Field IDs: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT §4.6.
  const end = start + length, seen = new Set();
  while (start < end) {
    if (end - start < 4) throw new Error("truncated ZIP extra field");
    const kind = view.readUInt16LE(start), size = view.readUInt16LE(start + 2);
    if (start + 4 + size > end || seen.has(kind) || kind !== 0x5855 || size !== (local ? 12 : 8)) throw new Error("unsupported or ambiguous ZIP extra field");
    seen.add(kind); start += 4 + size;
  }
}

async function inspectZipContents(filename, requiredPaths, { signal } = {}) {
  signal?.throwIfAborted();
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 22 || stat.size > 2 * 1024 ** 3) throw new Error("ZIP input is not an ordinary bounded file");
  const fd = fs.openSync(filename, "r");
  const input = (start, end) => Readable.from((async function* () {
    for (let offset = start; offset < end;) {
      signal?.throwIfAborted();
      const bytes = Buffer.allocUnsafe(Math.min(65536, end - offset));
      const count = await new Promise((resolve, reject) => fs.read(fd, bytes, 0, bytes.length, offset,
        (error, size) => error ? reject(error) : resolve(size)));
      if (!count) throw new Error("truncated ZIP content");
      offset += count; yield bytes.subarray(0, count);
    }
  })());
  try {
    const view = fileView(fd, stat.size), index = zipEntries(view, { limits, wheel: false });
    expectedTree(index.entries, { required: requiredPaths, prefixes: [] });
    let central = index.centralOffset;
    for (const entry of index.entries) {
      const name = view.readUInt16LE(central + 28), extra = view.readUInt16LE(central + 30), comment = view.readUInt16LE(central + 32);
      checkExtras(view, central + 46 + name, extra, false);
      central += 46 + name + extra + comment;
    }
    const ordered = [...index.entries].sort((a, b) => a.localOffset - b.localOffset);
    if (ordered[0].localOffset !== 0) throw new Error("ZIP has an unexpected preamble");
    // Both local and central readers must see the same complete set of files.
    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i], next = ordered[i + 1]?.localOffset ?? index.centralOffset;
      if (entry.rawMode & 0o7000) throw new Error("ZIP has special permission bits");
      const local = zipMemberData(view, { ...entry, name: entry.directory ? `${entry.name}/` : entry.name }, index.centralOffset);
      Object.assign(entry, local);
      checkExtras(view, entry.localOffset + 30 + view.readUInt16LE(entry.localOffset + 26), view.readUInt16LE(entry.localOffset + 28), true);
      let end = entry.dataEnd;
      if (entry.flags & 8) {
        for (const [offset, value] of [[14, entry.crc], [18, entry.compressed], [22, entry.size]]) {
          const recorded = view.readUInt32LE(entry.localOffset + offset);
          if (recorded !== 0 && recorded !== value) throw new Error("ZIP streaming local record differs from central record");
        }
        // Ordinary 32-bit descriptors, with or without the optional signature.
        const descriptor = next - end;
        if (![12, 16].includes(descriptor) || (descriptor === 16 && view.readUInt32LE(end) !== 0x08074b50)) throw new Error("ZIP data descriptor is missing or ambiguous");
        const offset = end + descriptor - 12;
        if (view.readUInt32LE(offset) !== entry.crc || view.readUInt32LE(offset + 4) !== entry.compressed || view.readUInt32LE(offset + 8) !== entry.size) throw new Error("ZIP data descriptor differs from central record");
        end += descriptor;
      } else if (view.readUInt32LE(entry.localOffset + 14) !== entry.crc ||
        view.readUInt32LE(entry.localOffset + 18) !== entry.compressed || view.readUInt32LE(entry.localOffset + 22) !== entry.size) {
        throw new Error("ZIP local size or CRC differs from central record");
      }
      if (end !== next) throw new Error("ZIP contains overlapping or unlisted local data");
      if (entry.method === 0 && entry.compressed !== entry.size) throw new Error("stored ZIP member has inconsistent lengths");
    }
    const files = [];
    for (const entry of ordered) {
      signal?.throwIfAborted();
      const compressed = input(entry.dataOffset, entry.dataEnd);
      const stream = entry.method === 8 ? compressed.pipe(zlib.createInflateRaw()) : compressed;
      if (stream !== compressed) compressed.on("error", (error) => stream.destroy(error));
      const abort = () => { compressed.destroy(signal.reason); stream.destroy(signal.reason); };
      signal?.addEventListener("abort", abort, { once: true });
      const hash = createHash("sha256"); let size = 0, crc = 0;
      try {
        for await (const bytes of stream) {
          signal?.throwIfAborted(); size += bytes.length;
          if (size > entry.size) throw new Error("ZIP content exceeds declared size");
          crc = zlib.crc32(bytes, crc); hash.update(bytes);
        }
        if (size !== entry.size || (crc >>> 0) !== entry.crc || (entry.method === 8 && stream.bytesWritten !== entry.compressed)) throw new Error("ZIP content size, CRC or compressed length mismatch");
        if (!entry.directory) files.push({ path: entry.name, size, sha256: hash.digest("hex"), mode: entry.rawMode & 0o777 });
      } finally {
        signal?.removeEventListener("abort", abort);
        compressed.destroy(); stream.destroy();
        await Promise.allSettled([compressed, stream].map((item) => finished(item, { cleanup: true })));
      }
    }
    return { files: files.sort((a, b) => a.path.localeCompare(b.path)), expandedFileBytes: files.reduce((sum, file) => sum + file.size, 0) };
  } finally { fs.closeSync(fd); }
}
module.exports = { inspectZipContents };
