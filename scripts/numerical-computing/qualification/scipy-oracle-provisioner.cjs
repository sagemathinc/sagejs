"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const zlib = require("node:zlib");

const {
  canonicalJson,
  contentId,
  parseJsonText,
  platformIdentity,
  pretty,
  sha256,
} = require("../common.cjs");
const {
  CATALOG_PATH,
  POLICY,
  PROVENANCE_SCHEMA,
  PROVISIONING_POLICY,
  _testing: { completePrefixClosure },
  validateCatalog,
} = require("./scipy-oracle.cjs");

const LIMITS = PROVISIONING_POLICY.limits;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function fail(message) {
  throw new Error(`SciPy oracle provisioner: ${message}`);
}

function regularFile(filename, label) {
  const absolute = path.resolve(filename);
  const status = fs.lstatSync(absolute);
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1) {
    fail(`${label} must be a regular, unique, non-link file`);
  }
  if (fs.realpathSync(absolute) !== absolute) fail(`${label} path must be canonical and link-free`);
  return absolute;
}

function canonicalDirectory(filename, label) {
  const absolute = path.resolve(filename);
  const status = fs.lstatSync(absolute);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail(`${label} must be a real directory`);
  }
  if (fs.realpathSync(absolute) !== absolute) fail(`${label} must be canonical and link-free`);
  return absolute;
}

function outputParent(filename, label) {
  const absolute = path.resolve(filename);
  const parent = canonicalDirectory(path.dirname(absolute), `${label} parent`);
  if (path.dirname(absolute) !== parent) fail(`${label} parent is a noncanonical alias`);
  return { absolute, parent };
}

function portableComponent(component, label) {
  const stem = component.split(".", 1)[0].toLocaleUpperCase("en-US");
  if (component.length === 0 || component === "." || component === ".." ||
      component.endsWith(".") || component.endsWith(" ") ||
      !/^[A-Za-z0-9._+@ -]+$/.test(component) ||
      /[\\:\x00-\x1f\x7f]/.test(component) ||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
    fail(`${label} contains a nonportable path component`);
  }
}

function archivePath(value, label, { directory = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value) > LIMITS.path_bytes) {
    fail(`${label} is empty or exceeds the path budget`);
  }
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.includes("\\") ||
      /[\x00-\x1f\x7f]/.test(value)) {
    fail(`${label} is absolute or nonportable`);
  }
  const withoutSlash = directory && value.endsWith("/") ? value.slice(0, -1) : value;
  const components = withoutSlash.split("/");
  for (const component of components) portableComponent(component, label);
  return components.join("/");
}

function strippedPythonPath(value, label, options = {}) {
  const portable = archivePath(value, label, options);
  if (portable === "python") return "";
  if (!portable.startsWith(PROVISIONING_POLICY.python_archive.strip_prefix)) {
    fail(`${label} lies outside the exact python/ archive root`);
  }
  const stripped = portable.slice(PROVISIONING_POLICY.python_archive.strip_prefix.length);
  if (stripped === "share/terminfo" || stripped.startsWith("share/terminfo/")) return null;
  return stripped;
}

function safeDestination(root, relative, label) {
  const portable = archivePath(relative, label);
  const absolute = path.join(root, ...portable.split("/"));
  const relation = path.relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail(`${label} escapes the staging prefix`);
  }
  return absolute;
}

function tarNumber(bytes, label) {
  if ((bytes[0] & 0x80) !== 0) fail(`${label} uses unsupported base-256 encoding`);
  const text = bytes.toString("ascii").replace(/\0.*$/, "").trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) fail(`${label} is not an octal integer`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) fail(`${label} exceeds the safe integer range`);
  return value;
}

function tarText(bytes, label) {
  const end = bytes.indexOf(0);
  const slice = end < 0 ? bytes : bytes.subarray(0, end);
  try {
    return UTF8.decode(slice);
  } catch {
    fail(`${label} is not UTF-8`);
  }
}

