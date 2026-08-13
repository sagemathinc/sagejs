"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  BinaryFormatError,
  NativeBinaryPolicyError,
  assertNativeInputs,
  compareVersions,
  inspectBinaryBuffer,
  inspectNativeInputs,
} = require("../scripts/release-native-binary-inspector.cjs");

function align(value, multiple) {
  return Math.ceil(value / multiple) * multiple;
}

function elfFixture({
  glibc = ["2.17", "2.28"],
  symbolVersions = [],
  rpath = "/opt/sagejs/lib",
} = {}) {
  const sectionNames = ["", ".shstrtab", ".dynstr", ".dynamic", ".gnu.version_r"];
  const shstr = Buffer.from(`${sectionNames.join("\0")}\0`);
  const sectionNameOffsets = new Map();
  let nameCursor = 0;
  for (const name of sectionNames) {
    sectionNameOffsets.set(name, nameCursor);
    nameCursor += Buffer.byteLength(name) + 1;
  }

  const requiredVersions = [
    ...glibc.map((version) => `GLIBC_${version}`),
    ...symbolVersions,
  ];
  const dynamicStrings = ["", "libc.so.6", ...requiredVersions, rpath];
  const dynstr = Buffer.from(`${dynamicStrings.join("\0")}\0`);
  const stringOffsets = new Map();
  let stringCursor = 0;
  for (const value of dynamicStrings) {
    stringOffsets.set(value, stringCursor);
    stringCursor += Buffer.byteLength(value) + 1;
  }

  const dynamic = Buffer.alloc(16 * 3);
  dynamic.writeBigInt64LE(1n, 0);
  dynamic.writeBigUInt64LE(BigInt(stringOffsets.get("libc.so.6")), 8);
  dynamic.writeBigInt64LE(29n, 16);
  dynamic.writeBigUInt64LE(BigInt(stringOffsets.get(rpath)), 24);

  const versionRequirements = Buffer.alloc(16 + 16 * requiredVersions.length);
  versionRequirements.writeUInt16LE(1, 0);
  versionRequirements.writeUInt16LE(requiredVersions.length, 2);
  versionRequirements.writeUInt32LE(stringOffsets.get("libc.so.6"), 4);
  versionRequirements.writeUInt32LE(16, 8);
  for (let index = 0; index < requiredVersions.length; index += 1) {
    const offset = 16 + index * 16;
    versionRequirements.writeUInt32LE(stringOffsets.get(requiredVersions[index]), offset + 8);
    versionRequirements.writeUInt32LE(
      index + 1 < requiredVersions.length ? 16 : 0,
      offset + 12,
    );
  }

  const chunks = [shstr, dynstr, dynamic, versionRequirements];
  const offsets = [];
  let cursor = 64;
  for (const chunk of chunks) {
    cursor = align(cursor, 8);
    offsets.push(cursor);
    cursor += chunk.length;
  }
  const sectionTable = align(cursor, 8);
  const buffer = Buffer.alloc(sectionTable + 5 * 64);
  buffer.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0);
  buffer.writeUInt16LE(3, 16);
  buffer.writeUInt16LE(62, 18);
  buffer.writeUInt32LE(1, 20);
  buffer.writeBigUInt64LE(BigInt(sectionTable), 40);
  buffer.writeUInt16LE(64, 52);
  buffer.writeUInt16LE(64, 58);
  buffer.writeUInt16LE(5, 60);
  buffer.writeUInt16LE(1, 62);
  chunks.forEach((chunk, index) => chunk.copy(buffer, offsets[index]));

  const writeSection = (index, name, type, offset, size, link = 0, entrySize = 0) => {
    const header = sectionTable + index * 64;
    buffer.writeUInt32LE(sectionNameOffsets.get(name), header);
    buffer.writeUInt32LE(type, header + 4);
    buffer.writeBigUInt64LE(BigInt(offset), header + 24);
    buffer.writeBigUInt64LE(BigInt(size), header + 32);
    buffer.writeUInt32LE(link, header + 40);
    buffer.writeBigUInt64LE(BigInt(entrySize), header + 56);
  };
  writeSection(1, ".shstrtab", 3, offsets[0], shstr.length);
  writeSection(2, ".dynstr", 3, offsets[1], dynstr.length);
  writeSection(3, ".dynamic", 6, offsets[2], dynamic.length, 2, 16);
  writeSection(
    4,
    ".gnu.version_r",
    0x6ffffffe,
    offsets[3],
    versionRequirements.length,
    2,
  );
  return buffer;
}

function paddedCommand(command, fixedSize, string) {
  const commandSize = align(fixedSize + Buffer.byteLength(string) + 1, 8);
  const buffer = Buffer.alloc(commandSize);
  buffer.writeUInt32LE(command, 0);
  buffer.writeUInt32LE(commandSize, 4);
  buffer.writeUInt32LE(fixedSize, 8);
  buffer.write(string, fixedSize, "utf8");
  return buffer;
}

