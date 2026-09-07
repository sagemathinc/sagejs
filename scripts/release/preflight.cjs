"use strict";

const fs = require("node:fs");
const os = require("node:os");

// Safety floors, not a claim about a campaign's peak scratch consumption.
// Stage-specific reservations and cross-checkout host leases are separate work.
const policy = Object.freeze({
  schema: "sagejs.release-preflight/v1",
  minimumNode: "22.22.2",
  minimumFreeBytes: 2 * 1024 ** 3,
  minimumFreeInodes: 8192,
});

function supportedNode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const actual = match.slice(1).map(Number);
  const minimum = policy.minimumNode.split(".").map(Number);
  for (let index = 0; index < actual.length; index++) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

function inspectPreflight({ root, environment = process.env,
  nodeVersion = process.versions.node, platform = process.platform,
  statfs = fs.statfsSync } = {}) {
  const failures = [];
  if (!supportedNode(nodeVersion)) failures.push(`Node ${policy.minimumNode} or newer is required`);
  const scratch = (platform === "win32" ? environment.TEMP || environment.TMP : environment.TMPDIR) || os.tmpdir();
  const filesystems = [];
  for (const [role, directory] of [["workspace", root], ["scratch", scratch]]) {
    try {
      const stat = statfs(directory, { bigint: true });
      const availableBytes = stat.bavail * stat.bsize;
      // Windows and some virtual filesystems do not expose inode counts.
      const availableInodes = stat.files > 0n ? stat.ffree : null;
      filesystems.push({ role, directory, availableBytes: availableBytes.toString(),
        availableInodes: availableInodes?.toString() ?? null });
      if (availableBytes < BigInt(policy.minimumFreeBytes)) failures.push(`${role}: less than 2 GiB free`);
      if (availableInodes !== null && availableInodes < BigInt(policy.minimumFreeInodes)) {
        failures.push(`${role}: fewer than ${policy.minimumFreeInodes} free inodes`);
      }
    } catch (error) {
      failures.push(`${role}: cannot inspect filesystem (${error.code || "probe failed"})`);
    }
  }
  return { schema: policy.schema, policy, checkedAt: new Date().toISOString(),
    nodeVersion, filesystems, passed: failures.length === 0, failures };
}

function requirePreflight(options) {
  const report = inspectPreflight(options);
  if (!report.passed) {
    const error = new Error(`release preflight failed: ${report.failures.join("; ")}`);
    error.code = "RELEASE_PREFLIGHT";
    error.report = report;
    throw error;
  }
  return report;
}

module.exports = { inspectPreflight, requirePreflight, supportedNode, policy };
