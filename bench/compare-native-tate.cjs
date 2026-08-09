"use strict";

const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compile } = require("../tools/native-kernel.cjs");

const root = resolve(__dirname, "..");
const sourcePath = join(__dirname, "native_tate_large_prime.py");
const cacheRoot = process.env.SAGEJS_NATIVE_TATE_CACHE ||
  join(tmpdir(), "sagejs-native-tate-benchmark");
const generatedCorpusPath = join(
  __dirname,
  ".native-tate-corpus",
  "cremona-5000.json",
);
const corpusPath = process.env.SAGEJS_NATIVE_TATE_CORPUS ||
  (existsSync(generatedCorpusPath) ? generatedCorpusPath : null);
const targetCalls = Number(process.env.SAGEJS_NATIVE_TATE_TARGET_CALLS || 150000);
const bucketTargetCalls = Number(
  process.env.SAGEJS_NATIVE_TATE_BUCKET_TARGET_CALLS || 30000,
);

// Fast built-in smoke corpus for machines on which the generated Cremona
// corpus is absent. Expected triples come from PARI 2.17.3 elllocalred.
const smokeCases = [
  [[0, 0, 1, -1, 0], 5, [0, 1, 1]],
  [[0, 0, 0, 0, 5], 5, [2, 2, 1]],
  [[0, 0, 0, 0, 25], 5, [2, 4, 3]],
  [[0, 0, 0, 0, 125], 5, [2, -1, 2]],
  [[0, 0, 0, 0, 625], 5, [2, -4, 3]],
  [[0, 0, 0, 0, 3125], 5, [2, -2, 1]],
  [[0, 0, 0, 5, 0], 5, [2, 3, 2]],
  [[0, 0, 0, 25, 0], 5, [2, -1, 4]],
  [[0, 0, 0, 125, 0], 5, [2, -3, 2]],
  [[0, -1, 1, -10, -20], 11, [1, 9, 5]],
  [[1, -16, 0, -9, 16], 11, [1, 5, 1]],
  [[7, 1, 17, 16, 0], 17, [1, 6, 2]],
  [[3, 20, -4, -7, -10], 13, [1, 7, 1]],
].map(([coefficients, prime, expected], index) => ({
  label: `smoke-${index}`,
  coefficients: coefficients.map(String),
  prime: String(prime),
  expected: expected.map(String),
  source: "built-in-smoke",
}));

function invariants(coefficients) {
  const [a1, a2, a3, a4, a6] = coefficients;
  const b2 = a1 * a1 + 4n * a2;
  const b4 = a1 * a3 + 2n * a4;
  const b6 = a3 * a3 + 4n * a6;
  const b8 = a1 * a1 * a6 + 4n * a2 * a6 - a1 * a3 * a4 +
    a2 * a3 * a3 - a4 * a4;
  const c4 = b2 * b2 - 24n * b4;
  const c6 = -b2 * b2 * b2 + 36n * b2 * b4 - 216n * b6;
  const discriminant = -b2 * b2 * b8 - 8n * b4 * b4 * b4 -
    27n * b6 * b6 + 9n * b2 * b4 * b6;
  return [c4, c6, discriminant];
}

function loadCases() {
  let entries = smokeCases;
  let description = "built-in 13-case smoke corpus";
  if (corpusPath) {
    const corpus = JSON.parse(readFileSync(resolve(corpusPath), "utf8"));
    if (corpus.schema !== "sagejs.native-tate-corpus/v1") {
      throw new Error(`unsupported Tate corpus schema in ${corpusPath}`);
    }
    entries = corpus.cases;
    description = `${resolve(corpusPath)} (${corpus.ecdata.selectedCurves} curves)`;
  }
  return {
    description,
    entries: entries.map((entry) => {
      const coefficients = entry.coefficients.map(BigInt);
      const prime = BigInt(entry.prime);
      return {
        ...entry,
        arguments: [...coefficients, prime],
        coefficients,
        expectedBigInt: entry.expected.map(BigInt),
        invariantArguments: [...invariants(coefficients), prime],
        prime,
      };
    }),
  };
}

