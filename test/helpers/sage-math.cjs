"use strict";

const { spawnSync } = require("node:child_process");

function sageMathOracle({
  root,
  environmentVariables = ["SAGE_BIN", "SAGE_EXECUTABLE"],
  fallback = "/home/user/sagelite/sage",
} = {}) {
  const command = environmentVariables
    .map((name) => process.env[name])
    .find((value) => typeof value === "string" && value.length > 0) ?? fallback;
  const result = spawnSync(
    command,
    ["-c", "from sage.all import ZZ; print('sagejs-sage-oracle-ok')"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  if (
    result.error !== undefined ||
    result.status !== 0 ||
    !result.stdout.split(/\r?\n/).includes("sagejs-sage-oracle-ok")
  ) {
    return null;
  }
  return command;
}

module.exports = { sageMathOracle };
