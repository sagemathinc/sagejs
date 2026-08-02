"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

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

function task(overrides = {}) {
  return {
    schema_version: 1,
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

test("changed-file checks rebuild native code before testing it", () => {
  assert.deepEqual(
    validationCommandsForFiles(["packages/flint/src/p1.c"]),
    [
      ["pnpm", "--dir", "packages/flint", "build"],
      ["pnpm", "test:native"],
    ],
  );
  assert.deepEqual(validationCommandsForFiles(["DOCUMENTATION.md"]), [
    ["pnpm", "docs:check"],
  ]);
  assert.deepEqual(validationCommandsForFiles([".agents/lanes.json"]), [
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
