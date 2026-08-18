#!/usr/bin/env node
"use strict";

const {
  existsSync,
  mkdirSync,
  writeFileSync,
} = require("node:fs");
const {
  basename,
  dirname,
  join,
  relative,
  resolve,
} = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  changedFiles,
  claimCovers,
  findOverlaps,
  git,
  lanes,
  normalizePath,
  parseWorktrees,
  readTasks,
  root,
  validateTask,
  validationCommandsForFiles,
  workspaceFingerprint,
} = require("./parallel-lib.cjs");
const {
  cleanupNativeCache,
  defaultNativeCacheRoot,
  nativeCachePackages,
  nativeCacheStatus,
  prepareNativePackages,
  restoreNativePackages,
} = require("./native-worktree-cache.cjs");

function usage(exitCode = 0) {
  process.stdout.write(`Usage:
  pnpm parallel:new -- ID LANE --objective TEXT --claim PATH [--claim PATH]
  pnpm parallel:check -- [--task ID | --all] [--json]
  pnpm parallel:status -- [--json]
  pnpm parallel:run -- ID -- COMMAND [ARG ...]
  pnpm parallel:cache -- [prepare|restore|status|cleanup] [options]
  pnpm test:changed -- [--base REF] [--list]

Run a subcommand with --help for details. Lane names:
  ${[...lanes.keys()].join("\n  ")}
`);
  process.exit(exitCode);
}

function run(command, args, cwd, options = {}) {
  if (!options.quiet) process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result;
}

function values(args, name) {
  const found = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      if (args[index + 1] === undefined) throw new Error(`${name} needs a value`);
      found.push(args[index + 1]);
      args.splice(index, 2);
      index -= 1;
    }
  }
  return found;
}

function value(args, name, fallback) {
  const found = values(args, name);
  if (found.length > 1) throw new Error(`${name} may only be supplied once`);
  return found[0] ?? fallback;
}

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function resolveBase(requested) {
  if (requested) return requested;
  try {
    git(["rev-parse", "--verify", "origin/main"]);
    return "origin/main";
  } catch {
    return "HEAD";
  }
}

function resolveProjectBase(requested) {
  return requested || "HEAD";
}