function parseTarHeader(header) {
  const checksum = tarNumber(header.subarray(148, 156), "tar checksum");
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  const actual = copy.reduce((total, byte) => total + byte, 0);
  if (checksum !== actual) fail("tar header checksum mismatch");
  const name = tarText(header.subarray(0, 100), "tar member name");
  const prefix = tarText(header.subarray(345, 500), "tar member prefix");
  return {
    name: prefix ? `${prefix}/${name}` : name,
    mode: tarNumber(header.subarray(100, 108), "tar mode"),
    size: tarNumber(header.subarray(124, 136), "tar member size"),
    type: String.fromCharCode(header[156] || 0),
    link: tarText(header.subarray(157, 257), "tar link target"),
  };
}

function parsePax(bytes) {
  const result = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    if (space < 0) fail("PAX record has no length delimiter");
    const lengthText = bytes.subarray(offset, space).toString("ascii");
    if (!/^[1-9][0-9]*$/.test(lengthText)) fail("PAX record has invalid length");
    const length = Number(lengthText);
    if (!Number.isSafeInteger(length) || offset + length > bytes.length) {
      fail("PAX record exceeds its member");
    }
    const record = UTF8.decode(bytes.subarray(space + 1, offset + length));
    if (!record.endsWith("\n")) fail("PAX record lacks newline terminator");
    const equals = record.indexOf("=");
    if (equals < 1) fail("PAX record lacks a key/value delimiter");
    const key = record.slice(0, equals);
    if (Object.hasOwn(result, key)) fail(`PAX record repeats key ${key}`);
    result[key] = record.slice(equals + 1, -1);
    offset += length;
  }
  return result;
}

class AsyncReader {
  constructor(stream) {
    this.iterator = stream[Symbol.asyncIterator]();
    this.buffer = Buffer.alloc(0);
    this.done = false;
  }

  async read(size, { eof = false } = {}) {
    while (this.buffer.length < size && !this.done) {
      const next = await this.iterator.next();
      if (next.done) this.done = true;
      else this.buffer = this.buffer.length === 0
        ? Buffer.from(next.value)
        : Buffer.concat([this.buffer, next.value]);
    }
    if (this.buffer.length < size) {
      if (eof && this.buffer.length === 0) return null;
      fail("compressed tar archive is truncated");
    }
    const value = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return value;
  }

  async rest() {
    const chunks = [this.buffer];
    this.buffer = Buffer.alloc(0);
    while (!this.done) {
      const next = await this.iterator.next();
      if (next.done) this.done = true;
      else chunks.push(Buffer.from(next.value));
    }
    return Buffer.concat(chunks);
  }
}

