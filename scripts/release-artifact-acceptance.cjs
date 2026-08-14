#!/usr/bin/env node
"use strict";

// Final-host acceptance for a packaged Sage.js release. This deliberately
// runs after archive construction (and, on macOS, after signing/notarization),
// so publication is gated by the bytes users will actually download.

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, join, relative, resolve, sep } = require("node:path");
const { unzipSync } = require("fflate");

const {
  canonicalJson,
  readBuildManifest,
  serialize,
} = require("./release-manifest.cjs");
const { compareVersions } = require("./release-native-binary-inspector.cjs");

const RECEIPT_SCHEMA = "sagejs.release-artifact-acceptance-v1";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const APPLE_TEAM_ID = "BVF94G2MB4";
const MAXIMUM_ZIP_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const RUST_TOOLCHAIN_AUTHORITIES = Object.freeze({
  "linux-arm64": Object.freeze({
    filename: "rust-1.86.0-aarch64-unknown-linux-gnu.tar.xz",
    sha256: "2b97d1e09a1d7fdbed748332879318ee7f41c008837f87ccb44ec045df0a8a1b",
    target: "aarch64-unknown-linux-gnu",
    url: "https://static.rust-lang.org/dist/2025-04-03/" +
      "rust-1.86.0-aarch64-unknown-linux-gnu.tar.xz",
    version: "1.86.0",
  }),
  "linux-x64": Object.freeze({
    filename: "rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
    sha256: "6b448b3669e0c74f7f4b87da7da4868a552fcbba1f955032d8925ad2fffb3798",
    target: "x86_64-unknown-linux-gnu",
    url: "https://static.rust-lang.org/dist/2025-04-03/" +
      "rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
    version: "1.86.0",
  }),
});
const TARGETS = Object.freeze({
  "linux-x64": {
    arch: "x64",
    archiveExtension: ".tar.xz",
    executableNames: ["sagejs", "sagepython"],
    format: "elf",
    metadataNames: ["linux-baseline-receipt.json"],
    platform: "linux",
  },
  "linux-arm64": {
    arch: "arm64",
    archiveExtension: ".tar.xz",
    executableNames: ["sagejs", "sagepython"],
    format: "elf",
    metadataNames: ["linux-baseline-receipt.json"],
    platform: "linux",
  },
  "macos-arm64": {
    arch: "arm64",
    archiveExtension: ".zip",
    executableNames: ["sagejs", "sagepython"],
    format: "macho",
    metadataNames: [],
    platform: "darwin",
  },
  "windows-x64": {
    arch: "x64",
    archiveExtension: ".zip",
    executableNames: ["sagejs.exe", "sagepython.exe"],
    format: "pe",
    metadataNames: ["UNSIGNED-WINDOWS.txt", "release.json"],
    platform: "win32",
  },
});

const LINUX_DEPENDENCIES = new Set([
  "ld-linux-aarch64.so.1",
  "ld-linux-x86-64.so.2",
  "libc.so.6",
  "libdl.so.2",
  "libgcc_s.so.1",
  "libm.so.6",
  "libpthread.so.0",
  "librt.so.1",
  "libstdc++.so.6",
]);

// Known Windows system imports. Runtime redistributables such as vcruntime,
// msvcp, libgcc and libstdc++ are intentionally absent.
const WINDOWS_SYSTEM_DEPENDENCIES = new Set([
  "ADVAPI32.DLL", "BCRYPT.DLL", "CABINET.DLL", "CRYPT32.DLL",
  "DBGHELP.DLL", "DNSAPI.DLL", "GDI32.DLL", "IPHLPAPI.DLL",
  "KERNEL32.DLL", "KERNELBASE.DLL", "MSVCRT.DLL", "NTDLL.DLL",
  "OLE32.DLL", "OLEAUT32.DLL", "POWRPROF.DLL", "PSAPI.DLL",
  "RPCRT4.DLL", "SECUR32.DLL", "SHELL32.DLL", "SHLWAPI.DLL",
  "USER32.DLL", "USERENV.DLL", "VERSION.DLL", "WINHTTP.DLL",
  "WINMM.DLL", "WS2_32.DLL", "WTSAPI32.DLL",
]);

const REQUIRED_THIRD_PARTY_IDS = Object.freeze([
  "cortex-compute-engine", "cpython-path-modules", "fflas-ffpack", "fflate", "ffpoly", "flint",
  "givaro", "gmp", "igraph", "libsodium", "libzmq", "m4ri", "mpc", "mpfr",
  "mpmath", "node", "node-rust-crates", "npm-production-closure", "numpy-ts", "odlyzko-zeta-data",
  "openblas", "playwright-core",
  "plotly.js", "pyjeon-standard-library", "pylang-lineage", "rust-toolchain", "smalljac",
  "tree-sitter-macaulay2",
  "tree-sitter-magma", "tree-sitter-matlab", "tree-sitter-python",
  "tree-sitter-sage", "tree-sitter-wolfram", "unicode-namealiases-data", "web-tree-sitter",
  "zeromq.js",
]);

