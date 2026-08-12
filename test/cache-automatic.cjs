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
const { spawn, spawnSync } = require("node:child_process");
const { test } = require("node:test");

const {
  AUTOMATIC_CACHE_STATE_FILENAME,
  automaticModuleCacheCleanupPlan,
  readAutomaticModuleCacheCleanupState,
  scheduleAutomaticModuleCacheCleanup,
} = require("../dist/tools/cache-auto.js");
const {
  AUTOMATIC_CACHE_LOCK_FILENAME,
  AUTOMATIC_CACHE_LOCK_OWNER_FILENAME,
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
  const lock = join(root, AUTOMATIC_CACHE_LOCK_FILENAME);
  mkdirSync(lock);
  writeFileSync(join(lock, AUTOMATIC_CACHE_LOCK_OWNER_FILENAME), "another-worker\n");
  const result = runAutomaticModuleCacheCleanup({
    currentVersion: current,
    environment: automaticEnvironment(base),
    expectedRoot: root,
    root,
  });
  assert.equal(result.status, "locked");
  assert.equal(existsSync(join(root, expired)), true);
});

test("legacy regular-file locks migrate only after becoming stale", (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("5");
  const firstExpired = versionName("6");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, firstExpired, { ageDays: 100 });
  const lock = join(root, AUTOMATIC_CACHE_LOCK_FILENAME);
  writeFileSync(lock, "legacy-worker\n");
  const options = {
    currentVersion: current,
    environment: automaticEnvironment(base),
    expectedRoot: root,
    lockStaleMs: 60_000,
    root,
  };
  assert.equal(runAutomaticModuleCacheCleanup(options).status, "locked");
  assert.equal(readFileSync(lock, "utf8"), "legacy-worker\n");
  assert.equal(existsSync(join(root, firstExpired)), true);

  const old = new Date(Date.now() - 2 * 60 * 60 * 1_000);
  utimesSync(lock, old, old);
  const migrated = runAutomaticModuleCacheCleanup(options);
  assert.equal(migrated.status, "applied");
  assert.deepEqual(migrated.report.removedVersions, [firstExpired]);
  assert.equal(existsSync(lock), false);
  assert.deepEqual(
    readdirSync(root).filter((name) => name.includes(".legacy-")),
    [],
  );
});

test("empty lock crash remnants are preserved while fresh and reclaimed stale", (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("5");
  const expired = versionName("6");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100 });
  const lock = join(root, AUTOMATIC_CACHE_LOCK_FILENAME);
  mkdirSync(lock);
  const options = {
    currentVersion: current,
    environment: automaticEnvironment(base),
    expectedRoot: root,
    lockStaleMs: 60_000,
    root,
  };
  assert.equal(runAutomaticModuleCacheCleanup(options).status, "locked");
  const old = new Date(Date.now() - 2 * 60 * 60 * 1_000);
  utimesSync(lock, old, old);
  const recovered = runAutomaticModuleCacheCleanup(options);
  assert.equal(recovered.status, "applied");
  assert.deepEqual(recovered.report.removedVersions, [expired]);
  assert.equal(existsSync(lock), false);
});

test("concurrent stale-lock takeover admits at most one cleanup worker", async (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("5");
  const expired = versionName("6");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100 });
  const lock = join(root, AUTOMATIC_CACHE_LOCK_FILENAME);
  mkdirSync(lock);
  const owner = join(lock, AUTOMATIC_CACHE_LOCK_OWNER_FILENAME);
  writeFileSync(owner, "stale-owner\n");
  const old = new Date(Date.now() - 3 * 60 * 60 * 1_000);
  utimesSync(owner, old, old);
  const helper = join(__dirname, "..", "dist", "tools", "cache-auto-worker.js");
  const source = `
    const { runAutomaticModuleCacheCleanup } = require(process.argv[1]);
    const options = JSON.parse(process.argv[2]);
    process.on("message", () => {
      const result = runAutomaticModuleCacheCleanup(options);
      process.send(result.status);
      process.exit(0);
    });
  `;
  const options = {
    currentVersion: current,
    environment: automaticEnvironment(base),
    expectedRoot: root,
    lockStaleMs: 60_000,
    root,
  };
  const children = Array.from(
    { length: 2 },
    () => spawn(
      process.execPath,
      ["-e", source, helper, JSON.stringify(options)],
      { stdio: ["ignore", "ignore", "pipe", "ipc"] },
    ),
  );
  t.after(() => children.forEach((child) => {
    if (child.exitCode === null) child.kill();
  }));
  const statuses = children.map((child) => new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("message", resolve);
  }));
  children.forEach((child) => child.send("go"));
  const results = await Promise.all(statuses);
  assert.equal(results.filter((status) => status === "applied").length, 1);
  assert.ok(
    results.every((status) => ["applied", "locked", "recent"].includes(status)),
  );
  assert.equal(existsSync(join(root, expired)), false);
  assert.equal(existsSync(lock), false);
});

