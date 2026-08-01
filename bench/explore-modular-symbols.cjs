#!/usr/bin/env node
"use strict";

const {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sage = process.env.SAGELITE_SAGE || (
  existsSync("/home/user/bin/sagelite")
    ? "/home/user/bin/sagelite"
    : "/opt/cocalc-webdev-python/bin/sage"
);
const gp = process.env.PARI_GP || "gp";
const magma = process.env.MAGMA || "/home/user/bin/magma";
const json = process.argv.includes("--json");
const large = process.argv.includes("--large");
const stress = process.argv.includes("--stress");
const modulus = 1000000007;

const coreCases = [
  [37, 2, 0, 2, true],
  [1000, 2, 1, 2, true],
  [1000, 2, -1, 3, true],
  [37, 4, 0, 2, true],
  [37, 4, 1, 3, true],
  [101, 4, -1, 2, true],
  [50, 6, 1, 3, false],
  [97, 8, 0, 2, false],
];
const largeCases = [
  [5077, 2, 1, 2, true],
  [10000, 2, 1, 2, false],
  [20011, 2, 1, 2, false],
  [389, 6, 1, 2, false],
  [389, 6, -1, 3, false],
  [1000, 4, 1, 2, false],
];

function caseId({ level, weight, sign, prime }) {
  const signName = sign < 0 ? "minus" : sign > 0 ? "plus" : "full";
  return `n${level}-k${weight}-${signName}-t${prime}`;
}

function makeCase(values) {
  const [level, weight, sign, prime, charpoly] = values;
  return { level, weight, sign, prime, charpoly };
}

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function seededCases(seedText, countText) {
  if (seedText === undefined) return [];
  let state = Number(seedText) >>> 0;
  const count = Number(countText ?? 8);
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw new RangeError("--count must be an integer between 1 and 100");
  }
  const levels = [11, 37, 50, 97, 101, 121, 389, 625, 1000, 1201];
  const weights = [2, 4, 6, 8, 10];
  const signs = [-1, 0, 1];
  const primes = [2, 3, 5];
  const random = (length) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % length;
  };
  const result = [];
  const seen = new Set();
  while (result.length < count) {
    const values = [
      levels[random(levels.length)],
      weights[random(weights.length)],
      signs[random(signs.length)],
      primes[random(primes.length)],
    ];
    const item = makeCase([
      ...values,
      values[0] * (values[1] - 1) <= 1500,
    ]);
    if (!stress && item.level * (item.weight - 1) > 2000) continue;
    const id = caseId(item);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(item);
    }
  }
  return result;
}

const randomCases = seededCases(argument("--seed"), argument("--count"));
const cases = randomCases.length
  ? randomCases
  : [...coreCases, ...(large ? largeCases : [])].map(makeCase);

function parseOutput(label, output) {
  const rows = [];
  const errors = [];
  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] === "ERROR") {
      errors.push({
        case: fields[1],
        stage: fields[2],
        message: fields.slice(3).join(" "),
      });
      continue;
    }
    if (fields[0] !== "RESULT") continue;
    const [, caseName, stage, elapsed, answer] = fields;
    rows.push({
      case: caseName,
      stage,
      seconds: Number(elapsed),
      answer: Number(answer),
    });
  }
  if (rows.length === 0 && errors.length === 0) {
    throw new Error(`${label} did not produce benchmark results`);
  }
  return { rows, errors };
}

function execute(label, command, args, input = undefined) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input,
    maxBuffer: 128 * 1024 * 1024,
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

function sageProgram() {
  const encoded = cases.map((item) =>
    `(${item.level},${item.weight},${item.sign},${item.prime},${item.charpoly ? "True" : "False"})`
  ).join(",");
  return `
import time
CASES = [${encoded}]
MODULUS = ${modulus}

def emit(case_name, stage, start, answer):
    print("RESULT", case_name, stage, float(time.time()-start), answer)

def fresh_space(level, weight, sign):
    if hasattr(P1List(1), "manin_relations"):
        return ModularSymbols(level, weight, sign=sign)
    return ModularSymbols(level, weight, sign=sign, use_cache=False)

for level, weight, sign, prime, do_charpoly in CASES:
    sign_name = "minus" if sign < 0 else ("plus" if sign > 0 else "full")
    case_name = "n%s-k%s-%s-t%s" % (level, weight, sign_name, prime)
    stage = "space"
    try:
        start = time.time(); M = fresh_space(level, weight, sign)
        emit(case_name, stage, start, M.dimension())
        stage = "cusp"
        start = time.time(); S = M.cuspidal_subspace()
        emit(case_name, stage, start, S.dimension())
        stage = "hecke"
        start = time.time(); T = S.hecke_matrix(prime)
        emit(case_name, stage, start, T.trace().numerator() % MODULUS)
        if do_charpoly:
            stage = "charpoly"
            start = time.time(); f = T.charpoly()
            emit(case_name, stage, start, f(2).numerator() % MODULUS)
    except Exception as error:
        print("ERROR", case_name, stage, "failed")
`;
}

