"use strict";

// Sequential fresh processes: benchmark systems never compete with each other.
const { spawnSync, execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { readFileSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "../../..");
const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  const separator = arg.indexOf("=");
  if (!arg.startsWith("--") || separator < 0) throw new Error("use --key=value options");
  return [arg.slice(2, separator), arg.slice(separator + 1)];
}));
const levels = (options.levels || "389,1009,2003").split(",").map(Number);
const systems = (options.systems || "sagejs,sage").split(",");
const workload = options.workload || "decomposition";
const samples = Number(options.samples || 3);
const timeout = 1000 * Number(options.timeout || 300);
const report = [];
function record(value) {
  report.push(value);
  console.log(JSON.stringify(value));
  if (options.output) writeFileSync(options.output, JSON.stringify(report, null, 2) + "\n");
}
if (!levels.every(n => Number.isSafeInteger(n) && n > 1)
    || !Number.isSafeInteger(samples) || samples < 1
    || !Number.isFinite(timeout) || timeout <= 0) throw new Error("invalid benchmark bounds");
record({ host: { platform: os.platform(), architecture: os.arch(),
  cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, memory: os.totalmem() },
  revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceSha256: Object.fromEntries(["src/baselib/modular.py", "src/lib/sagejs/modular_abelian_varieties/abelian_variety.py", "src/lib/sagejs/modular_forms/newforms.py"].map(file => [file, createHash("sha256").update(readFileSync(path.join(root, file))).digest("hex")])),
  levels, systems, workload, samples, timeoutSeconds: timeout / 1000,
  policy: "fresh process and parent; unrelated J0(11) warmup; default native backends; wall times exclude interpreter startup" });
const expected = new Map();
for (const level of levels) for (let sample = 0; sample < samples; sample++) for (const system of systems) {
  const command = system === "sagejs" ? process.execPath : (options.sage || "sage");
  const args = system === "sagejs"
    ? [path.join(__dirname, "performance-sagejs.cjs"), String(level), workload]
    : ["-python", path.join(__dirname, "performance-sage.py"), String(level), workload];
  if (!["sagejs", "sage"].includes(system)) throw new Error("unknown system");
  record({ running: { system, level, sample } });
  const child = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout,
    maxBuffer: 32 * 1024 * 1024 });
  const records = (child.stdout || "").trim().split("\n").filter(line => line.startsWith("{")).map(line => JSON.parse(line));
  const result = { system, level, sample, status: child.status, signal: child.signal,
    error: child.error?.message, records };
  record(result);
  if (child.error?.code === "ETIMEDOUT") continue;
  if (child.status !== 0) throw new Error(child.stderr || child.error?.message || "benchmark failed");
  const observed = {};
  for (const record of records) for (const key of ["dimension", "factors", "map_shape", "hecke2_coefficients"]) {
    if (key in record) observed[key] = record[key];
  }
  if (expected.has(level)) assert.deepEqual(observed, expected.get(level), `exact result mismatch at N=${level}`);
  else expected.set(level, observed);
}
