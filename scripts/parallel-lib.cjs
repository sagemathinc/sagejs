"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  readFileSync,
  readdirSync,
} = require("node:fs");
const { basename, join, relative, resolve } = require("node:path");
const { execFileSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const laneFile = join(root, ".agents", "lanes.json");
const lanePolicy = JSON.parse(readFileSync(laneFile, "utf8"));
const lanes = new Map(lanePolicy.lanes.map((lane) => [lane.id, lane]));
const liveStatuses = new Set(["active", "review", "blocked"]);
const validStatuses = new Set(["proposed", ...liveStatuses, "complete"]);
const platformNames = [
  "linux-x64",
  "linux-arm64",
  "windows-x64",
  "macos-arm64",
];
const platformPolicies = new Set(["required", "fallback", "not-applicable"]);

function git(args, cwd = root, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizePath(path) {
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("path claims must be nonempty strings");
  }
  const directory = /[\\/]$/.test(path);
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`path claim must be repository-relative: ${path}`);
  }
  return normalized.replace(/\/+$/, "") + (directory ? "/" : "");
}

function claimCovers(claim, filename) {
  const left = normalizePath(claim);
  const right = normalizePath(filename);
  if (left.endsWith("/")) return right.startsWith(left);
  return left === right;
}

function claimsOverlap(leftClaim, rightClaim) {
  const left = normalizePath(leftClaim);
  const right = normalizePath(rightClaim);
  if (left === right) return true;
  if (left.endsWith("/") && right.startsWith(left)) return true;
  if (right.endsWith("/") && left.startsWith(right)) return true;
  return false;
}

function laneAllowsClaim(lane, claim) {
  const normalized = normalizePath(claim);
  const permitted = [
    ...lane.allowed_claims,
    ...lanePolicy.collateral_claims,
  ].map(normalizePath);
  return permitted.some((prefix) =>
    prefix.endsWith("/")
      ? normalized.startsWith(prefix)
      : normalized === prefix || normalized.startsWith(`${prefix}.`) ||
        normalized.startsWith(`${prefix}_`),
  );
}

function taskFiles(directory = join(root, ".agents", "tasks")) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(directory, name));
}

function readTasks(directory) {
  return taskFiles(directory).map((filename) => ({
    filename,
    task: JSON.parse(readFileSync(filename, "utf8")),
  }));
}

