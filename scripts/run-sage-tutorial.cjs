#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");
const {
  matchesExpected,
  normalized,
} = require("./run-sage-doctests.cjs");

const root = resolve(__dirname, "..");
const corpus = join(root, "upstream-tests", "sage", "tutorial");

function parseArguments(argv) {
  const options = {
    allowFailures: false,
    verbose: false,
    timeout: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;
    else if (value === "--allow-failures") options.allowFailures = true;
    else if (value === "--verbose") options.verbose = true;
    else if (value === "--only") options.only = new RegExp(argv[++index]);
    else if (value === "--file") options.file = new RegExp(argv[++index]);
    else if (value === "--section") {
      options.section = new RegExp(argv[++index]);
    } else if (value === "--timeout") {
      options.timeout = Number(argv[++index]);
    } else if (value === "--write-results") {
      options.results = resolve(argv[++index]);
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  return options;
}

function loadJson(filename) {
  return JSON.parse(readFileSync(join(corpus, filename), "utf8"));
}

function endsWithAssignment(source) {
  const finalStatement = source.split(";").at(-1).trim();
  return (
    /^(?:\([^)]*\)|[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*|[A-Za-z_]\w*\.<[^>]+>)\s*=(?!=)/.test(
      finalStatement,
    ) ||
    /^(?:def|class|for|while|if|with|try)\b/.test(finalStatement)
  );
}

function actualText(result, source, wanted) {
  let actual = result.stdout ?? "";
  if (
    result.repr &&
    result.repr !== "None" &&
    normalized(wanted) !== "" &&
    !endsWithAssignment(source)
  ) {
    actual += `${result.repr}\n`;
  }
  return actual;
}

function splitTopLevelSemicolons(source) {
  const statements = [];
  let start = 0;
  let quote;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if ("([{".includes(character)) {
      depth += 1;
    } else if (")]}".includes(character)) {
      depth -= 1;
    } else if (character === ";" && depth === 0) {
      statements.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  statements.push(source.slice(start).trim());
  return statements.filter(Boolean);
}

async function evaluate(session, example, timeout) {
  try {
    let actual = "";
    for (const statement of splitTopLevelSemicolons(example.source)) {
      actual += actualText(
        await session.evaluate(`${statement}\n`, { timeout }),
        statement,
        example.want,
      );
    }
    return actual;
  } catch (error) {
    return `${error.name ?? "Error"}: ${error.message ?? error}\n`;
  }
}

function collapseWhitespace(value) {
  return normalized(value).replace(/\s+/g, " ");
}

function matchesTutorialExpected(actual, wanted, rule) {
  if (matchesExpected(actual, wanted)) return true;
  if (collapseWhitespace(actual) === collapseWhitespace(wanted)) {
    return true;
  }
  if (
    rule?.accepted?.some(
      (candidate) => collapseWhitespace(actual) === collapseWhitespace(candidate),
    )
  ) {
    return true;
  }
  if (wanted.includes("Traceback (most recent call last):")) {
    const exception = wanted
      .trim()
      .split("\n")
      .filter((line) => line !== "...")
      .at(-1);
    if (matchesExpected(actual, `${exception}\n`)) return true;
  }
  if (!rule?.approx) return false;
  const numericText = (value) => normalized(value).replace(/\.\.\.$/, "");
  const observed = Number(numericText(actual));
  const expected = Number(numericText(wanted));
  if (!Number.isFinite(observed) || !Number.isFinite(expected)) return false;
  const absolute = rule.approx.absolute ?? 0;
  const relative = rule.approx.relative ?? 0;
  return (
    Math.abs(observed - expected) <=
    Math.max(absolute, relative * Math.abs(expected))
  );
}

function detail(example, actual) {
  return [
    `  section: ${example.section}`,
    `  source:  ${example.source.replaceAll("\n", "\n           ")}`,
    `  want:    ${JSON.stringify(normalized(example.want))}`,
    `  got:     ${JSON.stringify(normalized(actual))}`,
  ].join("\n");
}

function selectedGroups(fixture, options) {
  return fixture.groups
    .filter((group) => !options.file || options.file.test(group.owner))
    .map((group) => ({
      ...group,
      examples: group.examples.filter(
        (example) =>
          (!options.only ||
            options.only.test(example.id) ||
            options.only.test(example.source)) &&
          (!options.section || options.section.test(example.section)),
      ),
    }))
    .filter((group) => group.examples.length);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const fixture = loadJson("guided-tour.doctests.json");
  const source = loadJson("SOURCE.json");
  const expectations = loadJson("expectations.json");
  if (fixture.source.revision !== source.revision) {
    throw new Error("Guided Tour fixture revision does not match SOURCE.json");
  }

  const groups = selectedGroups(fixture, options);
  const selected = groups.flatMap((group) => group.examples);
  const allIds = new Set(
    fixture.groups.flatMap((group) => group.examples.map((example) => example.id)),
  );
  const skip = expectations.skip ?? {};
  const xfail = { ...(expectations.xfail ?? {}) };
  for (const group of expectations.xfailGroups ?? []) {
    const groupIds = group.ids ?? group.lines?.map(
      (line) => `${group.file}:${line}`,
    );
    if (!group.reason || !Array.isArray(groupIds) || !groupIds.length) {
      throw new Error(
        "each xfailGroups entry needs a reason and nonempty ids or file/lines",
      );
    }
    for (const id of groupIds) {
      if (xfail[id]) {
        throw new Error(`duplicate expected-failure classification: ${id}`);
      }
      xfail[id] = group.reason;
    }
  }
  const match = expectations.match ?? {};
  if (!options.only && !options.file && !options.section) {
    for (const id of [
      ...Object.keys(skip),
      ...Object.keys(xfail),
      ...Object.keys(match),
    ]) {
      if (!allIds.has(id)) {
        throw new Error(`expectation refers to unknown test: ${id}`);
      }
    }
  }

  const counts = {
    pass: 0,
    fail: 0,
    skip: 0,
    xfail: 0,
    xpass: 0,
  };
  const byFile = {};
  const bySection = {};
  const results = [];

  function record(example, status, actual, reason) {
    counts[status] += 1;
    const filename = basename(example.id.split(":")[0]);
    byFile[filename] ??= {};
    byFile[filename][status] = (byFile[filename][status] ?? 0) + 1;
    bySection[example.section] ??= {};
    bySection[example.section][status] =
      (bySection[example.section][status] ?? 0) + 1;
    results.push({
      id: example.id,
      section: example.section,
      status,
      reason,
      source: example.source,
      want: example.want,
      actual,
    });
  }

  for (const group of groups) {
    const session = await createSage();
    try {
      for (const example of group.examples) {
        const rstSkip = example.tags.find((tag) => tag.name === "skip");
        const reason = skip[example.id] ?? rstSkip?.value;
        if (reason) {
          record(example, "skip", "", reason);
          if (options.verbose) {
            process.stdout.write(`SKIP  ${example.id} — ${reason}\n`);
          }
          continue;
        }

        const actual = await evaluate(session, example, options.timeout);
        const matches = matchesTutorialExpected(
          actual,
          example.want,
          match[example.id],
        );
        if (xfail[example.id]) {
          const status = matches ? "xpass" : "xfail";
          record(example, status, actual, xfail[example.id]);
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
          record(example, "pass", actual);
          if (options.verbose) process.stdout.write(`PASS  ${example.id}\n`);
        } else {
          record(example, "fail", actual);
          if (options.verbose) {
            process.stdout.write(`FAIL  ${example.id}\n${detail(example, actual)}\n`);
          }
        }
      }
    } finally {
      await session.close();
    }
  }

  if (options.results) {
    writeFileSync(
      options.results,
      `${JSON.stringify(
        {
          schema: "sagejs.sage-tutorial-results/v1",
          source,
          counts,
          byFile,
          bySection,
          results,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
  for (const [filename, fileCounts] of Object.entries(byFile)) {
    const summary = Object.entries(fileCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ");
    process.stdout.write(`${filename}: ${summary}\n`);
  }
  process.stdout.write(
    `Sage Guided Tour: ${counts.pass} passed, ${counts.xfail} xfailed, ` +
      `${counts.skip} skipped, ${counts.fail} failed, ` +
      `${counts.xpass} xpassed (${selected.length} selected)\n`,
  );
  if (
    !options.allowFailures &&
    (counts.fail > 0 || counts.xpass > 0)
  ) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  actualText,
  matchesTutorialExpected,
};
