#!/usr/bin/env node

"use strict";

// Release-oriented cache validation.  This intentionally uses tiny synthetic
// artifacts: the goal is to exercise the production publication, locking,
// recovery, maintenance, and public CLI paths without rebuilding FLINT or
// touching a developer's real caches.

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, parse, resolve } = require("node:path");

const {
  assertExactNativeCacheRoot,
  cleanupNativeCache,
  ensureNativeCompiler,
  nativeCacheStatus,
  prepareNativeArtifact,
  snapshot,
  validCacheEntry,
} = require("./native-worktree-cache.cjs");

const repositoryRoot = resolve(__dirname, "..");
const reportSchema = "sagejs.release-cache-smoke/v1";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureSpec(workspace, label, id = "graph-addon") {
  const inputs = snapshot(workspace, ["source"]);
  return {
    id,
    key: digest(`${label}\n${JSON.stringify(inputs)}`),
    inputPaths: ["source"],
    inputs,
    outputRoots: ["build/native"],
    requiredOutputs: ["build/native/addon.node"],
    buildCommands: [],
  };
}

function writeArtifact(workspace, contents) {
  const output = join(workspace, "build", "native", "addon.node");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, contents);
}

function outputContents(workspace) {
  return readFileSync(
    join(workspace, "build", "native", "addon.node"),
    "utf8",
  );
}

function runProcess(command, arguments_, options = {}) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, arguments_, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectProcess);
    child.once("close", (status, signal) => {
      resolveProcess({ signal, status, stderr, stdout });
    });
  });
}

function setOldTimestamp(path) {
  const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  utimesSync(path, old, old);
}

function addUserCacheGeneration(root, version, contents) {
  const directory = join(root, version);
  mkdirSync(directory, { recursive: true });
  const payload = join(directory, "module.json");
  writeFileSync(payload, contents);
  setOldTimestamp(payload);
  setOldTimestamp(directory);
}

async function publicUserCacheScenario(root) {
  const cacheHome = join(root, "user-cache-home");
  const moduleRoot = join(cacheHome, "sagejs", "modules");
  const dynamicRoot = join(cacheHome, "sagejs", "dynamic");
  const moduleVersions = ["1".repeat(40), "2".repeat(40)];
  const dynamicVersions = ["3".repeat(40), "4".repeat(40)];
  const activeVersion = "5".repeat(40);
  for (const version of moduleVersions) {
    addUserCacheGeneration(moduleRoot, version, "m".repeat(4096));
  }
  for (const version of dynamicVersions) {
    addUserCacheGeneration(dynamicRoot, version, "d".repeat(4096));
  }
  addUserCacheGeneration(moduleRoot, activeVersion, "active".repeat(700));
  writeFileSync(
    join(moduleRoot, activeVersion, `.sagejs-active-${process.pid}-smoke.json`),
    JSON.stringify({ schema: "sagejs.module-cache-lease/v1" }),
  );
  const sentinel = join(root, "user-cache-neighbor.txt");
  writeFileSync(sentinel, "preserve\n");
  const baseArguments = [
    join(repositoryRoot, "bin", "sagejs"),
    "cache",
    "prune",
    "--family",
    "all",
    "--keep",
    "0",
    "--max-size",
    "1B",
    "--max-age",
    "0",
    "--min-age",
    "0",
    "--json",
  ];
  const environment = {
    ...process.env,
    HOME: join(root, "home"),
    SAGEJS_USE_SOURCE: "1",
    XDG_CACHE_HOME: cacheHome,
  };
  mkdirSync(environment.HOME, { recursive: true });
  const dryRun = await runProcess(process.execPath, baseArguments, {
    cwd: repositoryRoot,
    env: environment,
  });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const plan = JSON.parse(dryRun.stdout);
  assert.equal(plan.applied, false);
  assert.ok(plan.candidateBytes >= 16 * 1024);
  for (const version of [...moduleVersions, ...dynamicVersions]) {
    const familyRoot = moduleVersions.includes(version) ? moduleRoot : dynamicRoot;
    assert.equal(existsSync(join(familyRoot, version)), true);
  }

  const applied = await runProcess(
    process.execPath,
    [...baseArguments.slice(0, -1), "--apply", "--json"],
    { cwd: repositoryRoot, env: environment },
  );
  assert.equal(applied.status, 0, applied.stderr);
  const result = JSON.parse(applied.stdout);
  assert.equal(result.applied, true);
  assert.ok(result.reclaimedBytes >= 16 * 1024);
  for (const version of moduleVersions) {
    assert.equal(existsSync(join(moduleRoot, version)), false);
  }
  for (const version of dynamicVersions) {
    assert.equal(existsSync(join(dynamicRoot, version)), false);
  }
  assert.equal(existsSync(join(moduleRoot, activeVersion)), true);
  assert.equal(readFileSync(sentinel, "utf8"), "preserve\n");
  return {
    dry_run_candidates: Object.values(plan.families).reduce(
      (sum, family) =>
        sum + family.entries.filter((entry) => entry.reason).length,
      0,
    ),
    reclaimed_bytes: result.reclaimedBytes,
    preserved_live_leases: 1,
    removed_versions: Object.values(result.families).reduce(
      (sum, family) => sum + family.removedVersions.length,
      0,
    ),
  };
}

