#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_CATALOG,
  findWorkload,
  loadCatalog,
  requireCurrentBuild,
  workloadKey,
} = require("../tools/optimizer-development/workloads.cjs");

function encode(value) {
  return JSON.stringify(value, null, 2);
}

const root = path.resolve(__dirname, "..");

function parseArguments(argv) {
  const options = { command: null, id: null, profile: "standard", catalog: DEFAULT_CATALOG, output: null, allowDirty: false };
  const args = [...argv];
  if (args[0] === "--help" || args[0] === "-h") return { ...options, help: true };
  options.command = args.shift() ?? "list";
  if (new Set(["show", "run"]).has(options.command)) {
    options.id = args.shift() ?? null;
    if (!options.id) throw new Error(`${options.command} requires a workload ID`);
  }
  while (args.length) {
    const argument = args.shift();
    if (argument === "--allow-dirty") options.allowDirty = true;
    else if (argument === "--smoke") options.profile = "smoke";
    else if (argument === "--standard") options.profile = "standard";
    else if (argument === "--catalog" || argument === "--output") {
      if (!args.length) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = args.shift();
    } else throw new Error(`unknown argument ${argument}`);
  }
  if (!new Set(["list", "check", "show", "run"]).has(options.command)) {
    throw new Error(`unknown command ${options.command}`);
  }
  return options;
}

function usage() {
  return `Usage: node scripts/optimizer-workload.cjs COMMAND [WORKLOAD] [options]

Commands:
  list                  list immutable workload IDs and roles
  check                 validate the catalog, runners, and pinned fixture hashes
  show WORKLOAD         print one catalog entry
  run WORKLOAD          run one authenticated workload and print its receipt

Options:
  --smoke               use the short reviewed profile
  --standard            use the promotion profile (default)
  --catalog FILE        use another catalog through the same strict adapter
  --output FILE         write the run receipt as well as printing it
  --allow-dirty         allow a non-promotable development run
`;
}

async function main(argv = process.argv.slice(2), environment = {}) {
  const repository = environment.root ?? root;
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return null;
  }
  const catalog = loadCatalog(repository, options.catalog);
  if (options.command === "list") {
    const rows = catalog.workloads.map((workload) => ({ selector: workloadKey(workload), id: workload.id, class: workload.class, title: workload.title }));
    process.stdout.write(`${encode(rows)}\n`);
    return rows;
  }
  if (options.command === "check") {
    const answer = { schema: catalog.schema, id: catalog.id, workloads: catalog.workloads.length, status: "pass" };
    process.stdout.write(`${encode(answer)}\n`);
    return answer;
  }
  const workload = findWorkload(catalog, options.id);
  if (options.command === "show") {
    process.stdout.write(`${encode(workload)}\n`);
    return workload;
  }
  const preflight = (environment.requireCurrentBuild ?? requireCurrentBuild)(repository, { allowDirty: options.allowDirty });
  const runnerPath = path.join(repository, workload.runner.path);
  const runner = require(runnerPath);
  if (typeof runner.run !== "function") throw new Error(`${workload.runner.path} exports no run(context)`);
  const receipt = await runner.run({ root: repository, catalog, workload, profile: options.profile, preflight });
  const encoded = `${encode(receipt)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), encoded, "utf8");
  process.stdout.write(encoded);
  return receipt;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArguments, usage };
