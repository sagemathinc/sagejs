"use strict";

const { accessSync, constants, readFileSync } = require("node:fs");
const { delimiter, isAbsolute, join } = require("node:path");
const { execFileSync, spawn, spawnSync } = require("node:child_process");
const readline = require("node:readline");

function resolveExecutable(command, env = process.env) {
  if (
    isAbsolute(command) ||
    command.includes("/") ||
    command.includes("\\")
  ) {
    try {
      accessSync(command, constants.X_OK);
      return command;
    } catch {
      return null;
    }
  }
  for (const directory of String(env.PATH || "").split(delimiter)) {
    const candidate = join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return null;
}

function readRssKilobytes(pid) {
  if (!pid) return null;
  if (Number(pid) === process.pid && process.platform !== "linux") {
    return Math.ceil(process.memoryUsage().rss / 1024);
  }
  try {
    if (process.platform === "linux") {
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
      return match ? Number(match[1]) : null;
    }
    if (process.platform === "darwin") {
      const value = Number(
        execFileSync("ps", ["-o", "rss=", "-p", String(pid)], {
          encoding: "utf8",
          timeout: 2_000,
        }).trim(),
      );
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    if (process.platform === "win32") {
      const script =
        `(Get-Process -Id ${Number(pid)} -ErrorAction Stop).WorkingSet64`;
      const bytes = Number(
        execFileSync(
          "powershell.exe",
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
          ],
          {
            encoding: "utf8",
            timeout: 5_000,
            stdio: ["ignore", "pipe", "ignore"],
          },
        ).trim(),
      );
      return Number.isFinite(bytes) && bytes > 0
        ? Math.ceil(bytes / 1024)
        : null;
    }
  } catch {
    return null;
  }
  return null;
}

function processChildren(pid) {
  if (process.platform !== "linux" || !pid) return [];
  try {
    const text = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
    return text ? text.split(/\s+/).map(Number).filter(Number.isSafeInteger) : [];
  } catch {
    return [];
  }
}

function readProcessTreeRssKilobytes(pid) {
  if (process.platform !== "linux") {
    const kilobytes = readRssKilobytes(pid);
    return {
      kilobytes,
      scope: "process-only",
      observed_processes: kilobytes === null ? 0 : 1,
    };
  }
  const pending = [pid];
  const seen = new Set();
  let total = 0;
  let observed = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const rss = readRssKilobytes(current);
    if (rss !== null) {
      total += rss;
      observed += 1;
    }
    pending.push(...processChildren(current));
  }
  return {
    kilobytes: observed ? total : null,
    scope: "process-tree",
    observed_processes: observed,
  };
}

