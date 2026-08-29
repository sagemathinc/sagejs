#!/usr/bin/env node
"use strict";

const { resolve } = require("node:path");

const { pnpmInvocation } = require("./pnpm-invocation.cjs");
const { inspectBuildReceipt } = require("./build-receipt.cjs");
const {
  positiveInteger,
  runBufferedCommand,
} = require("./build-parallelism.cjs");
const { formatDuration } = require("./run-test-tier.cjs");

const root = resolve(__dirname, "..");

function phase(label, script, expectedSeconds, stage, options = {}) {
  return [label, script, expectedSeconds, {
    stage,
    weight: options.weight ?? 1,
    exclusive: options.exclusive ?? false,
  }];
}

function foundation(buildScript = "build") {
  return [
    phase("Fail-fast merge invariants", "merge:check", 8, 0, { exclusive: true }),
    phase("Build readiness", buildScript, 300, 1, { exclusive: true }),
    phase(
      "Generated documentation integrity",
      "merge:check:postbuild",
      10,
      2,
      { exclusive: true },
    ),
    phase("Generated FFI boundary checks", "ffi:check", 5, 3),
    phase("Startup regression budget", "test:startup:run", 15, 3, {
      exclusive: true,
    }),
    phase("Strict Python formatting and typing", "test:baselib:strict", 25, 3),
  ];
}

const routine = [
  ...foundation("build:check"),
  phase("Portable unit tests", "test:portable", 30, 3),
  phase("Public API smoke tests", "test:smoke", 5, 3),
];

const plans = {
  routine,
  ci: [
    ...foundation(),
    phase("Portable unit tests", "test:portable", 30, 3),
    phase("Public API smoke tests", "test:smoke", 5, 3),
  ],
  full: [
    phase("Fail-fast merge invariants", "merge:check", 8, 0, { exclusive: true }),
    phase("Build readiness", "build", 300, 1, { exclusive: true }),
    phase("Native dependency and addon readiness", "native:prepare", 300, 2, {
      exclusive: true,
    }),
    phase("Lazy Python module readiness", "python:precompile:run", 90, 3, {
      exclusive: true,
    }),
    phase(
      "Generated documentation integrity",
      "merge:check:postbuild",
      10,
      4,
      { exclusive: true },
    ),
    phase("Generated FFI boundary checks", "ffi:check", 5, 5),
    phase("Startup regression budget", "test:startup:run", 15, 5, {
      exclusive: true,
    }),
    phase("Strict Python formatting and typing", "test:baselib:strict", 25, 5),
    phase("Compiler compatibility corpus", "test:compiler", 240, 5),
    phase("Complete unit tier", "test:unit", 35, 5),
    phase("Complete host integration tier", "test:integration:run", 900, 5),
    phase("Generated documentation and examples", "docs:verify", 240, 5, {
      exclusive: true,
    }),
    phase("Pinned upstream compatibility samples", "test:upstream:run", 30, 5),
    phase("CoWasm compatibility corpus", "test:cowasm:run", 120, 5),
    phase(
      "Complete native addon correctness tier",
      "test:native:correctness:run",
      720,
      5,
      { weight: 2 },
    ),
    phase(
      "Native performance budgets",
      "test:native:performance:run",
      180,
      6,
      { exclusive: true },
    ),
  ],
};

function phaseMetadata(phase_) {
  return phase_[3] || { stage: 0, weight: 1, exclusive: false };
}

async function runPhase(
  phase_,
  index,
  total,
  planStarted,
  laterExpectedMilliseconds,
  signal,
) {
  const [label, script, expectedSeconds] = phase_;
  const started = Date.now();
  process.stdout.write(
    `\n[test] [${index + 1}/${total}] ${label}\n` +
      `[test] command: pnpm ${script}; expected about ` +
      `${formatDuration(expectedSeconds * 1000)}\n`,
  );
  const invocation = pnpmInvocation([script]);
  const showChildOutput =
    script.startsWith("build") ||
    script === "native:prepare" ||
    process.env.SAGEJS_TEST_VERBOSE === "1";
  const heartbeatSeconds = Number(
    process.env.SAGEJS_TEST_HEARTBEAT_SECONDS || 20,
  );
  const heartbeat = setInterval(() => {
    const phaseElapsed = Date.now() - started;
    const totalElapsed = Date.now() - planStarted;
    const remaining = Math.max(0, expectedSeconds * 1000 - phaseElapsed) +
      laterExpectedMilliseconds;
    process.stdout.write(
      `[test] still running ${index + 1}/${total} (${label}); ` +
        `phase ${formatDuration(phaseElapsed)}, total ` +
        `${formatDuration(totalElapsed)}, approximately ` +
        `${formatDuration(remaining)} remaining\n`,
    );
  }, heartbeatSeconds * 1000);
  heartbeat.unref();
  let result;
  try {
    result = await runBufferedCommand(invocation.command, invocation.arguments, {
      cwd: root,
      env: process.env,
      shell: invocation.shell,
      signal,
      capture: !showChildOutput,
      onStdout: showChildOutput ? (data) => process.stdout.write(data) : undefined,
      onStderr: showChildOutput ? (data) => process.stderr.write(data) : undefined,
    });
  } finally {
    clearInterval(heartbeat);
  }
  if (result.status !== 0 && !showChildOutput) {
    process.stderr.write(
      `[test] detailed output from failed phase ${index + 1}/${total}:\n`,
    );
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }
  return { status: result.status, duration: Date.now() - started };
}

