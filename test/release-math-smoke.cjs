"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const script = join(root, "scripts", "release-math-smoke.cjs");
const {
  checkNames,
  classifyNativeSelections,
  isNativeImplementation,
  nativeSelection,
  parseArguments,
  releaseEnvironment,
  requiredNativeWitnesses,
  requiredNativeWitnessesForPlatform,
  runSmoke,
  runnerFor,
  terminateProcessTree,
  windowsTaskkill,
} = require(script);

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function fakeSmokeSource(selections = []) {
  return [
    '"use strict";',
    "if (process.argv.includes('--version')) {",
    "  console.log('sagejs 0.0.0-test');",
    "} else {",
    `  for (const name of ${JSON.stringify(checkNames)}) ` +
      "console.log('SAGEJS_RELEASE_CHECK ' + name);",
    ...selections.map(({ operation, implementation }) =>
      `  console.log(${JSON.stringify(
        `[sagejs native] ${operation} -> ${implementation}`,
      )});`),
    "  console.log('SAGEJS_RELEASE_SMOKE_OK');",
    "}",
  ].join("\n");
}

function writeFakeRunner(rootDirectory, source) {
  mkdirSync(join(rootDirectory, "bin"), { recursive: true });
  writeFileSync(join(rootDirectory, "bin", "sagejs"), source);
}

test("release mathematics smoke is authoritative and practical", {
  skip: !existsSync(
    join(root, "packages", "flint", "build", "Release", "sagejs_flint.node"),
  ),
}, () => {
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
  assert.deepEqual(report.isolation, {
    environment: "hermetic-v1",
    fresh_cache: true,
    fresh_home: true,
  });
  assert.ok([
    "explicit-fallback",
    "fallback-observed",
    "not-observed",
    "observed",
  ].includes(report.native.status));
  assert.equal(report.native.observed, report.native.status === "observed");
  assert.ok(Array.isArray(report.native.selections));
  assert.ok(Array.isArray(report.native.witnesses));
  assert.ok(Array.isArray(report.native.unknown));
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
  assert.equal(isNativeImplementation("not-native"), false);
  assert.equal(isNativeImplementation("future-native-backend"), false);
  assert.equal(nativeSelection("ordinary program output"), undefined);
  const classified = classifyNativeSelections([
    {
      operation: "Matrix.rank GF(97) 8x8",
      implementation: "future-native-backend",
    },
  ]);
  assert.equal(classified.status, "not-observed");
  assert.equal(classified.unknown.length, 1);
  assert.equal(
    requiredNativeWitnessesForPlatform("win32").some(
      ({ name }) => name === "binary-m4ri-resource",
    ),
    false,
  );
  assert.equal(
    classifyNativeSelections([], { platform: "win32" }).witnesses.length,
    requiredNativeWitnesses.length - 1,
  );
});

test("release mathematics smoke reports fallback and enforces named native witnesses", async (t) => {
  const fakeRoot = mkdtempSync(join(tmpdir(), "sagejs-release-smoke-fake-"));
  t.after(() => rmSync(fakeRoot, { recursive: true, force: true }));
  writeFakeRunner(fakeRoot, fakeSmokeSource([
    { operation: "witness", implementation: "dynamic-python-explicit" },
  ]));
  const options = parseArguments(["--source-root", fakeRoot]);
  const report = await runSmoke(options);
  assert.equal(report.native.observed, false);
  assert.equal(report.native.status, "explicit-fallback");
  await assert.rejects(
    () => runSmoke({ ...options, requireNative: true }),
    /fallback implementations/,
  );

  const nativeSelections = requiredNativeWitnesses.map((witness) => ({
    implementation: witness.implementations[0],
    operation: witness.operation,
  }));
  writeFakeRunner(fakeRoot, fakeSmokeSource(nativeSelections));
  const nativeReport = await runSmoke({ ...options, requireNative: true });
  assert.equal(nativeReport.native.required_satisfied, true);
  assert.deepEqual(nativeReport.native.fallback, []);
  assert.ok(nativeReport.native.witnesses.every(({ observed }) => observed));

  writeFakeRunner(fakeRoot, fakeSmokeSource([
    ...nativeSelections,
    { operation: "new operation", implementation: "future-native-backend" },
  ]));
  await assert.rejects(
    () => runSmoke({ ...options, requireNative: true }),
    /unclassified implementation names/,
  );

  writeFakeRunner(fakeRoot, fakeSmokeSource([
    ...nativeSelections,
    { operation: "unexpected fallback", implementation: "typed-python-dynamic-fallback" },
  ]));
  await assert.rejects(
    () => runSmoke({ ...options, requireNative: true }),
    /fallback implementations/,
  );
});

