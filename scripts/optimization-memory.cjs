#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const ledger = require("../tools/optimization-engine/ledger.cjs");

function usage(message = null) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "usage:\n" +
    "  node scripts/optimization-memory.cjs build --input=<path> --output=<directory>\n" +
    "  node scripts/optimization-memory.cjs query --database=<sqlite> [--context=<json>] " +
      "[--category=<category>] [--mechanism=<key>] [--disposition=<status>] " +
      "[--binding-state=<state>]\n" +
    "  node scripts/optimization-memory.cjs report --input=<path> --context=<json> " +
      "[--repository-root=<path>] [--output=<json>]\n" +
    "  node scripts/optimization-memory.cjs check --input=<path> --context=<json> " +
      "[--repository-root=<path>]\n",
  );
  process.exit(message ? 2 : 0);
}

function parse(argv) {
  const command = argv[0];
  const options = Object.create(null);
  for (const argument of argv.slice(1)) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) usage(`unknown argument ${argument}`);
    options[match[1]] = match[2];
  }
  return { command, options };
}

function requireOption(options, name) {
  if (!options[name]) usage(`--${name} is required`);
  return options[name];
}

function json(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function output(value, filename = null) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (filename) fs.writeFileSync(filename, text);
  else process.stdout.write(text);
}

function main() {
  const { command, options } = parse(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") usage();
  if (command === "build") {
    const records = ledger.loadRecords([requireOption(options, "input")]);
    output(ledger.writeLedger(requireOption(options, "output"), records));
    return;
  }
  if (command === "query") {
    const context = options.context ? ledger.validateContext(json(options.context)) : null;
    if (options["binding-state"] && context === null) {
      usage("--binding-state requires --context");
    }
    const records = ledger.queryDatabase(requireOption(options, "database"), {
      category: options.category,
      mechanism: options.mechanism,
      disposition: options.disposition,
      bindingState: options["binding-state"],
    }, context, { repositoryRoot: options["repository-root"] || null });
    output(records);
    return;
  }
  if (command === "report" || command === "check") {
    const records = ledger.loadRecords([requireOption(options, "input")]);
    const context = ledger.validateContext(json(requireOption(options, "context")));
    const report = ledger.buildReport(records, context, {
      repositoryRoot: options["repository-root"] || null,
    });
    output(report, options.output || null);
    if (command === "check" && report.alerts.length > 0) process.exitCode = 1;
    return;
  }
  usage(`unknown command ${command}`);
}

main();
