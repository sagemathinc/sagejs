"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..", "..");
const schema = "sagejs.native-export-policy/v1";

function fail(filename, message) {
  throw new Error(`${filename}: ${message}`);
}

function substantive(value) {
  return typeof value === "string" && value.trim().length >= 30;
}

function loadNativeExportPolicy(options = {}) {
  const root = resolve(options.root || repositoryRoot);
  const filename = options.filename || join(
    root, "architecture", "native-export-policy.json",
  );
  if (!existsSync(filename)) fail(filename, "native export policy is missing");
  const document = JSON.parse(readFileSync(filename, "utf8"));
  if (document.schema !== schema) fail(filename, `expected schema ${schema}`);
  if (document.policy?.default !== "reject-unclassified") {
    fail(filename, "policy.default must be reject-unclassified");
  }
  const decisions = new Set(document.policy.decisions || []);
  if (decisions.has("legacy-handwritten-dynamic") || decisions.size < 5) {
    fail(filename, "policy must define reviewed decisions and prohibit generic legacy");
  }
  const families = new Map();
  for (const [id, family] of Object.entries(document.families || {})) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(filename, `invalid family ${id}`);
    if (!substantive(family.rationale)) {
      fail(filename, `family ${id} needs a substantive rationale`);
    }
    if (!substantive(family.fallback)) {
      fail(filename, `family ${id} needs a substantive fallback`);
    }
    if (!Array.isArray(family.oracles) || family.oracles.length === 0 ||
        family.oracles.some((item) => typeof item !== "string" || item.length === 0)) {
      fail(filename, `family ${id} needs correctness oracles`);
    }
    families.set(id, Object.freeze({ id, ...family }));
  }
  const byId = new Map();
  for (const entry of document.exports || []) {
    if (typeof entry.id !== "string" || !entry.id.startsWith("napi:")) {
      fail(filename, "every export needs a complete N-API boundary id");
    }
    if (byId.has(entry.id)) fail(filename, `duplicate export ${entry.id}`);
    if (!families.has(entry.family)) {
      fail(filename, `${entry.id} has unknown family ${entry.family}`);
    }
    if (!decisions.has(entry.decision)) {
      fail(filename, `${entry.id} has unknown decision ${entry.decision}`);
    }
    if (entry.note !== undefined && !substantive(entry.note)) {
      fail(filename, `${entry.id} note must be substantive when present`);
    }
    byId.set(entry.id, Object.freeze({ ...entry }));
  }
  const matrix = document.matrix_remediation;
  if (matrix?.scope !== "packages/flint/src/matrix.c" ||
      matrix.status !== "compliant-and-frozen" ||
      matrix.registered_exports !== 49) {
    fail(filename, "matrix remediation must freeze all 49 matrix.c exports");
  }
  if (!substantive(matrix.policy) ||
      !Array.isArray(matrix.declared_foreign_contracts) ||
      matrix.declared_foreign_contracts.length === 0) {
    fail(filename, "matrix remediation needs policy and declared contracts");
  }
  const matrixExports = new Map();
  for (const [groupId, group] of Object.entries(matrix.groups || {})) {
    if (!decisions.has(group.decision) || !substantive(group.rationale) ||
        !Array.isArray(group.exports) || group.exports.length === 0) {
      fail(filename, `matrix remediation group ${groupId} is incomplete`);
    }
    for (const exportName of group.exports) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(exportName)) {
        fail(filename, `invalid matrix export ${exportName}`);
      }
      if (matrixExports.has(exportName)) {
        fail(filename, `matrix export ${exportName} is assigned more than once`);
      }
      matrixExports.set(exportName, Object.freeze({
        group: groupId,
        decision: group.decision,
      }));
    }
  }
  if (matrixExports.size !== matrix.registered_exports) {
    fail(filename,
      `matrix remediation assigns ${matrixExports.size}, expected ` +
      `${matrix.registered_exports} exports`);
  }
  return Object.freeze({
    schema,
    root,
    filename,
    document,
    decisions,
    families,
    byId,
    matrixExports,
  });
}

function validateNativeExportPolicy(policy, exports, options = {}) {
  const filename = options.filename || policy.filename;
  const actual = new Set(exports.map((entry) => entry.id));
  const missing = exports.filter((entry) => !policy.byId.has(entry.id));
  const stale = [...policy.byId.keys()].filter((id) => !actual.has(id));
  if (missing.length > 0) {
    fail(filename,
      "unclassified N-API exports:\n  " + missing.map((item) => item.id).join("\n  "));
  }
  if (stale.length > 0) {
    fail(filename, "policy entries have no registered export:\n  " + stale.join("\n  "));
  }
  const classified = exports.map((entry) => {
    const reviewed = policy.byId.get(entry.id);
    const declared = entry.declaration !== undefined;
    if (declared !== (reviewed.decision === "declared-ffi")) {
      fail(filename,
        `${entry.id} declaration status requires decision ` +
        `${declared ? "declared-ffi" : "other than declared-ffi"}`);
    }
    return Object.freeze({
      ...entry,
      policy: reviewed,
      family: policy.families.get(reviewed.family),
    });
  });
  const actualMatrix = classified.filter((entry) =>
    policy.matrixExports.has(entry.export)
  );
  if (actualMatrix.length !== policy.document.matrix_remediation.registered_exports) {
    fail(filename,
      `matrix.c registers ${actualMatrix.length}, expected ` +
      `${policy.document.matrix_remediation.registered_exports} exports`);
  }
  for (const entry of actualMatrix) {
    const matrix = policy.matrixExports.get(entry.export);
    if (matrix === undefined) {
      fail(filename, `matrix export ${entry.export} lacks remediation`);
    }
    if (matrix.decision !== entry.policy.decision) {
      fail(filename,
        `matrix export ${entry.export} remediation decision ` +
        `${matrix.decision} disagrees with ${entry.policy.decision}`);
    }
  }
  for (const exportName of policy.matrixExports.keys()) {
    if (!actualMatrix.some((entry) => entry.export === exportName)) {
      fail(filename, `remediated matrix export ${exportName} is not registered`);
    }
  }
  return classified;
}

module.exports = {
  loadNativeExportPolicy,
  repositoryRoot,
  schema,
  validateNativeExportPolicy,
};
