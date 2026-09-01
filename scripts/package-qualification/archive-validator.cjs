#!/usr/bin/env node
"use strict";

const { createReadStream } = require("node:fs");
const { basename } = require("node:path");
const { TextDecoder } = require("node:util");
const { createGunzip } = require("node:zlib");

const BLOCK_SIZE = 512;
const MAX_ENTRIES = 100_000;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });

function decodeField(header, start, length, label) {
  const field = header.subarray(start, start + length);
  const end = field.indexOf(0);
  const content = end < 0 ? field : field.subarray(0, end);
  try {
    return utf8.decode(content);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error.message}`);
  }
}

function parseOctal(header, start, length, label) {
  const field = header.subarray(start, start + length);
  if ((field[0] & 0x80) !== 0) {
    throw new Error(`${label} uses unsupported base-256 encoding`);
  }
  const value = field.toString("ascii").replaceAll("\0", "").trim();
  if (value === "") return 0;
  if (!/^[0-7]+$/.test(value)) {
    throw new Error(`${label} is not an octal integer`);
  }
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} is outside the supported integer range`);
  }
  return parsed;
}

function verifyChecksum(header) {
  const expected = parseOctal(header, 148, 8, "tar checksum");
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : header[index];
  }
  if (actual !== expected) {
    throw new Error(`tar header checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

function normalizedMemberPath(rawPath, type) {
  if (/[^\x20-\x7e]/.test(rawPath)) {
    // JavaScript lowercasing is not a faithful model of either APFS/HFS+
    // filesystem folding or NTFS case folding (for example Σ/ς and ß/SS).
    // Published Sage.js paths are ASCII, so reject the ambiguous surface.
    throw new Error(`tar member path is not portable ASCII: ${rawPath}`);
  }
  if (rawPath.includes("\\")) {
    throw new Error(`tar member uses a backslash path separator: ${rawPath}`);
  }
  if (rawPath.startsWith("/") || /^[A-Za-z]:/.test(rawPath)) {
    throw new Error(`tar member has an absolute path: ${rawPath}`);
  }

  let candidate = rawPath;
  if (type === "directory" && candidate.endsWith("/")) {
    candidate = candidate.slice(0, -1);
  }
  const components = candidate.split("/");
  if (
    candidate === "" ||
    components.some(
      (component) => component === "" || component === "." || component === "..",
    )
  ) {
    throw new Error(`tar member has a non-canonical path: ${rawPath}`);
  }
  if (components[0] !== "package") {
    throw new Error(`tar member is outside package/: ${rawPath}`);
  }
  if (components.length === 1 && type !== "directory") {
    throw new Error(`tar member package root is not a directory: ${rawPath}`);
  }

  for (const component of components) {
    if (
      /[<>:"|?*\x00-\x1f]/.test(component) ||
      component.endsWith(".") ||
      component.endsWith(" ")
    ) {
      throw new Error(`tar member is not portable to Windows: ${rawPath}`);
    }
    const basename = component.split(".", 1)[0].toUpperCase();
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(basename)) {
      throw new Error(`tar member uses a reserved Windows name: ${rawPath}`);
    }
  }
  return components.join("/").normalize("NFC");
}

function memberName(header) {
  const name = decodeField(header, 0, 100, "tar member name");
  const prefix = decodeField(header, 345, 155, "tar member prefix");
  return prefix ? `${prefix}/${name}` : name;
}

async function validateArchive(filename) {
  const stream = createReadStream(filename).pipe(createGunzip());
  const members = [];
  const collisionKeys = new Set();
  const memberTypes = new Map();
  const ancestorKeys = new Set();
  let buffered = Buffer.alloc(0);
  let skip = 0;
  let uncompressedBytes = 0;
  let zeroBlocks = 0;
  let ended = false;

  function processHeader(header) {
    const zero = header.every((byte) => byte === 0);
    if (zero) {
      zeroBlocks += 1;
      if (zeroBlocks >= 2) ended = true;
      return;
    }
    if (zeroBlocks > 0) {
      throw new Error("tar archive contains a nonzero block after its end marker");
    }
    if (ended) throw new Error("tar archive contains data after its end marker");
    zeroBlocks = 0;
    verifyChecksum(header);

    if (
      !header.subarray(257, 263).equals(Buffer.from("ustar\0", "ascii")) ||
      !header.subarray(263, 265).equals(Buffer.from("00", "ascii"))
    ) {
      // In particular, a V7 header does not define the ustar prefix field.
      // Interpreting it here while the downstream extractor ignores it would
      // let validation and extraction disagree about a member's path.
      throw new Error("tar member does not use the supported ustar/00 dialect");
    }

    const typeFlag = header[156];
    const type = typeFlag === 0 || typeFlag === 48
      ? "file"
      : typeFlag === 53
        ? "directory"
        : null;
    if (!type) {
      const shown = typeFlag === 0 ? "NUL" : String.fromCharCode(typeFlag);
      throw new Error(`tar member has forbidden type ${JSON.stringify(shown)}`);
    }
    const size = parseOctal(header, 124, 12, "tar member size");
    if (type === "directory" && size !== 0) {
      throw new Error("tar directory member has nonzero content");
    }
    const linkName = decodeField(header, 157, 100, "tar link name");
    if (linkName !== "") {
      throw new Error("tar regular member has an unexpected link target");
    }

    const path = normalizedMemberPath(memberName(header), type);
    const collisionKey = path.toLowerCase();
    if (collisionKeys.has(collisionKey)) {
      throw new Error(`tar archive has a duplicate normalized path: ${path}`);
    }
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const ancestor = parts.slice(0, index).join("/").toLowerCase();
      if (memberTypes.get(ancestor) === "file") {
        throw new Error(`tar member descends from a regular file: ${path}`);
      }
      ancestorKeys.add(ancestor);
    }
    if (type === "file" && ancestorKeys.has(collisionKey)) {
      throw new Error(`tar regular member replaces an existing directory: ${path}`);
    }

    collisionKeys.add(collisionKey);
    memberTypes.set(collisionKey, type);
    members.push({ path, size, type });
    if (members.length > MAX_ENTRIES) {
      throw new Error(`tar archive exceeds ${MAX_ENTRIES} members`);
    }
    skip = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }

  for await (const chunk of stream) {
    uncompressedBytes += chunk.length;
    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        `tar archive exceeds ${MAX_UNCOMPRESSED_BYTES} uncompressed bytes`,
      );
    }
    let offset = 0;
    while (offset < chunk.length) {
      if (skip > 0) {
        const consumed = Math.min(skip, chunk.length - offset);
        skip -= consumed;
        offset += consumed;
        continue;
      }
      if (buffered.length > 0) {
        const needed = BLOCK_SIZE - buffered.length;
        const consumed = Math.min(needed, chunk.length - offset);
        buffered = Buffer.concat([
          buffered,
          chunk.subarray(offset, offset + consumed),
        ]);
        offset += consumed;
        if (buffered.length === BLOCK_SIZE) {
          processHeader(buffered);
          buffered = Buffer.alloc(0);
        }
        continue;
      }
      if (chunk.length - offset >= BLOCK_SIZE) {
        processHeader(chunk.subarray(offset, offset + BLOCK_SIZE));
        offset += BLOCK_SIZE;
      } else {
        buffered = Buffer.from(chunk.subarray(offset));
        offset = chunk.length;
      }
    }
  }

  if (skip !== 0 || buffered.length !== 0) {
    throw new Error("tar archive is truncated");
  }
  if (!ended) throw new Error("tar archive lacks two zero end blocks");
  return {
    archive: basename(filename),
    members,
    schema: "sagejs.package-archive-validation/v1",
    uncompressed_bytes: uncompressedBytes,
  };
}

async function main() {
  if (process.argv.length !== 3) {
    console.error("usage: archive-validator.cjs ARCHIVE.tgz");
    process.exitCode = 2;
    return;
  }
  try {
    process.stdout.write(`${JSON.stringify(await validateArchive(process.argv[2]))}\n`);
  } catch (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = { validateArchive };