function materializePlan(requested, buildStatus = null) {
  return plans[requested].map((phase_) => {
    if (phase_[1] !== "build:check") return [...phase_];
    const status = buildStatus ?? inspectBuildReceipt(root);
    return status.current
      ? [
          "Build readiness (reuse current successful build)",
          phase_[1],
          1,
          phase_[3],
        ]
      : [
          "Build readiness (rebuild required)",
          phase_[1],
          phase_[2],
          phase_[3],
        ];
  });
}

function planStages(plan) {
  const stages = new Map();
  plan.forEach((phase_, index) => {
    const stage = phaseMetadata(phase_).stage;
    const group = stages.get(stage) ?? [];
    group.push({ phase: phase_, index });
    stages.set(stage, group);
  });
  return [...stages.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, entries]) => entries);
}

async function runStage({
  capacity,
  entries,
  plan,
  planStarted,
}) {
  const controller = new AbortController();
  const pending = [...entries];
  const active = new Set();
  let used = 0;
  let failure = null;

  function start(entry) {
    const metadata = phaseMetadata(entry.phase);
    const weight = metadata.exclusive ? capacity : Math.min(capacity, metadata.weight);
    used += weight;
    const laterExpectedMilliseconds = plan
      .filter((_phase, index) => index > entry.index)
      .reduce((sum, phase_) => sum + phase_[2] * 1000, 0);
    const task = runPhase(
      entry.phase,
      entry.index,
      plan.length,
      planStarted,
      laterExpectedMilliseconds,
      controller.signal,
    ).then((result) => ({ entry, result, task, weight }));
    active.add(task);
  }

  while ((pending.length > 0 || active.size > 0) && failure === null) {
    let started = false;
    for (let index = 0; index < pending.length;) {
      const metadata = phaseMetadata(pending[index].phase);
      const weight = metadata.exclusive
        ? capacity
        : Math.min(capacity, metadata.weight);
      if (weight <= capacity - used) {
        start(pending.splice(index, 1)[0]);
        started = true;
      } else {
        index += 1;
      }
    }
    if (active.size === 0) break;
    if (!started || used >= capacity || pending.length === 0) {
      const completed = await Promise.race(active);
      active.delete(completed.task);
      used -= completed.weight;
      if (completed.result.status !== 0) {
        failure = completed;
        controller.abort();
      } else {
        process.stdout.write(
          `[test] PASS ${completed.entry.index + 1}/${plan.length}: ` +
            `${completed.entry.phase[0]} ` +
            `(${formatDuration(completed.result.duration)})\n`,
        );
      }
    }
  }
  if (failure !== null) await Promise.allSettled(active);
  return failure;
}

async function main(arguments_ = process.argv.slice(2)) {
  const [requested = "routine"] = arguments_;
  if (!plans[requested]) {
    console.error(
      `usage: node scripts/run-test-plan.cjs <${Object.keys(plans).join("|")}>`,
    );
    return 2;
  }
  const buildStatus = requested === "routine" ? inspectBuildReceipt(root) : null;
  const plan = materializePlan(requested, buildStatus);
  const capacity = positiveInteger(
    process.env.SAGEJS_TEST_PHASE_CONCURRENCY || 2,
    "SAGEJS_TEST_PHASE_CONCURRENCY",
  );
  const expectedMilliseconds = planStages(plan).reduce((total, entries) => {
    const exclusive = entries.some(({ phase: phase_ }) => phaseMetadata(phase_).exclusive);
    const work = entries.reduce((sum, { phase: phase_ }) => sum + phase_[2], 0);
    return total + (exclusive ? work : work / capacity) * 1000;
  }, 0);
  process.stdout.write(
    `\nSage.js ${requested} validation\n` +
      `  phases:      ${plan.length}\n` +
      `  concurrency: ${capacity} resource slots after build barriers\n` +
      `  expected:    about ${formatDuration(expectedMilliseconds)} on a warm Linux host\n` +
      `  failure:     cancel active sibling phases and stop immediately\n` +
      `  activity:    source and native builds are reused when receipts match\n` +
      `  output:      successful child logs are summarized; failure logs are replayed\n` +
      (buildStatus === null
        ? `  build:       forced for ${requested} validation\n`
        : buildStatus.current
          ? `  build:       current successful build will be reused\n`
          : `  build:       rebuild required (${buildStatus.reason})\n`) +
      `  hint:        use pnpm test:full only for exhaustive pre-release validation\n`,
  );
  for (let index = 0; index < plan.length; index += 1) {
    process.stdout.write(
      `  ${index + 1}. ${plan[index][0]} ` +
        `(~${formatDuration(plan[index][2] * 1000)})\n`,
    );
  }

  const started = Date.now();
  for (const entries of planStages(plan)) {
    const failure = await runStage({ capacity, entries, plan, planStarted: started });
    if (failure !== null) {
      const skipped = plan.length - failure.entry.index - 1;
      process.stderr.write(
        `\n[test] FAILED phase ${failure.entry.index + 1}/${plan.length} after ` +
          `${formatDuration(Date.now() - started)}; cancelled active siblings; ` +
          `${skipped} later phases were not completed.\n`,
      );
      if (process.env.GITHUB_ACTIONS) {
        process.stderr.write(
          `::error title=Sage.js validation failed::${failure.entry.phase[0]} failed.\n`,
        );
      }
      return failure.result.status;
    }
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

module.exports = {
  main,
  materializePlan,
  phaseMetadata,
  planStages,
  plans,
  runPhase,
  runStage,
};