async function extractPythonArchive(filename, destination) {
  const stream = fs.createReadStream(filename).pipe(zlib.createGunzip());
  const reader = new AsyncReader(stream);
  const seen = new Set();
  const regular = new Map();
  const links = new Map();
  let entries = 0;
  let expanded = 0;
  let pendingPax = null;
  let globalPax = {};
  let longName = null;
  let longLink = null;
  let zeroBlocks = 0;
  while (true) {
    const headerBytes = await reader.read(512, { eof: true });
    if (headerBytes === null) break;
    if (headerBytes.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      if (zeroBlocks >= 2) {
        const trailing = await reader.rest();
        if (!trailing.every((byte) => byte === 0)) {
          fail("nonzero data follows the tar end marker");
        }
        break;
      }
      continue;
    }
    if (zeroBlocks !== 0) fail("nonzero tar header follows an end marker");
    const header = parseTarHeader(headerBytes);
    if (header.size > LIMITS.member_bytes) fail("tar member exceeds the per-member budget");
    expanded += header.size;
    entries += 1;
    if (expanded > LIMITS.expanded_bytes || entries > LIMITS.entries) {
      fail("tar archive exceeds its expansion budget");
    }
    const contents = await reader.read(header.size);
    const padding = (512 - (header.size % 512)) % 512;
    if (padding !== 0) await reader.read(padding);
    if (header.type === "x" || header.type === "g") {
      const pax = parsePax(contents);
      if (header.type === "g") globalPax = { ...globalPax, ...pax };
      else pendingPax = pax;
      continue;
    }
    if (header.type === "L" || header.type === "K") {
      const text = tarText(contents, header.type === "L" ? "GNU long name" : "GNU long link");
      if (header.type === "L") longName = text;
      else longLink = text;
      continue;
    }
    const pax = { ...globalPax, ...(pendingPax ?? {}) };
    const name = pax.path ?? longName ?? header.name;
    const link = pax.linkpath ?? longLink ?? header.link;
    const size = pax.size === undefined ? header.size : Number(pax.size);
    pendingPax = null;
    longName = null;
    longLink = null;
    if (!Number.isSafeInteger(size) || size !== contents.length) fail("PAX size is inconsistent");
    const type = header.type === "\0" || header.type === "" ? "0" : header.type;
    if (type === "1") fail("tar hardlink members are forbidden");
    if (!["0", "2", "5"].includes(type)) fail(`tar member type ${JSON.stringify(type)} is forbidden`);
    const relative = strippedPythonPath(name, "tar member", { directory: type === "5" });
    if (relative === null || relative === "") continue;
    const folded = relative.toLocaleLowerCase("en-US");
    if (seen.has(folded)) fail(`tar archive contains duplicate or case-colliding ${relative}`);
    seen.add(folded);
    if (type === "5") {
      fs.mkdirSync(safeDestination(destination, relative, "tar directory"), {
        recursive: true,
        mode: 0o755,
      });
      continue;
    }
    if (type === "2") {
      if (link.startsWith("/") || /^[A-Za-z]:/.test(link) || link.includes("\\")) {
        fail(`tar symlink ${relative} has an external or nonportable target`);
      }
      const sourceArchivePath = `python/${relative}`;
      const targetArchivePath = path.posix.normalize(path.posix.join(
        path.posix.dirname(sourceArchivePath),
        link,
      ));
      const target = strippedPythonPath(targetArchivePath, `tar symlink ${relative} target`);
      if (target === null || target === "") fail(`tar symlink ${relative} targets pruned content`);
      links.set(relative, target);
      continue;
    }
    const output = safeDestination(destination, relative, "tar file");
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o755 });
    fs.writeFileSync(output, contents, {
      flag: "wx",
      mode: (header.mode & 0o111) === 0 ? 0o644 : 0o755,
    });
    regular.set(relative, output);
  }
  if (pendingPax !== null || longName !== null || longLink !== null) {
    fail("tar archive ends with unapplied metadata");
  }
  const resolving = new Set();
  function materialize(name) {
    if (regular.has(name)) return regular.get(name);
    const target = links.get(name);
    if (target === undefined) fail(`tar symlink ${name} targets missing ${target}`);
    if (resolving.has(name)) fail(`tar symlink cycle includes ${name}`);
    resolving.add(name);
    const source = materialize(target);
    resolving.delete(name);
    const output = safeDestination(destination, name, "materialized tar link");
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o755 });
    fs.copyFileSync(source, output, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(output, fs.statSync(source).mode & 0o777);
    if (fs.lstatSync(output).nlink !== 1) fail(`materialized tar link ${name} is not unique`);
    regular.set(name, output);
    return output;
  }
  for (const name of [...links.keys()].sort()) materialize(name);
}