function equal(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function repetitionsFor(length, target) {
  const explicit = process.env.SAGEJS_NATIVE_TATE_REPETITIONS;
  if (explicit !== undefined) return Math.max(1, Number(explicit));
  return Math.max(1, Math.ceil(target / length));
}

function measure(entries, invoke, target = targetCalls, samples = 7) {
  const repetitions = repetitionsFor(entries.length, target);
  let witness;
  for (let warmup = 0; warmup < 2; warmup += 1) {
    for (const entry of entries) witness = invoke(entry);
  }
  const timings = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const start = process.hrtime.bigint();
    for (let iteration = 0; iteration < repetitions; iteration += 1) {
      for (const entry of entries) witness = invoke(entry);
    }
    timings.push(
      Number(process.hrtime.bigint() - start) /
        (repetitions * entries.length),
    );
  }
  if (witness === undefined) throw new Error("benchmark produced no result");
  return median(timings);
}

function kodairaFamily(code) {
  if (code === 1) return "I0";
  if (code === 2) return "II";
  if (code === 3) return "III";
  if (code === 4) return "IV";
  if (code >= 5) return "I_n";
  if (code === -1) return "I0*";
  if (code === -2) return "II*";
  if (code === -3) return "III*";
  if (code === -4) return "IV*";
  return "I_n*";
}

function primeSize(prime) {
  const bits = prime.toString(2).length;
  if (bits <= 5) return "1-5 bits";
  if (bits <= 8) return "6-8 bits";
  if (bits <= 12) return "9-12 bits";
  if (bits <= 16) return "13-16 bits";
  return "17+ bits";
}

function groupsFor(entries) {
  const groups = [{ name: "all", entries }];
  for (const [prefix, classify] of [
    ["type", (entry) => kodairaFamily(Number(entry.expectedBigInt[1]))],
    ["prime", (entry) => primeSize(entry.prime)],
  ]) {
    const classified = new Map();
    for (const entry of entries) {
      const name = `${prefix}:${classify(entry)}`;
      if (!classified.has(name)) classified.set(name, []);
      classified.get(name).push(entry);
    }
    for (const [name, members] of [...classified].sort()) {
      groups.push({ name, entries: members });
    }
  }
  return groups;
}

function assertImplementation(name, implementation, entries, argumentName) {
  for (const entry of entries) {
    const actual = implementation(...entry[argumentName]);
    if (!equal(actual, entry.expectedBigInt)) {
      throw new Error(
        `${name} disagrees with PARI for ${entry.label} at p=${entry.prime}: ` +
          `${actual} != ${entry.expectedBigInt}`,
      );
    }
  }
}

function gpLiteral(entry) {
  return `[[${entry.coefficients.join(",")}],${entry.prime},` +
    `[${entry.expectedBigInt.join(",")}]]`;
}

function gpChunkAssignments(name, values, columns = 100) {
  const commands = [`${name}=[];`];
  for (let index = 0; index < values.length; index += columns) {
    commands.push(
      `${name}=concat(${name},[${values.slice(index, index + columns).join(",")}]);`,
    );
  }
  return commands;
}

