#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const service = require("../tools/optimization-engine/epoch-service.cjs");

const root = path.resolve(__dirname, "..");

function usage(message = null) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node scripts/optimization-epoch.cjs create (--workload FILE... | --workload-module MODULE:EXPORT) --profiler-protocol ID --profiler-calibration ID --output FILE [--component-file FILE] [--no-build]
  node scripts/optimization-epoch.cjs verify --manifest FILE [--allow-historical]
  node scripts/optimization-epoch.cjs scratch --manifest FILE --lane ID [--store-root DIR]
  node scripts/optimization-epoch.cjs ingest --manifest FILE --lane ID --document FILE... [--store-root DIR]
  node scripts/optimization-epoch.cjs seal --manifest FILE --lane ID... [--store-root DIR]
`);
  process.exit(message ? 1 : 0);
}

function argumentsFor(argv) {
  const result = { _: [], workload: [], document: [], lane: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (key === "no-build" || key === "allow-historical" || key === "help") {
      result[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) usage(`missing value for ${value}`);
    index += 1;
    if (key === "workload" || key === "document" || key === "lane") result[key].push(next);
    else result[key] = next;
  }
  return result;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.resolve(filename), "utf8"));
}

function writeJson(filename, value) {
  const resolved = path.resolve(filename);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function requireOption(options, key) {
  if (!options[key] || (Array.isArray(options[key]) && options[key].length === 0)) {
    usage(`--${key.replaceAll("_", "-")} is required`);
  }
  return options[key];
}

function workloadsFromModule(specification) {
  const separator = specification.lastIndexOf(":");
  if (separator <= 0 || separator === specification.length - 1) {
    usage("--workload-module must be MODULE:EXPORT");
  }
  const modulePath = specification.slice(0, separator);
  const exportName = specification.slice(separator + 1);
  const resolved = path.resolve(root, modulePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    usage("--workload-module must resolve inside the repository");
  }
  const factory = require(resolved)[exportName];
  if (typeof factory !== "function") {
    usage(`--workload-module export ${exportName} is not a function`);
  }
  const workloads = factory(root);
  if (!Array.isArray(workloads) || workloads.length === 0) {
    usage("--workload-module must produce a nonempty workload array");
  }
  return workloads;
}

function main(argv = process.argv.slice(2)) {
  const options = argumentsFor(argv);
  if (options.help) usage();
  const command = options._[0];
  if (command === "create") {
    if (options["workload-module"] && options.workload.length > 0) {
      usage("use either --workload or --workload-module, not both");
    }
    const workloads = options["workload-module"]
      ? workloadsFromModule(options["workload-module"])
      : requireOption(options, "workload").map(readJson);
    const components = options["component-file"] ? readJson(options["component-file"]) : [];
    const created = service.createEpoch({
      root,
      workloads,
      components,
      profiler: {
        protocolId: requireOption(options, "profiler-protocol"),
        calibrationId: requireOption(options, "profiler-calibration"),
      },
      build: !options["no-build"],
      argv: ["node", "scripts/optimization-epoch.cjs", ...argv],
    });
    writeJson(requireOption(options, "output"), created.epoch);
    process.stdout.write(`${created.epoch.id}\n`);
    return;
  }
  if (command === "verify") {
    const epoch = readJson(requireOption(options, "manifest"));
    const binding = service.verifyEpoch({
      epoch,
      root,
      requireCurrent: !options["allow-historical"],
    });
    process.stdout.write(`${JSON.stringify(binding)}\n`);
    return;
  }
  if (command === "scratch") {
    const epoch = readJson(requireOption(options, "manifest"));
    service.verifyEpoch({ epoch, root, requireCurrent: true });
    const directory = service.allocateLaneScratch({
      epoch,
      laneId: requireOption(options, "lane")[0],
      root,
      storeRoot: options["store-root"],
    });
    process.stdout.write(`${directory}\n`);
    return;
  }
  if (command === "ingest") {
    const epoch = readJson(requireOption(options, "manifest"));
    const result = service.ingestLaneEvidence({
      epoch,
      laneId: requireOption(options, "lane")[0],
      root,
      storeRoot: options["store-root"],
      documents: requireOption(options, "document").map(readJson),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === "seal") {
    const epoch = readJson(requireOption(options, "manifest"));
    const result = service.sealEvidenceStore({
      epoch,
      laneIds: requireOption(options, "lane"),
      root,
      storeRoot: options["store-root"],
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  usage(`unknown command ${command || "<missing>"}`);
}

if (require.main === module) main();

module.exports = Object.freeze({ argumentsFor, main, workloadsFromModule });
