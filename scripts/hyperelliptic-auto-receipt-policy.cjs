#!/usr/bin/env node

"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  generateSourceBundle,
  queryAutoReceiptPolicy,
  readJson,
  verifyPolicy,
} = require("../tools/math-dispatch/hyperelliptic-auto-receipt-policy.cjs");

function usage() {
  return [
    "Usage:",
    "  node scripts/hyperelliptic-auto-receipt-policy.cjs bundle [--root ROOT] [--manifest FILE]",
    "  node scripts/hyperelliptic-auto-receipt-policy.cjs verify [--root ROOT] [--manifest FILE]",
    "  node scripts/hyperelliptic-auto-receipt-policy.cjs query --query FILE [--root ROOT] [--manifest FILE]",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) {
    process.stdout.write(`${usage()}\n`);
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const result = {
    command: argv[0],
    root: path.resolve(__dirname, ".."),
    manifest: null,
    query: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--root", "--manifest", "--query"].includes(argument)) {
      throw new Error(`unknown argument ${argument}`);
    }
    if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
    result[argument.slice(2)] = argv[++index];
  }
  result.root = path.resolve(result.root);
  result.manifest = path.resolve(
    result.root,
    result.manifest ?? "architecture/hyperelliptic-auto-receipt-policy.json",
  );
  if (result.query !== null) result.query = path.resolve(result.query);
  return result;
}

function sourceCommit(root) {
  const value = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error("git returned an invalid commit");
  return value;
}

function main() {
  const options = parse(process.argv.slice(2));
  const rawPolicy = readJson(options.manifest);
  if (options.command === "bundle") {
    const bundle = generateSourceBundle(
      options.root,
      rawPolicy.source_bundle_contract.paths,
    );
    process.stdout.write(
      `${JSON.stringify({ ...bundle, source_commit: sourceCommit(options.root) }, null, 2)}\n`,
    );
    return;
  }
  const policy = verifyPolicy(rawPolicy, {
    root: options.root,
    // The policy and receipts are necessarily committed after the frozen
    // mathematical source. The framed source-bundle digest authenticates the
    // current files; this field authenticates the exact benchmark revision.
    sourceCommit: rawPolicy.enabled ? rawPolicy.source_bundle.source_commit : null,
  });
  if (options.command === "verify") {
    process.stdout.write(
      `${JSON.stringify({
        schema: policy.schema,
        enabled: policy.enabled,
        source_bundle: policy.source_bundle,
        enabled_entries: policy.entries.filter((entry) => entry.enabled).map((entry) => entry.id),
        verified_receipts: policy.verified_receipts.length,
      }, null, 2)}\n`,
    );
    return;
  }
  if (options.command === "query") {
    if (options.query === null) throw new Error("query requires --query FILE");
    process.stdout.write(
      `${JSON.stringify(queryAutoReceiptPolicy(policy, readJson(options.query)), null, 2)}\n`,
    );
    return;
  }
  throw new Error(`unknown command ${options.command}`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
}