function nativeLifecycleScenario(root) {
  const workspace = join(root, "native-lifecycle-workspace");
  const cacheRoot = join(root, "native-lifecycle-cache");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, "source"), "stable source\n");
  const spec = fixtureSpec(workspace, "stable");
  let builds = 0;
  const build = (current, contents) => {
    builds += 1;
    writeArtifact(current, contents);
  };

  const cold = prepareNativeArtifact(workspace, cacheRoot, spec, {
    build(current) { build(current, "cold artifact\n"); },
  });
  assert.equal(cold.status, "built");
  assert.equal(validCacheEntry(cold.entry, spec), true);
  const warm = prepareNativeArtifact(workspace, cacheRoot, spec, {
    build() { assert.fail("warm cache rebuilt"); },
  });
  assert.equal(warm.status, "present");
  rmSync(join(workspace, "build"), { recursive: true, force: true });
  const restored = prepareNativeArtifact(workspace, cacheRoot, spec, {
    build() { assert.fail("restorable cache rebuilt"); },
  });
  assert.equal(restored.status, "restored");
  assert.equal(outputContents(workspace), "cold artifact\n");

  writeFileSync(
    join(cold.entry, "payload", "build", "native", "addon.node"),
    "corrupt artifact\n",
  );
  rmSync(join(workspace, "build"), { recursive: true, force: true });
  const recovered = prepareNativeArtifact(workspace, cacheRoot, spec, {
    build(current) { build(current, "recovered artifact\n"); },
  });
  assert.equal(recovered.status, "built");
  assert.equal(outputContents(workspace), "recovered artifact\n");
  assert.equal(validCacheEntry(recovered.entry, spec), true);

  writeFileSync(join(workspace, "source"), "interrupted source\n");
  const interruptedSpec = fixtureSpec(workspace, "interrupted");
  assert.throws(
    () => prepareNativeArtifact(workspace, cacheRoot, interruptedSpec, {
      build(current) {
        writeArtifact(current, "partial output\n");
        throw new Error("simulated compiler interruption");
      },
    }),
    /simulated compiler interruption/,
  );
  assert.equal(existsSync(join(cacheRoot, interruptedSpec.id, interruptedSpec.key)), false);
  assert.equal(
    existsSync(join(cacheRoot, interruptedSpec.id, `${interruptedSpec.key}.lock`)),
    false,
  );
  const retried = prepareNativeArtifact(workspace, cacheRoot, interruptedSpec, {
    build(current) { build(current, "retry artifact\n"); },
  });
  assert.equal(retried.status, "built");
  assert.equal(outputContents(workspace), "retry artifact\n");
  assert.equal(validCacheEntry(retried.entry, interruptedSpec), true);
  return { builds, cold: cold.status, interrupted_retry: retried.status, warm: warm.status };
}

