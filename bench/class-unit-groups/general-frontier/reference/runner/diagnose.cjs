"use strict";

// Local instrumented diagnostics. Never accepted as controlled timing evidence.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../../../../..");
const script = path.resolve(__dirname, "../sagejs-diagnostic.py");
const cases = [
  { id: "real-cubic-49", coefficients: ["1", "-2", "-1", "1"] },
  { id: "mixed-quartic-283", coefficients: ["-1", "-1", "0", "0", "1"] },
  { id: "real-quartic-725", coefficients: ["1", "1", "-3", "-1", "1"] },
];

function parse(stdout) {
  const lines = stdout.split(/\r?\n/);
  const results = lines.filter((line) => line.startsWith("FRONTIER_RESULT|"));
  if (results.length > 1) throw new Error("multiple terminal results");
  return {
    result: results.length ? JSON.parse(results[0].slice("FRONTIER_RESULT|".length)) : null,
    progress: lines.filter((line) => line.startsWith("FRONTIER_PROGRESS|"))
      .map((line) => JSON.parse(line.slice("FRONTIER_PROGRESS|".length))),
    phases: lines.filter((line) => line.startsWith("FRONTIER_PHASE|")),
  };
}

if (require.main === module) {
  const [output, selected = "all", seconds = "120", casesFile] = process.argv.slice(2);
  if (!output || !/^[1-9][0-9]*$/.test(seconds) || Number(seconds) > 600) {
    throw new Error("usage: node diagnose.cjs OUTPUT_DIRECTORY [CASE_ID|all] [1..600 seconds] [CASES_JSON]");
  }
  const available = casesFile ? JSON.parse(fs.readFileSync(casesFile, "utf8"))
    .map(({ label, coefficients }) => ({ id: label, coefficients })) : cases;
  for (const entry of available) {
    if (!/^[a-z0-9.-]+$/.test(entry.id) || !Array.isArray(entry.coefficients)
      || entry.coefficients.length < 3 || entry.coefficients.length > 11
      || entry.coefficients.some((c) => typeof c !== "string" || !/^(?:0|-?[1-9][0-9]*)$/.test(c))
      || entry.coefficients.at(-1) !== "1") throw new Error("invalid diagnostic case");
  }
  const records = available.filter((entry) => selected === "all" || selected === entry.id);
  if (!records.length) throw new Error("unknown diagnostic case");
  fs.mkdirSync(output, { recursive: true });
  for (const record of records) {
    const destination = path.join(output, `${record.id}.json`);
    if (fs.existsSync(destination)) throw new Error(`refusing to overwrite ${destination}`);
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const sourceStatus = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" });
    const hashes = {};
    for (const filename of [script, __filename, path.join(__dirname, "supervise.py"),
      path.join(root, "bin/sagejs-source.cjs"), path.join(root, "dist/build-receipt.json")]) {
      hashes[path.relative(root, filename)] = crypto.createHash("sha256")
        .update(fs.readFileSync(filename)).digest("hex");
    }
    const run = spawnSync("python3", [
      path.join(__dirname, "supervise.py"), seconds,
      process.execPath, path.join(root, "bin/sagejs-source.cjs"), "--sage", script,
    ], {
      cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, SAGEJS_FRONTIER_COEFFICIENTS: JSON.stringify(record.coefficients) },
    });
    let decoded;
    try { decoded = parse(run.stdout || ""); }
    catch (error) { decoded = { parse_error: String(error), result: null }; }
    const receipt = {
      schema: "sagejs.general-class-unit-local-diagnostic.v1",
      controlled_timing: false,
      memory_cap_enforced: false,
      runtime_source_correspondence_authenticated: false,
      launcher: "explicit-source-launcher",
      node_version: process.version,
      source_commit: sourceCommit,
      source_status_before: sourceStatus,
      artifact_hashes_before: hashes,
      usage_scope: "reaped-child rusage; not aggregate tree peak",
      maximum_rss_unit: process.platform === "darwin" ? "bytes" : "KiB",
      timeout_teardown_allowance_seconds: 5,
      created_at: new Date().toISOString(),
      case: record, external_wall_cap_seconds: Number(seconds),
      status: (run.stderr || "").includes("FRONTIER_SUPERVISOR|timeout") ? "timeout"
        : run.status !== 0 || !decoded.result ? "error"
          : decoded.result.complete ? "complete" : "incomplete",
      exit_code: run.status, error: run.error ? String(run.error) : null,
      ...decoded, stdout: run.stdout, stderr: run.stderr,
    };
    fs.writeFileSync(destination, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ id: record.id, status: receipt.status,
      context_seconds: decoded.result?.context_elapsed_seconds,
      usage: (run.stderr || "").split(/\r?\n/).filter((line) => line.startsWith("FRONTIER_USAGE|")),
      output: destination }));
  }
}

module.exports = { parse, cases };
