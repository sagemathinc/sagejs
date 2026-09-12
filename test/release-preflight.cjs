// sagejs-test-tier: unit
// sagejs-test-portable: true
// sagejs-test-resume-inputs: []
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectPreflight, requirePreflight, supportedNode, policy } = require("../scripts/release/preflight.cjs");
const { ownerState } = require("../scripts/release/status.cjs");
const healthy = { bsize: 4096n, bavail: 2000000n, files: 100000n, ffree: 90000n };

test("preflight measures unprivileged available disk and supported Node versions", () => {
  for (const version of ["22.22.2", "22.23.0", "24.0.0", "26.5.1"]) assert.ok(supportedNode(version));
  for (const version of ["22.22.1", "22.21.9", "20.99.0", "26.0.0-rc1", "nonsense"]) assert.ok(!supportedNode(version));
  const paths = [];
  const report = inspectPreflight({ root: "repo", environment: { TMPDIR: "scratch", SECRET: "not-recorded" },
    platform: "linux", nodeVersion: "22.22.2", statfs(directory, options) {
      paths.push(directory); assert.deepEqual(options, { bigint: true }); return healthy;
    } });
  assert.equal(report.passed, true);
  assert.deepEqual(paths, ["repo", "scratch"]);
  assert.ok(!JSON.stringify(report).includes("not-recorded"));
  assert.equal(report.filesystems[0].availableBytes, String(healthy.bsize * healthy.bavail));
});

test("disk, inode, unsupported Node and inaccessible scratch fail before work", () => {
  for (const stat of [{ ...healthy, bavail: 0n }, { ...healthy, ffree: 0n }]) {
    assert.throws(() => requirePreflight({ root: "repo", statfs: () => stat }), { code: "RELEASE_PREFLIGHT" });
  }
  const report = inspectPreflight({ root: "repo", nodeVersion: "22.22.1", environment: { TMPDIR: "missing" },
    platform: "linux", statfs(directory) {
      if (directory === "missing") throw Object.assign(new Error("unavailable"), { code: "ENOENT" });
      return healthy;
    } });
  assert.equal(report.passed, false);
  assert.equal(report.failures.length, 2);
  assert.match(report.failures[1], /scratch.*ENOENT/);
});

test("Windows scratch precedence and unavailable inode measurements are explicit", () => {
  const paths = [];
  const report = inspectPreflight({ root: "repo", platform: "win32", environment: { TEMP: "temp", TMP: "tmp" },
    statfs(directory) { paths.push(directory); return { ...healthy, files: 0n, ffree: 0n }; } });
  assert.equal(report.passed, true);
  assert.deepEqual(paths, ["repo", "temp"]);
  assert.equal(report.filesystems[1].availableInodes, null);
  assert.equal(policy.minimumFreeBytes, 2 * 1024 ** 3);
});

test("status distinguishes live owner, missing PID and uncertain probes without recovery", () => {
  const owner = { host: "host", pid: 42 };
  assert.equal(ownerState(owner, { hostname: "host", probe: () => {} }), "live");
  for (const [code, expected] of [["ESRCH", "missing"], ["EPERM", "unknown"]]) {
    assert.equal(ownerState(owner, { hostname: "host", probe: () => { throw Object.assign(new Error(), { code }); } }), expected);
  }
  assert.equal(ownerState(owner, { hostname: "another", probe: () => { assert.fail("must not probe remote PID"); } }), "unknown");
  assert.equal(ownerState({ host: "host", pid: -1 }, { hostname: "host" }), "unknown");
});
