"use strict";

const { execFileSync } = require("node:child_process");
const { extname } = require("node:path");

function pnpmInvocation(
  arguments_,
  {
    npmExecPath = process.env.npm_execpath,
    platform = process.platform,
    nodeExecutable = process.execPath,
  } = {},
) {
  if (!npmExecPath) {
    return { command: "pnpm", arguments: arguments_, shell: false };
  }

  const extension = extname(npmExecPath).toLowerCase();
  if (extension === ".js" || extension === ".cjs" || extension === ".mjs") {
    return {
      command: nodeExecutable,
      arguments: [npmExecPath, ...arguments_],
      shell: false,
    };
  }

  return {
    command: npmExecPath,
    arguments: arguments_,
    shell:
      platform === "win32" &&
      (extension === ".cmd" || extension === ".bat"),
  };
}

function runPnpm(arguments_, options = {}) {
  const invocation = pnpmInvocation(arguments_);
  return execFileSync(invocation.command, invocation.arguments, {
    ...options,
    shell: invocation.shell,
  });
}

module.exports = { pnpmInvocation, runPnpm };