function createProject(rawArgs) {
  const args = [...rawArgs];
  if (flag(args, "--help")) {
    process.stdout.write(`Usage: pnpm parallel:new -- ID LANE [options]

Required:
  --objective TEXT       Concrete completed outcome
  --claim PATH           Exclusive write claim; repeat as needed

Options:
  --title TEXT           Human-readable title
  --owner NAME           Defaults to CODEX_AGENT_NAME or USER
  --base REF             Defaults to the invoking worktree's HEAD
  --branch NAME          Defaults to agent/ID
  --path DIRECTORY       Defaults to ../sagejs-worktrees/ID
  --reference VALUE      Paper, upstream source, or URL; repeatable
  --dependency ID        Another task contract; repeatable
  --architecture VALUE   dynamic-python, source-transparent-native,
                         external-library, native-primitive, mixed,
                         compiler-infrastructure, or not-applicable
  --fallback VALUE       same-source, tested-capability, or not-applicable
  --oracle VALUE         Correctness oracle; repeatable
  --exception TEXT       Architecture exception; repeatable
  --windows POLICY       required, fallback, or not-applicable
  --no-install           Do not run pnpm install
`);
    return;
  }
  const objective = value(args, "--objective");
  const title = value(args, "--title");
  const owner = value(
    args,
    "--owner",
    process.env.CODEX_AGENT_NAME || process.env.USER || "unassigned",
  );
  const base = resolveProjectBase(value(args, "--base"));
  const branchOption = value(args, "--branch");
  const pathOption = value(args, "--path");
  const windows = value(args, "--windows", "required");
  const claims = values(args, "--claim").map(normalizePath);
  const references = values(args, "--reference");
  const dependencies = values(args, "--dependency");
  const requestedArchitecture = value(args, "--architecture");
  const requestedFallback = value(args, "--fallback");
  const requestedOracles = values(args, "--oracle");
  const architectureExceptions = values(args, "--exception");
  const noInstall = flag(args, "--no-install");
  const [id, laneId, ...unexpected] = args;
  if (unexpected.length || !id || !laneId) usage(2);
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`invalid task id: ${id}`);
  const lane = lanes.get(laneId);
  if (!lane) throw new Error(`unknown lane: ${laneId}`);
  if (!objective) throw new Error("--objective is required");
  if (claims.length === 0) throw new Error("at least one --claim is required");
  if (!["required", "fallback", "not-applicable"].includes(windows)) {
    throw new Error("--windows must be required, fallback, or not-applicable");
  }
  const branch = branchOption || `agent/${id}`;
  const worktree = resolve(
    pathOption || join(dirname(root), `${basename(root)}-worktrees`, id),
  );
  if (existsSync(worktree)) throw new Error(`worktree path exists: ${worktree}`);
  const baseCommit = git(["rev-parse", base]);
  const mathematicalLanes = new Set([
    "arithmetic-algebra",
    "elliptic-curves",
    "hyperelliptic-curves",
    "modular-forms",
    "symbolic",
    "combinatorics-groups",
  ]);
  const defaultArchitecture = mathematicalLanes.has(laneId)
    ? "dynamic-python"
    : laneId === "native-compiler"
      ? "compiler-infrastructure"
      : "not-applicable";
  const architectureStrategy = requestedArchitecture || defaultArchitecture;
  const defaultFallback = architectureStrategy === "source-transparent-native" ||
      architectureStrategy === "dynamic-python"
    ? "same-source"
    : ["external-library", "native-primitive", "mixed"].includes(
        architectureStrategy,
      )
      ? "tested-capability"
      : "not-applicable";
  const architectureOracles = requestedOracles.length > 0
    ? requestedOracles
    : architectureStrategy === "source-transparent-native"
      ? ["cpython", "javascript"]
      : mathematicalLanes.has(laneId)
        ? ["sage"]
        : [];

  const task = {
    $schema: "../task.schema.json",
    schema_version: 2,
    id,
    title: title || id.split("-").map(
      (word) => word[0].toUpperCase() + word.slice(1),
    ).join(" "),
    lane: laneId,
    status: "active",
    owner,
    objective,
    base_commit: baseCommit,
    claims,
    dependencies,
    references,
    architecture: {
      strategy: architectureStrategy,
      fallback: requestedFallback || defaultFallback,
      oracles: architectureOracles,
      exceptions: architectureExceptions,
    },
    platforms: {
      "linux-x64": "required",
      "linux-arm64": "required",
      "windows-x64": windows,
      "macos-arm64": "required",
    },
    validation: [...lane.required_checks],
    runs: [],
    handoff: { summary: "", risks: [], next_steps: [] },
  };
  const taskErrors = validateTask(task, `${id}.json`);
  if (taskErrors.length) {
    throw new Error(`invalid task contract:\n  ${taskErrors.join("\n  ")}`);
  }
  run("git", ["worktree", "add", "-b", branch, worktree, base], root);
  const taskDirectory = join(worktree, ".agents", "tasks");
  mkdirSync(taskDirectory, { recursive: true });
  writeFileSync(
    join(taskDirectory, `${id}.json`),
    `${JSON.stringify(task, null, 2)}\n`,
  );
  run("git", ["submodule", "update", "--init", "--recursive"], worktree);
  if (!noInstall) run("pnpm", ["install", "--frozen-lockfile"], worktree);
  if (!noInstall) {
    const restored = restoreNativePackages(worktree, [...nativeCachePackages]);
    for (const result of restored) {
      process.stdout.write(`Native cache ${result.id}: ${result.status}\n`);
    }
  }
  process.stdout.write(`\nParallel project ready:
  task:      ${id}
  lane:      ${laneId}
  branch:    ${branch}
  worktree:  ${worktree}

Next:
  cd ${worktree}
  pnpm parallel:check
  pnpm test:changed
`);
}

