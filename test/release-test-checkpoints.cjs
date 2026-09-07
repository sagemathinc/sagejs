// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { openCheckpoints } = require("../scripts/release/test-checkpoints.cjs");
const { runFileQueue } = require("../scripts/run-test-tier.cjs");
const { parseTestMetadata } = require("../scripts/test-metadata.cjs");

function fixture(t, count = 2) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-file-checkpoints-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe", encoding: "utf8" }).trim();
  git("init"); git("config", "user.name", "Checkpoint test"); git("config", "user.email", "test@example.invalid");
  fs.mkdirSync(path.join(root, "test")); fs.mkdirSync(path.join(root, "build"));
  fs.writeFileSync(path.join(root, ".gitignore"), "build/\n");
  fs.writeFileSync(path.join(root, "helper.cjs"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(root, "build/runtime"), "1");
  const files = Array.from({ length: count }, (_, index) => `test/case-${index}.cjs`);
  for (const file of files) {
    fs.writeFileSync(path.join(root, file), '// sagejs-test-tier: unit\n// sagejs-test-resume-inputs: ["build/runtime"]\n' +
      'require("node:assert").equal(require("../helper.cjs"), Number(require("node:fs").readFileSync("build/runtime")));\n');
  }
  git("add", "."); git("commit", "-m", "fixture");
  const options = { root, files, concurrency: 1, runnerArguments: [], environment: { CHECKPOINT_TEST: "constant" } };
  return { root, files, git, options };
}

test("resume metadata is opt-in and rejects ambiguous or escaping closures", () => {
  assert.equal(parseTestMetadata("// sagejs-test-tier: unit\n").resumeInputs, undefined);
  assert.deepEqual(parseTestMetadata("// sagejs-test-tier: unit\n// sagejs-test-resume-inputs: []\n").resumeInputs, []);
  for (const value of ['null', '"dist"', '["../dist"]', '["/tmp"]', '["build"]', '["dist","dist"]', '["build/release-test-checkpoints"]']) {
    assert.throws(() => parseTestMetadata(`// sagejs-test-tier: unit\n// sagejs-test-resume-inputs: ${value}\n`), /invalid resume/);
  }
});

test("133 completed files survive an infrastructure failure; unfinished records never pass", (t) => {
  const { options, files } = fixture(t, 134);
  const first = openCheckpoints(options);
  for (const file of files.slice(0, 133)) first.passed(file, 1);
  // The queue drains/cancels active children and verifies immutable inputs even
  // when a later file fails. Only normally completed files have records.
  first.finish();
  const second = openCheckpoints(options);
  try {
    assert.equal(files.filter((file) => second.reusable(file)).length, 133);
    assert.equal(second.reusable(files[133]), null);
  } finally { second.finish(); }
});

test("helper, runtime, environment, arguments and concurrency changes invalidate", (t) => {
  const f = fixture(t);
  const first = openCheckpoints(f.options); first.passed(f.files[0], 1); first.finish();
  for (const override of [{ environment: { CHECKPOINT_TEST: "changed" } }, { runnerArguments: ["--test-name-pattern=partial"] }, { concurrency: 2 }, { fresh: true }]) {
    const session = openCheckpoints({ ...f.options, ...override });
    try { assert.equal(session.reusable(f.files[0]), null); } finally { session.finish(); }
  }
  fs.writeFileSync(path.join(f.root, "build/runtime"), "2");
  const runtime = openCheckpoints(f.options);
  try { assert.equal(runtime.reusable(f.files[0]), null); } finally { runtime.finish(); }
  fs.writeFileSync(path.join(f.root, "helper.cjs"), "module.exports = 2;\n");
  assert.throws(() => openCheckpoints(f.options), /clean worktree/);
  f.git("add", "helper.cjs"); f.git("commit", "-m", "changed helper");
  const source = openCheckpoints(f.options);
  try { assert.equal(source.reusable(f.files[0]), null); } finally { source.finish(); }
});

