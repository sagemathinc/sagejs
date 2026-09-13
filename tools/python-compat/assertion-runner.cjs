"use strict";

const { spawn, spawnSync } = require("node:child_process");
const { isAbsolute, join } = require("node:path");
const { performance } = require("node:perf_hooks");
const { normalizeOutput, executionBytes } = require("./evidence.cjs");

// Resource bounds for reviewed, no-subprocess assertion programs. Process-tree
// cleanup is defense in depth, NOT an isolation boundary for untrusted code.
async function executeAssertion(command, args, { cwd, env, timeoutMs, maxOutputBytes }) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    throw new TypeError("an explicit clean environment is required");
  }
  for (const [name, value] of Object.entries({ timeoutMs, maxOutputBytes })) {
    if (!Number.isSafeInteger(value) || value <= 0 ||
        (name === "timeoutMs" && value > 2_147_483_647)) {
      throw new RangeError(`${name} must be a positive bounded integer`);
    }
  }
  const started = performance.now();
  return new Promise((resolve) => {
    let child, timeout, fallback;
    let finished = false, terminating = false;
    let status = null, signal = null, error = null;
    let timedOut = false, outputLimited = false, captured = 0;
    const chunks = { stdout: [], stderr: [], output: [] };
    const recordError = (failure) => {
      error ??= { code: failure.code ?? null, message: failure.message || String(failure) };
    };

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(fallback);
      const text = {}, raw = {};
      for (const name of Object.keys(chunks)) {
        const bytes = Buffer.concat(chunks[name]);
        text[name] = normalizeOutput(bytes.toString("utf8"));
        raw[name] = bytes.toString("base64");
      }
      resolve({ status, signal, timedOut, outputLimited, error, ...text, raw,
        durationMs: performance.now() - started });
    }

    function killPosixGroup() {
      if (!child?.pid) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (failure) {
        if (failure.code !== "ESRCH") recordError(failure);
      }
    }

    function terminate() {
      if (terminating || finished) return;
      terminating = true;
      if (child?.pid) {
        if (process.platform !== "win32") {
          killPosixGroup();
        } else {
          // Resolve the host utility independently of the test's PATH/env.
          const systemRoot = process.env.SystemRoot || process.env.WINDIR;
          if (!systemRoot || !isAbsolute(systemRoot)) {
            recordError(new Error("absolute Windows SystemRoot is required for tree cleanup"));
          } else {
            const killed = spawnSync(join(systemRoot, "System32", "taskkill.exe"),
              ["/pid", String(child.pid), "/t", "/f"],
              { shell: false, windowsHide: true, timeout: 1000, maxBuffer: 65536,
                env: { SystemRoot: systemRoot }, encoding: "utf8" });
            if (killed.error) recordError(killed.error);
            // Exit 128 also occurs when the process finished during cleanup.
            else if (killed.status !== 0 && killed.status !== 128) {
              recordError(new Error(`taskkill exited ${killed.status}`));
            }
          }
          child.kill("SIGKILL");
        }
      }
      fallback = setTimeout(() => {
        recordError(new Error("process pipes did not close after termination"));
        child?.stdout?.destroy();
        child?.stderr?.destroy();
        child?.unref();
        finish();
      }, 1000);
    }

    function capture(name, chunk) {
      if (finished) return;
      const remaining = maxOutputBytes - captured;
      if (remaining > 0) {
        // Copy the retained prefix so a tiny budget cannot retain a giant chunk.
        const kept = Buffer.from(chunk.subarray(0, remaining));
        chunks[name].push(kept);
        chunks.output.push(kept);
        captured += kept.length;
      }
      if (chunk.length > remaining) {
        outputLimited = true;
        terminate();
      }
    }

    try {
      child = spawn(command, args, { cwd, env: { ...env }, shell: false,
        detached: process.platform !== "win32", windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"] });
      child.once("error", (failure) => { recordError(failure); });
      child.once("exit", (code, childSignal) => {
        status = code;
        signal = childSignal;
        // A descendant retaining a pipe must not prolong an otherwise finished
        // POSIX case. Windows requires the reviewed no-subprocess contract;
        // taskkill is used while the parent still exists on timeout/overflow.
        if (process.platform !== "win32") killPosixGroup();
      });
      child.once("close", (code, childSignal) => {
        status = code;
        signal = childSignal;
        finish(); // 'close', not 'exit': drain both streams before recording.
      });
      for (const name of ["stdout", "stderr"]) {
        child[name].on("data", (chunk) => capture(name, chunk));
        child[name].on("error", (failure) => { recordError(failure); terminate(); });
      }
      timeout = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    } catch (failure) {
      recordError(failure);
      finish();
    }
  });
}

function failureKind(execution) {
  if (execution.error) return "launch-error";
  if (execution.outputLimited) return "output-limit";
  if (execution.timedOut) return "timeout";
  if (execution.status !== 0 || execution.signal) return "assertion-failure";
  if (["stdout", "stderr", "output"].some((name) => executionBytes(execution, name).length)) {
    return "unexpected-output";
  }
  return "pass";
}

function classifyAssertion(oracle, subject) {
  if (!oracle || failureKind(oracle) !== "pass") return "oracle-error";
  // The caller uses this result to decide whether to launch the subject at all.
  if (!subject) return "subject-required";
  return failureKind(subject);
}

module.exports = { executeAssertion, classifyAssertion };
