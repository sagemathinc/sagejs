"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");

const {
  AUTOMATIC_CACHE_STATE_FILENAME,
  automaticModuleCacheCleanupPlan,
  scheduleAutomaticModuleCacheCleanup,
} = require("../dist/tools/cache-auto.js");
const {
  AUTOMATIC_CACHE_LOCK_FILENAME,
  runAutomaticModuleCacheCleanup,
} = require("../dist/tools/cache-auto-worker.js");
const {
  MODULE_CACHE_LEASE_PREFIX,
} = require("../dist/tools/cache-lease.js");

const DAY_MS = 86_400_000;

function temporaryRoot(t) {
  const base = mkdtempSync(join(tmpdir(), "sagejs-auto-cache-test-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, "sagejs", "modules");
  mkdirSync(root, { recursive: true });
  return { base, root };
}

function versionName(digit) {
  return digit.repeat(40);
}

function addVersion(
  root,
  version,
  { ageDays, bytes = 16, lease = false, pin = false },
) {
  const directory = join(root, version);
  mkdirSync(directory);
  writeFileSync(join(directory, "module.json"), "x".repeat(bytes));
  if (pin) writeFileSync(join(directory, ".sagejs-keep"), "");
  if (lease) {
    writeFileSync(
      join(directory, `${MODULE_CACHE_LEASE_PREFIX}42-test.json`),
      "{}",
    );
  }
  const old = new Date(Date.now() - ageDays * DAY_MS);
  for (const filename of readdirSync(directory)) {
    utimesSync(join(directory, filename), old, old);
  }
  utimesSync(directory, old, old);
  if (lease) {
    const filename = readdirSync(directory).find((name) =>
      name.startsWith(MODULE_CACHE_LEASE_PREFIX)
    );
    const now = new Date();
    utimesSync(join(directory, filename), now, now);
  }
  return directory;
}

function automaticEnvironment(base, overrides = {}) {
  return {
    XDG_CACHE_HOME: base,
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_INTERVAL_HOURS: "1",
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_BYTES: "1MiB",
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_VERSIONS: "1",
    SAGEJS_MODULE_CACHE_KEEP_VERSIONS: "0",
    SAGEJS_MODULE_CACHE_MAX_AGE_DAYS: "30",
    SAGEJS_MODULE_CACHE_MAX_SIZE: "10MiB",
    SAGEJS_MODULE_CACHE_MIN_AGE_DAYS: "7",
    ...overrides,
  };
}

test("automatic cleanup only plans a standard, due, versioned module cache", (t) => {
  const { base, root } = temporaryRoot(t);
  const version = versionName("a");
  const directory = addVersion(root, version, { ageDays: 0 });
  const environment = automaticEnvironment(base);
  const workerPath = join(base, "worker.js");
  const plan = automaticModuleCacheCleanupPlan(directory, {
    environment,
    home: base,
    now: 100_000,
    workerPath,
  });
  assert.deepEqual(plan, {
    args: [workerPath, "--root", root, "--version", version],
    root,
    version,
    workerPath,
  });
  assert.equal(
    automaticModuleCacheCleanupPlan(directory, {
      environment: { ...environment, SAGEJS_MODULE_CACHE_AUTO_CLEANUP: "0" },
      home: base,
    }),
    undefined,
  );
  assert.equal(
    automaticModuleCacheCleanupPlan(join(base, version), {
      environment,
      home: base,
    }),
    undefined,
  );

  writeFileSync(
    join(root, AUTOMATIC_CACHE_STATE_FILENAME),
    JSON.stringify({
      schema: "sagejs.module-cache-auto-cleanup/v1",
      last_attempt_ms: 99_000,
    }),
  );
  assert.equal(
    automaticModuleCacheCleanupPlan(directory, {
      environment,
      home: base,
      now: 100_000,
    }),
    undefined,
  );
});

test("automatic cleanup starts an unreferenced detached worker", (t) => {
  const { base, root } = temporaryRoot(t);
  const directory = addVersion(root, versionName("b"), { ageDays: 0 });
  let callback;
  let timerUnreferenced = false;
  let childUnreferenced = false;
  let invocation;
  const scheduled = scheduleAutomaticModuleCacheCleanup(directory, {
    environment: automaticEnvironment(base),
    home: base,
    setTimer: (fn) => {
      callback = fn;
      return { unref: () => { timerUnreferenced = true; } };
    },
    spawnProcess: (command, args, options) => {
      invocation = { command, args, options };
      return {
        once: () => {},
        unref: () => { childUnreferenced = true; },
      };
    },
  });
  assert.equal(scheduled, true);
  assert.equal(timerUnreferenced, true);
  assert.equal(invocation, undefined);
  callback();
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.options.detached, true);
  assert.equal(invocation.options.stdio, "ignore");
  assert.equal(childUnreferenced, true);
});

test("automatic cleanup is frequency and work bounded while preserving protected versions", (t) => {
  const { base, root } = temporaryRoot(t);
  const now = Date.now();
  const current = versionName("c");
  const oldest = versionName("d");
  const older = versionName("e");
  const pinned = versionName("f");
  const leased = versionName("1");
  const recent = versionName("2");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, oldest, { ageDays: 90, bytes: 31 });
  addVersion(root, older, { ageDays: 80, bytes: 37 });
  addVersion(root, pinned, { ageDays: 100, pin: true });
  addVersion(root, leased, { ageDays: 100, lease: true });
  addVersion(root, recent, { ageDays: 1 });
  const options = {
    currentVersion: current,
    environment: automaticEnvironment(base),
    expectedRoot: root,
    now,
    root,
  };

  const first = runAutomaticModuleCacheCleanup(options);
  assert.equal(first.status, "applied");
  assert.deepEqual(first.report.removedVersions, [oldest]);
  assert.deepEqual(first.report.deferredVersions, [older]);
  assert.equal(existsSync(join(root, oldest)), false);
  for (const version of [current, older, pinned, leased, recent]) {
    assert.equal(existsSync(join(root, version)), true, version);
  }

  const repeated = runAutomaticModuleCacheCleanup(options);
  assert.equal(repeated.status, "recent");
  assert.equal(existsSync(join(root, older)), true);

  const later = runAutomaticModuleCacheCleanup({
    ...options,
    now: now + 2 * 60 * 60 * 1_000,
  });
  assert.equal(later.status, "applied");
  assert.deepEqual(later.report.removedVersions, [older]);
  const state = JSON.parse(
    readFileSync(join(root, AUTOMATIC_CACHE_STATE_FILENAME), "utf8"),
  );
  assert.equal(state.last_removed_versions, 1);
  assert.equal(state.last_reclaimed_bytes, 37);
  assert.equal(existsSync(join(root, AUTOMATIC_CACHE_LOCK_FILENAME)), false);
});