function zipEntries(bytes) {
  let eocd = -1;
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || eocd + 22 > bytes.length) fail("wheel has no valid ZIP end record");
  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const count = bytes.readUInt16LE(eocd + 10);
  const centralBytes = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const commentBytes = bytes.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== count || count === 0 ||
      count === 0xffff || centralBytes === 0xffffffff || centralOffset === 0xffffffff ||
      eocd + 22 + commentBytes !== bytes.length || centralOffset + centralBytes !== eocd ||
      count > LIMITS.entries) {
    fail("wheel ZIP topology is unsupported or inconsistent");
  }
  const entries = [];
  const folded = new Set();
  const offsets = new Set();
  let offset = centralOffset;
  let expanded = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > eocd || bytes.readUInt32LE(offset) !== 0x02014b50) {
      fail("wheel central directory is truncated");
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const crc = bytes.readUInt32LE(offset + 16);
    const compressed = bytes.readUInt32LE(offset + 20);
    const size = bytes.readUInt32LE(offset + 24);
    const nameBytes = bytes.readUInt16LE(offset + 28);
    const extraBytes = bytes.readUInt16LE(offset + 30);
    const comment = bytes.readUInt16LE(offset + 32);
    const diskStart = bytes.readUInt16LE(offset + 34);
    const external = bytes.readUInt32LE(offset + 38);
    const localOffset = bytes.readUInt32LE(offset + 42);
    if ((flags & ~0x0808) !== 0 || ![0, 8].includes(method) || diskStart !== 0 ||
        [compressed, size, localOffset].includes(0xffffffff) || size > LIMITS.member_bytes) {
      fail("wheel member uses unsupported ZIP features");
    }
    const end = offset + 46 + nameBytes + extraBytes + comment;
    if (end > eocd) fail("wheel central member exceeds the directory");
    let name;
    try {
      name = UTF8.decode(bytes.subarray(offset + 46, offset + 46 + nameBytes));
    } catch {
      fail("wheel member name is not UTF-8");
    }
    const directory = name.endsWith("/");
    const portable = archivePath(name, "wheel member", { directory });
    if (portable.split("/").some((component) => component.endsWith(".data"))) {
      fail(`wheel .data member ${portable} is forbidden`);
    }
    const key = portable.toLocaleLowerCase("en-US");
    if (folded.has(key)) fail(`wheel contains duplicate or case-colliding ${portable}`);
    folded.add(key);
    if (offsets.has(localOffset)) fail("wheel members reuse a local header");
    offsets.add(localOffset);
    const mode = external >>> 16;
    const fileType = mode & 0o170000;
    if (fileType !== 0 && fileType !== 0o100000 && !(directory && fileType === 0o040000)) {
      fail(`wheel member ${portable} is a link or special file`);
    }
    expanded += size;
    if (expanded > LIMITS.expanded_bytes) fail("wheel exceeds its expansion budget");
    entries.push({
      name: portable, directory, flags, method, crc, compressed, size, localOffset,
      mode: (mode & 0o111) === 0 ? 0o644 : 0o755,
    });
    offset = end;
  }
  if (offset !== eocd) fail("wheel central directory has trailing unparsed bytes");
  return { entries, centralOffset };
}