function sha256File(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runChecked(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${options.label || command} failed (${result.status}): ` +
      `${result.stderr || result.stdout || result.signal || "no output"}`,
    );
  }
  return result;
}

function parseArguments(arguments_) {
  const values = { signature: undefined };
  const flagNames = new Set([]);
  const valueNames = new Set([
    "archive",
    "benchmark",
    "benchmark-checksum",
    "checksum",
    "expected-commit",
    "expected-version",
    "maximum-glibc",
    "maximum-macos",
    "output",
    "package",
    "package-checksum",
    "signature",
    "target",
  ]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const token = arguments_[index];
    if (token === "--help" || token === "-h") return { help: true };
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const name = token.slice(2);
    if (flagNames.has(name)) values[name] = true;
    else if (valueNames.has(name)) {
      if (values[name] !== undefined) throw new Error(`duplicate option ${token}`);
      const value = arguments_[++index];
      if (!value || value.startsWith("--")) throw new Error(`missing value for ${token}`);
      values[name] = value;
    } else throw new Error(`unknown option ${token}`);
  }
  for (const name of [
    "archive",
    "checksum",
    "expected-commit",
    "expected-version",
    "output",
    "signature",
    "target",
  ]) {
    if (!values[name]) throw new Error(`missing --${name}`);
  }
  if (!TARGETS[values.target]) throw new Error(`unsupported target ${values.target}`);
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(values["expected-commit"])) {
    throw new Error("--expected-commit must be a full Git object id");
  }
  if (TARGETS[values.target].platform === "linux" && !values["maximum-glibc"]) {
    throw new Error("Linux acceptance requires --maximum-glibc");
  }
  if (TARGETS[values.target].platform === "darwin" && !values["maximum-macos"]) {
    throw new Error("macOS acceptance requires --maximum-macos");
  }
  if (values.signature === "apple-developer-id") {
    if (TARGETS[values.target].platform !== "darwin") {
      throw new Error("apple-developer-id is valid only for macOS");
    }
    if (!values.package || !values["package-checksum"]) {
      throw new Error("signed macOS acceptance requires --package and --package-checksum");
    }
    if (!values.benchmark || !values["benchmark-checksum"]) {
      throw new Error("signed macOS acceptance requires --benchmark and --benchmark-checksum");
    }
  } else if (values.signature === "unsigned") {
    if (TARGETS[values.target].platform === "darwin") {
      throw new Error("a publishable macOS artifact must be Developer ID signed");
    }
  } else throw new Error(`unsupported signature policy ${values.signature}`);
  return values;
}

function usage() {
  return [
    "Usage: node scripts/release-artifact-acceptance.cjs",
    "  --target linux-x64|linux-arm64|macos-arm64|windows-x64",
    "  --archive FILE --checksum FILE --output FILE",
    "  --expected-version VERSION --expected-commit FULL_SHA",
    "  --signature unsigned|apple-developer-id",
    "  [--maximum-glibc VERSION] [--maximum-macos VERSION]",
    "  [--package FILE --package-checksum FILE]",
    "  [--benchmark FILE --benchmark-checksum FILE]",
  ].join("\n");
}

function verifyChecksum(filename, checksumFilename) {
  const line = readFileSync(checksumFilename, "utf8");
  const match = line.match(/^([0-9a-f]{64})  ([^\r\n]+)\r?\n?$/);
  if (!match) throw new Error(`invalid SHA-256 sidecar ${checksumFilename}`);
  if (match[2] !== basename(filename)) {
    throw new Error(`checksum names ${match[2]}, expected ${basename(filename)}`);
  }
  const actual = sha256File(filename);
  if (actual !== match[1]) throw new Error(`SHA-256 mismatch for ${filename}`);
  return actual;
}

function validateArchiveMember(name, expectedRoot) {
  if (
    typeof name !== "string" ||
    !name ||
    name.includes("\\") ||
    /^[A-Za-z]:/.test(name) ||
    name.startsWith("/") ||
    /[\x00-\x20\x7f]/.test(name)
  ) throw new Error(`unsafe archive member ${JSON.stringify(name)}`);
  const normalized = name.endsWith("/") ? name.slice(0, -1) : name;
  const parts = normalized.split("/");
  if (!normalized || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`unsafe archive member ${JSON.stringify(name)}`);
  }
  if (normalized !== expectedRoot && !normalized.startsWith(`${expectedRoot}/`)) {
    throw new Error(`archive member escapes ${expectedRoot}: ${name}`);
  }
  return normalized;
}

function validateArchiveMembers(entries, expectedRoot) {
  if (entries.length === 0) throw new Error("archive has no members");
  const seen = new Set();
  for (const entry of entries) {
    const name = validateArchiveMember(entry.name, expectedRoot);
    if (seen.has(name)) throw new Error(`duplicate archive member ${name}`);
    seen.add(name);
    if (!entry.regular && !entry.directory) {
      throw new Error(`archive contains a link or special entry: ${name}`);
    }
  }
  return [...seen].sort();
}

function validateZipExtra(bytes, start, length, name, location) {
  const end = start + length;
  let offset = start;
  const seen = new Set();
  while (offset < end) {
    if (offset + 4 > end) throw new Error(`truncated ZIP extra field for ${name}`);
    const identifier = bytes.readUInt16LE(offset);
    const size = bytes.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > end) throw new Error(`truncated ZIP extra field for ${name}`);
    if (seen.has(identifier)) throw new Error(`duplicate ZIP extra field for ${name}`);
    seen.add(identifier);
    // macOS ditto emits the legacy Info-ZIP Unix timestamp/uid field with an
    // eight-byte central payload and a twelve-byte local payload. It carries
    // no path, file type, link target, or size override. No other extra-field
    // semantics are part of the reviewed release producer contract.
    const reviewedDittoUnix = identifier === 0x5855 &&
      size === (location === "central" ? 8 : 12);
    if (!reviewedDittoUnix) throw new Error(`unsupported ZIP extra field for ${name}`);
    offset += size;
  }
}

function zipArchiveMembers(filename) {
  const bytes = readFileSync(filename);
  let eocd = -1;
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("ZIP archive has no end-of-central-directory record");
  const disk = bytes.readUInt16LE(eocd + 4);
  const directoryDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const entries = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  const commentLength = bytes.readUInt16LE(eocd + 20);
  if (
    disk !== 0 || directoryDisk !== 0 || diskEntries !== entries ||
    entries === 0xffff || directoryOffset === 0xffffffff ||
    directorySize === 0xffffffff || directoryOffset + directorySize !== eocd ||
    eocd + 22 + commentLength !== bytes.length
  ) throw new Error("multi-disk or ZIP64 release archives are not supported");
  const members = [];
  const localRanges = [];
  let offset = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("invalid ZIP central directory");
    }
    const madeBy = bytes.readUInt16LE(offset + 4);
    const flags = bytes.readUInt16LE(offset + 8);
    const compression = bytes.readUInt16LE(offset + 10);
    const crc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const memberDisk = bytes.readUInt16LE(offset + 34);
    const external = bytes.readUInt32LE(offset + 38);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    if (
      end > bytes.length ||
      memberDisk !== 0 ||
      ![0, 0x8].includes(flags) ||
      ![0, 8].includes(compression) ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff ||
      [...nameBytes].some((byte) => byte > 0x7f)
    ) {
      throw new Error("truncated, encrypted, streamed, ZIP64, or non-ASCII ZIP member");
    }
    const name = nameBytes.toString("ascii");
    validateZipExtra(bytes, offset + 46 + nameLength, extraLength, name, "central");
    if (
      localOffset + 30 > directoryOffset ||
      bytes.readUInt32LE(localOffset) !== 0x04034b50
    ) throw new Error(`invalid local ZIP header for ${name}`);
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localCompression = bytes.readUInt16LE(localOffset + 8);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressedSize = bytes.readUInt32LE(localOffset + 18);
    const localUncompressedSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    const streamed = (flags & 0x8) !== 0;
    let recordEnd = dataEnd;
    if (streamed) {
      if (
        localCrc !== 0 || localCompressedSize !== 0 || localUncompressedSize !== 0 ||
        dataEnd + 16 > directoryOffset ||
        bytes.readUInt32LE(dataEnd) !== 0x08074b50 ||
        bytes.readUInt32LE(dataEnd + 4) !== crc ||
        bytes.readUInt32LE(dataEnd + 8) !== compressedSize ||
        bytes.readUInt32LE(dataEnd + 12) !== uncompressedSize
      ) throw new Error(`invalid streamed ZIP descriptor for ${name}`);
      recordEnd += 16;
    }
    validateZipExtra(
      bytes,
      localNameStart + localNameLength,
      localExtraLength,
      name,
      "local",
    );
    if (
      localFlags !== flags ||
      localCompression !== compression ||
      (!streamed && localCrc !== crc) ||
      (!streamed && localCompressedSize !== compressedSize) ||
      (!streamed && localUncompressedSize !== uncompressedSize) ||
      localNameLength !== nameLength ||
      dataEnd > directoryOffset ||
      !bytes.subarray(localNameStart, localNameStart + localNameLength).equals(nameBytes)
    ) throw new Error(`local/central ZIP metadata mismatch for ${name}`);
    localRanges.push({ end: recordEnd, start: localOffset });
    const unixMode = (madeBy >> 8) === 3 ? external >>> 16 : 0;
    const fileType = unixMode & 0xf000;
    const directory = name.endsWith("/") || fileType === 0x4000 ||
      ((madeBy >> 8) !== 3 && (external & 0x10) !== 0);
    const regular = !directory && (fileType === 0 || fileType === 0x8000);
    members.push({
      compressedSize,
      directory,
      name,
      regular,
      uncompressedSize,
    });
    offset = end;
  }
  if (offset !== directoryOffset + directorySize) {
    throw new Error("ZIP central-directory size mismatch");
  }
  localRanges.sort((left, right) => left.start - right.start);
  if (localRanges[0]?.start !== 0 || localRanges.at(-1)?.end !== directoryOffset) {
    throw new Error("ZIP contains unaccounted bytes outside its members");
  }
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index - 1].end !== localRanges[index].start) {
      throw new Error("ZIP members overlap or contain unaccounted bytes");
    }
  }
  return members;
}

function tarArchiveMembers(filename) {
  const names = runChecked("tar", ["-tf", filename], {
    label: "release archive member listing",
  }).stdout.split(/\r?\n/).filter(Boolean);
  const verbose = runChecked("tar", ["-tvf", filename], {
    label: "release archive type listing",
  }).stdout.split(/\r?\n/).filter(Boolean);
  if (names.length !== verbose.length) {
    throw new Error("tar member and type listings differ");
  }
  return names.map((name, index) => ({
    directory: verbose[index][0] === "d",
    name,
    regular: verbose[index][0] === "-",
  }));
}

function preflightArchive(archive, target) {
  const descriptor = TARGETS[target];
  const members = descriptor.archiveExtension === ".zip"
    ? zipArchiveMembers(archive)
    : tarArchiveMembers(archive);
  const result = validateArchiveMembers(members, `sagejs-${target}`);
  if (descriptor.archiveExtension === ".zip") {
    const uncompressedBytes = members.reduce(
      (sum, member) => sum + member.uncompressedSize,
      0,
    );
    if (
      !Number.isSafeInteger(uncompressedBytes) ||
      uncompressedBytes > MAXIMUM_ZIP_UNCOMPRESSED_BYTES
    ) throw new Error("ZIP archive expands beyond the release acceptance bound");
  }
  return result;
}

function extractWindowsZip(archive, destination, expectedMembers) {
  const expanded = unzipSync(new Uint8Array(readFileSync(archive)));
  const names = Object.keys(expanded);
  const observedMembers = names.map((name) =>
    validateArchiveMember(name, "sagejs-windows-x64")
  ).sort();
  assert.deepEqual(
    observedMembers,
    expectedMembers,
    "Windows ZIP extractor and byte-level preflight see different members",
  );
  for (const name of names.sort()) {
    const normalized = name.endsWith("/") ? name.slice(0, -1) : name;
    const filename = join(destination, ...normalized.split("/"));
    if (name.endsWith("/")) {
      mkdirSync(filename, { recursive: true });
    } else {
      mkdirSync(dirname(filename), { recursive: true });
      writeFileSync(filename, expanded[name], { flag: "wx", mode: 0o644 });
    }
  }
}

function extractArchive(archive, target, destination) {
  const descriptor = TARGETS[target];
  if (!basename(archive).endsWith(descriptor.archiveExtension)) {
    throw new Error(`${target} archive must end in ${descriptor.archiveExtension}`);
  }
  const members = preflightArchive(archive, target);
  mkdirSync(destination);
  if (descriptor.platform === "darwin") {
    runChecked("ditto", ["-x", "-k", archive, destination], {
      label: "macOS ZIP extraction",
    });
  } else if (descriptor.platform === "win32") {
    extractWindowsZip(archive, destination, members);
  } else {
    runChecked("tar", ["-xf", archive, "-C", destination], {
      label: "release archive extraction",
    });
  }
  const entries = readdirSync(destination);
  if (entries.length !== 1 || entries[0] !== `sagejs-${target}`) {
    throw new Error(
      `archive must contain exactly sagejs-${target}; found ${entries.join(", ")}`,
    );
  }
  return join(destination, entries[0]);
}

function visitFiles(root, prefix = "") {
  const files = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    const filename = join(root, ...relativeName.split("/"));
    const information = lstatSync(filename);
    if (information.isSymbolicLink()) {
      throw new Error(`archive contains a symbolic link: ${relativeName}`);
    }
    if (entry.isDirectory()) files.push(...visitFiles(root, relativeName));
    else if (entry.isFile()) files.push(relativeName);
    else throw new Error(`archive contains a non-file entry: ${relativeName}`);
  }
  return files.sort();
}

function verifyInternalChecksums(distribution, descriptor) {
  const files = visitFiles(distribution);
  const required = [
    "DISTRIBUTION.md",
    "LICENSE",
    "README.md",
    "SHA256SUMS",
    "sagejs-build-manifest.json",
    "sagepython-build-manifest.json",
    ...descriptor.executableNames,
    ...(descriptor.metadataNames || []),
  ];
  for (const name of required) {
    if (!files.includes(name)) throw new Error(`archive is missing ${name}`);
  }
  const licenseFiles = files.filter((name) => name.startsWith("licenses/"));
  if (licenseFiles.length === 0) throw new Error("archive contains no license notices");
  for (const name of files) {
    if (
      !required.includes(name) &&
      !name.startsWith("licenses/")
    ) throw new Error(`unexpected archive entry ${name}`);
  }

  const checksumFilename = join(distribution, "SHA256SUMS");
  const lines = readFileSync(checksumFilename, "utf8").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const entries = lines.map((line) => {
    const match = line.match(/^([0-9a-f]{64})  ([^\r\n]+)$/);
    if (!match) throw new Error(`invalid internal SHA256SUMS entry: ${line}`);
    if (
      match[2].startsWith("/") ||
      match[2].includes("\\") ||
      match[2].split("/").some((part) => !part || part === "." || part === "..")
    ) throw new Error(`unsafe internal checksum path ${match[2]}`);
    return { digest: match[1], path: match[2] };
  });
  const expected = files.filter((name) => name !== "SHA256SUMS").sort();
  assert.deepEqual(
    entries.map(({ path }) => path),
    expected,
    "internal SHA256SUMS must cover every shipped file exactly once in sorted order",
  );
  for (const entry of entries) {
    if (sha256File(join(distribution, ...entry.path.split("/"))) !== entry.digest) {
      throw new Error(`internal SHA-256 mismatch for ${entry.path}`);
    }
  }
  return { files, sha256: sha256File(checksumFilename) };
}

function expectedTarget(target) {
  const descriptor = TARGETS[target];
  return { arch: descriptor.arch, platform: descriptor.platform };
}

function validateBuildReceipts(distribution, options) {
  const math = readBuildManifest(join(distribution, "sagejs-build-manifest.json"));
  const python = readBuildManifest(join(distribution, "sagepython-build-manifest.json"));
  const expected = expectedTarget(options.target);
  for (const [label, receipt] of [["sagejs", math], ["sagepython", python]]) {
    assert.equal(receipt.sagejsVersion, options["expected-version"], `${label} version receipt`);
    assert.equal(receipt.source.commit, options["expected-commit"], `${label} source commit`);
    assert.equal(receipt.source.kind, "git-clean", `${label} source must be clean Git`);
    assert.equal(receipt.source.dirty, false, `${label} source dirty flag`);
    assert.equal(receipt.target.platform, expected.platform, `${label} target platform`);
    assert.equal(receipt.target.arch, expected.arch, `${label} target architecture`);
  }
  assert.deepEqual(math.source, python.source, "the two executables have different source identities");
  assert.equal(math.capabilities?.artifact?.kind, "single-executable");
  assert.equal(math.capabilities?.artifact?.nativeMathematics, true);
  assert.equal(python.capabilities?.artifact?.kind, "single-executable");
  assert.equal(python.capabilities?.artifact?.nativeMathematics, false);
  return { math, python };
}

function canonicalJsonFile(filename, label) {
  const contents = readFileSync(filename, "utf8");
  let value;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${error.message}`);
  }
  if (contents !== `${JSON.stringify(value, null, 2)}\n`) {
    throw new Error(`${label} is not canonical generated JSON`);
  }
  return { contents, value };
}

