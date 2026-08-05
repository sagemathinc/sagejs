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
      "A(1,1)",
      "A(2,1)",
      "A(3)",
      "A(:,2)",
      "A(1:2,2)",
      "A(2,2) = 99;",
      "A",
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
    assert.match(matlabExecution.stdout, /\n16(?:\.0)?\n/);
    assert.match(
      matlabExecution.stdout,
      /\n1\n3\n2\n\[2, 4\]\n\[2, 4\]\n/,
    );
    assert.match(
      matlabExecution.stdout,
      /\[\[\s*1\s+2\]\s*\[\s*3\s+99\]\]\s*$/,
    );

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

    const macaulay2Source = [
      "R = QQ[x,y];",
      "I = ideal(x^2-y^3, x*y);",
      "gens gb I",
      "factor 2026",
      "",
    ].join("\n");
    const macaulay2Filename = join(temporaryDirectory, "sample.m2");
    writeFileSync(macaulay2Filename, macaulay2Source);
    const macaulay2 = await createForeignFrontend("macaulay2");
    const macaulay2Lowering = macaulay2.lower(macaulay2Source);
    assert.equal(macaulay2Lowering.ast.kind, "program");
    assert.match(
      macaulay2Lowering.source,
      /R = _m2\.polynomial_ring\(QQ, \("x", "y"\)\)/,
    );
    assert.match(macaulay2Lowering.source, /_m2\.gb\(I\)/);
    const macaulay2Execution = run(
      "macaulay2",
      macaulay2Filename,
    );
    assert.equal(
      macaulay2Execution.status,
      0,
      macaulay2Execution.stderr,
    );
    assert.equal(
      macaulay2Execution.stdout.trim(),
      ["(y^3 - x^2, x*y, x^3)", "2 * 1013"].join("\n"),
    );
    const m2Execution = run("macaulay2", macaulay2Filename, "m2");
    assert.equal(m2Execution.status, 0, m2Execution.stderr);
    assert.equal(m2Execution.stdout, macaulay2Execution.stdout);

    assert.throws(
      () => selectedForeignLanguage({ magma: true, matlab: true }),
      /choose only one foreign language frontend/,
    );
    assert.equal(
      selectedForeignLanguage({ macaulay2: true }),
      "macaulay2",
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
