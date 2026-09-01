// sagejs-test-tier: integration
// sagejs-test-portable
"use strict";

const assert = require("node:assert/strict");
const {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const packageVersion = require("../package.json").version;

const root = join(__dirname, "..");
const sourceCli = join(root, "bin", "sagejs");
const suffix = process.platform === "win32" ? ".exe" : "";

function runSource(arguments_, options = {}) {
  return spawnSync(process.execPath, [sourceCli, ...arguments_], {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_USE_SOURCE: "1" },
    input: options.input,
  });
}

function runExecutable(executable, arguments_, options = {}) {
  return spawnSync(executable, arguments_, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    input: options.input,
  });
}

function report(result, expectedStatus) {
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^[^\n]+\n$/);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, "sagejs.foreign-lowering-inspection/v1");
  assert.equal(parsed.schema_version, 1);
  assert.deepEqual(Object.keys(parsed).sort(), [
    "error",
    "input",
    "language",
    "lowering",
    "schema",
    "schema_version",
    "success",
  ]);
  assert.deepEqual(Object.keys(parsed.input).sort(), ["filename", "kind"]);
  if (parsed.lowering !== null) {
    assert.deepEqual(Object.keys(parsed.lowering).sort(), [
      "attached_files",
      "has_result",
      "loaded_files",
      "source",
    ]);
  }
  if (parsed.error !== null) {
    assert.deepEqual(Object.keys(parsed.error).sort(), [
      "column",
      "incomplete",
      "line",
      "message",
      "name",
    ]);
  }
  return parsed;
}

function assertSafe(parsed, language, call) {
  assert.equal(parsed.success, true);
  assert.equal(parsed.language, language);
  assert.equal(parsed.error, null);
  assert.equal(typeof parsed.lowering.source, "string");
  assert.match(parsed.lowering.source, call);
  assert.equal(typeof parsed.lowering.has_result, "boolean");
  assert.deepEqual(parsed.lowering.loaded_files, []);
  assert.deepEqual(parsed.lowering.attached_files, []);
}

function assertRejected(parsed, language, name, message) {
  assert.equal(parsed.success, false);
  assert.equal(parsed.language, language);
  assert.equal(parsed.lowering, null);
  assert.equal(parsed.error.name, name);
  assert.match(parsed.error.message, message);
  assert.equal(Number.isInteger(parsed.error.line), true);
  assert.equal(Number.isInteger(parsed.error.column), true);
  assert.ok(parsed.error.line >= 1);
  assert.ok(parsed.error.column >= 1);
  assert.equal(typeof parsed.error.incomplete, "boolean");
}