test("native smoke retains caller-owned state and sets runtime required policy", async (t) => {
  const fakeRoot = mkdtempSync(join(tmpdir(), "sagejs-release-smoke-state-"));
  const stateDirectory = join(fakeRoot, "retained-state");
  t.after(() => rmSync(fakeRoot, { recursive: true, force: true }));
  const nativeSelections = requiredNativeWitnesses.map((witness) => ({
    implementation: witness.implementations[0],
    operation: witness.operation,
  }));
  writeFakeRunner(fakeRoot, [
    '"use strict";',
    "const { writeFileSync } = require('node:fs');",
    "const { join } = require('node:path');",
    "if (process.argv.includes('--version')) console.log('sagejs 0.0.0-test');",
    "else {",
    "  if (process.env.SAGEJS_NATIVE_REQUIRED !== '1') process.exit(77);",
    "  writeFileSync(join(process.env.XDG_CACHE_HOME, 'native-cache'), 'retained');",
    `  for (const name of ${JSON.stringify(checkNames)}) ` +
      "console.log('SAGEJS_RELEASE_CHECK ' + name);",
    ...nativeSelections.map(({ operation, implementation }) =>
      `  console.log(${JSON.stringify(
        `[sagejs native] ${operation} -> ${implementation}`,
      )});`),
    "  console.log('SAGEJS_RELEASE_SMOKE_OK');",
    "}",
  ].join("\n"));
  const report = await runSmoke({
    ...parseArguments(["--source-root", fakeRoot]),
    requireNative: true,
    stateDirectory,
  });
  assert.equal(report.native.required_satisfied, true);
  assert.equal(
    readFileSync(join(stateDirectory, "cache", "native-cache"), "utf8"),
    "retained",
  );
  assert.equal(existsSync(join(stateDirectory, "release-math-smoke.sage")), false);
});

