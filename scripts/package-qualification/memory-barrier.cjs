"use strict";

// Qualification-only synchronization: retain the real subject at its exit
// boundary until an external process-table sample has observed it. In
// particular, retaining just its supervisor is not a memory observation.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { isMainThread } = require("node:worker_threads");
// A ready marker can appear during one 15-second CIM scan and needs the next
// complete scan to authenticate it. Allow both scan deadlines plus scheduling
// headroom, within the existing 180-second package-subject timeout.
const MAX_WAIT_MS = 35000;

function validate(options) {
  if (!options || !path.isAbsolute(options.directory || "") ||
      !/^[a-f0-9-]{36}$/.test(options.token || "") ||
      !Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > MAX_WAIT_MS ||
      !fs.lstatSync(options.directory).isDirectory() || fs.lstatSync(options.directory).isSymbolicLink()) {
    throw new Error("invalid qualification memory barrier");
  }
  return options;
}

function ready(options) {
  return fs.readdirSync(options.directory).filter((name) => /^[1-9][0-9]*-[a-f0-9-]{36}\.ready$/.test(name))
    .map((name) => {
      const filename = path.join(options.directory, name);
      if (!fs.lstatSync(filename).isFile() || fs.lstatSync(filename).isSymbolicLink() ||
          fs.readFileSync(filename, "utf8") !== options.token) {
        throw new Error("invalid qualification memory barrier marker");
      }
      return { name, pid: Number(name.slice(0, name.indexOf("-"))) };
    });
}

function createExitBarrier({ timeoutMs = MAX_WAIT_MS } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_WAIT_MS) {
    throw new Error("invalid qualification memory barrier timeout");
  }
  const options = validate({
    directory: fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-memory-barrier-")),
    token: randomUUID(), timeoutMs,
  });
  return {
    options,
    ready: () => ready(options),
    acknowledge(markers, observedPids) {
      const observed = new Set(observedPids);
      for (const marker of markers) {
        if (!observed.has(marker.pid)) continue;
        fs.writeFileSync(path.join(options.directory, marker.name + ".ack"), options.token);
      }
    },
    dispose() { fs.rmSync(options.directory, { recursive: true, force: true }); },
  };
}

function verifyChildObservation(options, pid) {
  validate(options);
  const markers = ready(options).filter((marker) => marker.pid === pid);
  if (markers.length !== 1) throw new Error("real qualification subject did not enter its memory barrier");
  const filename = path.join(options.directory, markers[0].name);
  if (fs.existsSync(filename + ".failed") || !fs.existsSync(filename + ".ack") ||
      fs.readFileSync(filename + ".ack", "utf8") !== options.token) {
    throw new Error("real qualification subject was not observed before exit");
  }
}

function installExitBarrier(options) {
  validate(options);
  const filename = path.join(options.directory, `${process.pid}-${randomUUID()}.ready`);
  const pause = new Int32Array(new SharedArrayBuffer(4));
  process.once("exit", () => {
    try {
      fs.writeFileSync(filename, options.token, { flag: "wx" });
      const deadline = process.hrtime.bigint() + BigInt(options.timeoutMs) * 1000000n;
      while (process.hrtime.bigint() < deadline) {
        if (fs.existsSync(filename + ".ack") &&
            fs.readFileSync(filename + ".ack", "utf8") === options.token) return;
        Atomics.wait(pause, 0, 0, 10);
      }
      fs.writeFileSync(filename + ".failed", "collector did not observe the real subject");
      process.stderr.write("qualification memory barrier timed out\n");
      process.exitCode = 70;
    } catch (error) {
      process.stderr.write(`qualification memory barrier failed: ${error.message}\n`);
      process.exitCode = 70;
    }
  });
}

// Worker isolates share their parent's PID and must never wait here: kernel
// close must remain free to join them before the process reaches its barrier.
if (isMainThread && process.env.SAGEJS_SUBJECT_MEMORY_BARRIER) {
  const options = JSON.parse(process.env.SAGEJS_SUBJECT_MEMORY_BARRIER);
  delete process.env.SAGEJS_SUBJECT_MEMORY_BARRIER;
  installExitBarrier(options);
}

module.exports = { createExitBarrier, verifyChildObservation, validate };
