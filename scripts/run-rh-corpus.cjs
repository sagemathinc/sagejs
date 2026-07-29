#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");
const { matchesExpected, normalized } = require("./run-sage-doctests.cjs");

const root = resolve(__dirname, "..");
const corpus = join(root, "upstream-tests", "rh");

function parseArguments(argv) {
  const options = {
    allowFailures: false,
    verbose: false,
    timeout: 30_000,
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

function modernizePinnedSource(source) {
  return source
    .replaceAll("xrange(", "range(")
    .replace(/(?<=\d)r\b/g, "")
    .replace(
      /^([ \t]*)print "Drawing %s\.\.\. "%fig,$/m,
      '$1print("Drawing %s... "%fig, end=" ")',
    )
    .replace(/^([ \t]*)print (.+)$/gm, "$1print($2)")
    .replace(
      /^([ \t]*)var\(['"]([A-Za-z_]\w*)['"]\)\s*$/gm,
      "$1$2 = var('$2')",
    )
    .replace(
      /^(\s*)([A-Za-z_]\w*)\(([^()\n]*)\)\s*=\s*(.+)$/gm,
      "$1$2 = $4",
    )
    .replace(
      /\b([A-Za-z_]\w*)\.has_key\(([^()\n]+)\)/g,
      "($2 in $1)",
    );
}

function loadJson(filename) {
  return JSON.parse(readFileSync(join(corpus, filename), "utf8"));
}

function endsWithAssignment(source) {
  const finalStatement = source.split(";").at(-1).trim();
  return /^[A-Za-z_]\w*(?:\.<[A-Za-z_]\w*>)?\s*=(?!=)/.test(
    finalStatement,
  );
}

function actualText(result, source) {
  let actual = result.stdout ?? "";
  if (
    result.repr &&
    result.repr !== "None" &&
    !result.display &&
    !endsWithAssignment(source)
  ) {
    actual += `${result.repr}\n`;
  }
  return actual;
}

function detail(example, actual) {
  return [
    `  source: ${example.source.replaceAll("\n", "\n          ")}`,
    `  want:   ${JSON.stringify(normalized(example.want))}`,
    `  got:    ${JSON.stringify(normalized(actual))}`,
  ].join("\n");
}

function matchesRhExpected(actual, wanted, approximation) {
  if (matchesExpected(actual, wanted)) return true;
  const collapse = (value) => normalized(value).replace(/\s+/g, " ");
  if (collapse(actual) === collapse(wanted)) return true;
  if (!approximation) return false;
  const actualNumber = Number(normalized(actual));
  const wantedNumber = Number(normalized(wanted));
  if (!Number.isFinite(actualNumber) || !Number.isFinite(wantedNumber)) {
    return false;
  }
  const absolute = approximation.absolute ?? 0;
  const relative = approximation.relative ?? 0;
  return (
    Math.abs(actualNumber - wantedNumber) <=
    Math.max(absolute, relative * Math.abs(wantedNumber))
  );
}

async function evaluateExample(session, example, timeout) {
  try {
    return actualText(
      await session.evaluate(example.source, { timeout }),
      example.source,
    );
  } catch (error) {
    return `${error.name ?? "Error"}: ${error.message ?? error}\n`;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const metadata = loadJson("SOURCE.json");
  const doctests = loadJson("code.doctests.json");
  const bookSession = loadJson("book-session.json");
  const expectations = loadJson("expectations.json");
  const source = readFileSync(
    join(corpus, "source", "rh", "code", "code.sage"),
    "utf8",
  );

  for (const fixture of [doctests, bookSession]) {
    if (fixture.source.revision !== metadata.revision) {
      throw new Error(`${basename(fixture.source.path)} revision is stale`);
    }
  }

  const examples = [
    ...doctests.groups.flatMap((group) => group.examples),
    ...bookSession.examples,
  ].filter(
    (example) =>
      !options.only ||
      options.only.test(example.id) ||
      options.only.test(example.source),
  );
  const ids = new Set(examples.map((example) => example.id));
  const skip = expectations.skip ?? {};
  const xfail = expectations.xfail ?? {};
  const approx = expectations.approx ?? {};
  const counts = { pass: 0, fail: 0, skip: 0, xfail: 0, xpass: 0 };

  for (const id of [
    ...Object.keys(skip),
    ...Object.keys(xfail),
    ...Object.keys(approx),
  ]) {
    if (!options.only && !ids.has(id)) {
      throw new Error(`expectation refers to unknown test: ${id}`);
    }
  }

  const session = await createSage();
  try {
    await session.evaluate(modernizePinnedSource(source), {
      timeout: Math.max(options.timeout, 120_000),
    });

    for (const example of examples) {
      if (skip[example.id]) {
        counts.skip += 1;
        if (options.verbose) {
          process.stdout.write(`SKIP  ${example.id} — ${skip[example.id]}\n`);
        }
        continue;
      }
      const actual = await evaluateExample(session, example, options.timeout);
      const matches = matchesRhExpected(
        actual,
        example.want,
        approx[example.id],
      );
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
        process.stdout.write(
          `FAIL  ${example.id}\n${detail(example, actual)}\n`,
        );
      }
    }
  } finally {
    await session.close();
  }

  process.stdout.write(
    `RH corpus: ${counts.pass} passed, ${counts.xfail} xfailed, ` +
      `${counts.skip} skipped, ${counts.fail} failed, ` +
      `${counts.xpass} xpassed (${examples.length} selected)\n`,
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
  modernizePinnedSource,
};
