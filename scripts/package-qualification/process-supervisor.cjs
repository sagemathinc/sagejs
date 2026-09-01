#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");

const [, , metadataPath, timeoutText, maxOutputText, executable, ...args] =
  process.argv;
if (!metadataPath || !timeoutText || !maxOutputText || !executable) {
  throw new Error(
    "usage: process-supervisor.cjs METADATA TIMEOUT_MS MAX_OUTPUT_BYTES " +
      "EXECUTABLE [ARG ...]",
  );
}
const timeoutMs = Number(timeoutText);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
  throw new Error(`invalid timeout ${JSON.stringify(timeoutText)}`);
}
const maxOutputBytes = Number(maxOutputText);
if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
  throw new Error(`invalid output limit ${JSON.stringify(maxOutputText)}`);
}

const input = readFileSync(0);
let child;
let childStatus = null;
let childSignal = null;
let childClosed = false;
let finished = false;
let timedOut = false;
let outputExceeded = false;
let terminating = false;
let treeKillAttempted = false;
let treeKillError;
let spawnError;
let timeout;
let hardKill;
let closeFallback;
const output = { stdout: [], stderr: [] };
let capturedBytes = 0;

function serializeError(error) {
  if (!error) return undefined;
  return {
    code: error.code,
    message: error.message || String(error),
    name: error.name,
  };
}

function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  clearTimeout(hardKill);
  clearTimeout(closeFallback);
  writeFileSync(
    metadataPath,
    `${JSON.stringify({
      status: childStatus,
      signal: childSignal,
      timedOut,
      outputExceeded,
      maxOutputBytes,
      stdout: Buffer.concat(output.stdout).toString("base64"),
      stderr: Buffer.concat(output.stderr).toString("base64"),
      treeKillAttempted,
      treeKillError: serializeError(treeKillError),
      spawnError: serializeError(spawnError),
    })}\n`,
  );
}

function killPosixGroup(signal) {
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (!treeKillError) treeKillError = error;
    return false;
  }
}

function killWindowsTree() {
  const result = spawnSync(
    "taskkill.exe",
    ["/pid", String(child.pid), "/t", "/f"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error) {
    treeKillError = result.error;
  } else if (result.status !== 0) {
    treeKillError = new Error(
      `taskkill exited ${result.status}: ${result.stderr || result.stdout || ""}`,
    );
  }
}

function terminateOwnedTree() {
  treeKillAttempted = true;
  if (process.platform === "win32") {
    killWindowsTree();
    closeFallback = setTimeout(finish, 1_000);
    return;
  }

  if (!killPosixGroup("SIGTERM")) {
    if (childClosed) finish();
    else closeFallback = setTimeout(finish, 1_000);
    return;
  }
  hardKill = setTimeout(() => {
    // Always address the whole group after the grace period. The immediate
    // child may have honored SIGTERM while one of its descendants ignored it.
    killPosixGroup("SIGKILL");
    if (childClosed) finish();
    else closeFallback = setTimeout(finish, 1_000);
  }, 250);
}

function expire() {
  if (terminating || finished) return;
  terminating = true;
  timedOut = true;
  terminateOwnedTree();
}

function exceedOutputLimit() {
  if (terminating || finished) return;
  terminating = true;
  outputExceeded = true;
  terminateOwnedTree();
}

function capture(stream, name) {
  stream.on("data", (chunk) => {
    const remaining = maxOutputBytes - capturedBytes;
    if (remaining > 0) {
      const kept = chunk.subarray(0, remaining);
      output[name].push(kept);
      capturedBytes += kept.length;
    }
    if (chunk.length > remaining) exceedOutputLimit();
  });
  stream.on("error", (error) => {
    if (!spawnError) spawnError = error;
    if (!terminating) {
      terminating = true;
      terminateOwnedTree();
    }
  });
}

function cleanPosixGroupAfterNormalExit() {
  treeKillAttempted = true;
  // The group leader has exited successfully, but descendants in the same
  // qualification-owned process group may still be alive. Drain the group
  // before reporting completion so a successful adapter cannot leak workers.
  if (!killPosixGroup("SIGTERM")) {
    finish();
    return;
  }
  hardKill = setTimeout(() => {
    killPosixGroup("SIGKILL");
    finish();
  }, 250);
}

try {
  child = spawn(executable, args, {
    detached: process.platform !== "win32",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.once("error", (error) => {
    spawnError = error;
    finish();
  });
  child.once("close", (status, signal) => {
    childStatus = status;
    childSignal = signal;
    childClosed = true;
    if (!terminating && process.platform !== "win32") {
      cleanPosixGroupAfterNormalExit();
    } else if (!terminating || process.platform === "win32" || !hardKill) {
      finish();
    }
    // POSIX waits for the unconditional group SIGKILL above.
  });
  child.stdin.on("error", (error) => {
    if (error.code !== "EPIPE" && !spawnError) spawnError = error;
  });
  capture(child.stdout, "stdout");
  capture(child.stderr, "stderr");
  child.stdin.end(input);
  timeout = setTimeout(expire, timeoutMs);
} catch (error) {
  spawnError = error;
  finish();
}
