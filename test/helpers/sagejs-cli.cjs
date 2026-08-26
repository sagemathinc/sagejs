"use strict";

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

function sagejsInvocation(root, args = [], environment = process.env) {
  if (environment.SAGEJS_TEST_EXECUTABLE) {
    return [environment.SAGEJS_TEST_EXECUTABLE, args];
  }
  if (process.platform === "win32") {
    return [
      process.execPath,
      [join(root, "bin", "sagejs-source.cjs"), ...args],
    ];
  }
  return [join(root, "bin", "sagejs"), args];
}

function spawnSagejsSync(root, args = [], options = {}) {
  const environment = { ...process.env, ...(options.env || {}) };
  const [command, commandArguments] = sagejsInvocation(
    root,
    args,
    environment,
  );
  return spawnSync(command, commandArguments, {
    ...options,
    env: environment,
  });
}

module.exports = { sagejsInvocation, spawnSagejsSync };
