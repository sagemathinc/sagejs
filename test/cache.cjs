"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { EventEmitter, once } = require("node:events");
const { test } = require("node:test");

const {
  defaultDynamicCacheRoot,
  parseByteSize,
  pruneModuleCache,
} = require("../dist/tools/cache.js");
const {
  markModuleCacheInUse,
  MODULE_CACHE_LEASE_PREFIX,
} = require("../dist/tools/cache-lease.js");
const {
  atomicWriteCacheFileSync,
  readCacheFileSync,
} = require("../dist/tools/cache-file.js");

function temporaryRoot(t) {
  const base = require("node:fs").mkdtempSync(join(tmpdir(), "sagejs-cache-test-"));
  t.after(() => require("node:fs").rmSync(base, { recursive: true, force: true }));
  const root = join(base, "sagejs", "modules");
  mkdirSync(root, { recursive: true });
  return { base, root };
}

function temporaryDynamicRoot(t) {
  const base = require("node:fs").mkdtempSync(
    join(tmpdir(), "sagejs-dynamic-cache-test-"),
  );
  t.after(() => require("node:fs").rmSync(base, { recursive: true, force: true }));
  const root = join(base, "sagejs", "dynamic");
  mkdirSync(root, { recursive: true });
  return { base, root };
}

function versionName(digit) {
  return digit.repeat(40);
}

function addVersion(root, version, { ageDays, bytes = 16, lease = false, pin = false }) {
  const directory = join(root, version);
  mkdirSync(directory);
  const payload = join(directory, "module.json");
  writeFileSync(payload, "x".repeat(bytes));
  if (pin) writeFileSync(join(directory, ".sagejs-keep"), "");
  if (lease) {
    writeFileSync(
      join(directory, `${MODULE_CACHE_LEASE_PREFIX}42-test.json`),
      "{}",
    );
  }
  const date = new Date(Date.now() - ageDays * 86_400_000);
  for (const name of require("node:fs").readdirSync(directory)) {
    utimesSync(join(directory, name), date, date);
  }
  utimesSync(directory, date, date);
  if (lease) {
    const activeLease = require("node:fs").readdirSync(directory)
      .find((name) => name.startsWith(MODULE_CACHE_LEASE_PREFIX));
    const now = new Date();
    utimesSync(join(directory, activeLease), now, now);
  }
  return directory;
}

function waitForChild(child) {
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null) resolve();
      else reject(new Error(
        `cache publisher exited with code ${code}, signal ${signal}: ${stderr}`,
      ));
    });
  });
}

