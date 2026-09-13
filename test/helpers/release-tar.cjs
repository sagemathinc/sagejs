"use strict";

// Minimal tar fixtures. No host tar executable or extraction is needed.
const { gzipSync } = require("node:zlib");
function octal(header, offset, length, value) { header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length); }
function seal(header) {
  header.fill(32, 148, 156);
  header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148, 8);
  return header;
}
function entry({ name, data = "", type = "0", gnu = true, prefix = "", link = "", mutate }) {
  const bytes = Buffer.from(data), header = Buffer.alloc(512);
  if (Buffer.byteLength(name) >= 100 || Buffer.byteLength(prefix) >= 155) throw new Error("fixture tar path too long");
  header.write(name, 0, 100); octal(header, 100, 8, type === "5" ? 0o755 : 0o644);
  octal(header, 108, 8, 0); octal(header, 116, 8, 0); octal(header, 124, 12, bytes.length); octal(header, 136, 12, 0);
  header.write(type, 156, 1); header.write(link, 157, 100);
  header.write(gnu ? "ustar  \0" : "ustar\0" + "00", 257, 8);
  header.write(prefix, 345, 155); mutate?.(header); seal(header);
  return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]);
}
function tar(entries) { return Buffer.concat([...entries.map((value) => Buffer.isBuffer(value) ? value : entry(value)), Buffer.alloc(1024)]); }
function tarGzip(entries) { return gzipSync(tar(entries)); }
module.exports = { tarGzip, tar, entry, seal };