test("abandoned guard directories recover only after becoming stale", (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("5");
  const expired = versionName("6");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100 });
  const guard = join(root, `${AUTOMATIC_CACHE_LOCK_FILENAME}.guard`);
  mkdirSync(guard);
  const options = {
    currentVersion: current,
    environment: automaticEnvironment(base),
    expectedRoot: root,
    lockStaleMs: 60_000,
    root,
  };
  assert.equal(runAutomaticModuleCacheCleanup(options).status, "locked");
  const old = new Date(Date.now() - 2 * 60 * 60 * 1_000);
  utimesSync(guard, old, old);
  const recovered = runAutomaticModuleCacheCleanup(options);
  assert.equal(recovered.status, "applied");
  assert.deepEqual(recovered.report.removedVersions, [expired]);
  assert.equal(existsSync(guard), false);
});

test("owner release waits through fresh guard contention", (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("5");
  const expired = versionName("6");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100 });
  const guard = join(root, `${AUTOMATIC_CACHE_LOCK_FILENAME}.guard`);
  let helper;
  const result = runAutomaticModuleCacheCleanup({
    beforeRemove: () => {
      if (helper) return;
      const source = `
        const { mkdirSync, writeFileSync, rmSync } = require("node:fs");
        const { join } = require("node:path");
        const guard = process.argv[1];
        mkdirSync(guard);
        writeFileSync(join(guard, "owner"), "contender\\n");
        process.send("held");
        setTimeout(() => { rmSync(guard, { recursive: true }); process.exit(0); }, 100);
      `;
      helper = spawn(process.execPath, ["-e", source, guard], {
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      const deadline = Date.now() + 1_000;
      while (!existsSync(join(guard, AUTOMATIC_CACHE_LOCK_OWNER_FILENAME))) {
        assert.ok(Date.now() < deadline, "guard helper did not become ready");
      }
    },
    currentVersion: current,
    environment: automaticEnvironment(base),
    expectedRoot: root,
    root,
  });
  t.after(() => {
    if (helper?.exitCode === null) helper.kill();
  });
  assert.equal(result.status, "applied");
  assert.equal(existsSync(join(root, AUTOMATIC_CACHE_LOCK_FILENAME)), false);
});

test("automatic cleanup may remove one oversized eligible generation", (t) => {
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
  assert.deepEqual(result.report.removedVersions, [expired]);
  assert.deepEqual(result.report.deferredVersions, []);
  assert.equal(existsSync(join(root, expired)), false);
});

test("deferred cleanup records a short retry deadline and observable result", (t) => {
  const { base, root } = temporaryRoot(t);
  const now = Date.now();
  const current = versionName("7");
  const candidates = ["8", "9"].map(versionName);
  addVersion(root, current, { ageDays: 100 });
  candidates.forEach((version) => addVersion(root, version, { ageDays: 100 }));
  const environment = automaticEnvironment(base, {
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_INTERVAL_HOURS: "24",
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_VERSIONS: "1",
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_RETRY_HOURS: "0.25",
  });
  const first = runAutomaticModuleCacheCleanup({
    currentVersion: current,
    environment,
    expectedRoot: root,
    now,
    root,
  });
  assert.equal(first.status, "applied");
  assert.equal(first.report.deferredVersions.length, 1);
  const state = readAutomaticModuleCacheCleanupState(root);
  assert.equal(state.last_status, "deferred");
  assert.equal(state.next_attempt_ms, now + 15 * 60 * 1_000);
  assert.equal(state.last_removed_versions, 1);
  assert.equal(
    automaticModuleCacheCleanupPlan(join(root, current), {
      environment,
      home: base,
      now: now + 14 * 60 * 1_000,
    }),
    undefined,
  );
  assert.ok(automaticModuleCacheCleanupPlan(join(root, current), {
    environment,
    home: base,
    now: now + 16 * 60 * 1_000,
  }));
});

