"use strict";

const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { createInterface } = require("node:readline");

const { findNativeExecutable } = require("../bin/native-launcher.cjs");

const PROTOCOL = 1;

class SageSessionInterruptedError extends Error {
  constructor(message = "Sage.js evaluation interrupted") {
    super(message);
    this.name = "SageSessionInterruptedError";
  }
}

class SageSessionTimeoutError extends Error {
  constructor(message = "Sage.js evaluation timed out") {
    super(message);
    this.name = "SageSessionTimeoutError";
  }
}

class SageSessionClosedError extends Error {
  constructor(message = "Sage.js session is closed") {
    super(message);
    this.name = "SageSessionClosedError";
  }
}

function deserializeError(serialized = {}) {
  let error;
  if (serialized.name === "SageSessionInterruptedError") {
    error = new SageSessionInterruptedError(serialized.message);
  } else if (serialized.name === "SageSessionTimeoutError") {
    error = new SageSessionTimeoutError(serialized.message);
  } else if (serialized.name === "SageSessionClosedError") {
    error = new SageSessionClosedError(serialized.message);
  } else {
    error = new Error(serialized.message || "Sage.js evaluation failed");
    error.name = serialized.name || "Error";
  }
  if (serialized.stack) error.stack = serialized.stack;
  return error;
}

class SageSession extends EventEmitter {
  constructor({ mode = "sage", executable, kernelArguments = [] } = {}) {
    super();
    if (mode !== "sage" && mode !== "python") {
      throw new TypeError(`unknown Sage.js language mode ${JSON.stringify(mode)}`);
    }
    this.mode = mode;
    this.closed = false;
    this.nextId = 0;
    this.pending = new Map();
    this.stderr = "";
    this.executable = executable || findNativeExecutable({ executable: "sagejs" });
    this.kernelArguments = kernelArguments;
    if (!this.executable) {
      throw new Error(
        "Sage.js native runtime is unavailable for this installation. " +
          "Reinstall @sagemath/sagejs with optional dependencies enabled on " +
          "Linux x64/arm64, Apple Silicon macOS, or Windows x64.",
      );
    }
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.spawn();
  }

  spawn() {
    const arguments_ = [...this.kernelArguments, "--embedded-kernel"];
    if (this.mode === "python") arguments_.push("--python");
    const child = spawn(this.executable, arguments_, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: process.env,
    });
    this.child = child;
    this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.lines.on("line", (line) => this.receive(line));
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      this.stderr = (this.stderr + text).slice(-8192);
      this.emit("stderr", text, { evaluationId: undefined });
    });
    child.once("error", (error) => this.fail(error));
    child.once("exit", (code, signal) => {
      if (this.closed) return;
      this.fail(
        new Error(
          `Sage.js native kernel exited unexpectedly ` +
            `(code=${code ?? "none"}, signal=${signal ?? "none"})` +
            (this.stderr.trim() ? `:\n${this.stderr.trim()}` : ""),
        ),
      );
    });
  }

  receive(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (_error) {
      this.fail(new Error(`invalid response from Sage.js native kernel: ${line}`));
      return;
    }
    if (message.protocol !== PROTOCOL) {
      this.fail(
        new Error(`unsupported Sage.js native kernel protocol ${message.protocol}`),
      );
      return;
    }
    if (message.type === "ready") {
      this.readyResolve(this);
      this.emit("ready");
      return;
    }
    if (message.type === "protocol-error") {
      this.fail(deserializeError(message.error));
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (message.type === "stdout") {
      pending.output += message.text;
      pending.onOutput?.(message.text);
      this.emit("stdout", message.text, { evaluationId: message.id });
      return;
    }
    if (message.type !== "result") return;
    this.pending.delete(message.id);
    if (message.ok) {
      pending.resolve(
        pending.kind === "evaluate"
          ? { ...message.result, stdout: pending.output }
          : message.result,
      );
    } else {
      const error = deserializeError(message.error);
      pending.reject(error);
      this.emit("stderr", `${error.stack || error.message}\n`, {
        evaluationId: message.id,
      });
    }
  }

  fail(error) {
    this.readyReject(error);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    if (this.listenerCount("error")) this.emit("error", error);
  }

  async ready() {
    if (this.closed) throw new SageSessionClosedError();
    await this.readyPromise;
    return this;
  }

  async request(type, data = {}, kind = "request", onOutput) {
    if (this.closed) throw new SageSessionClosedError();
    await this.ready();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { kind, output: "", onOutput, resolve, reject });
      this.child.stdin.write(
        `${JSON.stringify({ protocol: PROTOCOL, id, type, ...data })}\n`,
        (error) => {
          if (!error) return;
          this.pending.delete(id);
          reject(error);
        },
      );
    });
  }

  evaluate(source, options = {}) {
    if (typeof source !== "string") {
      return Promise.reject(new TypeError("Sage.js source must be a string"));
    }
    const { filename = "<embedded>", timeout, language = this.mode, onOutput } =
      options;
    if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) {
      return Promise.reject(
        new TypeError("Sage.js timeout must be a positive number"),
      );
    }
    return this.request(
      "evaluate",
      { source, filename, timeout, language },
      "evaluate",
      onOutput,
    );
  }

  eval(source, options) {
    return this.evaluate(source, options);
  }

  complete(source, cursorPosition) {
    return this.request("complete", { source, cursorPosition });
  }

  inspect(source, cursorPosition) {
    return this.request("inspect", { source, cursorPosition });
  }

  documentation() {
    return this.request("documentation");
  }

  isComplete(source, { language = this.mode } = {}) {
    return this.request("isComplete", { source, language });
  }

  interrupt() {
    return this.request("interrupt");
  }

  reset() {
    return this.request("reset");
  }

  async close() {
    if (this.closed) return;
    try {
      await this.request("close");
    } finally {
      this.closed = true;
      this.lines?.close();
      this.child?.stdin.end();
      if (this.child && this.child.exitCode === null) this.child.kill();
      const error = new SageSessionClosedError();
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.removeAllListeners();
    }
  }
}

async function createSage(options) {
  return new SageSession(options).ready();
}

exports.SageSession = SageSession;
exports.SageSessionClosedError = SageSessionClosedError;
exports.SageSessionInterruptedError = SageSessionInterruptedError;
exports.SageSessionTimeoutError = SageSessionTimeoutError;
exports.createSage = createSage;