function taskForBranch(entries, branch) {
  const matches = entries.filter(({ task }) => branch === `agent/${task.id}`);
  return matches.length === 1 ? matches[0] : undefined;
}

function statusEntriesForBranch(entries, branch) {
  const live = entries.filter(({ task }) =>
    ["active", "review", "blocked"].includes(task.status)
  );
  const branchTask = taskForBranch(live, branch);
  return branchTask === undefined ? [] : [branchTask];
}

function currentTask(taskId) {
  const entries = readTasks(join(root, ".agents", "tasks"));
  if (taskId) {
    const entry = entries.find(({ task }) => task.id === taskId);
    if (!entry) throw new Error(`task not found in this worktree: ${taskId}`);
    return entry;
  }
  const live = entries.filter(({ task }) =>
    ["active", "review", "blocked"].includes(task.status),
  );
  if (live.length > 1) {
    try {
      const branch = git(["branch", "--show-current"]);
      const branchTask = taskForBranch(live, branch);
      if (branchTask !== undefined) return branchTask;
    } catch {
      // Detached worktrees still require an explicit --task when ambiguous.
    }
  }
  if (live.length !== 1) {
    throw new Error(
      `expected exactly one live task in this worktree; found ${live.length}`,
    );
  }
  return live[0];
}

function validateEntries(entries, checkScope) {
  const diagnostics = [];
  for (const entry of entries) {
    for (const message of validateTask(entry.task, entry.filename)) {
      diagnostics.push({ task: entry.task.id || basename(entry.filename), message });
    }
  }
  for (const overlap of findOverlaps(entries)) {
    diagnostics.push({
      task: `${overlap.left},${overlap.right}`,
      message: `overlapping claims: ${overlap.leftClaim} and ${overlap.rightClaim}`,
    });
  }
  if (checkScope && entries.length === 1 && diagnostics.length === 0) {
    const { filename, task } = entries[0];
    const manifest = normalizePath(relative(root, filename));
    const changes = changedFiles(task.base_commit);
    for (const changed of changes) {
      if (changed === manifest) continue;
      if (!task.claims.some((claim) => claimCovers(claim, changed))) {
        diagnostics.push({ task: task.id, message: `unclaimed change: ${changed}` });
      }
    }
    if (["review", "complete"].includes(task.status)) {
      if (!task.handoff.summary?.trim()) {
        diagnostics.push({ task: task.id, message: "review requires handoff.summary" });
      }
      const fingerprint = workspaceFingerprint(root, manifest);
      for (const command of task.validation) {
        const receipt = [...task.runs].reverse().find(
          (run) => run.command === command && run.result === "pass" &&
            run.workspace_fingerprint === fingerprint,
        );
        if (!receipt) {
          diagnostics.push({
            task: task.id,
            message: `no fresh passing receipt for: ${command}`,
          });
        }
      }
    }
  }
  return diagnostics;
}

function checkProjects(rawArgs) {
  const args = [...rawArgs];
  const json = flag(args, "--json");
  const all = flag(args, "--all");
  const taskId = value(args, "--task");
  if (flag(args, "--help")) {
    process.stdout.write("Usage: pnpm parallel:check -- [--task ID | --all] [--json]\n");
    return;
  }
  if (args.length) throw new Error(`unknown arguments: ${args.join(" ")}`);
  const entries = all
    ? readTasks(join(root, ".agents", "tasks"))
    : [currentTask(taskId)];
  const diagnostics = validateEntries(entries, !all);
  const result = {
    ok: diagnostics.length === 0,
    tasks: entries.map(({ task }) => task.id),
    diagnostics,
  };
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (result.ok) {
    process.stdout.write(`Parallel task contracts passed (${entries.length}).\n`);
  } else {
    for (const item of diagnostics) {
      process.stderr.write(`${item.task}: ${item.message}\n`);
    }
  }
  if (!result.ok) process.exitCode = 1;
}

