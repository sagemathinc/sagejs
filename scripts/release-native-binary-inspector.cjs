#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { basename } = require("node:path");

const REPORT_SCHEMA = "sagejs.native-binary-inspection-v1";

class BinaryFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "BinaryFormatError";
  }
}

class NativeBinaryPolicyError extends Error {
  constructor(report) {
    const details = report.violations
      .map((violation) => `${violation.file}: ${violation.message}`)
      .join("\n");
    super(`native binary release policy failed:\n${details}`);
    this.name = "NativeBinaryPolicyError";
    this.report = report;
  }
}

function requireRange(buffer, offset, size, description) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    offset + size > buffer.length
  ) {
    throw new BinaryFormatError(
      `${description} is outside the ${buffer.length}-byte binary`,
    );
  }
}

function safeNumber(value, description) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new BinaryFormatError(`${description} exceeds JavaScript's safe integer range`);
  }
  return number;
}

function cString(buffer, offset, limit = buffer.length) {
  requireRange(buffer, offset, 1, "string offset");
  const endLimit = Math.min(limit, buffer.length);
  let end = offset;
  while (end < endLimit && buffer[end] !== 0) end += 1;
  if (end === endLimit) throw new BinaryFormatError("unterminated binary string");
  return buffer.toString("utf8", offset, end);
}