function qualifiedSurface(run) {
  const version = run(["inspect-foreign", "--version"]);
  assert.equal(version.status, 0, version.stderr || version.stdout);
  assert.equal(version.stderr, "");
  assert.equal(version.stdout, `sagejs ${packageVersion}\n`);

  const magma = report(
    run([
      "inspect-foreign",
      "--language",
      "magma",
      "--source",
      "Factorization(84);",
    ]),
    0,
  );
  assertSafe(magma, "magma", /_magma\.Factorization\(84\)/);

  const macaulay2 = report(
    run([
      "inspect-foreign",
      "--language",
      "macaulay2",
      "--source",
      "factor 2026",
    ]),
    0,
  );
  assertSafe(macaulay2, "macaulay2", /factor\(2026\)/);

  const maple = report(
    run([
      "inspect-foreign",
      "--language",
      "maple",
      "--source",
      "ithprime(10);",
    ]),
    0,
  );
  assertSafe(maple, "maple", /_maple\.ithprime\(10\)/);

  const matlab = report(
    run([
      "inspect-foreign",
      "--language",
      "matlab",
      "--source",
      "linsolve([3 1;1 2],[9;8])",
    ]),
    0,
  );
  assertSafe(matlab, "matlab", /_matlab\.linsolve\(/);
  assert.deepEqual(matlab.input, { kind: "source", filename: null });

  const wolfram = report(
    run(["inspect-foreign", "--language", "wolfram", "-"], {
      input: "NIntegrate[x^2,{x,0,1}]",
    }),
    0,
  );
  assertSafe(wolfram, "wolfram", /_wolfram\.NIntegrate\(/);
  assert.deepEqual(wolfram.input, { kind: "stdin", filename: null });

  const invalidMatlab = report(
    run([
      "inspect-foreign",
      "--language=matlab",
      "--source=eig([1 0;0 1])",
    ]),
    1,
  );
  assertRejected(
    invalidMatlab,
    "matlab",
    "MatlabSyntaxError",
    /eig numerical syntax is not supported/,
  );

  const invalidWolfram = report(
    run([
      "inspect-foreign",
      "--language=wolfram",
      "--source=Fourier[{1,2,3}]",
    ]),
    1,
  );
  assertRejected(
    invalidWolfram,
    "wolfram",
    "WolframSyntaxError",
    /Fourier numerical syntax is not supported/,
  );

  const misuse = report(
    run(["inspect-foreign", "--language", "matlab", "--unknown-option"]),
    2,
  );
  assert.equal(misuse.success, false);
  assert.equal(misuse.lowering, null);
  assert.equal(misuse.error.name, "ForeignInspectionUsageError");
  assert.match(misuse.error.message, /unknown inspect-foreign option/);
  assert.equal(misuse.error.line, null);
  assert.equal(misuse.error.column, null);

  for (const arguments_ of [
    [
      "inspect-foreign",
      "--language",
      "matlab",
      "--language",
      "wolfram",
      "--source",
      "1+1",
    ],
    [
      "inspect-foreign",
      "--language",
      "matlab",
      "--source",
      "1+1",
      "--source",
      "2+2",
    ],
  ]) {
    const duplicate = report(run(arguments_), 2);
    assert.equal(duplicate.error.name, "ForeignInspectionUsageError");
    assert.match(duplicate.error.message, /may be specified only once/);
  }
}

function qualifiedMagmaFileResolution(run) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-foreign-inspect-magma-"));
  try {
    const programDirectory = join(directory, "program");
    const nestedDirectory = join(programDirectory, "nested");
    const unrelatedCwd = join(directory, "elsewhere");
    mkdirSync(nestedDirectory, { recursive: true });
    mkdirSync(unrelatedCwd);
    writeFileSync(join(nestedDirectory, "value.m"), "loaded_value := 17;\n");
    writeFileSync(
      join(programDirectory, "loaded.m"),
      'load "nested/value.m";\n',
    );
    writeFileSync(
      join(programDirectory, "attached.m"),
      "attached_value := 25;\n",
    );
    const mainFilename = join(programDirectory, "main.m");
    writeFileSync(
      mainFilename,
      [
        'load "loaded.m";',
        'Attach("attached.m");',
        "loaded_value + attached_value;",
        "",
      ].join("\n"),
    );

    const lowered = report(
      run(["inspect-foreign", "--language", "magma", mainFilename], {
        cwd: unrelatedCwd,
      }),
      0,
    );
    assert.equal(lowered.success, true);
    assert.equal(lowered.language, "magma");
    assert.deepEqual(lowered.input, { kind: "file", filename: "main.m" });
    assert.match(lowered.lowering.source, /loaded_value = 17/);
    assert.match(lowered.lowering.source, /attached_value = 25/);
    assert.deepEqual(lowered.lowering.loaded_files, [
      "attached.m",
      "loaded.m",
      "value.m",
    ]);
    assert.deepEqual(lowered.lowering.attached_files, ["attached.m"]);
    assert.doesNotMatch(JSON.stringify(lowered), new RegExp(directory));

    const brokenFilename = join(programDirectory, "broken.m");
    writeFileSync(brokenFilename, 'load "does-not-exist.m";\n');
    const broken = report(
      run(["inspect-foreign", "--language", "magma", brokenFilename], {
        cwd: unrelatedCwd,
      }),
      1,
    );
    assertRejected(
      broken,
      "magma",
      "MagmaSyntaxError",
      /cannot load 'does-not-exist\.m'/,
    );
    assert.deepEqual(broken.input, { kind: "file", filename: "broken.m" });
    assert.doesNotMatch(JSON.stringify(broken), new RegExp(directory));

    const unreadableFilename = join(programDirectory, "absent.m");
    const unreadable = report(
      run(["inspect-foreign", "--language", "magma", unreadableFilename], {
        cwd: unrelatedCwd,
      }),
      2,
    );
    assert.deepEqual(unreadable.input, {
      kind: "file",
      filename: "absent.m",
    });
    assert.equal(unreadable.error.name, "ForeignInspectionUsageError");
    assert.doesNotMatch(JSON.stringify(unreadable), new RegExp(directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function qualifiedNonExecution(run) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-foreign-inspect-sentinel-"));
  try {
    const marker = join(directory, "should-not-exist.txt");
    const source = `open('${marker}','w')`;
    const lowered = report(
      run([
        "inspect-foreign",
        "--language",
        "matlab",
        "--source",
        source,
      ]),
      0,
    );
    assertSafe(lowered, "matlab", /_matlab\.call_or_index\(open,/);
    assert.equal(existsSync(marker), false, "inspection executed lowered source");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("source CLI inspects qualified MATLAB and Wolfram lowering without execution", () => {
  qualifiedSurface((arguments_, options) => runSource(arguments_, options));
  qualifiedMagmaFileResolution((arguments_, options) =>
    runSource(arguments_, options)
  );
  qualifiedNonExecution((arguments_, options) => runSource(arguments_, options));

  const directory = mkdtempSync(join(tmpdir(), "sagejs-foreign-inspect-file-"));
  try {
    const filename = join(directory, "solve.m");
    writeFileSync(filename, "linsolve([1 0;0 1],[2;3])\n");
    const parsed = report(
      runSource(["inspect-foreign", "--language", "matlab", filename]),
      0,
    );
    assertSafe(parsed, "matlab", /_matlab\.linsolve\(/);
    assert.deepEqual(parsed.input, {
      kind: "file",
      filename: basename(filename),
    });
    assert.doesNotMatch(JSON.stringify(parsed), new RegExp(directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  const misuse = report(
    runSource([
      "inspect-foreign",
      "--language",
      "matlab",
      "--source",
      "1+1",
      "also.m",
    ]),
    2,
  );
  assert.equal(misuse.success, false);
  assert.equal(misuse.lowering, null);
  assert.equal(misuse.error.name, "ForeignInspectionUsageError");
  assert.equal(misuse.error.line, null);
  assert.equal(misuse.error.column, null);
});

const seaDirectory = process.env.SAGEJS_TEST_SEA_DIR ?? join(root, "build", "sea");
const builtSeaExecutables = ["sagejs", "sagepython"].map((name) =>
  join(seaDirectory, name + suffix)
);

test(
  "relocated Sage.js and SagePython SEA executables expose the same inspection contract",
  { skip: !builtSeaExecutables.every(existsSync) },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "sagejs-foreign-inspect-sea-"));
    try {
      for (const built of builtSeaExecutables) {
        const relocated = join(directory, basename(built));
        copyFileSync(built, relocated);
        if (process.platform !== "win32") chmodSync(relocated, 0o755);
        qualifiedSurface((arguments_, options) =>
          runExecutable(relocated, arguments_, { ...options, cwd: directory })
        );
        qualifiedMagmaFileResolution((arguments_, options) =>
          runExecutable(relocated, arguments_, options)
        );
        qualifiedNonExecution((arguments_, options) =>
          runExecutable(relocated, arguments_, options)
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
