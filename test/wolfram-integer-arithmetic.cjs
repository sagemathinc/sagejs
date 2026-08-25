// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const { createForeignFrontend } = require("../dist/tools/foreign");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

let temporaryDirectory;
let wolfram;

test.before(async () => {
  temporaryDirectory = mkdtempSync(
    join(tmpdir(), "sagejs-wolfram-integer-arithmetic-"),
  );
  wolfram = await createForeignFrontend("wolfram");
});

test.after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function run(source) {
  const filename = join(
    temporaryDirectory,
    `case-${Math.random().toString(36).slice(2)}.wl`,
  );
  writeFileSync(filename, source);
  return spawnSync(process.execPath, [sagejs, "--wolfram", filename], {
    cwd: temporaryDirectory,
    encoding: "utf8",
  });
}

function runOk(source) {
  const result = run(source);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

// One combined program exercises every new integer-arithmetic head end to
// end through the real CLI, in the same order documented in the PR.
const PROGRAM = [
  "GCD[12, 18]",
  "GCD[12, 18, 30]",
  "Divisors[12]",
  "DivisorSigma[0, 28]",
  "DivisorSigma[1, 28]",
  "EulerPhi[9]",
  "MoebiusMu[30]",
  "PrimeQ[13]",
  "PrimeQ[12]",
  "NextPrime[10]",
  "PowerMod[11, 156, 1237]",
  "Binomial[5, 2]",
  "Factorial[5]",
  "IntegerExponent[72, 3]",
  "IntegerExponent[100]",
  "Quotient[13, 4]",
  "Quotient[-13, 4]",
  "QuotientRemainder[17, 5]",
  "Mod[-13, 4]",
  "Divisible[12, 3]",
  "Divisible[3, 12]",
  "SquareFreeQ[10]",
  "SquareFreeQ[12]",
  "PrimeNu[60]",
  "PrimeOmega[60]",
  "IntegerDigits[1234]",
  "IntegerDigits[12, 2]",
  "IntegerDigits[5, 2, 6]",
  "IntegerLength[12345]",
  "",
].join("\n");

const EXPECTED = [
  "6", // GCD[12, 18]
  "6", // GCD[12, 18, 30]
  "[1, 2, 3, 4, 6, 12]", // Divisors[12]
  "6", // DivisorSigma[0, 28]: number of divisors of 28
  "56", // DivisorSigma[1, 28]: sum of divisors of 28
  "6", // EulerPhi[9]
  "-1", // MoebiusMu[30]
  "True", // PrimeQ[13]
  "False", // PrimeQ[12]
  "11", // NextPrime[10]
  "153", // PowerMod[11, 156, 1237]
  "10", // Binomial[5, 2]
  "120", // Factorial[5]
  "2", // IntegerExponent[72, 3]
  "2", // IntegerExponent[100]: base defaults to 10
  "3", // Quotient[13, 4]
  "-4", // Quotient[-13, 4]: floor division
  "[3, 2]", // QuotientRemainder[17, 5]
  "3", // Mod[-13, 4]: floor modulus
  "True", // Divisible[12, 3]: 3 divides 12
  "False", // Divisible[3, 12]: 12 does not divide 3
  "True", // SquareFreeQ[10]
  "False", // SquareFreeQ[12]
  "3", // PrimeNu[60]: distinct prime factors 2, 3, 5
  "4", // PrimeOmega[60]: 2^2 * 3 * 5, counted with multiplicity
  "[1, 2, 3, 4]", // IntegerDigits[1234]
  "[1, 1, 0, 0]", // IntegerDigits[12, 2]
  "[0, 0, 0, 1, 0, 1]", // IntegerDigits[5, 2, 6]: zero-padded to length 6
  "5", // IntegerLength[12345]
].join("\n");

test("every new integer-arithmetic head executes correctly through the CLI", () => {
  assert.equal(runOk(PROGRAM).trim(), EXPECTED);
});

test("GCD lowers as a variadic call into the Sage global, not _wolfram", () => {
  const lowering = wolfram.lower("GCD[12, 18, 30]");
  assert.match(lowering.source, /_wolfram\.GCD\(12, 18, 30\)/);
});

test("directHeads route straight to the matching Sage global, same argument order", () => {
  const lowering = wolfram.lower([
    "Divisors[12]",
    "EulerPhi[9]",
    "MoebiusMu[30]",
    "PrimeQ[13]",
    "NextPrime[10]",
    "PowerMod[11, 156, 1237]",
    "Binomial[5, 2]",
    "Factorial[5]",
    "",
  ].join("\n"));
  assert.match(lowering.source, /divisors\(12\)/);
  assert.match(lowering.source, /euler_phi\(9\)/);
  assert.match(lowering.source, /moebius\(30\)/);
  assert.match(lowering.source, /is_prime\(13\)/);
  assert.match(lowering.source, /next_prime\(10\)/);
  assert.match(lowering.source, /power_mod\(11, 156, 1237\)/);
  assert.match(lowering.source, /binomial\(5, 2\)/);
  assert.match(lowering.source, /factorial\(5\)/);
});

test("DivisorSigma keeps Wolfram's exponent-first argument order in the lowered call", () => {
  // The [k, n] order is preserved verbatim in the generated source; the
  // swap to Sage's sigma(n, k) happens inside wolfram.py's divisor_sigma,
  // not in the frontend.
  const lowering = wolfram.lower("DivisorSigma[0, 28]");
  assert.match(lowering.source, /_wolfram\.DivisorSigma\(0, 28\)/);
});

test("IntegerExponent lowers with an explicit or defaulted base", () => {
  const lowering = wolfram.lower([
    "IntegerExponent[72, 3]",
    "IntegerExponent[100]",
    "",
  ].join("\n"));
  assert.match(lowering.source, /_wolfram\.IntegerExponent\(72, 3\)/);
  assert.match(lowering.source, /_wolfram\.IntegerExponent\(100\)/);
});

test("Quotient, QuotientRemainder, and Mod lower to _wolfram wrappers", () => {
  const lowering = wolfram.lower([
    "Quotient[13, 4]",
    "QuotientRemainder[17, 5]",
    "Mod[-13, 4]",
    "",
  ].join("\n"));
  assert.match(lowering.source, /_wolfram\.Quotient\(13, 4\)/);
  assert.match(lowering.source, /_wolfram\.QuotientRemainder\(17, 5\)/);
  assert.match(lowering.source, /_wolfram\.Mod\(\(-13\), 4\)/);
});

test("Divisible keeps Wolfram's [m, n] order, the reverse of Integer.divides", () => {
  const lowering = wolfram.lower("Divisible[12, 3]");
  assert.match(lowering.source, /_wolfram\.Divisible\(12, 3\)/);
});

test("IntegerDigits lowers with the optional base and length arguments", () => {
  const lowering = wolfram.lower([
    "IntegerDigits[1234]",
    "IntegerDigits[12, 2]",
    "IntegerDigits[5, 2, 6]",
    "",
  ].join("\n"));
  assert.match(lowering.source, /_wolfram\.IntegerDigits\(1234\)/);
  assert.match(lowering.source, /_wolfram\.IntegerDigits\(12, 2\)/);
  assert.match(lowering.source, /_wolfram\.IntegerDigits\(5, 2, 6\)/);
});

test("PrimeNu, PrimeOmega, and SquareFreeQ lower to _wolfram wrappers", () => {
  const lowering = wolfram.lower([
    "PrimeNu[60]",
    "PrimeOmega[60]",
    "SquareFreeQ[10]",
    "",
  ].join("\n"));
  assert.match(lowering.source, /_wolfram\.PrimeNu\(60\)/);
  assert.match(lowering.source, /_wolfram\.PrimeOmega\(60\)/);
  assert.match(lowering.source, /_wolfram\.SquareFreeQ\(10\)/);
});

// Wolfram documents real options on several of these heads --
// `PrimeQ[n, GaussianIntegers -> True]`, `FactorInteger[n, GaussianIntegers
// -> True]`, `Divisors[n, GaussianIntegers -> True]`, and the same option on
// `PrimeNu`, `PrimeOmega`, and `SquareFreeQ` -- and Sage.js has no
// Gaussian-integer path to honor them. Rather than silently answering as
// though the option were absent, the frontend refuses any argument beyond a
// head's documented positional form by name.
test("Rule/option arguments are refused by name, not silently dropped", () => {
  assert.throws(
    () => wolfram.lower("PrimeQ[5, GaussianIntegers -> True]"),
    (error) =>
      error.name === "WolframSyntaxError" &&
      /PrimeQ options are not supported yet: Rule expressions do not lower to keyword arguments outside plot options/
        .test(error.message),
  );
  assert.throws(
    () => wolfram.lower("Divisors[12, GaussianIntegers -> True]"),
    (error) =>
      error.name === "WolframSyntaxError" &&
      /Divisors options are not supported yet: Rule expressions do not lower to keyword arguments outside plot options/
        .test(error.message),
  );
  // The same refusal applies to any excess positional argument, Rule or
  // not, since real Wolfram usage of an extra argument here can only be an
  // option this package does not implement.
  assert.throws(
    () => wolfram.lower("Factorial[5, 6]"),
    (error) =>
      error.name === "WolframSyntaxError" &&
      /Factorial options are not supported yet/.test(error.message),
  );
});

test("Quotient and PowerMod propagate the underlying arithmetic errors", () => {
  const zeroDivision = run("Quotient[5, 0]\n");
  assert.notEqual(zeroDivision.status, 0);
  assert.match(zeroDivision.stderr, /integer division or modulo by zero/);

  const badModulus = run("PowerMod[2, 3, 0]\n");
  assert.notEqual(badModulus.status, 0);
  assert.match(badModulus.stderr, /modulus must be positive/);

  const zeroValuation = run("IntegerExponent[0]\n");
  assert.notEqual(zeroValuation.status, 0);
  assert.match(zeroValuation.stderr, /valuation of zero is infinite/);
});

// `FactorInteger` is named explicitly, alongside `PrimeQ` and `Divisors`, as
// a motivating case for the option refusal above -- it must not fall
// through to the generic "binary operator '->' is not supported yet"
// message.
test("FactorInteger's GaussianIntegers option is refused by name", () => {
  assert.throws(
    () => wolfram.lower("FactorInteger[12, GaussianIntegers -> True]"),
    (error) =>
      error.name === "WolframSyntaxError" &&
      /FactorInteger options are not supported yet: Rule expressions do not lower to keyword arguments outside plot options/
        .test(error.message),
  );
});

// Below a head's minimum positional arity, the underlying Python call
// would otherwise raise a raw `TypeError` (missing argument) instead of a
// `WolframSyntaxError`.
test("calls below a head's minimum arity are refused, not left to raise a Python TypeError", () => {
  assert.throws(
    () => wolfram.lower("Binomial[5]"),
    (error) =>
      error.name === "WolframSyntaxError" &&
      /Binomial expects 2 arguments, got 1/.test(error.message),
  );
  assert.throws(
    () => wolfram.lower("PowerMod[2, 3]"),
    (error) =>
      error.name === "WolframSyntaxError" &&
      /PowerMod expects 3 arguments, got 2/.test(error.message),
  );
  assert.throws(
    () => wolfram.lower("FactorInteger[]"),
    (error) =>
      error.name === "WolframSyntaxError" &&
      /FactorInteger expects 1 argument, got 0/.test(error.message),
  );
  // Heads with a defaulted trailing argument (base 10) still require the
  // leading, non-defaulted one.
  assert.throws(
    () => wolfram.lower("IntegerExponent[]"),
    (error) =>
      error.name === "WolframSyntaxError" &&
      /IntegerExponent expects 1 to 2 arguments, got 0/.test(error.message),
  );
  // At or above the minimum, defaulted-argument heads still lower fine.
  assert.match(wolfram.lower("IntegerExponent[12]").source, /_wolfram\.IntegerExponent\(12\)/);
});