test("per-entry prune errors are observable and retry promptly", (t) => {
  const { base, root } = temporaryRoot(t);
  const now = Date.now();
  const current = versionName("7");
  const unsafe = versionName("8");
  const removable = versionName("9");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, unsafe, { ageDays: 110 });
  addVersion(root, removable, { ageDays: 100 });
  const environment = automaticEnvironment(base, {
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_INTERVAL_HOURS: "24",
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_VERSIONS: "1",
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP_RETRY_HOURS: "0.25",
  });
  const result = runAutomaticModuleCacheCleanup({
    beforeRemove: (entry) => {
      if (entry.version !== unsafe) return;
      rmSync(entry.path, { recursive: true, force: true });
      try {
        symlinkSync(root, entry.path, "dir");
      } catch (error) {
        if (error && ["EPERM", "EACCES"].includes(error.code)) return;
        throw error;
      }
    },
    currentVersion: current,
    environment,
    expectedRoot: root,
    now,
    root,
  });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.report.skippedVersions, [unsafe]);
  assert.deepEqual(result.report.removedVersions, [removable]);
  const state = readAutomaticModuleCacheCleanupState(root);
  assert.equal(state.last_status, "error");
  assert.match(state.last_error, /could not be removed/);
  assert.equal(state.next_attempt_ms, now + 15 * 60 * 1_000);
});

test("automatic cleanup makes bounded progress on a recent high-churn cache", (t) => {
  const { base, root } = temporaryRoot(t);
  const now = Date.now();
  const current = versionName("a");
  const pinned = versionName("b");
  const leased = versionName("c");
  const ordinary = ["d", "e", "f", "1", "2"].map(versionName);
  addVersion(root, current, { ageDays: 0.9, bytes: 32 });
  addVersion(root, pinned, { ageDays: 0.8, bytes: 32, pin: true });
  addVersion(root, leased, { ageDays: 0.7, bytes: 32, lease: true });
  ordinary.forEach((version, index) => {
    addVersion(root, version, { ageDays: 0.6 - index * 0.05, bytes: 32 });
  });
  const result = runAutomaticModuleCacheCleanup({
    currentVersion: current,
    environment: automaticEnvironment(base, {
      SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_BYTES: "1MiB",
      SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_VERSIONS: "2",
      SAGEJS_MODULE_CACHE_KEEP_VERSIONS: "2",
      SAGEJS_MODULE_CACHE_MAX_SIZE: "128B",
    }),
    expectedRoot: root,
    now,
    root,
  });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.report.removedVersions, ordinary.slice(0, 2));
  assert.ok(result.report.deferredVersions.length > 0);
  for (const version of [current, pinned, leased]) {
    assert.equal(existsSync(join(root, version)), true, version);
  }
  const newest = result.report.entries.filter((entry) => entry.newest);
  assert.equal(newest.length, 2);
  assert.ok(newest.every((entry) => existsSync(join(root, entry.version))));
  assert.ok(
    result.report.removedVersions.every((version) =>
      ordinary.includes(version)
    ),
  );
});

test("the detached worker cannot be redirected to a nonstandard cache root", (t) => {
  const { base, root } = temporaryRoot(t);
  const current = versionName("9");
  const expired = versionName("a");
  addVersion(root, current, { ageDays: 100 });
  addVersion(root, expired, { ageDays: 100 });
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "..", "dist", "tools", "cache-auto-worker.js"),
      "--root",
      root,
      "--version",
      current,
    ],
    {
      env: automaticEnvironment(join(base, "different-cache-base")),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(existsSync(join(root, expired)), true);
  assert.equal(existsSync(join(root, AUTOMATIC_CACHE_STATE_FILENAME)), false);
});
