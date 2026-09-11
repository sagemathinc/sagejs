"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const { parse } = require("./diagnose.cjs");
const { select } = require("./prepare-panel-screen.cjs");

test("cost-screen selection is deterministic, stratified and independent of answers", () => {
  const records = Array.from({ length: 8 }, (_, i) => ({
    degree: 3, signature: [3, 0], label: `3.3.${i + 5}.1`,
    discriminant_absolute: i < 4 ? "1000000" : "1000000000000",
    coefficients: [String(i), "0", "0", "1"], class_number: null,
  }));
  const chosen = select({ records });
  assert.equal(chosen.length, 4);
  assert.deepEqual(chosen.map((r) => r.label), select({ records: [...records].reverse()
    .map((r) => ({ ...r, class_number: "999", sagejs_complete: false })) }).map((r) => r.label));
  assert.equal(new Set(chosen.map((r) => r.cell)).size, 2);
  assert.throws(() => select({ records }, 0));
  assert.throws(() => select({ records: [{ ...records[0], discriminant_absolute: "0" }] }));
});

test("diagnostic parsing preserves incompleteness and rejects duplicate results", () => {
  assert.equal(parse("FRONTIER_PHASE|import\n").result, null);
  assert.equal(parse('FRONTIER_RESULT|{"complete":false}\n').result.complete, false);
  assert.throws(() => parse("FRONTIER_RESULT|{}\nFRONTIER_RESULT|{}\n"), /multiple/);
  assert.throws(() => parse("FRONTIER_RESULT|not-json\n"));
  assert.deepEqual(parse('FRONTIER_PROGRESS|{"stage":"units"}\n').progress,
    [{ stage: "units" }]);
});

test("POSIX supervisor records usage and terminates an over-budget child", {
  skip: process.platform === "win32",
}, () => {
  const run = spawnSync("python3", [path.join(__dirname, "supervise.py"), "1",
    "python3", "-c", "import time; time.sleep(20)"], { encoding: "utf8", timeout: 8000 });
  assert.equal(run.status, 124, run.stderr);
  assert.match(run.stderr, /FRONTIER_USAGE\|/);
});

test("PARI compact screening across signatures and exact small power witnesses", {
  skip: !process.env.GP_ORACLE,
}, () => {
  const source = path.resolve(__dirname, "../pari-screen.gp");
  const run = spawnSync(process.env.GP_ORACLE, ["-fq"], {
    encoding: "utf8", timeout: 30000,
    env: { ...process.env, ...(process.env.GP_LIBRARY_PATH
      ? { LD_LIBRARY_PATH: process.env.GP_LIBRARY_PATH } : {}) },
    input: `read(${JSON.stringify(source)});
frontier_case("q23",[23,0,1],100,1,1);
frontier_case("c49",[1,-2,-1,1],100,1,1);
frontier_case("q283",[-1,-1,0,0,1],200,1,1);
frontier_case("q725",[1,1,-3,-1,1],200,1,1);
frontier_case("q-torsion8",[1,0,0,0,1],100,1,1);
b=bnfinit(x^2+23,1);w=frontier_class_power(b,1);
if(idealhnf(b,nffactorback(b,w))!=idealpow(b,b.gen[1],b.cyc[1]),error("power identity"));
print("SMALL_EXACT_IDENTITY_OK");
`,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stderr, /\*\*\*/);
  assert.equal(run.stdout.split("FRONTIER_RESULT|").length - 1, 5);
  assert.match(run.stdout, /SMALL_EXACT_IDENTITY_OK/);
  // Expansion is restricted to this tiny independent test, never the worker.
});

test("supervisor cleans a surviving grandchild after normal parent exit", {
  skip: process.platform !== "linux",
}, () => {
  const source = 'import subprocess,sys; p=subprocess.Popen([sys.executable,"-c","import time; time.sleep(20)"]); print(p.pid,flush=True)';
  const run = spawnSync("python3", [path.join(__dirname, "supervise.py"), "2", "python3", "-c", source],
    { encoding: "utf8", timeout: 8000 });
  assert.equal(run.status, 0, run.stderr);
  const pid = Number(run.stdout.trim());
  assert.ok(Number.isInteger(pid) && pid > 1);
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    assert.equal(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0], "Z");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
});
