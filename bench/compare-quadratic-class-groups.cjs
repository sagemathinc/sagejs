"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { performance } = require("node:perf_hooks");
const { join } = require("node:path");

const root = join(__dirname, "..");
const flint = require(join(root, "packages", "flint"));
const gp = process.env.PARI_GP || "gp";
const magma = process.env.MAGMA || "/home/user/bin/magma";
const json = process.argv.includes("--json");
const relationGroups = process.argv.includes("--narrow-relations");
const realCase = {
  discriminant: 10000001n,
  classNumber: 1n,
  narrowClassNumber: 2n,
};

const cases = [
  { discriminant: -10000019n, classNumber: 1275n, repetitions: 100 },
  { discriminant: -100000007n, classNumber: 7253n, repetitions: 20 },
  { discriminant: -1000000007n, classNumber: 26629n, repetitions: 5 },
];

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function nativeSamples(operation, testCase) {
  const evaluate = operation === "class-number"
    ? () => flint.qfbClassNumber(testCase.discriminant)
    : () => flint.qfbClassGroupData(testCase.discriminant).classNumber;
  const samples = [];
  let answer;
  answer = evaluate();
  for (let sample = 0; sample < 5; sample += 1) {
    const start = performance.now();
    for (let index = 0; index < testCase.repetitions; index += 1) {
      answer = evaluate();
    }
    samples.push(
      (performance.now() - start) /
        (1000 * testCase.repetitions),
    );
  }
  return { answer, samples };
}

function runExternal(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input,
  });
  if (result.error?.code === "ENOENT") {
    return { available: false, reason: `${command} is not installed` };
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${command} exited with status ${result.status}`);
  }
  const rows = [];
  for (const line of result.stdout.split("\n")) {
    const match = line.match(
      /RESULT\s+(\S+)\s+(-?\d+)\s+(\d+)\s+([0-9.]+(?:\s*[eE]\s*[+-]?\s*\d+)?)/,
    );
    if (!match) continue;
    rows.push({
      operation: match[1],
      discriminant: BigInt(match[2]),
      answer: BigInt(match[3]),
      seconds: Number(match[4].replace(/\s+/g, "")),
    });
  }
  return { available: true, rows };
}

function sagejsInvocation(args) {
  if (process.env.SAGEJS_TEST_EXECUTABLE) {
    return [process.env.SAGEJS_TEST_EXECUTABLE, args];
  }
  if (process.platform === "win32") {
    return [process.execPath, [join(root, "bin", "sagejs-source.cjs"), ...args]];
  }
  return [join(root, "bin", "sagejs"), args];
}

function realStreamingResult() {
  const [executable, arguments_] = sagejsInvocation(["--python", "-"]);
  const source = `
from sagejs.number_fields.quadratic_class_units import real_quadratic_class_number
import time
D = ${realCase.discriminant}
started = time.perf_counter()
ordinary = real_quadratic_class_number(D)
narrow = real_quadratic_class_number(D, narrow=True)
seconds = time.perf_counter() - started
print("RESULT_REAL", ordinary.order(), narrow.order(), ordinary.certificate.reduced_forms_checked, ordinary.plan.enumeration_checks, ordinary.materializes_all_reduced_forms, seconds)
`;
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input: source,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Sage.js real quadratic benchmark exited with status ${result.status}`);
  }
  const match = result.stdout.match(
    /RESULT_REAL\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(True|False)\s+([0-9.]+)/,
  );
  if (!match) throw new Error("Sage.js real quadratic benchmark emitted no result");
  return {
    discriminant: realCase.discriminant.toString(),
    classNumber: match[1],
    narrowClassNumber: match[2],
    reducedFormsChecked: Number(match[3]),
    preflightChecks: Number(match[4]),
    materializesAllReducedForms: match[5] === "True",
    seconds: Number(match[6]),
    semantics: "exact-unconditional streamed reduced-form cycle count",
  };
}

