#!/usr/bin/env node
"use strict";

const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const source = readFileSync(
  join(__dirname, "character-modular-symbols.sage"),
  "utf8",
);
const defaultSage = existsSync("/home/user/bin/sagelite")
  ? "/home/user/bin/sagelite"
  : "/opt/cocalc-webdev-python/bin/sage";
const sage = process.env.SAGELITE_SAGE || defaultSage;
const magma = process.env.MAGMA || "/home/user/bin/magma";
const json = process.argv.includes("--json");
const large = process.argv.includes("--large");
const levels = large ? [1201, 4001] : [1201];
const fingerprintModulus = 1000000007;

const expected = new Map([
  ["character-quadratic-space-1201", 100],
  ["character-quadratic-cusp-1201", 98],
  ["character-quadratic-t2-1201", 1000000005],
  ["character-order5-space-1201", 100],
  ["character-order5-cusp-1201", 98],
  ["character-order5-t2-1201", 61],
  ["character-order36-weight5-space-37", 26],
  ["character-order36-weight5-cusp-37", 24],
  ["character-order36-weight5-t2-37", 90480093],
  ["character-order36-weight5-charpoly-37", 24],
]);
if (large) {
  expected.set("character-quadratic-space-4001", 334);
  expected.set("character-quadratic-cusp-4001", 332);
  expected.set("character-quadratic-t2-4001", 1000000001);
  expected.set("character-order5-space-4001", 334);
  expected.set("character-order5-cusp-4001", 332);
  expected.set("character-order5-t2-4001", 176);
}

function parseOutput(label, output) {
  const cases = new Map();
  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== "RESULT") continue;
    const [, operation, sample, elapsed, answer] = fields;
    const entry = cases.get(operation) || { samples: [], answers: [] };
    entry.samples.push(Number(elapsed));
    entry.answers.push(Number(answer));
    entry.sampleIds ||= [];
    entry.sampleIds.push(Number(sample));
    cases.set(operation, entry);
  }
  if (cases.size === 0) {
    throw new Error(`${label} did not produce benchmark results`);
  }
  return cases;
}

function execute(label, command, args, input) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input,
    maxBuffer: 64 * 1024 * 1024,
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
  return { available: true, cases: parseOutput(label, result.stdout) };
}

function sageProgram() {
  return `BENCH_LEVELS = [${levels.join(", ")}]\n${source}\n`;
}