function compareVersions(left, right) {
  const a = String(left).split(".").map(Number);
  const b = String(right).split(".").map(Number);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function maximumVersion(versions) {
  return versions.reduce(
    (maximum, version) =>
      maximum === null || compareVersions(version, maximum) > 0 ? version : maximum,
    null,
  );
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

const ELF_VERSION_FAMILIES = Object.freeze({
  CXXABI: /^CXXABI_(\d+(?:\.\d+)+)$/,
  GCC: /^GCC_(\d+(?:\.\d+)+)$/,
  GLIBC: /^GLIBC_(\d+(?:\.\d+)+)$/,
  GLIBCXX: /^GLIBCXX_(\d+(?:\.\d+)+)$/,
});

function elfSymbolVersionFamilies(versions) {
  const families = {};
  for (const [family, pattern] of Object.entries(ELF_VERSION_FAMILIES)) {
    const values = uniqueSorted(
      versions.map((version) => pattern.exec(version)?.[1]).filter(Boolean),
    );
    values.sort(compareVersions);
    if (values.length > 0) {
      families[family] = { versions: values, maximum: maximumVersion(values) };
    }
  }
  return families;
}

function architectureName(format, machine) {
  const maps = {
    elf: new Map([
      [3, "x86"],
      [40, "arm"],
      [62, "x64"],
      [183, "arm64"],
      [243, "riscv64"],
    ]),
    macho: new Map([
      [7, "x86"],
      [0x01000007, "x64"],
      [12, "arm"],
      [0x0100000c, "arm64"],
    ]),
    pe: new Map([
      [0x014c, "x86"],
      [0x8664, "x64"],
      [0xaa64, "arm64"],
    ]),
  };
  return maps[format].get(machine) ?? `unknown-0x${machine.toString(16)}`;
}

function elfReader(buffer) {
  requireRange(buffer, 0, 16, "ELF identification");
  const wordSize = buffer[4] === 2 ? 64 : buffer[4] === 1 ? 32 : null;
  if (wordSize === null) throw new BinaryFormatError(`unsupported ELF class ${buffer[4]}`);
  const little = buffer[5] === 1;
  if (!little && buffer[5] !== 2) {
    throw new BinaryFormatError(`unsupported ELF byte order ${buffer[5]}`);
  }
  const read16 = (offset) => {
    requireRange(buffer, offset, 2, "ELF uint16");
    return little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  };
  const read32 = (offset) => {
    requireRange(buffer, offset, 4, "ELF uint32");
    return little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  };
  const read64 = (offset) => {
    requireRange(buffer, offset, 8, "ELF uint64");
    return safeNumber(
      little ? buffer.readBigUInt64LE(offset) : buffer.readBigUInt64BE(offset),
      "ELF uint64",
    );
  };
  const readSignedWord = (offset) => {
    if (wordSize === 32) {
      requireRange(buffer, offset, 4, "ELF signed word");
      return little ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
    }
    requireRange(buffer, offset, 8, "ELF signed word");
    return safeNumber(
      little ? buffer.readBigInt64LE(offset) : buffer.readBigInt64BE(offset),
      "ELF signed word",
    );
  };
  return { little, read16, read32, read64, readSignedWord, wordSize };
}

function inspectElf(buffer) {
  const reader = elfReader(buffer);
  const { read16, read32, read64, readSignedWord, wordSize } = reader;
  const headerSize = wordSize === 64 ? 64 : 52;
  requireRange(buffer, 0, headerSize, "ELF header");
  const machine = read16(18);
  const sectionOffset = wordSize === 64 ? read64(40) : read32(32);
  const sectionEntrySize = read16(wordSize === 64 ? 58 : 46);
  const sectionCount = read16(wordSize === 64 ? 60 : 48);
  const sectionNameIndex = read16(wordSize === 64 ? 62 : 50);
  const programOffset = wordSize === 64 ? read64(32) : read32(28);
  const programEntrySize = read16(wordSize === 64 ? 54 : 42);
  const programCount = read16(wordSize === 64 ? 56 : 44);

  if (sectionCount === 0 || sectionNameIndex >= sectionCount) {
    throw new BinaryFormatError("ELF has no usable section-name table");
  }
  requireRange(
    buffer,
    sectionOffset,
    sectionEntrySize * sectionCount,
    "ELF section table",
  );
  const rawSections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionOffset + index * sectionEntrySize;
    const minimumSize = wordSize === 64 ? 64 : 40;
    if (sectionEntrySize < minimumSize) {
      throw new BinaryFormatError(`ELF section entry is only ${sectionEntrySize} bytes`);
    }
    rawSections.push({
      index,
      nameOffset: read32(offset),
      type: read32(offset + 4),
      offset: wordSize === 64 ? read64(offset + 24) : read32(offset + 16),
      size: wordSize === 64 ? read64(offset + 32) : read32(offset + 20),
      link: read32(offset + (wordSize === 64 ? 40 : 24)),
      entrySize: wordSize === 64 ? read64(offset + 56) : read32(offset + 36),
    });
  }
  const names = rawSections[sectionNameIndex];
  requireRange(buffer, names.offset, names.size, "ELF section-name strings");
  const sections = rawSections.map((section) => ({
    ...section,
    name: cString(buffer, names.offset + section.nameOffset, names.offset + names.size),
  }));
  for (const section of sections) {
    if (section.type !== 8) {
      requireRange(buffer, section.offset, section.size, `ELF section ${section.name}`);
    }
  }

  const linkedString = (section, stringOffset) => {
    if (section.link >= sections.length) {
      throw new BinaryFormatError(`ELF section ${section.name} has an invalid string-table link`);
    }
    const strings = sections[section.link];
    requireRange(buffer, strings.offset, strings.size, "ELF linked string table");
    if (stringOffset >= strings.size) {
      throw new BinaryFormatError(`ELF string offset ${stringOffset} is out of range`);
    }
    return cString(buffer, strings.offset + stringOffset, strings.offset + strings.size);
  };

  const needed = [];
  const rpaths = [];
  const dynamic = sections.find((section) => section.type === 6);
  if (dynamic) {
    const entrySize = dynamic.entrySize || (wordSize === 64 ? 16 : 8);
    const minimumSize = wordSize === 64 ? 16 : 8;
    if (entrySize < minimumSize || dynamic.size % entrySize !== 0) {
      throw new BinaryFormatError("ELF dynamic section has an invalid entry size");
    }
    for (let offset = dynamic.offset; offset < dynamic.offset + dynamic.size; offset += entrySize) {
      const tag = readSignedWord(offset);
      if (tag === 0) break;
      const value = wordSize === 64 ? read64(offset + 8) : read32(offset + 4);
      if (tag === 1) needed.push(linkedString(dynamic, value));
      if (tag === 15 || tag === 29) {
        rpaths.push(...linkedString(dynamic, value).split(":"));
      }
    }
  }

  const requiredVersions = [];
  for (const verneed of sections.filter((section) => section.type === 0x6ffffffe)) {
    let relative = 0;
    const seen = new Set();
    while (relative < verneed.size) {
      if (seen.has(relative)) throw new BinaryFormatError("cyclic ELF version requirement table");
      seen.add(relative);
      const offset = verneed.offset + relative;
      requireRange(buffer, offset, 16, "ELF version requirement");
      const auxiliaryCount = read16(offset + 2);
      let auxiliaryRelative = read32(offset + 8);
      const next = read32(offset + 12);
      for (let index = 0; index < auxiliaryCount; index += 1) {
        const auxiliary = offset + auxiliaryRelative;
        requireRange(buffer, auxiliary, 16, "ELF auxiliary version requirement");
        requiredVersions.push(linkedString(verneed, read32(auxiliary + 8)));
        const auxiliaryNext = read32(auxiliary + 12);
        if (index + 1 < auxiliaryCount && auxiliaryNext === 0) {
          throw new BinaryFormatError("truncated ELF auxiliary version chain");
        }
        auxiliaryRelative += auxiliaryNext;
      }
      if (next === 0) break;
      relative += next;
    }
  }

  let interpreter = null;
  if (programCount > 0) {
    requireRange(
      buffer,
      programOffset,
      programEntrySize * programCount,
      "ELF program table",
    );
    for (let index = 0; index < programCount; index += 1) {
      const offset = programOffset + index * programEntrySize;
      if (programEntrySize < (wordSize === 64 ? 56 : 32)) {
        throw new BinaryFormatError("ELF program entry is too small");
      }
      if (read32(offset) !== 3) continue;
      const dataOffset = wordSize === 64 ? read64(offset + 8) : read32(offset + 4);
      const dataSize = wordSize === 64 ? read64(offset + 32) : read32(offset + 16);
      requireRange(buffer, dataOffset, dataSize, "ELF interpreter");
      interpreter = cString(buffer, dataOffset, dataOffset + dataSize);
    }
  }

  const symbolVersionFamilies = elfSymbolVersionFamilies(requiredVersions);
  const glibcVersions = symbolVersionFamilies.GLIBC?.versions ?? [];
  return {
    format: "elf",
    wordSize,
    endianness: reader.little ? "little" : "big",
    architecture: architectureName("elf", machine),
    machine,
    osAbi: buffer[7],
    interpreter,
    dependencies: uniqueSorted(needed),
    rpaths: uniqueSorted(rpaths.filter(Boolean)),
    requiredSymbolVersions: uniqueSorted(requiredVersions),
    symbolVersionFamilies,
    glibcVersions,
    maximumGlibc: maximumVersion(glibcVersions),
  };
}

function machoReader(buffer, little) {
  const read32 = (offset) => {
    requireRange(buffer, offset, 4, "Mach-O uint32");
    return little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  };
  const read64 = (offset) => {
    requireRange(buffer, offset, 8, "Mach-O uint64");
    return safeNumber(
      little ? buffer.readBigUInt64LE(offset) : buffer.readBigUInt64BE(offset),
      "Mach-O uint64",
    );
  };
  return { read32, read64 };
}

function encodedAppleVersion(value) {
  return `${value >>> 16}.${(value >>> 8) & 0xff}.${value & 0xff}`;
}

function inspectThinMacho(buffer, containerOffset = 0) {
  requireRange(buffer, containerOffset, 4, "Mach-O magic");
  const magic = buffer.readUInt32LE(containerOffset);
  const little = magic === 0xfeedface || magic === 0xfeedfacf;
  const is64 = magic === 0xfeedfacf || magic === 0xcffaedfe;
  if (!little && magic !== 0xcefaedfe && magic !== 0xcffaedfe) {
    throw new BinaryFormatError("unsupported Mach-O magic");
  }
  const { read32 } = machoReader(buffer, little);
  const headerSize = is64 ? 32 : 28;
  requireRange(buffer, containerOffset, headerSize, "Mach-O header");
  const machine = read32(containerOffset + 4);
  const commandCount = read32(containerOffset + 16);
  const commandBytes = read32(containerOffset + 20);
  const commandsStart = containerOffset + headerSize;
  requireRange(buffer, commandsStart, commandBytes, "Mach-O load commands");

  const dependencies = [];
  const rpaths = [];
  const deploymentTargets = [];
  let offset = commandsStart;
  for (let index = 0; index < commandCount; index += 1) {
    requireRange(buffer, offset, 8, "Mach-O load command");
    const command = read32(offset);
    const commandSize = read32(offset + 4);
    if (commandSize < 8 || offset + commandSize > commandsStart + commandBytes) {
      throw new BinaryFormatError("Mach-O load command has an invalid size");
    }
    const baseCommand = command & ~0x80000000;
    if ([0x0c, 0x18, 0x1f, 0x20, 0x23].includes(baseCommand)) {
      requireRange(buffer, offset, 24, "Mach-O dylib command");
      const nameOffset = read32(offset + 8);
      if (nameOffset >= commandSize) throw new BinaryFormatError("invalid Mach-O dylib name");
      dependencies.push(cString(buffer, offset + nameOffset, offset + commandSize));
    } else if (baseCommand === 0x1c) {
      requireRange(buffer, offset, 12, "Mach-O rpath command");
      const pathOffset = read32(offset + 8);
      if (pathOffset >= commandSize) throw new BinaryFormatError("invalid Mach-O rpath");
      rpaths.push(cString(buffer, offset + pathOffset, offset + commandSize));
    } else if (command === 0x32) {
      requireRange(buffer, offset, 24, "Mach-O build-version command");
      const platform = read32(offset + 8);
      if (platform === 1) deploymentTargets.push(encodedAppleVersion(read32(offset + 12)));
    } else if (command === 0x24) {
      requireRange(buffer, offset, 16, "Mach-O minimum-version command");
      deploymentTargets.push(encodedAppleVersion(read32(offset + 8)));
    }
    offset += commandSize;
  }
  if (offset !== commandsStart + commandBytes) {
    throw new BinaryFormatError("Mach-O load-command count does not match its byte size");
  }
  const uniqueTargets = uniqueSorted(deploymentTargets);
  uniqueTargets.sort(compareVersions);
  return {
    architecture: architectureName("macho", machine),
    machine,
    wordSize: is64 ? 64 : 32,
    endianness: little ? "little" : "big",
    dependencies: uniqueSorted(dependencies),
    rpaths: uniqueSorted(rpaths),
    minimumMacos: maximumVersion(uniqueTargets),
    declaredMinimumMacos: uniqueTargets,
  };
}

function inspectMacho(buffer) {
  requireRange(buffer, 0, 4, "Mach-O magic");
  const magic = buffer.readUInt32BE(0);
  const fatMagic = new Map([
    [0xcafebabe, { little: false, is64: false }],
    [0xbebafeca, { little: true, is64: false }],
    [0xcafebabf, { little: false, is64: true }],
    [0xbfbafeca, { little: true, is64: true }],
  ]).get(magic);
  let slices;
  if (fatMagic) {
    const { read32, read64 } = machoReader(buffer, fatMagic.little);
    const count = read32(4);
    const entrySize = fatMagic.is64 ? 32 : 20;
    requireRange(buffer, 8, count * entrySize, "Mach-O universal slice table");
    slices = [];
    for (let index = 0; index < count; index += 1) {
      const offset = 8 + index * entrySize;
      const machine = read32(offset);
      const sliceOffset = fatMagic.is64 ? read64(offset + 8) : read32(offset + 8);
      const sliceSize = fatMagic.is64 ? read64(offset + 16) : read32(offset + 12);
      requireRange(buffer, sliceOffset, sliceSize, "Mach-O universal slice");
      const slice = inspectThinMacho(buffer.subarray(sliceOffset, sliceOffset + sliceSize));
      if (slice.machine !== machine) {
        throw new BinaryFormatError("Mach-O universal header disagrees with its slice");
      }
      slices.push(slice);
    }
  } else {
    slices = [inspectThinMacho(buffer)];
  }
  const architectures = slices.map((slice) => slice.architecture);
  if (new Set(architectures).size !== architectures.length) {
    throw new BinaryFormatError("Mach-O contains duplicate architecture slices");
  }
  return {
    format: "macho",
    universal: slices.length > 1,
    architectures: [...architectures].sort(),
    slices: slices.sort((left, right) => left.architecture.localeCompare(right.architecture)),
    dependencies: uniqueSorted(slices.flatMap((slice) => slice.dependencies)),
    rpaths: uniqueSorted(slices.flatMap((slice) => slice.rpaths)),
    maximumMinimumMacos: maximumVersion(
      slices.map((slice) => slice.minimumMacos).filter(Boolean),
    ),
  };
}

function peRvaToOffset(rva, size, sections) {
  for (const section of sections) {
    const extent = Math.max(section.virtualSize, section.rawSize);
    if (rva < section.virtualAddress || rva + size > section.virtualAddress + extent) continue;
    const relative = rva - section.virtualAddress;
    if (relative + size > section.rawSize) {
      throw new BinaryFormatError("PE RVA refers to virtual data absent from the file");
    }
    return section.rawOffset + relative;
  }
  throw new BinaryFormatError(`PE RVA 0x${rva.toString(16)} is not mapped by a section`);
}

function peRvaString(buffer, rva, sections) {
  for (const section of sections) {
    const extent = Math.max(section.virtualSize, section.rawSize);
    if (rva < section.virtualAddress || rva >= section.virtualAddress + extent) continue;
    const relative = rva - section.virtualAddress;
    if (relative >= section.rawSize) {
      throw new BinaryFormatError("PE string RVA refers to virtual data absent from the file");
    }
    return cString(
      buffer,
      section.rawOffset + relative,
      section.rawOffset + section.rawSize,
    );
  }
  throw new BinaryFormatError(`PE string RVA 0x${rva.toString(16)} is not mapped`);
}

function inspectPe(buffer) {
  requireRange(buffer, 0, 0x40, "DOS header");
  const peOffset = buffer.readUInt32LE(0x3c);
  requireRange(buffer, peOffset, 24, "PE header");
  if (buffer.toString("binary", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new BinaryFormatError("invalid PE signature");
  }
  const coff = peOffset + 4;
  const machine = buffer.readUInt16LE(coff);
  const sectionCount = buffer.readUInt16LE(coff + 2);
  const optionalSize = buffer.readUInt16LE(coff + 16);
  const optional = coff + 20;
  requireRange(buffer, optional, optionalSize, "PE optional header");
  const magic = buffer.readUInt16LE(optional);
  const is64 = magic === 0x20b;
  if (!is64 && magic !== 0x10b) throw new BinaryFormatError("unsupported PE optional header");
  const requiredOptionalSize = is64 ? 112 : 96;
  if (optionalSize < requiredOptionalSize) {
    throw new BinaryFormatError("PE optional header is too small for its data directories");
  }
  const dataDirectory = optional + (is64 ? 112 : 96);
  const directoryCountOffset = optional + (is64 ? 108 : 92);
  const directoryCount = buffer.readUInt32LE(directoryCountOffset);
  const imageBase = is64
    ? safeNumber(buffer.readBigUInt64LE(optional + 24), "PE image base")
    : buffer.readUInt32LE(optional + 28);
  const sectionsOffset = optional + optionalSize;
  requireRange(buffer, sectionsOffset, sectionCount * 40, "PE section table");
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionsOffset + index * 40;
    sections.push({
      virtualSize: buffer.readUInt32LE(offset + 8),
      virtualAddress: buffer.readUInt32LE(offset + 12),
      rawSize: buffer.readUInt32LE(offset + 16),
      rawOffset: buffer.readUInt32LE(offset + 20),
    });
  }
  const directory = (index) => {
    if (index >= directoryCount || dataDirectory + (index + 1) * 8 > optional + optionalSize) {
      return { rva: 0, size: 0 };
    }
    return {
      rva: buffer.readUInt32LE(dataDirectory + index * 8),
      size: buffer.readUInt32LE(dataDirectory + index * 8 + 4),
    };
  };

  const imports = [];
  const ordinary = directory(1);
  if (ordinary.rva !== 0 && ordinary.size !== 0) {
    if (ordinary.size < 20) throw new BinaryFormatError("truncated PE import directory");
    const start = peRvaToOffset(ordinary.rva, ordinary.size, sections);
    const end = Math.min(start + ordinary.size, buffer.length);
    let terminated = false;
    for (let offset = start; offset + 20 <= end; offset += 20) {
      const fields = Array.from({ length: 5 }, (_, index) => buffer.readUInt32LE(offset + index * 4));
      if (fields.every((value) => value === 0)) {
        terminated = true;
        break;
      }
      imports.push(peRvaString(buffer, fields[3], sections));
    }
    if (!terminated) throw new BinaryFormatError("unterminated PE import directory");
  }

  const delayed = [];
  const delayDirectory = directory(13);
  if (delayDirectory.rva !== 0 && delayDirectory.size !== 0) {
    if (delayDirectory.size < 32) {
      throw new BinaryFormatError("truncated PE delay-import directory");
    }
    const start = peRvaToOffset(delayDirectory.rva, delayDirectory.size, sections);
    const end = Math.min(start + delayDirectory.size, buffer.length);
    let terminated = false;
    for (let offset = start; offset + 32 <= end; offset += 32) {
      const attributes = buffer.readUInt32LE(offset);
      let name = buffer.readUInt32LE(offset + 4);
      if (attributes === 0 && name === 0) {
        terminated = true;
        break;
      }
      if ((attributes & 1) === 0) {
        if (name < imageBase) throw new BinaryFormatError("invalid PE delay-import address");
        name -= imageBase;
      }
      delayed.push(peRvaString(buffer, name, sections));
    }
    if (!terminated) throw new BinaryFormatError("unterminated PE delay-import directory");
  }
  return {
    format: "pe",
    wordSize: is64 ? 64 : 32,
    architecture: architectureName("pe", machine),
    machine,
    subsystem: buffer.readUInt16LE(optional + 68),
    dependencies: uniqueSorted(imports),
    delayDependencies: uniqueSorted(delayed),
  };
}

function inspectBinaryBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("binary must be a Buffer");
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    return inspectElf(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return inspectPe(buffer);
  }
  if (buffer.length >= 4) {
    const magic = buffer.readUInt32BE(0);
    const machoMagics = new Set([
      0xcafebabe,
      0xbebafeca,
      0xcafebabf,
      0xbfbafeca,
      0xfeedface,
      0xcefaedfe,
      0xfeedfacf,
      0xcffaedfe,
    ]);
    if (machoMagics.has(magic)) return inspectMacho(buffer);
  }
  throw new BinaryFormatError("unrecognized native binary format");
}