test("cache files are atomically visible to concurrent readers and writers", async (t) => {
  const { base } = temporaryRoot(t);
  const directory = join(base, "publication");
  const filename = join(directory, "module.json");
  mkdirSync(directory);
  atomicWriteCacheFileSync(filename, JSON.stringify({ writer: -1, sequence: -1 }));

  const helper = join(__dirname, "..", "dist", "tools", "cache-file.js");
  const publisher = `
    const { atomicWriteCacheFileSync } = require(${JSON.stringify(helper)});
    const filename = process.argv[1];
    const writer = Number(process.argv[2]);
    for (let sequence = 0; sequence < 40; sequence += 1) {
      atomicWriteCacheFileSync(filename, JSON.stringify({
        payload: "x".repeat(256 * 1024),
        sequence,
        writer,
      }));
    }
  `;
  const children = Array.from({ length: 4 }, (_, writer) => spawn(
    process.execPath,
    ["-e", publisher, filename, String(writer)],
    { stdio: ["ignore", "ignore", "pipe"] },
  ));
  let settled = false;
  const completed = Promise.all(children.map(waitForChild)).finally(() => {
    settled = true;
  });
  while (!settled) {
    const document = JSON.parse(readCacheFileSync(filename, "utf8"));
    assert.equal(Number.isInteger(document.writer), true);
    assert.equal(Number.isInteger(document.sequence), true);
    if (document.payload !== undefined) {
      assert.equal(document.payload.length, 256 * 1024);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  await completed;
  JSON.parse(readCacheFileSync(filename, "utf8"));
  assert.deepEqual(
    readdirSync(directory).filter((name) => name.startsWith(".sagejs-publish-")),
    [],
  );
});

test("failed cache publication removes its private temporary file", (t) => {
  const { base } = temporaryRoot(t);
  const directory = join(base, "failed-publication");
  const filename = join(directory, "occupied-by-a-directory");
  mkdirSync(filename, { recursive: true });
  assert.throws(
    () => atomicWriteCacheFileSync(filename, "cache payload"),
    /EISDIR|EPERM|EACCES|EEXIST|ENOTEMPTY/,
  );
  assert.deepEqual(
    readdirSync(directory).filter((name) => name.startsWith(".sagejs-publish-")),
    [],
  );
});

test("bounded cleanup preserves a concurrently publishing leased generation", async (t) => {
  const { root } = temporaryRoot(t);
  const version = versionName("9");
  const directory = join(root, version);
  const filename = join(directory, "module.json");
  mkdirSync(directory);

  const cacheFileHelper = join(__dirname, "..", "dist", "tools", "cache-file.js");
  const leaseHelper = join(__dirname, "..", "dist", "tools", "cache-lease.js");
  const publisher = `
    const { atomicWriteCacheFileSync } = require(${JSON.stringify(cacheFileHelper)});
    const { markModuleCacheInUse } = require(${JSON.stringify(leaseHelper)});
    const directory = process.argv[1];
    const filename = process.argv[2];
    const release = markModuleCacheInUse(directory, 10);
    let sequence = 0;
    const publish = () => atomicWriteCacheFileSync(
      filename,
      JSON.stringify({ sequence: sequence++ }),
    );
    publish();
    const timer = setInterval(publish, 2);
    process.on("message", (message) => {
      if (message !== "stop") return;
      clearInterval(timer);
      release();
      process.exit(0);
    });
    process.send("ready");
  `;
  const child = spawn(
    process.execPath,
    ["-e", publisher, directory, filename],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  });
  const completed = waitForChild(child);
  await once(child, "message");
  const whileActive = pruneModuleCache({
    apply: true,
    currentVersions: [],
    expectedRoot: root,
    policy: { keepVersions: 0, maxAgeDays: 0, minAgeDays: 0, maxBytes: 0 },
    root,
  });
  assert.deepEqual(whileActive.removedVersions, []);
  assert.equal(
    whileActive.entries.find((entry) => entry.version === version).inUse,
    true,
  );
  assert.equal(existsSync(filename), true);
  child.send("stop");
  await completed;

  const afterRelease = pruneModuleCache({
    apply: true,
    currentVersions: [],
    expectedRoot: root,
    policy: { keepVersions: 0, maxAgeDays: 0, minAgeDays: 0, maxBytes: 0 },
    root,
  });
  assert.deepEqual(afterRelease.removedVersions, [version]);
  assert.equal(existsSync(directory), false);
});

test("module-cache prune preserves current, recent, pinned, and leased versions", (t) => {
  const { root } = temporaryRoot(t);
  const current = versionName("a");
  const expired = versionName("b");
  const active = versionName("c");
  const pinned = versionName("d");
  const recent = versionName("e");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100, bytes: 37 });
  addVersion(root, active, { ageDays: 100, lease: true });
  addVersion(root, pinned, { ageDays: 100, pin: true });
  addVersion(root, recent, { ageDays: 1 });
  writeFileSync(join(root, "README"), "not managed");

  const dryRun = pruneModuleCache({
    currentVersions: [current],
    expectedRoot: root,
    now: Date.now(),
    policy: { keepVersions: 0, maxAgeDays: 30, minAgeDays: 7, maxBytes: 10_000 },
    root,
  });
  assert.equal(dryRun.applied, false);
  assert.deepEqual(
    dryRun.entries.filter((entry) => entry.reason).map((entry) => entry.version),
    [expired],
  );
  assert.equal(dryRun.candidateBytes, 37);
  assert.deepEqual(dryRun.ignoredEntries, ["README"]);
  assert.equal(existsSync(join(root, expired)), true);

  const applied = pruneModuleCache({
    apply: true,
    currentVersions: [current],
    expectedRoot: root,
    now: Date.now(),
    policy: { keepVersions: 0, maxAgeDays: 30, minAgeDays: 7, maxBytes: 10_000 },
    root,
  });
  assert.deepEqual(applied.removedVersions, [expired]);
  assert.equal(applied.reclaimedBytes, 37);
  assert.equal(existsSync(join(root, expired)), false);
  for (const version of [current, active, pinned, recent]) {
    assert.equal(existsSync(join(root, version)), true, version);
  }
});