function executeSage(label, command, prefixArgs = []) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-modsym-grid-"));
  const filename = join(directory, "grid.sage");
  try {
    writeFileSync(filename, sageProgram());
    return execute(label, command, [...prefixArgs, filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function pariProgram() {
  const lines = ["default(nbthreads,1);"];
  for (const item of cases) {
    const id = caseId(item);
    lines.push(
      "iferr(",
      `t=getwalltime();M=msinit(${item.level},${item.weight},${item.sign});` +
        `print("RESULT ${id} space ",(getwalltime()-t)/1000.0," ",msdim(M));`,
      `t=getwalltime();C=mscuspidal(M);` +
        `print("RESULT ${id} cusp ",(getwalltime()-t)/1000.0," ",msdim(C));`,
      `t=getwalltime();T=mshecke(M,${item.prime},C);` +
        `print("RESULT ${id} hecke ",(getwalltime()-t)/1000.0," ",` +
        `lift(Mod(trace(T),${modulus})));`,
    );
    if (item.charpoly) {
      lines.push(
        `t=getwalltime();F=charpoly(T);` +
          `print("RESULT ${id} charpoly ",(getwalltime()-t)/1000.0," ",` +
          `lift(Mod(subst(F,'x,2),${modulus})));`,
      );
    }
    lines.push(`,E,print("ERROR ${id} runtime ",E));`);
  }
  lines.push("quit;", "");
  return lines.join("\n");
}

function magmaProgram() {
  const lines = ["SetSeed(1);", `modulus := ${modulus};`];
  for (const item of cases) {
    const id = caseId(item);
    lines.push(
      "try",
      `t:=Cputime();M:=ModularSymbols(${item.level},${item.weight},${item.sign});` +
        `printf "RESULT ${id} space %.9o %o\\n",Cputime(t),Dimension(M);`,
      "t:=Cputime();C:=CuspidalSubspace(M);" +
        `printf "RESULT ${id} cusp %.9o %o\\n",Cputime(t),Dimension(C);`,
      `t:=Cputime();T:=HeckeOperator(C,${item.prime});` +
        `printf "RESULT ${id} hecke %.9o %o\\n",Cputime(t),` +
        "(Integers()!Trace(T)) mod modulus;",
    );
    if (item.charpoly) {
      lines.push(
        "t:=Cputime();F:=CharacteristicPolynomial(T);" +
          `printf "RESULT ${id} charpoly %.9o %o\\n",Cputime(t),` +
          "(Integers()!Evaluate(F,2)) mod modulus;",
      );
    }
    lines.push(
      "catch exception",
      `printf "ERROR ${id} runtime %o\\n",exception;`,
      "end try;",
    );
  }
  lines.push("quit;", "");
  return lines.join("\n");
}

const runtimes = [
  {
    name: "Sage.js",
    result: executeSage("Sage.js", process.execPath, [sagejs]),
  },
  { name: "SageMath", result: executeSage("SageMath", sage) },
  { name: "PARI/GP", result: execute("PARI/GP", gp, ["-q", "-f", "-s", "4G"], pariProgram()) },
  { name: "Magma", result: execute("Magma", magma, [], magmaProgram()) },
];

const reference = new Map();
const sageResult = runtimes.find((item) => item.name === "SageMath").result;
if (sageResult.available) {
  for (const row of sageResult.rows) {
    reference.set(`${row.case}:${row.stage}`, row.answer);
  }
}
const rows = [];
let correct = reference.size > 0;
for (const runtime of runtimes) {
  if (!runtime.result.available) continue;
  for (const row of runtime.result.rows) {
    const expected = reference.get(`${row.case}:${row.stage}`);
    const agrees = row.answer === expected;
    correct &&= agrees;
    rows.push({ ...row, runtime: runtime.name, expected, correct: agrees });
  }
}
for (const runtime of runtimes) {
  if (runtime.result.available && runtime.result.errors.length > 0) {
    correct = false;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  profile: randomCases.length
    ? stress ? "seeded-stress" : "seeded"
    : large ? "large" : "core",
  seed: argument("--seed"),
  modulus,
  cases: cases.map((item) => ({ id: caseId(item), ...item })),
  correct,
  runtimes: runtimes.map(({ name, result }) => ({
    name,
    available: result.available,
    reason: result.reason,
    errors: result.errors,
  })),
  rows,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    "case stage runtime".padEnd(48),
    "elapsed".padStart(12),
    "answer".padStart(11),
    "status".padStart(9),
  );
  console.log("-".repeat(84));
  for (const row of rows) {
    console.log(
      `${row.case.padEnd(25)} ${row.stage.padEnd(8)} ${row.runtime.padEnd(10)}`.padEnd(48),
      `${(row.seconds * 1000).toFixed(2)} ms`.padStart(12),
      String(row.answer).padStart(11),
      (row.correct ? "correct" : "WRONG").padStart(9),
    );
  }
  console.log(`\ncorrectness: ${correct ? "PASS" : "FAIL"}`);
}

if (!correct) process.exitCode = 1;
