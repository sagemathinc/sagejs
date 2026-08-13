"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const script = join(root, "scripts", "release-math-smoke.cjs");
const {
  checkNames,
  isNativeImplementation,
  nativeSelection,
  parseArguments,
  runSmoke,
  runnerFor,
} = require(script);

test("release mathematics smoke is authoritative and practical", () => {
  const sourceRoot = process.env.SAGEJS_RELEASE_TEST_SOURCE_ROOT || root;
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--source-root",
      sourceRoot,
      "--json",
      "--max-seconds",
      "30",
    ],
    { cwd: root, encoding: "utf8", timeout: 35_000 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema_version, 1);
  assert.equal(report.ok, true);
  assert.equal(report.runner.kind, "source-checkout");
  assert.match(report.runner.version, /^sagejs \S+$/);
  assert.match(report.host_platform, /^(?:aix|darwin|freebsd|linux|openbsd|sunos|win32)-/);
  assert.match(report.verifier_node, /^v\d+/);
  assert.deepEqual(report.checks, checkNames);
  assert.ok(report.seconds <= 30);
  assert.ok(["observed", "explicit-fallback"].includes(report.native.status));
  assert.equal(report.native.observed, report.native.status === "observed");
  assert.ok(Array.isArray(report.native.selections));
});

test("release mathematics native capability classification fails closed", () => {
  assert.deepEqual(
    nativeSelection(
      "[sagejs native] Matrix.rank GF(97) 8x8 -> typed-python-isolated",
    ),
    {
      operation: "Matrix.rank GF(97) 8x8",
      implementation: "typed-python-isolated",
    },
  );
  assert.equal(isNativeImplementation("typed-python-isolated"), true);
  assert.equal(isNativeImplementation("generated-flint-resource"), true);
  assert.equal(isNativeImplementation("dynamic-python-explicit"), false);
  assert.equal(isNativeImplementation("typed-python-dynamic-fallback"), false);
  assert.equal(nativeSelection("ordinary program output"), undefined);
});

test("release mathematics smoke reports fallback and enforces native", (t) => {
  const fakeRoot = mkdtempSync(join(tmpdir(), "sagejs-release-smoke-fake-"));
  t.after(() => rmSync(fakeRoot, { recursive: true, force: true }));
  mkdirSync(join(fakeRoot, "bin"));
  writeFileSync(
    join(fakeRoot, "bin", "sagejs"),
    [
      '"use strict";',
      "if (process.argv.includes('--version')) {",
      "  console.log('sagejs 0.0.0-test');",
      "} else {",
      `  for (const name of ${JSON.stringify(checkNames)}) ` +
        "console.log('SAGEJS_RELEASE_CHECK ' + name);",
      "  console.log('[sagejs native] witness -> dynamic-python-explicit');",
      "  console.log('SAGEJS_RELEASE_SMOKE_OK');",
      "}",
    ].join("\n"),
  );
  const options = parseArguments(["--source-root", fakeRoot]);
  const report = runSmoke(options);
  assert.equal(report.native.observed, false);
  assert.equal(report.native.status, "explicit-fallback");
  assert.throws(
    () => runSmoke({ ...options, requireNative: true }),
    /no isolated\/resource native selection/,
  );
});

test("release mathematics runner distinguishes source, npm, and SEA", () => {
  assert.equal(runnerFor(parseArguments([])).kind, "source-checkout");
  assert.equal(
    runnerFor(parseArguments(["--package-root", root])).kind,
    "npm-package",
  );
  assert.equal(
    runnerFor(parseArguments(["--executable", process.execPath])).kind,
    "standalone-executable",
  );
  assert.throws(
    () => parseArguments(["--package-root", root, "--executable", process.execPath]),
    /choose only one/,
  );
  assert.throws(() => parseArguments(["--max-seconds", "0"]), /positive/);
  assert.throws(() => parseArguments(["--unknown"]), /unknown argument/);
});

test("release mathematics smoke documents artifact invocation", () => {
  const result = spawnSync(process.execPath, [script, "--help"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--source-root PATH/);
  assert.match(result.stdout, /--package-root PATH/);
  assert.match(result.stdout, /--executable PATH/);
  assert.match(result.stdout, /--require-native/);
});
