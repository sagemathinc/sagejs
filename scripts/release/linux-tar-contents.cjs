"use strict";

// XZ is a maintained controller tool, never a new runtime/user dependency.
// It receives a read-only stdin descriptor and can only emit a tar stream.
const fs = require("node:fs");
const { spawn, execFileSync } = require("node:child_process");
const { validateLinuxTarStream } = require("../package-qualification/archive-validator.cjs");
function decoderEnvironment() {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !["XZ_OPT", "XZ_DEFAULTS"].includes(key.toUpperCase()))), LC_ALL: "C" };
}
function requireXz() {
  try {
    const version = execFileSync("xz", ["--version"], { encoding: "utf8", timeout: 5000, maxBuffer: 4096, windowsHide: true, env: decoderEnvironment(), stdio: ["ignore", "pipe", "pipe"] });
    const matched = /^xz \(XZ Utils\) (\d+\.\d+\.\d+)\r?\nliblzma (\d+\.\d+\.\d+)\r?\n$/.exec(version);
    if (!matched) throw new Error("unrecognized decoder");
    return { command: "xz", version: matched[1], libraryVersion: matched[2] };
  } catch { throw new Error("publication controller requires maintained XZ Utils (xz on PATH); no artifacts were decoded"); }
}
async function inspectLinuxTarXz(filename, platform, { signal } = {}) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000);
  signal.throwIfAborted();
  if (!["linux-x64", "linux-arm64"].includes(platform)) throw new Error("canonical Linux archive platform required");
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > 2 * 1024 ** 3) throw new Error("XZ input must be an ordinary bounded file");
  const fd = fs.openSync(filename, "r");
  let child, completion, closed = false, processError;
  const stop = () => {
    if (!closed) child?.kill("SIGKILL");
    child?.stdout.destroy(signal.reason ?? processError);
  };
  try {
    child = spawn("xz", ["--decompress", "--stdout", "--format=xz", "--threads=1", "--memlimit-decompress=128MiB"],
      { stdio: [fd, "pipe", "pipe"], windowsHide: true, env: decoderEnvironment() });
    completion = new Promise((resolve) => child.once("close", (code, exitSignal) => { closed = true; resolve({ code, signal: exitSignal }); }));
    child.once("error", (error) => { processError = error; child.stdout.destroy(error); });
    let stderrBytes = 0;
    child.stderr.on("data", (bytes) => {
      stderrBytes += bytes.length;
      if (stderrBytes > 16384) { processError = new Error("XZ diagnostics exceed bounds"); stop(); }
    });
    child.stderr.on("error", (error) => { processError = error; stop(); });
    signal.addEventListener("abort", stop, { once: true });
    const result = await validateLinuxTarStream(child.stdout, platform, { signal });
    const exit = await completion;
    signal.throwIfAborted();
    if (processError || exit.code !== 0) throw new Error("XZ decoding did not complete successfully");
    return result;
  } finally {
    signal.removeEventListener("abort", stop);
    if (!closed) stop();
    if (completion) await completion;
    fs.closeSync(fd);
  }
}
module.exports = { inspectLinuxTarXz, requireXz, decoderEnvironment };
