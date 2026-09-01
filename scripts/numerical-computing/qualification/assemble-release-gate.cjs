#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentDigestPath,
  digestPath,
  readJson,
  repositoryIdentity,
  repositoryPath,
} = require("../common.cjs");
const { authenticate } = require("./authenticate-release-gate.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const TEMPLATE = "bench/numerical-computing/qualification/matrix/full-runtime.template.json";
const CORPUS = "bench/numerical-computing/qualification/product.corpus.json";
const PLATFORMS = ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"];

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/assemble-release-gate.cjs \\
  --candidate COMMIT --input DIRECTORY --output DIRECTORY

Rebuilds the canonical policy, 16-row report, supplemental report, and final
release gate from the exact platform/browser producer layout. Missing, duplicate,
foreign, symlinked, dirty, or wrong-candidate evidence is rejected.
`;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const accepted = new Set(["--candidate", "--input", "--output"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!accepted.has(name)) throw new Error(`unknown argument ${name}`);
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    const key = name.slice(2);
    if (result[key] !== undefined) throw new Error(`${name} may appear only once`);
    result[key] = value;
  }
  for (const key of ["candidate", "input", "output"]) {
    if (result[key] === undefined) throw new Error(`--${key} is required`);
  }
  return { help: false, ...result };
}

function runNode(arguments_, label) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(
      `${label} failed (${result.status ?? result.signal})\n${result.stdout}\n${result.stderr}`,
    );
  }
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

function requireRegular(relative, label) {
  const resolved = repositoryPath(root, relative, label);
  let status;
  try {
    status = fs.lstatSync(resolved.absolute);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} is missing: ${resolved.relative}`);
    }
    throw error;
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`${label} must be a non-symlink regular file: ${resolved.relative}`);
  }
  return resolved.relative;
}

function rejectSymlinks(directory) {
  const resolved = repositoryPath(root, directory, "qualification input");
  function visit(filename) {
    const status = fs.lstatSync(filename);
    if (status.isSymbolicLink()) {
      throw new Error(`qualification input refuses symbolic link ${path.relative(root, filename)}`);
    }
    if (status.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) visit(path.join(filename, name));
    } else if (!status.isFile()) {
      throw new Error(`qualification input refuses special file ${path.relative(root, filename)}`);
    }
  }
  visit(resolved.absolute);
  return resolved.relative;
}

function cleanOutput(relative) {
  if (path.isAbsolute(relative) || relative.includes("\0")) {
    throw new Error("--output must be repository-relative");
  }
  const output = repositoryPath(root, relative, "release gate output");
  if (fs.existsSync(output.absolute) && fs.readdirSync(output.absolute).length !== 0) {
    throw new Error(`output directory is not empty: ${output.relative}`);
  }
  fs.mkdirSync(output.absolute, { recursive: true });
  const ignored = spawnSync("git", ["-C", root, "check-ignore", "--quiet", output.relative]);
  if (ignored.status !== 0) throw new Error("--output must be ignored");
  return output.relative;
}

function expectedRows(input) {
  const rows = [];
  for (const platform of PLATFORMS) {
    for (const kind of ["node", "npm", "sea"]) {
      const id = `${platform}-${kind}`;
      const directory = `${input}/platform/${platform}/${id}`;
      rows.push({
        id,
        manifest: requireRegular(`${directory}/capabilities.json`, `${id} manifest`),
        receipt: requireRegular(`${directory}/${kind}.receipt.json`, `${id} receipt`),
      });
    }
  }
  for (const [suffix, receiptName] of [
    ["chromium", "browser-chromium.receipt.json"],
    ["firefox", "browser-firefox.receipt.json"],
    ["webkit", "browser-webkit.receipt.json"],
    ["worker", "worker-chromium.receipt.json"],
  ]) {
    const id = `linux-x64-browser-${suffix}`;
    const directory = `${input}/browser/rows/${id}`;
    rows.push({
      id,
      manifest: requireRegular(`${directory}/capabilities.json`, `${id} manifest`),
      receipt: requireRegular(`${directory}/${receiptName}`, `${id} receipt`),
    });
  }
  if (rows.length !== 16 || new Set(rows.map((row) => row.id)).size !== 16) {
    throw new Error("internal qualification row inventory is not exactly 16 unique rows");
  }
  return rows;
}

