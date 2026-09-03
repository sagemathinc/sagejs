#!/usr/bin/env node
"use strict";

const path = require("node:path");

const {
  provision,
  readCatalog,
} = require("./scipy-oracle-provisioner.cjs");

function usage() {
  return [
    "Usage: node scripts/numerical-computing/qualification/provision-scipy-oracle.cjs \\",
    "  --artifact-directory PATH --prefix PATH --provenance PATH [--platform ID] [--download]",
    "",
    "The provisioner authenticates exact checked-catalog inputs before parsing them, builds a",
    "link-free normalized prefix in a private sibling directory, verifies its complete closure,",
    "and only then publishes the prefix and immutable provenance record.",
  ].join("\n");
}

function options(argv) {
  if (argv[0] === "--") argv = argv.slice(1);
  const value = { download: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--download") value.download = true;
    else if (argument === "--help" || argument === "-h") value.help = true;
    else if (["--artifact-directory", "--prefix", "--provenance", "--platform"].includes(argument)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${argument} requires a value`);
      value[argument.slice(2).replaceAll("-", "_")] = next;
      index += 1;
    } else throw new Error(`unknown option ${argument}`);
  }
  if (!value.help) {
    for (const name of ["artifact_directory", "prefix", "provenance"]) {
      if (!value[name]) throw new Error(`--${name.replaceAll("_", "-")} is required`);
    }
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  const parsed = options(argv);
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }
  const root = path.resolve(__dirname, "..", "..", "..");
  const result = await provision({
    catalog: readCatalog(root),
    platform: parsed.platform,
    artifactDirectory: parsed.artifact_directory,
    prefixPath: parsed.prefix,
    provenancePath: parsed.provenance,
    download: parsed.download,
  });
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.numerical-scipy-oracle-provisioning-result/v1",
    platform: result.provenance.platform,
    prefix: result.prefix,
    provenance_id: result.provenance.id,
  })}\n`);
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, options, usage };