function encodedVersion(version) {
  const [major, minor = 0, patch = 0] = version.split(".").map(Number);
  return (major << 16) | (minor << 8) | patch;
}

function thinMachoFixture({
  architecture = "arm64",
  minimumMacos = "13.5.0",
  dependency = "/usr/lib/libSystem.B.dylib",
  rpath = "/System/Library/Frameworks",
} = {}) {
  const build = Buffer.alloc(24);
  build.writeUInt32LE(0x32, 0);
  build.writeUInt32LE(24, 4);
  build.writeUInt32LE(1, 8);
  build.writeUInt32LE(encodedVersion(minimumMacos), 12);
  build.writeUInt32LE(encodedVersion("15.5.0"), 16);
  const dylib = paddedCommand(0x0c, 24, dependency);
  const rpathCommand = paddedCommand(0x8000001c, 12, rpath);
  const commands = Buffer.concat([build, dylib, rpathCommand]);
  const buffer = Buffer.alloc(32 + commands.length);
  buffer.writeUInt32LE(0xfeedfacf, 0);
  buffer.writeUInt32LE(architecture === "arm64" ? 0x0100000c : 0x01000007, 4);
  buffer.writeUInt32LE(3, 8);
  buffer.writeUInt32LE(2, 12);
  buffer.writeUInt32LE(3, 16);
  buffer.writeUInt32LE(commands.length, 20);
  commands.copy(buffer, 32);
  return buffer;
}

function universalMachoFixture(slices) {
  const tableSize = 8 + slices.length * 20;
  let cursor = align(tableSize, 16);
  const offsets = slices.map((slice) => {
    const offset = cursor;
    cursor = align(cursor + slice.buffer.length, 16);
    return offset;
  });
  const result = Buffer.alloc(cursor);
  result.writeUInt32BE(0xcafebabe, 0);
  result.writeUInt32BE(slices.length, 4);
  for (let index = 0; index < slices.length; index += 1) {
    const entry = 8 + index * 20;
    result.writeUInt32BE(slices[index].machine, entry);
    result.writeUInt32BE(3, entry + 4);
    result.writeUInt32BE(offsets[index], entry + 8);
    result.writeUInt32BE(slices[index].buffer.length, entry + 12);
    result.writeUInt32BE(4, entry + 16);
    slices[index].buffer.copy(result, offsets[index]);
  }
  return result;
}

function peFixture({ machine = 0x8664 } = {}) {
  const peOffset = 0x80;
  const optionalSize = 240;
  const sectionOffset = peOffset + 4 + 20 + optionalSize;
  const rawOffset = 0x200;
  const buffer = Buffer.alloc(0x600);
  buffer.write("MZ", 0, "binary");
  buffer.writeUInt32LE(peOffset, 0x3c);
  buffer.write("PE\0\0", peOffset, "binary");
  const coff = peOffset + 4;
  buffer.writeUInt16LE(machine, coff);
  buffer.writeUInt16LE(1, coff + 2);
  buffer.writeUInt16LE(optionalSize, coff + 16);
  buffer.writeUInt16LE(0x2022, coff + 18);
  const optional = coff + 20;
  buffer.writeUInt16LE(0x20b, optional);
  buffer.writeBigUInt64LE(0x140000000n, optional + 24);
  buffer.writeUInt16LE(3, optional + 68);
  buffer.writeUInt32LE(16, optional + 108);
  buffer.writeUInt32LE(0x1000, optional + 112 + 8);
  buffer.writeUInt32LE(40, optional + 112 + 12);
  buffer.writeUInt32LE(0x1040, optional + 112 + 13 * 8);
  buffer.writeUInt32LE(64, optional + 112 + 13 * 8 + 4);
  buffer.write(".rdata", sectionOffset, "ascii");
  buffer.writeUInt32LE(0x400, sectionOffset + 8);
  buffer.writeUInt32LE(0x1000, sectionOffset + 12);
  buffer.writeUInt32LE(0x400, sectionOffset + 16);
  buffer.writeUInt32LE(rawOffset, sectionOffset + 20);
  buffer.writeUInt32LE(0x1100, rawOffset + 12);
  buffer.writeUInt32LE(1, rawOffset + 0x40);
  buffer.writeUInt32LE(0x1110, rawOffset + 0x44);
  buffer.write("KERNEL32.dll\0", rawOffset + 0x100, "ascii");
  buffer.write("node.exe\0", rawOffset + 0x110, "ascii");
  return buffer;
}

function temporaryFiles(fixtures) {
  const root = mkdtempSync(join(tmpdir(), "sagejs-native-inspector-"));
  return fixtures.map(([name, contents]) => {
    const path = join(root, name);
    writeFileSync(path, contents);
    return path;
  });
}