function artifactMetadata(filename) {
  const status = statSync(filename);
  return {
    bytes: status.size,
    filename: basename(filename),
    mode: (status.mode & 0o777).toString(8).padStart(3, "0"),
    sha256: sha256File(filename),
  };
}

function validateLinuxBaselineMetadata(distribution, receipts, options) {
  const filename = join(distribution, "linux-baseline-receipt.json");
  const { value: baseline } = canonicalJsonFile(filename, "Linux baseline receipt");
  const source = receipts.math.toolchain?.seaNode?.source;
  const rustToolchain = RUST_TOOLCHAIN_AUTHORITIES[options.target];
  if (
    !exactKeys(baseline, [
      "authority", "buildImage", "compiler", "configureArguments", "containerEngine",
      "inspection", "nativeMathProfile", "nodeSource", "platform", "pnpmDistribution",
      "policy", "requestedSourceRef", "runtimeImage", "runtimeProbe", "rustToolchain",
      "schema", "seaArtifacts", "seaProbe", "sourceCommit",
    ]) ||
    baseline.schema !== "sagejs.linux-baseline-receipt-v1" ||
    baseline.platform !== options.target ||
    baseline.requestedSourceRef !== options["expected-commit"] ||
    baseline.sourceCommit !== options["expected-commit"] ||
    !exactKeys(baseline.nodeSource, ["filename", "sha256", "url", "version"]) ||
    !source
  ) throw new Error("Linux baseline receipt has invalid release identity");
  assert.deepEqual(baseline.nodeSource, source, "Linux baseline/SEA Node authority differs");
  assert.deepEqual(
    receipts.python.toolchain?.seaNode?.source,
    source,
    "the two SEA receipts have different Node authority",
  );
  assert.equal(receipts.math.toolchain?.seaNode?.version, source.version);
  assert.equal(receipts.python.toolchain?.seaNode?.version, source.version);
  assert.deepEqual(
    baseline.nativeMathProfile,
    receipts.math.toolchain?.nativeMathProfile,
    "Linux native mathematics profile differs from the SEA receipt",
  );
  assert.equal(receipts.python.toolchain?.nativeMathProfile, null);
  assert.equal(baseline.runtimeProbe?.observation?.node, `v${source.version}`);
  assert.equal(baseline.runtimeProbe?.observation?.temporal, "object");
  assert.equal(baseline.runtimeProbe?.exitStatus, 0);
  const seaProbeObservation = {
    ok: "sagejs-linux-sea-ok",
    temporal: "object",
  };
  if (
    !exactKeys(baseline.seaProbe, ["inspection", "observed", "stdout"]) ||
    baseline.seaProbe?.inspection?.schema !== "sagejs.native-binary-inspection-v1" ||
    baseline.seaProbe?.inspection?.ok !== true ||
    !Array.isArray(baseline.seaProbe.inspection.violations) ||
    baseline.seaProbe.inspection.violations.length !== 0 ||
    !Array.isArray(baseline.seaProbe.inspection.aggregate?.dependencies) ||
    baseline.seaProbe.inspection.aggregate.dependencies.length === 0 ||
    baseline.seaProbe.inspection.aggregate?.dependencies?.some(
      (dependency) => String(dependency).toLowerCase() === "libatomic.so.1",
    ) ||
    baseline.seaProbe.stdout !== JSON.stringify(seaProbeObservation)
  ) throw new Error("Linux baseline SEA Temporal probe is invalid");
  assert.deepEqual(
    baseline.seaProbe.observed,
    seaProbeObservation,
    "Linux baseline SEA Temporal observation differs",
  );
  assert.equal(baseline.configureArguments.includes("--v8-enable-temporal-support"), true);
  assert.deepEqual(baseline.rustToolchain, rustToolchain, "Linux Rust authority differs");
  assert.deepEqual(
    receipts.math.toolchain?.seaNode?.rustToolchain,
    rustToolchain,
    "mathematics SEA Rust authority differs",
  );
  assert.deepEqual(
    receipts.python.toolchain?.seaNode?.rustToolchain,
    rustToolchain,
    "Python SEA Rust authority differs",
  );
  if (
    !exactKeys(
      baseline.seaArtifacts,
      [
        "artifacts", "executables", "nodeSource", "platform", "rustToolchain", "schema",
        "sourceCommit",
      ],
    ) ||
    baseline.seaArtifacts?.schema !== "sagejs.linux-baseline-sea-artifacts-v1" ||
    baseline.seaArtifacts?.platform !== options.target ||
    baseline.seaArtifacts?.sourceCommit !== options["expected-commit"]
  ) throw new Error("Linux baseline SEA artifact identity differs");
  assert.deepEqual(
    baseline.seaArtifacts.nodeSource,
    source,
    "Linux baseline SEA artifact Node authority differs",
  );
  assert.deepEqual(
    baseline.seaArtifacts.rustToolchain,
    rustToolchain,
    "Linux baseline SEA artifact Rust authority differs",
  );
  const executableEvidence = (receipt) => {
    const report = receipt.toolchain?.nativeBinaries?.report;
    return {
      embeddedAddonInputSetSha256: report?.inputSetSha256,
      embeddedAddons: (report?.files || [])
        .filter((file) => file.role === "embedded-node-addon")
        .map((file) => ({ bytes: file.size, label: file.label, sha256: file.sha256 })),
      manifestSource: receipt.source,
      nativeInputReportSha256: receipt.toolchain?.nativeBinaries?.reportSha256,
      target: receipt.target,
    };
  };
  assert.deepEqual(
    baseline.seaArtifacts.executables,
    {
      sagejs: executableEvidence(receipts.math),
      sagepython: executableEvidence(receipts.python),
    },
    "Linux baseline executable evidence differs from build manifests",
  );
  const expected = {
    "sea/sagejs": "sagejs",
    "sea/sagejs-build-manifest.json": "sagejs-build-manifest.json",
    "sea/sagepython": "sagepython",
    "sea/sagepython-build-manifest.json": "sagepython-build-manifest.json",
  };
  assert.deepEqual(
    Object.keys(baseline.seaArtifacts.artifacts || {}).sort(),
    Object.keys(expected).sort(),
    "Linux baseline SEA artifact inventory differs",
  );
  for (const [recordedName, archiveName] of Object.entries(expected)) {
    const recorded = baseline.seaArtifacts.artifacts?.[recordedName];
    if (!exactKeys(recorded, ["bytes", "filename", "mode", "sha256"])) {
      throw new Error(`Linux baseline receipt omits ${recordedName}`);
    }
    assert.deepEqual(
      recorded,
      artifactMetadata(join(distribution, archiveName)),
      `Linux baseline ${recordedName} differs from archive`,
    );
  }
  if (!Array.isArray(baseline.inspection?.aggregate?.dependencies)) {
    throw new Error("Linux baseline receipt has no dependency inventory");
  }
  if (baseline.inspection.aggregate.dependencies.some(
    (dependency) => String(dependency).toLowerCase() === "libatomic.so.1"
  )) throw new Error("Linux baseline receipt depends on libatomic.so.1");
  return {
    nodeSource: source,
    platform: baseline.platform,
    rustToolchain,
    schema: baseline.schema,
    sha256: sha256File(filename),
    sourceCommit: baseline.sourceCommit,
  };
}

