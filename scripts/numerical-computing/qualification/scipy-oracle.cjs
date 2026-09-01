"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentId,
  parseJsonText,
  platformIdentity,
  repositoryPath,
  sha256,
} = require("../common.cjs");

const SCHEMA = "sagejs.numerical-scipy-oracle-binding/v2";
const PROVENANCE_SCHEMA = "sagejs.numerical-scipy-oracle-provenance/v1";
const CATALOG_SCHEMA = "sagejs.numerical-scipy-oracle-catalog/v1";
const CATALOG_PATH =
  "bench/numerical-computing/qualification/scipy-oracle-catalog.json";
const POLICY = Object.freeze({
  python: "3.14.4",
  numpy: "2.5.1",
  scipy: "1.18.0",
});
const ORACLE_ENVIRONMENT = Object.freeze({
  LANG: "C.UTF-8",
  LC_ALL: "C",
  TZ: "UTC",
  OMP_NUM_THREADS: "1",
  OPENBLAS_NUM_THREADS: "1",
  MKL_NUM_THREADS: "1",
  VECLIB_MAXIMUM_THREADS: "1",
  NUMEXPR_NUM_THREADS: "1",
});
const PROBE = String.raw`
import json
import os
import sys
import tempfile
import numpy
import scipy

print(json.dumps({
    "implementation": sys.implementation.name,
    "python_version": ".".join(map(str, sys.version_info[:3])),
    "executable": os.path.abspath(sys.executable),
    "prefix": os.path.abspath(sys.prefix),
    "base_prefix": os.path.abspath(sys.base_prefix),
    "import_paths": [os.path.abspath(value) for value in sys.path],
    "temporary_directory": os.path.abspath(tempfile.gettempdir()),
    "numpy": {"version": numpy.__version__, "module_file": os.path.abspath(numpy.__file__)},
    "scipy": {"version": scipy.__version__, "module_file": os.path.abspath(scipy.__file__)},
}, sort_keys=True, separators=(",", ":")))
`;

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} has the wrong fields`);
  }
}

function nonempty(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return value;
}

function digest(value, label) {
  if (!/^[0-9a-f]{64}$/.test(value ?? "")) throw new Error(`${label} is not SHA-256`);
  return value;
}

function portableAbsolute(value, label) {
  nonempty(value, label);
  const normalized = value.replaceAll("\\", "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized) &&
      !normalized.startsWith("//")) {
    throw new Error(`${label} must be an absolute path`);
  }
  if (normalized.split("/").some((item) => item === "." || item === "..")) {
    throw new Error(`${label} must be canonical`);
  }
  return normalized;
}

function canonicalRelative(value, label) {
  nonempty(value, label);
  const normalized = value.replaceAll("\\", "/");
  if (value !== normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) ||
      normalized.split("/").some((item) => item === "" || item === "." || item === "..")) {
    throw new Error(`${label} must be a canonical relative path`);
  }
  return normalized;
}

function inside(rootValue, candidateValue, label) {
  let root = portableAbsolute(rootValue, `${label} root`).replace(/\/$/, "");
  let candidate = portableAbsolute(candidateValue, label);
  if (/^[A-Za-z]:\//.test(root)) {
    root = root.toLocaleLowerCase("en-US");
    candidate = candidate.toLocaleLowerCase("en-US");
  }
  if (candidate !== root && !candidate.startsWith(`${root}/`)) {
    throw new Error(`${label} lies outside the hermetic prefix`);
  }
}

function noFollowPrefix(prefixPath) {
  const absolute = path.resolve(prefixPath);
  const status = fs.lstatSync(absolute);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error("SciPy oracle prefix must be a real non-symbolic-link directory");
  }
  const real = fs.realpathSync(absolute);
  if (real !== absolute) throw new Error("SciPy oracle prefix path is not canonical");
  return real;
}

function prefixPath(prefix, relative, label, kind = "file") {
  const normalized = canonicalRelative(relative, label);
  let current = prefix;
  for (const component of normalized.split("/")) {
    current = path.join(current, component);
    const status = fs.lstatSync(current);
    if (status.isSymbolicLink()) throw new Error(`${label} follows a link or junction`);
  }
  const real = fs.realpathSync(current);
  const relativeReal = path.relative(prefix, real);
  if (relativeReal === ".." || relativeReal.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeReal)) {
    throw new Error(`${label} escapes the hermetic prefix`);
  }
  const status = fs.lstatSync(real);
  if ((kind === "file" && !status.isFile()) || (kind === "directory" && !status.isDirectory())) {
    throw new Error(`${label} has the wrong filesystem kind`);
  }
  return real;
}

function completePrefixClosure(prefixPath) {
  const prefix = noFollowPrefix(prefixPath);
  const records = [];
  const foldedPaths = new Set();
  function visit(filename, relative) {
    const status = fs.lstatSync(filename);
    if (status.isSymbolicLink()) {
      throw new Error(`SciPy oracle prefix contains link or junction ${relative}`);
    }
    const portable = relative.split(path.sep).join("/");
    const folded = portable.toLocaleLowerCase("en-US");
    if (foldedPaths.has(folded)) {
      throw new Error(`SciPy oracle prefix contains case-colliding path ${portable}`);
    }
    foldedPaths.add(folded);
    if (status.isDirectory()) {
      records.push({ path: portable, kind: "directory" });
      for (const name of fs.readdirSync(filename).sort()) {
        visit(path.join(filename, name), relative === "" ? name : `${relative}/${name}`);
      }
      return;
    }
    if (!status.isFile()) throw new Error(`SciPy oracle prefix contains special file ${relative}`);
    const bytes = fs.readFileSync(filename);
    records.push({
      path: portable,
      kind: "file",
      sha256: sha256(bytes),
      bytes: bytes.length,
    });
  }
  visit(prefix, "");
  const files = records.filter((item) => item.kind === "file");
  const directories = records.filter((item) => item.kind === "directory");
  if (files.length === 0) throw new Error("SciPy oracle prefix contains no files");
  return {
    path: prefix,
    files: files.length,
    directories: directories.length,
    bytes: files.reduce((total, item) => total + item.bytes, 0),
    sha256: sha256(canonicalJson(records)),
  };
}

function oracleEnvironment(prefixPath, platformId = platformIdentity().id) {
  const prefix = portableAbsolute(prefixPath, "SciPy oracle environment prefix");
  const environment = { ...ORACLE_ENVIRONMENT };
  const temporary = `${prefix.replace(/\/$/, "")}/.qualification-tmp`;
  if (platformId === "windows-x64") {
    for (const name of ["SystemRoot", "WINDIR"]) {
      const value = process.env[name];
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`hermetic Windows SciPy oracle requires ${name}`);
      }
      environment[name] = portableAbsolute(value, `SciPy oracle ${name}`);
    }
    environment.TEMP = temporary;
    environment.TMP = temporary;
    environment.USERPROFILE = prefix;
  } else {
    environment.HOME = prefix;
    environment.TMPDIR = temporary;
  }
  return environment;
}

function readStrictJson(filename, label) {
  const absolute = path.resolve(filename);
  const status = fs.lstatSync(absolute);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symbolic-link file`);
  }
  if (fs.realpathSync(absolute) !== absolute) {
    throw new Error(`${label} path or parent is a link, junction, or noncanonical alias`);
  }
  return parseJsonText(fs.readFileSync(absolute, "utf8"), label);
}

