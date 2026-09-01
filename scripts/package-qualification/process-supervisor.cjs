#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");

const [, , metadataPath, timeoutText, executable, ...args] = process.argv;
if (!metadataPath || !timeoutText || !executable) {
  throw new Error(
    "usage: process-supervisor.cjs METADATA TIMEOUT_MS EXECUTABLE [ARG ...]",
  );
}
const timeoutMs = Number(timeoutText);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
  throw new Error(`invalid timeout ${JSON.stringify(timeoutText)}`);
}

const input = readFileSync(0);
let child;
let childStatus = null;
let childSignal = null;
let childClosed = false;
let finished = false;
let timedOut = false;
let treeKillAttempted = false;
let treeKillError;
let spawnError;
let timeout;
let hardKill;
let closeFallback;

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
      treeKillAttempted,
      treeKillError: serializeError(treeKillError),
      spawnError: serializeError(spawnError),
    })}\n`,
  );
}

function killPosixGroup(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH" && !treeKillError) treeKillError = error;
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

function expire() {
  timedOut = true;
  treeKillAttempted = true;
  if (process.platform === "win32") {
    killWindowsTree();
    closeFallback = setTimeout(finish, 1_000);
    return;
  }

  killPosixGroup("SIGTERM");
  hardKill = setTimeout(() => {
    // Always address the whole group after the grace period. The immediate
    // child may have honored SIGTERM while one of its descendants ignored it.
    killPosixGroup("SIGKILL");
    if (childClosed) finish();
    else closeFallback = setTimeout(finish, 1_000);
  }, 250);
}

try {
  child = spawn(executable, args, {
    detached: process.platform !== "win32",
    env: process.env,
    stdio: ["pipe", "inherit", "inherit"],
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
    if (!timedOut) finish();
    else if (process.platform === "win32") finish();
    // POSIX waits for the unconditional group SIGKILL above.
  });
  child.stdin.on("error", (error) => {
    if (error.code !== "EPIPE" && !spawnError) spawnError = error;
  });
  child.stdin.end(input);
  timeout = setTimeout(expire, timeoutMs);
} catch (error) {
  spawnError = error;
  finish();
}
