// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { dashboardInputFiles, inputIdentity } = require("../scripts/optimizer-opportunity-dashboard.cjs");

test("optimizer source identity is independent of nested dependency build trees", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-dashboard-sources-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (name, source) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
    return file;
  };
  const library = put("src/lib/sagejs/numerics/optimization/backends/nlopt/api.py", "def solve(): return 1\n");
  const control = put("bench/optimizer-workloads/building/example.py", "for i in range(2): pass\n");
  const before = inputIdentity(root);
  for (const directory of ["build", "node_modules", ".native", "__pycache__"]) {
    put(`src/lib/sagejs/numerics/optimization/backends/nlopt/${directory}/source/test/t_python.py`,
      "raise RuntimeError('not a Sage.js library module')\n");
    put(`bench/optimizer-workloads/${directory}/generated.py`, "pass\n");
  }
  assert.deepEqual(new Set(dashboardInputFiles(root)), new Set([library, control]));
  assert.deepEqual(inputIdentity(root), before);
  fs.appendFileSync(library, "# real source change\n");
  assert.notDeepEqual(inputIdentity(root), before);
});
