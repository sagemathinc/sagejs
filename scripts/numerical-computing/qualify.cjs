#!/usr/bin/env node
"use strict";

const processEntryTime = process.hrtime.bigint();
const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  digestPath,
  fail,
  pretty,
  readJson,
  repositoryPath,
} = require("./common.cjs");
const {
  validateCorpus,
  validateMatrixPolicy,
} = require("./contracts.cjs");
const {
  bindCapabilityDraft,
  collectReceipt,
  verifyReceipt,
  writeImmutableJson,
} = require("./receipt.cjs");
const { buildReport, markdownReport } = require("./report.cjs");

const defaultRoot = path.resolve(__dirname, "..", "..");

function usage() {
  return `Usage:
  node scripts/numerical-computing/qualify.cjs corpus validate FILE [--root ROOT]
  node scripts/numerical-computing/qualify.cjs corpus discover DIRECTORY... [--root ROOT]
  node scripts/numerical-computing/qualify.cjs bind-capabilities \\
    --corpus FILE --adapter FILE --artifact NAME=PATH... --draft FILE --output FILE [--root ROOT]
  node scripts/numerical-computing/qualify.cjs run \\
    --corpus FILE --adapter FILE --capabilities FILE --artifact NAME=PATH... \\
    --output FILE [--root ROOT]
  node scripts/numerical-computing/qualify.cjs verify RECEIPT \\
    [--historical] [--require-clean] [--root ROOT]
  node scripts/numerical-computing/qualify.cjs report --policy FILE \\
    [--receipt FILE...] [--receipt-dir DIRECTORY...] [--json FILE] [--markdown FILE]

Paths naming corpus, adapter, capability, artifact, or discovery inputs are
repository-relative. The collector derives its platform and Node identity;
there is intentionally no platform override.
`;
}

function values(argv, name) {
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      if (index + 1 >= argv.length) fail(name, "requires a value");
      result.push(argv[index + 1]);
      index += 1;
    }
  }
  return result;
}

function value(argv, name, { required = false } = {}) {
  const found = values(argv, name);
  if (found.length > 1) fail(name, "may be supplied only once");
  if (required && found.length === 0) fail(name, "is required");
  return found[0] ?? null;
}

function rootOption(argv) {
  return path.resolve(value(argv, "--root") ?? defaultRoot);
}

function reportReceiptRecord(filename, root = defaultRoot) {
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(filename);
  const relative = path.relative(resolvedRoot, absolute);
  const receipt = repositoryPath(resolvedRoot, relative, "report receipt");
  return {
    path: receipt.relative,
    value: readJson(receipt.absolute),
  };
}

function positional(argv, skippedOptions) {
  const skip = new Set(skippedOptions);
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (skip.has(argv[index])) {
      index += 1;
    } else if (!argv[index].startsWith("--")) {
      result.push(argv[index]);
    }
  }
  return result;
}

function discoverCorpora(root, directories) {
  const files = [];
  function visit(filename, relative) {
    const status = fs.lstatSync(filename);
    if (status.isSymbolicLink()) fail("corpus discovery", `refuses symbolic link ${relative}`);
    if (status.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) {
        visit(path.join(filename, name), `${relative}/${name}`);
      }
    } else if (status.isFile() && relative.endsWith(".corpus.json")) {
      files.push(relative);
    }
  }
  for (const directory of [...new Set(directories)].sort()) {
    const resolved = repositoryPath(root, directory, "discovery directory");
    if (!fs.existsSync(resolved.absolute) || !fs.lstatSync(resolved.absolute).isDirectory()) {
      fail("discovery directory", `is not a directory: ${resolved.relative}`);
    }
    visit(resolved.absolute, resolved.relative);
  }
  const entries = [...new Set(files)].sort().map((filename) => {
    const corpus = validateCorpus(readJson(path.join(root, filename)));
    const binding = digestPath(root, filename, `corpus ${filename}`);
    return {
      path: filename,
      sha256: binding.sha256,
      id: corpus.id,
      version: corpus.version,
      domain: corpus.domain,
      cases: corpus.cases.length,
      source_paths: corpus.source_paths,
    };
  });
  const identities = new Set();
  for (const entry of entries) {
    const identity = `${entry.id}@${entry.version}`;
    if (identities.has(identity)) fail("corpus discovery", `duplicate ${identity}`);
    identities.add(identity);
  }
  return {
    schema: "sagejs.numerical-qualification-corpus-discovery/v1",
    entries,
  };
}

