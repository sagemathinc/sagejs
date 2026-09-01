"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentId,
  parseJsonText,
  sha256,
} = require("../common.cjs");

const SCHEMA = "sagejs.numerical-scipy-oracle-binding/v1";
const POLICY = Object.freeze({
  python: "3.14.4",
  numpy: "2.5.1",
  scipy: "1.18.0",
});
const MAX_RECORD_ROWS = 100_000;
const DISCOVERY = String.raw`
import json
import os
import sys
import sysconfig

roots = []
for name in ("purelib", "platlib"):
    value = os.path.realpath(sysconfig.get_path(name))
    if value not in roots:
        roots.append(value)
print(json.dumps({
    "implementation": sys.implementation.name,
    "python_version": ".".join(map(str, sys.version_info[:3])),
    "executable": os.path.abspath(sys.executable),
    "install_root": os.path.realpath(sys.prefix),
    "import_roots": roots,
}, sort_keys=True, separators=(",", ":")))
`;
const PROBE = String.raw`
import importlib.metadata as metadata
import json
import os
import sys
import numpy
import scipy

def package_record(name, module):
    distribution = metadata.distribution(name)
    return {
        "version": module.__version__,
        "module_file": os.path.realpath(module.__file__),
        "distribution_path": os.path.realpath(distribution._path),
        "record_path": os.path.realpath(os.path.join(distribution._path, "RECORD")),
        "record_root": os.path.realpath(distribution.locate_file("")),
    }

print(json.dumps({
    "implementation": sys.implementation.name,
    "python_version": ".".join(map(str, sys.version_info[:3])),
    "executable": os.path.abspath(sys.executable),
    "install_root": os.path.realpath(sys.prefix),
    "numpy": package_record("numpy", numpy),
    "scipy": package_record("scipy", scipy),
}, sort_keys=True, separators=(",", ":")))
`;

function relativeInside(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative === ".") return "";
  if (relative === ".." || relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the pinned Python installation`);
  }
  return relative;
}

function noFollowExisting(installRoot, candidate, label, expectedKind = null) {
  const root = fs.realpathSync(installRoot);
  const absolute = path.resolve(candidate);
  const relative = relativeInside(root, absolute, label);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const status = fs.lstatSync(current);
    if (status.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic-link or junction component`);
    }
  }
  const real = fs.realpathSync(absolute);
  relativeInside(root, real, label);
  const status = fs.lstatSync(real);
  if (expectedKind === "file" && !status.isFile()) {
    throw new Error(`${label} is not a regular file`);
  }
  if (expectedKind === "directory" && !status.isDirectory()) {
    throw new Error(`${label} is not a directory`);
  }
  if (!status.isFile() && !status.isDirectory()) {
    throw new Error(`${label} is a special filesystem object`);
  }
  return real;
}

function fileIdentity(installRoot, filename, label) {
  const real = noFollowExisting(installRoot, filename, label, "file");
  const bytes = fs.readFileSync(real);
  return { path: real, sha256: sha256(bytes), bytes: bytes.length };
}

function executableIdentity(filename) {
  const invocationPath = path.resolve(filename);
  const invocationStatus = fs.lstatSync(invocationPath);
  if (!invocationStatus.isFile() && !invocationStatus.isSymbolicLink()) {
    throw new Error("SciPy oracle Python launcher is not a file or symbolic link");
  }
  const targetPath = fs.realpathSync(invocationPath);
  const targetStatus = fs.lstatSync(targetPath);
  if (!targetStatus.isFile() || targetStatus.isSymbolicLink()) {
    throw new Error("SciPy oracle Python launcher does not resolve to a regular file");
  }
  const bytes = fs.readFileSync(targetPath);
  return {
    path: invocationPath,
    link_target: invocationStatus.isSymbolicLink() ? fs.readlinkSync(invocationPath) : null,
    target_path: targetPath,
    target_sha256: sha256(bytes),
    target_bytes: bytes.length,
  };
}

