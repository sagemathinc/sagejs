#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const { pnpmInvocation } = require("./pnpm-invocation.cjs");
const { formatDuration } = require("./run-test-tier.cjs");

const root = resolve(__dirname, "..");

const routine = [
  ["Architecture and generated-boundary checks", "architecture:check", 5],
  ["Compiler and runtime build", "build", 300],
  ["Startup regression budget", "test:startup:run", 15],
  ["Strict Python formatting and typing", "test:baselib:strict", 25],
  ["Portable unit tests", "test:portable", 30],
  ["Public API smoke tests", "test:smoke", 45],
];

const plans = {
  routine,
  ci: routine,
  full: [
    ...routine.slice(0, 4),
    ["Compiler compatibility corpus", "test:compiler", 240],
    ["Complete unit tier", "test:unit", 35],
    ["Complete host integration tier", "test:integration", 900],
    ["Complete native addon and performance tier", "test:native", 900],
    ["Generated documentation and examples", "docs:verify", 240],
    ["Pinned upstream compatibility samples", "test:upstream:run", 30],
    ["CoWasm compatibility corpus", "test:cowasm:run", 120],
  ],
};

function runPhase(phase, index, total, planStarted, laterExpectedMilliseconds) {
  const [label, script, expectedSeconds] = phase;
  return new Promise((resolvePromise, rejectPromise) => {
    const started = Date.now();
    process.stdout.write(
      `\n[test] [${index + 1}/${total}] ${label}\n` +
        `[test] command: pnpm ${script}; expected about ` +
        `${formatDuration(expectedSeconds * 1000)}\n`,
    );
    const invocation = pnpmInvocation([script]);
    const child = spawn(invocation.command, invocation.arguments, {
      cwd: root,
      env: process.env,
      shell: invocation.shell,
      stdio: "inherit",
    });
    const heartbeatSeconds = Number(
      process.env.SAGEJS_TEST_HEARTBEAT_SECONDS || 20,
    );
    const heartbeat = setInterval(() => {
      const phaseElapsed = Date.now() - started;
      const totalElapsed = Date.now() - planStarted;
      const remaining =
        Math.max(0, expectedSeconds * 1000 - phaseElapsed) +
        laterExpectedMilliseconds;
      process.stdout.write(
        `[test] still running ${index + 1}/${total} (${label}); ` +
          `phase ${formatDuration(phaseElapsed)}, total ` +
          `${formatDuration(totalElapsed)}, approximately ` +
          `${formatDuration(remaining)} remaining\n`,
      );
    }, heartbeatSeconds * 1000);
    heartbeat.unref();
    child.once("error", (error) => {
      clearInterval(heartbeat);
      rejectPromise(error);
    });
    child.once("exit", (status) => {
      clearInterval(heartbeat);
      resolvePromise({ status: status ?? 1, duration: Date.now() - started });
    });
  });
}

async function main(arguments_ = process.argv.slice(2)) {
  const [requested = "routine"] = arguments_;
  const plan = plans[requested];
  if (!plan) {
    console.error(
      `usage: node scripts/run-test-plan.cjs <${Object.keys(plans).join("|")}>`,
    );
    return 2;
  }
  const expectedMilliseconds =
    plan.reduce((sum, phase) => sum + phase[2], 0) * 1000;
  process.stdout.write(
    `\nSage.js ${requested} validation\n` +
      `  phases:   ${plan.length}\n` +
      `  expected: about ${formatDuration(expectedMilliseconds)} on a warm Linux ` +
      `developer build\n` +
      `  policy:   sequential phases; stop immediately on the first failure\n` +
      `  hint:     use pnpm test:full only for exhaustive pre-release validation\n`,
  );
  for (let index = 0; index < plan.length; index += 1) {
    process.stdout.write(
      `  ${index + 1}. ${plan[index][0]} (~${formatDuration(plan[index][2] * 1000)})\n`,
    );
  }

  const started = Date.now();
  for (let index = 0; index < plan.length; index += 1) {
    const laterExpectedMilliseconds =
      plan.slice(index + 1).reduce((sum, phase) => sum + phase[2], 0) * 1000;
    const result = await runPhase(
      plan[index],
      index,
      plan.length,
      started,
      laterExpectedMilliseconds,
    );
    if (result.status !== 0) {
      const skipped = plan.length - index - 1;
      process.stderr.write(
        `\n[test] FAILED phase ${index + 1}/${plan.length} after ` +
          `${formatDuration(Date.now() - started)}; ${skipped} later phases ` +
          `were not started.\n`,
      );
      if (process.env.GITHUB_ACTIONS) {
        process.stderr.write(
          `::error title=Sage.js validation failed::${plan[index][0]} failed; ` +
            `${skipped} later phases were stopped.\n`,
        );
      }
      return result.status;
    }
    process.stdout.write(
      `[test] PASS ${index + 1}/${plan.length}: ${plan[index][0]} ` +
        `(${formatDuration(result.duration)}); approximately ` +
        `${formatDuration(laterExpectedMilliseconds)} remaining\n`,
    );
  }
  process.stdout.write(
    `\n[test] PASS: ${requested} validation completed in ` +
      `${formatDuration(Date.now() - started)}\n`,
  );
  return 0;
}

if (require.main === module) {
  main().then(
    (status) => {
      process.exitCode = status;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}

module.exports = { main, plans };
