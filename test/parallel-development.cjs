"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} = require("node:fs");
const { hostname, tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");

const {
  claimCovers,
  claimsOverlap,
  findOverlaps,
  laneAllowsClaim,
  lanes,
  normalizePath,
  validateTask,
  validationCommandsForFiles,
  workspaceFingerprint,
} = require("../scripts/parallel-lib.cjs");
const taskSchema = require("../.agents/task.schema.json");
const {
  resolveProjectBase,
  statusEntriesForBranch,
  taskForBranch,
} = require("../scripts/parallel-development.cjs");
const {
  assertExactNativeCacheRoot,
  cleanupNativeCache,
  ensureNativeCompiler,
  fflasUsesFlintPrefix,
  nativeArtifactSpecs,
  nativeCachePackages,
  nativeCacheProcessIdentity,
  nativeCacheStatus,
  prepareNativeArtifact,
  restoreNativeArtifact,
  restoreNativePackages,
  snapshot,
  validCacheEntry,
} = require("../scripts/native-worktree-cache.cjs");
const {
  makeFflasPrefixRelocatable,
} = require("../packages/fflas/scripts/build-deps.cjs");

const parallelDevelopmentModule = resolve(
  __dirname,
  "../scripts/native-worktree-cache.cjs",
);

function task(overrides = {}) {
  return {
    schema_version: 2,
    id: "modsym-newspace",
    title: "Fast newspace decomposition",
    lane: "modular-forms",
    status: "active",
    owner: "test-agent",
    objective: "Implement a bounded modular-symbols improvement.",
    base_commit: "0".repeat(40),
    claims: [
      "src/baselib/modular.py",
      "packages/flint/src/p1.c",
      "test/modular-symbols.cjs",
    ],
    dependencies: [],
    references: ["https://wstein.org/books/modform/"],
    architecture: {
      strategy: "mixed",
      fallback: "tested-capability",
      oracles: ["sage"],
      exceptions: [
        "The fixture claims an existing native file to test native task policy.",
      ],
    },
    platforms: {
      "linux-x64": "required",
      "linux-arm64": "required",
      "windows-x64": "required",
      "macos-arm64": "required",
    },
    validation: [
      "pnpm test:baselib:strict",
      "pnpm test:native",
      "pnpm bench:modular-symbols",
    ],
    runs: [],
    handoff: { summary: "", risks: [], next_steps: [] },
    ...overrides,
  };
}

test("parallel path claims are normalized and have precise coverage", () => {
  assert.equal(normalizePath("./test\\modular.cjs"), "test/modular.cjs");
  assert.equal(claimCovers("test/", "test/modular.cjs"), true);
  assert.equal(claimCovers("test/modular.cjs", "test/modular.cjs.tmp"), false);
  assert.equal(claimsOverlap("src/baselib/", "src/baselib/modular.py"), true);
  assert.equal(claimsOverlap("src/baselib/modular.py", "test/modular.cjs"), false);
  assert.throws(() => normalizePath("../outside"), /repository-relative/);
});

test("lane policy permits focused native and collateral claims", () => {
  const lane = lanes.get("modular-forms");
  assert.equal(laneAllowsClaim(lane, "packages/flint/src/p1.c"), true);
  assert.equal(laneAllowsClaim(lane, "bench/newspace.cjs"), true);
  assert.equal(laneAllowsClaim(lane, "src/baselib/graphics.py"), false);
  assert.deepEqual(
    new Set(taskSchema.properties.lane.enum),
    new Set(lanes.keys()),
  );
});

test("task contracts enforce lane checks and Windows native policy", () => {
  assert.deepEqual(validateTask(task(), "modsym-newspace.json"), []);
  const errors = validateTask(
    task({
      platforms: {
        "linux-x64": "required",
        "linux-arm64": "required",
        "windows-x64": "not-applicable",
        "macos-arm64": "required",
      },
      validation: ["pnpm test:native"],
    }),
    "modsym-newspace.json",
  );
  assert.ok(errors.some((message) => message.includes("lane check")));
  assert.ok(errors.some((message) => message.includes("must require Windows")));
});

test("only live task contracts participate in collision detection", () => {
  const entries = [
    { task: task() },
    {
      task: task({
        id: "second-task",
        claims: ["src/baselib/modular.py"],
      }),
    },
    {
      task: task({
        id: "historical-task",
        status: "complete",
        claims: ["src/baselib/modular.py"],
      }),
    },
  ];
  assert.deepEqual(findOverlaps(entries).map(({ left, right }) => [left, right]), [
    ["modsym-newspace", "second-task"],
  ]);
});

test("the current agent branch selects its task among inherited live manifests", () => {
  const entries = [
    { task: task({ id: "older-live-task" }) },
    { task: task({ id: "current-task" }) },
    { task: task({ id: "another-live-task" }) },
  ];
  assert.equal(
    taskForBranch(entries, "agent/current-task"),
    entries[1],
  );
  assert.equal(taskForBranch(entries, "main"), undefined);
  assert.equal(taskForBranch(entries, ""), undefined);
});

test("status reports only the task owned by each worktree branch", () => {
  const entries = [
    { task: task({ id: "inherited-active" }) },
    { task: task({ id: "current-task" }) },
    { task: task({ id: "historical", status: "complete" }) },
  ];
  assert.deepEqual(
    statusEntriesForBranch(entries, "agent/current-task"),
    [entries[1]],
  );
  assert.deepEqual(statusEntriesForBranch(entries, "integration-branch"), []);
});

test("new projects inherit the invoking worktree unless a base is explicit", () => {
  assert.equal(resolveProjectBase(undefined), "HEAD");
  assert.equal(resolveProjectBase("origin/main"), "origin/main");
  assert.equal(
    resolveProjectBase("origin/dense-qq-resources"),
    "origin/dense-qq-resources",
  );
});

test("changed-file checks rebuild native code before testing it", () => {
  assert.deepEqual(
    validationCommandsForFiles(["packages/flint/src/p1.c"]),
    [
      [
        "pnpm",
        "parallel:cache",
        "--",
        "prepare",
        "--package",
        "flint",
      ],
      ["pnpm", "architecture:check"],
      ["pnpm", "test:native"],
    ],
  );
  assert.deepEqual(
    validationCommandsForFiles([
      "tools/native-kernel/compiler.cjs",
      "packages/flint/scripts/build-deps.cjs",
    ]).slice(0, 2),
    [
      [
        "pnpm",
        "parallel:cache",
        "--",
        "prepare",
        "--package",
        "flint",
      ],
      ["pnpm", "build"],
    ],
  );
  assert.deepEqual(validationCommandsForFiles(["DOCUMENTATION.md"]), [
    ["pnpm", "docs:check"],
  ]);
  assert.deepEqual(validationCommandsForFiles([".agents/lanes.json"]), [
    ["pnpm", "architecture:check"],
    ["pnpm", "test:unit"],
  ]);
  assert.deepEqual(
    validationCommandsForFiles(["test/parallel-development.cjs"]),
    [["pnpm", "test:unit"]],
  );
  assert.deepEqual(validationCommandsForFiles(["test/graphics.cjs"]), [
    ["pnpm", "test:integration"],
  ]);
});

test("task contracts enforce source-transparent compiler policy", () => {
  const errors = validateTask(task({
    architecture: {
      strategy: "source-transparent-native",
      fallback: "tested-capability",
      oracles: ["sage"],
      exceptions: [],
    },
  }), "modsym-newspace.json");
  assert.ok(errors.some((message) => message.includes("same-source fallback")));
  assert.ok(errors.some((message) => message.includes("cpython oracle")));
  assert.ok(errors.some((message) => message.includes("javascript oracle")));
});

test("validation fingerprints ignore manifests and Git staging state", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-parallel-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory });
  try {
    git("init", "--quiet");
    git("config", "user.name", "Sage.js test");
    git("config", "user.email", "test@example.invalid");
    mkdirSync(join(directory, ".agents", "tasks"), { recursive: true });
    writeFileSync(join(directory, "source.txt"), "initial\n");
    writeFileSync(join(directory, ".agents", "tasks", "task.json"), "{}\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "initial");

    writeFileSync(join(directory, "source.txt"), "changed\n");
    const unstaged = workspaceFingerprint(
      directory,
      ".agents/tasks/task.json",
    );
    git("add", "source.txt");
    const staged = workspaceFingerprint(directory, ".agents/tasks/task.json");
    writeFileSync(
      join(directory, ".agents", "tasks", "task.json"),
      '{"runs":[1]}\n',
    );
    const receiptUpdated = workspaceFingerprint(
      directory,
      ".agents/tasks/task.json",
    );
    assert.equal(staged, unstaged);
    assert.equal(receiptUpdated, unstaged);

    git("add", ".agents/tasks/task.json");
    git(
      "commit",
      "--quiet",
      "--only",
      "-m",
      "record receipts",
      ".agents/tasks/task.json",
    );
    const receiptCommitted = workspaceFingerprint(
      directory,
      ".agents/tasks/task.json",
    );
    assert.equal(receiptCommitted, unstaged);

    writeFileSync(join(directory, "source.txt"), "different\n");
    assert.notEqual(
      workspaceFingerprint(directory, ".agents/tasks/task.json"),
      unstaged,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function nativeCacheHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nativeCacheFixture() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-cache-test-"));
  const workspace = join(directory, "workspace");
  const cacheRoot = join(directory, "cache");
  mkdirSync(join(workspace, "source"), { recursive: true });
  writeFileSync(join(workspace, "source", "input.c"), "first\n");
  return { directory, workspace, cacheRoot };
}

function nativeCacheSpec(workspace, identity = "toolchain-a") {
  const inputs = snapshot(workspace, ["source"]);
  return {
    id: "fixture-addon",
    key: nativeCacheHash(JSON.stringify({ identity, inputs })),
    inputPaths: ["source"],
    inputs,
    outputRoots: ["build/native"],
    requiredOutputs: ["build/native/addon.node"],
    buildCommands: [],
  };
}

function buildNativeCacheFixture(counter, contents = "native artifact\n") {
  return (workspace) => {
    counter.count += 1;
    mkdirSync(join(workspace, "build", "native"), { recursive: true });
    writeFileSync(join(workspace, "build", "native", "addon.node"), contents);
  };
}

function makeFixtureWritable(path) {
  if (!existsSync(path)) return;
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink()) return;
  chmodSync(path, metadata.mode | (metadata.isDirectory() ? 0o700 : 0o200));
  if (metadata.isDirectory()) {
    for (const name of readdirSync(path)) {
      makeFixtureWritable(join(path, name));
    }
  }
}

test("native cache replaces vcpkg payload and status as one installation", () => {
  const { cacheRoot, directory, workspace } = nativeCacheFixture();
  const outputRoot = "build/vcpkg-installed";
  const targetLibrary = `${outputRoot}/target/lib/flint.lib`;
  const status = `${outputRoot}/vcpkg/status`;
  const inputs = snapshot(workspace, ["source"]);
  const spec = {
    id: "vcpkg-dependencies",
    key: nativeCacheHash(JSON.stringify(inputs)),
    inputPaths: ["source"],
    inputs,
    outputRoots: [outputRoot],
    requiredOutputs: [targetLibrary],
    buildCommands: [],
  };
  try {
    mkdirSync(dirname(join(workspace, targetLibrary)), { recursive: true });
    mkdirSync(dirname(join(workspace, status)), { recursive: true });
    writeFileSync(join(workspace, targetLibrary), "unverified library\n");
    writeFileSync(join(workspace, status), "stale installed record\n");

    const built = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build(current) {
        assert.equal(existsSync(join(current, targetLibrary)), false);
        assert.equal(existsSync(join(current, status)), false);
        mkdirSync(dirname(join(current, targetLibrary)), { recursive: true });
        mkdirSync(dirname(join(current, status)), { recursive: true });
        writeFileSync(join(current, targetLibrary), "verified library\n");
        writeFileSync(join(current, status), "verified installed record\n");
      },
    });
    assert.equal(built.status, "built");

    rmSync(join(workspace, outputRoot), { recursive: true, force: true });
    const restored = restoreNativeArtifact(workspace, cacheRoot, spec);
    assert.equal(restored.status, "restored");
    assert.equal(
      readFileSync(join(workspace, targetLibrary), "utf8"),
      "verified library\n",
    );
    assert.equal(
      readFileSync(join(workspace, status), "utf8"),
      "verified installed record\n",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function nativeMaintenanceFixture() {
  const temporaryRoot = realpathSync(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, "sagejs-cache-maintenance-"));
  const workspace = join(directory, "workspace");
  const cacheRoot = join(directory, "sagejs-native-artifacts");
  mkdirSync(workspace);
  mkdirSync(cacheRoot);
  return { cacheRoot, directory, workspace };
}

function writeMaintenanceGeneration(
  cacheRoot,
  id,
  key,
  options = {},
) {
  const outputRoot = options.outputRoot || "build/native";
  const entry = join(cacheRoot, id, key);
  const payload = join(entry, "payload", outputRoot);
  const contents = options.contents || "cached generation\n";
  mkdirSync(payload, { recursive: true });
  writeFileSync(join(payload, "artifact.bin"), contents);
  const filePath = `${outputRoot}/artifact.bin`;
  writeFileSync(join(entry, "manifest.json"), `${JSON.stringify({
    schema: "sagejs.parallel-native-artifact-cache-v1",
    id,
    key,
    output_roots: [outputRoot],
    input_hash: "0".repeat(64),
    materialization: "copy",
    generation: options.mathProfile
      ? {
        identity_hash: "1".repeat(64),
        math_profile: options.mathProfile,
        package_id: id.replace(/-(?:dependencies|addon)$/, ""),
        stage: id.endsWith("-addon") ? "addon" : "dependencies",
      }
      : null,
    files: [{
      path: filePath,
      type: "file",
      mode: 0o644,
      size: Buffer.byteLength(contents),
      sha256: nativeCacheHash(contents),
    }],
  }, null, 2)}\n`);
  if (options.modified) {
    const when = new Date(options.modified);
    utimesSync(entry, when, when);
  }
  return entry;
}

test("native cache status reports size and conservative retention reasons", () => {
  const { cacheRoot, directory, workspace } = nativeMaintenanceFixture();
  const selectedKey = "1".repeat(64);
  const obsoleteKey = "2".repeat(64);
  const lockedKey = "3".repeat(64);
  const currentSpecs = [{
    id: "flint-dependencies",
    key: selectedKey,
    outputRoots: ["packages/flint/.native/prefix"],
  }];
  try {
    writeMaintenanceGeneration(cacheRoot, "flint-dependencies", selectedKey, {
      contents: "selected\n",
      mathProfile: {
        effective: "portable",
        fingerprint: "a".repeat(64),
        requested: "portable",
      },
    });
    writeMaintenanceGeneration(cacheRoot, "flint-dependencies", obsoleteKey, {
      contents: "obsolete generation\n",
    });
    writeMaintenanceGeneration(cacheRoot, "flint-dependencies", lockedKey, {
      contents: "locked generation\n",
    });
    mkdirSync(
      join(cacheRoot, "flint-dependencies", `${lockedKey}.lock`),
      { recursive: true },
    );
    const status = nativeCacheStatus(workspace, cacheRoot, {
      currentSpecs,
      expectedRoot: cacheRoot,
    });
    assert.equal(status.safe, true);
    assert.equal(status.totals.generations, 3);
    assert.equal(status.totals.obsolete_generations, 1);
    assert.equal(status.totals.retained_generations, 2);
    assert.ok(status.totals.bytes >= Buffer.byteLength(
      "selected\nobsolete generation\nlocked generation\n",
    ));
    const generations = new Map(
      status.artifacts[0].generations.map((generation) => [
        generation.key,
        generation,
      ]),
    );
    assert.deepEqual(generations.get(selectedKey).reasons, ["current-selected"]);
    assert.deepEqual(generations.get(lockedKey).reasons, ["build-lock"]);
    assert.equal(generations.get(obsoleteKey).state, "obsolete");
    assert.equal(
      generations.get(selectedKey).math_profile.fingerprint,
      "a".repeat(64),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native cache cleanup is dry-run by default and bounded when applied", () => {
  const { cacheRoot, directory, workspace } = nativeMaintenanceFixture();
  const keys = ["4".repeat(64), "5".repeat(64), "6".repeat(64)];
  const currentSpecs = [];
  try {
    keys.forEach((key, index) => writeMaintenanceGeneration(
      cacheRoot,
      "graph-addon",
      key,
      {
        contents: `${"x".repeat(16 + index)}\n`,
        modified: `2026-01-0${index + 1}T00:00:00.000Z`,
      },
    ));
    const dryRun = cleanupNativeCache(workspace, cacheRoot, {
      currentSpecs,
      expectedRoot: cacheRoot,
      maxBytes: 1024,
      maxGenerations: 1,
    });
    assert.equal(dryRun.applied, false);
    assert.equal(dryRun.eligible.generations, 3);
    assert.equal(dryRun.selected.generations.length, 1);
    assert.equal(dryRun.selected.generations[0].key, keys[0]);
    assert.equal(existsSync(join(cacheRoot, "graph-addon", keys[0])), true);

    const applied = cleanupNativeCache(workspace, cacheRoot, {
      apply: true,
      currentSpecs,
      expectedRoot: cacheRoot,
      maxBytes: 1024,
      maxGenerations: 1,
    });
    assert.equal(applied.removed.generations.length, 1);
    assert.equal(applied.removed.generations[0].key, keys[0]);
    assert.equal(applied.after.generations, 2);
    assert.equal(existsSync(join(cacheRoot, "graph-addon", keys[0])), false);
    assert.equal(existsSync(join(cacheRoot, "graph-addon", keys[1])), true);
    assert.equal(existsSync(join(cacheRoot, "graph-addon", keys[2])), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native cache cleanup rechecks locks before each removal", () => {
  const { cacheRoot, directory, workspace } = nativeMaintenanceFixture();
  const key = "7".repeat(64);
  try {
    const entry = writeMaintenanceGeneration(cacheRoot, "graph-dependencies", key);
    const result = cleanupNativeCache(workspace, cacheRoot, {
      apply: true,
      currentSpecs: [],
      expectedRoot: cacheRoot,
      maxBytes: 1024,
      maxGenerations: 1,
      beforeRemove() {
        mkdirSync(`${entry}.lock`);
      },
    });
    assert.equal(result.removed.generations.length, 0);
    assert.equal(result.skipped[0].result, "new-lock");
    assert.equal(existsSync(entry), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("installed shared cache links retain their exact generation", {
  skip: process.platform === "win32",
}, () => {
  const { cacheRoot, directory, workspace } = nativeMaintenanceFixture();
  const installedKey = "8".repeat(64);
  const selectedKey = "9".repeat(64);
  const outputRoot = "packages/fflas/.native/prefix";
  try {
    const installed = writeMaintenanceGeneration(
      cacheRoot,
      "fflas-dependencies",
      installedKey,
      { outputRoot },
    );
    const output = join(workspace, outputRoot);
    mkdirSync(dirname(output), { recursive: true });
    symlinkSync(join(installed, "payload", outputRoot), output, "dir");
    const status = nativeCacheStatus(workspace, cacheRoot, {
      currentSpecs: [{
        id: "fflas-dependencies",
        key: selectedKey,
        outputRoots: [outputRoot],
      }],
      expectedRoot: cacheRoot,
    });
    const generation = status.artifacts[0].generations[0];
    assert.equal(generation.key, installedKey);
    assert.equal(generation.state, "retained");
    assert.ok(generation.reasons[0].startsWith("installed-link:"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native cache cleanup rejects broad, symlinked, and unexpected roots", {
  skip: process.platform === "win32",
}, () => {
  const { cacheRoot, directory, workspace } = nativeMaintenanceFixture();
  const outside = join(directory, "outside");
  const linkedRoot = join(directory, "linked-native-artifacts");
  try {
    mkdirSync(outside);
    writeFileSync(join(outside, "sentinel"), "preserve\n");
    symlinkSync(outside, linkedRoot, "dir");
    assert.throws(
      () => assertExactNativeCacheRoot(workspace, resolve("/"), resolve("/")),
      /refused broad root/,
    );
    assert.throws(
      () => assertExactNativeCacheRoot(
        workspace,
        resolve(workspace),
        resolve(workspace),
      ),
      /refused broad root/,
    );
    assert.throws(
      () => nativeCacheStatus(workspace, cacheRoot, {
        currentSpecs: [],
        expectedRoot: join(directory, "different-cache-root"),
      }),
      /refused unexpected root/,
    );
    assert.throws(
      () => nativeCacheStatus(workspace, linkedRoot, {
        currentSpecs: [],
        expectedRoot: linkedRoot,
      }),
      /symlinked component/,
    );
    mkdirSync(join(cacheRoot, "unexpected-generation-family"));
    const status = nativeCacheStatus(workspace, cacheRoot, {
      currentSpecs: [],
      expectedRoot: cacheRoot,
    });
    assert.equal(status.safe, false);
    assert.match(status.issues[0], /unexpected cache-root entry/);
    assert.throws(
      () => cleanupNativeCache(workspace, cacheRoot, {
        apply: true,
        currentSpecs: [],
        expectedRoot: cacheRoot,
        maxBytes: 1024,
        maxGenerations: 1,
      }),
      /refused unsafe layout/,
    );
    rmSync(join(cacheRoot, "unexpected-generation-family"), {
      recursive: true,
      force: true,
    });
    symlinkSync(outside, join(cacheRoot, "flint-addon"), "dir");
    assert.equal(
      nativeCacheStatus(workspace, cacheRoot, {
        currentSpecs: [],
        expectedRoot: cacheRoot,
      }).safe,
      false,
    );
    rmSync(join(cacheRoot, "flint-addon"));
    mkdirSync(join(cacheRoot, "flint-addon"));
    symlinkSync(outside, join(cacheRoot, "flint-addon", "b".repeat(64)), "dir");
    assert.equal(
      nativeCacheStatus(workspace, cacheRoot, {
        currentSpecs: [],
        expectedRoot: cacheRoot,
      }).safe,
      false,
    );
    assert.equal(readFileSync(join(outside, "sentinel"), "utf8"), "preserve\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native cache maintenance CLI emits JSON and never applies by default", () => {
  const { cacheRoot, directory } = nativeMaintenanceFixture();
  const key = "a".repeat(64);
  const script = resolve(__dirname, "../scripts/parallel-development.cjs");
  try {
    const entry = writeMaintenanceGeneration(cacheRoot, "graph-addon", key);
    const dryRun = JSON.parse(execFileSync(process.execPath, [
      script,
      "cache",
      "cleanup",
      "--cache-root",
      cacheRoot,
      "--max-generations",
      "1",
      "--max-bytes",
      "1MiB",
      "--json",
    ], { encoding: "utf8" }));
    assert.equal(dryRun.applied, false);
    assert.equal(dryRun.selected.generations[0].key, key);
    assert.equal(existsSync(entry), true);
    const applied = JSON.parse(execFileSync(process.execPath, [
      script,
      "cache",
      "cleanup",
      "--cache-root",
      cacheRoot,
      "--max-generations",
      "1",
      "--max-bytes",
      "1MiB",
      "--apply",
      "--json",
    ], { encoding: "utf8" }));
    assert.equal(applied.removed.generations[0].key, key);
    assert.equal(existsSync(entry), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native artifact cache builds cold and restores immutable warm snapshots", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const counter = { count: 0 };
  try {
    const spec = nativeCacheSpec(workspace);
    const cold = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture(counter),
    });
    assert.equal(cold.status, "built");
    assert.equal(counter.count, 1);
    assert.equal(validCacheEntry(cold.entry, spec), true);
    assert.equal(
      prepareNativeArtifact(workspace, cacheRoot, spec, {
        build: buildNativeCacheFixture(counter, "must not be built\n"),
      }).status,
      "present",
    );
    assert.equal(counter.count, 1);

    rmSync(join(workspace, "build"), { recursive: true, force: true });
    const warm = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture(counter, "must not be built\n"),
    });
    assert.equal(warm.status, "restored");
    assert.equal(counter.count, 1);
    assert.equal(
      readFileSync(join(workspace, "build", "native", "addon.node"), "utf8"),
      "native artifact\n",
    );

    writeFileSync(join(workspace, "build", "native", "addon.node"), "local mutation\n");
    rmSync(join(workspace, "build"), { recursive: true, force: true });
    prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture(counter, "must not be built\n"),
    });
    assert.equal(
      readFileSync(join(workspace, "build", "native", "addon.node"), "utf8"),
      "native artifact\n",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native addon preparation builds the compiler once in a fresh workspace", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-compiler-test-"));
  let builds = 0;
  try {
    mkdirSync(join(directory, "tools"), { recursive: true });
    writeFileSync(join(directory, "tools", "compiler.ts"), "compiler v1\n");
    const options = {
      buildCompiler(workspace, required) {
        builds += 1;
        for (const output of required) {
          mkdirSync(dirname(output), { recursive: true });
          writeFileSync(output, "compiler\n");
        }
        assert.equal(workspace, directory);
      },
    };
    assert.equal(ensureNativeCompiler(directory, options).status, "built");
    assert.equal(ensureNativeCompiler(directory, options).status, "present");
    assert.equal(builds, 1);
    const stampPath = join(directory, "dist", ".sagejs-native-compiler.json");
    const obsoleteStamp = JSON.parse(readFileSync(stampPath, "utf8"));
    obsoleteStamp.schema = "sagejs.native-compiler-inputs-v1";
    writeFileSync(stampPath, `${JSON.stringify(obsoleteStamp)}\n`);
    assert.equal(ensureNativeCompiler(directory, options).status, "built");
    assert.equal(ensureNativeCompiler(directory, options).status, "present");
    assert.equal(builds, 2);
    writeFileSync(join(directory, "tools", "compiler.ts"), "compiler v2\n");
    assert.equal(ensureNativeCompiler(directory, options).status, "built");
    assert.equal(ensureNativeCompiler(directory, options).status, "present");
    assert.equal(builds, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function nativeCompilerBuildRunner(directory, observations) {
  return (_command, arguments_, workspace) => {
    assert.equal(workspace, directory);
    const program = arguments_[0];
    if (program.endsWith(join("typescript", "bin", "tsc"))) {
      mkdirSync(join(directory, "dist", "tools", "python"), {
        recursive: true,
      });
      writeFileSync(join(directory, "dist", "tools", "compiler.js"), "tool\n");
      writeFileSync(
        join(directory, "dist", "tools", "python", "compiler-frontend.js"),
        "frontend\n",
      );
      return;
    }
    if (program === join(directory, "scripts", "build-vendor.cjs")) {
      mkdirSync(join(directory, "dist", "vendor"), { recursive: true });
      for (const name of [
        "web-tree-sitter.wasm",
        "tree-sitter-python.wasm",
        "tree-sitter-sage.wasm",
      ]) {
        writeFileSync(join(directory, "dist", "vendor", name), "wasm\n");
      }
      return;
    }
    if (program === join(directory, "bin", "sagejs-source.cjs")) {
      assert.deepEqual(arguments_.slice(1), ["self", "--complete"]);
      const compilerPath = join(directory, "dist", "compiler", "compiler.js");
      observations.beforeSelf.push(readFileSync(compilerPath, "utf8"));
      writeFileSync(compilerPath, "converged compiler\n");
      return;
    }
    assert.fail(`unexpected native compiler command: ${arguments_.join(" ")}`);
  };
}

test("native compiler preparation self-hosts without downgrading an existing compiler", () => {
  for (const existingCompiler of [null, "existing converged compiler\n"]) {
    const directory = mkdtempSync(join(tmpdir(), "sagejs-native-self-host-test-"));
    const observations = { beforeSelf: [] };
    try {
      mkdirSync(join(directory, "bootstrap"), { recursive: true });
      writeFileSync(
        join(directory, "bootstrap", "compiler.js"),
        "immutable stage zero\n",
      );
      if (existingCompiler !== null) {
        mkdirSync(join(directory, "dist", "compiler"), { recursive: true });
        writeFileSync(
          join(directory, "dist", "compiler", "compiler.js"),
          existingCompiler,
        );
      }
      const options = {
        runner: nativeCompilerBuildRunner(directory, observations),
        validateCompiler(workspace) {
          assert.equal(workspace, directory);
          assert.equal(
            readFileSync(
              join(directory, "dist", "compiler", "compiler.js"),
              "utf8",
            ),
            "converged compiler\n",
          );
        },
      };
      assert.equal(ensureNativeCompiler(directory, options).status, "built");
      assert.deepEqual(observations.beforeSelf, [
        existingCompiler ?? "immutable stage zero\n",
      ]);
      assert.equal(ensureNativeCompiler(directory, options).status, "present");
      assert.equal(observations.beforeSelf.length, 1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("native compiler self-host bypasses an installed platform launcher", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-source-test-"));
  const observations = { beforeSelf: [] };
  const nativeSentinel = join(directory, "native-launch-was-used");
  try {
    mkdirSync(join(directory, "bootstrap"), { recursive: true });
    writeFileSync(join(directory, "bootstrap", "compiler.js"), "stage zero\n");
    const packageName = `sagejs-${process.platform}-${process.arch}`;
    const packageDirectory = join(
      directory,
      "node_modules",
      "@sagemath",
      packageName,
    );
    mkdirSync(join(packageDirectory, "bin"), { recursive: true });
    writeFileSync(
      join(packageDirectory, "package.json"),
      `${JSON.stringify({ name: `@sagemath/${packageName}` })}\n`,
    );
    const nativeExecutable = join(
      packageDirectory,
      "bin",
      process.platform === "win32" ? "sagejs.exe" : "sagejs",
    );
    writeFileSync(
      nativeExecutable,
      `fake native executable would create ${nativeSentinel}\n`,
    );
    assert.equal(
      require.resolve(`@sagemath/${packageName}/package.json`, {
        paths: [directory],
      }),
      join(packageDirectory, "package.json"),
    );

    assert.equal(ensureNativeCompiler(directory, {
      runner: nativeCompilerBuildRunner(directory, observations),
      validateCompiler() {},
    }).status, "built");
    assert.deepEqual(observations.beforeSelf, ["stage zero\n"]);
    assert.equal(existsSync(nativeExecutable), true);
    assert.equal(existsSync(nativeSentinel), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed native compiler convergence restores the previous compiler", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-rollback-test-"));
  const observations = { beforeSelf: [] };
  try {
    mkdirSync(join(directory, "bootstrap"), { recursive: true });
    writeFileSync(join(directory, "bootstrap", "compiler.js"), "stage zero\n");
    mkdirSync(join(directory, "dist", "compiler"), { recursive: true });
    const compilerPath = join(directory, "dist", "compiler", "compiler.js");
    writeFileSync(compilerPath, "known good compiler\n");
    assert.throws(
      () => ensureNativeCompiler(directory, {
        runner: nativeCompilerBuildRunner(directory, observations),
        validateCompiler() {
          throw new Error("invalid compiler export");
        },
      }),
      /invalid compiler export/,
    );
    assert.equal(readFileSync(compilerPath, "utf8"), "known good compiler\n");
    assert.equal(
      existsSync(join(directory, "dist", ".sagejs-native-compiler.json")),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shared native dependencies link one read-only content-addressed payload", {
  skip: process.platform === "win32",
}, () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const secondWorkspace = join(directory, "second-workspace");
  const counter = { count: 0 };
  try {
    const spec = {
      ...nativeCacheSpec(workspace),
      cleanupRoots: ["scratch/downloads"],
      id: "fixture-dependencies",
      materialization: "shared-readonly",
    };
    spec.key = nativeCacheHash(JSON.stringify({
      inputs: spec.inputs,
      materialization: spec.materialization,
    }));
    const cold = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build(current) {
        buildNativeCacheFixture(counter)(current);
        mkdirSync(join(current, "scratch", "downloads"), { recursive: true });
        writeFileSync(join(current, "scratch", "downloads", "archive"), "tarball\n");
      },
    });
    const firstOutput = join(workspace, "build", "native");
    const payload = join(cold.entry, "payload", "build", "native");
    assert.equal(cold.status, "built");
    assert.equal(counter.count, 1);
    assert.equal(existsSync(join(workspace, "scratch", "downloads")), false);
    assert.equal(lstatSync(firstOutput).isSymbolicLink(), true);
    assert.equal(resolve(dirname(firstOutput), readlinkSync(firstOutput)), payload);
    assert.equal(lstatSync(payload).mode & 0o222, 0);
    assert.equal(lstatSync(join(payload, "addon.node")).mode & 0o222, 0);
    assert.throws(
      () => writeFileSync(join(firstOutput, "addon.node"), "mutation\n"),
      /EACCES|EPERM/,
    );

    mkdirSync(join(secondWorkspace, "source"), { recursive: true });
    writeFileSync(join(secondWorkspace, "source", "input.c"), "first\n");
    const secondSpec = {
      ...spec,
      inputPaths: ["source"],
      inputs: snapshot(secondWorkspace, ["source"]),
    };
    rmSync(workspace, { recursive: true, force: true });
    assert.equal(existsSync(payload), true);
    const warm = prepareNativeArtifact(secondWorkspace, cacheRoot, secondSpec, {
      build: buildNativeCacheFixture(counter, "must not build\n"),
    });
    const secondOutput = join(secondWorkspace, "build", "native");
    assert.equal(warm.status, "restored");
    assert.equal(counter.count, 1);
    assert.equal(lstatSync(secondOutput).isSymbolicLink(), true);
    assert.equal(
      resolve(dirname(secondOutput), readlinkSync(secondOutput)),
      payload,
    );
  } finally {
    makeFixtureWritable(cacheRoot);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("FFLAS installation metadata remains valid after relocating its builder prefix", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-fflas-prefix-test-"));
  const builder = join(directory, "builder");
  const prefix = join(builder, "packages", "fflas", ".native", "prefix");
  const relocated = join(directory, "cache", "payload", "prefix");
  try {
    mkdirSync(join(prefix, "bin"), { recursive: true });
    mkdirSync(join(prefix, "lib", "pkgconfig"), { recursive: true });
    for (const name of ["fflas-ffpack-config", "givaro-config"]) {
      const filename = join(prefix, "bin", name);
      writeFileSync(filename, [
        "#!/bin/sh",
        `prefix=${prefix}`,
        "includedir=${prefix}/include",
        "echo $prefix",
        "",
      ].join("\n"));
      chmodSync(filename, 0o755);
    }
    writeFileSync(join(prefix, "lib", "pkgconfig", "givaro.pc"), [
      `prefix=${prefix}`,
      `exec_prefix=${prefix}`,
      `libdir=${prefix}/lib`,
      `includedir=${prefix}/include`,
      `Libs: -L${prefix}/lib -lgivaro`,
      `Cflags: -I${prefix}/include`,
      "",
    ].join("\n"));
    writeFileSync(join(prefix, "lib", "libgivaro.la"), [
      `dependency_libs='-L${prefix}/lib'`,
      `libdir='${prefix}/lib'`,
      "",
    ].join("\n"));

    makeFflasPrefixRelocatable(prefix);
    mkdirSync(dirname(relocated), { recursive: true });
    renameSync(prefix, relocated);
    rmSync(builder, { recursive: true, force: true });

    assert.equal(
      execFileSync(join(relocated, "bin", "givaro-config"), {
        encoding: "utf8",
      }).trim(),
      realpathSync(relocated),
    );
    const pkgconfig = readFileSync(
      join(relocated, "lib", "pkgconfig", "givaro.pc"),
      "utf8",
    );
    assert.match(pkgconfig, /^prefix=\$\{pcfiledir\}\/\.\.\/\.\.$/m);
    assert.equal(pkgconfig.includes(prefix), false);
    assert.equal(existsSync(join(relocated, "lib", "libgivaro.la")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("multi-root restore rolls every root back after a later commit failure", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const inputs = snapshot(workspace, ["source"]);
  const spec = {
    id: "transaction-addon",
    key: nativeCacheHash(JSON.stringify(inputs)),
    inputPaths: ["source"],
    inputs,
    outputRoots: ["build/one", "build/two"],
    requiredOutputs: ["build/one/value", "build/two/value"],
    buildCommands: [],
  };
  try {
    prepareNativeArtifact(workspace, cacheRoot, spec, {
      build(current) {
        mkdirSync(join(current, "build", "one"), { recursive: true });
        mkdirSync(join(current, "build", "two"), { recursive: true });
        writeFileSync(join(current, "build", "one", "value"), "cached one\n");
        writeFileSync(join(current, "build", "two", "value"), "cached two\n");
      },
    });
    writeFileSync(join(workspace, "build", "one", "value"), "local one\n");
    writeFileSync(join(workspace, "build", "two", "value"), "local two\n");
    assert.throws(
      () => restoreNativeArtifact(workspace, cacheRoot, spec, {
        beforeCommitRoot(index) {
          if (index === 1) throw new Error("injected second-root failure");
        },
      }),
      /injected second-root failure/,
    );
    assert.equal(
      readFileSync(join(workspace, "build", "one", "value"), "utf8"),
      "local one\n",
    );
    assert.equal(
      readFileSync(join(workspace, "build", "two", "value"), "utf8"),
      "local two\n",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("source and toolchain identities invalidate native artifacts", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const counter = { count: 0 };
  try {
    const first = nativeCacheSpec(workspace, "toolchain-a");
    prepareNativeArtifact(workspace, cacheRoot, first, {
      build: buildNativeCacheFixture(counter, "first build\n"),
    });

    writeFileSync(join(workspace, "source", "input.c"), "second\n");
    rmSync(join(workspace, "build"), { recursive: true, force: true });
    const sourceChanged = nativeCacheSpec(workspace, "toolchain-a");
    assert.notEqual(sourceChanged.key, first.key);
    prepareNativeArtifact(workspace, cacheRoot, sourceChanged, {
      build: buildNativeCacheFixture(counter, "source rebuild\n"),
    });

    rmSync(join(workspace, "build"), { recursive: true, force: true });
    const toolchainChanged = nativeCacheSpec(workspace, "toolchain-b");
    assert.notEqual(toolchainChanged.key, sourceChanged.key);
    prepareNativeArtifact(workspace, cacheRoot, toolchainChanged, {
      build: buildNativeCacheFixture(counter, "toolchain rebuild\n"),
    });
    assert.equal(counter.count, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("source mutation during a build can never publish under a stale key", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  try {
    const spec = nativeCacheSpec(workspace);
    assert.throws(
      () => prepareNativeArtifact(workspace, cacheRoot, spec, {
        build(current) {
          mkdirSync(join(current, "build", "native"), { recursive: true });
          writeFileSync(join(current, "build", "native", "addon.node"), "stale\n");
          writeFileSync(join(current, "source", "input.c"), "mutated\n");
        },
      }),
      /inputs changed while preparing fixture-addon/,
    );
    assert.equal(validCacheEntry(join(cacheRoot, spec.id, spec.key), spec), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generic artifact ids, keys, roots, and input paths fail closed", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  try {
    const valid = nativeCacheSpec(workspace);
    for (const invalid of [
      { ...valid, id: "../escape" },
      { ...valid, key: "not-a-content-key" },
      { ...valid, inputPaths: ["../outside"] },
      { ...valid, outputRoots: ["build", "build/native"] },
      { ...valid, cleanupRoots: "scratch" },
      { ...valid, cleanupRoots: ["build"] },
    ]) {
      assert.throws(
        () => prepareNativeArtifact(workspace, cacheRoot, invalid, {
          build: buildNativeCacheFixture({ count: 0 }),
        }),
        /native-cache/,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("destructive provisioning rejects symlinked ancestors and preserves sentinels", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const outside = join(directory, "outside");
  try {
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "sentinel.txt"), "preserve me\n");
    const spec = nativeCacheSpec(workspace);
    prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture({ count: 0 }),
    });
    rmSync(join(workspace, "build"), { recursive: true, force: true });
    symlinkSync(
      outside,
      join(workspace, "build"),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(
      () => restoreNativeArtifact(workspace, cacheRoot, spec),
      /symlinked ancestor/,
    );
    assert.throws(
      () => prepareNativeArtifact(workspace, cacheRoot, spec, {
        build: buildNativeCacheFixture({ count: 0 }),
      }),
      /symlinked ancestor/,
    );
    assert.equal(readFileSync(join(outside, "sentinel.txt"), "utf8"), "preserve me\n");

    rmSync(join(workspace, "build"), { force: true });
    rmSync(join(workspace, "source"), { recursive: true, force: true });
    symlinkSync(
      outside,
      join(workspace, "source"),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(() => snapshot(workspace, ["source/input.c"]), /symlinked ancestor/);
    assert.equal(readFileSync(join(outside, "sentinel.txt"), "utf8"), "preserve me\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("declared input leaves reject symlinks before building or publishing", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const counter = { count: 0 };
  try {
    const spec = nativeCacheSpec(workspace);
    const input = join(workspace, "source", "input.c");
    const referent = process.platform === "win32"
      ? join(directory, "referent-directory")
      : join(directory, "referent.c");
    rmSync(input);
    if (process.platform === "win32") {
      mkdirSync(referent);
      writeFileSync(join(referent, "contents"), "first\n");
      symlinkSync(referent, input, "junction");
    } else {
      writeFileSync(referent, "first\n");
      symlinkSync(referent, input, "file");
    }
    for (const contents of ["first\n", "mutated\n"]) {
      if (process.platform === "win32") {
        writeFileSync(join(referent, "contents"), contents);
      } else {
        writeFileSync(referent, contents);
      }
      assert.throws(
        () => prepareNativeArtifact(workspace, cacheRoot, spec, {
          build: buildNativeCacheFixture(counter),
        }),
        /input cannot be a symlink/,
      );
    }
    assert.equal(counter.count, 0);
    assert.equal(existsSync(join(cacheRoot, spec.id, spec.key)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native production keys separate dependency and addon invalidation", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-key-test-"));
  try {
    const script = join(directory, "packages", "flint", "scripts", "build-deps.cjs");
    const source = join(directory, "packages", "flint", "src", "addon.c");
    mkdirSync(join(directory, "packages", "flint", "scripts"), { recursive: true });
    mkdirSync(join(directory, "packages", "flint", "src"), { recursive: true });
    mkdirSync(join(directory, "tools"), { recursive: true });
    writeFileSync(script, "dependency build v1\n");
    writeFileSync(source, "addon v1\n");
    writeFileSync(join(directory, "tools", "compiler.ts"), "compiler v1\n");
    const firstIdentity = {
      native: { toolchain: "one" },
      node: { abi: "one" },
    };
    const first = nativeArtifactSpecs(directory, { identity: firstIdentity });
    const firstDependencies = first.find(({ id }) => id === "flint-dependencies");
    const firstAddon = first.find(({ id }) => id === "flint-addon");

    writeFileSync(source, "addon v2\n");
    const addonChanged = nativeArtifactSpecs(directory, { identity: firstIdentity });
    assert.equal(
      addonChanged.find(({ id }) => id === "flint-dependencies").key,
      firstDependencies.key,
    );
    assert.notEqual(
      addonChanged.find(({ id }) => id === "flint-addon").key,
      firstAddon.key,
    );

    writeFileSync(script, "dependency build v2\n");
    const dependencyChanged = nativeArtifactSpecs(directory, { identity: firstIdentity });
    assert.notEqual(
      dependencyChanged.find(({ id }) => id === "flint-dependencies").key,
      firstDependencies.key,
    );
    assert.notEqual(
      dependencyChanged.find(({ id }) => id === "flint-addon").key,
      firstAddon.key,
    );

    writeFileSync(join(directory, "tools", "compiler.ts"), "compiler v2\n");
    const compilerChanged = nativeArtifactSpecs(directory, { identity: firstIdentity });
    assert.equal(
      compilerChanged.find(({ id }) => id === "flint-dependencies").key,
      dependencyChanged.find(({ id }) => id === "flint-dependencies").key,
    );
    assert.notEqual(
      compilerChanged.find(({ id }) => id === "flint-addon").key,
      dependencyChanged.find(({ id }) => id === "flint-addon").key,
    );

    const abiChanged = nativeArtifactSpecs(directory, { identity: {
      native: { toolchain: "one" },
      node: { abi: "two" },
    } });
    assert.equal(
      abiChanged.find(({ id }) => id === "flint-dependencies").key,
      dependencyChanged.find(({ id }) => id === "flint-dependencies").key,
    );
    assert.notEqual(
      abiChanged.find(({ id }) => id === "flint-addon").key,
      dependencyChanged.find(({ id }) => id === "flint-addon").key,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Windows native specs keep vcpkg state atomic and FFLAS independent", () => {
  const specs = nativeArtifactSpecs(resolve(__dirname, ".."), {
    identity: {
      native: { toolchain: "mock-windows" },
      node: { abi: "mock-windows" },
    },
    platform: "win32",
  });
  const flint = specs.find(({ id }) => id === "flint-dependencies");
  const fflas = specs.find(({ id }) => id === "fflas-dependencies");

  assert.deepEqual(flint.outputRoots, [
    "packages/flint/.native/vcpkg-installed",
  ]);
  assert.deepEqual(flint.requiredOutputs, [
    "packages/flint/.native/vcpkg-installed/" +
      "x64-windows-static-md-release/lib/flint.lib",
    "packages/flint/.native/vcpkg-installed/" +
      "x64-windows-static-md-release/lib/openblas.lib",
    "packages/flint/.native/vcpkg-installed/" +
      "x64-windows-static-md-release/.sagejs-flint-dependencies.json",
  ]);
  assert.ok(
    flint.requiredOutputs.every((path) =>
      path.startsWith(`${flint.outputRoots[0]}/`),
    ),
  );
  assert.equal(
    fflas.inputPaths.includes("packages/flint/scripts/build-deps.cjs"),
    false,
  );
  assert.equal(fflas.materialization, "copy");
  assert.equal(fflasUsesFlintPrefix("win32"), false);
  assert.equal(fflasUsesFlintPrefix("darwin"), false);
  assert.equal(fflasUsesFlintPrefix("linux"), true);
});

test("M4RI cache keys separate dependency and generated-addon inputs", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-m4ri-key-test-"));
  const identity = {
    native: { toolchain: "one" },
    node: { abi: "one" },
  };
  const keys = () => {
    const specs = nativeArtifactSpecs(directory, { identity });
    return Object.fromEntries(
      specs
        .filter(({ packageId }) => packageId === "m4ri")
        .map(({ id, key }) => [id, key]),
    );
  };
  try {
    for (const path of [
      "packages/m4ri/scripts",
      "packages/m4ri/include/sagejs",
      "packages/m4ri/generated",
      "ffi",
    ]) {
      mkdirSync(join(directory, path), { recursive: true });
    }
    writeFileSync(join(directory, "packages/m4ri/package.json"), "package v1\n");
    writeFileSync(
      join(directory, "packages/m4ri/scripts/build-deps.cjs"),
      "dependency v1\n",
    );
    writeFileSync(
      join(directory, "packages/m4ri/scripts/native-prefix.cjs"),
      "prefix v1\n",
    );
    writeFileSync(
      join(directory, "packages/m4ri/include/sagejs/m4ri_matrix_ffi.h"),
      "header v1\n",
    );
    writeFileSync(
      join(directory, "packages/m4ri/generated/ffi_host.py"),
      "generated v1\n",
    );
    writeFileSync(join(directory, "ffi/m4ri.ffi.py"), "declaration v1\n");
    writeFileSync(join(directory, "ffi/m4ri.ffi.json"), "descriptor v1\n");

    const first = keys();
    writeFileSync(
      join(directory, "packages/m4ri/generated/ffi_host.py"),
      "generated v2\n",
    );
    const addonChanged = keys();
    assert.equal(
      addonChanged["m4ri-dependencies"],
      first["m4ri-dependencies"],
    );
    assert.notEqual(addonChanged["m4ri-addon"], first["m4ri-addon"]);

    writeFileSync(
      join(directory, "packages/m4ri/scripts/build-deps.cjs"),
      "dependency v2\n",
    );
    const dependencyChanged = keys();
    assert.notEqual(
      dependencyChanged["m4ri-dependencies"],
      addonChanged["m4ri-dependencies"],
    );
    assert.notEqual(
      dependencyChanged["m4ri-addon"],
      addonChanged["m4ri-addon"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("FFLAS native keys include selected platform SDK inputs", () => {
  const identity = {
    native: { toolchain: "one" },
    node: { abi: "one" },
  };
  const key = (platformInputs) => nativeArtifactSpecs(resolve(__dirname, ".."), {
    identity,
    platformInputs: { fflas: platformInputs },
  }).find(({ id }) => id === "fflas-dependencies").key;
  const first = key({
    accelerateStub: { sha256: "a" },
    cblasHeader: { sha256: "b" },
  });
  assert.notEqual(first, key({
    accelerateStub: { sha256: "changed" },
    cblasHeader: { sha256: "b" },
  }));
  assert.notEqual(first, key({
    accelerateStub: { sha256: "a" },
    cblasHeader: { sha256: "changed" },
  }));
});

test("native addon keys include shared ABI types and package FFI descriptors", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-ffi-key-test-"));
  const identity = {
    native: { toolchain: "one" },
    node: { abi: "one" },
  };
  const descriptorPackages = [
    ["flint", "flint.ffi.json"],
    ["fflas", "fflas.ffi.json"],
    ["graph", "igraph.ffi.json"],
    ["m4ri", "m4ri.ffi.json"],
  ];
  const keysById = () => new Map(
    nativeArtifactSpecs(directory, { identity }).map(({ id, key }) => [id, key]),
  );
  try {
    mkdirSync(join(directory, "ffi"), { recursive: true });
    writeFileSync(join(directory, "ffi", "abi-types.json"), "abi types v1\n");
    for (const [, descriptor] of descriptorPackages) {
      writeFileSync(join(directory, "ffi", descriptor), `${descriptor} v1\n`);
    }

    let baseline = keysById();
    writeFileSync(join(directory, "ffi", "abi-types.json"), "abi types v2\n");
    let changed = keysById();
    for (const [packageId] of descriptorPackages) {
      assert.equal(
        changed.get(`${packageId}-dependencies`),
        baseline.get(`${packageId}-dependencies`),
      );
      assert.notEqual(
        changed.get(`${packageId}-addon`),
        baseline.get(`${packageId}-addon`),
      );
    }

    for (const [packageId, descriptor] of descriptorPackages) {
      baseline = changed;
      writeFileSync(join(directory, "ffi", descriptor), `${descriptor} v2\n`);
      changed = keysById();
      for (const [candidateId] of descriptorPackages) {
        assert.equal(
          changed.get(`${candidateId}-dependencies`),
          baseline.get(`${candidateId}-dependencies`),
        );
        if (candidateId === packageId) {
          assert.notEqual(
            changed.get(`${candidateId}-addon`),
            baseline.get(`${candidateId}-addon`),
          );
        } else {
          assert.equal(
            changed.get(`${candidateId}-addon`),
            baseline.get(`${candidateId}-addon`),
          );
        }
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native keys ignore invocation-only pnpm lifecycle variables", () => {
  const workspace = resolve(__dirname, "..");
  const savedExecPath = process.env.npm_execpath;
  const savedUserAgent = process.env.npm_config_user_agent;
  try {
    delete process.env.npm_execpath;
    delete process.env.npm_config_user_agent;
    const direct = nativeArtifactSpecs(workspace).map(({ id, key }) => ({ id, key }));
    process.env.npm_execpath = "/different/worktree/node_modules/pnpm.cjs";
    process.env.npm_config_user_agent = "pnpm/invocation-only-test";
    const lifecycle = nativeArtifactSpecs(workspace).map(({ id, key }) => ({ id, key }));
    assert.deepEqual(lifecycle, direct);
  } finally {
    if (savedExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = savedExecPath;
    if (savedUserAgent === undefined) delete process.env.npm_config_user_agent;
    else process.env.npm_config_user_agent = savedUserAgent;
  }
});

test("dependency keys include explicit archivers and external vcpkg executables", () => {
  const workspace = resolve(__dirname, "..");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-tools-test-"));
  const vcpkg = join(directory, process.platform === "win32" ? "vcpkg.exe" : "vcpkg");
  const previousAr = process.env.AR;
  const previousVcpkg = process.env.VCPKG_ROOT;
  try {
    delete process.env.AR;
    delete process.env.VCPKG_ROOT;
    const baseline = nativeArtifactSpecs(workspace)
      .find(({ id }) => id === "flint-dependencies").key;
    process.env.AR = join(directory, "different-ar");
    const archiverChanged = nativeArtifactSpecs(workspace)
      .find(({ id }) => id === "flint-dependencies").key;
    assert.notEqual(archiverChanged, baseline);

    delete process.env.AR;
    writeFileSync(vcpkg, "#!/bin/sh\necho vcpkg test\n");
    chmodSync(vcpkg, 0o755);
    process.env.VCPKG_ROOT = directory;
    const vcpkgFirst = nativeArtifactSpecs(workspace)
      .find(({ id }) => id === "flint-dependencies").key;
    writeFileSync(vcpkg, "#!/bin/sh\necho changed vcpkg test\n");
    const vcpkgChanged = nativeArtifactSpecs(workspace)
      .find(({ id }) => id === "flint-dependencies").key;
    assert.notEqual(vcpkgChanged, vcpkgFirst);
  } finally {
    if (previousAr === undefined) delete process.env.AR;
    else process.env.AR = previousAr;
    if (previousVcpkg === undefined) delete process.env.VCPKG_ROOT;
    else process.env.VCPKG_ROOT = previousVcpkg;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a custom prefix skips only its package during cache restore", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-prefix-test-"));
  const previous = process.env.SAGEJS_FLINT_PREFIX;
  try {
    process.env.SAGEJS_FLINT_PREFIX = join(directory, "external-flint");
    const results = restoreNativePackages(
      resolve(__dirname, ".."),
      ["flint", "fflas", "graph"],
      { cacheRoot: join(directory, "cache") },
    );
    assert.deepEqual(
      results.map(({ id, status }) => ({ id, status })),
      [
        { id: "flint", status: "skipped-custom-prefix" },
        { id: "fflas", status: "skipped-custom-prefix" },
        { id: "graph-dependencies", status: "miss" },
        { id: "graph-addon", status: "miss" },
      ],
    );
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_FLINT_PREFIX;
    else process.env.SAGEJS_FLINT_PREFIX = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native package cache orders FLINT before its FFLAS dependent", () => {
  assert.deepEqual(
    [...nativeCachePackages],
    ["flint", "fflas", "graph", "m4ri"],
  );
  const specs = nativeArtifactSpecs(resolve(__dirname, ".."), {
      identity: {
        native: { toolchain: "test" },
        node: { abi: "test" },
      },
    });
  assert.deepEqual(
    specs.map(({ id }) => id),
    [
      "flint-dependencies",
      "flint-addon",
      "fflas-dependencies",
      "fflas-addon",
      "graph-dependencies",
      "graph-addon",
      "m4ri-dependencies",
      "m4ri-addon",
    ],
  );
  assert.deepEqual(
    specs.find(({ id }) => id === "m4ri-dependencies").buildCommands,
    [["node", ["packages/m4ri/scripts/build-deps.cjs", "--cache-build"]]],
  );
});

test("corrupt native cache entries fail closed and rebuild", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const counter = { count: 0 };
  try {
    const spec = nativeCacheSpec(workspace);
    const first = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture(counter, "valid artifact\n"),
    });
    writeFileSync(
      join(first.entry, "payload", "build", "native", "addon.node"),
      "corrupt artifact\n",
    );
    rmSync(join(workspace, "build"), { recursive: true, force: true });
    const rebuilt = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture(counter, "rebuilt artifact\n"),
    });
    assert.equal(rebuilt.status, "built");
    assert.equal(counter.count, 2);
    assert.equal(
      readFileSync(join(workspace, "build", "native", "addon.node"), "utf8"),
      "rebuilt artifact\n",
    );
    assert.equal(validCacheEntry(rebuilt.entry, spec), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native cache manifests cannot restore outside declared output roots", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  try {
    const spec = nativeCacheSpec(workspace);
    const result = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture({ count: 0 }),
    });
    const manifestPath = join(result.entry, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.files.push({
      path: ".agents/injected.txt",
      type: "file",
      mode: 0o644,
      size: 5,
      sha256: nativeCacheHash("bad\n"),
    });
    mkdirSync(join(result.entry, "payload", ".agents"), { recursive: true });
    writeFileSync(join(result.entry, "payload", ".agents", "injected.txt"), "bad\n");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.equal(validCacheEntry(result.entry, spec), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("malformed native cache locks are recovered without a long timeout", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const counter = { count: 0 };
  try {
    const spec = nativeCacheSpec(workspace);
    const lock = join(cacheRoot, spec.id, `${spec.key}.lock`);
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "owner.json"), JSON.stringify({
      pid: 2_147_483_647,
      started_at: new Date().toISOString(),
    }));
    const result = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture(counter),
      waitMilliseconds: 1000,
    });
    assert.equal(result.status, "built");
    assert.equal(counter.count, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ownerless native cache locks are recovered promptly", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const counter = { count: 0 };
  try {
    const spec = nativeCacheSpec(workspace);
    mkdirSync(join(cacheRoot, spec.id, `${spec.key}.lock`), { recursive: true });
    const started = Date.now();
    const result = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture(counter),
      waitMilliseconds: 1000,
    });
    assert.equal(result.status, "built");
    assert.equal(counter.count, 1);
    assert.ok(Date.now() - started < 1000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an old lock with a positively live local owner is never stolen", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const counter = { count: 0 };
  try {
    const spec = nativeCacheSpec(workspace);
    const lock = join(cacheRoot, spec.id, `${spec.key}.lock`);
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "owner.json"), JSON.stringify({
      hostname: hostname(),
      pid: process.pid,
      process_identity: nativeCacheProcessIdentity(process.pid),
      started_at: "2000-01-01T00:00:00.000Z",
      token: "still-live",
    }));
    writeFileSync(join(lock, "heartbeat"), "2000-01-01T00:00:00.000Z\n");
    assert.throws(
      () => prepareNativeArtifact(workspace, cacheRoot, spec, {
        build: buildNativeCacheFixture(counter),
        staleMilliseconds: 0,
        waitMilliseconds: 150,
      }),
      /timed out waiting for native cache lock/,
    );
    assert.equal(counter.count, 0);
    assert.equal(existsSync(lock), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a reused local PID cannot preserve a lock from another process lifetime", () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const counter = { count: 0 };
  try {
    const spec = nativeCacheSpec(workspace);
    const lock = join(cacheRoot, spec.id, `${spec.key}.lock`);
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "owner.json"), JSON.stringify({
      hostname: hostname(),
      pid: process.pid,
      process_identity: "previous-boot-or-process",
      started_at: new Date().toISOString(),
      token: "stale-lifetime",
    }));
    writeFileSync(join(lock, "heartbeat"), `${new Date().toISOString()}\n`);
    const result = prepareNativeArtifact(workspace, cacheRoot, spec, {
      build: buildNativeCacheFixture(counter),
      waitMilliseconds: 1000,
    });
    assert.equal(result.status, "built");
    assert.equal(counter.count, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native cache heartbeat advances during a synchronous build", {
  skip: nativeCacheProcessIdentity(process.pid) === null,
}, () => {
  const { directory, workspace, cacheRoot } = nativeCacheFixture();
  const pause = new Int32Array(new SharedArrayBuffer(4));
  try {
    const spec = nativeCacheSpec(workspace);
    const lock = join(cacheRoot, spec.id, `${spec.key}.lock`);
    const result = prepareNativeArtifact(workspace, cacheRoot, spec, {
      heartbeatMilliseconds: 20,
      build(current) {
        const before = readFileSync(join(lock, "heartbeat"), "utf8");
        Atomics.wait(pause, 0, 0, 250);
        const after = readFileSync(join(lock, "heartbeat"), "utf8");
        assert.notEqual(after, before);
        buildNativeCacheFixture({ count: 0 })(current);
      },
    });
    assert.equal(result.status, "built");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function cacheChildProcess(code, args = []) {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, ["-e", code, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("exit", (status) => {
      if (status === 0) resolveChild(stdout);
      else rejectChild(new Error(`cache child exited ${status}: ${stderr}`));
    });
  });
}

test("concurrent native cache misses build once and publish atomically", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-concurrent-"));
  const cacheRoot = join(directory, "cache");
  const marker = join(directory, "builds.txt");
  const workspaces = [join(directory, "left"), join(directory, "right")];
  try {
    for (const workspace of workspaces) mkdirSync(workspace, { recursive: true });
    for (const workspace of workspaces) writeFileSync(join(workspace, "source.c"), "same");
    const source = String.raw`
      const { appendFileSync, mkdirSync, writeFileSync } = require("node:fs");
      const { join } = require("node:path");
      const { prepareNativeArtifact, snapshot } = require(${JSON.stringify(parallelDevelopmentModule)});
      const workspace = process.argv[1];
      const cacheRoot = process.argv[2];
      const marker = process.argv[3];
      const spec = {
        id: "concurrent-addon",
        key: "${"a".repeat(64)}",
        inputPaths: ["source.c"],
        inputs: snapshot(workspace, ["source.c"]),
        outputRoots: ["build/native"],
        requiredOutputs: ["build/native/addon.node"],
        buildCommands: [],
      };
      const result = prepareNativeArtifact(workspace, cacheRoot, spec, {
        build(current) {
          appendFileSync(marker, process.pid + "\n");
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350);
          mkdirSync(join(current, "build", "native"), { recursive: true });
          writeFileSync(join(current, "build", "native", "addon.node"), "winner\n");
        },
      });
      process.stdout.write(result.status);
    `;
    const [left, right] = await Promise.all(workspaces.map((workspace) =>
      cacheChildProcess(`${source}\n`, [workspace, cacheRoot, marker])));
    assert.deepEqual(new Set([left, right]), new Set(["built", "restored"]));
    assert.equal(readFileSync(marker, "utf8").trim().split("\n").length, 1);
    for (const workspace of workspaces) {
      assert.equal(
        readFileSync(join(workspace, "build", "native", "addon.node"), "utf8"),
        "winner\n",
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