// Wheel RECORD is RFC 4180 CSV. Keep this parser local and strict so the
// qualification boundary never trusts distribution metadata to describe its
// own bytes.
function parseCsv(text, label) {
  const rows = [];
  let row = [];
  let field = "";
  let index = 0;
  let quoted = false;
  let afterQuote = false;
  function finishField() {
    row.push(field);
    field = "";
    afterQuote = false;
  }
  function finishRow() {
    finishField();
    if (row.length !== 3) throw new Error(`${label} row must have exactly three fields`);
    rows.push(row);
    if (rows.length > MAX_RECORD_ROWS) throw new Error(`${label} has too many rows`);
    row = [];
  }
  while (index < text.length) {
    const character = text[index++];
    if (quoted) {
      if (character === '"') {
        if (text[index] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (afterQuote && ![",", "\r", "\n"].includes(character)) {
      throw new Error(`${label} has content after a closing quote`);
    }
    if (character === '"') {
      if (field.length !== 0 || afterQuote) throw new Error(`${label} has an invalid quote`);
      quoted = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index] === "\n") index += 1;
      finishRow();
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error(`${label} has an unterminated quoted field`);
  if (field.length !== 0 || row.length !== 0 || afterQuote) finishRow();
  if (rows.length === 0) throw new Error(`${label} is empty`);
  return rows;
}

function walkFiles(installRoot, directory, files, label) {
  const realDirectory = noFollowExisting(installRoot, directory, label, "directory");
  for (const name of fs.readdirSync(realDirectory).sort()) {
    const candidate = path.join(realDirectory, name);
    const status = fs.lstatSync(candidate);
    if (status.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic-link or junction entry`);
    }
    if (status.isDirectory()) {
      walkFiles(installRoot, candidate, files, label);
    } else if (status.isFile()) {
      const identity = fileIdentity(installRoot, candidate, label);
      const relative = relativeInside(installRoot, identity.path, label)
        .split(path.sep).join("/");
      files.set(relative, identity);
    } else {
      throw new Error(`${label} contains a special filesystem object`);
    }
  }
}

function decodeRecordHash(value, label) {
  const match = /^sha256=([A-Za-z0-9_-]+)$/.exec(value);
  if (match === null) throw new Error(`${label} uses a non-SHA256 wheel hash`);
  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64url");
  } catch {
    throw new Error(`${label} has a malformed wheel hash`);
  }
  if (decoded.length !== 32 || decoded.toString("base64url") !== match[1]) {
    throw new Error(`${label} has a noncanonical wheel hash`);
  }
  return decoded.toString("hex");
}

function distributionIdentity(installRoot, record) {
  const moduleFile = fileIdentity(
    installRoot, record.module_file, `${record.version} module entrypoint`,
  );
  const moduleRoot = noFollowExisting(
    installRoot, path.dirname(moduleFile.path), `${record.version} module root`, "directory",
  );
  const distributionPath = noFollowExisting(
    installRoot, record.distribution_path, `${record.version} distribution metadata`, "directory",
  );
  const recordRoot = noFollowExisting(
    installRoot, record.record_root, `${record.version} wheel RECORD root`, "directory",
  );
  const recordFile = fileIdentity(
    installRoot, record.record_path, `${record.version} wheel RECORD`,
  );
  const rows = parseCsv(fs.readFileSync(recordFile.path, "utf8"), `${record.version} RECORD`);
  const files = new Map();
  const recordNames = new Set();
  const recordNamesFolded = new Set();
  let declaredHashes = 0;
  let locallyBoundUnhashed = 0;
  for (const [entry, declaredHash, declaredSize] of rows) {
    if (entry.length === 0 || entry.includes("\0") || path.isAbsolute(entry)) {
      throw new Error(`${record.version} RECORD has an invalid member name`);
    }
    const absolute = path.resolve(recordRoot, entry.split("/").join(path.sep));
    const member = fileIdentity(installRoot, absolute, `${record.version} RECORD member ${entry}`);
    const normalized = relativeInside(installRoot, member.path, `${record.version} RECORD member`)
      .split(path.sep).join("/");
    const folded = normalized.toLocaleLowerCase("en-US");
    if (recordNames.has(normalized) || recordNamesFolded.has(folded)) {
      throw new Error(`${record.version} RECORD has a duplicate or case-colliding member`);
    }
    recordNames.add(normalized);
    recordNamesFolded.add(folded);
    if ((declaredHash.length === 0) !== (declaredSize.length === 0)) {
      throw new Error(`${record.version} RECORD has a partially authenticated member`);
    }
    if (declaredHash.length !== 0) {
      if (!/^(0|[1-9][0-9]*)$/.test(declaredSize) || Number(declaredSize) !== member.bytes) {
        throw new Error(`${record.version} RECORD member has the wrong declared size`);
      }
      if (decodeRecordHash(declaredHash, `${record.version} RECORD member`) !== member.sha256) {
        throw new Error(`${record.version} RECORD member has the wrong declared hash`);
      }
      declaredHashes += 1;
    } else {
      // pip-generated bytecode and RECORD itself are commonly unhashed. They
      // remain authenticated by the complete closure digest below.
      locallyBoundUnhashed += 1;
    }
    files.set(normalized, member);
  }
  // RECORD cannot enumerate subsequently injected files. Recursively include
  // the complete importable package and dist-info trees, then retain any
  // scripts or other external members named by RECORD.
  walkFiles(installRoot, moduleRoot, files, `${record.version} module closure`);
  walkFiles(installRoot, distributionPath, files, `${record.version} metadata closure`);
  const closure = [...files.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, identity]) => ({
      path: relative,
      sha256: identity.sha256,
      bytes: identity.bytes,
    }));
  const bytes = closure.reduce((total, item) => total + item.bytes, 0);
  return {
    version: record.version,
    module: moduleFile,
    module_root: moduleRoot,
    distribution_path: distributionPath,
    record: {
      ...recordFile,
      rows: rows.length,
      declared_hashes_verified: declaredHashes,
      unhashed_members_bound_by_closure: locallyBoundUnhashed,
    },
    closure: {
      files: closure.length,
      bytes,
      sha256: sha256(canonicalJson(closure)),
    },
  };
}

function candidates() {
  const result = [];
  if (process.env.SAGEJS_QUALIFICATION_PYTHON) {
    result.push([process.env.SAGEJS_QUALIFICATION_PYTHON]);
  }
  if (process.env.PYTHON) result.push([process.env.PYTHON]);
  result.push(["python3"], ["python"]);
  if (process.platform === "win32") result.push(["py", "-3"]);
  return result;
}

function probe(command) {
  const [executable, ...prefix] = command;
  const discovered = spawnSync(executable, [...prefix, "-I", "-S", "-c", DISCOVERY], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  if (discovered.error || discovered.status !== 0 || discovered.signal !== null) return null;
  const startup = parseJsonText(discovered.stdout.trim(), "SciPy oracle startup probe");
  if (startup.implementation !== "cpython" || startup.python_version !== POLICY.python ||
      !Array.isArray(startup.import_roots) || startup.import_roots.length === 0) {
    return null;
  }
  const source = [
    "import sys",
    `sys.path[:0] = ${JSON.stringify(startup.import_roots)}`,
    PROBE,
  ].join("\n");
  const result = spawnSync(executable, [...prefix, "-I", "-S", "-c", source], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal !== null) return null;
  const record = parseJsonText(result.stdout.trim(), "SciPy oracle probe");
  if (record.implementation !== "cpython" ||
      record.python_version !== POLICY.python ||
      record.numpy?.version !== POLICY.numpy || record.scipy?.version !== POLICY.scipy) {
    return null;
  }
  const installRoot = noFollowExisting(
    record.install_root, record.install_root, "SciPy oracle Python installation", "directory",
  );
  if (record.executable !== startup.executable || installRoot !== startup.install_root) return null;
  const importRoots = startup.import_roots.map((candidate) => noFollowExisting(
    installRoot, candidate, "SciPy oracle import root", "directory",
  ));
  return {
    policy: { ...POLICY },
    python: {
      version: record.python_version,
      implementation: record.implementation,
      install_root: installRoot,
      import_roots: importRoots,
      executable: executableIdentity(record.executable),
    },
    numpy: distributionIdentity(installRoot, record.numpy),
    scipy: distributionIdentity(installRoot, record.scipy),
  };
}

function createBinding() {
  for (const candidate of candidates()) {
    const identity = probe(candidate);
    if (identity !== null) {
      const core = { schema: SCHEMA, identity };
      return { ...core, id: contentId(core) };
    }
  }
  throw new Error(
    `qualification requires CPython ${POLICY.python}, NumPy ${POLICY.numpy}, ` +
      `and SciPy ${POLICY.scipy}; install the pinned, hash-locked oracle environment`,
  );
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const names = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(names) !== canonicalJson(wanted)) {
    throw new Error(`${label} has the wrong fields`);
  }
}

function nonempty(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function positiveInteger(value, label, { allowZero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${label} must be a ${allowZero ? "nonnegative" : "positive"} integer`);
  }
  return value;
}

function digest(value, label) {
  if (!/^[0-9a-f]{64}$/.test(value ?? "")) throw new Error(`${label} is not SHA-256`);
  return value;
}

function portablePath(value, label) {
  nonempty(value, label);
  const normalized = value.replaceAll("\\", "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized) &&
      !normalized.startsWith("//")) {
    throw new Error(`${label} must be an absolute path`);
  }
  if (normalized.split("/").some((component) => component === "." || component === "..")) {
    throw new Error(`${label} is not canonical`);
  }
  return normalized;
}

function portableContains(rootValue, candidateValue, label) {
  let root = portablePath(rootValue, `${label} root`).replace(/\/$/, "");
  let candidate = portablePath(candidateValue, label);
  if (/^[A-Za-z]:\//.test(root)) {
    root = root.toLocaleLowerCase("en-US");
    candidate = candidate.toLocaleLowerCase("en-US");
  }
  if (candidate !== root && !candidate.startsWith(`${root}/`)) {
    throw new Error(`${label} lies outside its authenticated root`);
  }
}

function wireFileIdentity(value, label) {
  exactKeys(value, ["path", "sha256", "bytes"], label);
  portablePath(value.path, `${label}.path`);
  digest(value.sha256, `${label}.sha256`);
  positiveInteger(value.bytes, `${label}.bytes`);
}

function wireDistribution(value, name, installRoot) {
  exactKeys(
    value,
    ["version", "module", "module_root", "distribution_path", "record", "closure"],
    `${name} identity`,
  );
  if (value.version !== POLICY[name]) throw new Error(`${name} binding has the wrong version`);
  portableContains(installRoot, value.module_root, `${name}.module_root`);
  portableContains(installRoot, value.distribution_path, `${name}.distribution_path`);
  wireFileIdentity(value.module, `${name}.module`);
  portableContains(value.module_root, value.module.path, `${name}.module.path`);
  exactKeys(
    value.record,
    [
      "path", "sha256", "bytes", "rows", "declared_hashes_verified",
      "unhashed_members_bound_by_closure",
    ],
    `${name}.record`,
  );
  wireFileIdentity(
    { path: value.record.path, sha256: value.record.sha256, bytes: value.record.bytes },
    `${name}.record`,
  );
  portableContains(value.distribution_path, value.record.path, `${name}.record.path`);
  const rows = positiveInteger(value.record.rows, `${name}.record.rows`);
  const hashed = positiveInteger(
    value.record.declared_hashes_verified, `${name}.record.declared_hashes_verified`,
  );
  const unhashed = positiveInteger(
    value.record.unhashed_members_bound_by_closure,
    `${name}.record.unhashed_members_bound_by_closure`,
    { allowZero: true },
  );
  if (rows !== hashed + unhashed) throw new Error(`${name}.record row accounting is inconsistent`);
  exactKeys(value.closure, ["files", "bytes", "sha256"], `${name}.closure`);
  if (positiveInteger(value.closure.files, `${name}.closure.files`) < rows) {
    throw new Error(`${name}.closure omits RECORD members`);
  }
  positiveInteger(value.closure.bytes, `${name}.closure.bytes`);
  digest(value.closure.sha256, `${name}.closure.sha256`);
}

function validateBinding(value, { authenticate = true } = {}) {
  exactKeys(value, ["schema", "identity", "id"], "SciPy oracle binding");
  exactKeys(value.identity, ["policy", "python", "numpy", "scipy"], "SciPy oracle identity");
  exactKeys(value.identity.policy, ["python", "numpy", "scipy"], "SciPy oracle policy");
  if (value.schema !== SCHEMA || typeof value.id !== "string") {
    throw new Error("SciPy oracle binding has the wrong schema");
  }
  const { id, ...core } = value;
  if (id !== contentId(core)) throw new Error("SciPy oracle binding content ID mismatch");
  if (canonicalJson(value.identity.policy) !== canonicalJson(POLICY)) {
    throw new Error("SciPy oracle binding does not use the pinned version policy");
  }
  const python = value.identity.python;
  exactKeys(
    python,
    ["version", "implementation", "install_root", "import_roots", "executable"],
    "SciPy oracle Python identity",
  );
  if (python.version !== POLICY.python || python.implementation !== "cpython") {
    throw new Error("SciPy oracle Python identity differs from policy");
  }
  portablePath(python.install_root, "SciPy oracle install_root");
  if (!Array.isArray(python.import_roots) || python.import_roots.length === 0 ||
      new Set(python.import_roots).size !== python.import_roots.length) {
    throw new Error("SciPy oracle import_roots must be a nonempty unique array");
  }
  for (const root of python.import_roots) {
    portableContains(python.install_root, root, "SciPy oracle import root");
  }
  exactKeys(
    python.executable,
    ["path", "link_target", "target_path", "target_sha256", "target_bytes"],
    "SciPy oracle Python executable",
  );
  portablePath(python.executable.path, "SciPy oracle Python executable.path");
  portablePath(python.executable.target_path, "SciPy oracle Python executable.target_path");
  if (python.executable.link_target !== null) {
    nonempty(python.executable.link_target, "SciPy oracle Python executable.link_target");
  } else if (python.executable.path !== python.executable.target_path) {
    throw new Error("a regular SciPy oracle Python executable must equal its target path");
  }
  digest(python.executable.target_sha256, "SciPy oracle Python executable.target_sha256");
  positiveInteger(python.executable.target_bytes, "SciPy oracle Python executable.target_bytes");
  wireDistribution(value.identity.numpy, "numpy", python.install_root);
  wireDistribution(value.identity.scipy, "scipy", python.install_root);
  if (authenticate) {
    const current = probe([value.identity.python?.executable?.path]);
    if (current === null || canonicalJson(current) !== canonicalJson(value.identity)) {
      throw new Error("SciPy oracle environment differs from its capability binding");
    }
  }
  return value;
}

function readBinding(filename, options = {}) {
  const status = fs.lstatSync(filename);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error("SciPy oracle binding must be a regular non-symbolic-link file");
  }
  return validateBinding(
    parseJsonText(fs.readFileSync(filename, "utf8"), "SciPy oracle binding"),
    options,
  );
}

module.exports = {
  POLICY,
  SCHEMA,
  createBinding,
  readBinding,
  validateBinding,
  _testing: { distributionIdentity, parseCsv, probe },
};
