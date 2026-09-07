#!/usr/bin/env node
"use strict";

const { createReadStream } = require("node:fs");
const { createHash } = require("node:crypto");
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
  const match = /^[ ]*([0-7]*)[\0 ]*$/.exec(field.toString("latin1"));
  if (!match) {
    throw new Error(`${label} is not an octal integer`);
  }
  const value = match[1];
  if (value === "") return 0;
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

function normalizedMemberPath(rawPath, type, root) {
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
  if (components[0] !== root) {
    throw new Error(`tar member is outside ${root}/: ${rawPath}`);
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

function memberName(header, gnu) {
  const name = decodeField(header, 0, 100, "tar member name");
  // GNU stores timestamps/sparse metadata where POSIX stores a path prefix.
  // Never interpret those bytes as a USTAR prefix.
  if (gnu) return name;
  const prefix = decodeField(header, 345, 155, "tar member prefix");
  return prefix ? `${prefix}/${name}` : name;
}

async function inspectArchive(filename, { browser = false, signal } = {}) {
  signal?.throwIfAborted();
  const source = createReadStream(filename, { signal });
  const stream = createGunzip();
  source.once("error", (error) => stream.destroy(error));
  source.pipe(stream);
  const members = [];
  const collisionKeys = new Set();
  const memberTypes = new Map();
  const ancestorKeys = new Set();
  let buffered = Buffer.alloc(0);
  let skip = 0;
  let uncompressedBytes = 0;
  let zeroBlocks = 0;
  let ended = false;
  let payloadRemaining = 0;
  let payloadHash;

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

    const ustar = header.subarray(257, 265).equals(Buffer.from("ustar\0" + "00", "ascii"));
    const gnu = browser && header.subarray(257, 265).equals(Buffer.from("ustar  \0", "ascii"));
    if (!ustar && !gnu) {
      // In particular, a V7 header does not define the ustar prefix field.
      // Interpreting it here while the downstream extractor ignores it would
      // let validation and extraction disagree about a member's path.
      throw new Error("tar member does not use the supported ustar/00 dialect");
    }
    // The release producer currently writes ordinary GNU tar entries. Long
    // names, PAX headers and sparse layouts are deliberately unsupported, not
    // silently normalized. npm retains its original USTAR-only contract.
    if (gnu && header.subarray(369).some((byte) => byte !== 0)) {
      throw new Error("GNU tar member has unsupported extended metadata");
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
    if (size > MAX_UNCOMPRESSED_BYTES) throw new Error("tar member size exceeds expansion limit");
    if (type === "directory" && size !== 0) {
      throw new Error("tar directory member has nonzero content");
    }
    const linkName = decodeField(header, 157, 100, "tar link name");
    if (linkName !== "") {
      throw new Error("tar regular member has an unexpected link target");
    }

    if (browser && (parseOctal(header, 100, 8, "tar member mode") & 0o7000)) {
      throw new Error("browser tar member has forbidden special permission bits");
    }
    const path = normalizedMemberPath(memberName(header, gnu), type, browser ? "dist" : "package");
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
    payloadRemaining = size;
    if (browser && type === "file") {
      payloadHash = createHash("sha256");
      if (size === 0) { members.at(-1).sha256 = payloadHash.digest("hex"); payloadHash = undefined; }
    }
  }

  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted();
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
          const dataBytes = Math.min(payloadRemaining, consumed);
          payloadHash?.update(chunk.subarray(offset, offset + dataBytes));
          payloadRemaining -= dataBytes;
          if (payloadHash && payloadRemaining === 0) {
            members.at(-1).sha256 = payloadHash.digest("hex"); payloadHash = undefined;
          }
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
      schema: browser ? "sagejs.browser-archive-validation/v1" : "sagejs.package-archive-validation/v1",
      uncompressed_bytes: uncompressedBytes,
    };
  } finally { source.destroy(); stream.destroy(); }
}

// Separate entry points make the accepted root/dialect/hash policy explicit.
function validateArchive(filename) { return inspectArchive(filename); }
function validateBrowserArchive(filename, { signal } = {}) { return inspectArchive(filename, { browser: true, signal }); }

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

module.exports = { validateArchive, validateBrowserArchive };
