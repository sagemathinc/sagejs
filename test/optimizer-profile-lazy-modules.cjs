// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(
  ROOT,
  "test/fixtures/optimizer-development/profile-lazy",
);
const RUNNER = path.join(FIXTURE, "runner.cjs");

function run(payload, environment = {}) {
  const child = spawnSync(process.execPath, [RUNNER], {
    cwd: ROOT,
    env: {
      ...process.env,
      SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
      ...environment,
    },
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  const line = child.stdout.trim().split("\n").at(-1);
  assert.ok(line, `profile runner produced no JSON: ${child.stderr}`);
  const result = JSON.parse(line);
  if (!result.ok) {
    assert.fail(`profile runner failed: ${JSON.stringify(result.error)}\n${child.stderr}`);
  }
  assert.equal(child.status, 0, child.stderr);
  return result.value;
}

function importPrefix() {
  return `import sys\nsys.path.insert(0, ${JSON.stringify(FIXTURE)})\n`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function filesBelow(directory) {
  if (!fs.existsSync(directory)) return [];
  const answer = [];
  for (const name of fs.readdirSync(directory)) {
    const filename = path.join(directory, name);
    if (fs.statSync(filename).isDirectory()) answer.push(...filesBelow(filename));
    else answer.push(filename);
  }
  return answer;
}

test("transitive lazy modules publish exact current-source maps and script bindings", () => {
  const source = `${importPrefix()}from profile_lazy_chain import run\nrun(250000)`;
  const result = run({
    action: "profile",
    source,
    options: {
      filename: "test/fixtures/optimizer-development/profile-lazy/root.sage",
      samplingIntervalMicros: 100,
    },
    evaluateAfter: "2 + 3",
  });
  let expected = 0;
  for (let index = 0; index < 250000; index += 1) {
    expected = (expected + index) % 65537;
  }
  assert.equal(result.evaluation.repr, String(expected));
  const mapsByPath = new Map(result.sourceMaps.map((map) => [
    map.source.identity.path,
    map,
  ]));
  for (const relative of [
    "profile_lazy_chain/__init__.py",
    "profile_lazy_chain/middle.py",
    "profile_lazy_chain/leaf.py",
  ]) {
    const repositoryPath = `test/fixtures/optimizer-development/profile-lazy/${relative}`;
    const map = mapsByPath.get(repositoryPath);
    assert.ok(map, `missing map for ${repositoryPath}`);
    const text = fs.readFileSync(path.join(FIXTURE, relative), "utf8");
    assert.equal(map.source.identity.digest, sha256(text));
    assert.equal(map.source.bytes, Buffer.byteLength(text));
  }
  assert.equal(result.observation.artifacts.length, result.sourceMaps.length);
  assert.equal(
    result.observation.evidence.sampling.scripts.length,
    result.sourceMaps.length,
  );
  assert.equal(
    result.observation.evidence.sampling.mapBindings.length,
    result.sourceMaps.length,
  );
  assert.ok(result.observation.positionTickAccounting.attributed > 0);
  assert.match(result.afterError.message, /profile-instrumented lazy modules.*closed/);
});

test("profiling bypasses writable lazy caches without reading or rewriting them", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-profile-cache-"));
  const environment = {
    XDG_CACHE_HOME: path.join(temporary, "xdg"),
    SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: path.join(temporary, "precompiled"),
  };
  const source = `${importPrefix()}import profile_lazy_cache\nprofile_lazy_cache.VALUE`;
  assert.equal(run({ action: "evaluate", source }, environment).evaluation.repr, "17");
  const cacheFile = filesBelow(environment.XDG_CACHE_HOME).find((filename) =>
    filename.includes("profile_lazy_cache-") && filename.endsWith(".json"));
  assert.ok(cacheFile, "ordinary execution should publish a writable module cache");
  const record = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  record.javascript += '\nρσ_modules["profile_lazy_cache"].VALUE = 999;';
  fs.writeFileSync(cacheFile, JSON.stringify(record));
  assert.equal(run({ action: "evaluate", source }, environment).evaluation.repr, "999");
  const before = fs.readFileSync(cacheFile);
  const beforeStat = fs.statSync(cacheFile);
  const profiled = run({ action: "profile", source }, environment);
  assert.equal(profiled.evaluation.repr, "17");
  assert.deepEqual(fs.readFileSync(cacheFile), before);
  assert.equal(fs.statSync(cacheFile).mtimeMs, beforeStat.mtimeMs);
  assert.ok(profiled.sourceMaps.some((map) =>
    map.source.identity.path.endsWith("profile_lazy_cache.py")));

  const precompiledRoot = path.join(temporary, "production-precompiled");
  fs.mkdirSync(precompiledRoot, { recursive: true });
  const filenameMarker = "/__sagejs_lazy_modules__/__SAGEJS_MODULE_FILENAME__";
  const originalJavaScript = JSON.parse(before).javascript;
  const javascriptTemplate = originalJavaScript.replaceAll(
    JSON.stringify(record.filename),
    JSON.stringify(filenameMarker),
  ) + '\nρσ_modules["profile_lazy_cache"].VALUE = 777;';
  assert.ok(javascriptTemplate.includes(JSON.stringify(filenameMarker)));
  const precompiledFile = path.join(precompiledRoot, "profile_lazy_cache.json");
  fs.writeFileSync(precompiledFile, JSON.stringify({
    schema: "sagejs.lazy-module-template/v1",
    version: record.version,
    signature: record.signature,
    mode: "python",
    module: "profile_lazy_cache",
    package: false,
    filenameMarker,
    packagePathMarker: null,
    javascriptTemplate,
  }));
  const productionEnvironment = {
    XDG_CACHE_HOME: path.join(temporary, "production-xdg"),
    SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: precompiledRoot,
  };
  assert.equal(
    run({ action: "evaluate", source }, productionEnvironment).evaluation.repr,
    "777",
  );
  const precompiledBefore = fs.readFileSync(precompiledFile);
  assert.equal(
    run({ action: "profile", source }, productionEnvironment).evaluation.repr,
    "17",
  );
  assert.deepEqual(fs.readFileSync(precompiledFile), precompiledBefore);
});

test("preloaded lazy modules reject profiling before root execution", () => {
  const preload = `${importPrefix()}import profile_lazy_cache\nprofile_lazy_cache.VALUE`;
  const result = run({
    action: "preload-profile",
    preload,
    source: "raise AssertionError('profile root executed')",
  });
  assert.equal(result.preload.repr, "17");
  assert.match(result.profileError.message, /fresh evaluator.*lazy module is loaded/);
  assert.doesNotMatch(result.profileError.message, /profile root executed/);
  assert.equal(result.after.repr, "5");
});

test("failed imports clear the profile lifecycle and overlapping runs fail immediately", () => {
  const missing = run({
    action: "missing-then-profile",
    source: "import module_that_does_not_exist_for_optimizer_profile",
  });
  assert.equal(missing.firstError.name, "OptimizerProfileExecutionError");
  assert.equal(missing.second.repr, "5");

  const overlap = run({
    action: "overlap",
    source: "sum(i for i in range(1000000))",
  });
  assert.equal(overlap.first.status, "fulfilled");
  assert.equal(overlap.second.status, "rejected");
  assert.match(overlap.second.error.message, /optimizer profile is already active/);
});

test("raw JavaScript in a lazy Python module is rejected without cache publication", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-profile-raw-"));
  fs.writeFileSync(path.join(temporary, "profile_lazy_raw.py"), "%js 40 + 2\n");
  const environment = {
    XDG_CACHE_HOME: path.join(temporary, "xdg"),
    SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: path.join(temporary, "precompiled"),
  };
  const child = spawnSync(process.execPath, [RUNNER], {
    cwd: ROOT,
    env: { ...process.env, ...environment },
    input: JSON.stringify({
      action: "profile",
      source: `import sys\nsys.path.insert(0, ${JSON.stringify(temporary)})\nimport profile_lazy_raw`,
    }),
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  const result = JSON.parse(child.stdout.trim().split("\n").at(-1));
  assert.equal(result.ok, false);
  assert.match(result.error.message, /raw `%js` regions/);
  assert.equal(
    filesBelow(environment.XDG_CACHE_HOME)
      .filter((filename) => filename.includes("profile_lazy_raw")).length,
    0,
  );
});

test("authentic class-group factor-base source receives a profile sidecar", () => {
  const result = run({
    action: "profile",
    source: [
      'module = __import__("sagejs.number_fields.class_group_factor_base",',
      '    fromlist=["class_group_factor_base"])',
      "module._gcd(84, 30)",
    ].join("\n"),
    options: {
      filename:
        "test/fixtures/optimizer-development/profile-lazy/class-group-smoke.sage",
      samplingIntervalMicros: 500,
    },
  });
  assert.equal(result.evaluation.repr, "6");
  const map = result.sourceMaps.find((candidate) =>
    candidate.source.identity.path ===
      "src/lib/sagejs/number_fields/class_group_factor_base.py");
  assert.ok(map, "authentic class-group factor-base source must not remain unmatched");
  const source = fs.readFileSync(
    path.join(ROOT, "src/lib/sagejs/number_fields/class_group_factor_base.py"),
    "utf8",
  );
  assert.equal(map.source.identity.digest, sha256(source));
  assert.equal(map.source.bytes, Buffer.byteLength(source));
});