test("size pressure uses the age grace before crossing it", (t) => {
  const { root } = temporaryRoot(t);
  const old = versionName("1");
  const middle = versionName("2");
  const fresh = versionName("3");
  addVersion(root, old, { ageDays: 20, bytes: 40 });
  addVersion(root, middle, { ageDays: 10, bytes: 40 });
  addVersion(root, fresh, { ageDays: 2, bytes: 40 });
  const report = pruneModuleCache({
    currentVersions: [],
    expectedRoot: root,
    policy: { keepVersions: 0, maxAgeDays: 30, minAgeDays: 7, maxBytes: 50 },
    root,
  });
  assert.deepEqual(
    report.entries.filter((entry) => entry.reason).map((entry) => entry.version).sort(),
    [old, middle].sort(),
  );
  assert.equal(
    report.entries.find((entry) => entry.version === middle).reason,
    "over-size",
  );
  assert.equal(report.entries.find((entry) => entry.version === fresh).reason, undefined);
});

test("high-churn recent versions obey size pressure and hard protections", (t) => {
  const { root } = temporaryRoot(t);
  const now = Date.now();
  const current = versionName("a");
  const pinned = versionName("b");
  const leased = versionName("c");
  const ordinary = ["1", "2", "3", "4", "5", "6"].map(versionName);
  addVersion(root, current, { ageDays: 0.8, bytes: 40 });
  addVersion(root, pinned, { ageDays: 0.7, bytes: 40, pin: true });
  addVersion(root, leased, { ageDays: 0.6, bytes: 40, lease: true });
  ordinary.forEach((version, index) => {
    addVersion(root, version, { ageDays: 0.5 - index * 0.05, bytes: 40 });
  });

  const dryRun = pruneModuleCache({
    currentVersions: [current],
    expectedRoot: root,
    now,
    policy: { keepVersions: 2, maxAgeDays: 30, minAgeDays: 7, maxBytes: 200 },
    root,
  });
  const candidates = dryRun.entries.filter((entry) => entry.reason);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((entry) => entry.ageDays < 7));
  assert.ok(candidates.every((entry) => entry.reason === "over-size"));
  for (const version of [current, pinned, leased]) {
    assert.equal(
      dryRun.entries.find((entry) => entry.version === version).reason,
      undefined,
      version,
    );
  }
  assert.equal(dryRun.entries.filter((entry) => entry.newest).length, 2);
  assert.ok(
    dryRun.entries
      .filter((entry) => entry.newest)
      .every((entry) => !entry.reason),
  );

  const applied = pruneModuleCache({
    apply: true,
    currentVersions: [current],
    expectedRoot: root,
    now,
    policy: { keepVersions: 2, maxAgeDays: 30, minAgeDays: 7, maxBytes: 200 },
    root,
  });
  assert.deepEqual(
    applied.removedVersions.sort(),
    candidates.map((entry) => entry.version).sort(),
  );
  for (const version of [current, pinned, leased]) {
    assert.equal(existsSync(join(root, version)), true, version);
  }
});

test("a real process lease is idempotent and released explicitly", (t) => {
  const { root } = temporaryRoot(t);
  const version = versionName("4");
  const directory = join(root, version);
  const release = markModuleCacheInUse(directory, 60_000);
  const releaseAgain = markModuleCacheInUse(directory, 60_000);
  assert.equal(releaseAgain, release);
  const lease = require("node:fs").readdirSync(directory)
    .find((name) => name.startsWith(MODULE_CACHE_LEASE_PREFIX));
  assert.ok(lease);
  const document = JSON.parse(readFileSync(join(directory, lease), "utf8"));
  assert.equal(document.schema, "sagejs.module-cache-lease/v1");
  release();
  assert.equal(existsSync(join(directory, lease)), false);
});