function validateInput(value, label) {
  exactKeys(value, ["kind", "name", "version", "filename", "source", "sha256", "bytes"], label);
  if (!['cpython-standalone', 'wheel'].includes(value.kind)) {
    throw new Error(`${label}.kind is unsupported`);
  }
  for (const name of ["name", "version", "filename", "source"]) nonempty(value[name], `${label}.${name}`);
  if (path.basename(value.filename) !== value.filename || value.filename.includes("\\")) {
    throw new Error(`${label}.filename is not a basename`);
  }
  digest(value.sha256, `${label}.sha256`);
  integer(value.bytes, `${label}.bytes`, 1);
  return value;
}

function validateInputs(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must bind standalone Python and two wheels`);
  }
  value.forEach((item, index) => validateInput(item, `${label}[${index}]`));
  const byName = new Map();
  const filenames = new Set();
  for (const item of value) {
    const foldedFilename = item.filename.toLocaleLowerCase("en-US");
    if (byName.has(item.name) || filenames.has(foldedFilename)) {
      throw new Error(`${label} contains duplicate inputs`);
    }
    byName.set(item.name, item);
    filenames.add(foldedFilename);
  }
  const expected = {
    cpython: ["cpython-standalone", POLICY.python],
    numpy: ["wheel", POLICY.numpy],
    scipy: ["wheel", POLICY.scipy],
  };
  for (const [name, [kind, version]] of Object.entries(expected)) {
    const item = byName.get(name);
    if (item?.kind !== kind || item.version !== version) {
      throw new Error(`${label} has the wrong ${name} input identity`);
    }
  }
  return value;
}

function validatePrefixRecord(value, label) {
  exactKeys(value, ["sha256", "bytes", "files", "directories"], label);
  digest(value.sha256, `${label}.sha256`);
  integer(value.bytes, `${label}.bytes`, 1);
  integer(value.files, `${label}.files`, 1);
  integer(value.directories, `${label}.directories`, 1);
  return value;
}

function validateCatalog(value) {
  exactKeys(value, ["schema", "id", "policy", "platforms"], "SciPy oracle catalog");
  if (value.schema !== CATALOG_SCHEMA) throw new Error("SciPy oracle catalog has wrong schema");
  const { id, ...core } = value;
  if (id !== contentId(core)) throw new Error("SciPy oracle catalog content ID mismatch");
  if (canonicalJson(value.policy) !== canonicalJson(POLICY)) {
    throw new Error("SciPy oracle catalog policy differs from qualification policy");
  }
  if (!Array.isArray(value.platforms) || value.platforms.length !== 4) {
    throw new Error("SciPy oracle catalog must contain four supported platforms");
  }
  const expected = new Set(["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]);
  for (const row of value.platforms) {
    exactKeys(
      row,
      [
        "platform", "status", "reason", "python_executable", "site_packages",
        "inputs", "prefix",
      ],
      "SciPy oracle catalog row",
    );
    if (!expected.delete(row.platform) || !["pending", "qualified"].includes(row.status)) {
      throw new Error("SciPy oracle catalog has an invalid platform row");
    }
    if (row.status === "pending") {
      nonempty(row.reason, `${row.platform}.reason`);
      if (row.python_executable !== null || row.site_packages !== null ||
          row.inputs !== null || row.prefix !== null) {
        throw new Error(`${row.platform} pending catalog row must not claim artifacts`);
      }
    } else {
      if (row.reason !== null) throw new Error(`${row.platform} qualified row has a reason`);
      canonicalRelative(row.python_executable, `${row.platform}.python_executable`);
      canonicalRelative(row.site_packages, `${row.platform}.site_packages`);
      validateInputs(row.inputs, `${row.platform}.inputs`);
      validatePrefixRecord(row.prefix, `${row.platform}.prefix`);
    }
  }
  if (expected.size !== 0) throw new Error("SciPy oracle catalog omits a supported platform");
  return value;
}

function validateProvenance(value, expectedRow = null) {
  exactKeys(
    value,
    [
      "schema", "id", "platform", "policy", "python_executable", "site_packages",
      "inputs", "prefix",
    ],
    "SciPy oracle provenance",
  );
  if (value.schema !== PROVENANCE_SCHEMA) throw new Error("SciPy oracle provenance has wrong schema");
  const { id, ...core } = value;
  if (id !== contentId(core)) throw new Error("SciPy oracle provenance content ID mismatch");
  nonempty(value.platform, "SciPy oracle provenance.platform");
  if (canonicalJson(value.policy) !== canonicalJson(POLICY)) {
    throw new Error("SciPy oracle provenance policy differs from qualification policy");
  }
  canonicalRelative(value.python_executable, "SciPy oracle provenance.python_executable");
  canonicalRelative(value.site_packages, "SciPy oracle provenance.site_packages");
  validateInputs(value.inputs, "provenance.inputs");
  validatePrefixRecord(value.prefix, "SciPy oracle provenance.prefix");
  if (expectedRow !== null) {
    const expected = {
      platform: expectedRow.platform,
      python_executable: expectedRow.python_executable,
      site_packages: expectedRow.site_packages,
      inputs: expectedRow.inputs,
      prefix: expectedRow.prefix,
    };
    const actual = {
      platform: value.platform,
      python_executable: value.python_executable,
      site_packages: value.site_packages,
      inputs: value.inputs,
      prefix: value.prefix,
    };
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error("SciPy oracle provenance differs from the checked-in platform catalog");
    }
  }
  return value;
}

function importPathRecord(prefix, filename) {
  const absolute = path.resolve(filename);
  inside(prefix, absolute, "hermetic Python import path");
  const relative = path.relative(prefix, absolute).split(path.sep).join("/");
  let kind = "absent";
  if (fs.existsSync(absolute)) {
    const status = fs.lstatSync(absolute);
    if (status.isSymbolicLink()) throw new Error("hermetic Python import path follows a link");
    if (status.isDirectory()) kind = "directory";
    else if (status.isFile()) kind = "file";
    else throw new Error("hermetic Python import path has unsupported filesystem kind");
  }
  return { path: relative, kind };
}

function probePrefix(prefix, executableRelative, sitePackagesRelative, platformId) {
  const executable = prefixPath(prefix, executableRelative, "SciPy oracle Python executable");
  const sitePackages = prefixPath(
    prefix, sitePackagesRelative, "SciPy oracle site-packages", "directory",
  );
  const temporary = prefixPath(
    prefix, ".qualification-tmp", "SciPy oracle temporary directory", "directory",
  );
  if (fs.readdirSync(temporary).length !== 0) {
    throw new Error("SciPy oracle temporary directory must be empty before execution");
  }
  const bytes = fs.readFileSync(executable);
  const probeSource = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(sitePackages)})`,
    PROBE,
  ].join("\n");
  const environment = oracleEnvironment(prefix, platformId);
  const result = spawnSync(executable, ["-B", "-I", "-S", "-c", probeSource], {
    cwd: prefix,
    env: environment,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(`hermetic SciPy oracle probe failed: ${result.stderr || result.stdout}`);
  }
  const record = parseJsonText(result.stdout.trim(), "hermetic SciPy oracle probe");
  if (record.implementation !== "cpython" || record.python_version !== POLICY.python ||
      record.numpy?.version !== POLICY.numpy || record.scipy?.version !== POLICY.scipy) {
    throw new Error("hermetic SciPy oracle versions differ from policy");
  }
  for (const name of ["executable", "prefix", "base_prefix", ...record.import_paths]) {
    inside(prefix, name, "hermetic Python runtime path");
  }
  if (path.resolve(record.temporary_directory) !== temporary) {
    throw new Error("hermetic Python tempfile selection escaped its authenticated prefix");
  }
  if (fs.realpathSync(record.executable) !== executable || fs.realpathSync(record.prefix) !== prefix ||
      fs.realpathSync(record.base_prefix) !== prefix) {
    throw new Error("standalone Python still references a host installation");
  }
  if (fs.readdirSync(temporary).length !== 0) {
    throw new Error("SciPy oracle probe left temporary files behind");
  }
  const packageIdentity = (name) => {
    const module = record[name];
    inside(prefix, module.module_file, `${name} module`);
    const real = fs.realpathSync(module.module_file);
    const moduleBytes = fs.readFileSync(real);
    return {
      version: module.version,
      module_path: path.relative(prefix, real).split(path.sep).join("/"),
      module_sha256: sha256(moduleBytes),
      module_bytes: moduleBytes.length,
    };
  };
  return {
    environment,
    python: {
      version: record.python_version,
      implementation: record.implementation,
      executable_path: executableRelative,
      executable_sha256: sha256(bytes),
      executable_bytes: bytes.length,
      site_packages_path: sitePackagesRelative,
      temporary_path: ".qualification-tmp",
      import_paths: record.import_paths.map((item) => importPathRecord(prefix, item)),
    },
    numpy: packageIdentity("numpy"),
    scipy: packageIdentity("scipy"),
  };
}