function boundedSpawn(command, args, { env, cwd, memoryMb } = {}) {
  const executable = resolveExecutable(command, env);
  if (!executable) return { child: null, executable: null, command, args };
  const prlimit = process.platform === "linux" ? resolveExecutable("prlimit", env) : null;
  const useLimit = Number.isFinite(memoryMb) && memoryMb > 0 && prlimit;
  const child = useLimit
    ? spawn(prlimit, [`--as=${Math.floor(memoryMb * 1024 * 1024)}`, "--", executable, ...args], {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      })
    : spawn(executable, args, {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
  return { child, executable, command: useLimit ? prlimit : executable, args };
}

class PersistentLineProcess {
  constructor({
    name,
    command,
    args = [],
    cwd,
    env = {},
    memoryMb,
    readyPrefix = "@@NFMO_READY@@",
    resultPrefix = "@@NFMO_RESULT@@",
    startupTimeoutMs = 120_000,
    startupInput,
  }) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = { ...process.env, ...env };
    this.memoryMb = memoryMb;
    this.readyPrefix = readyPrefix;
    this.resultPrefix = resultPrefix;
    this.startupTimeoutMs = startupTimeoutMs;
    this.startupInput = startupInput;
    this.child = null;
    this.pending = null;
    this.stderr = "";
    this.startupMs = null;
    this.version = null;
    this.shutdownPromise = null;
  }

  async start() {
    // A timed-out worker is killed as a process group.  Delivery of SIGKILL is
    // asynchronous, so do not overlap its teardown with the replacement
    // worker.  In particular, Sage.js workers share compiler/cache resources;
    // an immediate replacement can otherwise observe a half-torn-down writer
    // and fail repeatedly during startup.
    if (this.shutdownPromise) await this.shutdownPromise;
    if (this.child) return { status: "ok", startup_ms: this.startupMs, version: this.version };
    const started = process.hrtime.bigint();
    const launched = boundedSpawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      memoryMb: this.memoryMb,
    });
    if (!launched.child) {
      return { status: "unavailable", reason: `executable not found: ${this.command}` };
    }
    const child = launched.child;
    this.child = child;
    this.stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-65_536);
    });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.#onLine(child, line));
    child.on("exit", (code, signal) => this.#onExit(child, code, signal));
    child.on("error", (error) => this.#onExit(child, null, null, error));
    if (this.startupInput) child.stdin.write(`${this.startupInput}\n`);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#kill();
        resolve({ status: "crash", reason: `${this.name} startup timed out`, stderr: this.stderr });
      }, this.startupTimeoutMs);
      this.startupWaiter = (line) => {
        clearTimeout(timer);
        this.startupWaiter = null;
        this.startupFailure = null;
        this.startupMs = Number(process.hrtime.bigint() - started) / 1e6;
        this.version = line.slice(this.readyPrefix.length).trim() || "unknown";
        resolve({ status: "ok", startup_ms: this.startupMs, version: this.version });
      };
      this.startupFailure = (reason) => {
        clearTimeout(timer);
        this.startupWaiter = null;
        this.startupFailure = null;
        resolve({ status: "crash", reason, stderr: this.stderr });
      };
    });
  }

  #onLine(child, line) {
    if (child !== this.child) return;
    if (line.startsWith(this.readyPrefix) && this.startupWaiter) {
      this.startupWaiter(line);
      return;
    }
    if (!line.startsWith(this.resultPrefix) || !this.pending) {
      if (this.pending) {
        this.pending.outputLines.push(line);
        if (this.pending.outputLines.length > 100_000) this.pending.outputLines.shift();
      }
      return;
    }
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    clearInterval(pending.rssTimer);
    const wallMs = Number(process.hrtime.bigint() - pending.started) / 1e6;
    pending.resolve({
      status: "ok",
      line: line.slice(this.resultPrefix.length),
      wall_ms: wallMs,
      peak_rss_kb: pending.peakRss,
      peak_rss_scope: pending.peakRssScope,
      peak_rss_observed_processes: pending.peakRssObservedProcesses,
      stderr: this.stderr,
      output_lines: pending.outputLines,
    });
  }

  #onExit(child, code, signal, error) {
    if (child !== this.child) return;
    this.child = null;
    if (this.startupWaiter) {
      this.startupFailure?.(
        error?.message || `${this.name} exited before readiness with code ${code}, signal ${signal}`,
      );
    }
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    clearInterval(pending.rssTimer);
    pending.resolve({
      status: "crash",
      reason: error?.message || `${this.name} exited with code ${code}, signal ${signal}`,
      stderr: this.stderr,
      exit_code: code,
      signal,
      pid: child?.pid,
      peak_rss_kb: pending.peakRss,
      peak_rss_scope: pending.peakRssScope,
      peak_rss_observed_processes: pending.peakRssObservedProcesses,
    });
  }

  #kill() {
    const child = this.child;
    if (!child) return this.shutdownPromise || Promise.resolve();
    this.child = null;

    let finish;
    const shutdown = new Promise((resolve) => {
      let complete = false;
      finish = () => {
        if (complete) return;
        complete = true;
        resolve();
      };
      child.once("exit", finish);
      child.once("close", finish);
    });
    this.shutdownPromise = shutdown;
    shutdown.finally(() => {
      if (this.shutdownPromise === shutdown) this.shutdownPromise = null;
    });

    if (child.exitCode !== null || child.signalCode !== null) {
      finish();
      return shutdown;
    }
    if (process.platform === "win32") {
      child.kill("SIGKILL");
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
    return shutdown;
  }

  async request(line, { timeoutMs }) {
    const availability = await this.start();
    if (availability.status !== "ok") return availability;
    if (this.pending) throw new Error(`${this.name} only supports one in-flight request`);
    return new Promise((resolve) => {
      const pending = {
        resolve,
        started: process.hrtime.bigint(),
        peakRss: null,
        peakRssScope: process.platform === "linux" ? "process-tree" : "process-only",
        peakRssObservedProcesses: 0,
        outputLines: [],
      };
      const initialRss = readProcessTreeRssKilobytes(this.child.pid);
      pending.peakRss = initialRss.kilobytes;
      pending.peakRssScope = initialRss.scope;
      pending.peakRssObservedProcesses = initialRss.observed_processes || 0;
      pending.rssTimer = setInterval(() => {
        const snapshot = readProcessTreeRssKilobytes(this.child?.pid);
        if (snapshot.kilobytes !== null) {
          pending.peakRss = Math.max(pending.peakRss || 0, snapshot.kilobytes);
          pending.peakRssObservedProcesses = Math.max(
            pending.peakRssObservedProcesses,
            snapshot.observed_processes || 0,
          );
        }
      }, 10);
      pending.timer = setTimeout(() => {
        if (this.pending !== pending) return;
        this.pending = null;
        clearInterval(pending.rssTimer);
        const peakRss = pending.peakRss;
        this.#kill();
        resolve({
          status: "timeout",
          timeout_ms: timeoutMs,
          peak_rss_kb: peakRss,
          peak_rss_scope: pending.peakRssScope,
          peak_rss_observed_processes: pending.peakRssObservedProcesses,
          stderr: this.stderr,
        });
      }, timeoutMs);
      this.pending = pending;
      this.child.stdin.write(`${line}\n`);
    });
  }

  close() {
    if (!this.child) return;
    this.child.stdin.end();
    this.#kill();
  }
}

function commandVersion(command, args = ["--version"], options = {}) {
  const executable = resolveExecutable(command, options.env);
  if (!executable) return { status: "unavailable", reason: `executable not found: ${command}` };
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: options.timeoutMs || 10_000,
    env: { ...process.env, ...options.env },
  });
  if (result.error) {
    return {
      status: result.error.code === "ETIMEDOUT" ? "timeout" : "crash",
      reason: result.error.message,
    };
  }
  return {
    status: result.status === 0 ? "ok" : "crash",
    version: `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0],
    exit_code: result.status,
  };
}

module.exports = {
  PersistentLineProcess,
  boundedSpawn,
  commandVersion,
  readProcessTreeRssKilobytes,
  readRssKilobytes,
  resolveExecutable,
};