const UNSIGNED_WINDOWS_NOTICE = [
  "These Windows executables are not Authenticode-signed.",
  "Verify the published SHA-256 checksum before running them.",
  "",
].join("\n");

function validateWindowsUnsignedMetadata(distribution, options) {
  const noticeFilename = join(distribution, "UNSIGNED-WINDOWS.txt");
  const notice = readFileSync(noticeFilename, "utf8");
  if (notice !== UNSIGNED_WINDOWS_NOTICE) {
    throw new Error("Windows unsigned notice differs from the reviewed text");
  }
  const manifestFilename = join(distribution, "release.json");
  const { value: manifest } = canonicalJsonFile(
    manifestFilename,
    "Windows unsigned release manifest",
  );
  if (
    !exactKeys(manifest, ["schema", "signature", "sourceCommit", "target", "version"]) ||
    manifest.schema !== "sagejs.windows-release-manifest-v1" ||
    manifest.target !== "windows-x64" ||
    manifest.version !== options["expected-version"] ||
    manifest.sourceCommit !== options["expected-commit"] ||
    !exactKeys(manifest.signature, ["scheme", "status"]) ||
    manifest.signature.scheme !== "authenticode" ||
    manifest.signature.status !== "unsigned"
  ) throw new Error("Windows unsigned release manifest has invalid identity");
  return {
    manifestSha256: sha256File(manifestFilename),
    noticeSha256: sha256File(noticeFilename),
    signature: manifest.signature,
  };
}

function validateTargetMetadata(distribution, receipts, options) {
  const platform = TARGETS[options.target].platform;
  if (platform === "linux") {
    return validateLinuxBaselineMetadata(distribution, receipts, options);
  }
  if (platform === "win32") return validateWindowsUnsignedMetadata(distribution, options);
  return null;
}