function realRelationGroupResults() {
  const [executable, arguments_] = sagejsInvocation(["--python", "-"]);
  const source = `
import time
x = polygen(QQ, "x")
for D, polynomial in ((12, x*x - 3), (60, x*x - 15)):
    field = NumberField(polynomial, "a")
    started = time.perf_counter()
    group = field.narrow_class_group(algorithm="buchmann-hecke")
    seconds = time.perf_counter() - started
    print("RESULT_NARROW_RELATIONS", D, list(group.invariants()), group.order(), group.proof_status, seconds)
`;
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input: source,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error("Sage.js narrow relation benchmark failed");
  }
  return result.stdout
    .split("\n")
    .map((line) => line.match(
      /RESULT_NARROW_RELATIONS\s+(\d+)\s+\[([^\]]*)\]\s+(\d+)\s+(\S+)\s+([0-9.]+)/,
    ))
    .filter(Boolean)
    .map((match) => ({
      discriminant: Number(match[1]),
      invariants: match[2]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(Number),
      order: Number(match[3]),
      proofStatus: match[4],
      seconds: Number(match[5]),
      semantics: "bounded authenticated augmented-relation SNF",
      materializesAllClasses: false,
    }));
}

function pariResults() {
  const lines = ["default(parisizemax, 1073741824);"];
  for (const testCase of cases) {
    const D = testCase.discriminant;
    const fastRepetitions = testCase.repetitions * 20;
    lines.push(`h=qfbclassno(${D});`);
    for (let sample = 0; sample < 5; sample += 1) {
      lines.push(
        `t=getwalltime();for(i=1,${fastRepetitions},` +
          `h=qfbclassno(${D}));` +
          `print("RESULT probable-shanks ${D} ",h," ",` +
          `(getwalltime()-t)/(1000.0*${fastRepetitions}));`,
      );
    }
    for (let sample = 0; sample < 3; sample += 1) {
      lines.push(
        `t=getwalltime();h=qfbclassno(${D},1);` +
          `print("RESULT analytic-proof ${D} ",h," ",` +
          `(getwalltime()-t)/1000.0);`,
      );
    }
  }
  lines.push("quit;", "");
  return runExternal(gp, ["-q", "-f", "-s", "256M"], lines.join("\n"));
}

function magmaResults() {
  if (!existsSync(magma)) {
    return { available: false, reason: `${magma} is not installed` };
  }
  const lines = ["SetSeed(1);"];
  for (const testCase of cases) {
    const D = testCase.discriminant;
    const repetitions = testCase.repetitions;
    lines.push(`h := ClassNumber(${D});`);
    for (let sample = 0; sample < 5; sample += 1) {
      lines.push(
        `t := Cputime(); for i in [1..${repetitions}] do ` +
          `h := ClassNumber(${D}); end for;`,
        `printf "RESULT middle-shanks ${D} %o %.12o\\n", ` +
          `h, Cputime(t)/${repetitions};`,
      );
    }
  }
  lines.push("quit;", "");
  return runExternal(magma, [], lines.join("\n"));
}

const rows = [];
for (const testCase of cases) {
  for (const [operation, semantics] of [
    ["class-number", "certified enumeration"],
    ["cyclic-structure", "certified enumeration + order proof"],
  ]) {
    const result = nativeSamples(operation, testCase);
    rows.push({
      runtime: "Sage.js/FLINT",
      operation,
      semantics,
      discriminant: testCase.discriminant,
      answer: result.answer,
      samples: result.samples,
    });
  }
}