function projectStatus(rawArgs) {
  const args = [...rawArgs];
  const json = flag(args, "--json");
  if (flag(args, "--help")) {
    process.stdout.write("Usage: pnpm parallel:status -- [--json]\n");
    return;
  }
  if (args.length) throw new Error(`unknown arguments: ${args.join(" ")}`);
  const worktrees = parseWorktrees().map((worktree) => {
    const entries = statusEntriesForBranch(
      readTasks(join(worktree.path, ".agents", "tasks")),
      worktree.branch,
    );
    const dirty = git(["status", "--porcelain"], worktree.path)
      .split("\n").filter(Boolean).length;
    let ahead = null;
    let behind = null;
    try {
      [behind, ahead] = git(
        ["rev-list", "--left-right", "--count", "origin/main...HEAD"],
        worktree.path,
      ).split(/\s+/).map(Number);
    } catch {
      // A local-only checkout can still use status and overlap reporting.
    }
    return {
      ...worktree,
      dirty,
      ahead,
      behind,
      tasks: entries.map(({ task }) => task),
      entries,
    };
  });
  const entries = worktrees.flatMap(({ path, entries: items }) =>
    items.map((entry) => ({ ...entry, worktree: path })),
  );
  const overlaps = findOverlaps(entries);
  if (json) {
    process.stdout.write(`${JSON.stringify({ worktrees: worktrees.map(
      ({ entries: _, ...worktree }) => worktree,
    ), overlaps }, null, 2)}\n`);
  } else {
    process.stdout.write("TASK                 STATUS    LANE                  DIRTY  +/- main  WORKTREE\n");
    process.stdout.write("--------------------------------------------------------------------------------\n");
    for (const worktree of worktrees) {
      if (worktree.tasks.length === 0) {
        process.stdout.write(
          `${"(none)".padEnd(20)} ${"-".padEnd(9)} ${"-".padEnd(21)} ` +
          `${String(worktree.dirty).padStart(5)}  ${"-".padEnd(7)}   ${worktree.path}\n`,
        );
      }
      for (const task of worktree.tasks) {
        const delta = worktree.ahead === null
          ? "?"
          : `+${worktree.ahead}/-${worktree.behind}`;
        process.stdout.write(
          `${task.id.padEnd(20)} ${task.status.padEnd(9)} ` +
          `${task.lane.padEnd(21)} ${String(worktree.dirty).padStart(5)}  ` +
          `${delta.padEnd(7)}   ${worktree.path}\n`,
        );
      }
    }
    for (const overlap of overlaps) {
      process.stderr.write(
        `OVERLAP ${overlap.left}:${overlap.leftClaim} ` +
        `${overlap.right}:${overlap.rightClaim}\n`,
      );
    }
  }
  if (overlaps.length) process.exitCode = 1;
}

function recordRun(rawArgs) {
  const args = [...rawArgs];
  if (flag(args, "--help")) {
    process.stdout.write("Usage: pnpm parallel:run -- TASK -- COMMAND [ARG ...]\n");
    return;
  }
  const separator = args.indexOf("--");
  const taskId = args[0];
  const command = separator === -1 ? args.slice(1) : args.slice(separator + 1);
  if (!taskId || command.length === 0) usage(2);
  const entry = currentTask(taskId);
  const manifest = normalizePath(relative(root, entry.filename));
  const started = new Date();
  const before = process.hrtime.bigint();
  const result = run(command[0], command.slice(1), root, { allowFailure: true });
  const seconds = Number(process.hrtime.bigint() - before) / 1e9;
  const commandText = command.join(" ");
  const fingerprint = workspaceFingerprint(root, manifest);
  entry.task.runs.push({
    command: commandText,
    result: result.status === 0 ? "pass" : "fail",
    exit_code: result.status ?? 1,
    seconds: Number(seconds.toFixed(3)),
    started_at: started.toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    workspace_fingerprint: fingerprint,
    platform: `${process.platform}-${process.arch}`,
  });
  writeFileSync(entry.filename, `${JSON.stringify(entry.task, null, 2)}\n`);
  process.stdout.write(
    `Recorded ${entry.task.id}: ${commandText} ` +
    `(${result.status === 0 ? "pass" : "fail"}, ${seconds.toFixed(2)}s)\n`,
  );
  process.exitCode = result.status ?? 1;
}