function nativeCleanupScenario(root) {
  const workspace = join(root, "native-cleanup-workspace");
  const cacheRoot = join(root, "native-cleanup-cache");
  const sentinel = join(root, "native-cleanup-neighbor.txt");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(sentinel, "preserve\n");
  const specs = [];
  for (let index = 0; index < 4; index += 1) {
    writeFileSync(join(workspace, "source"), `generation ${index}\n`);
    const spec = fixtureSpec(workspace, `generation-${index}`);
    prepareNativeArtifact(workspace, cacheRoot, spec, {
      build(current) { writeArtifact(current, `artifact ${index}\n`); },
    });
    specs.push(spec);
  }
  const options = {
    currentSpecs: [specs.at(-1)],
    expectedRoot: cacheRoot,
    maxBytes: 1024 * 1024,
    maxGenerations: 1,
  };
  const before = nativeCacheStatus(workspace, cacheRoot, options);
  assert.equal(before.safe, true);
  assert.equal(before.totals.generations, 4);
  const dryRun = cleanupNativeCache(workspace, cacheRoot, options);
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.selected.generations.length, 1);
  assert.equal(
    nativeCacheStatus(workspace, cacheRoot, options).totals.generations,
    4,
  );
  const applied = cleanupNativeCache(workspace, cacheRoot, {
    ...options,
    apply: true,
  });
  assert.equal(applied.removed.generations.length, 1);
  assert.equal(applied.after.generations, 3);
  assert.equal(
    existsSync(join(cacheRoot, specs.at(-1).id, specs.at(-1).key)),
    true,
  );

  assert.throws(
    () => assertExactNativeCacheRoot(workspace, workspace, workspace),
    /refused broad root/,
  );
  assert.throws(
    () => assertExactNativeCacheRoot(
      workspace,
      parse(workspace).root,
      parse(workspace).root,
    ),
    /refused broad root/,
  );
  mkdirSync(join(cacheRoot, "unexpected-family"));
  assert.throws(
    () => cleanupNativeCache(workspace, cacheRoot, {
      ...options,
      apply: true,
    }),
    /refused unsafe layout/,
  );
  assert.equal(readFileSync(sentinel, "utf8"), "preserve\n");
  return {
    before_generations: 4,
    per_pass_limit: 1,
    remaining_generations: 3,
  };
}

function unusableLocationScenario(root) {
  const workspace = join(root, "unusable-workspace");
  const protectedDirectory = join(root, "unwritable-parent");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(protectedDirectory, { recursive: true });
  writeFileSync(join(workspace, "source"), "source\n");
  const spec = fixtureSpec(workspace, "unusable");
  chmodSync(protectedDirectory, 0o500);
  let mode = "permissions";
  try {
    writeFileSync(join(protectedDirectory, "probe"), "probe\n");
    // Root and some Windows filesystems can write despite mode bits. A file as
    // an ancestor is the portable equivalent: the selected cache location is
    // unusable and must fail explicitly without touching neighboring data.
    chmodSync(protectedDirectory, 0o700);
    rmSync(protectedDirectory, { recursive: true, force: true });
    writeFileSync(protectedDirectory, "preserve\n");
    mode = "invalid-ancestor-fallback";
  } catch (_error) {}
  let failure;
  try {
    prepareNativeArtifact(
      workspace,
      join(protectedDirectory, "native-cache"),
      spec,
      { build(current) { writeArtifact(current, "must not publish\n"); } },
    );
  } catch (error) {
    failure = error;
  } finally {
    try { chmodSync(protectedDirectory, 0o700); } catch (_error) {}
  }
  assert.ok(failure instanceof Error, "unusable cache location unexpectedly succeeded");
  if (mode === "invalid-ancestor-fallback") {
    assert.equal(readFileSync(protectedDirectory, "utf8"), "preserve\n");
  }
  assert.equal(existsSync(join(workspace, "build")), false);
  return { error_code: failure.code ?? null, mode };
}

function compilerFailureScenario(root) {
  const workspace = join(root, "compiler-workspace");
  mkdirSync(workspace, { recursive: true });
  assert.throws(
    () => ensureNativeCompiler(workspace, {
      buildCompiler() {
        throw new Error("C/C++ compiler unavailable (release smoke)");
      },
    }),
    /C\/C\+\+ compiler unavailable/,
  );
  assert.equal(existsSync(join(workspace, "dist", ".sagejs-native-compiler.lock")), false);
  assert.equal(existsSync(join(workspace, "dist", ".sagejs-native-compiler.json")), false);
  assert.equal(existsSync(join(workspace, "dist", "compiler")), false);
  const recovered = ensureNativeCompiler(workspace, {
    buildCompiler(_current, required) {
      for (const filename of required) {
        mkdirSync(dirname(filename), { recursive: true });
        writeFileSync(filename, "release smoke compiler fixture\n");
      }
    },
  });
  assert.equal(recovered.status, "built");
  assert.equal(existsSync(recovered.compiler), true);
  return { failure_was_transactional: true, retry: recovered.status };
}