function exactKeys(value, expected) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function validateThirdPartyInventory(distribution, receipts, options) {
  const licenseDirectory = join(distribution, "licenses");
  const inventoryFilename = join(licenseDirectory, "THIRD-PARTY.json");
  const contents = readFileSync(inventoryFilename, "utf8");
  let inventory;
  try {
    inventory = JSON.parse(contents);
  } catch (error) {
    throw new Error(`cannot parse third-party inventory: ${error.message}`);
  }
  if (contents !== `${JSON.stringify(inventory, null, 2)}\n`) {
    throw new Error("third-party inventory is not canonical generated JSON");
  }
  if (
    !exactKeys(inventory, ["dependencies", "notices", "schema"]) ||
    inventory.schema !== "sagejs.third-party-inventory-v1" ||
    !Array.isArray(inventory.dependencies) ||
    inventory.notices === null ||
    typeof inventory.notices !== "object" ||
    Array.isArray(inventory.notices)
  ) throw new Error("third-party inventory has an invalid top-level shape");
  const ids = inventory.dependencies.map((entry) => entry?.id);
  assert.deepEqual(ids, [...REQUIRED_THIRD_PARTY_IDS].sort(), "third-party dependency set drifted");
  if (new Set(ids).size !== ids.length) throw new Error("duplicate third-party dependency id");
  const referencedNotices = new Set();
  for (const entry of inventory.dependencies) {
    if (
      !exactKeys(entry, ["id", "license", "notices", "source", "version"]) ||
      typeof entry.id !== "string" ||
      typeof entry.license !== "string" ||
      typeof entry.version !== "string" ||
      !Array.isArray(entry.notices) ||
      entry.notices.length === 0 ||
      new Set(entry.notices).size !== entry.notices.length
    ) throw new Error(`invalid third-party dependency ${entry?.id || "<unknown>"}`);
    for (const notice of entry.notices) {
      if (
        typeof notice !== "string" ||
        notice.includes("/") ||
        notice.includes("\\") ||
        !HASH_PATTERN.test(inventory.notices[notice] || "")
      ) throw new Error(`${entry.id} references invalid notice ${notice}`);
      referencedNotices.add(notice);
    }
    const source = entry.source;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(`${entry.id} has no source identity`);
    }
    if (source.kind === "archive") {
      if (
        !exactKeys(source, ["kind", "sha256", "url"]) ||
        !HASH_PATTERN.test(source.sha256 || "") ||
        !/^https:\/\//.test(source.url || "")
      ) throw new Error(`${entry.id} has an invalid source archive identity`);
    } else if (source.kind === "npm") {
      if (
        !exactKeys(source, ["integrity", "kind", "url"]) ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(source.integrity || "") ||
        !/^https:\/\//.test(source.url || "")
      ) throw new Error(`${entry.id} has an invalid npm source identity`);
    } else if (source.kind === "git") {
      if (
        !exactKeys(source, ["commit", "kind", "url"]) ||
        !/^[0-9a-f]{40}$/.test(source.commit || "") ||
        !/^https:\/\//.test(source.url || "")
      ) throw new Error(`${entry.id} has an invalid Git source identity`);
    } else if (source.kind === "file") {
      if (
        !exactKeys(source, ["kind", "sha256", "url"]) ||
        !HASH_PATTERN.test(source.sha256 || "") ||
        !/^https:\/\//.test(source.url || "")
      ) throw new Error(`${entry.id} has an invalid source file identity`);
    } else if (source.kind === "release-source") {
      if (
        !exactKeys(source, ["digestAuthority", "kind", "url"]) ||
        source.digestAuthority !== "build-manifest.source.commit" ||
        !/^https:\/\//.test(source.url || "")
      ) throw new Error(`${entry.id} has an invalid vendored source identity`);
    } else if (source.kind === "platform-build-authorities") {
      if (
        !exactKeys(source, ["kind", "targets"]) ||
        source.targets === null ||
        typeof source.targets !== "object" ||
        Array.isArray(source.targets) ||
        Object.keys(source.targets).length === 0 ||
        Object.keys(source.targets).some((target) => !TARGETS[target])
      ) {
        throw new Error(`${entry.id} has incomplete platform build authorities`);
      }
      const requiredTargets = entry.id === "rust-toolchain"
        ? Object.keys(RUST_TOOLCHAIN_AUTHORITIES)
        : Object.keys(TARGETS);
      if (!exactKeys(source.targets, requiredTargets)) {
        throw new Error(`${entry.id} has incomplete platform build authorities`);
      }
      for (const [target, authority] of Object.entries(source.targets)) {
        if (
          !exactKeys(
            authority,
            entry.id === "rust-toolchain"
              ? ["filename", "sha256", "target", "url", "version"]
              : ["filename", "sha256", "url", "version"],
          ) ||
          authority.version !== entry.version ||
          !HASH_PATTERN.test(authority.sha256 || "") ||
          !/^https:\/\//.test(authority.url || "") ||
          (entry.id === "node" &&
            !authority.url.startsWith("https://nodejs.org/dist/v26.7.0/")) ||
          (entry.id === "rust-toolchain" &&
            !authority.url.startsWith("https://static.rust-lang.org/dist/2025-04-03/")) ||
          basename(new URL(authority.url).pathname) !== authority.filename ||
          !TARGETS[target]
        ) throw new Error(`${entry.id} has invalid build authority for ${target}`);
      }
    } else {
      throw new Error(`${entry.id} has unsupported source kind ${source.kind}`);
    }
  }
  assert.deepEqual(
    [...referencedNotices].sort(),
    Object.keys(inventory.notices).sort(),
    "third-party notice inventory contains missing or unreferenced notices",
  );
  assert.deepEqual(
    readdirSync(licenseDirectory).sort(),
    ["README.md", "THIRD-PARTY.json", ...Object.keys(inventory.notices)].sort(),
    "licenses directory contains a notice absent from the inventory",
  );
  for (const [notice, digest] of Object.entries(inventory.notices)) {
    const filename = join(licenseDirectory, notice);
    const relativeName = relative(licenseDirectory, filename);
    if (
      relativeName === ".." ||
      relativeName.startsWith(`..${sep}`) ||
      !lstatSync(filename).isFile() ||
      sha256File(filename) !== digest
    ) throw new Error(`third-party notice is absent or changed: ${notice}`);
  }

  const byId = Object.fromEntries(inventory.dependencies.map((entry) => [entry.id, entry]));
  const node = byId.node;
  const platformNode = node.source.targets?.[options.target];
  if (
    node.version !== "26.7.0" ||
    !platformNode ||
    receipts.math.toolchain?.seaNode?.version !== node.version ||
    receipts.python.toolchain?.seaNode?.version !== node.version ||
    !exactKeys(receipts.math.toolchain?.seaNode?.source, ["filename", "sha256", "url", "version"]) ||
    !exactKeys(receipts.python.toolchain?.seaNode?.source, ["filename", "sha256", "url", "version"]) ||
    JSON.stringify(receipts.math.toolchain.seaNode.source) !== JSON.stringify(platformNode) ||
    JSON.stringify(receipts.python.toolchain.seaNode.source) !== JSON.stringify(platformNode)
  ) {
    throw new Error("Node license inventory does not match both SEA builder receipts");
  }
  const rust = byId["rust-toolchain"];
  const platformRust = rust.source.targets?.[options.target];
  if (TARGETS[options.target].platform === "linux") {
    if (
      rust.version !== "1.86.0" ||
      !platformRust ||
      !exactKeys(platformRust, ["filename", "sha256", "target", "url", "version"]) ||
      JSON.stringify(platformRust) !== JSON.stringify(RUST_TOOLCHAIN_AUTHORITIES[options.target]) ||
      JSON.stringify(receipts.math.toolchain?.seaNode?.rustToolchain) !==
        JSON.stringify(platformRust) ||
      JSON.stringify(receipts.python.toolchain?.seaNode?.rustToolchain) !==
        JSON.stringify(platformRust)
    ) throw new Error("Rust license inventory does not match both Linux SEA builder receipts");
  } else if (
    platformRust !== undefined ||
    receipts.math.toolchain?.seaNode?.rustToolchain !== undefined ||
    receipts.python.toolchain?.seaNode?.rustToolchain !== undefined
  ) {
    throw new Error("non-Linux SEA unexpectedly declares the Linux Rust build toolchain");
  }

  const npmInventoryFilename = join(licenseDirectory, "NPM-PRODUCTION.json");
  const npmCorpusFilename = join(licenseDirectory, "NPM-PRODUCTION-LICENSES.txt");
  const npmContents = readFileSync(npmInventoryFilename, "utf8");
  const npm = JSON.parse(npmContents);
  if (
    npmContents !== `${JSON.stringify(npm, null, 2)}\n` ||
    !exactKeys(npm, ["corpusSha256", "packages", "schema"]) ||
    npm.schema !== "sagejs.npm-production-license-inventory-v1" ||
    !HASH_PATTERN.test(npm.corpusSha256 || "") ||
    npm.corpusSha256 !== sha256File(npmCorpusFilename) ||
    !Array.isArray(npm.packages) ||
    npm.packages.length < 68
  ) throw new Error("production npm license corpus is absent or invalid");
  const npmNames = [];
  for (const dependency of npm.packages) {
    if (
      !exactKeys(dependency, [
        "declaredLicense", "integrity", "licenseFiles", "name", "url", "version",
      ]) ||
      typeof dependency.name !== "string" ||
      typeof dependency.version !== "string" ||
      typeof dependency.declaredLicense !== "string" ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(dependency.integrity || "") ||
      !/^https:\/\/registry\.npmjs\.org\//.test(dependency.url || "") ||
      !Array.isArray(dependency.licenseFiles) ||
      dependency.licenseFiles.length === 0
    ) throw new Error(`invalid npm license entry ${dependency?.name || "<unknown>"}`);
    for (const license of dependency.licenseFiles) {
      if (
        !exactKeys(license, ["filename", "sha256"]) ||
        typeof license.filename !== "string" ||
        !license.filename ||
        !HASH_PATTERN.test(license.sha256 || "")
      ) throw new Error(`invalid npm license file for ${dependency.name}`);
    }
    npmNames.push(`${dependency.name}@${dependency.version}`);
  }
  const canonicalNpmNames = [...npm.packages]
    .sort((left, right) => left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version))
    .map((dependency) => `${dependency.name}@${dependency.version}`);
  assert.deepEqual(npmNames, canonicalNpmNames, "npm license entries are not canonical");
  if (new Set(npmNames).size !== npmNames.length) throw new Error("duplicate npm license entry");

  const profileNames = {
    ffpoly: "ffpoly",
    fflasFfpack: "fflas-ffpack",
    flint: "flint",
    givaro: "givaro",
    gmp: "gmp",
    mpc: "mpc",
    mpfr: "mpfr",
    openblas: "openblas",
    smalljac: "smalljac",
  };
  const profileDependencies = receipts.math.toolchain?.nativeMathProfile?.dependencies;
  if (!profileDependencies) throw new Error("mathematics receipt has no dependency versions");
  for (const [profileName, inventoryId] of Object.entries(profileNames)) {
    if (profileDependencies[profileName] !== byId[inventoryId].version) {
      throw new Error(`${inventoryId} inventory version differs from native profile`);
    }
  }
  const bindings = receipts.math.capabilities?.nativeDependencies?.bindings || {};
  for (const id of Object.keys(bindings)) {
    const expected = byId[id];
    if (
      !expected ||
      bindings[id].dependency?.name !== id ||
      bindings[id].dependency?.version !== expected.version ||
      bindings[id].dependency?.sha256 !== expected.source.sha256
    ) throw new Error(`${id} embedded dependency receipt differs from license inventory`);
  }
  return {
    dependencies: ids,
    inventorySha256: sha256File(inventoryFilename),
    nodeSource: platformNode,
    nodeLicenseSha256: inventory.notices["NODE-26.7.0-LICENSE.txt"],
    npmLicenseCorpusSha256: npm.corpusSha256,
    npmPackages: npm.packages.length,
    notices: Object.keys(inventory.notices).sort(),
  };
}

