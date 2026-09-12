"use strict";

const { spawn } = require("node:child_process");
const { availableParallelism } = require("node:os");

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function hostParallelism() {
  return typeof availableParallelism === "function"
    ? availableParallelism()
    : 4;
}

function buildJobs(environment = process.env) {
  return environment.SAGEJS_BUILD_JOBS === undefined
    ? Math.max(1, Math.min(8, hostParallelism()))
    : positiveInteger(environment.SAGEJS_BUILD_JOBS, "SAGEJS_BUILD_JOBS");
}

function nativeKernelJobs(environment = process.env) {
  if (environment.SAGEJS_NATIVE_KERNEL_JOBS !== undefined) {
    return positiveInteger(
      environment.SAGEJS_NATIVE_KERNEL_JOBS,
      "SAGEJS_NATIVE_KERNEL_JOBS",
    );
  }
  return Math.max(1, Math.min(4, Math.floor((buildJobs(environment) + 1) / 2)));
}

function terminateProcessTree(child, signal = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "taskkill", "/pid", String(child.pid), "/t", "/f"],
      { stdio: "ignore" },
    );
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}

function runBufferedCommand(command, arguments_, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.env || process.env,
      detached: process.platform !== "win32",
      shell: options.shell || false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let forceKill;
    child.stdout.on("data", (chunk) => {
      if (options.capture !== false) stdout.push(chunk);
      options.onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (options.capture !== false) stderr.push(chunk);
      options.onStderr?.(chunk);
    });
    const abort = () => {
      terminateProcessTree(child);
      forceKill = setTimeout(
        () => terminateProcessTree(child, "SIGKILL"),
        options.terminationGraceMilliseconds ?? 5_000,
      );
      forceKill.unref();
    };
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
      if (forceKill !== undefined) clearTimeout(forceKill);
      options.signal?.removeEventListener("abort", abort);
      rejectPromise(error);
    });
    child.once("close", (status, signal) => {
      if (forceKill !== undefined) clearTimeout(forceKill);
      options.signal?.removeEventListener("abort", abort);
      resolvePromise({
        status: status ?? 1,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function mapConcurrent(items, limit, worker) {
  const concurrency = Math.max(1, Math.min(positiveInteger(limit, "limit"), items.length));
  if (items.length === 0) return [];
  const results = new Array(items.length);
  const controller = new AbortController();
  let next = 0;
  let firstError;
  async function runWorker() {
    while (firstError === undefined) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index, controller.signal);
      } catch (error) {
        if (firstError === undefined) {
          firstError = error;
          controller.abort();
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runWorker));
  if (firstError !== undefined) throw firstError;
  return results;
}

module.exports = {
  buildJobs,
  hostParallelism,
  mapConcurrent,
  nativeKernelJobs,
  positiveInteger,
  runBufferedCommand,
  terminateProcessTree,
};
