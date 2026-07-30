"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  createForeignFrontend,
  selectedForeignLanguage,
} = require("../dist/tools/foreign");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "sagejs-foreign-languages-"),
);

function run(language, filename, alias = language) {
  return spawnSync(
    process.execPath,
    [sagejs, `--${alias}`, filename],
    {
      cwd: temporaryDirectory,
      encoding: "utf8",
    },
  );
}

(async () => {
  try {
    const wolframSource = [
      "f[x_] := x^2 + 1;",
      "Table[f[n], {n, 1, 5}]",
      "FactorInteger[2025]",
      "Prime[10]",
      "PrimePi[100]",
      "",
    ].join("\n");
    const wolframFilename = join(temporaryDirectory, "sample.wl");
    writeFileSync(wolframFilename, wolframSource);
    const wolfram = await createForeignFrontend("wolfram");
    const wolframLowering = wolfram.lower(wolframSource);
    assert.equal(wolframLowering.ast.kind, "program");
    assert.match(wolframLowering.source, /def f\(x\):/);
    assert.match(wolframLowering.source, /_wolfram\.Table\(lambda n:/);
    const wolframExecution = run("wolfram", wolframFilename);
    assert.equal(wolframExecution.status, 0, wolframExecution.stderr);
    assert.equal(
      wolframExecution.stdout.trim(),
      [
        "[2, 5, 10, 17, 26]",
        "[[3, 4], [5, 2]]",
        "29",
        "25",
      ].join("\n"),
    );
    const mathematicaFilename = join(temporaryDirectory, "alias.wl");
    writeFileSync(mathematicaFilename, "Range[2, 6, 2]\n");
    const mathematicaExecution = run(
      "wolfram",
      mathematicaFilename,
      "mathematica",
    );
    assert.equal(
      mathematicaExecution.status,
      0,
      mathematicaExecution.stderr,
    );
    assert.equal(mathematicaExecution.stdout.trim(), "[2, 4, 6]");

    const matlabSource = [
      "A = [1 2; 3 4];",
      "A^2",
      "x = 1:2:7;",
      "x",
      "sin(x)",
      "sum(x)",
      "",
    ].join("\n");
    const matlabFilename = join(temporaryDirectory, "sample.matlab");
    writeFileSync(matlabFilename, matlabSource);
    const matlab = await createForeignFrontend("matlab");
    const matlabLowering = matlab.lower(matlabSource);
    assert.equal(matlabLowering.ast.kind, "program");
    assert.match(matlabLowering.source, /_np\.array\(\[\[1, 2\], \[3, 4\]\]\)/);
    assert.match(matlabLowering.source, /_matlab\.mpower\(A, 2\)/);
    const matlabExecution = run("matlab", matlabFilename);
    assert.equal(matlabExecution.status, 0, matlabExecution.stderr);
    assert.match(matlabExecution.stdout, /\[\[\s*7 10\]\s*\[\s*15 22\]\]/);
    assert.match(matlabExecution.stdout, /\[1 3 5 7\]/);
    assert.match(matlabExecution.stdout, /0\.84147098/);
    assert.match(matlabExecution.stdout, /\n16(?:\.0)?\s*$/);

    const mapleSource = [
      "f := x -> x^2 + 1:",
      "seq(f(n), n=1..5);",
      "ithprime(10);",
      "for i from 1 to 3 do",
      "    i^2;",
      "end do;",
      "if 2 < 3 then",
      "    5;",
      "else",
      "    6;",
      "end if;",
      "",
    ].join("\n");
    const mapleFilename = join(temporaryDirectory, "sample.mpl");
    writeFileSync(mapleFilename, mapleSource);
    const maple = await createForeignFrontend("maple");
    const mapleLowering = maple.lower(mapleSource);
    assert.equal(mapleLowering.ast.kind, "program");
    assert.match(mapleLowering.source, /f = lambda x:/);
    assert.match(mapleLowering.source, /_maple\.seq\(lambda n:/);
    const mapleExecution = run("maple", mapleFilename);
    assert.equal(mapleExecution.status, 0, mapleExecution.stderr);
    assert.equal(
      mapleExecution.stdout.trim(),
      ["[2, 5, 10, 17, 26]", "29", "1", "4", "9", "5"].join("\n"),
    );

    assert.throws(
      () => selectedForeignLanguage({ magma: true, matlab: true }),
      /choose only one foreign language frontend/,
    );
    assert.throws(
      () => wolfram.lower("Table[x, {x, 1,"),
      (error) => error.name === "WolframSyntaxError" && error.incomplete,
    );
    assert.throws(
      () => maple.lower("if true then"),
      (error) => error.name === "MapleSyntaxError" && error.incomplete,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log("Foreign-language frontend tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
