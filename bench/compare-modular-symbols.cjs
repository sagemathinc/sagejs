"use strict";

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(__dirname, "modular-symbols.sage");
const sagejs = join(root, "bin", "sagejs");
const defaultSage = existsSync("/home/user/bin/sagelite")
  ? "/home/user/bin/sagelite"
  : "/opt/cocalc-webdev-python/bin/sage";
const sage = process.env.SAGELITE_SAGE || defaultSage;
const gp = process.env.PARI_GP || "gp";
const json = process.argv.includes("--json");

const expected = new Map([
  ["p1-100000", 180000],
  ["p1-1000000", 1800000],
  ["manin-modp-389", 65],
  ["manin-modp-1000", 301],
  ["modsym-qq-389", 65],
  ["modsym-qq-1000", 301],
]);

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function parseOutput(label, output) {
  const cases = new Map();
  const skips = new Map();
  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] === "RESULT") {
      const [, operation, sample, elapsed, answer] = fields;
      const entry = cases.get(operation) || { samples: [], answers: [] };
      entry.samples.push(Number(elapsed));
      entry.answers.push(Number(answer));
      entry.sampleIds ||= [];
      entry.sampleIds.push(Number(sample));
      cases.set(operation, entry);
    } else if (fields[0] === "SKIP") {
      skips.set(fields[1], fields.slice(2).join(" "));
    }
  }
  if (cases.size === 0) {
    throw new Error(`${label} did not produce benchmark results`);
  }
  return { cases, skips };
}

function execute(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    ...options,
  });
  if (result.error?.code === "ENOENT") {
    return { available: false, reason: `${command} is not installed` };
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${label} exited with status ${result.status}`);
  }
  return { available: true, ...parseOutput(label, result.stdout) };
}

function executePari() {
  const program = [
    "default(parisizemax, 4G);",
    "msinit(11,2);",
    "for(i=1,2, N=[389,1000][i]; " +
      "for(sample=0,2, t=getwalltime(); M=msinit(N,2); " +
      'print("RESULT modsym-qq-",N," ",sample," ",' +
      '(getwalltime()-t)/1000.0," ",msdim(M))));',
    "quit;",
    "",
  ].join("\n");
  return execute("PARI/GP", gp, ["-q", "-f"], { input: program });
}

const runtimes = [
  {
    name: "Sage.js",
    result: execute("Sage.js", process.execPath, [sagejs, source]),
  },
  {
    name: "SageMath",
    result: execute("SageMath", sage, [source]),
  },
  { name: "PARI/GP", result: executePari() },
  {
    name: "eclib",
    result: {
      available: false,
      reason:
        "not applicable to these public operations; eclib targets " +
        "weight-2 newform and elliptic-curve workflows",
    },
  },
];

const rows = [];
let correct = true;
for (const runtime of runtimes) {
  if (!runtime.result.available) continue;
  for (const [operation, entry] of runtime.result.cases) {
    const wanted = expected.get(operation);
    const answersAgree = entry.answers.every((answer) => answer === wanted);
    correct &&= answersAgree;
    rows.push({
      operation,
      runtime: runtime.name,
      medianSeconds: median(entry.samples),
      samples: entry.samples.length,
      answer: entry.answers[0],
      expected: wanted,
      correct: answersAgree,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  correct,
  semantics: {
    "p1-*": "canonical P1List construction with indexed representatives",
    "manin-modp-*":
      "weight-2 Gamma0 S/R relation quotient over GF(65521)",
    "modsym-qq-*": "full weight-2 Gamma0 modular-symbol space over Q",
  },
  runtimes: runtimes.map(({ name, result }) => ({
    name,
    available: result.available,
    reason: result.reason,
    skipped: result.skips ? Object.fromEntries(result.skips) : undefined,
  })),
  rows,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    "operation runtime".padEnd(38),
    "median".padStart(12),
    "answer".padStart(9),
    "status".padStart(9),
  );
  console.log("-".repeat(72));
  for (const row of rows) {
    console.log(
      `${row.operation.padEnd(23)} ${row.runtime.padEnd(12)}`.padEnd(38),
      `${(row.medianSeconds * 1000).toFixed(2)} ms`.padStart(12),
      String(row.answer).padStart(9),
      (row.correct ? "correct" : "WRONG").padStart(9),
    );
  }
  console.log();
  for (const runtime of report.runtimes) {
    if (!runtime.available) {
      console.log(`${runtime.name}: unavailable — ${runtime.reason}`);
    }
  }
  console.log(`\ncorrectness: ${correct ? "PASS" : "FAIL"}`);
}

if (!correct) process.exitCode = 1;