function catalogBinding(root, catalogPath) {
  const resolved = repositoryPath(root, catalogPath, "SciPy oracle catalog");
  const snapshot = validateCatalog(
    parseJsonText(fs.readFileSync(resolved.absolute, "utf8"), "SciPy oracle catalog"),
  );
  const bytes = Buffer.from(canonicalJson(snapshot));
  return {
    path: resolved.relative,
    sha256: sha256(bytes),
    bytes: bytes.length,
    snapshot,
  };
}

function createBinding({
  root = path.resolve(__dirname, "..", "..", ".."),
  prefixPath = process.env.SAGEJS_QUALIFICATION_SCIPY_PREFIX,
  provenancePath = process.env.SAGEJS_QUALIFICATION_SCIPY_PROVENANCE,
  catalogPath = CATALOG_PATH,
  platformId = platformIdentity().id,
} = {}) {
  if (!prefixPath || !provenancePath) {
    throw new Error(
      "qualification requires explicit SAGEJS_QUALIFICATION_SCIPY_PREFIX and " +
      "SAGEJS_QUALIFICATION_SCIPY_PROVENANCE; PATH fallback is forbidden",
    );
  }
  const catalog = catalogBinding(root, catalogPath);
  const row = catalog.snapshot.platforms.find((item) => item.platform === platformId);
  if (row?.status !== "qualified") {
    throw new Error(`SciPy oracle catalog row ${platformId} is pending; release receipts are forbidden`);
  }
  const provenance = validateProvenance(
    readStrictJson(path.resolve(provenancePath), "SciPy oracle provenance"), row,
  );
  const prefix = completePrefixClosure(prefixPath);
  if (canonicalJson({
    sha256: prefix.sha256,
    bytes: prefix.bytes,
    files: prefix.files,
    directories: prefix.directories,
  }) !==
      canonicalJson(provenance.prefix)) {
    throw new Error("hermetic SciPy oracle prefix differs from authenticated provenance");
  }
  const runtime = probePrefix(
    prefix.path, row.python_executable, row.site_packages, platformId,
  );
  const postProbePrefix = completePrefixClosure(prefix.path);
  if (canonicalJson(postProbePrefix) !== canonicalJson(prefix)) {
    throw new Error("SciPy oracle probe mutated its authenticated prefix");
  }
  const core = {
    schema: SCHEMA,
    platform: platformId,
    policy: { ...POLICY },
    catalog,
    provenance,
    prefix,
    runtime,
  };
  return { ...core, id: contentId(core) };
}