test("mutating declared artifacts invalidates every record from that attempt", (t) => {
  const f = fixture(t);
  const session = openCheckpoints(f.options); session.passed(f.files[0], 1);
  fs.writeFileSync(path.join(f.root, "build/runtime"), "changed");
  assert.throws(() => session.finish(), /inputs changed/);
  fs.writeFileSync(path.join(f.root, "build/runtime"), "1");
  const retry = openCheckpoints(f.options);
  try { assert.equal(retry.reusable(f.files[0]), null); } finally { retry.finish(); }
});

test("queue retries the failing file, reuses its passed sibling and accounts for all files", async (t) => {
  const f = fixture(t);
  const failure = "test/failure.cjs";
  fs.writeFileSync(path.join(f.root, failure), '// sagejs-test-tier: unit\n' +
    'const fs=require("node:fs"); if(!fs.existsSync("build/recovered")) process.exit(9);\n');
  f.git("add", failure); f.git("commit", "-m", "failure fixture");
  const files = [f.files[0], failure];
  const run = () => runFileQueue({ concurrency: 1, fallbackMilliseconds: 1, files,
    heartbeatMilliseconds: 10000, learned: { [f.files[0]]: 20, [failure]: 1 },
    runnerArguments: [], tier: "checkpoint-fixture", replayFailure: false, workingDirectory: f.root,
    checkpoints: openCheckpoints({ ...f.options, files }) });
  assert.notEqual(await run(), 0);
  fs.writeFileSync(path.join(f.root, "build/recovered"), "yes");
  const inspect = openCheckpoints({ ...f.options, files });
  try { assert.ok(inspect.reusable(f.files[0])); assert.equal(inspect.reusable(failure), null); }
  finally { inspect.finish(); }
  assert.equal(await run(), 0);
});

test("corrupt records and live unfinished attempts cannot authorize skipping", (t) => {
  const f = fixture(t);
  const session = openCheckpoints(f.options); session.passed(f.files[0], 1);
  assert.equal(session.reusable(f.files[0]), null, "live collecting attempt is not reusable");
  assert.throws(() => openCheckpoints(f.options), /already active/);
  session.finish();
  const directory = path.join(f.root, "build/release-test-checkpoints/files");
  fs.writeFileSync(path.join(directory, fs.readdirSync(directory)[0]), "partial JSON");
  const retry = openCheckpoints(f.options);
  try { assert.equal(retry.reusable(f.files[0]), null); } finally { retry.finish(); }
});
test("a failed fresh execution supersedes an earlier successful file", (t) => {
  const f = fixture(t);
  const first = openCheckpoints(f.options); first.passed(f.files[0], 1); first.finish();
  const fresh = openCheckpoints({ ...f.options, fresh: true });
  assert.equal(fresh.reusable(f.files[0]), null);
  fresh.started(f.files[0]); fresh.finish();
  const retry = openCheckpoints(f.options);
  try { assert.equal(retry.reusable(f.files[0]), null); } finally { retry.finish(); }
});
test("completed files from a terminated controller recover only after stale-owner inspection", (t) => {
  const f = fixture(t);
  const helper = path.join(f.root, "build/crashed-controller.cjs");
  fs.writeFileSync(helper, `const {openCheckpoints}=require(${JSON.stringify(require.resolve("../scripts/release/test-checkpoints.cjs"))});
    const options=${JSON.stringify(f.options)};
    const session=openCheckpoints(options);
    session.started(options.files[0]);
    require('node:child_process').execFileSync(process.execPath, [options.files[0]], {cwd:options.root});
    session.passed(options.files[0],1);
    process.exit(0);`);
  execFileSync(process.execPath, [helper]);
  assert.throws(() => openCheckpoints(f.options), /stale runner lock/);
  const lock = path.join(f.root, "build/release-test-checkpoints/active.lock");
  const owner = JSON.parse(fs.readFileSync(lock));
  assert.equal(require("../scripts/release/status.cjs").ownerState(owner), "missing");
  // This fixture's only owner and synchronous child are confirmed terminal.
  // Production deliberately requires this inspection rather than auto-unlock.
  fs.unlinkSync(lock);
  const retry = openCheckpoints(f.options);
  try { assert.ok(retry.reusable(f.files[0])); assert.equal(retry.reusable(f.files[1]), null); }
  finally { retry.finish(); }
});
