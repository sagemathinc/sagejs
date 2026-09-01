// sagejs-test-tier: integration
// sagejs-test-portable
"use strict";

const assert = require("node:assert/strict");
const {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

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
    run(["inspect-foreign", "--language", "wolfram"], {
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
}

test("source CLI inspects qualified MATLAB and Wolfram lowering without execution", () => {
  qualifiedSurface((arguments_, options) => runSource(arguments_, options));

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
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
