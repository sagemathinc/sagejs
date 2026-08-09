"use strict";

const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const defaultSource =
  "https://raw.githubusercontent.com/JohnCremona/ecdata/master/" +
  "allcurves/allcurves.00000-09999";
const defaultOutput = resolve(
  __dirname,
  ".native-tate-corpus",
  "cremona-5000.json",
);

function usage(message) {
  if (message) console.error(message);
  console.error(
    "usage: node bench/generate-native-tate-corpus.cjs " +
      "[--source URL_OR_PATH] [--curves COUNT] [--output PATH] " +
      "[--synthetic-primes P1,P2,...]",
  );
  process.exit(2);
}

function optionsFromArguments(argv) {
  const options = {
    source: defaultSource,
    curves: 5000,
    output: defaultOutput,
    syntheticPrimes: [101, 1009, 10007, 1000003],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === "--source" && value) options.source = value;
    else if (name === "--curves" && value) options.curves = Number(value);
    else if (name === "--output" && value) options.output = resolve(value);
    else if (name === "--synthetic-primes" && value !== undefined) {
      options.syntheticPrimes = value === ""
        ? []
        : value.split(",").map(Number);
    } else usage(`unknown or incomplete option: ${name}`);
    index += 1;
  }
  if (!Number.isInteger(options.curves) || options.curves < 1) {
    usage("--curves must be a positive integer");
  }
  if (options.syntheticPrimes.some(
    (prime) => !Number.isSafeInteger(prime) || prime <= 3,
  )) {
    usage("--synthetic-primes must contain integers greater than three");
  }
  return options;
}

async function readSource(location) {
  if (/^https?:\/\//.test(location)) {
    const response = await fetch(location);
    if (!response.ok) {
      throw new Error(`could not download ${location}: ${response.status}`);
    }
    return await response.text();
  }
  return readFileSync(resolve(location), "utf8");
}

function parseCurves(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line, lineIndex) => {
    const match = /^(\d+)\s+([a-z]+)\s+(\d+)\s+\[([^\]]+)\]/.exec(line);
    if (!match) throw new Error(`invalid allcurves line ${lineIndex + 1}`);
    const coefficients = match[4].split(",").map((value) => value.trim());
    if (coefficients.length !== 5 || coefficients.some(
      (value) => !/^-?\d+$/.test(value),
    )) {
      throw new Error(`invalid coefficients on allcurves line ${lineIndex + 1}`);
    }
    return {
      conductor: Number(match[1]),
      label: `${match[1]}${match[2]}${match[3]}`,
      coefficients,
    };
  });
}

function systematicSample(values, count) {
  if (count >= values.length) return values;
  if (count === 1) return [values[0]];
  const answer = [];
  for (let index = 0; index < count; index += 1) {
    const position = Math.floor(index * (values.length - 1) / (count - 1));
    answer.push(values[position]);
  }
  return answer;
}

function primeDivisors(value) {
  const answer = [];
  let remaining = value;
  for (let prime = 2; prime * prime <= remaining; prime += prime === 2 ? 1 : 2) {
    if (remaining % prime !== 0) continue;
    answer.push(prime);
    while (remaining % prime === 0) remaining /= prime;
  }
  if (remaining > 1) answer.push(remaining);
  return answer;
}

function cremonaCases(curves) {
  return curves.flatMap((curve) => primeDivisors(curve.conductor)
    .filter((prime) => prime > 3)
    .map((prime) => ({
      ...curve,
      prime: String(prime),
      source: "cremona",
    })));
}

function syntheticCases(primes) {
  return primes.map((primeNumber) => {
    const prime = BigInt(primeNumber);
    return {
      conductor: null,
      label: `synthetic-I0star-${prime}`,
      coefficients: ["0", "0", "0", "0", String(prime ** 3n)],
      prime: String(prime),
      source: "synthetic-large-I0star",
    };
  });
}

function pariOracle(cases) {
  const commands = cases.map(({ coefficients, prime }) =>
    `E=ellinit([${coefficients.join(",")}]);` +
    `r=elllocalred(E,${prime});` +
    'print(Str(r[1],",",r[2],",",r[4],",",r[3][1]))'
  );
  const result = spawnSync("gp", ["-fq"], {
    input: `${commands.join(";\n")};\n`,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") {
    throw new Error("PARI/GP is required to generate the Tate corpus");
  }
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const lines = result.stdout.trim().split(/\r?\n/);
  if (lines.length !== cases.length) {
    throw new Error(`PARI returned ${lines.length} rows for ${cases.length} cases`);
  }
  return cases.map((entry, index) => {
    const values = lines[index].split(",");
    if (values.length !== 4 || values.some((value) => !/^-?\d+$/.test(value))) {
      throw new Error(`invalid PARI result for ${entry.label}: ${lines[index]}`);
    }
    if (values[3] !== "1") {
      throw new Error(`${entry.label} is not locally minimal at ${entry.prime}`);
    }
    return { ...entry, expected: values.slice(0, 3) };
  });
}

(async () => {
  const options = optionsFromArguments(process.argv.slice(2));
  const text = await readSource(options.source);
  const allCurves = parseCurves(text);
  const curves = systematicSample(allCurves, options.curves);
  const cases = pariOracle([
    ...cremonaCases(curves),
    ...syntheticCases(options.syntheticPrimes),
  ]);
  const output = {
    schema: "sagejs.native-tate-corpus/v1",
    generatedBy: "PARI/GP elllocalred",
    ecdata: {
      source: options.source,
      sha256: createHash("sha256").update(text).digest("hex"),
      license: "Artistic-2.0",
      availableCurves: allCurves.length,
      selectedCurves: curves.length,
      selection: "evenly spaced rows including both endpoints",
    },
    syntheticPrimes: options.syntheticPrimes,
    cases,
  };
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(output)}\n`);
  const cremonaCount = cases.filter((entry) => entry.source === "cremona").length;
  console.log(`wrote ${options.output}`);
  console.log(
    `curves=${curves.length} Cremona bad-prime cases=${cremonaCount} ` +
      `synthetic=${cases.length - cremonaCount}`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