test("the real dynamic compiler shares and releases its generation lease", async (t) => {
  const { base, root } = temporaryDynamicRoot(t);
  const helper = join(__dirname, "..", "dist", "tools", "dynamic-code.js");
  const source = `
    globalThis.__sagejs_parse_python__ = () => ({});
    const { compileDynamic } = require(process.argv[1]);
    const first = compileDynamic("1", "<lease-one>", "eval");
    const second = compileDynamic("2", "<lease-two>", "eval");
    process.send({ first: first.version, second: second.version });
    process.on("message", (message) => {
      if (message === "stop") process.exit(0);
    });
  `;
  const child = spawn(process.execPath, ["-e", source, helper], {
    env: {
      ...process.env,
      HOME: base,
      XDG_CACHE_HOME: base,
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  });
  const completed = waitForChild(child);
  const [message] = await once(child, "message");
  assert.equal(message.first, message.second);
  const directory = join(root, message.first);
  const leases = readdirSync(directory).filter((name) =>
    name.startsWith(MODULE_CACHE_LEASE_PREFIX)
  );
  assert.equal(leases.length, 1);
  child.send("stop");
  await completed;
  assert.equal(existsSync(join(directory, leases[0])), false);
});

test("cache pruning rejects broad and symlinked roots", (t) => {
  const { base, root } = temporaryRoot(t);
  assert.throws(
    () => pruneModuleCache({ currentVersions: [], expectedRoot: base, root: base }),
    /broad root/,
  );
  const real = join(base, "real", "sagejs", "modules");
  const linked = join(base, "linked", "sagejs", "modules");
  mkdirSync(real, { recursive: true });
  mkdirSync(join(base, "linked", "sagejs"), { recursive: true });
  try {
    symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error && ["EPERM", "EACCES"].includes(error.code)) return;
    throw error;
  }
  assert.throws(
    () => pruneModuleCache({ currentVersions: [], expectedRoot: linked, root: linked }),
    /symlinked root/,
  );
  assert.equal(existsSync(root), true);
});

test("byte-size parser accepts explicit binary and decimal units", () => {
  assert.equal(parseByteSize("2GiB"), 2 * 1024 ** 3);
  assert.equal(parseByteSize("2GB"), 2_000_000_000);
  assert.equal(parseByteSize("512 MiB"), 512 * 1024 ** 2);
  assert.throws(() => parseByteSize("all"), /invalid byte size/);
});

test("sagejs cache prune is a dry run by default", (t) => {
  const { base, root } = temporaryRoot(t);
  for (let index = 0; index < 6; index += 1) {
    addVersion(root, index.toString(16).repeat(40), { ageDays: 60 + index });
  }
  const result = spawnSync(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs"), "cache", "prune", "--json"],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: base,
        SAGEJS_USE_SOURCE: "1",
        XDG_CACHE_HOME: base,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.applied, false);
  assert.equal(report.families.modules.entries.length, 6);
  assert.equal(
    report.families.modules.entries.filter((entry) => entry.reason).length,
    1,
  );
  assert.equal(report.families.dynamic.entries.length, 0);
  assert.equal(require("node:fs").readdirSync(root).length, 6);
});

test("dynamic cache uses the same lease-safe bounded policy", (t) => {
  const { root } = temporaryDynamicRoot(t);
  const current = versionName("a");
  const obsolete = versionName("b");
  const active = versionName("c");
  addVersion(root, current, { ageDays: 100, bytes: 32 });
  addVersion(root, obsolete, { ageDays: 100, bytes: 64 });
  addVersion(root, active, { ageDays: 100, bytes: 128, lease: true });
  const report = pruneModuleCache({
    apply: true,
    currentVersions: [current],
    expectedRoot: root,
    family: "dynamic",
    policy: { keepVersions: 0, maxAgeDays: 0, minAgeDays: 0, maxBytes: 0 },
    root,
  });
  assert.equal(report.family, "dynamic");
  assert.deepEqual(report.removedVersions, [obsolete]);
  assert.equal(existsSync(join(root, current)), true);
  assert.equal(existsSync(join(root, active)), true);
  assert.equal(report.entries.find((entry) => entry.version === active).inUse, true);
  assert.throws(
    () => pruneModuleCache({
      currentVersions: [],
      expectedRoot: root,
      family: "modules",
      root,
    }),
    /family modules does not match cache root/,
  );
});

