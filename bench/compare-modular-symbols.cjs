"use strict";

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const decompositionOnly = process.argv.includes("--decomposition-only");
const source = join(
  __dirname,
  decompositionOnly
    ? "modular-symbols-decomposition.sage"
    : "modular-symbols.sage",
);
const sagejs = join(root, "bin", "sagejs");
const defaultSage = existsSync("/home/user/bin/sagelite")
  ? "/home/user/bin/sagelite"
  : "/opt/cocalc-webdev-python/bin/sage";
const sage = process.env.SAGELITE_SAGE || defaultSage;
const gp = process.env.PARI_GP || "gp";
const magma = process.env.MAGMA || "/home/user/bin/magma";
const json = process.argv.includes("--json");

const expected = new Map([
  ["p1-100000", 180000],
  ["p1-1000000", 1800000],
  ["manin-modp-389", 65],
  ["manin-modp-1000", 301],
  ["modsym-qq-389", 65],
  ["modsym-qq-1000", 301],
  ["space-full-5077", 845],
  ["space-cuspidal-5077", 844],
  ["space-plus-5077", 423],
  ["space-plus-cuspidal-5077", 422],
  ["space-plus-cuspidal-t2-5077", -2],
  ["charpoly-t2-5077", 938871226],
  ["hecke-t3-389", 4],
  ["hecke-t3-1000", 20],
  ["hecke-t3-10000", 20],
  ["hecke-t3-20011", 0],
  ["decomp-389", 10102030620],
  ["new-1000", 24],
  ["new-decomp-1000", 202020204040404],
].filter(([operation]) =>
  !decompositionOnly ||
  operation.startsWith("decomp-") ||
  operation.startsWith("new-"),
));
const requiredOperations = new Map([
  ["Sage.js", [...expected.keys()]],
  ["SageMath", [...expected.keys()]],
  [
    "PARI/GP",
    [...expected.keys()].filter(
      (operation) =>
        !operation.startsWith("p1-") &&
        !operation.startsWith("manin-modp-") &&
        !operation.startsWith("decomp-") &&
        !operation.startsWith("new-"),
    ),
  ],
  [
    "Magma",
    [...expected.keys()].filter(
      (operation) =>
        operation.startsWith("space-") ||
        operation.startsWith("hecke-") ||
        operation.startsWith("charpoly-") ||
        operation.startsWith("decomp-") ||
        operation.startsWith("new-"),
    ),
  ],
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
  if (decompositionOnly) {
    return {
      available: false,
      reason: "the focused newspace decomposition API is not wired for PARI",
    };
  }
  const program = [
    "default(nbthreads, 1);",
    "msinit(11,2);",
    "for(i=1,2, N=[389,1000][i]; " +
      "for(sample=0,2, t=getwalltime(); M=msinit(N,2); " +
      'print("RESULT modsym-qq-",N," ",sample," ",' +
      '(getwalltime()-t)/1000.0," ",msdim(M))));',
    "for(i=1,4, N=[389,1000,10000,20011][i]; M=msinit(N,2); " +
      "for(sample=0,2, t=getwalltime(); T=mshecke(M,3); " +
      'print("RESULT hecke-t3-",N," ",sample," ",' +
      '(getwalltime()-t)/1000.0," ",trace(T))));',
    "N=5077; t=getwalltime(); M=msinit(N,2); " +
      'print("RESULT space-full-5077 0 ",' +
      '(getwalltime()-t)/1000.0," ",msdim(M));',
    "t=getwalltime(); S=mscuspidal(M); " +
      'print("RESULT space-cuspidal-5077 0 ",' +
      '(getwalltime()-t)/1000.0," ",msdim(S));',
    "t=getwalltime(); P=msinit(N,2,1); " +
      'print("RESULT space-plus-5077 0 ",' +
      '(getwalltime()-t)/1000.0," ",msdim(P));',
    "t=getwalltime(); C=mscuspidal(P); " +
      'print("RESULT space-plus-cuspidal-5077 0 ",' +
      '(getwalltime()-t)/1000.0," ",msdim(C));',
    "t=getwalltime(); T=mshecke(P,2,C); " +
      'print("RESULT space-plus-cuspidal-t2-5077 0 ",' +
      '(getwalltime()-t)/1000.0," ",trace(T));',
    "t=getwalltime(); F=charpoly(T); " +
      'print("RESULT charpoly-t2-5077 0 ",' +
      '(getwalltime()-t)/1000.0," ",' +
      "lift(Mod(subst(F,'x,2),1000000007)));",
    "quit;",
    "",
  ].join("\n");
  return execute("PARI/GP", gp, ["-q", "-f", "-s", "4G"], {
    input: program,
  });
}

function executeMagma() {
  const lines = [
    "SetSeed(1);",
    "for N in [389, 1000, 10000, 20011] do",
    "  for sample in [0..2] do",
    "    M := ModularSymbols(N, 2);",
    "    t := Cputime();",
    "    T := HeckeOperator(M, 3);",
    '    printf "RESULT hecke-t3-%o %o %.9o %o\\n", ' +
      "N, sample, Cputime(t), Trace(T);",
    "  end for;",
    "end for;",
    "N := 5077;",
    "t := Cputime(); M := ModularSymbols(N, 2);",
    'printf "RESULT space-full-5077 0 %.9o %o\\n", ' +
      "Cputime(t), Dimension(M);",
    "t := Cputime(); S := CuspidalSubspace(M);",
    'printf "RESULT space-cuspidal-5077 0 %.9o %o\\n", ' +
      "Cputime(t), Dimension(S);",
    "t := Cputime(); P := ModularSymbols(N, 2, 1);",
    'printf "RESULT space-plus-5077 0 %.9o %o\\n", ' +
      "Cputime(t), Dimension(P);",
    "t := Cputime(); C := CuspidalSubspace(P);",
    'printf "RESULT space-plus-cuspidal-5077 0 %.9o %o\\n", ' +
      "Cputime(t), Dimension(C);",
    "t := Cputime(); T := HeckeOperator(C, 2);",
    'printf "RESULT space-plus-cuspidal-t2-5077 0 %.9o %o\\n", ' +
      "Cputime(t), Trace(T);",
    "t := Cputime(); F := CharacteristicPolynomial(T);",
    "fingerprint := Integers() ! Evaluate(F, 2);",
    'printf "RESULT charpoly-t2-5077 0 %.9o %o\\n", ' +
      "Cputime(t), fingerprint mod 1000000007;",
    "M := ModularSymbols(389, 2, 1);",
    "t := Cputime(); D := Decomposition(M, 20);",
    "dimensions := [Dimension(A) : A in D];",
    "Sort(~dimensions);",
    "fingerprint := 0;",
    "for dimension in dimensions do",
    "  fingerprint := 100*fingerprint + dimension;",
    "end for;",
    'printf "RESULT decomp-389 0 %.9o %o\\n", ' +
      "Cputime(t), fingerprint;",
    "M := ModularSymbols(1000, 2, 1);",
    "t := Cputime(); C := CuspidalSubspace(M); N := NewSubspace(C);",
    'printf "RESULT new-1000 0 %.9o %o\\n", ' +
      "Cputime(t), Dimension(N);",
    "t := Cputime(); D := Decomposition(N, 20);",
    "dimensions := [Dimension(A) : A in D];",
    "Sort(~dimensions);",
    "fingerprint := 0;",
    "for dimension in dimensions do",
    "  fingerprint := 100*fingerprint + dimension;",
    "end for;",
    'printf "RESULT new-decomp-1000 0 %.9o %o\\n", ' +
      "Cputime(t), fingerprint;",
    "quit;",
    "",
  ];
  const firstDecompositionLine = lines.indexOf(
    "M := ModularSymbols(389, 2, 1);",
  );
  const selectedLines = decompositionOnly
    ? ["SetSeed(1);", ...lines.slice(firstDecompositionLine)]
    : lines;
  const program = selectedLines.join("\n");
  return execute("Magma", magma, [], { input: program });
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
  { name: "Magma", result: executeMagma() },
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
  runtime.result.missing = (requiredOperations.get(runtime.name) || []).filter(
    (operation) => !runtime.result.cases.has(operation),
  );
  correct &&= runtime.result.missing.length === 0;
}

const report = {
  generatedAt: new Date().toISOString(),
  correct,
  semantics: {
    "p1-*": "canonical P1List construction with indexed representatives",
    "manin-modp-*":
      "weight-2 Gamma0 S/R relation quotient over GF(65521)",
    "modsym-qq-*": "full weight-2 Gamma0 modular-symbol space over Q",
    "space-*-5077":
      "full, cuspidal, plus, and plus-cuspidal construction phases",
    "space-plus-cuspidal-t2-5077":
      "T2 on the level-5077 plus-cuspidal subspace, answer is its trace",
    "charpoly-t2-5077":
      "exact T2 characteristic polynomial; answer is f(2) modulo 1000000007",
    "hecke-t3-*":
      "exact weight-2 Gamma0 T3/Hecke matrix, answer is its trace",
    "decomp-389":
      "anemic simple Hecke decomposition; answer encodes sorted dimensions",
    "new-1000":
      "weight-2 Gamma0 plus new submodule; answer is its dimension",
    "new-decomp-1000":
      "simple decomposition of the new submodule; answer encodes sorted dimensions",
  },
  runtimes: runtimes.map(({ name, result }) => ({
    name,
    available: result.available,
    reason: result.reason,
    missing: result.missing,
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
    } else if (runtime.missing?.length) {
      console.log(
        `${runtime.name}: MISSING — ${runtime.missing.join(", ")}`,
      );
    }
  }
  console.log(`\ncorrectness: ${correct ? "PASS" : "FAIL"}`);
}

if (!correct) process.exitCode = 1;