function expectedEvidence(input) {
  const supplemental = `${input}/browser/supplemental`;
  return [
    `${supplemental}/native-sanitizers.evidence.json`,
    `${supplemental}/wasm-destructive.evidence.json`,
    `${supplemental}/structural-performance.evidence.json`,
    `${supplemental}/memory-browser-chromium/browser-chromium.memory-evidence.json`,
    `${supplemental}/memory-browser-firefox/browser-firefox.memory-evidence.json`,
    `${supplemental}/memory-browser-webkit/browser-webkit.memory-evidence.json`,
    `${supplemental}/memory-worker-chromium/worker-chromium.memory-evidence.json`,
  ].map((filename) => requireRegular(filename, "supplemental evidence"));
}

function exactInputInventory(input, rows, evidence) {
  const resolved = repositoryPath(root, input, "qualification input inventory");
  const required = new Set([
    ...rows.flatMap((row) => [row.manifest, row.receipt]),
    ...evidence,
  ]);
  const allowedFiles = new Set(required);
  const allowedDirectories = new Set([
    input,
    `${input}/platform`,
    `${input}/browser`,
    `${input}/browser/rows`,
    `${input}/browser/supplemental`,
  ]);
  const browserArtifacts = [];
  for (const row of rows) {
    const directory = path.posix.dirname(row.manifest);
    allowedDirectories.add(path.posix.dirname(directory));
    allowedDirectories.add(directory);
    allowedFiles.add(`${directory}/capability-draft.json`);
    allowedFiles.add(`${directory}/scipy-oracle.json`);
    if (row.id.startsWith("linux-x64-browser-")) {
      allowedFiles.add(`${directory}/browser-executable.json`);
      browserArtifacts.push({ directory: `${directory}/browser-artifact`, receipt: row.receipt });
    }
  }
  for (const [directoryName, stem] of [
    ["memory-browser-chromium", "browser-chromium"],
    ["memory-browser-firefox", "browser-firefox"],
    ["memory-browser-webkit", "browser-webkit"],
    ["memory-worker-chromium", "worker-chromium"],
  ]) {
    const directory = `${input}/browser/supplemental/${directoryName}`;
    allowedDirectories.add(directory);
    for (const filename of [
      "capability-draft.json", "capabilities.json", "browser-executable.json",
      "scipy-oracle.json", `${stem}.receipt.json`, `${stem}.memory-evidence.json`,
    ]) allowedFiles.add(`${directory}/${filename}`);
    browserArtifacts.push({
      directory: `${directory}/browser-artifact`,
      receipt: `${directory}/${stem}.receipt.json`,
    });
  }
  for (const artifact of browserArtifacts) allowedDirectories.add(artifact.directory);
  const folded = new Map();
  const files = [];
  const directories = [];
  function visit(filename) {
    const status = fs.lstatSync(filename);
    const relative = path.relative(root, filename).split(path.sep).join("/");
    if (relative !== relative.normalize("NFC") || relative.includes("\\") ||
        relative.split("/").some((part) => part === "")) {
      throw new Error(`qualification input contains a non-portable path ${relative}`);
    }
    const key = relative.normalize("NFC").toLocaleLowerCase("en-US");
    const previous = folded.get(key);
    if (previous !== undefined && previous !== relative) {
      throw new Error(`qualification input contains case-colliding paths ${previous} and ${relative}`);
    }
    folded.set(key, relative);
    if (status.isDirectory()) {
      directories.push(relative);
      for (const name of fs.readdirSync(filename).sort()) visit(path.join(filename, name));
      return;
    }
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`qualification input contains a non-regular file ${relative}`);
    }
    files.push(relative);
  }
  visit(resolved.absolute);
  for (const artifact of browserArtifacts) {
    const receipt = readJson(path.join(root, artifact.receipt));
    const bindings = receipt.artifacts?.filter((item) => item.name === "sagejs-browser");
    if (bindings?.length !== 1 || bindings[0].path !== artifact.directory) {
      throw new Error(`${artifact.receipt} does not bind its exact browser-artifact directory`);
    }
    const current = {
      name: "sagejs-browser",
      ...digestPath(root, artifact.directory, "generated browser artifact"),
      content_sha256: contentDigestPath(root, artifact.directory, "generated browser artifact"),
    };
    if (canonicalJson(current) !== canonicalJson(bindings[0])) {
      throw new Error(`${artifact.directory} differs from its authenticated receipt binding`);
    }
  }
  for (const filename of files) {
    if (allowedFiles.has(filename)) continue;
    if (browserArtifacts.some((artifact) => filename.startsWith(`${artifact.directory}/`))) continue;
    throw new Error(`qualification input contains foreign file ${filename}`);
  }
  for (const directory of directories) {
    if (allowedDirectories.has(directory)) continue;
    if (browserArtifacts.some((artifact) => directory.startsWith(`${artifact.directory}/`))) continue;
    throw new Error(`qualification input contains foreign directory ${directory}`);
  }
  for (const filename of required) {
    if (!files.includes(filename)) throw new Error(`qualification input lacks ${filename}`);
  }
  return files.sort();
}