function validateEnvironment(value, prefix, platformId, { authenticate = false } = {}) {
  const common = { ...ORACLE_ENVIRONMENT };
  const expectedKeys = platformId === "windows-x64"
    ? [...Object.keys(common), "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE"]
    : [...Object.keys(common), "HOME", "TMPDIR"];
  exactKeys(value, expectedKeys, "SciPy oracle runtime.environment");
  for (const [name, expected] of Object.entries(common)) {
    if (value[name] !== expected) {
      throw new Error(`SciPy oracle runtime.environment.${name} differs from policy`);
    }
  }
  const portablePrefix = portableAbsolute(prefix.path, "SciPy oracle environment prefix")
    .replace(/\/$/, "");
  const temporary = `${portablePrefix}/.qualification-tmp`;
  if (platformId === "windows-x64") {
    portableAbsolute(value.SystemRoot, "SciPy oracle runtime.environment.SystemRoot");
    portableAbsolute(value.WINDIR, "SciPy oracle runtime.environment.WINDIR");
    if (value.SystemRoot.toLocaleLowerCase("en-US") !==
        value.WINDIR.toLocaleLowerCase("en-US")) {
      throw new Error("SciPy oracle Windows roots disagree");
    }
    if (portableAbsolute(value.TEMP, "SciPy oracle runtime.environment.TEMP") !== temporary ||
        portableAbsolute(value.TMP, "SciPy oracle runtime.environment.TMP") !== temporary ||
        portableAbsolute(value.USERPROFILE, "SciPy oracle runtime.environment.USERPROFILE") !==
          portablePrefix) {
      throw new Error("SciPy oracle Windows environment escapes its prefix");
    }
  } else if (portableAbsolute(value.HOME, "SciPy oracle runtime.environment.HOME") !==
      portablePrefix ||
      portableAbsolute(value.TMPDIR, "SciPy oracle runtime.environment.TMPDIR") !== temporary) {
    throw new Error("SciPy oracle Unix environment escapes its prefix");
  }
  if (authenticate && canonicalJson(value) !==
      canonicalJson(oracleEnvironment(prefix.path, platformId))) {
    throw new Error("SciPy oracle launch environment differs from producer environment");
  }
}

