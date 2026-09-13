// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { isolatedEnvironment } = require("../scripts/run-python-compat.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const root = join(__dirname, "..");

test("CLI and fresh/cached lazy imports expose exact binder and body call sites", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-source-map-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const packages = join(directory, "packages");
  mkdirSync(packages);
  writeFileSync(join(packages, "mapped_fixture.py"), [
    "import traceback",
    "def target(one):",
    "    return one",
    "def body(one):",
    "    raise TypeError('inside')",
    "def probe(callback):",
    "    stack = traceback.extract_stack(limit=2)",
    "    try:",
    "        callback(1, 2)",
    "    except TypeError as error:",
    "        frames = traceback.extract_tb(error.__traceback__)",
    "        return stack[-1], frames[-1]",
    "def body_probe():",
    "    try:",
    "        body(1)",
    "    except TypeError as error:",
    "        return next(frame for frame in traceback.extract_tb(error.__traceback__) if frame.name == 'body' and frame.provenance == 'python-source')",
    "def operation_body():",
    "    return 1 + None",
    "def operation_probe():",
    "    try:",
    "        operation_body()",
    "    except TypeError as error:",
    "        frames = traceback.extract_tb(error.__traceback__)",
    "        return any(frame.provenance == 'generated' and frame.filename.startswith('sagejs-python://') for frame in frames)",
    "def invoke(callback):",
    "    return callback()",
    "def lambda_probe():",
    "    try:",
    "        invoke(lambda: invoke(lambda: 1 + None))",
    "    except TypeError as error:",
    "        return any(frame.provenance == 'generated' and frame.filename.startswith('sagejs-python://') for frame in traceback.extract_tb(error.__traceback__))",
    "def lambda_binder_probe():",
    "    try:",
    "        invoke(lambda required: required)",
    "    except TypeError as error:",
    "        return traceback.extract_tb(error.__traceback__)[-1].name",
    "def consume(iterator):",
    "    return next(iterator)",
    "def generator_probe():",
    "    try:",
    "        consume((1 + None for _ in [0]))",
    "    except TypeError as error:",
    "        return any(frame.provenance == 'generated' and frame.filename.startswith('sagejs-python://') for frame in traceback.extract_tb(error.__traceback__))",
    "",
  ].join("\n"));
  const filename = join(directory, "case.py");
  writeFileSync(filename, [
    "import traceback",
    "from mapped_fixture import probe, target, body_probe, operation_probe, lambda_probe, lambda_binder_probe, generator_probe",
    "stack, binding = probe(target)",
    "print(stack.lineno, stack.name, stack.line.strip())",
    "print(binding.lineno, binding.name, binding.line.strip())",
    "inside = body_probe()",
    "print(inside.lineno, inside.name, inside.line.strip())",
    "print(traceback.extract_stack()[-1].lineno)",
    "print('continued')",
    "print(operation_probe())",
    "print(lambda_probe())",
    "print(lambda_binder_probe())",
    "print(generator_probe())",
    "",
  ].join("\n"));
  const env = { ...isolatedEnvironment(directory), SAGEJS_SITE_PACKAGES: packages,
    XDG_CACHE_HOME: join(directory, "cache") };
  function run(label) {
    const result = spawnSync(process.execPath, [join(root, "bin/sagejs-source.cjs"), "--python", filename],
      { cwd: directory, env, encoding: "utf8", timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "7 probe stack = traceback.extract_stack(limit=2)\n" +
      "9 probe callback(1, 2)\n5 body raise TypeError('inside')\n8\ncontinued\nTrue\nTrue\ninvoke\nTrue\n");
  }
  run("fresh");
  run("cached");
  const records = [];
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.name.startsWith("mapped_fixture-") && entry.name.endsWith(".json")) {
        records.push(child);
      }
    }
  }
  visit(join(directory, "cache"));
  assert.equal(records.length, 1);
  const recordPath = records[0];
  const readRecord = () => JSON.parse(readFileSync(recordPath, "utf8"));
  const original = readRecord();
  assert.equal(original.pythonSourceMap.schema, "sagejs.python-source-map/v1");
  const damagedMap = structuredClone(original);
  damagedMap.pythonSourceMap.spans[0].end = original.javascript.length + 1;
  writeFileSync(recordPath, JSON.stringify(damagedMap));
  run("malformed map regenerates");
  assert.deepEqual(readRecord().pythonSourceMap, original.pythonSourceMap);
  const damagedBytecode = readRecord();
  damagedBytecode.cachedData = Buffer.from("invalid bytecode").toString("base64");
  writeFileSync(recordPath, JSON.stringify(damagedBytecode));
  run("rejected bytecode refreshes");
  assert.notEqual(readRecord().cachedData, damagedBytecode.cachedData);
  run("refreshed bytecode remains usable");
});

test("CPython oracle records the remaining capture-stack limit incompatibility", (t) => {
  const source = [
    "import traceback",
    "def leaf():",
    "    raise TypeError('body')",
    "def middle():",
    "    leaf()",
    "try:",
    "    middle()",
    "except TypeError as error:",
    "    for limit in [2, -2, 0]:",
    "        print(limit, [frame.name for frame in traceback.extract_tb(error.__traceback__, limit=limit)])",
    "",
  ].join("\n");
  const oracle = spawnSync(pythonExecutable(), ["-I", "-c", source], { encoding: "utf8", timeout: 10000 });
  if (oracle.error?.code === "ENOENT") { t.skip("CPython oracle is unavailable"); return; }
  assert.ifError(oracle.error);
  assert.equal(oracle.status, 0, oracle.stderr);
  assert.equal(oracle.stdout, "2 ['<module>', 'middle']\n-2 ['middle', 'leaf']\n0 []\n");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-traceback-limit-gap-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "case.py");
  writeFileSync(filename, source);
  const subject = spawnSync(process.execPath, [join(root, "bin/sagejs-source.cjs"), "--python", filename],
    { cwd: directory, env: isolatedEnvironment(directory), encoding: "utf8", timeout: 30000 });
  assert.ifError(subject.error);
  assert.equal(subject.status, 0, subject.stderr);
  assert.ok(subject.stdout.endsWith("0 []\n"));
  // This is a gap observation, NOT a differential-conformance pass. Do not lock
  // in today's incorrect result; a later unwind-boundary implementation should
  // make these outputs agree and remove the documented incompatibility.
  t.diagnostic(JSON.stringify({ behavior: subject.stdout === oracle.stdout ? "parity" : "known-capture-stack-limit-gap",
    cpython: oracle.stdout, sagejs: subject.stdout }));
});

test("CPython distinguishes a lambda binder from nested lambda body failures", (t) => {
  const source = [
    "import traceback",
    "def invoke(callback):",
    "    return callback()",
    "for callback in [lambda: invoke(lambda required: required), lambda: invoke(lambda: invoke(lambda: 1 + None))]:",
    "    try:",
    "        callback()",
    "    except TypeError as error:",
    "        frames = traceback.extract_tb(error.__traceback__)",
    "        print(frames[-1].name, sum(frame.name == '<lambda>' for frame in frames))",
  ].join("\n");
  const result = spawnSync(pythonExecutable(), ["-I", "-c", source], { encoding: "utf8", timeout: 10000 });
  if (result.error?.code === "ENOENT") { t.skip("CPython oracle is unavailable"); return; }
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "invoke 1\n<lambda> 3\n");
  // Sage's paired fresh/cache regression above preserves binder caller `invoke`
  // and body evidence as generated frames; it does not claim Python body naming.
});
