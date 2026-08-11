#!/usr/bin/env node
"use strict";

// Keep a native-cache lease alive while the owning process is blocked in a
// synchronous compiler or linker. This helper deliberately has no repository
// dependencies, so it remains usable during a fresh-clone bootstrap.

const { readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { hostname } = require("node:os");
const { join } = require("node:path");

const [lock, token, parentPidText, parentIdentity, intervalText] =
  process.argv.slice(2);
const parentPid = Number(parentPidText);
const interval = Number(intervalText);

if (
  !lock || !token || !Number.isInteger(parentPid) || parentPid <= 0 ||
  !parentIdentity || !Number.isInteger(interval) || interval <= 0
) {
  process.exit(2);
}

function linuxProcessIdentity(pid) {
  try {
    const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8").trim();
    const afterCommand = stat.slice(stat.lastIndexOf(") ") + 2).split(/\s+/);
    const startTicks = afterCommand[19];
    if (!boot || !startTicks) return null;
    return `${boot}:${startTicks}`;
  } catch {
    return null;
  }
}

function processIdentity(pid) {
  if (process.platform === "linux") {
    return linuxProcessIdentity(pid);
  }
  if (process.platform !== "win32") {
    const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const start = result.status === 0 ? result.stdout.trim() : "";
    return start ? `${hostname()}:${pid}:${start}` : null;
  }
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
  ], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const start = result.status === 0 ? result.stdout.trim() : "";
  return start ? `${hostname()}:${pid}:${start}` : null;
}

function beat() {
  try {
    const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8"));
    if (owner.token !== token || processIdentity(parentPid) !== parentIdentity) {
      process.exit(0);
    }
    writeFileSync(join(lock, "heartbeat"), `${new Date().toISOString()}\n`);
  } catch {
    process.exit(0);
  }
}

beat();
setInterval(beat, interval);
