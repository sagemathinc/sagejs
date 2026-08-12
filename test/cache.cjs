"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const {
  parseByteSize,
  pruneModuleCache,
} = require("../dist/tools/cache.js");
const {
  markModuleCacheInUse,
  MODULE_CACHE_LEASE_PREFIX,
} = require("../dist/tools/cache-lease.js");

function temporaryRoot(t) {
  const base = require("node:fs").mkdtempSync(join(tmpdir(), "sagejs-cache-test-"));
  t.after(() => require("node:fs").rmSync(base, { recursive: true, force: true }));
  const root = join(base, "sagejs", "modules");
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

test("size pressure removes oldest eligible versions but honors the grace window", (t) => {
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
  assert.equal(report.entries.find((entry) => entry.version === fresh).reason, undefined);
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
  assert.equal(report.entries.length, 6);
  assert.equal(report.entries.filter((entry) => entry.reason).length, 1);
  assert.equal(require("node:fs").readdirSync(root).length, 6);
});
