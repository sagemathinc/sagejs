#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");
const { modernizePinnedSource } = require("./run-rh-corpus.cjs");

const root = resolve(__dirname, "..");
const corpus = join(root, "upstream-tests", "rh");

function parseArguments(argv) {
  const options = {
    allowFailures: false,
    timeout: 120_000,
    verbose: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--allow-failures") options.allowFailures = true;
    else if (value === "--verbose") options.verbose = true;
    else if (value === "--only") options.only = new RegExp(argv[++index]);
    else if (value === "--timeout") options.timeout = Number(argv[++index]);
    else throw new Error(`unknown option: ${value}`);
  }
  return options;
}

function loadJson(filename) {
  return JSON.parse(readFileSync(join(corpus, filename), "utf8"));
}

const capturePublicationOutput = `
_rh_saved_graphics = []

def _rh_validate_graphic(graphic):
    if isinstance(graphic, Graphics):
        if len(graphic) == 0:
            raise ValueError("captured Graphics object has no primitives")
        for primitive in graphic:
            if isinstance(primitive, Line) and len(primitive) == 0:
                raise ValueError("captured plot contains an empty sampled line")
        return
    if isinstance(graphic, GraphicsArray):
        if len(graphic) == 0:
            raise ValueError("captured GraphicsArray is empty")
        for item in graphic:
            _rh_validate_graphic(item)
        return
    raise TypeError(
        "save() captured a non-graphics object: " + repr(type(graphic))
    )

def _rh_capture_save(graphic, filename, options):
    _rh_validate_graphic(graphic)
    _rh_saved_graphics.append(graphic)
    return graphic

import sagejs.runtime as _rh_runtime
_rh_runtime.reflect.set(
    _rh_runtime.global_object,
    '__sagejs_graphics_save_hook__',
    _rh_capture_save,
)

def save(graphic, *args, **kwds):
    _rh_validate_graphic(graphic)
    _rh_saved_graphics.append(graphic)
    return graphic
`;

async function runFigure(figure, source, timeout) {
  const session = await createSage();
  try {
    await session.evaluate(source, {
      filename: "<rh-code.sage>",
      timeout: Math.max(timeout, 120_000),
    });
    await session.evaluate(capturePublicationOutput, {
      filename: "<rh-figure-capture>",
      timeout,
    });
    const started = performance.now();
    await session.evaluate(`${figure.name}('/tmp/sagejs-rh', 'pdf')`, {
      filename: `<${figure.name}>`,
      timeout,
    });
    const saved = Number(
      (await session.evaluate("len(_rh_saved_graphics)", { timeout })).repr,
    );
    if (!Number.isSafeInteger(saved) || saved < 1) {
      throw new Error("figure generator did not produce publication output");
    }
    return {
      durationMs: performance.now() - started,
      saved,
    };
  } finally {
    try {
      await session.close();
    } catch {
      // A timeout terminates the worker and therefore closes the session
      // before this cleanup path runs.
    }
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = loadJson("manifest.json");
  const expectations = loadJson("expectations.json");
  const figureExpectations = expectations.figures ?? {};
  const skip = figureExpectations.skip ?? {};
  const xfail = figureExpectations.xfail ?? {};
  const source = modernizePinnedSource(
    readFileSync(
      join(corpus, "source", "rh", "code", "code.sage"),
      "utf8",
    ),
  );
  const figures = manifest.canonical.figureGenerators.filter(
    (figure) =>
      !options.only ||
      options.only.test(figure.id) ||
      options.only.test(figure.name),
  );
  const ids = new Set(figures.map((figure) => figure.id));
  if (!options.only) {
    for (const id of [...Object.keys(skip), ...Object.keys(xfail)]) {
      if (!ids.has(id)) {
        throw new Error(`figure expectation refers to unknown target: ${id}`);
      }
    }
  }

  const counts = { pass: 0, fail: 0, skip: 0, xfail: 0, xpass: 0 };
  for (const figure of figures) {
    if (skip[figure.id]) {
      counts.skip += 1;
      if (options.verbose) {
        process.stdout.write(
          `SKIP  ${figure.name} — ${skip[figure.id]}\n`,
        );
      }
      continue;
    }

    let outcome;
    let failure;
    try {
      outcome = await runFigure(figure, source, options.timeout);
    } catch (error) {
      failure = error;
    }
    if (xfail[figure.id]) {
      const expectation = xfail[figure.id];
      const reason =
        typeof expectation === "string" ? expectation : expectation.reason;
      const expectedFailure =
        failure &&
        (typeof expectation === "string" ||
          !expectation.match ||
          new RegExp(expectation.match).test(
            `${failure.name ?? "Error"}: ${failure.message ?? failure}`,
          ));
      const status = failure
        ? expectedFailure
          ? "xfail"
          : "fail"
        : "xpass";
      counts[status] += 1;
      if (status === "fail") {
        process.stdout.write(
          `FAIL  ${figure.name} (${figure.id})\n` +
            `  expected: ${expectation.match}\n` +
            `  got: ${failure.name ?? "Error"}: ` +
            `${failure.message ?? failure}\n`,
        );
      } else if (options.verbose || status === "xpass") {
        process.stdout.write(
          `${status.toUpperCase().padEnd(5)} ${figure.name} — ` +
            `${reason}\n`,
        );
      }
    } else if (failure) {
      counts.fail += 1;
      process.stdout.write(
        `FAIL  ${figure.name} (${figure.id})\n` +
          `  ${failure.name ?? "Error"}: ${failure.message ?? failure}\n`,
      );
    } else {
      counts.pass += 1;
      if (options.verbose) {
        process.stdout.write(
          `PASS  ${figure.name} — ${outcome.saved} output(s), ` +
            `${outcome.durationMs.toFixed(0)} ms\n`,
        );
      }
    }
  }

  process.stdout.write(
    `RH figures: ${counts.pass} passed, ${counts.xfail} xfailed, ` +
      `${counts.skip} skipped, ${counts.fail} failed, ` +
      `${counts.xpass} xpassed (${figures.length} selected)\n`,
  );
  if (
    !options.allowFailures &&
    (counts.fail > 0 || counts.xpass > 0)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