test("version ordering is numeric rather than lexical", () => {
  assert.equal(compareVersions("2.9", "2.28"), -1);
  assert.equal(compareVersions("13.5", "13.5.0"), 0);
  assert.equal(compareVersions("14.0.1", "14.0"), 1);
});

test("ELF inspection derives required GLIBC, dependencies, and runpaths", () => {
  const report = inspectBinaryBuffer(
    elfFixture({
      symbolVersions: ["GLIBCXX_3.4.30", "CXXABI_1.3.13", "GCC_12.0.0"],
    }),
  );
  assert.equal(report.format, "elf");
  assert.equal(report.architecture, "x64");
  assert.deepEqual(report.dependencies, ["libc.so.6"]);
  assert.deepEqual(report.glibcVersions, ["2.17", "2.28"]);
  assert.equal(report.maximumGlibc, "2.28");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(report.symbolVersionFamilies).map(([family, value]) => [
        family,
        value.maximum,
      ]),
    ),
    { CXXABI: "1.3.13", GCC: "12.0.0", GLIBC: "2.28", GLIBCXX: "3.4.30" },
  );
  assert.deepEqual(report.rpaths, ["/opt/sagejs/lib"]);
});

test("Linux release policy aggregates every input and fails a newer addon", () => {
  const [template, addon] = temporaryFiles([
    ["node-template", elfFixture({ glibc: ["2.17"] })],
    ["flint.node", elfFixture({ glibc: ["2.34"] })],
  ]);
  const policy = {
    format: "elf",
    architectures: ["x64"],
    maximumGlibc: "2.28",
    allowedDependencies: ["libc.so.6"],
    allowedRpaths: [],
  };
  const report = inspectNativeInputs([template, addon], policy);
  assert.equal(report.aggregate.maximumGlibc, "2.34");
  assert.equal(report.ok, false);
  assert.deepEqual(
    report.violations.map(({ code }) => code),
    ["glibc-version", "rpath", "rpath"],
  );
  assert.throws(() => assertNativeInputs([template, addon], policy), NativeBinaryPolicyError);
});

test("Linux policy ratchets C++ ABI and compiler runtime symbol versions", () => {
  const [addon] = temporaryFiles([
    [
      "fflas.node",
      elfFixture({
        glibc: ["2.28"],
        symbolVersions: ["GLIBCXX_3.4.31", "CXXABI_1.3.14", "GCC_12.0.0"],
      }),
    ],
  ]);
  const report = inspectNativeInputs([addon], {
    format: "elf",
    architectures: ["x64"],
    maximumSymbolVersions: {
      CXXABI: "1.3.13",
      GCC: "11.0.0",
      GLIBC: "2.28",
      GLIBCXX: "3.4.30",
    },
  });
  assert.deepEqual(report.aggregate.maximumSymbolVersions, {
    CXXABI: "1.3.14",
    GCC: "12.0.0",
    GLIBC: "2.28",
    GLIBCXX: "3.4.31",
  });
  assert.deepEqual(
    report.violations.map(({ code }) => code),
    ["cxxabi-version", "gcc-version", "glibcxx-version"],
  );
});

test("Mach-O inspection preserves all universal slices and deployment targets", () => {
  const arm64 = thinMachoFixture({ architecture: "arm64", minimumMacos: "13.5" });
  const x64 = thinMachoFixture({ architecture: "x64", minimumMacos: "12.0" });
  const report = inspectBinaryBuffer(
    universalMachoFixture([
      { machine: 0x0100000c, buffer: arm64 },
      { machine: 0x01000007, buffer: x64 },
    ]),
  );
  assert.equal(report.format, "macho");
  assert.equal(report.universal, true);
  assert.deepEqual(report.architectures, ["arm64", "x64"]);
  assert.deepEqual(
    report.slices.map(({ architecture, minimumMacos }) => [architecture, minimumMacos]),
    [
      ["arm64", "13.5.0"],
      ["x64", "12.0.0"],
    ],
  );
  assert.equal(report.maximumMinimumMacos, "13.5.0");
});

test("macOS policy can require a genuinely fat, uniformly targeted input", () => {
  const universal = universalMachoFixture([
    {
      machine: 0x0100000c,
      buffer: thinMachoFixture({ architecture: "arm64", minimumMacos: "13.5" }),
    },
    {
      machine: 0x01000007,
      buffer: thinMachoFixture({ architecture: "x64", minimumMacos: "12.0" }),
    },
  ]);
  const [path] = temporaryFiles([["sagejs", universal]]);
  const report = inspectNativeInputs([path], {
    format: "macho",
    architectures: ["arm64", "x64"],
    minimumMacos: "12.0",
    allowedDependencyPrefixes: ["/usr/lib/", "/System/Library/"],
    allowedRpathPrefixes: ["/usr/lib/", "/System/Library/"],
  });
  assert.equal(report.ok, false);
  assert.equal(report.violations.length, 1);
  assert.equal(report.violations[0].code, "macos-deployment-target");
  assert.match(report.violations[0].message, /arm64 slice declares macOS 13\.5\.0/);
});