function changedChecks(rawArgs) {
  const args = [...rawArgs];
  const listOnly = flag(args, "--list");
  const requestedBase = value(args, "--base");
  if (flag(args, "--help")) {
    process.stdout.write("Usage: pnpm test:changed -- [--base REF] [--list]\n");
    return;
  }
  if (args.length) throw new Error(`unknown arguments: ${args.join(" ")}`);
  const base = resolveBase(requestedBase);
  const files = changedFiles(base);
  const commands = validationCommandsForFiles(files);
  process.stdout.write(`Changed files against ${base}: ${files.length}\n`);
  for (const command of commands) process.stdout.write(`  ${command.join(" ")}\n`);
  if (listOnly || commands.length === 0) return;
  for (const command of commands) run(command[0], command.slice(1), root);
}

function parseCacheByteLimit(value) {
  const match = String(value).match(/^(\d+)(B|KiB|MiB|GiB)?$/i);
  if (!match) {
    throw new Error(
      `--max-bytes must be an integer with optional B, KiB, MiB, or GiB: ${value}`,
    );
  }
  const multipliers = {
    b: 1,
    gib: 1024 ** 3,
    kib: 1024,
    mib: 1024 ** 2,
  };
  const bytes = Number(match[1]) * multipliers[(match[2] || "B").toLowerCase()];
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error(`--max-bytes is outside the safe positive range: ${value}`);
  }
  return bytes;
}

function parseCacheGenerationLimit(value) {
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`--max-generations must be a positive integer: ${value}`);
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error(`--max-generations must be a positive integer: ${value}`);
  }
  return count;
}

function formatCacheBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? amount : amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unit]}`;
}

function printNativeCacheStatus(status) {
  const totals = status.totals;
  process.stdout.write(`Native cache: ${status.cache_root}\n`);
  process.stdout.write(
    `  ${formatCacheBytes(totals.bytes)} in ${totals.generations} generations; ` +
      `${totals.obsolete_generations} obsolete ` +
      `(${formatCacheBytes(totals.obsolete_bytes)})\n`,
  );
  process.stdout.write(
    `  retained ${totals.retained_generations}; active locks ${totals.locks}\n`,
  );
  for (const artifact of status.artifacts) {
    process.stdout.write(
      `  ${artifact.id}: ${formatCacheBytes(artifact.bytes)}, ` +
        `${artifact.generations.length} generations, ${artifact.locks} locks\n`,
    );
  }
  if (!status.safe) {
    for (const issue of status.issues) process.stderr.write(`  unsafe: ${issue}\n`);
  }
}

function printNativeCacheCleanup(result) {
  const mode = result.applied ? "applied" : "dry run";
  process.stdout.write(`Native cache cleanup (${mode}): ${result.cache_root}\n`);
  process.stdout.write(
    `  eligible ${result.eligible.generations} generations ` +
      `(${formatCacheBytes(result.eligible.bytes)}); selected ` +
      `${result.selected.generations.length} ` +
      `(${formatCacheBytes(result.selected.bytes)})\n`,
  );
  if (result.applied) {
    process.stdout.write(
      `  removed ${result.removed.generations.length} generations ` +
        `(${formatCacheBytes(result.removed.bytes)}); skipped ` +
        `${result.skipped.length}\n`,
    );
  } else {
    process.stdout.write("  no files removed; pass --apply to execute this bounded plan\n");
  }
}

function nativeCacheCommand(rawArgs) {
  const args = [...rawArgs];
  if (flag(args, "--help")) {
    process.stdout.write(`Usage: pnpm parallel:cache -- ACTION [options]