function dependencyAllowed(dependency, target) {
  const descriptor = TARGETS[target];
  if (descriptor.platform === "linux") return LINUX_DEPENDENCIES.has(dependency);
  if (descriptor.platform === "darwin") {
    return dependency.startsWith("/usr/lib/") ||
      dependency.startsWith("/System/Library/");
  }
  const upper = dependency.toUpperCase();
  return WINDOWS_SYSTEM_DEPENDENCIES.has(upper) ||
    upper.startsWith("API-MS-WIN-") || upper.startsWith("EXT-MS-WIN-");
}

function validateNativeReceipt(receipt, options, label) {
  const native = receipt.toolchain?.nativeBinaries;
  if (
    native?.schema !== "sagejs.native-binary-receipt/v1" ||
    !HASH_PATTERN.test(native.reportSha256 || "") ||
    native.reportSha256 !== sha256Text(canonicalJson(native.report))
  ) throw new Error(`${label} has no valid native-binary receipt`);
  const report = native.report;
  if (report.schema !== "sagejs.native-binary-inspection-v1" || report.ok !== true) {
    throw new Error(`${label} native-binary inspection did not pass`);
  }
  assert.deepEqual(report.violations, [], `${label} native-binary violations`);
  const descriptor = TARGETS[options.target];
  assert.deepEqual(report.aggregate.formats, [descriptor.format]);
  assert.deepEqual(report.aggregate.architectures, [descriptor.arch]);
  const forbidden = report.aggregate.dependencies.filter(
    (dependency) => !dependencyAllowed(dependency, options.target),
  );
  if (forbidden.length) {
    throw new Error(`${label} has non-system runtime dependencies: ${forbidden.join(", ")}`);
  }
  if (descriptor.platform === "linux") {
    const required = report.aggregate.maximumGlibc;
    if (!required || compareVersions(required, options["maximum-glibc"]) > 0) {
      throw new Error(
        `${label} requires GLIBC ${required || "unknown"}; release maximum is ` +
        options["maximum-glibc"],
      );
    }
    assert.equal(receipt.target.libc?.family, "glibc");
    assert.equal(receipt.target.libc?.version, required);
  }
  if (descriptor.platform === "darwin") {
    const required = report.aggregate.maximumMinimumMacos;
    if (!required || compareVersions(required, options["maximum-macos"]) > 0) {
      throw new Error(
        `${label} requires macOS ${required || "unknown"}; release maximum is ` +
        options["maximum-macos"],
      );
    }
  }
  return {
    architectures: report.aggregate.architectures,
    dependencies: report.aggregate.dependencies,
    formats: report.aggregate.formats,
    maximumGlibc: report.aggregate.maximumGlibc,
    maximumMinimumMacos: report.aggregate.maximumMinimumMacos,
    reportSha256: native.reportSha256,
  };
}

function peCertificateTable(filename) {
  const bytes = readFileSync(filename);
  if (bytes.length < 0x40 || bytes.readUInt16LE(0) !== 0x5a4d) {
    throw new Error(`${filename} is not a PE executable`);
  }
  const pe = bytes.readUInt32LE(0x3c);
  if (pe + 24 > bytes.length || bytes.toString("ascii", pe, pe + 4) !== "PE\0\0") {
    throw new Error(`${filename} has an invalid PE header`);
  }
  const optional = pe + 24;
  const magic = bytes.readUInt16LE(optional);
  const dataDirectories = magic === 0x20b ? optional + 112 :
    magic === 0x10b ? optional + 96 : -1;
  if (dataDirectories < 0 || dataDirectories + 8 * 5 > bytes.length) {
    throw new Error(`${filename} has an invalid PE optional header`);
  }
  const offset = bytes.readUInt32LE(dataDirectories + 8 * 4);
  const size = bytes.readUInt32LE(dataDirectories + 8 * 4 + 4);
  if ((offset === 0) !== (size === 0)) {
    throw new Error(`${filename} has a malformed Authenticode certificate table`);
  }
  if (size && (offset + size > bytes.length || offset % 8 !== 0)) {
    throw new Error(`${filename} has an invalid Authenticode certificate table`);
  }
  return { offset, size };
}