function validateRuntime(value, prefix, platformId, row, label, options = {}) {
  exactKeys(value, ["environment", "python", "numpy", "scipy"], label);
  validateEnvironment(value.environment, prefix, platformId, options);
  exactKeys(
    value.python,
    [
      "version", "implementation", "executable_path", "executable_sha256",
      "executable_bytes", "site_packages_path", "temporary_path", "import_paths",
    ],
    `${label}.python`,
  );
  if (value.python.version !== POLICY.python || value.python.implementation !== "cpython") {
    throw new Error(`${label}.python differs from policy`);
  }
  canonicalRelative(value.python.executable_path, `${label}.python.executable_path`);
  canonicalRelative(value.python.site_packages_path, `${label}.python.site_packages_path`);
  canonicalRelative(value.python.temporary_path, `${label}.python.temporary_path`);
  if (value.python.executable_path !== row.python_executable ||
      value.python.site_packages_path !== row.site_packages ||
      value.python.temporary_path !== ".qualification-tmp") {
    throw new Error(`${label}.python paths differ from the platform catalog`);
  }
  digest(value.python.executable_sha256, `${label}.python.executable_sha256`);
  integer(value.python.executable_bytes, `${label}.python.executable_bytes`, 1);
  if (!Array.isArray(value.python.import_paths) || value.python.import_paths.length === 0 ||
      new Set(value.python.import_paths).size !== value.python.import_paths.length) {
    throw new Error(`${label}.python.import_paths must be nonempty and unique`);
  }
  const importPaths = new Set();
  for (const item of value.python.import_paths) {
    exactKeys(item, ["path", "kind"], `${label}.python.import_path`);
    if (item.path !== "") canonicalRelative(item.path, `${label}.python.import_path.path`);
    if (!["absent", "directory", "file"].includes(item.kind)) {
      throw new Error(`${label}.python.import_path.kind is unsupported`);
    }
    const key = item.path.toLocaleLowerCase("en-US");
    if (importPaths.has(key)) throw new Error(`${label}.python.import_paths contains duplicates`);
    importPaths.add(key);
  }
  if (!value.python.import_paths.some((item) =>
    item.path === row.site_packages && item.kind === "directory")) {
    throw new Error(`${label}.python.import_paths omits authenticated site-packages`);
  }
  for (const name of ["numpy", "scipy"]) {
    const item = value[name];
    exactKeys(
      item,
      ["version", "module_path", "module_sha256", "module_bytes"],
      `${label}.${name}`,
    );
    if (item.version !== POLICY[name]) throw new Error(`${label}.${name} has wrong version`);
    canonicalRelative(item.module_path, `${label}.${name}.module_path`);
    if (item.module_path !== row.site_packages &&
        !item.module_path.startsWith(`${row.site_packages}/`)) {
      throw new Error(`${label}.${name}.module_path lies outside authenticated site-packages`);
    }
    digest(item.module_sha256, `${label}.${name}.module_sha256`);
    integer(item.module_bytes, `${label}.${name}.module_bytes`, 1);
  }
  portableAbsolute(prefix.path, `${label}.prefix.path`);
}