function inspectNativeBinary(path, label = basename(path), role = "native-input") {
  const buffer = readFileSync(path);
  return {
    label,
    role,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    ...inspectBinaryBuffer(buffer),
  };
}

function allowedValue(value, exact = [], prefixes = [], caseInsensitive = false) {
  const candidate = caseInsensitive ? value.toLowerCase() : value;
  const normalizedExact = exact.map((item) => (caseInsensitive ? item.toLowerCase() : item));
  const normalizedPrefixes = prefixes.map((item) =>
    caseInsensitive ? item.toLowerCase() : item,
  );
  return (
    normalizedExact.includes(candidate) ||
    normalizedPrefixes.some((prefix) => candidate.startsWith(prefix))
  );
}

function reportArchitectures(file) {
  return file.format === "macho" ? file.architectures : [file.architecture];
}

function addViolation(violations, file, code, message, details = {}) {
  violations.push({ file: file.label, code, message, ...details });
}

function inspectNativeInputs(inputs, policy) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError("native inputs must be a nonempty array");
  }
  if (!policy || typeof policy !== "object") throw new TypeError("policy is required");
  const files = inputs
    .map((input) =>
      typeof input === "string"
        ? inspectNativeBinary(input)
        : inspectNativeBinary(
            input.path,
            input.label ?? basename(input.path),
            input.role ?? "native-input",
          ),
    )
    .sort((left, right) => left.label.localeCompare(right.label));
  if (new Set(files.map((file) => file.label)).size !== files.length) {
    throw new TypeError("native input labels must be unique");
  }
  const violations = [];
  if (policy.requiredLabels) {
    const expected = uniqueSorted(policy.requiredLabels);
    const actual = files.map((file) => file.label);
    if (
      expected.length !== actual.length ||
      expected.some((label, index) => label !== actual[index])
    ) {
      violations.push({
        file: "<input-set>",
        code: "input-set",
        message: `expected exactly ${expected.join(", ")}; found ${actual.join(", ")}`,
        expected,
        actual,
      });
    }
  }
  const expectedArchitectures = uniqueSorted(policy.architectures ?? []);
  for (const file of files) {
    if (policy.format && file.format !== policy.format) {
      addViolation(
        violations,
        file,
        "format",
        `expected ${policy.format}, found ${file.format}`,
      );
      continue;
    }
    if (expectedArchitectures.length > 0) {
      const actual = [...reportArchitectures(file)].sort();
      const exact = policy.exactArchitectures !== false;
      const acceptable = exact
        ? actual.length === expectedArchitectures.length &&
          actual.every((architecture, index) => architecture === expectedArchitectures[index])
        : actual.every((architecture) => expectedArchitectures.includes(architecture));
      if (!acceptable) {
        addViolation(
          violations,
          file,
          "architecture",
          `expected ${exact ? "exactly " : "only "}${expectedArchitectures.join(", ")}; found ${actual.join(", ")}`,
          { expected: expectedArchitectures, actual },
        );
      }
    }

    if (file.format === "elf") {
      const maxima = {
        ...policy.maximumSymbolVersions,
        ...(policy.maximumGlibc ? { GLIBC: policy.maximumGlibc } : {}),
      };
      for (const [family, maximum] of Object.entries(maxima)) {
        const required = file.symbolVersionFamilies[family]?.maximum;
        if (required && compareVersions(required, maximum) > 0) {
          addViolation(
            violations,
            file,
            `${family.toLowerCase()}-version`,
            `requires ${family} ${required}, newer than allowed ${maximum}`,
          );
        }
      }
    }
    if (file.format === "macho") {
      for (const slice of file.slices) {
        if (!slice.minimumMacos && policy.requireMinimumMacos !== false) {
          addViolation(
            violations,
            file,
            "macos-deployment-target",
            `${slice.architecture} slice has no macOS deployment target`,
          );
        }
        if (
          policy.minimumMacos &&
          slice.declaredMinimumMacos.some(
            (version) => compareVersions(version, policy.minimumMacos) !== 0,
          )
        ) {
          addViolation(
            violations,
            file,
            "macos-deployment-target",
            `${slice.architecture} slice declares macOS ${slice.declaredMinimumMacos.join(", ")}; expected exactly ${policy.minimumMacos}`,
          );
        }
        if (
          policy.maximumMinimumMacos &&
          slice.minimumMacos &&
          compareVersions(slice.minimumMacos, policy.maximumMinimumMacos) > 0
        ) {
          addViolation(
            violations,
            file,
            "macos-deployment-target",
            `${slice.architecture} slice requires macOS ${slice.minimumMacos}, newer than allowed ${policy.maximumMinimumMacos}`,
          );
        }
      }
    }

    const dependencies = [
      ...file.dependencies,
      ...(file.delayDependencies ?? []),
    ];
    if (policy.allowedDependencies || policy.allowedDependencyPrefixes) {
      for (const dependency of dependencies) {
        if (
          !allowedValue(
            dependency,
            policy.allowedDependencies,
            policy.allowedDependencyPrefixes,
            file.format === "pe",
          )
        ) {
          addViolation(
            violations,
            file,
            "dependency",
            `dependency is not allowed: ${dependency}`,
            { dependency },
          );
        }
      }
    }
    if (file.rpaths && (policy.allowedRpaths || policy.allowedRpathPrefixes)) {
      for (const rpath of file.rpaths) {
        if (!allowedValue(rpath, policy.allowedRpaths, policy.allowedRpathPrefixes)) {
          addViolation(violations, file, "rpath", `runtime search path is not allowed: ${rpath}`, {
            rpath,
          });
        }
      }
    }
  }

  const glibc = maximumVersion(files.map((file) => file.maximumGlibc).filter(Boolean));
  const minimumMacos = maximumVersion(
    files.map((file) => file.maximumMinimumMacos).filter(Boolean),
  );
  const maximumSymbolVersions = {};
  for (const family of Object.keys(ELF_VERSION_FAMILIES)) {
    const maximum = maximumVersion(
      files
        .map((file) => file.symbolVersionFamilies?.[family]?.maximum)
        .filter(Boolean),
    );
    if (maximum) maximumSymbolVersions[family] = maximum;
  }
  const inputSetSha256 = createHash("sha256")
    .update(
      JSON.stringify(
        files.map(({ label, role, sha256, size }) => ({ label, role, sha256, size })),
      ),
    )
    .digest("hex");
  return {
    schema: REPORT_SCHEMA,
    inputSetSha256,
    policy,
    aggregate: {
      formats: uniqueSorted(files.map((file) => file.format)),
      architectures: uniqueSorted(files.flatMap(reportArchitectures)),
      dependencies: uniqueSorted(
        files.flatMap((file) => [
          ...file.dependencies,
          ...(file.delayDependencies ?? []),
        ]),
      ),
      maximumGlibc: glibc,
      maximumSymbolVersions,
      maximumMinimumMacos: minimumMacos,
    },
    files,
    ok: violations.length === 0,
    violations,
  };
}