function executeSageScript(label, command, prefixArgs = []) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-character-bench-"));
  const filename = join(directory, "benchmark.sage");
  try {
    writeFileSync(filename, sageProgram());
    return execute(label, command, [...prefixArgs, filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function magmaProgram() {
  return [
    "SetSeed(1);",
    `fingerprintModulus := ${fingerprintModulus};`,
    `for N in [${levels.join(", ")}] do`,
    "  G := DirichletGroup(N);",
    "  chi := G.1;",
    "  t := Cputime(); M := ModularSymbols(chi, 2, 1); elapsed := Cputime(t);",
    '  printf "RESULT character-quadratic-space-%o 0 %.9o %o\\n", N, elapsed, Dimension(M);',
    "  t := Cputime(); S := CuspidalSubspace(M); elapsed := Cputime(t);",
    '  printf "RESULT character-quadratic-cusp-%o 0 %.9o %o\\n", N, elapsed, Dimension(S);',
    "  t := Cputime(); T := HeckeOperator(S, 2); elapsed := Cputime(t);",
    "  fingerprint := (Integers() ! Trace(T)) mod fingerprintModulus;",
    '  printf "RESULT character-quadratic-t2-%o 0 %.9o %o\\n", N, elapsed, fingerprint;',
    "  K<z> := CyclotomicField(5);",
    "  H := DirichletGroup(N, K);",
    "  eps := H.1^2;",
    "  t := Cputime(); A := ModularSymbols(eps, 2, 1); elapsed := Cputime(t);",
    '  printf "RESULT character-order5-space-%o 0 %.9o %o\\n", N, elapsed, Dimension(A);',
    "  t := Cputime(); C := CuspidalSubspace(A); elapsed := Cputime(t);",
    '  printf "RESULT character-order5-cusp-%o 0 %.9o %o\\n", N, elapsed, Dimension(C);',
    "  t := Cputime(); U := HeckeOperator(C, 2); elapsed := Cputime(t);",
    "  f := MinimalPolynomial(Trace(U));",
    "  fingerprint := (Integers() ! Evaluate(f, 2)) mod fingerprintModulus;",
    '  printf "RESULT character-order5-t2-%o 0 %.9o %o\\n", N, elapsed, fingerprint;',
    "end for;",
    "K36<z36> := CyclotomicField(36);",
    "G36 := DirichletGroup(37, K36); chi36 := G36.1;",
    "t := Cputime(); D := ModularSymbols(chi36, 5, 0); elapsed := Cputime(t);",
    'printf "RESULT character-order36-weight5-space-37 0 %.9o %o\\n", elapsed, Dimension(D);',
    "t := Cputime(); DS := CuspidalSubspace(D); elapsed := Cputime(t);",
    'printf "RESULT character-order36-weight5-cusp-37 0 %.9o %o\\n", elapsed, Dimension(DS);',
    "t := Cputime(); DT := HeckeOperator(DS, 2); elapsed := Cputime(t);",
    "df := MinimalPolynomial(Trace(DT));",
    "dfingerprint := (Integers() ! Evaluate(df, 2)) mod fingerprintModulus;",
    'printf "RESULT character-order36-weight5-t2-37 0 %.9o %o\\n", elapsed, dfingerprint;',
    "t := Cputime(); Df := CharacteristicPolynomial(DT); elapsed := Cputime(t);",
    'printf "RESULT character-order36-weight5-charpoly-37 0 %.9o %o\\n", elapsed, Degree(Df);',
    "quit;",
    "",
  ].join("\n");
}

const runtimes = [
  {
    name: "Sage.js",
    result: executeSageScript("Sage.js", process.execPath, [sagejs]),
  },
  {
    name: "SageMath",
    result: executeSageScript("SageMath", sage, ["-q"]),
  },
  {
    name: "Magma",
    result: execute("Magma", magma, [], magmaProgram()),
  },
];

const rows = [];
let correct = true;
for (const runtime of runtimes) {
  if (!runtime.result.available) continue;
  runtime.result.missing = [...expected.keys()].filter(
    (operation) => !runtime.result.cases.has(operation),
  );
  correct &&= runtime.result.missing.length === 0;
  for (const [operation, entry] of runtime.result.cases) {
    const wanted = expected.get(operation);
    const answersAgree = entry.answers.every((answer) => answer === wanted);
    correct &&= answersAgree;
    rows.push({
      operation,
      runtime: runtime.name,
      seconds: entry.samples[0],
      answer: entry.answers[0],
      expected: wanted,
      correct: answersAgree,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  profile: large ? "large" : "default",
  levels,
  correct,
  semantics: {
    "character-*-space-*": "construct the sign +1 character space",
    "character-*-cusp-*": "construct its exact cuspidal subspace",
    "character-*-t2-*":
      "construct T2; answer is a Galois-invariant trace fingerprint",
  },
  runtimes: runtimes.map(({ name, result }) => ({
    name,
    available: result.available,
    reason: result.reason,
    missing: result.missing,
  })),
  rows,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    "operation runtime".padEnd(50),
    "elapsed".padStart(12),
    "answer".padStart(11),
    "status".padStart(9),
  );
  console.log("-".repeat(84));
  for (const row of rows) {
    console.log(
      `${row.operation.padEnd(35)} ${row.runtime.padEnd(12)}`.padEnd(50),
      `${(row.seconds * 1000).toFixed(2)} ms`.padStart(12),
      String(row.answer).padStart(11),
      (row.correct ? "correct" : "WRONG").padStart(9),
    );
  }
  console.log();
  for (const runtime of report.runtimes) {
    if (!runtime.available) {
      console.log(`${runtime.name}: unavailable — ${runtime.reason}`);
    } else if (runtime.missing?.length) {
      console.log(`${runtime.name}: MISSING — ${runtime.missing.join(", ")}`);
    }
  }
  console.log(`\ncorrectness: ${correct ? "PASS" : "FAIL"}`);
}

if (!correct) process.exitCode = 1;
