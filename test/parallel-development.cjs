"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

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
  taskForBranch,
} = require("../scripts/parallel-development.cjs");
const {
  nativeArtifactSpecs,
  prepareNativeArtifact,
  snapshot,
  validCacheEntry,
} = require("../scripts/native-worktree-cache.cjs");

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

test("changed-file checks rebuild native code before testing it", () => {
  assert.deepEqual(
    validationCommandsForFiles(["packages/flint/src/p1.c"]),
    [
      ["pnpm", "architecture:check"],
      [
        "pnpm",
        "parallel:cache",
        "--",
        "prepare",
        "--package",
        "flint",
      ],
      ["pnpm", "test:native"],
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

test("native production keys separate dependency and addon invalidation", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-key-test-"));
  try {
    const script = join(directory, "packages", "flint", "scripts", "build-deps.cjs");
    const source = join(directory, "packages", "flint", "src", "addon.c");
    mkdirSync(join(directory, "packages", "flint", "scripts"), { recursive: true });
    mkdirSync(join(directory, "packages", "flint", "src"), { recursive: true });
    writeFileSync(script, "dependency build v1\n");
    writeFileSync(source, "addon v1\n");
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

test("abandoned native cache locks are recovered without a long timeout", () => {
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
    const source = String.raw`
      const { appendFileSync, mkdirSync, writeFileSync } = require("node:fs");
      const { join } = require("node:path");
      const { prepareNativeArtifact } = require(${JSON.stringify(parallelDevelopmentModule)});
      const workspace = process.argv[1];
      const cacheRoot = process.argv[2];
      const marker = process.argv[3];
      const spec = {
        id: "concurrent-addon",
        key: "${"a".repeat(64)}",
        inputs: [{ path: "source.c", type: "file", sha256: "same", size: 4, mode: 420 }],
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