test("cache CLI can report only the selected dynamic family", (t) => {
  const { base, root } = temporaryDynamicRoot(t);
  addVersion(root, versionName("e"), { ageDays: 100, bytes: 64 });
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "..", "bin", "sagejs"),
      "cache",
      "prune",
      "--family",
      "dynamic",
      "--keep",
      "0",
      "--max-age",
      "0",
      "--min-age",
      "0",
      "--json",
    ],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: base,
        SAGEJS_USE_SOURCE: "1",
        XDG_CACHE_HOME: base,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(report.families), ["dynamic"]);
  assert.equal(report.families.dynamic.entries.length, 1);
  assert.equal(report.families.dynamic.entries[0].reason, "expired");
  assert.equal(existsSync(join(root, versionName("e"))), true);
});

test("sagejs cache status reports quiet automatic cleanup state", (t) => {
  const { base, root } = temporaryRoot(t);
  const dynamicRoot = defaultDynamicCacheRoot({ XDG_CACHE_HOME: base }, base);
  mkdirSync(dynamicRoot, { recursive: true });
  writeFileSync(join(root, ".sagejs-auto-cleanup.json"), JSON.stringify({
    schema: "sagejs.module-cache-auto-cleanup/v1",
    last_attempt_ms: 1_000,
    next_attempt_ms: 2_000,
    last_status: "deferred",
    last_reclaimed_bytes: 4096,
    last_removed_versions: 2,
  }));
  const result = spawnSync(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs"), "cache", "status", "--json"],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: base,
        SAGEJS_USE_SOURCE: "1",
        XDG_CACHE_HOME: base,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.modules.root, root);
  assert.equal(status.modules.automatic.last_status, "deferred");
  assert.equal(status.modules.automatic.last_reclaimed_bytes, 4096);
  assert.equal(status.dynamic.root, dynamicRoot);
  assert.equal(status.dynamic.automatic, undefined);
});

test("cache help distinguishes hard retention from the age grace", () => {
  const result = spawnSync(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs"), "cache", "--help"],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, SAGEJS_USE_SOURCE: "1" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /current compiler, newest retained versions, pinned\s+versions, and versions leased/,
  );
  assert.match(
    result.stdout,
    /Recent obsolete versions are protected from age-based expiry, but\s+are selected when older obsolete versions cannot meet the size target/,
  );
  assert.match(
    result.stdout,
    /Prefer obsolete versions at least this old under size\s+pressure/,
  );
});

test("cache prune exits cleanly when its stdout consumer closes early", async (t) => {
  const { base, root } = temporaryRoot(t);
  // Make the JSON report larger than the first pipe read, just as a real cache
  // with many compiler versions is. Names that are not version hashes are
  // reported but are never prune candidates.
  for (let index = 0; index < 1_000; index += 1) {
    writeFileSync(
      join(
        root,
        `ignored-${index.toString().padStart(4, "0")}-${"x".repeat(120)}`,
      ),
      "",
    );
  }
  const child = spawn(
    process.execPath,
    [join(__dirname, "..", "bin", "sagejs"), "cache", "prune", "--json"],
    {
      cwd: join(__dirname, ".."),
      env: {
        ...process.env,
        HOME: base,
        SAGEJS_USE_SOURCE: "1",
        XDG_CACHE_HOME: base,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const closed = once(child, "close");
  const producedOutput = await Promise.race([
    once(child.stdout, "data").then(() => true),
    closed.then(() => false),
  ]);
  assert.equal(producedOutput, true, stderr);
  child.stdout.destroy();
  const [code, signal] = await closed;
  assert.equal(signal, null);
  assert.equal(code, 0, stderr);
  assert.equal(stderr, "");
});

test("the CLI output handler recognizes EPIPE deterministically", () => {
  const { installCliOutputHandler } = require("../dist/tools/process-output.js");
  const stream = new EventEmitter();
  let exitCode;
  installCliOutputHandler(stream, (code) => {
    exitCode = code;
  });
  stream.emit(
    "error",
    Object.assign(new Error("broken pipe"), { code: "EPIPE" }),
  );
  assert.equal(exitCode, 0);
});

test("the CLI output handler does not swallow non-EPIPE stream errors", () => {
  const script = `
    const { installCliOutputHandler } = require(${JSON.stringify(
      join(__dirname, "..", "dist", "tools", "process-output.js"),
    )});
    installCliOutputHandler();
    const error = Object.assign(new Error("synthetic stdout failure"), { code: "EIO" });
    process.stdout.emit("error", error);
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /synthetic stdout failure/);
});