function validateBinding(value, { authenticate = true, root = null } = {}) {
  exactKeys(
    value,
    ["schema", "platform", "policy", "catalog", "provenance", "prefix", "runtime", "id"],
    "SciPy oracle binding",
  );
  if (value.schema !== SCHEMA || typeof value.id !== "string") {
    throw new Error("SciPy oracle binding has wrong schema");
  }
  const { id, ...core } = value;
  if (id !== contentId(core)) throw new Error("SciPy oracle binding content ID mismatch");
  if (canonicalJson(value.policy) !== canonicalJson(POLICY)) {
    throw new Error("SciPy oracle binding policy differs from qualification policy");
  }
  nonempty(value.platform, "SciPy oracle binding.platform");
  exactKeys(value.catalog, ["path", "sha256", "bytes", "snapshot"], "SciPy oracle catalog binding");
  canonicalRelative(value.catalog.path, "SciPy oracle catalog binding.path");
  if (value.catalog.path !== CATALOG_PATH) {
    throw new Error("SciPy oracle binding does not use the canonical checked-in catalog");
  }
  digest(value.catalog.sha256, "SciPy oracle catalog binding.sha256");
  integer(value.catalog.bytes, "SciPy oracle catalog binding.bytes", 1);
  const catalog = validateCatalog(value.catalog.snapshot);
  const catalogBytes = Buffer.from(canonicalJson(catalog));
  if (value.catalog.sha256 !== sha256(catalogBytes) ||
      value.catalog.bytes !== catalogBytes.length) {
    throw new Error("SciPy oracle catalog snapshot binding mismatch");
  }
  const row = catalog.platforms.find((item) => item.platform === value.platform);
  if (row?.status !== "qualified") throw new Error("SciPy oracle binding uses a pending catalog row");
  validateProvenance(value.provenance, row);
  exactKeys(
    value.prefix,
    ["path", "files", "directories", "bytes", "sha256"],
    "SciPy oracle prefix binding",
  );
  portableAbsolute(value.prefix.path, "SciPy oracle prefix binding.path");
  validatePrefixRecord(
    {
      sha256: value.prefix.sha256,
      bytes: value.prefix.bytes,
      files: value.prefix.files,
      directories: value.prefix.directories,
    },
    "SciPy oracle prefix binding",
  );
  if (canonicalJson(value.provenance.prefix) !== canonicalJson({
    sha256: value.prefix.sha256,
    bytes: value.prefix.bytes,
    files: value.prefix.files,
    directories: value.prefix.directories,
  })) {
    throw new Error("SciPy oracle binding prefix differs from provenance");
  }
  validateRuntime(
    value.runtime, value.prefix, value.platform, row, "SciPy oracle runtime", { authenticate },
  );
  if (authenticate) {
    if (root === null) throw new Error("current SciPy oracle authentication requires repository root");
    if (value.platform !== platformIdentity().id) {
      throw new Error("current SciPy oracle binding is for a different platform");
    }
    const currentCatalog = catalogBinding(root, value.catalog.path);
    if (canonicalJson(currentCatalog) !== canonicalJson(value.catalog)) {
      throw new Error("SciPy oracle catalog differs from its binding");
    }
    const currentPrefix = completePrefixClosure(value.prefix.path);
    if (canonicalJson(currentPrefix) !== canonicalJson(value.prefix)) {
      throw new Error("SciPy oracle prefix differs from its binding");
    }
    const currentRuntime = probePrefix(
      value.prefix.path,
      value.runtime.python.executable_path,
      value.runtime.python.site_packages_path,
      value.platform,
    );
    if (canonicalJson(currentRuntime) !== canonicalJson(value.runtime)) {
      throw new Error("SciPy oracle runtime differs from its binding");
    }
  }
  return value;
}

function readBinding(filename, options = {}) {
  return validateBinding(readStrictJson(filename, "SciPy oracle binding"), options);
}

module.exports = {
  CATALOG_PATH,
  CATALOG_SCHEMA,
  ORACLE_ENVIRONMENT,
  POLICY,
  PROVENANCE_SCHEMA,
  SCHEMA,
  createBinding,
  readBinding,
  validateBinding,
  validateCatalog,
  validateProvenance,
  _testing: { completePrefixClosure, oracleEnvironment, probePrefix },
};