test("Mach-O release policy rejects unbound dylibs and loader-relative rpaths", () => {
  const [path] = temporaryFiles([
    [
      "bad.node",
      thinMachoFixture({
        dependency: "@rpath/libgmp.10.dylib",
        rpath: "@loader_path/native",
      }),
    ],
  ]);
  const report = inspectNativeInputs([path], {
    format: "macho",
    architectures: ["arm64"],
    maximumMinimumMacos: "13.5",
    allowedDependencyPrefixes: ["/usr/lib/", "/System/Library/"],
    allowedRpaths: [],
  });
  assert.deepEqual(
    report.violations.map(({ code }) => code),
    ["dependency", "rpath"],
  );
});

test("PE inspection reports architecture and ordinary plus delayed imports", () => {
  const report = inspectBinaryBuffer(peFixture());
  assert.equal(report.format, "pe");
  assert.equal(report.architecture, "x64");
  assert.deepEqual(report.dependencies, ["KERNEL32.dll"]);
  assert.deepEqual(report.delayDependencies, ["node.exe"]);
});

test("Windows dependency policy is case-insensitive and fail-closed", () => {
  const [path] = temporaryFiles([["flint.node", peFixture()]]);
  const accepted = inspectNativeInputs([path], {
    format: "pe",
    architectures: ["x64"],
    allowedDependencies: ["kernel32.DLL", "NODE.EXE"],
    allowedDependencyPrefixes: ["api-ms-win-"],
  });
  assert.equal(accepted.ok, true);
  const rejected = inspectNativeInputs([path], {
    format: "pe",
    architectures: ["x64"],
    allowedDependencies: ["kernel32.dll"],
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.violations[0].message, /node\.exe/);
});

test("the receipt binds a complete, uniquely labelled input set", () => {
  const [template, addon] = temporaryFiles([
    ["template", elfFixture({ glibc: ["2.17"] })],
    ["addon.node", elfFixture({ glibc: ["2.28"] })],
  ]);
  const policy = {
    format: "elf",
    architectures: ["x64"],
    requiredLabels: ["sea/template", "native/addon.node"],
  };
  const report = inspectNativeInputs(
    [
      { path: template, label: "sea/template", role: "sea-template" },
      { path: addon, label: "native/addon.node", role: "embedded-addon" },
    ],
    policy,
  );
  assert.equal(report.ok, true);
  assert.match(report.inputSetSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    report.files.map(({ label, role }) => [label, role]),
    [
      ["native/addon.node", "embedded-addon"],
      ["sea/template", "sea-template"],
    ],
  );
  const incomplete = inspectNativeInputs(
    [{ path: template, label: "sea/template", role: "sea-template" }],
    policy,
  );
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.violations[0].code, "input-set");
  assert.throws(
    () =>
      inspectNativeInputs(
        [
          { path: template, label: "duplicate" },
          { path: addon, label: "duplicate" },
        ],
        policy,
      ),
    /labels must be unique/,
  );
});

test("malformed and unknown binaries fail instead of producing partial evidence", () => {
  assert.throws(() => inspectBinaryBuffer(Buffer.from("not a binary")), BinaryFormatError);
  const truncatedElf = elfFixture().subarray(0, 80);
  assert.throws(() => inspectBinaryBuffer(truncatedElf), BinaryFormatError);
  const truncatedPe = peFixture().subarray(0, 200);
  assert.throws(() => inspectBinaryBuffer(truncatedPe), BinaryFormatError);
});

test("the CLI emits a deterministic machine-readable report and failure status", () => {
  const [binary] = temporaryFiles([["template", elfFixture({ glibc: ["2.31"] })]]);
  const policyPath = join(binary, "..", "policy.json");
  const outputPath = join(binary, "..", "report.json");
  writeFileSync(
    policyPath,
    JSON.stringify({
      format: "elf",
      architectures: ["x64"],
      maximumGlibc: "2.28",
      allowedDependencies: ["libc.so.6"],
      allowedRpaths: ["/opt/sagejs/lib"],
    }),
  );
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "..", "scripts", "release-native-binary-inspector.cjs"),
      "--policy",
      policyPath,
      "--output",
      outputPath,
      binary,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(report.schema, "sagejs.native-binary-inspection-v1");
  assert.equal(report.aggregate.maximumGlibc, "2.31");
  assert.equal(report.violations[0].code, "glibc-version");
});