function assertNativeInputs(inputs, policy) {
  const report = inspectNativeInputs(inputs, policy);
  if (!report.ok) throw new NativeBinaryPolicyError(report);
  return report;
}

function parseCommandLine(arguments_) {
  const argumentsCopy = [...arguments_];
  let policyPath = null;
  let outputPath = null;
  const files = [];
  while (argumentsCopy.length > 0) {
    const argument = argumentsCopy.shift();
    if (argument === "--policy") policyPath = argumentsCopy.shift();
    else if (argument === "--output") outputPath = argumentsCopy.shift();
    else if (argument === "--help" || argument === "-h") return { help: true };
    else if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    else files.push(argument);
  }
  if (!policyPath || files.length === 0) {
    throw new Error("usage: release-native-binary-inspector.cjs --policy POLICY.json [--output REPORT.json] BINARY...");
  }
  return { files, outputPath, policyPath };
}

function main() {
  const options = parseCommandLine(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      "usage: release-native-binary-inspector.cjs --policy POLICY.json [--output REPORT.json] BINARY...\n",
    );
    return;
  }
  const policy = JSON.parse(readFileSync(options.policyPath, "utf8"));
  const report = inspectNativeInputs(options.files, policy);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.outputPath) writeFileSync(options.outputPath, serialized);
  else process.stdout.write(serialized);
  if (!report.ok) process.exitCode = 1;
}

module.exports = {
  BinaryFormatError,
  NativeBinaryPolicyError,
  REPORT_SCHEMA,
  assertNativeInputs,
  compareVersions,
  inspectBinaryBuffer,
  inspectNativeBinary,
  inspectNativeInputs,
};

if (require.main === module) main();