function validateTask(task, filename = "task.json") {
  const errors = [];
  const expectedId = basename(filename, ".json");
  if (task.schema_version !== 1) errors.push("schema_version must be 1");
  if (!/^[a-z][a-z0-9-]*$/.test(task.id || "")) {
    errors.push("id must use lowercase letters, digits, and hyphens");
  } else if (expectedId !== task.id) {
    errors.push(`id ${task.id} does not match filename ${expectedId}.json`);
  }
  if (typeof task.title !== "string" || task.title.trim().length < 4) {
    errors.push("title must be a descriptive string");
  }
  if (!validStatuses.has(task.status)) {
    errors.push(`status must be one of ${[...validStatuses].join(", ")}`);
  }
  const lane = lanes.get(task.lane);
  if (!lane) errors.push(`unknown lane: ${task.lane}`);
  if (typeof task.owner !== "string" || task.owner.trim() === "") {
    errors.push("owner is required");
  }
  if (typeof task.objective !== "string" || task.objective.trim().length < 12) {
    errors.push("objective must describe a concrete outcome");
  }
  if (!/^[0-9a-f]{40}$/.test(task.base_commit || "")) {
    errors.push("base_commit must be a full Git commit hash");
  }
  if (!Array.isArray(task.claims) || task.claims.length === 0) {
    errors.push("claims must contain at least one path");
  } else {
    const normalized = [];
    for (const claim of task.claims) {
      try {
        const value = normalizePath(claim);
        if (normalized.includes(value)) errors.push(`duplicate claim: ${value}`);
        normalized.push(value);
        if (lane && !laneAllowsClaim(lane, value)) {
          errors.push(`claim is outside the ${lane.id} lane: ${value}`);
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
  }
  for (const field of ["dependencies", "references", "validation", "runs"]) {
    if (!Array.isArray(task[field])) errors.push(`${field} must be an array`);
  }
  if (lane && Array.isArray(task.validation)) {
    for (const command of lane.required_checks) {
      if (!task.validation.includes(command)) {
        errors.push(`validation must include lane check: ${command}`);
      }
    }
  }
  if (!task.platforms || typeof task.platforms !== "object") {
    errors.push("platforms policy is required");
  } else {
    for (const platform of platformNames) {
      if (!platformPolicies.has(task.platforms[platform])) {
        errors.push(
          `${platform} policy must be required, fallback, or not-applicable`,
        );
      }
    }
  }
  const nativeClaim = Array.isArray(task.claims) && task.claims.some((claim) => {
    try {
      return normalizePath(claim).startsWith("packages/flint/");
    } catch {
      return false;
    }
  });
  if (nativeClaim && task.platforms?.["windows-x64"] === "not-applicable") {
    errors.push(
      "native FLINT work must require Windows or declare a tested fallback",
    );
  }
  if (
    !task.handoff ||
    typeof task.handoff !== "object" ||
    !Array.isArray(task.handoff.risks) ||
    !Array.isArray(task.handoff.next_steps)
  ) {
    errors.push("handoff must contain summary, risks, and next_steps");
  }
  return errors;
}

function findOverlaps(entries) {
  const live = entries.filter(({ task }) => liveStatuses.has(task.status));
  const overlaps = [];
  for (let left = 0; left < live.length; left += 1) {
    for (let right = left + 1; right < live.length; right += 1) {
      for (const leftClaim of live[left].task.claims || []) {
        for (const rightClaim of live[right].task.claims || []) {
          if (claimsOverlap(leftClaim, rightClaim)) {
            overlaps.push({
              left: live[left].task.id,
              right: live[right].task.id,
              leftClaim: normalizePath(leftClaim),
              rightClaim: normalizePath(rightClaim),
            });
          }
        }
      }
    }
  }
  return overlaps;
}

function changedFiles(base, cwd = root) {
  const files = new Set();
  const collect = (args) => {
    try {
      for (const filename of git(args, cwd).split("\n")) {
        if (filename) files.add(normalizePath(filename));
      }
    } catch {
      // A missing upstream ref should not hide local changes.
    }
  };
  if (base) collect(["diff", "--name-only", `${base}...HEAD`]);
  collect(["diff", "--name-only"]);
  collect(["diff", "--cached", "--name-only"]);
  collect(["ls-files", "--others", "--exclude-standard"]);
  return [...files].sort();
}

function workspaceFingerprint(cwd, manifestRelative) {
  const hash = createHash("sha256");
  hash.update(git(["rev-parse", "HEAD"], cwd));
  const exclude = `:(exclude)${normalizePath(manifestRelative)}`;
  try {
    // Diffing from HEAD includes both staged and unstaged content without
    // making the receipt depend on whether the contributor ran `git add`.
    hash.update(git(["diff", "--binary", "HEAD", "--", ".", exclude], cwd));
  } catch {
    // An empty diff is equivalent to no additional fingerprint input.
  }
  const untracked = git(
    ["ls-files", "--others", "--exclude-standard"],
    cwd,
  ).split("\n").filter(Boolean);
  for (const filename of untracked.sort()) {
    if (normalizePath(filename) === normalizePath(manifestRelative)) continue;
    hash.update(filename);
    hash.update(readFileSync(join(cwd, filename)));
  }
  return hash.digest("hex");
}

function parseWorktrees() {
  const records = [];
  let record;
  for (const line of git(["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) {
      record = { path: line.slice(9), branch: "(detached)" };
      records.push(record);
    } else if (line.startsWith("HEAD ")) {
      record.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      record.branch = line.slice(7).replace("refs/heads/", "");
    }
  }
  return records;
}

function validationCommandsForFiles(files) {
  const commands = [];
  const add = (...command) => {
    const key = JSON.stringify(command);
    if (!commands.some((item) => JSON.stringify(item) === key)) {
      commands.push(command);
    }
  };
  const has = (prefix) => files.some((filename) => filename.startsWith(prefix));
  const matches = (pattern) => files.some((filename) => pattern.test(filename));

  if (has("src/") || has("tools/") || has("scripts/")) add("pnpm", "build");
  if (has(".agents/") || has("scripts/parallel-")) add("pnpm", "test:unit");
  if (has("src/baselib/")) {
    add("pnpm", "test:baselib:strict");
    add("pnpm", "test:compiler");
    add("pnpm", "test:integration");
  }
  if (has("src/runtime/") || has("src/tree_sitter/") || has("tools/")) {
    add("pnpm", "test:compiler");
    add("pnpm", "test:integration");
  }
  if (has("packages/flint/")) {
    add("pnpm", "--dir", "packages/flint", "build");
    add("pnpm", "test:native");
  }
  if (has("packages/graph/")) {
    add("pnpm", "--dir", "packages/graph", "build");
    add("pnpm", "test:native");
  }
  if (has("packages/flint-wasm/")) add("pnpm", "test:wasm");
  if (
    has("docs/") ||
    matches(/(?:^|\/)(?:DOCSPEC|DOCUMENTATION)\.md$/) ||
    matches(/(?:documentation|docs)\.(?:ts|cjs)$/)
  ) {
    add("pnpm", "docs:check");
  }
  const hostTests = files.filter((filename) =>
    /^test\/[^/]+\.cjs$/.test(filename),
  );
  if (hostTests.length > 0) {
    const manifest = require(join(root, "test", "node-test-manifest.cjs"));
    const known = new Set([...manifest.unit, ...manifest.integration]);
    const harnessFiles = new Set([
      "test/node-test-manifest.cjs",
      "test/compiler.test.cjs",
      "test/native-kernel-addon-child.cjs",
      "test/native-kernel.cjs",
      "test/sea-smoke.cjs",
      "test/upstream-doctest-tools.cjs",
    ]);
    if (hostTests.some((filename) => manifest.unit.includes(filename))) {
      add("pnpm", "test:unit");
    }
    if (hostTests.some((filename) => manifest.integration.includes(filename))) {
      add("pnpm", "test:integration");
    }
    if (hostTests.some((filename) =>
      !known.has(filename) && !harnessFiles.has(filename),
    )) {
      add("pnpm", "test:cli");
    }
  }
  if (files.length > 0 && commands.length === 0) add("pnpm", "test:portable");
  return commands;
}

module.exports = {
  changedFiles,
  claimCovers,
  claimsOverlap,
  findOverlaps,
  git,
  laneAllowsClaim,
  lanePolicy,
  lanes,
  liveStatuses,
  normalizePath,
  parseWorktrees,
  platformNames,
  readTasks,
  root,
  taskFiles,
  validateTask,
  validationCommandsForFiles,
  workspaceFingerprint,
};