async function concurrentPublicationScenario(root) {
  const cacheRoot = join(root, "concurrent-cache");
  const marker = join(root, "concurrent-builds.txt");
  const workspaces = [join(root, "concurrent-left"), join(root, "concurrent-right")];
  for (const workspace of workspaces) {
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "source"), "shared concurrent source\n");
  }
  const children = workspaces.map((workspace) => runProcess(process.execPath, [
    __filename,
    "--concurrent-worker",
    workspace,
    cacheRoot,
    marker,
  ]));
  const results = await Promise.all(children);
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const statuses = results.map(({ stdout }) => stdout.trim());
  assert.deepEqual(new Set(statuses), new Set(["built", "restored"]));
  assert.equal(readFileSync(marker, "utf8").trim().split("\n").length, 1);
  for (const workspace of workspaces) {
    assert.equal(outputContents(workspace), "concurrent winner\n");
  }
  return { builds: 1, statuses: statuses.sort() };
}

function concurrentWorker(workspace, cacheRoot, marker) {
  const spec = fixtureSpec(workspace, "concurrent");
  const result = prepareNativeArtifact(workspace, cacheRoot, spec, {
    build(current) {
      appendFileSync(marker, `${process.pid}\n`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      writeArtifact(current, "concurrent winner\n");
    },
  });
  process.stdout.write(result.status);
}

async function measuredScenario(name, callback) {
  const started = process.hrtime.bigint();
  try {
    const details = await callback();
    return {
      details,
      duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
      name,
      status: "pass",
    };
  } catch (error) {
    return {
      duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
      error: error instanceof Error ? error.message : String(error),
      name,
      status: "fail",
    };
  }
}

async function runReleaseCacheSmoke(options = {}) {
  const ownsRoot = options.root === undefined;
  const root = options.root === undefined
    ? mkdtempSync(join(tmpdir(), "sagejs-release-cache-smoke-"))
    : resolve(options.root);
  mkdirSync(root, { recursive: true });
  const scenarios = [];
  const definitions = [
    ["public-user-cache-bounds", () => publicUserCacheScenario(root)],
    ["native-cold-warm-corrupt-interrupted", () => nativeLifecycleScenario(root)],
    ["native-bounded-cleanup-and-path-safety", () => nativeCleanupScenario(root)],
    ["unusable-cache-location", () => unusableLocationScenario(root)],
    ["missing-compiler-recovery", () => compilerFailureScenario(root)],
    ["concurrent-native-publication", () => concurrentPublicationScenario(root)],
  ];
  for (const [name, callback] of definitions) {
    scenarios.push(await measuredScenario(name, callback));
  }
  const passed = scenarios.filter(({ status }) => status === "pass").length;
  const preserve = options.keepTemporary === true || !ownsRoot;
  if (!preserve) rmSync(root, { recursive: true, force: true });
  return {
    schema: reportSchema,
    arch: process.arch,
    platform: process.platform,
    node: process.versions.node,
    passed,
    failed: scenarios.length - passed,
    scenarios,
    temporary_root: preserve ? root : null,
    temporary_root_removed: !preserve,
  };
}

function printHumanReport(report) {
  process.stdout.write(
    `Sage.js release cache smoke: ${report.passed}/${report.scenarios.length} passed\n`,
  );
  for (const scenario of report.scenarios) {
    process.stdout.write(
      `${scenario.status === "pass" ? "PASS" : "FAIL"} ` +
        `${scenario.name} (${scenario.duration_ms.toFixed(1)} ms)` +
        `${scenario.error ? `: ${scenario.error}` : ""}\n`,
    );
  }
  if (report.temporary_root) {
    process.stdout.write(`Temporary evidence retained at ${report.temporary_root}\n`);
  }
}

async function main(arguments_) {
  if (arguments_[0] === "--concurrent-worker") {
    if (arguments_.length !== 4) throw new Error("invalid concurrent-worker invocation");
    concurrentWorker(arguments_[1], arguments_[2], arguments_[3]);
    return;
  }
  if (arguments_.includes("--help")) {
    process.stdout.write(
      "usage: release-cache-smoke.cjs [--json] [--keep-temp] [--root PATH]\n",
    );
    return;
  }
  const known = new Set(["--json", "--keep-temp", "--root"]);
  let root;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!known.has(argument)) throw new Error(`unknown option ${argument}`);
    if (argument === "--root") {
      index += 1;
      if (index >= arguments_.length) throw new Error("--root needs a path");
      root = arguments_[index];
    }
  }
  const report = await runReleaseCacheSmoke({
    keepTemporary: arguments_.includes("--keep-temp"),
    root,
  });
  if (arguments_.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanReport(report);
  }
  if (report.failed !== 0) process.exitCode = 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { reportSchema, runReleaseCacheSmoke };
