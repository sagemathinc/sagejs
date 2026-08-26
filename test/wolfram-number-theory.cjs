// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createForeignFrontend } = require("../dist/tools/foreign");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "sagejs-wolfram-number-theory-"),
);

function run(filename) {
  return spawnSync(
    process.execPath,
    [sagejs, "--wolfram", filename],
    {
      cwd: temporaryDirectory,
      encoding: "utf8",
    },
  );
}

function execute(source, name) {
  const filename = join(temporaryDirectory, name);
  writeFileSync(filename, source);
  const result = run(filename);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

(async () => {
  try {
    const wolfram = await createForeignFrontend("wolfram");

    // Each head lowers to the expected Sage-side call.
    assert.match(wolfram.lower("LCM[6, 4]").source, /_wolfram\.LCM\(6, 4\)/);
    assert.match(
      wolfram.lower("ChineseRemainder[{2, 3}, {3, 5}]").source,
      /CRT_list\(\[2, 3\], \[3, 5\]\)/,
    );
    assert.match(
      wolfram.lower("JacobiSymbol[2, 15]").source,
      /jacobi_symbol\(2, 15\)/,
    );
    assert.match(
      wolfram.lower("KroneckerSymbol[5, 17]").source,
      /kronecker_symbol\(5, 17\)/,
    );
    assert.match(
      wolfram.lower("MultiplicativeOrder[2, 7]").source,
      /multiplicative_order\(2, 7\)/,
    );
    assert.match(
      wolfram.lower("PrimitiveRoot[7]").source,
      /primitive_root\(7\)/,
    );
    assert.match(
      wolfram.lower("ContinuedFraction[x]").source,
      /_wolfram\.ContinuedFraction\(x\)/,
    );
    assert.match(
      wolfram.lower("ContinuedFraction[x, 2]").source,
      /_wolfram\.ContinuedFraction\(x, 2\)/,
    );
    assert.match(
      wolfram.lower("FromContinuedFraction[{4, 2, 6, 7}]").source,
      /_wolfram\.FromContinuedFraction\(\[4, 2, 6, 7\]\)/,
    );
    assert.match(
      wolfram.lower("CoprimeQ[8, 9]").source,
      /_wolfram\.CoprimeQ\(8, 9\)/,
    );
    assert.match(
      wolfram.lower("PrimePowerQ[8]").source,
      /is_prime_power\(8\)/,
    );

    // Real execution, checked against Wolfram's documented values.
    const source = [
      "LCM[6, 4]",
      "LCM[2, 3, 4]",
      "LCM[]",
      "ChineseRemainder[{2, 3}, {3, 5}]",
      "ChineseRemainder[{2, 3, 2}, {3, 5, 7}]",
      "JacobiSymbol[2, 15]",
      "JacobiSymbol[5, 17]",
      "KroneckerSymbol[5, 17]",
      "KroneckerSymbol[3, -4]",
      "MultiplicativeOrder[2, 7]",
      "MultiplicativeOrder[3, 7]",
      "PrimitiveRoot[7]",
      "ContinuedFraction[415/93]",
      "ContinuedFraction[415/93, 2]",
      "FromContinuedFraction[{4, 2, 6, 7}]",
      "CoprimeQ[8, 9]",
      "CoprimeQ[6, 10, 15]",
      "PrimePowerQ[8]",
      "PrimePowerQ[10]",
      "Prime[10]",
      "",
    ].join("\n");
    const stdout = execute(source, "sample.wl");
    assert.equal(
      stdout,
      [
        "12",
        "12",
        "1",
        "8",
        "23",
        "1",
        "-1",
        "-1",
        "1",
        "3",
        "6",
        "3",
        "[4, 2, 6, 7]",
        "[4, 2]",
        "415/93",
        "True",
        "False",
        "True",
        "False",
        "29",
      ].join("\n"),
    );

    // Wolfram options are refused by name rather than silently lowered or
    // silently dropped: this branch does not implement Rule -> keyword-
    // argument lowering for the arithmetic heads (that machinery belongs to
    // PR #35 / origin/numerics/wolfram-options).
    assert.throws(
      () => wolfram.lower("LCM[6, 4, MyOption -> 1]"),
      (error) =>
        error.name === "WolframSyntaxError" &&
        error.message ===
          "LCM options are not supported yet: Rule expressions do not " +
            "lower to keyword arguments outside plot options",
    );
    assert.throws(
      () => wolfram.lower("PrimitiveRoot[7, 11]"),
      (error) =>
        error.name === "WolframSyntaxError" &&
        error.message ===
          "PrimitiveRoot options are not supported yet: Rule expressions " +
            "do not lower to keyword arguments outside plot options",
    );
    assert.throws(
      () => wolfram.lower("ContinuedFraction[x, 2, 3]"),
      (error) =>
        error.name === "WolframSyntaxError" &&
        error.message.startsWith("ContinuedFraction options are not supported yet"),
    );

    // Error cases: a real Sage-side error propagates through execution.
    const errorSource = "JacobiSymbol[2, 4]\n";
    const errorFilename = join(temporaryDirectory, "error.wl");
    writeFileSync(errorFilename, errorSource);
    const errorResult = run(errorFilename);
    assert.notEqual(errorResult.status, 0);
    assert.match(errorResult.stderr, /odd positive/);

    console.log("Wolfram number-theory head tests passed");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