const externals = [
  {
    runtime: "PARI/GP",
    result: pariResults(),
    semantics: {
      "probable-shanks": "probable Shanks",
      "analytic-proof": "analytic proof mode",
    },
  },
  {
    runtime: "Magma",
    result: magmaResults(),
    semantics: { "middle-shanks": "middle-range Shanks" },
  },
];
for (const external of externals) {
  if (!external.result.available) continue;
  const grouped = new Map();
  for (const row of external.result.rows) {
    const key = `${row.operation}:${row.discriminant}`;
    const entry = grouped.get(key) || { ...row, samples: [] };
    entry.samples.push(row.seconds);
    grouped.set(key, entry);
  }
  for (const entry of grouped.values()) {
    rows.push({
      runtime: external.runtime,
      operation: entry.operation,
      semantics: external.semantics[entry.operation],
      discriminant: entry.discriminant,
      answer: entry.answer,
      samples: entry.samples,
    });
  }
}

let correct = true;
for (const row of rows) {
  const testCase = cases.find(
    (entry) => entry.discriminant === row.discriminant,
  );
  row.correct = row.answer === testCase.classNumber;
  correct &&= row.correct;
  row.medianSeconds = median(row.samples);
}

const realQuadratic = realStreamingResult();
realQuadratic.correct =
  BigInt(realQuadratic.classNumber) === realCase.classNumber &&
  BigInt(realQuadratic.narrowClassNumber) === realCase.narrowClassNumber &&
  !realQuadratic.materializesAllReducedForms;
correct &&= realQuadratic.correct;
const narrowRelationGroups = relationGroups ? realRelationGroupResults() : [];
const expectedNarrowRelations = new Map([
  [12, "2"],
  [60, "2,2"],
]);
for (const row of narrowRelationGroups) {
  row.correct =
    row.invariants.join(",") === expectedNarrowRelations.get(row.discriminant) &&
    row.proofStatus === "exact-unconditional" &&
    !row.materializesAllClasses;
  correct &&= row.correct;
}

const report = {
  generatedAt: new Date().toISOString(),
  correct,
  realQuadratic,
  narrowRelationGroups,
  rows: rows.map((row) => ({
    ...row,
    discriminant: row.discriminant.toString(),
    answer: row.answer.toString(),
  })),
  unavailable: externals
    .filter((external) => !external.result.available)
    .map((external) => ({
      runtime: external.runtime,
      reason: external.result.reason,
    })),
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    "discriminant runtime operation".padEnd(54),
    "median".padStart(12),
    "semantics",
  );
  console.log("-".repeat(100));
  for (const row of rows) {
    const label = [
      row.discriminant.toString(),
      row.runtime,
      row.operation,
    ].join(" ");
    console.log(
      label.padEnd(54),
      `${(row.medianSeconds * 1000).toFixed(3)} ms`.padStart(12),
      row.semantics,
      row.correct ? "" : "WRONG ANSWER",
    );
  }
  for (const unavailable of report.unavailable) {
    console.log(
      `${unavailable.runtime}: unavailable — ${unavailable.reason}`,
    );
  }
  console.log(
    `\n${realQuadratic.discriminant} Sage.js real class-number stream`.padEnd(54),
    `${(realQuadratic.seconds * 1000).toFixed(3)} ms`.padStart(12),
    realQuadratic.semantics,
    realQuadratic.correct ? "" : "WRONG ANSWER",
  );
  console.log(
    `  h=${realQuadratic.classNumber}, h+=${realQuadratic.narrowClassNumber}, ` +
      `${realQuadratic.reducedFormsChecked} reduced forms, ` +
      `${realQuadratic.preflightChecks} bounded divisor trials, ` +
      `materializes classes=${realQuadratic.materializesAllReducedForms}`,
  );
  for (const row of narrowRelationGroups) {
    console.log(
      `${row.discriminant} Sage.js narrow relation group`.padEnd(54),
      `${(row.seconds * 1000).toFixed(3)} ms`.padStart(12),
      `invariants=[${row.invariants.join(", ")}], ${row.semantics}`,
      row.correct ? "" : "WRONG ANSWER",
    );
  }
  console.log(`\ncorrectness: ${correct ? "PASS" : "FAIL"}`);
}

if (!correct) process.exitCode = 1;