function wheelContents(bytes, entry, centralOffset) {
  const offset = entry.localOffset;
  if (offset + 30 > centralOffset || bytes.readUInt32LE(offset) !== 0x04034b50) {
    fail(`wheel member ${entry.name} has an invalid local header`);
  }
  const flags = bytes.readUInt16LE(offset + 6);
  const method = bytes.readUInt16LE(offset + 8);
  const nameBytes = bytes.readUInt16LE(offset + 26);
  const extraBytes = bytes.readUInt16LE(offset + 28);
  const name = UTF8.decode(bytes.subarray(offset + 30, offset + 30 + nameBytes));
  const dataOffset = offset + 30 + nameBytes + extraBytes;
  const dataEnd = dataOffset + entry.compressed;
  if (flags !== entry.flags || method !== entry.method || name !== entry.name ||
      dataOffset > centralOffset || dataEnd > centralOffset) {
    fail(`wheel member ${entry.name} local and central records disagree`);
  }
  const compressed = bytes.subarray(dataOffset, dataEnd);
  const contents = entry.method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, {
    maxOutputLength: Math.max(1, entry.size),
  });
  if (contents.length !== entry.size || (zlib.crc32(contents) >>> 0) !== entry.crc) {
    fail(`wheel member ${entry.name} content authentication failed`);
  }
  return contents;
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) fail("wheel RECORD ends inside a quoted field");
  if (field !== "" || row.length !== 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function extractWheel(filename, destination) {
  const bytes = fs.readFileSync(filename);
  const { entries, centralOffset } = zipEntries(bytes);
  const regular = new Map(entries.filter((item) => !item.directory).map((item) => [item.name, item]));
  const records = [...regular.keys()].filter((name) => name.endsWith(".dist-info/RECORD"));
  if (records.length !== 1) fail("wheel must contain exactly one dist-info/RECORD");
  const recordName = records[0];
  const recordRows = csvRows(wheelContents(bytes, regular.get(recordName), centralOffset).toString("utf8"));
  const declared = new Set();
  for (const [index, row] of recordRows.entries()) {
    if (row.length !== 3) fail(`wheel RECORD row ${index + 1} must contain three fields`);
    const [name, hash, sizeText] = row;
    const portable = archivePath(name, `wheel RECORD row ${index + 1}`);
    if (declared.has(portable) || !regular.has(portable)) {
      fail(`wheel RECORD row ${index + 1} is duplicate or names a missing member`);
    }
    declared.add(portable);
    if (portable === recordName) {
      if (hash !== "" || sizeText !== "") fail("wheel RECORD must leave its own digest empty");
      continue;
    }
    const contents = wheelContents(bytes, regular.get(portable), centralOffset);
    const expected = `sha256=${crypto.createHash("sha256").update(contents).digest("base64url")}`;
    if (hash !== expected || sizeText !== String(contents.length)) {
      fail(`wheel RECORD authentication failed for ${portable}`);
    }
  }
  if (declared.size !== regular.size) fail("wheel RECORD omits archive members");
  for (const entry of entries) {
    const output = safeDestination(destination, entry.name, "wheel output");
    if (entry.directory) {
      fs.mkdirSync(output, { recursive: true, mode: 0o755 });
      continue;
    }
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o755 });
    fs.writeFileSync(output, wheelContents(bytes, entry, centralOffset), {
      flag: "wx",
      mode: entry.mode,
    });
  }
}

function authenticatedInput(directory, input) {
  const filename = path.join(directory, input.filename);
  const absolute = regularFile(filename, `${input.name} input`);
  const bytes = fs.readFileSync(absolute);
  if (bytes.length !== input.bytes || sha256(bytes) !== input.sha256) {
    fail(`${input.name} input bytes differ from the checked catalog`);
  }
  return absolute;
}

function provenance(row) {
  const core = {
    schema: PROVENANCE_SCHEMA,
    platform: row.platform,
    policy: { ...POLICY },
    python_executable: row.python_executable,
    site_packages: row.site_packages,
    provisioning: PROVISIONING_POLICY,
    inputs: row.inputs,
    prefix: row.prefix,
  };
  return { ...core, id: contentId(core) };
}

async function downloadInputs(row, directory) {
  const root = canonicalDirectory(directory, "artifact directory");
  for (const input of row.inputs) {
    const destination = path.join(root, input.filename);
    if (fs.existsSync(destination)) {
      authenticatedInput(root, input);
      continue;
    }
    const url = new URL(input.source);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      fail(`${input.name} source is not an authenticated HTTPS artifact URL`);
    }
    const temporary = `${destination}.partial-${process.pid}`;
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || response.body === null) {
        fail(`${input.name} download failed with HTTP ${response.status}`);
      }
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary, { flags: "wx" }));
      const status = fs.lstatSync(temporary);
      if (!status.isFile() || status.nlink !== 1) fail(`${input.name} download is not a unique file`);
      const bytes = fs.readFileSync(temporary);
      if (bytes.length !== input.bytes || sha256(bytes) !== input.sha256) {
        fail(`${input.name} downloaded bytes differ from the checked catalog`);
      }
      fs.renameSync(temporary, destination);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
}