function pariComparison(entries, groups) {
  const groupData = groups.map(({ name, entries: members }) => ({
    name,
    indices: members.map((entry) => entries.indexOf(entry) + 1),
  }));
  const commands = [
    ...gpChunkAssignments("cases", entries.map(gpLiteral), 20),
    "curves=vector(#cases,i,ellinit(cases[i][1]));",
    "for(i=1,#cases,r=elllocalred(curves[i],cases[i][2]);" +
      "if(r[1]!=cases[i][3][1]||r[2]!=cases[i][3][2]||" +
      "r[4]!=cases[i][3][3]," +
      'error("Tate corpus mismatch")));',
  ];
  for (const group of groupData) {
    const repetitions = repetitionsFor(group.indices.length, bucketTargetCalls);
    commands.push(...gpChunkAssignments("inds", group.indices));
    commands.push(`reps=${repetitions};`);
    commands.push(
      "gettime();for(rep=1,reps,for(j=1,#inds,i=inds[j];" +
        "elllocalred(ellinit(cases[i][1]),cases[i][2])));" +
        `print(Str("F|${group.name}|",gettime(),"|",reps,"|",#inds));`,
    );
    commands.push(
      "gettime();for(rep=1,reps,for(j=1,#inds,i=inds[j];" +
        "elllocalred(curves[i],cases[i][2])));" +
        `print(Str("P|${group.name}|",gettime(),"|",reps,"|",#inds));`,
    );
  }
  const result = spawnSync("gp", ["-fq"], {
    input: `${commands.join("\n")}\n`,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") return null;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const rawTimings = new Map();
  for (const line of result.stdout.trim().split(/\r?\n/)) {
    if (!line.startsWith("F|") && !line.startsWith("P|")) continue;
    const [kind, name, milliseconds, repetitions, count] = line.split("|");
    const calls = Number(repetitions) * Number(count);
    if (![milliseconds, repetitions, count]
      .every((value) => Number.isFinite(Number(value))) || calls <= 0) {
      throw new Error(`invalid PARI timing row: ${line}`);
    }
    if (!rawTimings.has(name)) rawTimings.set(name, {});
    rawTimings.get(name)[kind === "F" ? "full" : "precomputed"] =
      Number(milliseconds) * 1e6 / calls;
  }
  if (!rawTimings.has("all")) {
    throw new Error(
      "PARI produced no aggregate timing rows\nstdout:\n" +
        result.stdout.slice(-4000) + "\nstderr:\n" + result.stderr.slice(-4000),
    );
  }
  return rawTimings;
}

function productionSagejsComparison(entries) {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-tate-production-"));
  const path = join(temporary, "benchmark.py");
  const casesLiteral = entries.map((entry) =>
    `([${entry.coefficients.join(",")}],${entry.prime},` +
      `[${entry.expectedBigInt.join(",")}])`
  ).join(",");
  const repetitions = repetitionsFor(entries.length, Math.min(targetCalls, 30000));
  writeFileSync(path, `from time import perf_counter
import sagejs_elliptic_advanced as advanced
import sagejs.runtime as runtime
cases = [${casesLiteral}]
cases = [([runtime.bigint(value) for value in coefficients], prime, expected)
         for coefficients, prime, expected in cases]
failures = 0
for coefficients, prime, expected in cases:
    actual = advanced._ec_tate_local_data(coefficients, prime)
    if actual[0] != expected[0] or actual[1] != expected[1] or actual[2] != expected[2]:
        failures += 1
        if failures <= 10:
            print("MISMATCH=" + str(coefficients) + "," + str(prime) + "," + str(actual) + "," + str(expected))
print("CHECK=" + str(failures))
for sample in range(5):
    start = perf_counter()
    for _ in range(${repetitions}):
        for coefficients, prime, expected in cases:
            actual = advanced._ec_tate_local_data(coefficients, prime)
    print("TIME=" + str((perf_counter() - start) * 1e9 / (${repetitions} * len(cases))))
`);
  try {
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), path], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_AUTOLOAD: "0" },
      maxBuffer: 128 * 1024 * 1024,
    });
    if (result.status !== 0) return { error: result.stderr.trim() };
    const lines = result.stdout.trim().split(/\r?\n/);
    const failures = Number(lines.find((line) => line.startsWith("CHECK=")).slice(6));
    if (failures !== 0) {
      const details = lines.filter((line) => line.startsWith("MISMATCH="));
      throw new Error(
        `production Sage.js failed ${failures} cases\n${details.join("\n")}`,
      );
    }
    return {
      nanoseconds: median(lines.filter((line) => line.startsWith("TIME="))
        .map((line) => Number(line.slice(5)))),
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function format(value) {
  return value === undefined ? "unavailable" : value.toFixed(1);
}

(async () => {
  if (!Number.isFinite(targetCalls) || targetCalls < 1 ||
      !Number.isFinite(bucketTargetCalls) || bucketTargetCalls < 1) {
    throw new Error("Tate target-call settings must be positive numbers");
  }
  const { description, entries } = loadCases();
  const groups = groupsFor(entries);
  const result = await compile({
    sourcePath,
    functions: [
      "tate_large_prime",
      "tate_large_prime_invariants",
      "tate_boundary_probe",
      "tate_invariant_boundary_probe",
    ],
    cacheRoot,
  });
  const kernel = require(result.modulePath);
  const full = kernel.tate_large_prime;
  const precomputed = kernel.tate_large_prime_invariants;
  const boundary = kernel.tate_boundary_probe.tagged;
  const invariantBoundary = kernel.tate_invariant_boundary_probe.tagged;
  for (const [name, implementation] of Object.entries({
    selected: full,
    javascript: full.javascript,
    tagged: full.tagged,
    gmp: full.gmp,
  })) {
    assertImplementation(name, implementation, entries, "arguments");
  }
  assertImplementation(
    "precomputed invariants",
    precomputed,
    entries,
    "invariantArguments",
  );

  const nativeTimings = new Map();
  for (const group of groups) {
    const target = group.name === "all" ? targetCalls : bucketTargetCalls;
    nativeTimings.set(group.name, {
      full: measure(group.entries, (entry) => full(...entry.arguments), target),
      precomputed: measure(
        group.entries,
        (entry) => precomputed(...entry.invariantArguments),
        target,
      ),
    });
  }
  const boundaryNanoseconds = measure(
    entries,
    (entry) => boundary(...entry.arguments),
  );
  const invariantBoundaryNanoseconds = measure(
    entries,
    (entry) => invariantBoundary(...entry.invariantArguments),
  );
  const production = productionSagejsComparison(entries);
  const pari = pariComparison(entries, groups);

  console.log("Tate local reduction at p > 3 (warm ns/case)");
  console.log(`corpus: ${description}`);
  console.log(`cases=${entries.length}; all native and production results agree with PARI`);
  console.log("\noverall matched workload");
  console.log("implementation".padEnd(31), "ns/case".padStart(12));
  console.log("compiled coefficients".padEnd(31), format(nativeTimings.get("all").full).padStart(12));
  console.log("compiled invariants".padEnd(31), format(nativeTimings.get("all").precomputed).padStart(12));
  console.log("native ABI probe (6 in, 3 out)".padEnd(31), format(boundaryNanoseconds).padStart(12));
  console.log(
    "native ABI probe (4 in, 3 out)".padEnd(31),
    format(invariantBoundaryNanoseconds).padStart(12),
  );
  if (production.nanoseconds !== undefined) {
    console.log("Sage.js production Python".padEnd(31), format(production.nanoseconds).padStart(12));
  } else {
    console.log(`Sage.js production unavailable: ${production.error}`);
  }
  if (pari) {
    console.log("PARI coefficients + ellinit".padEnd(31), format(pari.get("all").full).padStart(12));
    console.log("PARI preinitialized ell".padEnd(31), format(pari.get("all").precomputed).padStart(12));
  } else {
    console.log("PARI/GP unavailable");
  }

  for (const prefix of ["type:", "prime:"]) {
    console.log(prefix === "type:" ? "\nby Kodaira family" : "\nby prime size");
    console.log(
      "bucket".padEnd(18),
      "count".padStart(8),
      "native full".padStart(13),
      "native inv".padStart(13),
      "PARI full".padStart(13),
      "PARI pre".padStart(13),
    );
    for (const group of groups.filter(({ name }) => name.startsWith(prefix))) {
      const native = nativeTimings.get(group.name);
      const pariTiming = pari?.get(group.name);
      console.log(
        group.name.slice(prefix.length).padEnd(18),
        String(group.entries.length).padStart(8),
        format(native.full).padStart(13),
        format(native.precomputed).padStart(13),
        format(pariTiming?.full).padStart(13),
        format(pariTiming?.precomputed).padStart(13),
      );
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
