#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { basename, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { format } = require("node:util");
const { SCHEMA } = require("../tools/sage-doctest-fixture.cjs");

function normalized(text) {
  return text.replaceAll("\r\n", "\n").replace(/[ \t]+$/gm, "").trimEnd();
}

function ellipsisPattern(want) {
  return new RegExp(
    `^${want
      .split("...")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\s\\S]*")}$`,
  );
}

function matchesExpected(actual, want) {
  const observed = normalized(actual);
  const expected = normalized(want).replace(/^<BLANKLINE>$/gm, "");
  if (expected.startsWith("Traceback (most recent call last):")) {
    const significant = expected
      .split("\n")
      .filter((line) => line && line !== "...")
      .at(-1);
    return significant ? observed.includes(significant) : false;
  }
  if (expected.includes("...")) {
    return ellipsisPattern(expected).test(observed);
  }
  return observed === expected;
}

class FakeReadline {
  constructor() {
    this.listeners = new Map();
    this.history = [];
  }

  on(event, callback) {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
    return this;
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      callbacks.filter((candidate) => candidate !== callback),
    );
    return this;
  }

  emit(event, ...args) {
    for (const callback of this.listeners.get(event) ?? []) callback(...args);
  }

  setPrompt() {}
  prompt() {}
  write() {}
}

async function worker() {
  const request = JSON.parse(readFileSync(0, "utf8"));
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const Repl = require("../dist/tools/repl.js").default;
  const readline = new FakeReadline();
  let output = "";
  const capturingConsole = {};
  for (const method of ["log", "error", "warn", "info"]) {
    capturingConsole[method] = (...args) => {
      output += `${format(...args)}\n`;
    };
  }

  await Repl({
    console: capturingConsole,
    mockReadline: () => readline,
    terminal: false,
    show_js: false,
    histfile: false,
    ps1: "",
    ps2: "",
    sage: true,
  });

  process.stdout.write = (chunk, encoding, callback) => {
    output += Buffer.isBuffer(chunk) ? chunk.toString(encoding) : String(chunk);
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  const results = [];
  for (const example of request.examples) {
    output = "";
    const lines = example.source.replace(/\n$/, "").split("\n");
    for (const line of lines) readline.emit("line", line);
    readline.emit("line", "");
    results.push({ id: example.id, actual: output });
  }
  stdoutWrite(JSON.stringify(results));
}

function parseArguments(argv) {
  const options = {
    verbose: false,
    allowFailures: false,
    ownerRegexp: null,
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--verbose") {
      options.verbose = true;
    } else if (value === "--allow-failures") {
      options.allowFailures = true;
    } else if (value === "--expectations") {
      const filename = argv[++index];
      if (!filename || filename.startsWith("--")) {
        throw new Error("--expectations requires a filename");
      }
      options.expectations = filename;
    } else if (value === "--owner-regexp") {
      const pattern = argv[++index];
      if (!pattern || pattern.startsWith("--")) {
        throw new Error("--owner-regexp requires a regular expression");
      }
      options.ownerRegexp = new RegExp(pattern);
    } else if (value.startsWith("--")) {
      throw new Error(`unknown option: ${value}`);
    } else {
      positional.push(value);
    }
  }
  if (positional.length !== 1) {
    throw new Error(
      "usage: run-sage-doctests.cjs FIXTURE [--expectations FILE] " +
        "[--verbose] [--allow-failures] [--owner-regexp REGEXP]",
    );
  }
  options.fixture = positional[0];
  return options;
}

function runGroup(examples) {
  const result = spawnSync(process.execPath, [__filename, "--worker"], {
    cwd: resolve(__dirname, ".."),
    encoding: "utf8",
    input: JSON.stringify({ examples }),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `doctest worker failed\n${result.stdout}\n${result.stderr}`,
    );
  }
  return JSON.parse(result.stdout);
}

function detail(example, actual) {
  return [
    `  source: ${example.source.replaceAll("\n", "\n          ")}`,
    `  want:   ${JSON.stringify(normalized(example.want))}`,
    `  got:    ${JSON.stringify(normalized(actual))}`,
  ].join("\n");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const fixture = JSON.parse(readFileSync(resolve(options.fixture), "utf8"));
  if (fixture.schema !== SCHEMA) {
    throw new Error(`unsupported doctest fixture schema: ${fixture.schema}`);
  }
  const expectations = options.expectations
    ? JSON.parse(readFileSync(resolve(options.expectations), "utf8"))
    : { skip: {}, xfail: {} };
  if (
    expectations.fixture &&
    expectations.fixture !== basename(options.fixture)
  ) {
    throw new Error(
      `expectations are for ${expectations.fixture}, not ` +
        `${basename(options.fixture)}`,
    );
  }
  const skip = expectations.skip ?? {};
  const xfail = expectations.xfail ?? {};
  const counts = { pass: 0, fail: 0, skip: 0, xfail: 0, xpass: 0 };
  const allExamples = fixture.groups.flatMap(
    (group) => group.examples);
  const ids = new Set(
    allExamples.map((example) => example.id));
  if (ids.size !== allExamples.length) {
    throw new Error("doctest fixture contains duplicate example ids");
  }
  if (fixture.summary.examples !== allExamples.length) {
    throw new Error("doctest fixture summary does not match its examples");
  }
  const groups = fixture.groups.filter(
    (group) =>
      options.ownerRegexp === null ||
      options.ownerRegexp.test(group.owner),
  );
  const examples = groups.flatMap((group) => group.examples);
  for (const id of [...Object.keys(skip), ...Object.keys(xfail)]) {
    if (!ids.has(id)) {
      throw new Error(`expectation refers to unknown test: ${id}`);
    }
  }
  for (const id of Object.keys(skip)) {
    if (xfail[id]) throw new Error(`test is both skipped and xfailed: ${id}`);
  }

  for (const group of groups) {
    const runnable = group.examples.filter((example) => !skip[example.id]);
    const observed = new Map(
      runGroup(runnable).map((result) => [result.id, result.actual]),
    );
    for (const example of group.examples) {
      if (skip[example.id]) {
        counts.skip += 1;
        if (options.verbose) {
          process.stdout.write(`SKIP  ${example.id} — ${skip[example.id]}\n`);
        }
        continue;
      }
      const actual = observed.get(example.id) ?? "";
      const matches = matchesExpected(actual, example.want);
      if (xfail[example.id]) {
        const status = matches ? "xpass" : "xfail";
        counts[status] += 1;
        if (options.verbose || status === "xpass") {
          process.stdout.write(
            `${status.toUpperCase().padEnd(5)} ${example.id} — ` +
              `${xfail[example.id]}\n`,
          );
          if (status === "xpass") {
            process.stdout.write(`${detail(example, actual)}\n`);
          }
        }
      } else if (matches) {
        counts.pass += 1;
        if (options.verbose) process.stdout.write(`PASS  ${example.id}\n`);
      } else {
        counts.fail += 1;
        process.stdout.write(`FAIL  ${example.id}\n${detail(example, actual)}\n`);
      }
    }
  }

  process.stdout.write(
    `Sage doctests: ${counts.pass} passed, ${counts.xfail} xfailed, ` +
      `${counts.skip} skipped, ${counts.fail} failed, ${counts.xpass} xpassed ` +
    `(${examples.length} total)\n`,
  );
  if (
    !options.allowFailures &&
    (counts.fail > 0 || counts.xpass > 0)
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[2] === "--worker") {
  worker().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
} else if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { matchesExpected, normalized };