function run(options) {
  const before = repositoryIdentity(root);
  if (!before.clean || before.commit !== options.candidate) {
    throw new Error(
      `release-gate aggregation requires clean candidate ${options.candidate}; ` +
        `got ${before.commit}${before.clean ? "" : " (dirty)"}`,
    );
  }
  const input = rejectSymlinks(options.input);
  const rows = expectedRows(input);
  const evidence = expectedEvidence(input);
  exactInputInventory(input, rows, evidence);
  const output = cleanOutput(options.output);
  const policy = `${output}/full-runtime.policy.json`;
  const matrix = `${output}/full-runtime.report.json`;
  const matrixMarkdown = `${output}/full-runtime.report.md`;
  const supplemental = `${output}/supplemental.report.json`;
  const gate = `${output}/release-gate.json`;

  runNode([
    "scripts/numerical-computing/qualification/render-matrix.cjs",
    "--template", TEMPLATE,
    "--corpus", CORPUS,
    ...rows.flatMap((row) => ["--manifest", `${row.id}=${row.manifest}`]),
    "--output", policy,
  ], "render exact full-runtime policy");
  runNode([
    "scripts/numerical-computing/qualify.cjs", "report",
    "--policy", policy,
    ...rows.flatMap((row) => ["--receipt", row.receipt]),
    "--json", matrix,
    "--markdown", matrixMarkdown,
  ], "render exact full-runtime report");
  runNode([
    "scripts/numerical-computing/qualification/run-release-gate.cjs",
    "--candidate", options.candidate,
    "--matrix-report", matrix,
    "--matrix-policy", policy,
    ...rows.flatMap((row) => ["--manifest", `${row.id}=${row.manifest}`]),
    ...rows.flatMap((row) => ["--receipt", row.receipt]),
    ...evidence.flatMap((filename) => ["--evidence", filename]),
    "--supplemental-output", supplemental,
    "--output", gate,
  ], "assemble numerical release gate");

  const document = JSON.parse(fs.readFileSync(path.join(root, gate), "utf8"));
  authenticate(document, options.candidate);
  const after = repositoryIdentity(root);
  if (!after.clean || after.commit !== before.commit || after.tree !== before.tree ||
      after.status_sha256 !== before.status_sha256) {
    throw new Error("candidate checkout changed while release gate was assembled");
  }
  return { output, gate };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = run(options);
  process.stdout.write(`passed: exact numerical release gate -> ${result.gate}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  expectedEvidence,
  expectedRows,
  exactInputInventory,
  main,
  parseArguments,
  rejectSymlinks,
  run,
  usage,
};