test("release mathematics smoke creates a hermetic home and cache", async (t) => {
  const fakeRoot = mkdtempSync(join(tmpdir(), "sagejs-release-smoke-env-"));
  t.after(() => rmSync(fakeRoot, { recursive: true, force: true }));
  writeFakeRunner(fakeRoot, [
    '"use strict";',
    "const { dirname, join } = require('node:path');",
    "if (process.argv.includes('--version')) {",
    "  console.log('sagejs 0.0.0-test');",
    "} else {",
    "  const runRoot = dirname(process.argv.at(-1));",
    "  const forbidden = [",
    "    'NODE_OPTIONS', 'NODE_PATH', 'SAGEJS_DYNAMIC_CACHE_DIR',",
    "    'SAGEJS_NATIVE_CACHE_DIR', 'SAGEJS_NATIVE_DISABLE',",
    "    'SAGEJS_NATIVE_MODE', 'SAGEJS_PRECOMPILED_MODULE_CACHE_DIR',",
    "  ];",
    "  if (forbidden.some((name) => process.env[name] !== undefined)) process.exit(71);",
    "  if (process.env.HOME !== join(runRoot, 'home')) process.exit(72);",
    "  if (process.env.USERPROFILE !== join(runRoot, 'home')) process.exit(73);",
    "  if (process.env.XDG_CACHE_HOME !== join(runRoot, 'cache')) process.exit(74);",
    "  if (process.env.SAGEJS_USE_SOURCE !== '1') process.exit(75);",
    `  for (const name of ${JSON.stringify(checkNames)}) ` +
      "console.log('SAGEJS_RELEASE_CHECK ' + name);",
    "  console.log('SAGEJS_RELEASE_SMOKE_OK');",
    "}",
  ].join("\n"));
  const contaminated = {
    ...process.env,
    NODE_OPTIONS: "--trace-warnings",
    NODE_PATH: "/foreign/node_modules",
    SAGEJS_DYNAMIC_CACHE_DIR: "/foreign/dynamic",
    SAGEJS_NATIVE_CACHE_DIR: "/foreign/native",
    SAGEJS_NATIVE_DISABLE: "1",
    SAGEJS_NATIVE_MODE: "dynamic",
    SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: "/foreign/modules",
  };
  const report = await runSmoke({
    ...parseArguments(["--source-root", fakeRoot]),
    environment: contaminated,
  });
  assert.equal(report.native.status, "not-observed");

  const scratch = mkdtempSync(join(tmpdir(), "sagejs-release-env-unit-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const environment = releaseEnvironment(
    scratch,
    runnerFor(parseArguments(["--executable", process.execPath])),
    contaminated,
  );
  assert.equal(environment.NODE_OPTIONS, undefined);
  assert.equal(environment.NODE_PATH, undefined);
  assert.equal(environment.SAGEJS_NATIVE_CACHE_DIR, undefined);
  assert.equal(environment.SAGEJS_USE_SOURCE, undefined);
  assert.equal(environment.SAGEJS_NATIVE_TRACE, "1");
  assert.equal(environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP, "0");
  assert.deepEqual(
    Object.keys(environment).filter((key) => key.startsWith("SAGEJS_")),
    ["SAGEJS_MODULE_CACHE_AUTO_CLEANUP", "SAGEJS_NATIVE_TRACE"],
  );
});

test("release mathematics timeout terminates launcher descendants", async (t) => {
  const fakeRoot = mkdtempSync(join(tmpdir(), "sagejs-release-smoke-timeout-"));
  const marker = join(fakeRoot, "descendant-survived");
  t.after(() => rmSync(fakeRoot, { recursive: true, force: true }));
  writeFakeRunner(fakeRoot, [
    '"use strict";',
    "const { spawn } = require('node:child_process');",
    "if (process.argv.includes('--version')) {",
    "  console.log('sagejs 0.0.0-test');",
    "} else {",
    "  spawn(process.execPath, ['-e', " + JSON.stringify(
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan'), 500); setTimeout(() => {}, 5000);`,
    ) + "], { stdio: 'ignore' });",
    "  setTimeout(() => {}, 5000);",
    "}",
  ].join("\n"));
  await assert.rejects(
    () => runSmoke({
      ...parseArguments(["--source-root", fakeRoot]),
      maxSeconds: 0.1,
    }),
    /release mathematics smoke timed out after 100ms/,
  );
  await delay(800);
  assert.equal(existsSync(marker), false, "timed-out descendant survived");
});

test("Windows process-tree termination uses taskkill and fails closed", () => {
  const calls = [];
  const child = {
    exitCode: null,
    kill: () => calls.push(["fallback-kill"]),
    pid: 1234,
  };
  const success = terminateProcessTree(child, {
    environment: { SystemRoot: "C:\\Windows" },
    platform: "win32",
    spawnSyncImpl: (command, arguments_, options) => {
      calls.push([command, arguments_, options]);
      return { error: undefined, status: 0, stderr: "" };
    },
  });
  assert.deepEqual(success, { method: "taskkill-/T-/F", ok: true });
  assert.equal(calls[0][0], windowsTaskkill({ SystemRoot: "C:\\Windows" }));
  assert.deepEqual(calls[0][1], ["/PID", "1234", "/T", "/F"]);

  const failed = terminateProcessTree(child, {
    environment: { SystemRoot: "C:\\Windows" },
    platform: "win32",
    spawnSyncImpl: () => ({
      error: new Error("taskkill unavailable"),
      status: null,
      stderr: "",
    }),
  });
  assert.equal(failed.ok, false);
  assert.match(failed.detail, /taskkill unavailable/);
  assert.deepEqual(calls.at(-1), ["fallback-kill"]);
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