Actions:
  prepare               restore or build selected native packages (default)
  restore               restore selected packages without building
  status                report cache size and retained generations
  cleanup               plan obsolete-generation cleanup (dry-run by default)

Options:
  --package ID          flint, fflas, graph, or m4ri; repeatable (defaults to all)
  --cache-root PATH     override the shared content-addressed cache
  --json                structured status or cleanup output
  --apply               execute a cleanup plan
  --max-generations N   cleanup cap (default 8)
  --max-bytes SIZE      cleanup cap; B, KiB, MiB, or GiB (default 20GiB)

prepare restores a valid artifact or builds and atomically publishes a cache
miss. restore never builds and is used automatically by parallel:new. cleanup
preserves current selections, installed shared links, and locked generations;
without --apply it only reports the exact bounded plan.
`);
    return;
  }
  const action = args.shift() || "prepare";
  const json = flag(args, "--json");
  const apply = flag(args, "--apply");
  const requested = values(args, "--package");
  const packageIds = requested.length > 0 ? requested : [...nativeCachePackages];
  const cacheRoot = resolve(value(args, "--cache-root", defaultNativeCacheRoot(root)));
  const maxGenerationsOption = value(args, "--max-generations");
  const maxBytesOption = value(args, "--max-bytes");
  const maxGenerationsValue = maxGenerationsOption ?? "8";
  const maxBytesValue = maxBytesOption ?? "20GiB";
  if (args.length) throw new Error(`unknown arguments: ${args.join(" ")}`);
  if (["prepare", "restore"].includes(action)) {
    if (json || apply || maxGenerationsOption || maxBytesOption) {
      throw new Error(
        `${action} does not accept cleanup/status output options`,
      );
    }
    const results = action === "prepare"
      ? prepareNativePackages(root, packageIds, { cacheRoot })
      : restoreNativePackages(root, packageIds, { cacheRoot });
    for (const result of results) {
      process.stdout.write(`Native cache ${result.id}: ${result.status}\n`);
    }
    return;
  }
  if (requested.length !== 0) {
    throw new Error(`${action} does not accept --package`);
  }
  if (action === "status") {
    if (apply || maxGenerationsOption || maxBytesOption) {
      throw new Error("status does not accept cleanup limits or --apply");
    }
    const status = nativeCacheStatus(root, cacheRoot, {
      expectedRoot: cacheRoot,
      workspaces: parseWorktrees().map(({ path }) => path),
    });
    if (json) process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    else printNativeCacheStatus(status);
    if (!status.safe) process.exitCode = 1;
    return;
  }
  if (action === "cleanup") {
    const result = cleanupNativeCache(root, cacheRoot, {
      apply,
      expectedRoot: cacheRoot,
      maxBytes: parseCacheByteLimit(maxBytesValue),
      maxGenerations: parseCacheGenerationLimit(maxGenerationsValue),
      workspaces: parseWorktrees().map(({ path }) => path),
    });
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else printNativeCacheCleanup(result);
    return;
  }
  throw new Error(`unknown native cache action: ${action}`);
}

if (require.main === module) {
  const invocation = process.argv.slice(2);
  if (invocation[0] === "--") invocation.shift();
  const subcommand = invocation.shift();
  if (invocation[0] === "--") invocation.shift();
  const args = invocation;

  try {
    if (subcommand === "new") createProject(args);
    else if (subcommand === "check") checkProjects(args);
    else if (subcommand === "status") projectStatus(args);
    else if (subcommand === "run") recordRun(args);
    else if (subcommand === "changed") changedChecks(args);
    else if (subcommand === "cache") nativeCacheCommand(args);
    else usage(subcommand ? 2 : 0);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  resolveProjectBase,
  statusEntriesForBranch,
  taskForBranch,
};