async function provision({
  catalog,
  platform = platformIdentity().id,
  artifactDirectory,
  prefixPath,
  provenancePath,
  download = false,
}) {
  const checkedCatalog = validateCatalog(catalog);
  if (platform !== platformIdentity().id) {
    fail(`target ${platform} does not match current host ${platformIdentity().id}`);
  }
  const row = checkedCatalog.platforms.find((item) => item.platform === platform);
  if (row?.status !== "qualified") fail(`catalog row ${platform} is not qualified`);
  const artifacts = canonicalDirectory(artifactDirectory, "artifact directory");
  if (download) await downloadInputs(row, artifacts);
  const files = new Map(row.inputs.map((input) => [input.name, authenticatedInput(artifacts, input)]));
  const prefixOutput = outputParent(prefixPath, "prefix output");
  const provenanceOutput = outputParent(provenancePath, "provenance output");
  if (fs.existsSync(prefixOutput.absolute) || fs.existsSync(provenanceOutput.absolute)) {
    fail("prefix and provenance outputs must not already exist");
  }
  const stage = fs.mkdtempSync(path.join(prefixOutput.parent, `.sagejs-scipy-${platform}-`));
  const stagedPrefix = path.join(stage, "prefix");
  fs.mkdirSync(stagedPrefix, { mode: 0o755 });
  let prefixPublished = false;
  try {
    await extractPythonArchive(files.get("cpython"), stagedPrefix);
    const sitePackages = safeDestination(stagedPrefix, row.site_packages, "site-packages");
    fs.mkdirSync(sitePackages, { recursive: true, mode: 0o755 });
    extractWheel(files.get("numpy"), sitePackages);
    extractWheel(files.get("scipy"), sitePackages);
    fs.mkdirSync(path.join(stagedPrefix, ".qualification-tmp"), { mode: 0o700 });
    const closure = completePrefixClosure(stagedPrefix);
    const actual = {
      sha256: closure.sha256,
      bytes: closure.bytes,
      files: closure.files,
      directories: closure.directories,
    };
    if (canonicalJson(actual) !== canonicalJson(row.prefix)) {
      fail(`normalized ${platform} prefix differs from the checked closure`);
    }
    fs.renameSync(stagedPrefix, prefixOutput.absolute);
    prefixPublished = true;
    const final = completePrefixClosure(prefixOutput.absolute);
    const finalRecord = {
      sha256: final.sha256,
      bytes: final.bytes,
      files: final.files,
      directories: final.directories,
    };
    if (canonicalJson(finalRecord) !== canonicalJson(row.prefix)) {
      fail("published prefix differs from its staged closure");
    }
    const record = provenance(row);
    const temporary = `${provenanceOutput.absolute}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, pretty(record), { flag: "wx", mode: 0o600 });
    if (fs.lstatSync(temporary).nlink !== 1) fail("provenance output is unexpectedly hardlinked");
    fs.renameSync(temporary, provenanceOutput.absolute);
    return { prefix: final, provenance: record };
  } catch (error) {
    if (prefixPublished) fs.rmSync(prefixOutput.absolute, { recursive: true, force: true });
    fs.rmSync(provenanceOutput.absolute, { force: true });
    throw error;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function readCatalog(root = path.resolve(__dirname, "..", "..", "..")) {
  return validateCatalog(parseJsonText(
    fs.readFileSync(path.join(root, CATALOG_PATH), "utf8"),
    "SciPy oracle catalog",
  ));
}

module.exports = {
  downloadInputs,
  extractPythonArchive,
  extractWheel,
  provision,
  readCatalog,
  _testing: { archivePath, csvRows, zipEntries },
};