test("automatic cleanup refuses unsafe markers and never follows symlinks", (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("3");
  const expired = versionName("4");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100 });
  const target = join(base, "outside-state");
  writeFileSync(target, "outside");
  try {
    symlinkSync(target, join(root, AUTOMATIC_CACHE_STATE_FILENAME), "file");
  } catch (error) {
    if (error && ["EPERM", "EACCES"].includes(error.code)) return;
    throw error;
  }
  assert.throws(
    () => runAutomaticModuleCacheCleanup({
      currentVersion: current,
      environment: automaticEnvironment(base),
      expectedRoot: root,
      root,
    }),
    /unsafe state marker/,
  );
  assert.equal(readFileSync(target, "utf8"), "outside");
  assert.equal(existsSync(join(root, expired)), true);
  assert.equal(existsSync(join(root, AUTOMATIC_CACHE_LOCK_FILENAME)), false);
  assert.equal(lstatSync(join(root, AUTOMATIC_CACHE_STATE_FILENAME)).isSymbolicLink(), true);
});

test("automatic cleanup honors a live maintenance lock", (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("5");
  const expired = versionName("6");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100 });
  writeFileSync(join(root, AUTOMATIC_CACHE_LOCK_FILENAME), "another-worker\n");
  const result = runAutomaticModuleCacheCleanup({
    currentVersion: current,
    environment: automaticEnvironment(base),
    expectedRoot: root,
    root,
  });
  assert.equal(result.status, "locked");
  assert.equal(existsSync(join(root, expired)), true);
});

test("automatic cleanup never exceeds its byte budget", (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("7");
  const expired = versionName("8");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100, bytes: 65 });
  const result = runAutomaticModuleCacheCleanup({
    currentVersion: current,
    environment: automaticEnvironment(base, {
      SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_BYTES: "64B",
      SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_VERSIONS: "10",
    }),
    expectedRoot: root,
    root,
  });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.report.removedVersions, []);
  assert.deepEqual(result.report.deferredVersions, [expired]);
  assert.equal(existsSync(join(root, expired)), true);
});