function receiptFilesFromDirectory(directory) {
  const result = [];
  function visit(filename) {
    const status = fs.lstatSync(filename);
    if (status.isSymbolicLink()) fail("receipt directory", `refuses symbolic link ${filename}`);
    if (status.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) visit(path.join(filename, name));
    } else if (status.isFile() && filename.endsWith(".receipt.json")) {
      result.push(filename);
    }
  }
  visit(path.resolve(directory));
  return result;
}

function writeDerived(filename, content) {
  const destination = path.resolve(filename);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv.includes("--help")) {
    process.stdout.write(usage());
    return argv.length === 0 ? 2 : 0;
  }
  const command = argv[0];
  if (command === "corpus") {
    const subcommand = argv[1];
    const root = rootOption(argv);
    const paths = positional(argv.slice(2), ["--root"]);
    if (subcommand === "validate") {
      if (paths.length !== 1) fail("corpus validate", "requires exactly one file");
      const binding = digestPath(root, paths[0], "corpus path");
      const corpus = validateCorpus(readJson(path.join(root, binding.path)));
      process.stdout.write(pretty({
        valid: true,
        path: binding.path,
        sha256: binding.sha256,
        id: corpus.id,
        version: corpus.version,
        cases: corpus.cases.length,
      }));
      return 0;
    }
    if (subcommand === "discover") {
      if (paths.length === 0) fail("corpus discover", "requires at least one directory");
      process.stdout.write(pretty(discoverCorpora(root, paths)));
      return 0;
    }
    fail("corpus", "expected validate or discover");
  }
  if (command === "bind-capabilities") {
    const root = rootOption(argv);
    const manifest = bindCapabilityDraft({
      root,
      corpusPath: value(argv, "--corpus", { required: true }),
      adapterPath: value(argv, "--adapter", { required: true }),
      artifactSpecifications: values(argv, "--artifact"),
      draftPath: value(argv, "--draft", { required: true }),
    });
    const output = value(argv, "--output", { required: true });
    writeImmutableJson(output, manifest);
    process.stdout.write(`${manifest.id}\n`);
    return 0;
  }
  if (command === "run") {
    const root = rootOption(argv);
    const receipt = await collectReceipt({
      root,
      corpusPath: value(argv, "--corpus", { required: true }),
      adapterPath: value(argv, "--adapter", { required: true }),
      capabilityPath: value(argv, "--capabilities", { required: true }),
      artifactSpecifications: values(argv, "--artifact"),
      processEntryTime,
    });
    const output = value(argv, "--output", { required: true });
    writeImmutableJson(output, receipt);
    process.stdout.write(`${receipt.status}: ${receipt.id}\n`);
    return receipt.status === "passed" ? 0 : 1;
  }
  if (command === "verify") {
    const root = rootOption(argv);
    const paths = positional(argv.slice(1), ["--root"]);
    if (paths.length !== 1) fail("verify", "requires exactly one receipt");
    const result = verifyReceipt(readJson(path.resolve(paths[0])), {
      root,
      historical: argv.includes("--historical"),
      requireClean: argv.includes("--require-clean"),
    });
    process.stdout.write(pretty({
      valid: result.valid,
      mode: result.mode,
      status: result.receipt.status,
      id: result.receipt.id,
    }));
    return result.receipt.status === "passed" ? 0 : 1;
  }
  if (command === "report") {
    const policyFilename = value(argv, "--policy", { required: true });
    const policy = validateMatrixPolicy(readJson(path.resolve(policyFilename)));
    const filenames = [
      ...values(argv, "--receipt").map((filename) => path.resolve(filename)),
      ...values(argv, "--receipt-dir").flatMap(receiptFilesFromDirectory),
    ];
    const unique = [...new Set(filenames)].sort();
    const report = buildReport(policy, unique.map((filename) =>
      reportReceiptRecord(filename)));
    const jsonOutput = value(argv, "--json");
    const markdownOutput = value(argv, "--markdown");
    if (jsonOutput !== null) writeDerived(jsonOutput, pretty(report));
    if (markdownOutput !== null) writeDerived(markdownOutput, markdownReport(report));
    if (jsonOutput === null && markdownOutput === null) process.stdout.write(pretty(report));
    else process.stdout.write(`${report.status}: ${report.id}\n`);
    return report.status === "passed" ? 0 : 1;
  }
  fail("command", `unknown ${command}\n${usage()}`);
}

if (require.main === module) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = {
  discoverCorpora,
  main,
  reportReceiptRecord,
  receiptFilesFromDirectory,
  usage,
};
