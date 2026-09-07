#!/usr/bin/env node
"use strict";

// Checkpoints are local scheduling hints, not publication attestations. The
// numerical collectors and final authenticator remain the evidence authority.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash, randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { runBufferedCommand } = require("../build-parallelism.cjs");
const { pnpmInvocation } = require("../pnpm-invocation.cjs");
const { requirePreflight, inspectPreflight } = require("./preflight.cjs");
const { readStatus } = require("./status.cjs");

const digest = (value) => createHash("sha256").update(value).digest("hex");
function fileDigest(filename) {
  const hash = createHash("sha256");
  const descriptor = fs.openSync(filename, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally { fs.closeSync(descriptor); }
  return hash.digest("hex");
}
function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
function identity(root, candidate) {
  const commit = git(root, ["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/.test(candidate) || commit !== candidate) {
    throw new Error("--candidate must be the full, current HEAD commit");
  }
  if (git(root, ["status", "--porcelain", "--untracked-files=normal"])) {
    throw new Error("release qualification requires a clean worktree");
  }
  return { commit, tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
}
function snapshot(root, names) {
  const records = [];
  function visit(name) {
    const absolute = path.resolve(root, name);
    const relative = path.relative(root, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`artifact escapes checkout: ${name}`);
    }
    const stat = fs.lstatSync(absolute); // Missing required inputs fail closed.
    if (stat.isSymbolicLink()) throw new Error(`artifact symlink: ${name}`);
    if (stat.isDirectory()) {
      records.push([name, "directory"]);
      for (const child of fs.readdirSync(absolute).sort()) {
        visit(`${name}/${child}`);
      }
    } else if (stat.isFile()) {
      records.push([name, stat.mode & 0o111, fileDigest(absolute)]);
    } else throw new Error(`unsupported artifact: ${name}`);
  }
  for (const name of [...new Set(names)].sort()) visit(name);
  return digest(JSON.stringify(records));
}
function atomicJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}
function acquireLock(filename) {
  try {
    const descriptor = fs.openSync(filename, "wx");
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, host: os.hostname() }));
    fs.closeSync(descriptor);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (owner.host !== os.hostname()) throw new Error("release runner is locked by another host");
    try {
      process.kill(owner.pid, 0);
    } catch (probe) {
      if (probe.code !== "ESRCH") throw probe;
      throw new Error(`stale runner lock ${filename}: inspect orphan build/test processes before removing it`);
    }
    throw new Error(`release runner already active (PID ${owner.pid})`);
  }
  return () => fs.unlinkSync(filename);
}
function environmentIdentity(env) {
  // Never write values (which may include credentials) to the receipt.
  const entries = Object.entries(env).filter(([name]) =>
    /^(SAGEJS_|CC$|CXX$|CFLAGS$|CXXFLAGS$|LDFLAGS$|PATH$|NODE_OPTIONS$|CI$|npm_execpath$)/.test(name),
  ).sort(([a], [b]) => a.localeCompare(b));
  return digest(JSON.stringify(entries));
}
async function run({ root, candidate, stages, environment = process.env, fresh = false,
  preflight = requirePreflight, profile = "custom", selectedStages = true }) {
  if (!Array.isArray(stages) || stages.length === 0 ||
      stages.some((stage) => !/^[a-z][a-z0-9-]*$/.test(stage.id)) ||
      new Set(stages.map((stage) => stage.id)).size !== stages.length) {
    throw new Error("release run requires unique, safe stage IDs");
  }
  const source = identity(root, candidate);
  const directory = path.join(root, "build", "release-runner", candidate);
  fs.mkdirSync(directory, { recursive: true });
  const unlock = acquireLock(path.join(root, "build", "release-runner", "active.lock"));
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const started = Date.now();
  const results = [];
  const journal = { schema: "sagejs.release-run/v1", runId: randomUUID(), source,
    scope: { profile, selectedStages, authority: "scheduling-only; not release eligibility or publication authorization" },
    owner: { host: os.hostname(), pid: process.pid }, state: "running",
    started: new Date().toISOString(),
    stages: stages.map((stage) => ({ id: stage.id, gate: stage.gate, state: "pending" })) };
  const persist = () => {
    journal.updated = new Date().toISOString();
    journal.elapsedSeconds = (Date.now() - started) / 1000;
    atomicJson(path.join(directory, "runs", `${journal.runId}.json`), journal);
    atomicJson(path.join(directory, "status.json"), journal);
  };
  let current;
  try {
    persist();
    for (const [index, stage] of stages.entries()) {
      current = journal.stages[index];
      current.state = "checking";
      persist();
      if (controller.signal.aborted) throw new Error("release run interrupted");
      identity(root, candidate);
      if ((stage.inputs || []).includes("dist")) {
        const readiness = require("../build-receipt.cjs").inspectBuildReceipt(root);
        if (!readiness.current) throw new Error(`${stage.id}: stale runtime build: ${readiness.reason}`);
      }
      const inputs = snapshot(root, stage.inputs || []);
      const key = digest(JSON.stringify({
        source, stage, node: process.version, platform: process.platform,
        arch: process.arch, host: os.hostname(), runner: digest(fs.readFileSync(__filename)),
        preflight: fileDigest(path.join(__dirname, "preflight.cjs")),
        environment: environmentIdentity(environment), inputs,
      }));
      const receiptPath = path.join(directory, `${stage.id}.json`);
      let old;
      try { old = JSON.parse(fs.readFileSync(receiptPath, "utf8")); } catch {}
      let reusable = false;
      if (!fresh && old?.status === "passed" && old.key === key) {
        try { reusable = old.outputs === snapshot(root, stage.outputs || []); } catch {}
      }
      if (reusable) {
        console.log(`[release] ${index + 1}/${stages.length} ${stage.id}: reused verified checkpoint`);
        results.push({ id: stage.id, status: "passed", reused: true });
        Object.assign(current, { state: "passed", reused: true, key });
        persist();
        continue;
      }
      // Repeat before each executing stage: earlier tests/builds consume space.
      // Do not rerun a successful stage just to obtain a preflight observation.
      current.preflight = preflight({ root, environment: { ...environment, ...stage.env } });
      if (!current.preflight.passed) throw new Error("preflight must pass before execution");
      const receipt = { schema: "sagejs.release-stage/v1", source, key, stage: stage.id,
        gate: stage.gate, status: "running", started: new Date().toISOString() };
      const writeReceipt = () => {
        atomicJson(path.join(directory, "runs", journal.runId, `${stage.id}.json`), receipt);
        atomicJson(receiptPath, receipt);
      };
      writeReceipt();
      const logPath = path.join(directory, `${stage.id}.${Date.now()}.log`);
      Object.assign(current, { state: "running", started: receipt.started, key, log: logPath });
      persist();
      const log = fs.openSync(logPath, "wx");
      const stageStarted = Date.now();
      console.log(`[release] ${index + 1}/${stages.length} ${stage.id} (${stage.gate}); log ${logPath}`);
      const heartbeat = setInterval(() => console.log(
        `[release] ${stage.id}: ${Math.round((Date.now() - stageStarted) / 1000)}s elapsed; ` +
        `total ${Math.round((Date.now() - started) / 1000)}s`,
      ), 20000);
      let timedOut = false;
      let stageError;
      let outputError;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, stage.timeoutSeconds * 1000);
      try {
        for (const template of stage.commands) {
          const command = template.map((item) => item === "{candidate}" ? candidate : fresh && item === "--resume" ? "--resume-fresh" : item);
          const invocation = command[0] === "pnpm" ? pnpmInvocation(command.slice(1)) :
            { command: command[0] === "node" ? process.execPath : command[0], arguments: command.slice(1) };
          const output = (chunk) => {
            if (outputError) return;
            try { fs.writeSync(log, chunk); process.stdout.write(chunk); }
            catch (error) { outputError = error; controller.abort(); }
          };
          const result = await runBufferedCommand(invocation.command, invocation.arguments, {
            cwd: root, env: { ...environment, ...stage.env }, shell: invocation.shell,
            capture: false, signal: controller.signal, onStdout: output, onStderr: output,
          });
          if (outputError) throw outputError;
          if (result.status !== 0 || controller.signal.aborted) {
            const error = new Error(`${stage.id}: command failed or interrupted (${result.status}); see ${logPath}`);
            error.code = timedOut ? "RELEASE_TIMEOUT" : controller.signal.aborted ? "RELEASE_INTERRUPTED" : "RELEASE_COMMAND";
            throw error;
          }
        }
        identity(root, candidate);
        if (snapshot(root, stage.inputs || []) !== inputs) {
          throw new Error(`${stage.id}: qualification inputs changed during execution`);
        }
        receipt.outputs = snapshot(root, stage.outputs || []);
        receipt.status = "passed";
      } catch (error) {
        stageError = error;
        receipt.status = "failed";
        receipt.error = error.message;
        receipt.failureCode = error.code || "RELEASE_VALIDATION";
        throw error;
      } finally {
        clearInterval(heartbeat);
        clearTimeout(timer);
        fs.closeSync(log);
        receipt.durationSeconds = (Date.now() - stageStarted) / 1000;
        try { writeReceipt(); } catch (writeError) {
          if (!stageError) throw writeError;
          console.error(`[release] unable to persist stage failure (${writeError.code || "write failed"})`);
        }
      }
      results.push({ id: stage.id, status: receipt.status });
      Object.assign(current, { state: "passed", durationSeconds: receipt.durationSeconds });
      persist();
    }
    atomicJson(path.join(directory, "last-run.json"), { source, results });
    journal.state = "passed";
    persist();
    return results;
  } catch (error) {
    journal.state = "failed";
    journal.failure = { stage: current?.id ?? null, code: error.code || "RELEASE_VALIDATION", message: error.message };
    if (current && current.state !== "passed") {
      current.state = "failed";
      if (error.report) current.preflight = error.report;
    }
    for (const entry of journal.stages) {
      if (entry.state === "pending") Object.assign(entry, { state: "blocked", blockedBy: current?.id ?? "runner" });
    }
    // ENOSPC can also prevent writing diagnostics. Preserve the causal error
    // and the previous journal instead of masking it with a second write error.
    try { persist(); } catch (writeError) { console.error(`[release] unable to persist failure status (${writeError.code || "write failed"})`); }
    throw error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    unlock();
  }
}
async function main(argv) {
  const root = path.resolve(__dirname, "../..");
  const { plan } = require("./stages.cjs");
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (["--candidate", "--stage", "--profile"].includes(argv[i])) options[argv[i].slice(2)] = argv[++i];
    else if (["--list", "--fresh", "--preflight", "--status"].includes(argv[i])) options[argv[i].slice(2)] = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (options.status) return console.log(JSON.stringify(readStatus(root, options.candidate), null, 2));
  if (options.preflight) {
    identity(root, options.candidate);
    const report = inspectPreflight({ root });
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
    return;
  }
  const stages = plan(options.profile || "native", options.stage);
  if (options.list) return console.log(JSON.stringify(stages, null, 2));
  await run({ root, candidate: options.candidate, stages, fresh: options.fresh,
    profile: options.profile || "native", selectedStages: options.stage !== undefined });
}
if (require.main === module) main(process.argv.slice(2)).catch((error) => {
  console.error(error.stack); process.exitCode = 1;
});
module.exports = { run, identity, snapshot, acquireLock, environmentIdentity, fileDigest, atomicJson };
