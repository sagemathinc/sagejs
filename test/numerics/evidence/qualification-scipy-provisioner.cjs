#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const {
  extractPythonArchive,
  extractWheel,
} = require("../../../scripts/numerical-computing/qualification/scipy-oracle-provisioner.cjs");

function octal(value, bytes) {
  return Buffer.from(`${value.toString(8).padStart(bytes - 1, "0")}\0`, "ascii");
}

function tarHeader({ name, type = "0", contents = Buffer.alloc(0), link = "", mode = 0o644 }) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  octal(mode, 8).copy(header, 100);
  octal(0, 8).copy(header, 108);
  octal(0, 8).copy(header, 116);
  octal(contents.length, 12).copy(header, 124);
  octal(0, 12).copy(header, 136);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  header.write(link, 157, 100, "utf8");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  octal(checksum, 8).copy(header, 148);
  return header;
}

function tarGzip(entries) {
  const buffers = [];
  for (const entry of entries) {
    const contents = Buffer.from(entry.contents ?? "");
    buffers.push(tarHeader({ ...entry, contents }), contents);
    const padding = (512 - (contents.length % 512)) % 512;
    if (padding !== 0) buffers.push(Buffer.alloc(padding));
  }
  buffers.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(buffers));
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const contents = Buffer.from(entry.contents ?? "");
    const compressed = zlib.deflateRawSync(contents);
    const crc = zlib.crc32(contents) >>> 0;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(contents.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, eocd]);
}

function record(name, contents) {
  return `${name},sha256=${crypto.createHash("sha256").update(contents).digest("base64url")},${contents.length}`;
}

function wheel({ dataMember = false, badRecord = false } = {}) {
  const moduleName = dataMember ? "example-1.data/purelib/example.py" : "example/__init__.py";
  const moduleContents = Buffer.from("value = 1\n");
  const recordName = "example-1.dist-info/RECORD";
  const digestRow = badRecord
    ? `${moduleName},sha256=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,${moduleContents.length}`
    : record(moduleName, moduleContents);
  const recordContents = Buffer.from(`${digestRow}\n${recordName},,\n`);
  return zip([
    { name: moduleName, contents: moduleContents },
    { name: recordName, contents: recordContents },
  ]);
}

test("tar provisioner materializes internal links and prunes terminfo", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-scipy-tar-"));
  const archive = `${root}.tar.gz`;
  try {
    fs.writeFileSync(archive, tarGzip([
      { name: "python/bin/python3.14", contents: "runtime", mode: 0o755 },
      { name: "python/bin/python3", type: "2", link: "python3.14" },
      { name: "python/share/terminfo/A/alias", contents: "pruned" },
    ]));
    await extractPythonArchive(archive, root);
    const executable = path.join(root, "bin", "python3.14");
    const alias = path.join(root, "bin", "python3");
    assert.equal(fs.readFileSync(alias, "utf8"), "runtime");
    assert.equal(fs.lstatSync(alias).isSymbolicLink(), false);
    assert.equal(fs.lstatSync(executable).nlink, 1);
    assert.equal(fs.lstatSync(alias).nlink, 1);
    assert.equal(fs.existsSync(path.join(root, "share", "terminfo")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(archive, { force: true });
  }
});

test("tar provisioner rejects traversal and hardlink members", async () => {
  for (const [name, entry, pattern] of [[
    "traversal", { name: "python/../../escape", contents: "bad" }, /nonportable path component/,
  ], [
    "hardlink", { name: "python/bin/python", type: "1", link: "python/bin/python3" },
    /hardlink members are forbidden/,
  ]]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `sagejs-scipy-${name}-`));
    const archive = `${root}.tar.gz`;
    try {
      fs.writeFileSync(archive, tarGzip([entry]));
      await assert.rejects(extractPythonArchive(archive, root), pattern);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archive, { force: true });
    }
  }
});

test("wheel provisioner verifies RECORD and direct-unpacks regular members", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-scipy-wheel-"));
  const archive = `${root}.whl`;
  try {
    fs.writeFileSync(archive, wheel());
    extractWheel(archive, root);
    assert.equal(fs.readFileSync(path.join(root, "example", "__init__.py"), "utf8"), "value = 1\n");
    assert.equal(fs.lstatSync(path.join(root, "example", "__init__.py")).nlink, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(archive, { force: true });
  }
});

test("wheel provisioner rejects .data members and forged RECORD hashes", () => {
  for (const [name, bytes, pattern] of [[
    "data", wheel({ dataMember: true }), /\.data member/,
  ], [
    "record", wheel({ badRecord: true }), /RECORD authentication failed/,
  ]]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `sagejs-scipy-wheel-${name}-`));
    const archive = `${root}.whl`;
    try {
      fs.writeFileSync(archive, bytes);
      assert.throws(() => extractWheel(archive, root), pattern);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archive, { force: true });
    }
  }
});
