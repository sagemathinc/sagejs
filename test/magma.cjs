"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const {
  createMagmaFrontend,
  MagmaSyntaxError,
} = require("../dist/tools/magma/frontend");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

function runMagma(source, extraArguments = []) {
  return spawnSync(
    process.execPath,
    [sagejs, "--magma", ...extraArguments],
    {
      cwd: root,
      encoding: "utf8",
      input: source,
    },
  );
}

function runMagmaFile(filename, extraArguments = []) {
  return spawnSync(
    process.execPath,
    [sagejs, "--magma", ...extraArguments, filename],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
}

async function checkAttachedFileReload(fixtureDirectory, filename) {
  const child = spawn(
    process.execPath,
    [sagejs, "--magma"],
    {
      cwd: fixtureDirectory,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  async function waitForOutput(expected) {
    const deadline = Date.now() + 10_000;
    while (!stdout.includes(expected)) {
      if (Date.now() >= deadline) {
        child.kill();
        assert.fail(
          `timed out waiting for ${JSON.stringify(expected)}; ` +
            `stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  child.stdin.write('Attach("attached.m");\n');
  child.stdin.write("print attached_value;\n");
  await waitForOutput("25\n");

  writeFileSync(filename, "attached_value := 40;\n");
  const newer = new Date(Date.now() + 2_000);
  utimesSync(filename, newer, newer);
  child.stdin.write("print attached_value;\n");
  await waitForOutput("40\n");

  child.stdin.end();
  const exitCode = await new Promise((resolve) => {
    child.once("exit", resolve);
  });
  assert.equal(exitCode, 0, stderr);
  assert.equal(stdout.trim(), ["25", "40"].join("\n"));
}

(async () => {
  const frontend = await createMagmaFrontend();
  const representative = `
Q := Rationals();
R<x> := PolynomialRing(Q);
f := x^4 - 1;
Factorization(f);
for n in [2..10] do
    if IsPrime(n) then
        print n;
    end if;
end for;
`;
  const lowered = frontend.lower(representative);
  assert.equal(lowered.ast.kind, "program");
  assert.equal(lowered.ast.body[1].kind, "generator-assignment");
  assert.match(lowered.source, /^import magma as _magma/m);
  assert.match(
    lowered.source,
    /R = _magma\.PolynomialRing\(Q, "x"\)\nx = R\.gen\(\)/,
  );
  assert.match(lowered.source, /for n in _magma\.magma_range\(2, 10\):/);

  const execution = runMagma(representative);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(
    execution.stdout.trim(),
    [
      "(x + 1) * (x - 1) * (x^2 + 1)",
      "2",
      "3",
      "5",
      "7",
    ].join("\n"),
  );

  const semantics = runMagma(`
a := [10, 20, 30];
print a[1], #a;
print 7 div 2, 7 mod 2, 3 eq 3;
for i := 5 to 1 by -2 do
    print i;
end for;
`);
  assert.equal(semantics.status, 0, semantics.stderr);
  assert.equal(
    semantics.stdout.trim(),
    ["10 3", "3 1 True", "5", "3", "1"].join("\n"),
  );

  assert.throws(
    () => frontend.lower("Q := ;"),
    (error) =>
      error instanceof MagmaSyntaxError &&
      !error.incomplete &&
      error.line === 1,
  );
  assert.throws(
    () => frontend.lower("if true then"),
    (error) =>
      error instanceof MagmaSyntaxError &&
      error.incomplete,
  );

  const emitted = runMagma("Factorization(84);", ["--emit-sage"]);
  assert.equal(emitted.status, 0, emitted.stderr);
  assert.match(emitted.stdout, /import magma as _magma/);
  assert.match(emitted.stdout, /print\(_magma\.Factorization\(84\)\)/);
  assert.match(emitted.stdout, /2\^2 \* 3 \* 7/);

  const fixtureDirectory = mkdtempSync(join(tmpdir(), "sagejs-magma-"));
  try {
    mkdirSync(join(fixtureDirectory, "nested"));
    writeFileSync(
      join(fixtureDirectory, "nested", "value.m"),
      "loaded_value := 17;\n",
    );
    writeFileSync(
      join(fixtureDirectory, "loaded.m"),
      'load "nested/value.m";\n',
    );
    writeFileSync(
      join(fixtureDirectory, "attached.m"),
      "attached_value := 25;\n",
    );
    const mainFilename = join(fixtureDirectory, "main.m");
    const fileSource = [
      'load "loaded.m";',
      'Attach("attached.m");',
      "print loaded_value + attached_value;",
      "",
    ].join("\n");
    writeFileSync(mainFilename, fileSource);

    const fileLowering = frontend.lower(fileSource, {
      filename: mainFilename,
    });
    assert.deepEqual(
      fileLowering.loadedFiles,
      [
        join(fixtureDirectory, "loaded.m"),
        join(fixtureDirectory, "nested", "value.m"),
        join(fixtureDirectory, "attached.m"),
      ],
    );
    assert.deepEqual(
      fileLowering.attachedFiles,
      [join(fixtureDirectory, "attached.m")],
    );

    const fileExecution = runMagmaFile(mainFilename);
    assert.equal(fileExecution.status, 0, fileExecution.stderr);
    assert.equal(fileExecution.stdout.trim(), "42");

    await checkAttachedFileReload(
      fixtureDirectory,
      join(fixtureDirectory, "attached.m"),
    );

    const firstRecursive = join(fixtureDirectory, "recursive-a.m");
    const secondRecursive = join(fixtureDirectory, "recursive-b.m");
    writeFileSync(firstRecursive, 'load "recursive-b.m";\n');
    writeFileSync(secondRecursive, 'Load("recursive-a.m");\n');
    assert.throws(
      () =>
        frontend.lower('load "recursive-a.m";', {
          filename: mainFilename,
        }),
      (error) =>
        error instanceof MagmaSyntaxError &&
        /recursive Magma load/.test(error.message),
    );

    assert.throws(
      () =>
        frontend.lower('Attach("missing.m");', {
          filename: mainFilename,
        }),
      (error) =>
        error instanceof MagmaSyntaxError &&
        /cannot attach 'missing\.m'/.test(error.message),
    );
    assert.throws(
      () => frontend.parse('attach "attached.m";'),
      (error) => error instanceof MagmaSyntaxError,
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }

  console.log("Magma frontend tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
