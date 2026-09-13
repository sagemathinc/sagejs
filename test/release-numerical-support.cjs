// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { supportPaths, supportTarget, stageSupport } = require("../scripts/release/numerical-support.cjs");
const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [i, prefix] of supportPaths.entries()) {
    const filename = path.join(root, i === 0 ? prefix : `${prefix}/input.json`);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, `bound bytes ${i}`);
  }
  return root;
}
test("numerical support retains every generated input and never overwrites a prior snapshot", (t) => {
  const root = fixture(t);
  assert.equal(stageSupport(root).files, 4);
  for (const [i, prefix] of supportPaths.entries()) {
    const relative = i === 0 ? prefix : `${prefix}/input.json`;
    assert.equal(fs.readFileSync(path.join(root, "build/numerical-qualification/support", relative), "utf8"), `bound bytes ${i}`);
  }
  assert.throws(() => stageSupport(root), /already exists/);
});
test("a missing support root fails before any evidence snapshot is emitted", (t) => {
  const root = fixture(t);
  fs.rmSync(path.join(root, supportPaths[3]), { recursive: true });
  assert.throws(() => stageSupport(root), /ENOENT/);
  assert.equal(fs.existsSync(path.join(root, "build/numerical-qualification/support")), false);
});
test("support projection cannot overwrite arbitrary candidate source", () => {
  assert.equal(supportTarget(`${supportPaths[3]}/build-report.json`), `${supportPaths[3]}/build-report.json`);
  for (const name of ["package.json", "src/compiler.js", "../build/sea/sagejs", "build/sea/sagejs/extra", "dist/numerical/../../package.json", "dist\\numerical\\x"]) {
    assert.throws(() => supportTarget(name));
  }
});
test("staging rejects destination escape and linked destination ancestry", (t) => {
  const root = fixture(t);
  assert.throws(() => stageSupport(root, path.dirname(root)), /inside the checkout/);
  const target = path.join(root, "elsewhere");
  fs.mkdirSync(target);
  fs.symlinkSync(target, path.join(root, "build/numerical-qualification"), "junction");
  assert.throws(() => stageSupport(root), /destination/);
  assert.deepEqual(fs.readdirSync(target), []);
});
test("staging rejects linked input ancestry before copying", (t) => {
  const root = fixture(t);
  const target = path.join(root, "moved-numerical");
  fs.renameSync(path.join(root, "dist/numerical"), target);
  fs.symlinkSync(target, path.join(root, "dist/numerical"), "junction");
  assert.throws(() => stageSupport(root), /linked/);
  assert.equal(fs.existsSync(path.join(root, "build/numerical-qualification/support")), false);
});
test("CI retains NLopt evidence at both the producer and publication boundaries", () => {
  const source = fs.readFileSync(path.join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const jobs = parseWorkflow(source, ".github/workflows/ci.yml").jobs;
  const upload = (job, name) => jobs[job].steps.find((s) => s.with?.name === name).with.path.split(/\r?\n/);
  assert.ok(upload("numerical-browser-qualification", "numerical-qualification-browser-supplemental").includes(supportPaths[3]));
  for (const prefix of supportPaths) {
    assert.ok(upload("numerical-release-gate", "numerical-release-evidence").includes(`build/numerical-qualification/support/${prefix}`));
  }
  assert.ok(jobs["numerical-release-gate"].steps.some((s) => s.run?.trim() === "node scripts/release/numerical-support.cjs"));
});