function assertInstallerHasNoScripts(expanded, packageInfo) {
  if (
    existsSync(join(expanded, "Scripts")) ||
    /<(?:scripts|script|preinstall|postinstall)\b/i.test(packageInfo)
  ) throw new Error("installer package contains privileged install scripts");
}

function verifyMacPackage(distribution, options) {
  const details = runChecked("pkgutil", ["--check-signature", options.package], {
    label: "macOS installer signature",
  });
  const signature = `${details.stdout}\n${details.stderr}`;
  if (
    !signature.includes("Developer ID Installer:") ||
    !signature.includes(`(${APPLE_TEAM_ID})`)
  ) throw new Error(`installer is not signed by Apple team ${APPLE_TEAM_ID}`);

  const temporary = mkdtempSync(join(tmpdir(), "sagejs-package-acceptance-"));
  try {
    const expanded = join(temporary, "expanded");
    runChecked("pkgutil", ["--expand-full", options.package, expanded], {
      label: "macOS installer payload expansion",
    });
    const packageInfo = readFileSync(join(expanded, "PackageInfo"), "utf8");
    assertInstallerHasNoScripts(expanded, packageInfo);
    const header = packageInfo.match(/<pkg-info\b[^>]*>/)?.[0] || "";
    const attribute = (name) => header.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    if (
      attribute("identifier") !== "org.sagemath.sagejs.cli" ||
      attribute("version") !== options["expected-version"] ||
      attribute("install-location") !== "/"
    ) throw new Error("installer package identity/version/location is invalid");
    const payload = join(expanded, "Payload");
    const payloadFiles = visitFiles(payload);
    assert.deepEqual(payloadFiles, ["usr/local/bin/sagejs", "usr/local/bin/sagepython"]);
    const hashes = {};
    for (const name of ["sagejs", "sagepython"]) {
      const payloadHash = sha256File(join(payload, "usr", "local", "bin", name));
      const archiveHash = sha256File(join(distribution, name));
      if (payloadHash !== archiveHash) {
        throw new Error(`installer ${name} bytes differ from accepted ZIP bytes`);
      }
      hashes[name] = payloadHash;
    }
    return {
      identifier: "org.sagemath.sagejs.cli",
      installLocation: "/",
      payloadSha256: hashes,
      teamIdentifier: APPLE_TEAM_ID,
      version: options["expected-version"],
    };
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

function validateBenchmarkStatistics(report) {
  const names = ["process_startup", "cold", "warm"];
  let sampleCount;
  for (const name of names) {
    const statistics = report[name];
    if (
      !exactKeys(statistics, ["maximum_ms", "median_ms", "minimum_ms", "samples_ms"]) ||
      !Array.isArray(statistics.samples_ms) ||
      statistics.samples_ms.length === 0 ||
      statistics.samples_ms.some((value) => !Number.isFinite(value) || value <= 0)
    ) throw new Error(`macOS benchmark has invalid ${name} samples`);
    if (sampleCount === undefined) sampleCount = statistics.samples_ms.length;
    if (statistics.samples_ms.length !== sampleCount) {
      throw new Error("macOS benchmark sample counts differ");
    }
    const ordered = [...statistics.samples_ms].sort((left, right) => left - right);
    if (
      statistics.minimum_ms !== ordered[0] ||
      statistics.median_ms !== ordered[Math.floor(ordered.length / 2)] ||
      statistics.maximum_ms !== ordered.at(-1)
    ) throw new Error(`macOS benchmark has inconsistent ${name} statistics`);
  }
  return sampleCount;
}

function verifyMacBenchmark(distribution, archiveSha256, options) {
  const digest = verifyChecksum(options.benchmark, options["benchmark-checksum"]);
  const contents = readFileSync(options.benchmark, "utf8");
  const report = JSON.parse(contents);
  const buildReceipt = readBuildManifest(join(distribution, "sagejs-build-manifest.json"));
  const nodeSource = buildReceipt.toolchain?.seaNode?.source;
  if (
    contents !== `${JSON.stringify(report, null, 2)}\n` ||
    report.schema !== "sagejs.release-candidate-benchmark-v1" ||
    report.platform !== "macos-arm64" ||
    report.version !== `sagejs ${options["expected-version"]}` ||
    report.archive !== basename(options.archive) ||
    report.archive_sha256 !== archiveSha256 ||
    report.validation_checkout?.available !== true ||
    report.validation_checkout?.commit !== options["expected-commit"] ||
    report.validation_checkout?.dirty !== false ||
    report.builder?.known !== true ||
    String(report.builder?.node_version || "").replace(/^v/, "") !== "26.7.0" ||
    report.builder?.node_distribution !== nodeSource?.filename ||
    report.builder?.node_distribution_sha256 !== nodeSource?.sha256
  ) throw new Error("macOS benchmark does not identify this clean signed candidate");
  const samples = validateBenchmarkStatistics(report);
  const expectedContent = visitFiles(distribution).map((path) => {
    const filename = join(distribution, ...path.split("/"));
    const status = statSync(filename);
    return {
      bytes: status.size,
      mode: `0${(status.mode & 0o777).toString(8)}`,
      path,
      sha256: sha256File(filename),
    };
  });
  const reportedContent = [...(report.extracted_content || [])]
    .sort((left, right) => left.path.localeCompare(right.path));
  assert.deepEqual(reportedContent, expectedContent, "benchmark extracted content differs from ZIP");
  return {
    benchmarkSha256: digest,
    reportSha256: sha256Text(canonicalJson(report)),
    samples,
  };
}

function verifySignatures(distribution, options) {
  const descriptor = TARGETS[options.target];
  const executables = descriptor.executableNames.map((name) => join(distribution, name));
  if (options.signature === "apple-developer-id") {
    const identities = [];
    for (const executable of executables) {
      runChecked("codesign", ["--verify", "--deep", "--strict", executable]);
      const details = runChecked(
        "codesign",
        ["--display", "--verbose=4", executable],
      );
      const output = `${details.stdout}\n${details.stderr}`;
      if (
        !/Authority=Developer ID Application:/.test(output) ||
        !output.includes(`(${APPLE_TEAM_ID})`) ||
        /Signature=adhoc/.test(output)
      ) {
        throw new Error(`${basename(executable)} lacks a Developer ID Application signature`);
      }
      const team = output.match(/TeamIdentifier=([^\s]+)/)?.[1];
      if (team !== APPLE_TEAM_ID) {
        throw new Error(`${basename(executable)} is not signed by Apple team ${APPLE_TEAM_ID}`);
      }
      identities.push({ executable: basename(executable), teamIdentifier: team });
      runChecked("spctl", ["--assess", "--type", "execute", "--verbose=4", executable], {
        label: `Gatekeeper ${basename(executable)}`,
      });
    }
    const packageHash = verifyChecksum(options.package, options["package-checksum"]);
    const installer = verifyMacPackage(distribution, options);
    runChecked("xcrun", ["stapler", "validate", options.package]);
    runChecked("spctl", ["--assess", "--type", "install", "--verbose=4", options.package]);
    return {
      executables: identities,
      mode: "apple-developer-id",
      notarization: "gatekeeper-accepted-and-installer-ticket-stapled",
      package: { name: basename(options.package), sha256: packageHash },
      installer,
    };
  }
  if (descriptor.platform === "win32") {
    const evidence = executables.map((executable) => {
      const table = peCertificateTable(executable);
      if (table.size !== 0) {
        throw new Error(`${basename(executable)} unexpectedly has an Authenticode signature`);
      }
      return { certificateTableOffset: 0, certificateTableSize: 0, executable: basename(executable) };
    });
    return { executables: evidence, mode: "explicitly-unsigned-authenticode" };
  }
  return { executables: descriptor.executableNames, mode: "unsigned-not-applicable" };
}

function isolatedEnvironment(directory) {
  const environment = {};
  for (const name of ["LANG", "LC_ALL", "LC_CTYPE", "TZ", "SYSTEMROOT", "WINDIR"]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  const home = join(directory, "home");
  const temporary = join(directory, "tmp");
  const cache = join(directory, "cache");
  for (const path of [home, temporary, cache]) mkdirSync(path, { recursive: true });
  return {
    ...environment,
    APPDATA: join(home, "AppData", "Roaming"),
    HOME: home,
    LOCALAPPDATA: join(home, "AppData", "Local"),
    PATH: process.platform === "win32"
      ? `${process.env.SystemRoot || "C:\\Windows"}\\System32`
      : "/usr/bin:/bin:/usr/sbin:/sbin",
    SAGEJS_NATIVE_CACHE_DIR: join(cache, "native"),
    TEMP: temporary,
    TMP: temporary,
    TMPDIR: temporary,
    USERPROFILE: home,
    XDG_CACHE_HOME: cache,
  };
}

function verifyRuntime(distribution, receipts, options, stateDirectory) {
  const descriptor = TARGETS[options.target];
  const [sagejsName, sagepythonName] = descriptor.executableNames;
  const sagejs = join(distribution, sagejsName);
  const sagepython = join(distribution, sagepythonName);
  const environment = isolatedEnvironment(stateDirectory);
  const versions = {};
  for (const [name, executable] of [[sagejsName, sagejs], [sagepythonName, sagepython]]) {
    const output = runChecked(executable, ["--version"], {
      cwd: stateDirectory,
      env: environment,
      label: `${name} --version`,
    }).stdout.trim();
    if (output !== `sagejs ${options["expected-version"]}`) {
      throw new Error(`${name} reported unexpected version ${JSON.stringify(output)}`);
    }
    versions[name] = output;
  }
  for (const [name, executable, receipt] of [
    [sagejsName, sagejs, receipts.math],
    [sagepythonName, sagepython, receipts.python],
  ]) {
    const result = runChecked(executable, ["capabilities", "--json"], {
      cwd: stateDirectory,
      env: environment,
      label: `${name} embedded receipt`,
    });
    const report = JSON.parse(result.stdout);
    assert.equal(report.buildReceipt?.availability, "available");
    assert.equal(report.buildReceipt?.source, "embedded");
    assert.deepEqual(report.buildReceipt.manifest, receipt, `${name} embedded/sidecar receipt mismatch`);
  }
  const pythonSelfTest = runChecked(sagepython, ["--jupyter-kernel-self-test"], {
    cwd: stateDirectory,
    env: environment,
    label: "sagepython self-test",
  }).stdout.trim();
  assert.equal(pythonSelfTest, "Sage.js Jupyter SEA runtime passed.");
  const smoke = runChecked(
    process.execPath,
    [
      join(__dirname, "release-math-smoke.cjs"),
      "--executable", sagejs,
      "--require-native",
      "--state-directory", join(stateDirectory, "mathematics"),
      "--max-seconds", "60",
      "--json",
    ],
    { cwd: stateDirectory, env: environment, label: "authoritative mathematics smoke" },
  );
  const math = JSON.parse(smoke.stdout);
  if (math.native?.fallback?.length !== 0) {
    throw new Error(`mathematics smoke used fallback implementations: ${math.native.fallback.join(", ")}`);
  }
  return {
    mathematicsReportSha256: sha256Text(canonicalJson(math)),
    nativeWitnesses: math.native.witnesses,
    pythonSelfTest,
    versions,
  };
}

function assertHostTarget(options) {
  const target = TARGETS[options.target];
  if (process.platform !== target.platform || process.arch !== target.arch) {
    throw new Error(
      `${options.target} acceptance must run on ${target.platform}-${target.arch}; ` +
      `host is ${process.platform}-${process.arch}`,
    );
  }
}

function writeReceipt(filename, receipt) {
  const absolute = resolve(filename);
  mkdirSync(dirname(absolute), { recursive: true });
  const serialized = serialize(receipt);
  writeFileSync(absolute, serialized, { flag: "wx", mode: 0o644 });
  const digest = sha256Text(serialized);
  writeFileSync(`${absolute}.sha256`, `${digest}  ${basename(absolute)}\n`, {
    flag: "wx",
    mode: 0o644,
  });
  return digest;
}

function acceptReleaseArtifact(options, internals = {}) {
  const hostCheck = internals.assertHostTarget || assertHostTarget;
  hostCheck(options);
  const archive = resolve(options.archive);
  const checksum = resolve(options.checksum);
  const archiveSha256 = verifyChecksum(archive, checksum);
  const workspace = mkdtempSync(join(tmpdir(), "sagejs-release-acceptance-"));
  try {
    const distribution = (internals.extractArchive || extractArchive)(
      archive,
      options.target,
      join(workspace, "extracted"),
    );
    const descriptor = TARGETS[options.target];
    const internal = verifyInternalChecksums(distribution, descriptor);
    // Production acceptance already requires host === target. The second guard
    // keeps the injected-host unit fixture portable on Windows, whose stat
    // mode cannot represent the archived POSIX executable bits.
    if (descriptor.platform !== "win32" && process.platform !== "win32") {
      for (const name of descriptor.executableNames) {
        if ((statSync(join(distribution, name)).mode & 0o111) !== 0o111) {
          throw new Error(`${name} does not retain all executable permission bits`);
        }
      }
    }
    const receipts = validateBuildReceipts(distribution, options);
    const thirdParty = validateThirdPartyInventory(distribution, receipts, options);
    const targetMetadata = validateTargetMetadata(distribution, receipts, options);
    const nativeBinaries = {
      sagejs: validateNativeReceipt(receipts.math, options, "sagejs"),
      sagepython: validateNativeReceipt(receipts.python, options, "sagepython"),
    };
    const signatures = (internals.verifySignatures || verifySignatures)(distribution, options);
    const benchmark = descriptor.platform === "darwin"
      ? (internals.verifyMacBenchmark || verifyMacBenchmark)(
        distribution,
        archiveSha256,
        options,
      )
      : null;
    const runtime = (internals.verifyRuntime || verifyRuntime)(
      distribution,
      receipts,
      options,
      join(workspace, "runtime"),
    );
    const receipt = {
      archive: {
        name: basename(archive),
        sha256: archiveSha256,
        size: statSync(archive).size,
      },
      benchmark,
      checks: {
        archiveContents: true,
        archiveSha256: true,
        buildReceiptBinding: true,
        exactMathematics: true,
        licenseAndSourceInventory: true,
        nativeDependencyClosure: true,
        relocatedRuntime: true,
        signaturePolicy: true,
      },
      internalManifest: internal,
      nativeBinaries,
      runtime,
      schema: RECEIPT_SCHEMA,
      signatures,
      source: receipts.math.source,
      target: receipts.math.target,
      targetMetadata,
      thirdParty,
      version: receipts.math.sagejsVersion,
    };
    const receiptSha256 = writeReceipt(options.output, receipt);
    return { receipt, receiptSha256 };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function main(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = acceptReleaseArtifact(options);
  console.log(
    `Accepted ${options.target} ${basename(options.archive)}; ` +
    `receipt SHA-256 ${result.receiptSha256}.`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  RECEIPT_SCHEMA,
  RUST_TOOLCHAIN_AUTHORITIES,
  TARGETS,
  acceptReleaseArtifact,
  assertInstallerHasNoScripts,
  dependencyAllowed,
  extractArchive,
  extractWindowsZip,
  isolatedEnvironment,
  parseArguments,
  peCertificateTable,
  preflightArchive,
  tarArchiveMembers,
  validateBenchmarkStatistics,
  validateBuildReceipts,
  validateTargetMetadata,
  validateArchiveMember,
  validateArchiveMembers,
  validateZipExtra,
  validateNativeReceipt,
  validateThirdPartyInventory,
  verifyChecksum,
  verifyInternalChecksums,
  verifyMacBenchmark,
  verifyMacPackage,
  verifyRuntime,
  verifySignatures,
  writeReceipt,
  zipArchiveMembers,
};
